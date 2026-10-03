-- Migration 0018: Admin-Approved Sales PIN Change
-- ======================================================================
-- Enables sales users to request a PIN change, requiring admin approval
-- with admin account password verification before the user can set a new PIN.
-- ======================================================================

CREATE TABLE IF NOT EXISTS public.sales_pin_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'REQUESTED' 
        CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'EXPIRED', 'COMPLETED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

-- Enforce maximum of ONE active request (REQUESTED or APPROVED) per user at the database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_pin_request_per_user 
    ON public.sales_pin_change_requests(user_id) 
    WHERE status IN ('REQUESTED', 'APPROVED');

CREATE INDEX IF NOT EXISTS idx_pin_change_requests_status_created 
    ON public.sales_pin_change_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pin_change_requests_user_id 
    ON public.sales_pin_change_requests(user_id);

-- Enable RLS
ALTER TABLE public.sales_pin_change_requests ENABLE ROW LEVEL SECURITY;

-- Revoke direct mutations from PostgREST to prevent forging APPROVED status or tampering with timestamps
REVOKE INSERT, UPDATE, DELETE ON public.sales_pin_change_requests FROM anon, authenticated;
GRANT SELECT ON public.sales_pin_change_requests TO authenticated;

-- Sales users can view their own requests
CREATE POLICY "Users can view their own pin change requests"
    ON public.sales_pin_change_requests
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Admins can view all requests
CREATE POLICY "Admins can view all pin change requests"
    ON public.sales_pin_change_requests
    FOR SELECT
    TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ── Functions ──────────────────────────────────────────────────────────────

-- 1. Create a PIN change request
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

    SELECT auth.jwt()->'app_metadata'->>'role' INTO v_role;
    IF v_role IS DISTINCT FROM 'sales' THEN
        RAISE EXCEPTION 'Only sales representatives can request a Sales PIN change';
    END IF;

    -- Check if an active request already exists
    SELECT * INTO v_active_row
    FROM public.sales_pin_change_requests
    WHERE user_id = v_uid AND status IN ('REQUESTED', 'APPROVED')
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

    -- Create new request
    INSERT INTO public.sales_pin_change_requests (user_id, status)
    VALUES (v_uid, 'REQUESTED')
    RETURNING id INTO v_new_id;

    -- Audit log
    INSERT INTO public.pin_audit (user_id, actor_id, event)
    VALUES (v_uid, v_uid, 'request_created');

    RETURN jsonb_build_object(
        'status', 'ok',
        'request_id', v_new_id
    );
END;
$$;
REVOKE ALL ON FUNCTION public.request_sales_pin_change() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_sales_pin_change() TO authenticated;

-- 2. Admin approves PIN change request
CREATE OR REPLACE FUNCTION public.admin_approve_sales_pin_change(target_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_uid UUID := auth.uid();
    v_role TEXT;
    v_req public.sales_pin_change_requests%ROWTYPE;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF v_admin_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT auth.jwt()->'app_metadata'->>'role' INTO v_role;
    IF v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    SELECT * INTO v_req
    FROM public.sales_pin_change_requests
    WHERE id = target_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_req.status != 'REQUESTED' THEN
        RETURN jsonb_build_object('status', 'invalid_state');
    END IF;

    IF v_req.user_id = v_admin_uid THEN
        RETURN jsonb_build_object('status', 'cannot_approve_own');
    END IF;

    v_expires_at := NOW() + interval '15 minutes';

    -- Atomic transition: only transition if status is currently REQUESTED
    UPDATE public.sales_pin_change_requests
    SET status = 'APPROVED',
        approved_at = NOW(),
        approved_by = v_admin_uid,
        expires_at = v_expires_at
    WHERE id = target_request_id AND status = 'REQUESTED'
    RETURNING * INTO v_req;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'invalid_state');
    END IF;

    -- Audit log
    INSERT INTO public.pin_audit (user_id, actor_id, event)
    VALUES (v_req.user_id, v_admin_uid, 'request_approved');

    RETURN jsonb_build_object(
        'status', 'ok',
        'request_id', v_req.id,
        'expires_at', v_req.expires_at
    );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_approve_sales_pin_change(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_sales_pin_change(UUID) TO authenticated;

-- 3. Admin rejects PIN change request
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

    SELECT auth.jwt()->'app_metadata'->>'role' INTO v_role;
    IF v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    -- Atomic transition: only transition if status is currently REQUESTED
    UPDATE public.sales_pin_change_requests
    SET status = 'REJECTED',
        rejected_at = NOW(),
        rejected_by = v_admin_uid
    WHERE id = target_request_id AND status = 'REQUESTED'
    RETURNING * INTO v_req;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'invalid_state');
    END IF;

    -- Audit log
    INSERT INTO public.pin_audit (user_id, actor_id, event)
    VALUES (v_req.user_id, v_admin_uid, 'request_rejected');

    RETURN jsonb_build_object('status', 'ok');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reject_sales_pin_change(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_sales_pin_change(UUID) TO authenticated;

-- 4. User completes PIN change with an approved request
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

    -- Fetch and lock request
    SELECT * INTO v_req
    FROM public.sales_pin_change_requests
    WHERE id = target_request_id AND user_id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF v_req.status != 'APPROVED' THEN
        RETURN jsonb_build_object('status', 'not_approved');
    END IF;

    IF v_req.expires_at <= NOW() THEN
        UPDATE public.sales_pin_change_requests
        SET status = 'EXPIRED'
        WHERE id = target_request_id;

        RETURN jsonb_build_object('status', 'expired');
    END IF;

    -- Generate fresh epoch
    v_new_epoch := gen_random_uuid();

    -- Update sales_pins table with new hash, reset locks and attempts
    INSERT INTO public.sales_pins (user_id, pin_hash, pin_epoch, failed_attempts, lockout_count, locked_until, updated_at)
    VALUES (v_uid, extensions.crypt(new_pin, extensions.gen_salt('bf', 10)), v_new_epoch, 0, 0, NULL, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf', 10)),
        pin_epoch = v_new_epoch,
        failed_attempts = 0,
        lockout_count = 0,
        locked_until = NULL,
        updated_at = NOW();

    -- Mark request COMPLETED
    UPDATE public.sales_pin_change_requests
    SET status = 'COMPLETED',
        completed_at = NOW()
    WHERE id = target_request_id;

    -- Audit log
    INSERT INTO public.pin_audit (user_id, actor_id, event)
    VALUES (v_uid, v_uid, 'pin_changed');

    RETURN jsonb_build_object(
        'status', 'ok',
        'pin_epoch', v_new_epoch
    );
END;
$$;
REVOKE ALL ON FUNCTION public.complete_sales_pin_change(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_sales_pin_change(UUID, TEXT) TO authenticated;

-- 5. Admin list pending PIN change requests
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

    SELECT auth.jwt()->'app_metadata'->>'role' INTO v_role;
    IF v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Admin access required';
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
REVOKE ALL ON FUNCTION public.admin_list_pin_change_requests() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pin_change_requests() TO authenticated;

-- 6. Get active PIN change request status for the calling sales user
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
    FROM public.sales_pin_change_requests
    WHERE user_id = v_uid
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('has_request', false);
    END IF;

    IF v_req.status = 'APPROVED' AND v_req.expires_at <= NOW() THEN
        UPDATE public.sales_pin_change_requests
        SET status = 'EXPIRED'
        WHERE id = v_req.id;
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
REVOKE ALL ON FUNCTION public.get_my_pin_change_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pin_change_status() TO authenticated;
