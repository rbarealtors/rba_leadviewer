-- Data Migration for Sales PINs
-- This script migrates existing PINs from auth.users.raw_user_meta_data->'pin_code' to public.sales_pins
-- skipping weak PINs.

DO $$
DECLARE
    v_weak_pins TEXT[] := ARRAY['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', 
                                '1234', '2345', '3456', '4567', '5678', '6789', '4321', '3210', '9876', '8765', 
                                '7654', '6543', '5432', '1212', '1313', '1010', '6969', '2580', '0852',
                                '123456', '654321', '000000', '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999'];
    r RECORD;
    v_pin TEXT;
BEGIN
    FOR r IN (
        SELECT id, raw_user_meta_data->>'pin_code' AS pin_code
        FROM auth.users
        WHERE raw_user_meta_data ? 'pin_code'
    ) LOOP
        v_pin := r.pin_code;
        
        -- Migrate only if valid length and not weak
        IF v_pin IS NOT NULL AND v_pin ~ '^\d{4,6}$' AND NOT (v_pin = ANY(v_weak_pins)) THEN
            INSERT INTO public.sales_pins (user_id, pin_hash, pin_epoch)
            VALUES (r.id, extensions.crypt(v_pin, extensions.gen_salt('bf', 10)), gen_random_uuid())
            ON CONFLICT (user_id) DO NOTHING;
        END IF;

        -- Remove pin_code from metadata
        UPDATE auth.users
        SET raw_user_meta_data = raw_user_meta_data - 'pin_code'
        WHERE id = r.id;
    END LOOP;
END;
$$;
