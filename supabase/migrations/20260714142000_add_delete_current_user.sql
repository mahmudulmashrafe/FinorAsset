-- Create security definer function to allow users to delete their own account
CREATE OR REPLACE FUNCTION public.delete_current_user()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- auth.uid() returns the ID of the user calling the RPC
  IF auth.uid() IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = auth.uid();
  ELSE
    RAISE EXCEPTION 'Not authenticated';
  END IF;
END;
$$;

-- Force reload Postgrest schema cache
NOTIFY pgrst, 'reload schema';
