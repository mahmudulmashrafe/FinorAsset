-- Add image_url column to categories table for custom images
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Force reload schema cache
NOTIFY pgrst, 'reload schema';
