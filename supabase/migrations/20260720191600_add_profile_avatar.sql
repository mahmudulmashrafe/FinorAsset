-- Add avatar_url column to profiles table for custom profile pictures
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Force reload schema cache
NOTIFY pgrst, 'reload schema';
