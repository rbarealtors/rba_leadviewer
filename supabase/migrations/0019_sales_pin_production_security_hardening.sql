-- ============================================================================
-- Migration 0019: Sales PIN Production Security Hardening & Admin Reauth Proof
-- ============================================================================
-- Description:
-- 1. Creates `admin_reauth_grants` table for single-use, short-lived authorization
--    proofs issued strictly via service_role and validated inside PostgreSQL.
-- 2. Revokes direct privileges (TRUNCATE, REFERENCES, TRIGGER, direct DML) from
--    PUBLIC, anon, and authenticated roles on all sensitive PIN tables.
-- 3. Hardens `request_sales_pin_change()` with per-user transaction advisory locks
--    and partial unique index enforcement to eliminate concurrency races.
-- 4. Replaces unauthenticated `admin_approve_sales_pin_change(UUID)` with
--    `admin_approve_sales_pin_change(UUID, TEXT)` requiring cryptographic token proof.
-- 5. Hardens all PIN routines with SECURITY DEFINER and SET search_path = ''.
-- ============================================================================

-- Ensure pgcrypto extension is installed
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── 1. Create Tables, Columns & Constraints ─────────────────────────────────

-- Table: public.sales_pins
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

-- Table: public.pin_audit
CREATE TABLE IF NOT EXISTS public.pin_audit (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: public.sales_pin_change_requests
CREATE TABLE IF NOT EXISTS public.sales_pin_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'REQUESTED' 
        CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'EXPIRED', 'COMPLETED')),
    admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ
);

-- Schema drift protection: ensure all legacy and new columns exist regardless of previous migrations
ALTER TABLE public.sales_pin_change_requests ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.sales_pin_change_requests ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.sales_pin_change_requests ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.sales_pin_change_requests ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.sales_pin_change_requests ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE public.sales_pin_change_requests ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.sales_pin_change_requests ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Table: public.admin_reauth_grants
-- Purpose: Short-lived, single-use database authorization grants issued by backend
-- service-role after validating fresh administrator password authentication.
CREATE TABLE IF NOT EXISTS public.admin_reauth_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    request_id UUID NOT NULL REFERENCES public.sales_pin_change_requests(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Schema drift protection if admin_reauth_grants was partially created with target_request_id:
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'admin_reauth_grants' 
          AND column_name = 'target_request_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'admin_reauth_grants' 
          AND column_name = 'request_id'
    ) THEN
        ALTER TABLE public.admin_reauth_grants RENAME COLUMN target_request_id TO request_id;
    END IF;
END $$;

-- Clean up any pre-existing duplicate active requests by expiring all but the newest per user
WITH ranked_active AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
    FROM public.sales_pin_change_requests
    WHERE status IN ('REQUESTED', 'APPROVED')
)
UPDATE public.sales_pin_change_requests r
SET status = 'EXPIRED'
FROM ranked_active ra
WHERE r.id = ra.id AND ra.rn > 1;

-- Partial unique index enforcing maximum 1 active request per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_pin_request_per_user 
    ON public.sales_pin_change_requests(user_id) 
    WHERE status IN ('REQUESTED', 'APPROVED');

CREATE INDEX IF NOT EXISTS idx_pin_change_requests_status_created 
    ON public.sales_pin_change_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pin_change_requests_user_id 
    ON public.sales_pin_change_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_admin_reauth_grants_lookup 
    ON public.admin_reauth_grants(admin_id, request_id, purpose)
    WHERE consumed_at IS NULL;

-- ── 2. Strip Direct Privileges & Enable RLS ──────────────────────────────────

ALTER TABLE public.sales_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_pin_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_reauth_grants ENABLE ROW LEVEL SECURITY;

-- Revoke all direct privileges from PUBLIC, anon, and authenticated
-- (All table interaction must pass through audited SECURITY DEFINER functions)
REVOKE ALL PRIVILEGES ON TABLE public.sales_pins FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.pin_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.sales_pin_change_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.admin_reauth_grants FROM PUBLIC, anon, authenticated;

-- ── 3. Drop Legacy Overloads ────────────────────────────────────────────────

-- Drop legacy unauthenticated / single-argument approval function if exists
DROP FUNCTION IF EXISTS public.admin_approve_sales_pin_change(UUID);

