#!/usr/bin/env bash
# pkmanager local launcher (Linux / Steam Deck Desktop Mode)
# Mirrors pkmanager-launcher.ps1 — handles pkmanager:// protocol URLs and standalone runs.

set -u

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_PREFIX="[pkmanager]"

color_red()    { printf '\033[31m%s\033[0m\n' "$*"; }
color_yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
color_green()  { printf '\033[32m%s\033[0m\n' "$*"; }

info() { printf '%s %s\n' "$LOG_PREFIX" "$*"; }
warn() { printf '%s \033[33m[WARN] %s\033[0m\n' "$LOG_PREFIX" "$*"; }
err()  { printf '%s \033[31m[ERROR] %s\033[0m\n' "$LOG_PREFIX" "$*"; }
ok()   { printf '%s \033[32m%s\033[0m\n' "$LOG_PREFIX" "$*"; }

require_cmd() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        err "Missing required command: $cmd"
        exit 1
    fi
}

for c in curl base64 od sha256sum mkdir cp rm find dirname basename; do
    require_cmd "$c"
done

pause_exit() {
    echo
    read -r -p "Press Enter to close this window..." _
    exit "${1:-0}"
}

die() {
    err "$*"
    pause_exit 1
}

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
        # Match title/00040000/<8 hex>/content (case-insensitive)
        local match
        match=$(printf '%s' "$upper" | sed -n 's|.*TITLE[\\/]00040000[\\/]([0-9A-F]\{8\})[\\/]CONTENT.*|\1|p')
        if [ -n "$match" ]; then
            echo "$match"
            return 0
        fi
    fi
    echo ""
}

resolve_azahar_sdmc_path() {
    local data_dir="$1"
    local trimmed="${data_dir%/}"
    trimmed="${trimmed%/}"
    local lower
    lower=$(printf '%s' "$trimmed" | tr 'A-Z' 'a-z')
    if [ "$lower" = "${trimmed}/sdmc" ] || [ "$lower" = "${trimmed}sdmc" ] || [[ "$lower" == */sdmc ]]; then
        echo "$trimmed"
    else
        echo "${trimmed}/sdmc"
    fi
}

