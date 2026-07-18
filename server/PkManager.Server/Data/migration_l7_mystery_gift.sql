-- ============================================================
-- L.7 配信功能 — wonder_cards 索引表
-- 详见: docs/配信功能-技术文档.md
-- 数据源: sdk/EventsGallery/Released/Gen {6,7}/...
-- 文件本体: data/wondercards/{gen6,gen7}/{filename}
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
    file_path       TEXT          NOT NULL,
    release_date    DATE,
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
