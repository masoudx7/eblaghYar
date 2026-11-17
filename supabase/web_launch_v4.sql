-- =============================================================================
-- EblaghYar Web Launch Readiness v4 Migration
-- File: supabase/web_launch_v4.sql
-- Prerequisite:
--   1) supabase/web_payments.sql
--   2) supabase/web_payments_v2.sql
--   3) supabase/web_features_v3.sql
-- Idempotent migration (safe to re-run)
-- =============================================================================

-- 1) Claim marker on single-use payment tokens so late refunds never void newer claims
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS entitlement_claim_id UUID;

-- 2) Atomic annual subscription extension RPC (safe for concurrent purchases)
CREATE OR REPLACE FUNCTION public.extend_profile_annual(p_user_id UUID, p_duration_days INT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_expires TIMESTAMPTZ;
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (p_user_id)
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.profiles
    SET annual_expires_at = GREATEST(COALESCE(annual_expires_at, NOW()), NOW())
                            + make_interval(days => GREATEST(1, p_duration_days))
    WHERE id = p_user_id
    RETURNING annual_expires_at INTO new_expires;

    RETURN new_expires;
END;
$$;

REVOKE ALL ON FUNCTION public.extend_profile_annual(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_profile_annual(UUID, INT) TO service_role;

-- 3) Request-level Idempotency store for POST /api/web/analyze
CREATE TABLE IF NOT EXISTS public.web_analyze_idempotency (
    idempotency_key UUID PRIMARY KEY,
    owner_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
    response_status INT,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_web_analyze_idempotency_expires
    ON public.web_analyze_idempotency(expires_at);

ALTER TABLE public.web_analyze_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.web_analyze_idempotency FROM anon, authenticated;
GRANT ALL ON TABLE public.web_analyze_idempotency TO service_role;

-- 4) Index to speed up 24h AI-tools pass & stale reserve reconciliation queries
CREATE INDEX IF NOT EXISTS idx_web_usage_logs_device_action_created
    ON public.web_usage_logs(device_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_web_analyses_created_at
    ON public.web_analyses(created_at);
