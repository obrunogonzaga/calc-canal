ALTER TABLE billing_order
  DROP CONSTRAINT IF EXISTS billing_order_method_check;

ALTER TABLE billing_order
  ADD CONSTRAINT billing_order_method_check
  CHECK (method IN ('card', 'pix'));
