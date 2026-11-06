-- Purchases for rows stored before 0005: count them from the saved `actions`
-- array, with the same rule the sync uses (first available type, so the
-- overlapping Meta purchase types are never added together). Values need a
-- re-pull (action_values were not stored), so purchase_value stays as it is.
UPDATE insights_daily
SET purchases = COALESCE((
  SELECT SUM(CAST(json_extract(j.value, '$.value') AS REAL))
  FROM json_each(insights_daily.actions_json) j
  WHERE json_extract(j.value, '$.action_type') = CASE
    WHEN EXISTS (SELECT 1 FROM json_each(insights_daily.actions_json) k WHERE json_extract(k.value, '$.action_type') = 'omni_purchase') THEN 'omni_purchase'
    WHEN EXISTS (SELECT 1 FROM json_each(insights_daily.actions_json) k WHERE json_extract(k.value, '$.action_type') = 'purchase') THEN 'purchase'
    WHEN EXISTS (SELECT 1 FROM json_each(insights_daily.actions_json) k WHERE json_extract(k.value, '$.action_type') = 'offline_conversion.purchase') THEN 'offline_conversion.purchase'
  END
), 0)
-- Only rows that mention a purchase at all: keeps the statement small enough for D1.
WHERE purchases = 0 AND actions_json LIKE '%purchase%' AND json_valid(actions_json);
