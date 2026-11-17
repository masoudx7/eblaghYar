-- =============================================================================
-- EblaghYar Web Payments v2 Migration (Idempotent Grant & Recovery Support)
-- File: supabase/web_payments_v2.sql
-- Prerequisite: supabase/web_payments.sql
-- Idempotent migration (safe to re-run)
-- =============================================================================

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS granted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payments_status_granted_at
    ON public.payments(status, granted_at);

-- Backfill granted_at on already-paid v1 rows so historical orders are never double-granted
UPDATE public.payments
SET granted_at = COALESCE(paid_at, created_at, NOW())
WHERE status = 'paid'
  AND granted_at IS NULL;