# Read big-endian uint32 at offset from a binary file.
# Args: file_path offset
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
        65536|65539)  echo 512 ;;   # 0x10000 / 0x10003
        65537|65540)  echo 256 ;;   # 0x10001 / 0x10004
        65538|65541)  echo 60  ;;   # 0x10002 / 0x10005
        *)
            err "Unknown TMD signature type: $sig_type"
            return 1
            ;;
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
        err "Missing title id for Azahar content path resolution." >&2
        info "  titleIdLow: ${title_id_low:-<empty>}" >&2
        info "  romPath   : ${fallback_path:-<empty>}" >&2
        return 1
    fi

    # Candidate data directories to try. The user-configured data_dir takes
    # priority; if that doesn't contain the title, fall back to the Flatpak
    # sandbox path (org.azahar_emu.Azahar) before giving up.
    local home_dir="${HOME:-$(eval echo ~ 2>/dev/null)}"
    local flatpak_base="$home_dir/.var/app/org.azahar_emu.Azahar/data/azahar-emu"

    local candidates=()
    if [ -n "$data_dir" ]; then
        candidates+=("$data_dir")
    fi
    if [ -n "$flatpak_base" ] && [ "$flatpak_base" != "$data_dir" ]; then
        candidates+=("$flatpak_base")
    fi

    # Title id directory name case variants. Azahar on Linux writes LOWERCASE
    # title ids (e.g. "001b5100") to the filesystem. Although the 3DS itself
    # stores title ids as uppercase hex, Linux filesystems are case-sensitive,
    # and Azahar's Flatpak build normalizes to lowercase. Try lowercase first
    # to match Azahar's real install location; fall back to uppercase only if
    # the lowercase dir does not exist.
    local tid_upper tid_lower
    tid_upper=$(printf '%s' "$resolved_tid" | tr 'a-z' 'A-Z')
    tid_lower=$(printf '%s' "$resolved_tid" | tr 'A-Z' 'a-z')
    local tid_variants=("$tid_lower")
    if [ "$tid_upper" != "$tid_lower" ]; then
        tid_variants+=("$tid_upper")
    fi

    local content_dir=""
    local tried_paths=""
    local matched_candidate=""
    for cand in "${candidates[@]}"; do
        local sdmc
        sdmc=$(resolve_azahar_sdmc_path "$cand")
        for tid in "${tid_variants[@]}"; do
            local dir="$sdmc/Nintendo 3DS/00000000000000000000000000000000/00000000000000000000000000000000/title/00040000/${tid}/content"
            tried_paths="${tried_paths}  $dir"$'\n'
            if [ -d "$dir" ]; then
                content_dir="$dir"
                matched_candidate="$cand"
                break
            fi
        done
        if [ -n "$content_dir" ]; then
            break
        fi
    done

    if [ -z "$content_dir" ]; then
        if [ -n "$fallback_path" ] && [ -e "$fallback_path" ]; then
            warn "Azahar content directory is not accessible, using backend fallback path." >&2
            echo "$fallback_path"
            return 0
        fi
        err "Azahar content directory was not found." >&2
        info "  Title id low: $resolved_tid" >&2
        info "  Tried content directories:" >&2
        printf '%s' "$tried_paths" | sed 's/^/    /' >&2
        info "  Backend fallback: ${fallback_path:-<empty>}" >&2
        info "  Hint: Configure azahar.data_dir in Settings, or install Azahar (Flatpak: org.azahar_emu.Azahar)." >&2
        return 1
    fi

    if [ "$matched_candidate" = "$flatpak_base" ] && [ "$matched_candidate" != "$data_dir" ]; then
        warn "Azahar data_dir resolved to Flatpak sandbox: $flatpak_base" >&2
    fi

    local tmd_file
    tmd_file=$(find "$content_dir" -maxdepth 1 -type f -name '*.tmd' 2>/dev/null | sort | head -n 1)
    if [ -z "$tmd_file" ]; then
        if [ -n "$fallback_path" ] && [ -e "$fallback_path" ]; then
            warn "No TMD file found, using backend fallback path." >&2
            echo "$fallback_path"
            return 0
        fi
        err "No TMD file was found in $content_dir" >&2
        info "  Content dir: $content_dir" >&2
        info "  Hint: The game may not be fully installed in Azahar. Reinstall via CIA or eShop title." >&2
        return 1
    fi

    local file_size
    file_size=$(stat -c '%s' "$tmd_file" 2>/dev/null || stat -f '%z' "$tmd_file" 2>/dev/null)
    if [ -z "$file_size" ] || [ "$file_size" -lt 4 ]; then
        if [ -n "$fallback_path" ] && [ -e "$fallback_path" ]; then
            warn "TMD file is too small, using backend fallback path: $tmd_file" >&2
            echo "$fallback_path"
            return 0
        fi
        err "TMD file is too small: $tmd_file" >&2
        return 1
    fi

    local sig_type
    sig_type=$(read_be_u32 "$tmd_file" 0)
    if [ -z "$sig_type" ]; then
        err "Failed to read TMD signature type." >&2
        info "  TMD file: $tmd_file" >&2
        return 1
    fi

    local sig_size
    sig_size=$(get_tmd_signature_size "$sig_type") || {
        if [ -n "$fallback_path" ] && [ -e "$fallback_path" ]; then
            warn "Unknown TMD signature (type=$sig_type), using backend fallback path." >&2
            echo "$fallback_path"
            return 0
        fi
        err "Unknown TMD signature type: $sig_type" >&2
        info "  TMD file: $tmd_file" >&2
        return 1
    }

    # bodyStart = ceil((sigSize + 4) / 64) * 64
    local body_start
    body_start=$(( ((sig_size + 4 + 63) / 64) * 64 ))
    local chunk_base=$((body_start + 0x9C4))

    if [ "$file_size" -lt $((chunk_base + 4)) ]; then
        if [ -n "$fallback_path" ] && [ -e "$fallback_path" ]; then
            warn "TMD file is truncated, using backend fallback path: $tmd_file" >&2
            echo "$fallback_path"
            return 0
        fi
        err "TMD file is truncated: $tmd_file" >&2
        info "  File size: $file_size bytes (need at least $((chunk_base + 4)) bytes)" >&2
        return 1
    fi

    local content_count
    content_count=$(read_be_u16 "$tmd_file" $((body_start + 0x9E)))
    if [ -z "$content_count" ] || [ "$content_count" -lt 1 ]; then
        err "TMD does not contain launchable content: $tmd_file" >&2
        info "  Content count: ${content_count:-<empty>}" >&2
        return 1
    fi

    local final_content_dir="$content_dir"
    if [ "$content_count" -gt 1 ] && [ "$file_size" -ge $((chunk_base + 0x38)) ]; then
        local second_content_type
        second_content_type=$(read_be_u16 "$tmd_file" $((chunk_base + 0x30 + 6)))
        if [ -n "$second_content_type" ]; then
            # Check if 0x4000 bit is set
            if [ $((second_content_type & 0x4000)) -ne 0 ]; then
                final_content_dir="${content_dir}/00000000"
            fi
        fi
    fi

    local content_id
    content_id=$(read_be_u32 "$tmd_file" "$chunk_base")
    if [ -z "$content_id" ]; then
        err "Failed to read TMD content id." >&2
        info "  TMD file: $tmd_file" >&2
        return 1
    fi

    # Format as 8-digit lowercase hex
    printf '%s/%08x.app\n' "$final_content_dir" "$content_id"
}

