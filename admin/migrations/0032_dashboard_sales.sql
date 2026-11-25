-- What the Overview, trend and client report count as sales. A brand with Jubelio orders is counted from Jubelio alone (paid orders;
-- cancelled ones marked so reports can show them apart), because any uploaded sale would be the same order twice. Every other
-- brand is counted from the uploaded or sheet-synced `sales` table, as before.
CREATE VIEW dashboard_sales AS
  SELECT client_id, sale_date, value, source, package_name, pay_status, meta_state, deleted_at FROM sales
   WHERE client_id NOT IN (SELECT client_id FROM jubelio_orders)
  UNION ALL
  SELECT client_id, day, total,
         CASE channel WHEN 'SHOPEE' THEN 'Shopee' WHEN 'TOKOPEDIA' THEN 'Tokopedia' WHEN 'Shop | Tokopedia' THEN 'TikTok / Tokopedia Shop' WHEN 'INTERNAL' THEN 'Manual (internal)' ELSE channel END,
         NULL, CASE WHEN canceled = 1 THEN 'cancelled' END, 'none', NULL
    FROM jubelio_orders WHERE canceled = 1 OR paid = 1;

-- Read Jubelio again from the start: the first run missed some older orders.
DELETE FROM jubelio_sync;