-- Drop legacy signatures before recreation to prevent 42P13 parameter name conflicts
DROP FUNCTION IF EXISTS public.verify_sales_pin(TEXT);
DROP FUNCTION IF EXISTS public.set_sales_pin_initial(TEXT);
DROP FUNCTION IF EXISTS public.admin_reset_sales_pin(UUID);
DROP FUNCTION IF EXISTS public.admin_unlock_sales_pin(UUID);

-- ── 4. Hardened Security Definer RPC Functions ──────────────────────────────

-- 4.1 Service-Role Only Reauth Grant Creation
CREATE OR REPLACE FUNCTION public.create_admin_reauth_grant(
    target_admin_id UUID,
    target_request_id UUID,
    token_hash TEXT,
    grant_purpose TEXT DEFAULT 'approve_sales_pin_change'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_grant_id UUID;
BEGIN
    IF target_admin_id IS NULL OR target_request_id IS NULL OR token_hash IS NULL OR token_hash = '' THEN
        RETURN jsonb_build_object('status', 'invalid_params');
    END IF;

    IF grant_purpose IS DISTINCT FROM 'approve_sales_pin_change' THEN
        RETURN jsonb_build_object('status', 'invalid_purpose');
    END IF;

    INSERT INTO public.admin_reauth_grants (
        admin_id,
        request_id,
        purpose,
        token_hash,
        expires_at
    )
    VALUES (
        target_admin_id,
        target_request_id,
        grant_purpose,
        token_hash,
        NOW() + interval '2 minutes'
    )
    RETURNING id INTO v_grant_id;

    RETURN jsonb_build_object('status', 'ok', 'grant_id', v_grant_id);
END;
$$;
REVOKE ALL ON FUNCTION public.create_admin_reauth_grant(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_reauth_grant(UUID, UUID, TEXT, TEXT) TO service_role;

-- 4.2 Request Sales PIN Change (with Concurrency Advisory Lock)
CREATE OR REPLACE FUNCTION public.request_sales_pin_change()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT;
    v_active_row public.sales_pin_change_requests%ROWTYPE;
    v_new_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Concurrency isolation: Advisory lock scoped to the user within the transaction
    PERFORM pg_advisory_xact_lock(hashtext('sales_pin_req_' || v_uid::text));

    -- Verify user is a sales representative
    SELECT (raw_app_meta_data->>'role') INTO v_role
    FROM auth.users
    WHERE id = v_uid;

    IF v_role IS NULL OR v_role != 'sales' THEN
        RAISE EXCEPTION 'Only sales representatives can request a Sales PIN change';
    END IF;

    -- Check for existing active (REQUESTED or non-expired APPROVED) request
    SELECT * INTO v_active_row
    FROM public.sales_pin_change_requests
    WHERE user_id = v_uid AND status IN ('REQUESTED', 'APPROVED')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        -- If it was APPROVED but has passed expiration, mark it EXPIRED
        IF v_active_row.status = 'APPROVED' AND v_active_row.expires_at <= NOW() THEN
            UPDATE public.sales_pin_change_requests
            SET status = 'EXPIRED'
            WHERE id = v_active_row.id;
        ELSE
            RETURN jsonb_build_object(
                'status', 'already_active',
                'request_id', v_active_row.id,
                'request_status', v_active_row.status,
                'created_at', v_active_row.created_at,
                'expires_at', v_active_row.expires_at
            );
        END IF;
    END IF;

    -- Create new request with catch for concurrent unique violation
    BEGIN
        INSERT INTO public.sales_pin_change_requests (user_id, status)
        VALUES (v_uid, 'REQUESTED')
        RETURNING id INTO v_new_id;
    EXCEPTION WHEN unique_violation THEN
        SELECT * INTO v_active_row
        FROM public.sales_pin_change_requests
        WHERE user_id = v_uid AND status IN ('REQUESTED', 'APPROVED')
        ORDER BY created_at DESC
        LIMIT 1;

        RETURN jsonb_build_object(
            'status', 'already_active',
            'request_id', v_active_row.id,
            'request_status', v_active_row.status,
            'created_at', v_active_row.created_at,
            'expires_at', v_active_row.expires_at
        );
    END;

    -- Audit log
    INSERT INTO public.pin_audit (user_id, actor_id, event)
    VALUES (v_uid, v_uid, 'request_created');

    RETURN jsonb_build_object(
        'status', 'ok',
        'request_id', v_new_id
    );
END;
$$;
REVOKE ALL ON FUNCTION public.request_sales_pin_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_sales_pin_change() TO authenticated;

-- 4.3 Admin Approve Sales PIN Change (requires verified reauth token & strict request binding)
CREATE OR REPLACE FUNCTION public.admin_approve_sales_pin_change(
    target_request_id UUID,
    reauth_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_uid UUID := auth.uid();
    v_role TEXT;
    v_target_request_id UUID := target_request_id;
    v_req public.sales_pin_change_requests%ROWTYPE;
    v_expires_at TIMESTAMPTZ;
    v_grant public.admin_reauth_grants%ROWTYPE;
    v_computed_hash TEXT;
BEGIN
    IF v_admin_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Verify caller has admin role
    SELECT (raw_app_meta_data->>'role') INTO v_role
    FROM auth.users
    WHERE id = v_admin_uid;

    IF v_role IS NULL OR v_role != 'admin' THEN
        RAISE EXCEPTION 'Only administrators can approve PIN change requests';
    END IF;

    IF reauth_token IS NULL OR length(reauth_token) < 32 THEN
        RETURN jsonb_build_object('status', 'reauth_required');
    END IF;

    -- Fetch target request with row lock
    SELECT * INTO v_req
    FROM public.sales_pin_change_requests r
    WHERE r.id = v_target_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    -- Admins cannot approve their own PIN change requests
    IF v_req.user_id = v_admin_uid THEN
        RETURN jsonb_build_object('status', 'cannot_approve_own');
    END IF;

    IF v_req.status != 'REQUESTED' THEN
        RETURN jsonb_build_object('status', 'invalid_state');
    END IF;

    -- Compute SHA-256 hash of the provided reauth_token
    v_computed_hash := encode(extensions.digest(reauth_token, 'sha256'), 'hex');

    -- Validate and lock the reauth grant using unambiguous table aliases and qualified columns
    SELECT * INTO v_grant
    FROM public.admin_reauth_grants g
    WHERE g.admin_id = v_admin_uid
      AND g.request_id = v_target_request_id
      AND g.purpose = 'approve_sales_pin_change'
      AND g.token_hash = v_computed_hash
      AND g.consumed_at IS NULL
      AND g.expires_at > NOW()
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'invalid_grant');
    END IF;

    -- Atomically mark grant consumed (single-use enforcement)
    UPDATE public.admin_reauth_grants g
    SET consumed_at = NOW()
    WHERE g.id = v_grant.id;

    -- Set approval expiration to 15 minutes
    v_expires_at := NOW() + interval '15 minutes';

    -- Update request status and admin identifiers
    UPDATE public.sales_pin_change_requests r
    SET status = 'APPROVED',
        admin_id = v_admin_uid,
        approved_by = v_admin_uid,
        approved_at = NOW(),
        expires_at = v_expires_at
    WHERE r.id = v_target_request_id;

    -- Audit log
    INSERT INTO public.pin_audit (user_id, actor_id, event)
    VALUES (v_req.user_id, v_admin_uid, 'request_approved');

    RETURN jsonb_build_object(
        'status', 'ok',
        'request_id', v_target_request_id,
        'expires_at', v_expires_at
    );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_approve_sales_pin_change(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_sales_pin_change(UUID, TEXT) TO authenticated;

-- 4.4 Admin Reject Sales PIN Change
CREATE OR REPLACE FUNCTION public.admin_reject_sales_pin_change(target_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_uid UUID := auth.uid();
    v_role TEXT;
    v_req public.sales_pin_change_requests%ROWTYPE;
BEGIN
    IF v_admin_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT (raw_app_meta_data->>'role') INTO v_role
    FROM auth.users
    WHERE id = v_admin_uid;

    IF v_role IS NULL OR v_role != 'admin' THEN
        RAISE EXCEPTION 'Only administrators can reject PIN change requests';
    END IF;

    UPDATE public.sales_pin_change_requests r
    SET status = 'REJECTED',
        rejected_at = NOW(),
        rejected_by = v_admin_uid
    WHERE r.id = target_request_id AND r.status = 'REQUESTED'
    RETURNING * INTO v_req;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'invalid_state');
    END IF;

    INSERT INTO public.pin_audit (user_id, actor_id, event)
    VALUES (v_req.user_id, v_admin_uid, 'request_rejected');

    RETURN jsonb_build_object('status', 'ok');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reject_sales_pin_change(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_sales_pin_change(UUID) TO authenticated;

-- 4.5 User Completes PIN Change
CREATE OR REPLACE FUNCTION public.complete_sales_pin_change(target_request_id UUID, new_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_req public.sales_pin_change_requests%ROWTYPE;
    v_new_epoch UUID;
    v_weak_pins TEXT[] := ARRAY['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', 
                                '1234', '2345', '3456', '4567', '5678', '6789', '4321', '3210', '9876', '8765', 
                                '7654', '6543', '5432', '1212', '1313', '1010', '6969', '2580', '0852',
                                '123456', '654321', '000000', '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999'];
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF new_pin IS NULL OR new_pin !~ '^\d{4,6}$' THEN
        RETURN jsonb_build_object('status', 'invalid_format');
    END IF;

    IF new_pin = ANY(v_weak_pins) THEN
        RETURN jsonb_build_object('status', 'weak');
    END IF;

    SELECT * INTO v_req
    FROM public.sales_pin_change_requests r
    WHERE r.id = target_request_id AND r.user_id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_req.status != 'APPROVED' THEN
        RETURN jsonb_build_object('status', 'not_approved');
    END IF;

    IF v_req.expires_at <= NOW() THEN
        UPDATE public.sales_pin_change_requests r
        SET status = 'EXPIRED'
        WHERE r.id = target_request_id;

        RETURN jsonb_build_object('status', 'expired');
    END IF;

    v_new_epoch := gen_random_uuid();

    INSERT INTO public.sales_pins (user_id, pin_hash, pin_epoch, failed_attempts, lockout_count, locked_until, updated_at)
    VALUES (v_uid, extensions.crypt(new_pin, extensions.gen_salt('bf', 10)), v_new_epoch, 0, 0, NULL, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf', 10)),
        pin_epoch = v_new_epoch,
        failed_attempts = 0,
        lockout_count = 0,
        locked_until = NULL,
        updated_at = NOW();

    UPDATE public.sales_pin_change_requests r
    SET status = 'COMPLETED',
        completed_at = NOW()
    WHERE r.id = target_request_id;

    INSERT INTO public.pin_audit (user_id, actor_id, event)
    VALUES (v_uid, v_uid, 'pin_changed');

    RETURN jsonb_build_object(
        'status', 'ok',
        'pin_epoch', v_new_epoch
    );
END;
$$;
REVOKE ALL ON FUNCTION public.complete_sales_pin_change(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_sales_pin_change(UUID, TEXT) TO authenticated;

-- 4.6 Get Active PIN Change Request Status for Current Sales User
CREATE OR REPLACE FUNCTION public.get_my_pin_change_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_req public.sales_pin_change_requests%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_req
    FROM public.sales_pin_change_requests r
    WHERE r.user_id = v_uid
    ORDER BY r.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('has_request', false);
    END IF;

    IF v_req.status = 'APPROVED' AND v_req.expires_at <= NOW() THEN
        UPDATE public.sales_pin_change_requests r
        SET status = 'EXPIRED'
        WHERE r.id = v_req.id;
        v_req.status := 'EXPIRED';
    END IF;

    RETURN jsonb_build_object(
        'has_request', true,
        'id', v_req.id,
        'status', v_req.status,
        'created_at', v_req.created_at,
        'approved_at', v_req.approved_at,
        'expires_at', v_req.expires_at
    );
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_pin_change_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pin_change_status() TO authenticated;

-- 4.7 Admin List Pending PIN Change Requests
CREATE OR REPLACE FUNCTION public.admin_list_pin_change_requests()
RETURNS TABLE (
    id UUID,
    user_id UUID,
    email TEXT,
    full_name TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
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

    SELECT (raw_app_meta_data->>'role') INTO v_role
    FROM auth.users
    WHERE id = v_admin_uid;

    IF v_role IS NULL OR v_role != 'admin' THEN
        RAISE EXCEPTION 'Only administrators can list PIN change requests';
    END IF;

    RETURN QUERY
    SELECT 
        r.id,
        r.user_id,
        au.email::TEXT,
        COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', au.email)::TEXT AS full_name,
        CASE 
            WHEN r.status = 'APPROVED' AND r.expires_at <= NOW() THEN 'EXPIRED'
            ELSE r.status
        END AS status,
        r.created_at,
        r.approved_at,
        r.expires_at
    FROM public.sales_pin_change_requests r
    JOIN auth.users au ON r.user_id = au.id
    ORDER BY 
        CASE WHEN r.status = 'REQUESTED' THEN 1 ELSE 2 END,
        r.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_pin_change_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pin_change_requests() TO authenticated;

-- 4.8 Sales PIN Status
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

    SELECT TRUE, p.pin_epoch, p.locked_until
    INTO v_has_pin, v_pin_epoch, v_locked_until
    FROM public.sales_pins p
    WHERE p.user_id = v_uid;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('has_pin', false, 'pin_epoch', null, 'locked_until', null);
    END IF;

    RETURN jsonb_build_object('has_pin', true, 'pin_epoch', v_pin_epoch, 'locked_until', v_locked_until);
END;
$$;
REVOKE ALL ON FUNCTION public.sales_pin_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_pin_status() TO authenticated;

-- 4.9 Verify Sales PIN
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
    FROM public.sales_pins p
    WHERE p.user_id = v_uid
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
        UPDATE public.sales_pins
        SET failed_attempts = 0,
            locked_until = NULL,
            updated_at = NOW()
        WHERE user_id = v_uid;

        INSERT INTO public.pin_audit (user_id, actor_id, event)
        VALUES (v_uid, v_uid, 'verify_success');

        RETURN jsonb_build_object('status', 'ok', 'pin_epoch', v_rec.pin_epoch);
    ELSE
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
REVOKE ALL ON FUNCTION public.verify_sales_pin(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_sales_pin(TEXT) TO authenticated;

-- 4.10 Initial Setup Sales PIN
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

    IF new_pin IS NULL OR new_pin !~ '^\d{4,6}$' THEN
        RETURN jsonb_build_object('status', 'invalid_format');
    END IF;

    SELECT (raw_app_meta_data->>'role') INTO v_role
    FROM auth.users
    WHERE id = v_uid;

    IF v_role IS NULL OR v_role != 'sales' THEN
        RAISE EXCEPTION 'Only sales representatives can set a Sales PIN';
    END IF;

    IF new_pin = ANY(v_weak_pins) THEN
        RETURN jsonb_build_object('status', 'weak');
    END IF;

    SELECT EXISTS(SELECT 1 FROM public.sales_pins p WHERE p.user_id = v_uid) INTO v_exists;
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
REVOKE ALL ON FUNCTION public.set_sales_pin_initial(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_sales_pin_initial(TEXT) TO authenticated;

-- 4.11 Admin Reset Sales PIN
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

    SELECT (raw_app_meta_data->>'role') INTO v_role
    FROM auth.users
    WHERE id = v_admin_uid;

    IF v_role IS NULL OR v_role != 'admin' THEN
        RAISE EXCEPTION 'Only administrators can reset a Sales PIN';
    END IF;

    DELETE FROM public.sales_pins p WHERE p.user_id = target_user_id;

    INSERT INTO public.pin_audit (user_id, actor_id, event)
    VALUES (target_user_id, v_admin_uid, 'admin_reset');

    RETURN jsonb_build_object('status', 'ok');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reset_sales_pin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_sales_pin(UUID) TO authenticated;

-- 4.12 Admin Unlock Sales PIN
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

    SELECT (raw_app_meta_data->>'role') INTO v_role
    FROM auth.users
    WHERE id = v_admin_uid;

    IF v_role IS NULL OR v_role != 'admin' THEN
        RAISE EXCEPTION 'Only administrators can unlock a Sales PIN';
    END IF;

    UPDATE public.sales_pins p
    SET failed_attempts = 0,
        lockout_count = 0,
        locked_until = NULL,
        updated_at = NOW()
    WHERE p.user_id = target_user_id;

    INSERT INTO public.pin_audit (user_id, actor_id, event)
    VALUES (target_user_id, v_admin_uid, 'admin_unlock');

    RETURN jsonb_build_object('status', 'ok');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_unlock_sales_pin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unlock_sales_pin(UUID) TO authenticated;

-- 4.13 Admin List Sales PIN Status
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

    SELECT (raw_app_meta_data->>'role') INTO v_role
    FROM auth.users
    WHERE id = v_admin_uid;

    IF v_role IS NULL OR v_role != 'admin' THEN
        RAISE EXCEPTION 'Only administrators can list PIN statuses';
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
REVOKE ALL ON FUNCTION public.admin_list_sales_pin_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_sales_pin_status() TO authenticated;
