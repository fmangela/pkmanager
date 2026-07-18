-- ============================================================
-- 宝可梦全世代管理平台 — 数据库初始化脚本
-- 目标数据库: PostgreSQL 15+
-- 使用: psql -U pkadmin -d pkmanager -f init.sql
-- ============================================================

-- ── 用户表 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(50)  NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    avatar_url      VARCHAR(500),
    preferred_lang  VARCHAR(10)  NOT NULL DEFAULT 'zh-Hans',
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE users IS '用户账号表';
COMMENT ON COLUMN users.password_hash IS 'BCrypt 哈希后的密码';
COMMENT ON COLUMN users.preferred_lang IS '账号级界面语言偏好';

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);

-- ── 用户银行表 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_pokemon (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 查询频繁字段（从 PKM 对象中提取冗余存储，加速筛选）
    species         INTEGER       NOT NULL,          -- 全国图鉴编号
    species_name    VARCHAR(100)  NOT NULL,          -- 物种名称（冗余，便于展示）
    nickname        VARCHAR(50),                     -- 昵称
    level           INTEGER       NOT NULL DEFAULT 1,
    nature          INTEGER,                         -- 性格枚举值
    nature_name     VARCHAR(50),                     -- 性格名称
    ability         INTEGER,                         -- 特性枚举
    ability_name    VARCHAR(100),                    -- 特性名称
    generation      INTEGER       NOT NULL,          -- 世代 (3-7)
    game_version    INTEGER,                         -- 具体游戏版本枚举
    is_shiny        BOOLEAN       NOT NULL DEFAULT FALSE,
    is_egg          BOOLEAN       NOT NULL DEFAULT FALSE,
    is_valid        BOOLEAN       NOT NULL DEFAULT TRUE, -- 最后校验合法性

    -- 完整宝可梦数据 (JSONB)
    -- 包含: IVs, EVs, Moves, HeldItem, Ball, MetLocation, PID, TID, SID,
    --       Ribbons, Marks, ContestStats, 以及世代特有字段等
    pokemon_json    JSONB         NOT NULL,

    -- 原始二进制 (Base64)，用于 PKHeX.Core 反序列化编辑
    pkm_data_base64 TEXT,

    -- 元数据
    source          VARCHAR(50),                     -- 'upload'/'manual'/'save_import'
    source_save_id  UUID,                            -- 来源存档（如果有）
    sort_order      INTEGER       NOT NULL DEFAULT 0,
    notes           TEXT,                            -- 用户备注
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE bank_pokemon IS '用户个人宝可梦银行 - 永久云存储';
COMMENT ON COLUMN bank_pokemon.pokemon_json IS '完整宝可梦属性JSON，含世代差异字段';
COMMENT ON COLUMN bank_pokemon.pkm_data_base64 IS 'PKM二进制Base64，用于PKHeX.Core编辑重建';

CREATE INDEX IF NOT EXISTS idx_bank_user_id      ON bank_pokemon (user_id);
CREATE INDEX IF NOT EXISTS idx_bank_user_species ON bank_pokemon (user_id, species);
CREATE INDEX IF NOT EXISTS idx_bank_user_gen     ON bank_pokemon (user_id, generation);
CREATE INDEX IF NOT EXISTS idx_bank_user_shiny   ON bank_pokemon (user_id, is_shiny) WHERE is_shiny = TRUE;
CREATE INDEX IF NOT EXISTS idx_bank_pokemon_json ON bank_pokemon USING GIN (pokemon_json);

-- ── 存档文件表 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS save_files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 存档元数据
    filename        VARCHAR(255)  NOT NULL,
    file_size       BIGINT        NOT NULL,          -- 原始文件大小(字节)
    generation      INTEGER       NOT NULL,          -- 世代 (3-7)
    game_version    INTEGER,                         -- 具体游戏版本枚举
    trainer_name    VARCHAR(50),                     -- 训练家名称 (OT)
    trainer_id      INTEGER,                         -- TID
    secret_id       INTEGER,                         -- SID
    play_time       INTEGER       NOT NULL DEFAULT 0,-- 游戏时长(秒)
    box_count       INTEGER       NOT NULL,          -- 箱子数量
    pokemon_count   INTEGER       NOT NULL DEFAULT 0,-- 存档内宝可梦总数
    is_valid_save   BOOLEAN       NOT NULL DEFAULT TRUE,

    -- 原始存档二进制
    raw_save_data   BYTEA         NOT NULL,          -- 原始存档文件二进制

    -- 状态
    is_modified     BOOLEAN       NOT NULL DEFAULT FALSE,
    last_accessed_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE save_files IS '用户上传的游戏存档文件';
COMMENT ON COLUMN save_files.raw_save_data IS '原始/当前存档二进制数据 (更新后的存档也存于此)';

CREATE INDEX IF NOT EXISTS idx_save_user_id    ON save_files (user_id);
CREATE INDEX IF NOT EXISTS idx_save_user_gen   ON save_files (user_id, generation);

-- ── 存档箱子宝可梦表 ───────────────────────────────────
CREATE TABLE IF NOT EXISTS save_box_pokemon (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    save_file_id    UUID          NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,

    box_index       INTEGER       NOT NULL,          -- 箱子序号 (0-based)
    slot_index      INTEGER       NOT NULL,          -- 格子序号 (0-based)
    is_empty        BOOLEAN       NOT NULL DEFAULT TRUE,

    -- 只有非空格子才有以下数据
    species         INTEGER,
    species_name    VARCHAR(100),
    level           INTEGER,
    is_shiny        BOOLEAN,
    is_egg          BOOLEAN,

    -- 完整宝可梦数据
    pokemon_json    JSONB,

    -- 来源标记（如果是从银行拖入的，记录银行ID）
    source_bank_id  UUID REFERENCES bank_pokemon(id) ON DELETE SET NULL,

    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- 每个存档内 box+slot 唯一
    UNIQUE (save_file_id, box_index, slot_index)
);

COMMENT ON TABLE save_box_pokemon IS '存档文件箱子内宝可梦 - 展开存储便于拖拽操作';

CREATE INDEX IF NOT EXISTS idx_box_save_id      ON save_box_pokemon (save_file_id);
CREATE INDEX IF NOT EXISTS idx_box_save_box     ON save_box_pokemon (save_file_id, box_index);
CREATE INDEX IF NOT EXISTS idx_box_pokemon_json ON save_box_pokemon USING GIN (pokemon_json);

-- ── 用户设置表 (key-value + device_id) ─────────────────
CREATE TABLE IF NOT EXISTS user_settings (
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id   UUID         NOT NULL,
    key         VARCHAR(64)  NOT NULL,
    value       TEXT         NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, device_id, key)
);

