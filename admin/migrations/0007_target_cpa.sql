-- Target CPA per client (IDR): the most the business can pay for one sale.
-- The dashboard compares the real CPA (spend / offline purchases) against it,
-- and derives the ROAS needed to break even from the average sale value.
ALTER TABLE clients ADD COLUMN target_cpa REAL;
