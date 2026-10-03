-- Migration for Sales PIN hardening
-- Enable pgcrypto (Supabase installs extensions in the 'extensions' schema)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Create tables
CREATE TABLE IF NOT EXISTS public.sales_pins (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    pin_hash TEXT NOT NULL,
    pin_epoch UUID NOT NULL DEFAULT gen_random_uuid(),
    failed_attempts INT NOT NULL DEFAULT 0,
    lockout_count INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pin_audit (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Revoke and RLS
ALTER TABLE public.sales_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pin_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.sales_pins FROM public, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.pin_audit FROM public, anon, authenticated;

-- (No policies are created. All access is via SECURITY DEFINER functions)

-- 3. Functions

-- Get PIN status
CREATE OR REPLACE FUNCTION public.sales_pin_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_has_pin BOOLEAN;
    v_pin_epoch UUID;
    v_locked_until TIMESTAMPTZ;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT TRUE, pin_epoch, locked_until
    INTO v_has_pin, v_pin_epoch, v_locked_until
    FROM public.sales_pins
    WHERE user_id = v_uid;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('has_pin', false, 'pin_epoch', null, 'locked_until', null);
    END IF;

    RETURN jsonb_build_object('has_pin', true, 'pin_epoch', v_pin_epoch, 'locked_until', v_locked_until);
END;
$$;
REVOKE ALL ON FUNCTION public.sales_pin_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sales_pin_status() TO authenticated;

-- Verify Sales PIN
CREATE OR REPLACE FUNCTION public.verify_sales_pin(submitted_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_rec public.sales_pins%ROWTYPE;
    v_lockout_durations INT[] := ARRAY[15, 60, 1440]; -- minutes: 15m, 1h, 24h
    v_lock_idx INT;
    v_duration INT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_rec
    FROM public.sales_pins
    WHERE user_id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    -- Check active lockout
    IF v_rec.locked_until IS NOT NULL AND v_rec.locked_until > NOW() THEN
        RETURN jsonb_build_object('status', 'locked', 'locked_until', v_rec.locked_until);
    END IF;

    -- Compare bcrypt hash using extensions.crypt
    IF v_rec.pin_hash = extensions.crypt(submitted_pin, v_rec.pin_hash) THEN
        -- Success: reset failed_attempts
        UPDATE public.sales_pins
        SET failed_attempts = 0,
            locked_until = NULL,
            updated_at = NOW()
        WHERE user_id = v_uid;

        INSERT INTO public.pin_audit (user_id, actor_id, event)
        VALUES (v_uid, v_uid, 'verify_success');

        RETURN jsonb_build_object('status', 'ok', 'pin_epoch', v_rec.pin_epoch);
    ELSE
        -- Failure: increment failed_attempts
        v_rec.failed_attempts := v_rec.failed_attempts + 1;

        IF v_rec.failed_attempts >= 5 THEN
            v_lock_idx := LEAST(v_rec.lockout_count + 1, 3);
            v_duration := v_lockout_durations[v_lock_idx];
            v_rec.lockout_count := v_rec.lockout_count + 1;
            v_rec.locked_until := NOW() + (v_duration || ' minutes')::INTERVAL;
            v_rec.failed_attempts := 0;

            UPDATE public.sales_pins
            SET failed_attempts = 0,
                lockout_count = v_rec.lockout_count,
                locked_until = v_rec.locked_until,
                updated_at = NOW()
            WHERE user_id = v_uid;

            INSERT INTO public.pin_audit (user_id, actor_id, event)
            VALUES (v_uid, v_uid, 'lockout');

            RETURN jsonb_build_object('status', 'locked', 'locked_until', v_rec.locked_until);
        ELSE
            UPDATE public.sales_pins
            SET failed_attempts = v_rec.failed_attempts,
                updated_at = NOW()
            WHERE user_id = v_uid;

            INSERT INTO public.pin_audit (user_id, actor_id, event)
            VALUES (v_uid, v_uid, 'verify_failure');

            RETURN jsonb_build_object('status', 'invalid', 'attempts_remaining', 5 - v_rec.failed_attempts);
        END IF;
    END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_sales_pin(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.verify_sales_pin(TEXT) TO authenticated;

-- Set Sales PIN initial
CREATE OR REPLACE FUNCTION public.set_sales_pin_initial(new_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT;
    v_exists BOOLEAN;
    v_new_epoch UUID;
    v_weak_pins TEXT[] := ARRAY['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', 
                                '1234', '2345', '3456', '4567', '5678', '6789', '4321', '3210', '9876', '8765', 
                                '7654', '6543', '5432', '1212', '1313', '1010', '6969', '2580', '0852',
                                '123456', '654321', '000000', '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999'];
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF new_pin IS NULL THEN
        RETURN jsonb_build_object('status', 'invalid_format');
    END IF;

    SELECT auth.jwt()->'app_metadata'->>'role' INTO v_role;
    IF v_role IS DISTINCT FROM 'sales' THEN
        RAISE EXCEPTION 'Only sales users can set a Sales PIN';
    END IF;

    IF new_pin !~ '^\d{4,6}$' THEN
        RETURN jsonb_build_object('status', 'invalid_format');
    END IF;

    IF new_pin = ANY(v_weak_pins) THEN
        RETURN jsonb_build_object('status', 'weak');
    END IF;

    SELECT EXISTS(SELECT 1 FROM public.sales_pins WHERE user_id = v_uid) INTO v_exists;
    IF v_exists THEN
        RETURN jsonb_build_object('status', 'already_set');
    END IF;

    v_new_epoch := gen_random_uuid();

    INSERT INTO public.sales_pins (user_id, pin_hash, pin_epoch)
    VALUES (v_uid, extensions.crypt(new_pin, extensions.gen_salt('bf', 10)), v_new_epoch);

    INSERT INTO public.pin_audit (user_id, actor_id, event)
    VALUES (v_uid, v_uid, 'initial_setup');

    RETURN jsonb_build_object('status', 'ok', 'pin_epoch', v_new_epoch);
END;
$$;
REVOKE ALL ON FUNCTION public.set_sales_pin_initial(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_sales_pin_initial(TEXT) TO authenticated;

-- Admin Reset Sales PIN
CREATE OR REPLACE FUNCTION public.admin_reset_sales_pin(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_uid UUID := auth.uid();
    v_role TEXT;
BEGIN
    IF v_admin_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT auth.jwt()->'app_metadata'->>'role' INTO v_role;
    IF v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    DELETE FROM public.sales_pins WHERE user_id = target_user_id;

    INSERT INTO public.pin_audit (user_id, actor_id, event)
    VALUES (target_user_id, v_admin_uid, 'admin_reset');

    RETURN jsonb_build_object('status', 'ok');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reset_sales_pin(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_sales_pin(UUID) TO authenticated;

-- Admin Unlock Sales PIN
CREATE OR REPLACE FUNCTION public.admin_unlock_sales_pin(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_uid UUID := auth.uid();
    v_role TEXT;
BEGIN
    IF v_admin_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT auth.jwt()->'app_metadata'->>'role' INTO v_role;
    IF v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    UPDATE public.sales_pins
    SET failed_attempts = 0,
        lockout_count = 0,
        locked_until = NULL,
        updated_at = NOW()
    WHERE user_id = target_user_id;

    INSERT INTO public.pin_audit (user_id, actor_id, event)
    VALUES (target_user_id, v_admin_uid, 'admin_unlock');

    RETURN jsonb_build_object('status', 'ok');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_unlock_sales_pin(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_unlock_sales_pin(UUID) TO authenticated;

-- Admin list sales PIN status
CREATE OR REPLACE FUNCTION public.admin_list_sales_pin_status()
RETURNS TABLE (
    user_id UUID,
    has_pin BOOLEAN,
    failed_attempts INT,
    lockout_count INT,
    locked_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_uid UUID := auth.uid();
    v_role TEXT;
BEGIN
    IF v_admin_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT auth.jwt()->'app_metadata'->>'role' INTO v_role;
    IF v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    RETURN QUERY
    SELECT 
        u.id AS user_id,
        (p.pin_hash IS NOT NULL) AS has_pin,
        COALESCE(p.failed_attempts, 0) AS failed_attempts,
        COALESCE(p.lockout_count, 0) AS lockout_count,
        p.locked_until,
        p.updated_at
    FROM auth.users u
    LEFT JOIN public.sales_pins p ON u.id = p.user_id
    WHERE (u.raw_app_meta_data->>'role') = 'sales';
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_sales_pin_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_sales_pin_status() TO authenticated;
