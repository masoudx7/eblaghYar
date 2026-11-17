-- =============================================================================
-- EblaghYar Android / Legacy Payment Hardening Migration
-- File: supabase/android_purchases.sql
-- Purpose:
--   1) Prevent replay attacks on Poolakey / Bazaar / Myket purchase tokens
--   2) Persist legacy Zarinpal orders cleanly without in-memory mocks
-- Idempotent migration (safe to re-run)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.consumed_purchase_tokens (
    purchase_token TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    store TEXT NOT NULL DEFAULT 'bazaar',
    order_id TEXT,
    developer_payload TEXT,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consumed_purchase_device
    ON public.consumed_purchase_tokens(device_id, consumed_at DESC);

ALTER TABLE public.consumed_purchase_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.consumed_purchase_tokens FROM anon, authenticated;
GRANT ALL ON TABLE public.consumed_purchase_tokens TO service_role;

CREATE TABLE IF NOT EXISTS public.legacy_zarinpal_orders (
    authority TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    product_type TEXT NOT NULL CHECK (product_type IN ('coins_5', 'coins_15', 'premium')),
    amount_rials BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
    ref_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_legacy_zarinpal_device
    ON public.legacy_zarinpal_orders(device_id, created_at DESC);

ALTER TABLE public.legacy_zarinpal_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.legacy_zarinpal_orders FROM anon, authenticated;
GRANT ALL ON TABLE public.legacy_zarinpal_orders TO service_role;
