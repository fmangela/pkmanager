#!/usr/bin/env bash
# pkmanager protocol installer for Linux / Steam Deck Desktop Mode
# Installs pkmanager-launcher.sh to ~/.local/share/pkmanager and registers
# the pkmanager:// URL scheme via a .desktop file + xdg-mime.

set -u

LOG_PREFIX="[pkmanager]"

info() { printf '%s %s\n' "$LOG_PREFIX" "$*"; }
warn() { printf '%s \033[33m[WARN] %s\033[0m\n' "$LOG_PREFIX" "$*"; }
err()  { printf '%s \033[31m[ERROR] %s\033[0m\n' "$LOG_PREFIX" "$*"; }
ok()   { printf '%s \033[32m%s\033[0m\n' "$LOG_PREFIX" "$*"; }

# Self-localize: this script lives in <repo>/scripts/, launcher is a sibling.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_LAUNCHER="$SCRIPT_DIR/pkmanager-launcher.sh"

if [ ! -f "$SOURCE_LAUNCHER" ]; then
    # Fallback: maybe this installer was extracted standalone — look in same dir.
    SOURCE_LAUNCHER="$SCRIPT_DIR/pkmanager-launcher.sh"
fi
if [ ! -f "$SOURCE_LAUNCHER" ]; then
    err "pkmanager-launcher.sh was not found next to this installer."
    info "Expected: $SOURCE_LAUNCHER"
    exit 1
fi

# Install target: user-local share directory (no root needed).
if [ -n "${XDG_DATA_HOME:-}" ] && [ -d "$XDG_DATA_HOME" ]; then
    INSTALL_BASE="$XDG_DATA_HOME/pkmanager"
else
    INSTALL_BASE="$HOME/.local/share/pkmanager"
fi

INSTALL_DIR="$INSTALL_BASE"
LAUNCHER_SH="$INSTALL_DIR/pkmanager-launcher.sh"
DESKTOP_FILE="$HOME/.local/share/applications/pkmanager-launcher.desktop"

echo
echo "============================================"
echo "  pkmanager protocol installer (Linux)"
echo "============================================"
echo

# --- Step 1: Install launcher ------------------------------------------------
info "[1/4] Installing launcher to $LAUNCHER_SH ..."
if ! mkdir -p "$INSTALL_DIR"; then
    err "Failed to create install directory: $INSTALL_DIR"
    exit 1
fi
if ! cp "$SOURCE_LAUNCHER" "$LAUNCHER_SH"; then
    err "Failed to copy launcher."
    exit 1
fi
if ! chmod +x "$LAUNCHER_SH"; then
    err "Failed to mark launcher executable."
    exit 1
fi
ok "Launcher installed."

# --- Step 2: Write .desktop file --------------------------------------------
info "[2/4] Writing .desktop file to $DESKTOP_FILE ..."
APPS_DIR=$(dirname "$DESKTOP_FILE")
if ! mkdir -p "$APPS_DIR"; then
    err "Failed to create applications directory: $APPS_DIR"
    exit 1
fi

# Choose a sensible terminal for steam deck / generic desktops.
# Steam Deck Desktop Mode ships konsole; GNOME uses gnome-terminal; others fall back to xterm.
detect_terminal() {
    for t in konsole gnome-terminal x-terminal-emulator xfce4-terminal mate-terminal lxterminal xterm; do
        if command -v "$t" >/dev/null 2>&1; then
            echo "$t"
            return 0
        fi
    done
    echo ""
}

TERM_CMD=$(detect_terminal)
if [ -n "$TERM_CMD" ]; then
    case "$TERM_CMD" in
        gnome-terminal)
            EXEC_LINE="gnome-terminal -- bash -lc '%s \$1' bash"
            ;;
        konsole)
            EXEC_LINE="konsole -e bash -lc '%s \$1' bash"
            ;;
        xfce4-terminal|mate-terminal|lxterminal)
            EXEC_LINE="$TERM_CMD -e bash -lc '%s \$1' bash"
            ;;
        *)
            EXEC_LINE="$TERM_CMD -e bash -lc '%s \$1' bash"
            ;;
    esac
    # We need Exec= with proper quoting. The %u passes the URL from xdg-open.
    # Format the launcher path into the inner command.
    LAUNCHER_INNER="$LAUNCHER_SH"
    # Build: <term> ... bash -lc 'LAUNCHER_SH "$1"' bash %u
    case "$TERM_CMD" in
        gnome-terminal)
            DESKTOP_EXEC="gnome-terminal -- bash -lc '${LAUNCHER_INNER} \"\\\$1\"' bash %u"
            ;;
        konsole)
            DESKTOP_EXEC="konsole -e bash -lc '${LAUNCHER_INNER} \"\\\$1\"' bash %u"
            ;;
        *)
            DESKTOP_EXEC="${TERM_CMD} -e bash -lc '${LAUNCHER_INNER} \"\\\$1\"' bash %u"
            ;;
    esac
else
    warn "No terminal emulator detected. Using direct exec (no terminal window)."
    DESKTOP_EXEC="bash -lc '${LAUNCHER_SH} \"\\\$1\"' bash %u"
fi

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=pkmanager Launcher
Comment=Local emulator launcher for pkmanager
Exec=${DESKTOP_EXEC}
Terminal=false
NoDisplay=true
MimeType=x-scheme-handler/pkmanager;
Categories=Game;Utility;
EOF

if [ ! -f "$DESKTOP_FILE" ]; then
    err "Failed to write .desktop file."
    exit 1
fi
ok ".desktop file written."

# --- Step 3: Register protocol handler --------------------------------------
info "[3/4] Registering pkmanager:// protocol via xdg-mime ..."

if ! command -v xdg-mime >/dev/null 2>&1; then
    err "xdg-mime is not installed. Install 'xdg-utils' via your package manager."
    info "  On Steam Deck (Arch): sudo pacman -S xdg-utils"
    info "  On Debian/Ubuntu: sudo apt-get install xdg-utils"
    exit 1
fi

# Register this .desktop file as the handler for pkmanager://
if ! xdg-mime default "pkmanager-launcher.desktop" "x-scheme-handler/pkmanager"; then
    err "Failed to register pkmanager:// handler via xdg-mime."
    exit 1
fi

# Refresh desktop database if update-desktop-database exists.
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APPS_DIR" 2>/dev/null || true
fi

ok "Protocol registered."

# --- Step 4: Verify ---------------------------------------------------------
info "[4/4] Verifying registration..."
HANDLER=$(xdg-mime query default "x-scheme-handler/pkmanager" 2>/dev/null || echo "")
if [ "$HANDLER" != "pkmanager-launcher.desktop" ]; then
    warn "Verification: handler is '$HANDLER' (expected pkmanager-launcher.desktop)."
    warn "Some desktop environments override xdg-mime; if clicking 'launch' in pkmanager"
    warn "doesn't open this launcher, set it manually in your DE's default-apps settings."
else
    ok "Handler registered correctly: $HANDLER"
fi

echo
echo "============================================"
echo "  Installation complete"
echo "============================================"
echo " Launcher     : $LAUNCHER_SH"
echo " .desktop file: $DESKTOP_FILE"
echo
echo " Return to pkmanager and click the local-launch button."
echo " If a browser prompt appears, choose to allow opening the external app."
echo
read -r -p "Press Enter to close this window..." _
exit 0
