-- A required field must be filled in before a card can be moved to a Won stage (see worker/routes/pipeline.ts).
ALTER TABLE crm_field_defs ADD COLUMN required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1));
