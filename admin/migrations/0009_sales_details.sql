-- What was sold and where it stands: departure date, package, room type, down
-- payment and payment status. All optional, so a plain file or a later booking
-- system can fill whatever it has. Cancelled sales stop counting in the dashboard.
ALTER TABLE sales ADD COLUMN departure_date TEXT;   -- YYYY-MM-DD
ALTER TABLE sales ADD COLUMN package_name  TEXT;
ALTER TABLE sales ADD COLUMN room_type     TEXT;    -- Triple / Quad / Sharing / Double ...
ALTER TABLE sales ADD COLUMN down_payment  REAL;    -- IDR
ALTER TABLE sales ADD COLUMN pay_status    TEXT;    -- dp | paid | cancelled (NULL = unknown)
CREATE INDEX IF NOT EXISTS idx_sales_departure ON sales(client_id, departure_date);