# Resolve the Azahar save file path (data/00000001/main) for a given title id.
# The backend constructs this path server-side using GetTitleIdLow(gameVersion)
# which returns UPPERCASE hex, but on Linux Azahar writes lowercase title id
# directories (the filesystem is case-sensitive). Without this resolver, the
# launcher would inject the save into a non-existent uppercase directory and
# Azahar would silently fall back to loading the user's existing local save
# from the lowercase directory, defeating the entire save-injection flow.
#
# Args:
#   $1 data_dir     — user-configured Azahar data dir (or empty for Flatpak fallback)
#   $2 title_id_low — title id low (any case) from backend
#   $3 fallback     — backend-provided emuSavePath (used as last-resort fallback)
#
# Prints the resolved save path on stdout, diagnostics on stderr.
resolve_azahar_save_path() {
    local data_dir="$1"
    local title_id_low="$2"
    local fallback="$3"

    local resolved_tid
    resolved_tid=$(resolve_azahar_title_id_low "$title_id_low" "")
    if [ -z "$resolved_tid" ]; then
        if [ -n "$fallback" ]; then
            echo "$fallback"
            return 0
        fi
        err "Missing title id for Azahar save path resolution." >&2
        return 1
    fi

    local home_dir="${HOME:-$(eval echo ~ 2>/dev/null)}"
    local flatpak_base="$home_dir/.var/app/org.azahar_emu.Azahar/data/azahar-emu"

    local candidates=()
    if [ -n "$data_dir" ]; then
        candidates+=("$data_dir")
    fi
    if [ -n "$flatpak_base" ] && [ "$flatpak_base" != "$data_dir" ]; then
        candidates+=("$flatpak_base")
    fi

    local tid_upper tid_lower
    tid_upper=$(printf '%s' "$resolved_tid" | tr 'a-z' 'A-Z')
    tid_lower=$(printf '%s' "$resolved_tid" | tr 'A-Z' 'a-z')
    # Lowercase first (matches Azahar's Linux default); see resolve_azahar_content_path
    # for the rationale on case ordering.
    local tid_variants=("$tid_lower")
    if [ "$tid_upper" != "$tid_lower" ]; then
        tid_variants+=("$tid_upper")
    fi

    local save_dir_found=""
    local tried_paths=""
    for cand in "${candidates[@]}"; do
        local sdmc
        sdmc=$(resolve_azahar_sdmc_path "$cand")
        for tid in "${tid_variants[@]}"; do
            local dir="$sdmc/Nintendo 3DS/00000000000000000000000000000000/00000000000000000000000000000000/title/00040000/${tid}/data/00000001"
            tried_paths="${tried_paths}  $dir"$'\n'
            if [ -d "$dir" ]; then
                save_dir_found="$dir"
                break
            fi
        done
        if [ -n "$save_dir_found" ]; then
            break
        fi
    done

    if [ -z "$save_dir_found" ]; then
        # No existing save dir for either case variant. Use the lowercase variant
        # of the first candidate (matches Azahar's default on Linux), so that
        # injection creates the directory under the same case Azahar expects.
        if [ -n "$fallback" ]; then
            warn "No existing Azahar save dir found; using backend fallback path." >&2
            info "  Backend fallback: $fallback" >&2
            echo "$fallback"
            return 0
        fi
        # Construct path using lowercase tid on first candidate's sdmc
        local first_sdmc
        if [ -n "${candidates[0]:-}" ]; then
            first_sdmc=$(resolve_azahar_sdmc_path "${candidates[0]}")
        else
            first_sdmc=$(resolve_azahar_sdmc_path "$flatpak_base")
        fi
        local constructed="$first_sdmc/Nintendo 3DS/00000000000000000000000000000000/00000000000000000000000000000000/title/00040000/${tid_lower}/data/00000001/main"
        warn "No existing Azahar save dir found; constructed new path (lowercase)." >&2
        info "  Constructed: $constructed" >&2
        echo "$constructed"
        return 0
    fi

    printf '%s/main\n' "$save_dir_found"
}

