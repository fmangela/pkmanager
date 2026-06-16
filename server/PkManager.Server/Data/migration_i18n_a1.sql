-- ============================================================
-- A.1 i18n 基础设施 — 账号级语言偏好
-- ============================================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS preferred_lang VARCHAR(10) NOT NULL DEFAULT 'zh-Hans';

COMMENT ON COLUMN users.preferred_lang IS '账号级界面语言偏好';
