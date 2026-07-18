-- ============================================================
-- L.7 配信功能 — wonder_cards 表（含二进制本体）
-- 详见: docs/配信功能-技术文档.md
-- 素材文件: client/public/assets/wondercards/{gen6,gen7}/{filename}
-- 二进制本体: raw_data BYTEA 列直接入库，注入时从 DB 读取，不依赖文件系统
-- ============================================================

CREATE TABLE IF NOT EXISTS wonder_cards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id         INT           NOT NULL,
    game_version    VARCHAR(20)   NOT NULL,
    title           TEXT          NOT NULL,
    description     TEXT,
    species_id      INT,
    item_id         INT,
    language        VARCHAR(10)  NOT NULL,
    card_type       VARCHAR(10)  NOT NULL,
    raw_data        BYTEA         NOT NULL,
    file_path       TEXT,
    release_date    DATE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (card_id, game_version, language, card_type)
);

ALTER TABLE wonder_cards
ADD COLUMN IF NOT EXISTS raw_data BYTEA;

CREATE INDEX IF NOT EXISTS idx_wonder_cards_game_version ON wonder_cards (game_version);
CREATE INDEX IF NOT EXISTS idx_wonder_cards_language     ON wonder_cards (language);
CREATE INDEX IF NOT EXISTS idx_wonder_cards_species      ON wonder_cards (species_id) WHERE species_id IS NOT NULL;

COMMENT ON TABLE wonder_cards IS '配信 Wonder Card 完整数据表 — 二进制本体在 raw_data 列，文件镜像在 client/public/assets/wondercards/{gen6,gen7}/';
COMMENT ON COLUMN wonder_cards.card_id IS 'Wonder Card 内部 ID (0-2047)';
COMMENT ON COLUMN wonder_cards.game_version IS '文件名 gameTag，前端按存档版本过滤时映射';
COMMENT ON COLUMN wonder_cards.card_type IS 'wc6/wc6full (Gen6) | wc7/wc7full (Gen7)';
COMMENT ON COLUMN wonder_cards.raw_data IS 'Wonder Card 二进制本体（.wc6/.wc6full/.wc7/.wc7full 完整字节），注入时直接传给 PKHeX MysteryGift.GetMysteryGift';
COMMENT ON COLUMN wonder_cards.file_path IS '素材文件相对仓库根的路径（assets/wondercards/{gen}/{filename}），仅用于调试/审计';