get_desmume_rom_search_terms() {
    local game_version="$1"
    case "$game_version" in
        10) printf '%s\n%s\n' "钻石" "diamond" ;;
        11) printf '%s\n%s\n' "珍珠" "pearl" ;;
        12) printf '%s\n%s\n' "白金" "platinum" ;;
        7)  printf '%s\n%s\n' "心金" "heartgold" ;;
        8)  printf '%s\n%s\n' "魂银" "soulsilver" ;;
        20) printf '%s\n%s\n' "白" "white" ;;
        21) printf '%s\n%s\n' "黑" "black" ;;
        22) printf '%s\n%s\n' "白2" "white2" ;;
        23) printf '%s\n%s\n' "黑2" "black2" ;;
        *)  ;;
    esac
}

# Case-insensitive substring match. Returns 0 if $1 contains $2 (case-insensitive).
ci_contains() {
    local haystack=$(printf '%s' "$1" | tr 'A-Z' 'a-z')
    local needle=$(printf '%s' "$2" | tr 'A-Z' 'a-z')
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
        err "Unable to resolve a local NDS ROM path for gameVersion=$game_version" >&2
        return 1
    fi

    # Build search roots (unique, existing only)
    local roots=""
    local exe_dir save_parent fallback_parent
    exe_dir=$(dirname "$exe_path" 2>/dev/null)
    save_parent=$(dirname "$save_dir" 2>/dev/null)
    fallback_parent=$(dirname "$fallback_path" 2>/dev/null)

    for r in "$exe_dir" "$save_dir" "$save_parent" "$fallback_parent"; do
        if [ -n "$r" ] && [ -d "$r" ]; then
            case ":$roots:" in
                *":$r:"*) ;;
                *) roots="${roots:+$roots:}$r" ;;
            esac
        fi
    done

    local IFS=':'
    for root in $roots; do
        [ -z "$root" ] && continue
        local found=""
        # Find .nds files (limited depth to keep it fast)
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
            ok "Resolved local DeSmuME ROM: $found" >&2
            echo "$found"
            return 0
        fi
    done

    if [ -n "$fallback_path" ]; then
        echo "$fallback_path"
        return 0
    fi
    err "Unable to resolve a local NDS ROM path for gameVersion=$game_version" >&2
    return 1
}

