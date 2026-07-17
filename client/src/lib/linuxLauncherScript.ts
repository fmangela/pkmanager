import type { LaunchLocalResult } from '../api/saveFile';

const escapeBashSingle = (value: string) => value.replace(/'/g, "'\\''");

export const buildLinuxScript = (pkg: LaunchLocalResult, backendBase: string, fallbackName?: string) => {
  const escapedSavePath = escapeBashSingle(pkg.emuSavePath || '');
  const escapedExe = escapeBashSingle(pkg.exePath);
  const escapedRom = escapeBashSingle(pkg.romPath || '');
  const escapedSaveDir = escapeBashSingle(pkg.saveDir);
  const titleIdLow = escapeBashSingle(pkg.titleIdLow || '');
  const escapedBackend = escapeBashSingle(backendBase);
  const escapedSaveFileId = escapeBashSingle(pkg.saveFileId);
  const escapedSyncToken = escapeBashSingle(pkg.syncToken);
  const baseName = (pkg.fileName || fallbackName || 'save').replace(/\.[^.]+$/, '');
  const gameVersion = pkg.gameVersion;

  const scriptContent = `#!/usr/bin/env bash
# pkmanager - Local Azahar/DeSmuME launcher (Linux / Steam Deck Desktop Mode)
set -u

LOG_PREFIX="[pkmanager]"

info() { printf '%s %s\\n' "$LOG_PREFIX" "$*"; }
warn() { printf '%s \\033[33m[WARN] %s\\033[0m\\n' "$LOG_PREFIX" "$*"; }
err()  { printf '%s \\033[31m[ERROR] %s\\033[0m\\n' "$LOG_PREFIX" "$*"; }
ok()   { printf '%s \\033[32m%s\\033[0m\\n' "$LOG_PREFIX" "$*"; }

pause_exit() {
    echo
    read -r -p "Press Enter to close this window..." _
    exit "\${1:-0}"
}

die() {
    err "$*"
    pause_exit 1
}

require_cmd() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        err "Missing required command: $cmd"
        exit 1
    fi
}

for c in base64 od sha256sum mkdir cp rm find dirname basename stat; do
    require_cmd "$c"
done

# --- Path helpers -----------------------------------------------------------

resolve_azahar_title_id_low() {
    local title_id_low="$1"
    local rom_path="$2"
    if [ -n "$title_id_low" ]; then
        echo "$title_id_low" | tr 'a-z' 'A-Z'
        return 0
    fi
    if [ -n "$rom_path" ]; then
        local upper
        upper=$(printf '%s' "$rom_path" | tr 'a-z' 'A-Z')
        local match
        match=$(printf '%s' "$upper" | sed -n 's|.*TITLE[\\/]00040000[\\/]([0-9A-F]\\{8\\})[\\/]CONTENT.*|\\1|p')
        if [ -n "$match" ]; then
            echo "$match"
            return 0
        fi
    fi
    echo ""
}

resolve_azahar_sdmc_path() {
    local data_dir="$1"
    local trimmed="\${data_dir%/}"
    trimmed="\${trimmed%/}"
    local lower
    lower=$(printf '%s' "$trimmed" | tr 'A-Z' 'a-z')
    if [[ "$lower" == */sdmc ]]; then
        echo "$trimmed"
    else
        echo "\${trimmed}/sdmc"
    fi
}

read_be_u32() {
    local file="$1"
    local off="$2"
    od -An -tu4 -j "$off" -N 4 --endian=big "$file" 2>/dev/null | awk '{print $1}'
}

read_be_u16() {
    local file="$1"
    local off="$2"
    od -An -tu2 -j "$off" -N 2 --endian=big "$file" 2>/dev/null | awk '{print $1}'
}

get_tmd_signature_size() {
    local sig_type="$1"
    case "$sig_type" in
        65536|65539)  echo 512 ;;
        65537|65540)  echo 256 ;;
        65538|65541)  echo 60  ;;
        *) err "Unknown TMD signature type: $sig_type"; return 1 ;;
    esac
}

resolve_azahar_content_path() {
    local data_dir="$1"
    local title_id_low="$2"
    local fallback_path="$3"

    local resolved_tid
    resolved_tid=$(resolve_azahar_title_id_low "$title_id_low" "$fallback_path")
    if [ -z "$resolved_tid" ]; then
        if [ -n "$fallback_path" ] && [ -e "$fallback_path" ]; then
            echo "$fallback_path"
            return 0
        fi
        err "Missing title id for Azahar content path resolution."
        return 1
    fi

    local sdmc
    sdmc=$(resolve_azahar_sdmc_path "$data_dir")
    local content_dir="\${sdmc}/Nintendo 3DS/00000000000000000000000000000000/00000000000000000000000000000000/title/00040000/\${resolved_tid}/content"

    if [ ! -d "$content_dir" ]; then
        if [ -n "$fallback_path" ] && [ -e "$fallback_path" ]; then
            warn "Azahar content directory is not accessible, using backend fallback path."
            echo "$fallback_path"
            return 0
        fi
        err "Azahar content directory is not accessible: $content_dir"
        return 1
    fi

    local tmd_file
    tmd_file=$(find "$content_dir" -maxdepth 1 -type f -name '*.tmd' 2>/dev/null | sort | head -n 1)
    if [ -z "$tmd_file" ]; then
        if [ -n "$fallback_path" ] && [ -e "$fallback_path" ]; then
            warn "No TMD file found, using backend fallback path."
            echo "$fallback_path"
            return 0
        fi
        err "No TMD file was found in $content_dir"
        return 1
    fi

    local file_size
    file_size=$(stat -c '%s' "$tmd_file" 2>/dev/null || stat -f '%z' "$tmd_file" 2>/dev/null)
    if [ -z "$file_size" ] || [ "$file_size" -lt 4 ]; then
        if [ -n "$fallback_path" ] && [ -e "$fallback_path" ]; then
            warn "TMD file is too small, using backend fallback path: $tmd_file"
            echo "$fallback_path"
            return 0
        fi
        err "TMD file is too small: $tmd_file"
        return 1
    fi

    local sig_type
    sig_type=$(read_be_u32 "$tmd_file" 0)
    if [ -z "$sig_type" ]; then
        err "Failed to read TMD signature type."
        return 1
    fi

    local sig_size
    sig_size=$(get_tmd_signature_size "$sig_type") || {
        if [ -n "$fallback_path" ] && [ -e "$fallback_path" ]; then
            warn "Unknown TMD signature, using backend fallback path."
            echo "$fallback_path"
            return 0
        fi
        return 1
    }

    local body_start
    body_start=$(( ((sig_size + 4 + 63) / 64) * 64 ))
    local chunk_base=$((body_start + 0x9C4))

    if [ "$file_size" -lt $((chunk_base + 4)) ]; then
        if [ -n "$fallback_path" ] && [ -e "$fallback_path" ]; then
            warn "TMD file is truncated, using backend fallback path: $tmd_file"
            echo "$fallback_path"
            return 0
        fi
        err "TMD file is truncated: $tmd_file"
        return 1
    fi

    local content_count
    content_count=$(read_be_u16 "$tmd_file" $((body_start + 0x9E)))
    if [ -z "$content_count" ] || [ "$content_count" -lt 1 ]; then
        err "TMD does not contain launchable content: $tmd_file"
        return 1
    fi

    local final_content_dir="$content_dir"
    if [ "$content_count" -gt 1 ] && [ "$file_size" -ge $((chunk_base + 0x38)) ]; then
        local second_content_type
        second_content_type=$(read_be_u16 "$tmd_file" $((chunk_base + 0x30 + 6)))
        if [ -n "$second_content_type" ]; then
            if [ $((second_content_type & 0x4000)) -ne 0 ]; then
                final_content_dir="\${content_dir}/00000000"
            fi
        fi
    fi

    local content_id
    content_id=$(read_be_u32 "$tmd_file" "$chunk_base")
    if [ -z "$content_id" ]; then
        err "Failed to read TMD content id."
        return 1
    fi

    printf '%s/%08x.app\\n' "$final_content_dir" "$content_id"
}

get_desmume_rom_search_terms() {
    local game_version="$1"
    case "$game_version" in
        10) printf '%s\\n%s\\n' "钻石" "diamond" ;; # i18n-ignore: ROM filename search alias
        11) printf '%s\\n%s\\n' "珍珠" "pearl" ;; # i18n-ignore: ROM filename search alias
        12) printf '%s\\n%s\\n' "白金" "platinum" ;; # i18n-ignore: ROM filename search alias
        7)  printf '%s\\n%s\\n' "心金" "heartgold" ;; # i18n-ignore: ROM filename search alias
        8)  printf '%s\\n%s\\n' "魂银" "soulsilver" ;; # i18n-ignore: ROM filename search alias
        20) printf '%s\\n%s\\n' "白" "white" ;; # i18n-ignore: ROM filename search alias
        21) printf '%s\\n%s\\n' "黑" "black" ;; # i18n-ignore: ROM filename search alias
        22) printf '%s\\n%s\\n' "白2" "white2" ;; # i18n-ignore: ROM filename search alias
        23) printf '%s\\n%s\\n' "黑2" "black2" ;; # i18n-ignore: ROM filename search alias
        *)  ;;
    esac
}

ci_contains() {
    local haystack
    haystack=$(printf '%s' "$1" | tr 'A-Z' 'a-z')
    local needle
    needle=$(printf '%s' "$2" | tr 'A-Z' 'a-z')
    [ -z "$needle" ] && return 1
    case "$haystack" in
        *"$needle"*) return 0 ;;
        *) return 1 ;;
    esac
}

resolve_desmume_rom_path() {
    local fallback_path="$1"
    local save_dir="$2"
    local exe_path="$3"
    local game_version="$4"

    if [ -n "$fallback_path" ] && [ -e "$fallback_path" ]; then
        echo "$fallback_path"
        return 0
    fi

    local terms
    terms=$(get_desmume_rom_search_terms "$game_version")
    if [ -z "$terms" ]; then
        if [ -n "$fallback_path" ]; then
            echo "$fallback_path"
            return 0
        fi
        err "Unable to resolve a local NDS ROM path for gameVersion=$game_version"
        return 1
    fi

    local roots=""
    local exe_dir save_parent fallback_parent
    exe_dir=$(dirname "$exe_path" 2>/dev/null)
    save_parent=$(dirname "$save_dir" 2>/dev/null)
    fallback_parent=$(dirname "$fallback_path" 2>/dev/null)

    for r in "$exe_dir" "$save_dir" "$save_parent" "$fallback_parent"; do
        if [ -n "$r" ] && [ -d "$r" ]; then
            case ":$roots:" in
                *":$r:"*) ;;
                *) roots="\${roots:+\$roots:}\$r" ;;
            esac
        fi
    done

    local IFS=':'
    for root in $roots; do
        [ -z "$root" ] && continue
        local found=""
        while IFS= read -r f; do
            [ -z "$f" ] && continue
            local base
            base=$(basename "$f" .nds)
            local term
            while IFS= read -r term; do
                [ -z "$term" ] && continue
                if ci_contains "$base" "$term"; then
                    found="$f"
                    break
                fi
            done <<EOF
$terms
EOF
            [ -n "$found" ] && break
        done < <(find "$root" -maxdepth 5 -type f -iname '*.nds' 2>/dev/null | sort)

        if [ -n "$found" ]; then
            ok "Resolved local DeSmuME ROM: $found"
            echo "$found"
            return 0
        fi
    done

    if [ -n "$fallback_path" ]; then
        echo "$fallback_path"
        return 0
    fi
    err "Unable to resolve a local NDS ROM path for gameVersion=$game_version"
    return 1
}

sha256_file_hex() {
    local file="$1"
    sha256sum "$file" 2>/dev/null | awk '{print $1}'
}

# --- Launch package (embedded) ----------------------------------------------

SAVE_DATA_BASE64='${pkg.saveDataBase64}'
EMU_SAVE_PATH='${escapedSavePath}'
EXE_PATH='${escapedExe}'
ROM_PATH='${escapedRom}'
SAVE_DIR='${escapedSaveDir}'
TYPE='${pkg.type}'
TITLE_ID_LOW='${titleIdLow}'
BACKEND_BASE='${escapedBackend}'
SAVE_FILE_ID='${escapedSaveFileId}'
SYNC_TOKEN='${escapedSyncToken}'
GAME_VERSION=${gameVersion}

resolved_title_id_low=$(resolve_azahar_title_id_low "$TITLE_ID_LOW" "$ROM_PATH")

if [ "$TYPE" = "azahar" ]; then
    rom_path=$(resolve_azahar_content_path "$SAVE_DIR" "$resolved_title_id_low" "$ROM_PATH") || die "Failed to resolve Azahar content path."
elif [ "$TYPE" = "desmume" ]; then
    rom_path=$(resolve_desmume_rom_path "$ROM_PATH" "$SAVE_DIR" "$EXE_PATH" "$GAME_VERSION") || die "Failed to resolve DeSmuME ROM path."
else
    err "Unknown launcher type: $TYPE"
    pause_exit 1
fi

if [ "$TYPE" = "desmume" ]; then
    rom_file_name=$(basename "$rom_path")
    rom_file_name="\${rom_file_name%.*}"
    emu_save_path="\${SAVE_DIR}/\${rom_file_name}.dsv"
else
    emu_save_path="$EMU_SAVE_PATH"
fi

ok "Launch package received"
info "  Type: $TYPE Gen${pkg.generation}"
if [ -n "$resolved_title_id_low" ]; then
    info "  TID : $resolved_title_id_low"
fi
info "  EXE : $EXE_PATH"
info "  ROM : $rom_path"
info "  SAVE: $emu_save_path"
if [ "$TYPE" = "azahar" ] && [ -n "$ROM_PATH" ] && [ "$ROM_PATH" != "$rom_path" ]; then
    warn "  NOTE: Resolved Azahar content from TMD instead of backend fallback."
fi
if [ -n "$SAVE_FILE_ID" ]; then
    info "  SAVE ID : $SAVE_FILE_ID"
fi

rom_dir=$(dirname "$rom_path")
if [ -n "$rom_dir" ] && [ ! -d "$rom_dir" ]; then
    err "ROM directory is not accessible: $rom_dir"
    pause_exit 1
fi

save_parent=$(dirname "$emu_save_path")
if [ ! -d "$save_parent" ]; then
    if ! mkdir -p "$save_parent" 2>/dev/null; then
        err "Failed to create save directory: $save_parent"
        pause_exit 1
    fi
fi

if [ "$TYPE" = "azahar" ]; then
    backup_dir="\${SAVE_DIR}/pkmanager_backup/\${resolved_title_id_low}"
    backup_file="\${backup_dir}/main.bak"
else
    backup_dir="\${SAVE_DIR}/pkmanager_backup"
    backup_file="\${backup_dir}/save.dsv.bak"
fi

had_existing_save=0
if [ -f "$emu_save_path" ]; then
    had_existing_save=1
fi

if ! mkdir -p "$backup_dir" 2>/dev/null; then
    err "Failed to create backup directory: $backup_dir"
    pause_exit 1
fi

backup_ready=0
if [ "$had_existing_save" = "1" ]; then
    if cp "$emu_save_path" "$backup_file" 2>/dev/null; then
        backup_ready=1
        ok "Existing save backed up"
    else
        warn "Backup failed, continuing anyway"
    fi
else
    info "No existing save found"
fi

save_tmp=$(mktemp 2>/dev/null) || die "Failed to create temp file."
trap 'rm -f "$save_tmp" 2>/dev/null' EXIT

printf '%s' "$SAVE_DATA_BASE64" | tr -d ' \\r\\n\\t' | base64 -d > "$save_tmp" 2>/dev/null || {
    err "Failed to decode save data (base64)."
    pause_exit 1
}

expected_hash=$(sha256_file_hex "$save_tmp")
save_bytes_size=$(stat -c '%s' "$save_tmp" 2>/dev/null || stat -f '%z' "$save_tmp")
info "Save bytes: $save_bytes_size"

if ! cp "$save_tmp" "$emu_save_path" 2>/dev/null; then
    err "Failed to write save: $emu_save_path"
    pause_exit 1
fi

actual_hash=$(sha256_file_hex "$emu_save_path")
actual_size=$(stat -c '%s' "$emu_save_path" 2>/dev/null || stat -f '%z' "$emu_save_path")

if [ "$actual_size" != "$save_bytes_size" ] || [ "$actual_hash" != "$expected_hash" ]; then
    err "Save verification failed after write."
    info "  Expected: $save_bytes_size bytes, SHA256=$expected_hash"
    info "  Actual  : $actual_size bytes, SHA256=$actual_hash"
    pause_exit 1
fi
ok "Save verify: OK ($actual_hash)"
ok "Save injected"

if [ ! -x "$EXE_PATH" ] && [ ! -f "$EXE_PATH" ]; then
    err "Emulator executable was not found: $EXE_PATH"
    pause_exit 1
fi

launch_args=()
if [ -n "$rom_path" ]; then
    launch_args+=("$rom_path")
fi

info "Launching: $EXE_PATH \${launch_args[*]}"
"$EXE_PATH" "\${launch_args[@]}"
emulator_exit=$?
info "Emulator exited with code $emulator_exit"

if [ -z "$SAVE_FILE_ID" ] || [ -z "$SYNC_TOKEN" ]; then
    warn "Missing sync token, skipping automatic sync."
elif [ ! -f "$emu_save_path" ]; then
    warn "Save file was not found after emulator exit, skipping sync: $emu_save_path"
else
    sync_url="\${BACKEND_BASE}/api/Emulator/sync-save/\${SAVE_FILE_ID}?token=$(printf '%s' "$SYNC_TOKEN" | sed 's/ /%20/g; s/!/%21/g; s/"/%22/g; s/#/%23/g; s/\\$/%24/g; s/&/%26/g; s/'\\''/%27/g; s/(/%28/g; s/)/%29/g; s/\\*/%2A/g; s/+/%2B/g; s/,/%2C/g; s/:/%3A/g; s/;/%3B/g; s/=/%3D/g; s|/|%2F|g; s/?/%3F/g; s/@/%40/g; s/\\[/%5B/g; s/]/%5D/g')"
    sync_size=$(stat -c '%s' "$emu_save_path" 2>/dev/null || stat -f '%z' "$emu_save_path")
    info "Syncing save back to backend..."
    info "Sync bytes: $sync_size"
    info "POST $sync_url"

    curl_opts=(-sS --max-time 60)
    if [[ "$BACKEND_BASE" =~ localhost ]] || [[ "$BACKEND_BASE" =~ 127\\.0\\.0\\.1 ]]; then
        curl_opts+=(-k)
    fi

    sync_response=""
    sync_response=$(curl "\${curl_opts[@]}" -X POST \\
        -H 'Content-Type: application/octet-stream' \\
        --data-binary "@$emu_save_path" \\
        "$sync_url") || {
        warn "Automatic sync failed (curl error)"
        pause_exit 0
    }

    sync_code=$(printf '%s' "$sync_response" | sed -n 's|.*"code"[[:space:]]*:[[:space:]]*\\([0-9]\\+\\).*|\\1|p' | head -n 1)
    if [ "$sync_code" = "0" ]; then
        ok "Save synced successfully."
        if [ "$backup_ready" = "1" ] && [ -f "$backup_file" ]; then
            if cp "$backup_file" "$emu_save_path" 2>/dev/null; then
                ok "Restored previous local save."
            else
                warn "Failed to restore previous local save."
            fi
        elif [ "$TYPE" = "desmume" ] && [ "$had_existing_save" = "0" ] && [ -f "$emu_save_path" ]; then
            if rm -f "$emu_save_path" 2>/dev/null; then
                ok "Removed injected temporary save (first launch)."
            else
                warn "Failed to clean injected temporary save."
            fi
        else
            warn "No previous local save to restore."
        fi
    else
        sync_message=$(printf '%s' "$sync_response" | sed -n 's|.*"message"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*|\\1|p' | head -n 1)
        warn "Backend sync returned non-zero code: $sync_message"
    fi
fi

pause_exit 0
`;

  return { fileName: `pkmanager_launch_${baseName}.sh`, scriptContent };
};
