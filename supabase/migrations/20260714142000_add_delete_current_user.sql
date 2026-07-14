-- Create security definer function that returns text for diagnostic exception handling
CREATE OR REPLACE FUNCTION public.delete_current_user()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN 'Not authenticated';
  END IF;

  BEGIN
    DELETE FROM auth.users WHERE id = v_user_id;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLERRM;
  END;
END;
$$;

-- Force reload Postgrest schema cache
NOTIFY pgrst, 'reload schema';