COMMENT ON TABLE user_settings IS '用户设置 - key-value 模式，按设备隔离';
COMMENT ON COLUMN user_settings.device_id IS '前端生成的设备指纹 UUID';

CREATE INDEX IF NOT EXISTS idx_user_settings_user_device ON user_settings (user_id, device_id);

-- ============================================================
-- F.1 静态数据缓存 — 资源名称表（只读参考数据）
-- 数据源: PKHeX.Core 内置文本资源
-- 种子导入: scripts/seed-static-data.sh
-- ============================================================

-- ── 物种名称 (1025 条/语言) ─────────────────────────────
CREATE TABLE IF NOT EXISTS res_species (
    id   INT         NOT NULL,
    lang VARCHAR(10) NOT NULL DEFAULT 'zh-Hans',
    name VARCHAR(64) NOT NULL,
    PRIMARY KEY (id, lang)
);

-- ── 招式名称 (920 条/语言) ─────────────────────────────
CREATE TABLE IF NOT EXISTS res_moves (
    id   INT         NOT NULL,
    lang VARCHAR(10) NOT NULL DEFAULT 'zh-Hans',
    name VARCHAR(64) NOT NULL,
    PRIMARY KEY (id, lang)
);

-- ── 特性名称 (310 条/语言) ─────────────────────────────
CREATE TABLE IF NOT EXISTS res_abilities (
    id   INT         NOT NULL,
    lang VARCHAR(10) NOT NULL DEFAULT 'zh-Hans',
    name VARCHAR(64) NOT NULL,
    PRIMARY KEY (id, lang)
);

-- ── 性格名称 (24 条/语言) ─────────────────────────────
CREATE TABLE IF NOT EXISTS res_natures (
    id   INT         NOT NULL,
    lang VARCHAR(10) NOT NULL DEFAULT 'zh-Hans',
    name VARCHAR(16) NOT NULL,
    PRIMARY KEY (id, lang)
);

-- ── 道具名称 (2684 条/语言) ─────────────────────────────
CREATE TABLE IF NOT EXISTS res_items (
    id   INT         NOT NULL,
    lang VARCHAR(10) NOT NULL DEFAULT 'zh-Hans',
    name VARCHAR(128) NOT NULL,
    PRIMARY KEY (id, lang)
);

-- ============================================================
-- L.7 配信 Wonder Card 索引表
-- 数据源: sdk/EventsGallery/Released/Gen {6,7}/...
-- 文件本体: data/wondercards/{gen6,gen7}/{filename}
-- 种子导入: scripts/seed-wonder-cards.sh
-- 详见: docs/配信功能-技术文档.md
-- ============================================================

CREATE TABLE IF NOT EXISTS wonder_cards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id         INT           NOT NULL,                -- 卡片内部 ID (0-2047)
    game_version    VARCHAR(20)   NOT NULL,                -- 文件名 gameTag: 'X'/'Y'/'XY'/'ORAS'/'XYORAS'/'SM'/'USUM'/'SMUSUM'
    title           TEXT          NOT NULL,                -- 卡片标题（PKHeX 从 Wonder Card 解析）
    description     TEXT,                                    -- 文件名解析出的描述
    species_id      INT,                                     -- 涉及物种（用于图标展示）
    item_id         INT,                                     -- 涉及道具
    language        VARCHAR(10)  NOT NULL,                   -- 'ENG'/'JPN'/'FRE'/'GER'/'ITA'/'SPA'/'KOR'/'CHS'/'CHT'
    card_type       VARCHAR(10)  NOT NULL,                   -- 'wc6'/'wc6full'/'wc7'/'wc7full'
    file_path       TEXT          NOT NULL,                  -- data/wondercards/{gen}/{filename}
    release_date    DATE,                                    -- 卡片发布日期（PKHeX 解析）
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (card_id, game_version, language, card_type)
);

CREATE INDEX IF NOT EXISTS idx_wonder_cards_game_version ON wonder_cards (game_version);
CREATE INDEX IF NOT EXISTS idx_wonder_cards_language     ON wonder_cards (language);
CREATE INDEX IF NOT EXISTS idx_wonder_cards_species      ON wonder_cards (species_id) WHERE species_id IS NOT NULL;

COMMENT ON TABLE wonder_cards IS '配信 Wonder Card 索引表 — 文件本体在 data/wondercards/{gen6,gen7}/';
COMMENT ON COLUMN wonder_cards.card_id IS 'Wonder Card 内部 ID (0-2047)';
COMMENT ON COLUMN wonder_cards.game_version IS '文件名 gameTag，前端按存档版本过滤时映射';
COMMENT ON COLUMN wonder_cards.card_type IS 'wc6/wc6full (Gen6) | wc7/wc7full (Gen7)';
