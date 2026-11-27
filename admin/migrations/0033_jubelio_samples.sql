-- Free affiliate samples are entered in Jubelio as INTERNAL orders with a price, marked only in the order note ("sampel").
-- They are not sales. Only the yes/no is stored, never the note text, which can hold names and addresses.
ALTER TABLE jubelio_orders ADD COLUMN sample INTEGER NOT NULL DEFAULT 0;

DROP VIEW dashboard_sales;
CREATE VIEW dashboard_sales AS
  SELECT client_id, sale_date, value, source, package_name, pay_status, meta_state, deleted_at FROM sales
   WHERE client_id NOT IN (SELECT client_id FROM jubelio_orders)
  UNION ALL
  SELECT client_id, day, total,
         CASE channel WHEN 'SHOPEE' THEN 'Shopee' WHEN 'TOKOPEDIA' THEN 'Tokopedia' WHEN 'Shop | Tokopedia' THEN 'TikTok / Tokopedia Shop' WHEN 'INTERNAL' THEN 'Manual (internal)' ELSE channel END,
         NULL, CASE WHEN canceled = 1 THEN 'cancelled' END, 'none', NULL
    FROM jubelio_orders WHERE (canceled = 1 OR paid = 1) AND sample = 0;
