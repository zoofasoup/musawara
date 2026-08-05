-- LOCAL DESIGN PREVIEW ONLY. DO NOT RUN THIS AGAINST PRODUCTION.
--
-- The ledger and careers page are the two places on this site where the design
-- only makes sense once real content is in them. An empty ledger tells you
-- nothing about whether the typography works.
--
-- This file marks the DRAFT figures from seed.sql as verified and published so
-- the design can be reviewed locally. The figures have NOT actually been
-- confirmed against source data. Salary ranges here are invented placeholders.
--
-- Before launch: run supabase/seed.sql only, confirm each figure by hand, then
-- set verified_at and is_published per row. See README, "Publishing figures".

update ledger_entries
set verified_at = now(),
    source_note = 'PREVIEW ONLY — angka belum diverifikasi',

    is_published = true;

update job_openings
set salary_min = case slug
      when 'performance-marketer'      then 7000000
      when 'copywriter-social-media'   then 5500000
    end,
    salary_max = case slug
      when 'performance-marketer'      then 11000000
      when 'copywriter-social-media'   then 8500000
    end,
    is_published = true;
