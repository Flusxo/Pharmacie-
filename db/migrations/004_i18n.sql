-- 004: French / English. Idempotent.
-- The language chosen by the user (UI, emails); French by default.
ALTER TABLE users ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'fr';
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_language_check CHECK (language IN ('fr', 'en'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- English versions of the medicine texts (names are brand names, the same in both languages;
-- categories and forms are codes translated by the app). Empty = fall back to French.
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS description_en text NOT NULL DEFAULT '';
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS age_note_en text NOT NULL DEFAULT '';
