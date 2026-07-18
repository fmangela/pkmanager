#!/bin/bash
# ============================================================
# L.7 配信 Wonder Card 种子导入脚本
# 用途: 从 sdk/EventsGallery/Released/Gen {6,7} 复制 .wc6/.wc7 文件到
#       client/public/assets/wondercards/{gen6,gen7}/（素材库，提交仓库），
#       并触发后端解析元数据 + 二进制本体写入 DB
# 数据源: sdk/EventsGallery (Project Pokémon Events Gallery) — gitignored，仅首次复制用
# 素材库: client/public/assets/wondercards/（committed）— 二进制本体也写入 wonder_cards.raw_data 列
# 详见: docs/配信功能-技术文档.md
# 用法:
#   ./scripts/seed-wonder-cards.sh             # 复制文件 + 解析写入 DB
#   ./scripts/seed-wonder-cards.sh --files-only # 仅复制文件，不解析 DB
#   ./scripts/seed-wonder-cards.sh --db-only    # 仅解析已有文件写 DB
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EVENTS_DIR="$PROJECT_DIR/sdk/EventsGallery/Released"
DEST_DIR="$PROJECT_DIR/client/public/assets/wondercards"
SERVER_DIR="$PROJECT_DIR/server/PkManager.Server"

# ── 加载根目录 config 文件 ────────────────────────────
# 与 start-dev.sh 一致：source config 把 DB_* 导入为环境变量，
# 供 Program.cs 的 builder.Configuration 通过环境变量读取（DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD）
CONFIG_FILE="$PROJECT_DIR/config"
if [[ -f "$CONFIG_FILE" ]]; then
    set -a
    source "$CONFIG_FILE"
    set +a
else
    echo "[WARN] config 文件不存在，使用默认值（cp config.dst config 创建）"
    # set -a 让以下赋值导出为环境变量，dotnet run 子进程才能继承
    set -a
    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-5432}"
    DB_NAME="${DB_NAME:-pkmanager}"
    DB_USER="${DB_USER:-pkadmin}"
    DB_PASSWORD="${DB_PASSWORD:-pkadmin123}"
    set +a
fi

# PostgreSQL 连接参数 — 环境变量优先，回退到本地 Unix socket
DATA_DIR="$PROJECT_DIR/data/pgdata"
PGHOST="${PGHOST:-$DATA_DIR/run}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-pkadmin}"
PGDATABASE="${PGDATABASE:-pkmanager}"

MODE="all"
case "${1:-}" in
    --files-only) MODE="files" ;;
    --db-only)    MODE="db" ;;
    "")           MODE="all" ;;
    *) echo "Usage: $0 [--files-only|--db-only]"; exit 1 ;;
esac

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Gen6: ENG FRE GER ITA JPN KOR SPA + Pokemon Link
# Gen7: CHS CHT ENG FRE GER ITA JPN KOR SPA
GEN6_LANGS=(ENG FRE GER ITA JPN KOR SPA)
GEN7_LANGS=(CHS CHT ENG FRE GER ITA JPN KOR SPA)

copy_files() {
    local src_dir="$1" dst_subdir="$2" langs=("${@:3}")
    local dst="$DEST_DIR/$dst_subdir"
    mkdir -p "$dst"
    local total=0
    for lang in "${langs[@]}"; do
        local src="$src_dir/$lang"
        if [[ ! -d "$src" ]]; then
            log_warn "目录不存在，跳过: $src"
            continue
        fi
        local count
        # 用 find 处理带空格的文件名
        count=$(find "$src" -maxdepth 1 -type f \( -name "*.wc6" -o -name "*.wc6full" -o -name "*.wc7" -o -name "*.wc7full" \) 2>/dev/null | wc -l)
        if [[ "$count" -eq 0 ]]; then
            log_warn "  $lang: 无 wonder card 文件"
            continue
        fi
        # 用 cp -r 处理带空格的文件名（保留原文件名）
        find "$src" -maxdepth 1 -type f \( -name "*.wc6" -o -name "*.wc6full" -o -name "*.wc7" -o -name "*.wc7full" \) -exec cp -n {} "$dst/" \;
        log_info "  $lang: $count 个文件 → $dst/"
        total=$((total + count))
    done
    echo "$total"
}

if [[ "$MODE" == "all" || "$MODE" == "files" ]]; then
    log_info "=== 阶段 1: 复制 wonder card 文件到 client/public/assets/wondercards/ ==="
    log_info "Gen6 来源: $EVENTS_DIR/Gen 6/Wondercards/"
    GEN6_TOTAL=$(copy_files "$EVENTS_DIR/Gen 6/Wondercards" "gen6" "${GEN6_LANGS[@]}")
    log_info "Gen6 总计: $GEN6_TOTAL 个文件"

    log_info "Gen7 来源: $EVENTS_DIR/Gen 7/3DS/Wondercards/"
    GEN7_TOTAL=$(copy_files "$EVENTS_DIR/Gen 7/3DS/Wondercards" "gen7" "${GEN7_LANGS[@]}")
    log_info "Gen7 总计: $GEN7_TOTAL 个文件"

    log_info "文件复制完成: $((GEN6_TOTAL + GEN7_TOTAL)) 个 wonder card 文件"
fi

if [[ "$MODE" == "all" || "$MODE" == "db" ]]; then
    log_info "=== 阶段 2: 调用后端解析 wonder card 元数据并写入 DB ==="

    if [[ ! -d "$SERVER_DIR" ]]; then
        log_error "后端目录不存在: $SERVER_DIR"
        exit 1
    fi

    # 通过 dotnet run 启动后端的 seed-wonder-cards 命令（Program.cs 解析 --seed-wonder-cards 参数）
    log_info "启动后端导入器: dotnet run --project $SERVER_DIR --seed-wonder-cards"
    log_info "  PGHOST=$PGHOST PGPORT=$PGPORT PGUSER=$PGUSER PGDATABASE=$PGDATABASE"

    export PGHOST PGPORT PGUSER PGDATABASE
    (cd "$SERVER_DIR" && dotnet run --no-launch-profile -- --seed-wonder-cards 2>&1) | \
        grep -E "^\[(Wonder|Info|Error)\]" || true

    log_info "DB 解析完成"
fi

log_info "=== 完成 ==="
log_info "  文件目录: $DEST_DIR/{gen6,gen7}/"
log_info "  DB 表: wonder_cards (SELECT count(*) FROM wonder_cards; 验证)"
