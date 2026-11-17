-- =============================================================================
-- EblaghYar Web Features v3 Migration (Analysis History & Usage Audit Logs)
-- File: supabase/web_features_v3.sql
-- Prerequisite: supabase/web_payments.sql, supabase/web_payments_v2.sql
-- Idempotent migration (safe to re-run)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.web_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    title TEXT,
    summary TEXT,
    authority TEXT,
    urgency TEXT CHECK (urgency IN ('high', 'medium', 'low')),
    analysis_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_analyses_user_created
    ON public.web_analyses(user_id, created_at DESC);

ALTER TABLE public.web_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own web analyses" ON public.web_analyses;
CREATE POLICY "Users can view own web analyses"
    ON public.web_analyses
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.web_analyses FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.web_analyses FROM authenticated;
GRANT SELECT ON TABLE public.web_analyses TO authenticated;
GRANT ALL ON TABLE public.web_analyses TO service_role;

-- Audit log for web AI calls, quota reserve/refund, payments, and recovery
CREATE TABLE IF NOT EXISTS public.web_usage_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    device_id TEXT,
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    access_mode TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_usage_logs_user_created
    ON public.web_usage_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_web_usage_logs_action_created
    ON public.web_usage_logs(action, created_at DESC);

ALTER TABLE public.web_usage_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.web_usage_logs FROM anon, authenticated;
GRANT ALL ON TABLE public.web_usage_logs TO service_role;