# --- SHA-256 helpers --------------------------------------------------------

sha256_file_hex() {
    local file="$1"
    sha256sum "$file" 2>/dev/null | awk '{print $1}'
}

sha256_bytes_hex() {
    # Reads from stdin, outputs lowercase hex SHA-256
    sha256sum | awk '{print $1}'
}

# --- Main flow --------------------------------------------------------------

URL="${1:-}"

if [ -z "$URL" ]; then
    err "Missing protocol URL"
    info "Usage: $0 'pkmanager://launch/<token>?backend=<encoded-base-url>'"
    pause_exit 1
fi

token=""
backend_url=""
# Parse: pkmanager://launch/<token>?backend=<...>
if [[ "$URL" =~ pkmanager://launch/([^?]+)\?backend=(.+) ]]; then
    token="${BASH_REMATCH[1]}"
    # URL-decode backend_url
    backend_url=$(printf '%b' "${BASH_REMATCH[2]//%/\\x}")
fi

if [ -z "$token" ] || [ -z "$backend_url" ]; then
    err "Invalid protocol URL"
    info "Received: $URL"
    pause_exit 1
fi

info "Backend: $backend_url"
info "Token: ${token:0:8}..."

api_url="${backend_url}/api/Emulator/launch-package/${token}"
info "GET $api_url"

# Allow self-signed certs when targeting localhost
curl_opts=(-sS --max-time 15)
if [[ "$backend_url" =~ localhost ]] || [[ "$backend_url" =~ 127\.0\.0\.1 ]]; then
    curl_opts+=(-k)
fi

raw_response=""
raw_response=$(curl "${curl_opts[@]}" -H 'Accept: application/json' "$api_url") || {
    err "Failed to reach backend"
    info "  API: $api_url"
    info "  Make sure the pkmanager backend is running and reachable."
    pause_exit 1
}

if [ -z "$raw_response" ]; then
    err "Empty response from backend"
    pause_exit 1
fi

# Parse JSON response — we expect { code: 0, message, data: {...} }
# Use python3 if available, otherwise fall back to grep/sed parsing.
json_get_field() {
    local key="$1"
    if command -v python3 >/dev/null 2>&1; then
        python3 -c "
import json, sys
try:
    obj = json.load(sys.stdin)
    key = sys.argv[1]
    val = obj.get('data', {}).get(key) if isinstance(obj.get('data'), dict) else None
    if val is None:
        val = obj.get(key)
    if val is not None:
        print(val if not isinstance(val, bool) else ('true' if val else 'false'))
except Exception:
    pass
" "$key"
    else
        # Fallback: naive regex
        sed -n "s|.*\"$key\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*|\\1|p; s|.*\"$key\"[[:space:]]*:[[:space:]]*\\([^,}][^,}]*\\).*|\\1|p" | head -n 1
    fi
}

# Launch the emulator executable, handling .desktop files (XDG desktop entries)
# used by Flatpak applications such as Azahar. Direct execution of a .desktop file
# as a shell script causes bash syntax errors because .desktop files are INI-style
# config files, not scripts.
#
# Strategy:
#   1. If $exe_path ends with ".desktop" and is a regular file → parse the Exec=
#      line, substitute %f/%F/%u/%U placeholders with the ROM path, append the
#      ROM path if no placeholder exists, then eval the resulting command line.
#   2. Otherwise → exec directly.
#
# Returns the emulator's exit code via stdout (captured by caller).
launch_emulator() {
    local exe_path="$1"
    shift
    local args=("$@")

    # Detect .desktop file by extension AND content (must start with [Desktop Entry])
    local is_desktop=0
    case "$exe_path" in
        *.desktop)
            if [ -f "$exe_path" ]; then
                is_desktop=1
            fi
            ;;
    esac

    if [ "$is_desktop" = "1" ]; then
        # Extract the first Exec= line from the [Desktop Entry] section.
        # Use awk to stop at the first blank line / next section to avoid
        # picking up Exec= lines from other sections (e.g. [Desktop Action ...]).
        local exec_line
        exec_line=$(awk '
            /^\[Desktop Entry\]/ { in_entry=1; next }
            /^\[/ { in_entry=0 }
            in_entry && /^Exec=/ { sub(/^Exec=/, ""); print; exit }
        ' "$exe_path" 2>/dev/null)

        if [ -z "$exec_line" ]; then
            err "No Exec= line found in .desktop file: $exe_path" >&2
            return 1
        fi

        # Unescape desktop file escape sequences (backslash-escaped chars)
        exec_line=$(printf '%s' "$exec_line" | sed 's/\\\\/\\/g; s/\\s/ /g; s/\\t/\t/g; s/\\n/\n/g; s/\\%/%/g')

        # Substitute %f / %F / %u / %U placeholders with the first arg (ROM path)
        # Per Desktop Entry Spec: %f/%F = file paths, %u/%U = URLs.
        # If multiple args, %F/%U should receive all of them; %f/%u only the first.
        local placeholder_found=0
        if printf '%s' "$exec_line" | grep -qE '%[fFuU]'; then
            placeholder_found=1
            # %F or %U → all args (space-separated, properly quoted via eval)
            if printf '%s' "$exec_line" | grep -qE '%[FU]'; then
                local all_args_quoted=""
                local a
                for a in "${args[@]}"; do
                    # shellcheck disable=SC1003
                    all_args_quoted="${all_args_quoted} \"$(printf '%s' "$a" | sed 's/\\/\\\\/g; s/"/\\"/g')\""
                done
                exec_line=$(printf '%s' "$exec_line" | sed "s|%F|${all_args_quoted}|g; s|%U|${all_args_quoted}|g")
            fi
            # %f or %u → first arg only
            if printf '%s' "$exec_line" | grep -qE '%[fu]'; then
                local first_arg_quoted
                first_arg_quoted="\"$(printf '%s' "${args[0]:-}" | sed 's/\\/\\\\/g; s/"/\\"/g')\""
                exec_line=$(printf '%s' "$exec_line" | sed "s|%f|${first_arg_quoted}|g; s|%u|${first_arg_quoted}|g")
            fi
        fi

        # If no placeholder was substituted, append args to the end of Exec line
        if [ "$placeholder_found" = "0" ] && [ "${#args[@]}" -gt 0 ]; then
            local a
            for a in "${args[@]}"; do
                exec_line="${exec_line} \"$(printf '%s' "$a" | sed 's/\\/\\\\/g; s/"/\\"/g')\""
            done
        fi

        # Strip any remaining placeholder codes that we didn't substitute
        # (e.g. %d, %D, %n, %N, %k, %v, %m — these are deprecated/unused)
        exec_line=$(printf '%s' "$exec_line" | sed 's/%[a-zA-Z]//g')

        info "Parsed .desktop Exec: $exec_line" >&2
        # Execute the parsed command line as a CHILD process (NOT exec), so that
        # this shell stays alive and can run the post-emulator save sync step
        # after the emulator exits. Using `exec` here would replace the shell
        # process with flatpak/Azahar, causing the sync code path to never run.
        eval "$exec_line"
        return $?
    fi

    # Direct execution path
    "$exe_path" "${args[@]}"
    return $?
}

response_code=$(printf '%s' "$raw_response" | json_get_field "code")
if [ "$response_code" != "0" ]; then
    response_message=$(printf '%s' "$raw_response" | json_get_field "message")
    err "Backend returned: $response_message"
    pause_exit 1
fi

pkg_type=$(printf '%s' "$raw_response" | json_get_field "type")
pkg_generation=$(printf '%s' "$raw_response" | json_get_field "generation")
pkg_game_version=$(printf '%s' "$raw_response" | json_get_field "gameVersion")
pkg_title_id_low=$(printf '%s' "$raw_response" | json_get_field "titleIdLow")
pkg_exe_path=$(printf '%s' "$raw_response" | json_get_field "exePath")
pkg_save_dir=$(printf '%s' "$raw_response" | json_get_field "saveDir")
pkg_emu_save_path=$(printf '%s' "$raw_response" | json_get_field "emuSavePath")
pkg_rom_path=$(printf '%s' "$raw_response" | json_get_field "romPath")
pkg_save_data_b64=$(printf '%s' "$raw_response" | json_get_field "saveDataBase64")
pkg_save_file_id=$(printf '%s' "$raw_response" | json_get_field "saveFileId")
pkg_sync_token=$(printf '%s' "$raw_response" | json_get_field "syncToken")
pkg_file_name=$(printf '%s' "$raw_response" | json_get_field "fileName")

if [ -z "$pkg_type" ] || [ -z "$pkg_exe_path" ] || [ -z "$pkg_save_dir" ]; then
    err "Launch package is missing required fields."
    pause_exit 1
fi

resolved_title_id_low=$(resolve_azahar_title_id_low "$pkg_title_id_low" "$pkg_rom_path")

if [ "$pkg_type" = "azahar" ]; then
    rom_path=$(resolve_azahar_content_path "$pkg_save_dir" "$resolved_title_id_low" "$pkg_rom_path") || die "Failed to resolve Azahar content path."
elif [ "$pkg_type" = "desmume" ]; then
    rom_path=$(resolve_desmume_rom_path "$pkg_rom_path" "$pkg_save_dir" "$pkg_exe_path" "$pkg_game_version") || die "Failed to resolve DeSmuME ROM path."
else
    err "Unknown launcher type: $pkg_type"
    pause_exit 1
fi

if [ "$pkg_type" = "desmume" ]; then
    rom_file_name=$(basename "$rom_path")
    rom_file_name="${rom_file_name%.*}"
    emu_save_path="${pkg_save_dir}/${rom_file_name}.dsv"
else
    emu_save_path=$(resolve_azahar_save_path "$pkg_save_dir" "$resolved_title_id_low" "$pkg_emu_save_path")
fi

ok "Launch package received"
info "  Type: $pkg_type Gen$pkg_generation"
if [ -n "$resolved_title_id_low" ]; then
    info "  TID : $resolved_title_id_low"
fi
info "  EXE : $pkg_exe_path"
info "  ROM : $rom_path"
info "  SAVE: $emu_save_path"
if [ "$pkg_type" = "azahar" ] && [ -n "$pkg_rom_path" ] && [ "$pkg_rom_path" != "$rom_path" ]; then
    warn "  NOTE: Resolved Azahar content from TMD instead of backend fallback."
fi
if [ -n "$pkg_save_file_id" ]; then
    info "  SAVE ID : $pkg_save_file_id"
fi

# Verify ROM dir accessible
rom_dir=$(dirname "$rom_path")
if [ -n "$rom_dir" ] && [ ! -d "$rom_dir" ]; then
    err "ROM directory is not accessible: $rom_dir"
    pause_exit 1
fi

# Verify/create save parent
save_parent=$(dirname "$emu_save_path")
if [ ! -d "$save_parent" ]; then
    if ! mkdir -p "$save_parent" 2>/dev/null; then
        err "Failed to create save directory: $save_parent"
        pause_exit 1
    fi
fi

# Backup paths
if [ "$pkg_type" = "azahar" ]; then
    backup_dir="${pkg_save_dir}/pkmanager_backup/${resolved_title_id_low}"
    backup_file="${backup_dir}/main.bak"
else
    backup_dir="${pkg_save_dir}/pkmanager_backup"
    backup_file="${backup_dir}/save.dsv.bak"
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

# Decode and write save with SHA-256 verification
save_tmp=$(mktemp 2>/dev/null) || die "Failed to create temp file."
trap 'rm -f "$save_tmp" 2>/dev/null' EXIT

# Strip whitespace from base64 and decode
printf '%s' "$pkg_save_data_b64" | tr -d ' \r\n\t' | base64 -d > "$save_tmp" 2>/dev/null || {
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

# Verify emulator executable
if [ ! -x "$pkg_exe_path" ] && [ ! -f "$pkg_exe_path" ]; then
    err "Emulator executable was not found: $pkg_exe_path"
    pause_exit 1
fi

launch_args=()
if [ -n "$rom_path" ]; then
    launch_args+=("$rom_path")
fi

info "Launching: $pkg_exe_path ${launch_args[*]}"
# Run emulator (foreground, wait for exit)
launch_emulator "$pkg_exe_path" "${launch_args[@]}"
emulator_exit=$?
info "Emulator exited with code $emulator_exit"

# Sync save back to backend
if [ -z "$pkg_save_file_id" ] || [ -z "$pkg_sync_token" ]; then
    warn "Missing sync token, skipping automatic sync."
elif [ ! -f "$emu_save_path" ]; then
    warn "Save file was not found after emulator exit, skipping sync: $emu_save_path"
else
    sync_url="${backend_url}/api/Emulator/sync-save/${pkg_save_file_id}?token=$(printf '%s' "$pkg_sync_token" | sed 's/ /%20/g; s/!/%21/g; s/"/%22/g; s/#/%23/g; s/\$/%24/g; s/&/%26/g; s/'\''/%27/g; s/(/%28/g; s/)/%29/g; s/\*/%2A/g; s/+/%2B/g; s/,/%2C/g; s/:/%3A/g; s/;/%3B/g; s/=/%3D/g; s|/|%2F|g; s/?/%3F/g; s/@/%40/g; s/\[/%5B/g; s/]/%5D/g')"
    sync_size=$(stat -c '%s' "$emu_save_path" 2>/dev/null || stat -f '%z' "$emu_save_path")
    info "Syncing save back to backend..."
    info "Sync bytes: $sync_size"
    info "POST $sync_url"

    sync_response=""
    sync_response=$(curl "${curl_opts[@]}" --max-time 60 -X POST \
        -H 'Content-Type: application/octet-stream' \
        --data-binary "@$emu_save_path" \
        "$sync_url") || {
        warn "Automatic sync failed (curl error)"
        pause_exit 0
    }

    sync_code=$(printf '%s' "$sync_response" | json_get_field "code")
    if [ "$sync_code" = "0" ]; then
        ok "Save synced successfully."
        if [ "$backup_ready" = "1" ] && [ -f "$backup_file" ]; then
            if cp "$backup_file" "$emu_save_path" 2>/dev/null; then
                ok "Restored previous local save."
            else
                warn "Failed to restore previous local save."
            fi
        elif [ "$pkg_type" = "desmume" ] && [ "$had_existing_save" = "0" ] && [ -f "$emu_save_path" ]; then
            if rm -f "$emu_save_path" 2>/dev/null; then
                ok "Removed injected temporary save (first launch)."
            else
                warn "Failed to clean injected temporary save."
            fi
        else
            warn "No previous local save to restore."
        fi
    else
        sync_message=$(printf '%s' "$sync_response" | json_get_field "message")
        warn "Backend sync returned non-zero code: $sync_message"
    fi
fi

pause_exit 0
