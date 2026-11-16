-- =============================================================================
-- EblaghYar Web Payments & Auth Profiles Migration
-- File: supabase/web_payments.sql
-- Idempotent migration (safe to re-run without touching existing devices/usage_logs)
-- =============================================================================

-- Enable pgcrypto if needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) Table: public.profiles
-- Linked 1-to-1 with auth.users; credits and quotas are managed only by backend.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    credits INT NOT NULL DEFAULT 0,
    annual_expires_at TIMESTAMPTZ,
    daily_analyses_count INT NOT NULL DEFAULT 0,
    last_analysis_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Trigger function: automatically create a profile row when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name')
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2) Table: public.payments
-- Tracks Zarinpal web payment sessions and single-use entitlement tokens.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authority TEXT UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    device_id TEXT,
    product TEXT NOT NULL CHECK (product IN ('single', 'pack_10', 'annual')),
    amount_rials BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
    ref_id TEXT,
    entitlement_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    entitlement_used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_device_id ON public.payments(device_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- -----------------------------------------------------------------------------
-- 3) Row Level Security (RLS) & Privileges
-- - profiles: authenticated users can only SELECT their own row.
--             All writes (including credits) are restricted to backend (service_role).
-- - payments: accessible ONLY via service_role (zero client access).
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Ensure clients cannot insert/update/delete profiles (especially credits) directly
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

-- Ensure payments has zero client access (service_role only)
REVOKE ALL ON TABLE public.payments FROM anon, authenticated;
GRANT ALL ON TABLE public.payments TO service_role;

-- Atomic credit increment helper (executable ONLY by service_role)
CREATE OR REPLACE FUNCTION public.increment_profile_credits(p_user_id UUID, p_delta INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_credits INT;
BEGIN
    UPDATE public.profiles
    SET credits = GREATEST(0, COALESCE(credits, 0) + p_delta)
    WHERE id = p_user_id
    RETURNING credits INTO new_credits;

    RETURN new_credits;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_profile_credits(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_profile_credits(UUID, INT) TO service_role;

