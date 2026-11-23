-- Preserve Content Plan's editorial workflow separately from actual Publish post status.
ALTER TABLE content_plans ADD COLUMN progress TEXT NOT NULL DEFAULT 'Ideation';
ALTER TABLE content_plans ADD COLUMN pillar TEXT NOT NULL DEFAULT '';
ALTER TABLE content_plans ADD COLUMN campaign TEXT NOT NULL DEFAULT '';
ALTER TABLE content_plans ADD COLUMN platforms TEXT NOT NULL DEFAULT '';
ALTER TABLE content_plans ADD COLUMN reference_url TEXT NOT NULL DEFAULT '';
ALTER TABLE content_plans ADD COLUMN final_url TEXT NOT NULL DEFAULT '';
ALTER TABLE content_plans ADD COLUMN posted_date TEXT;
UPDATE content_plans SET progress = CASE stage WHEN 'drafting' THEN 'Copy / Script' WHEN 'in_review' THEN 'Review Copy' WHEN 'scheduled' THEN 'Scheduled' WHEN 'published' THEN 'Posted' ELSE 'Ideation' END;
