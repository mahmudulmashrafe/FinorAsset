-- Create warranties table
CREATE TABLE IF NOT EXISTS public.warranties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  purchase_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  note TEXT,
  image_url TEXT, -- Receipt image
  product_image_url TEXT, -- Product picture
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranties TO authenticated;
GRANT ALL ON public.warranties TO service_role;

-- Drop policies on warranties if they exist (to avoid duplication errors)
DROP POLICY IF EXISTS "own warranties" ON public.warranties;

-- RLS policies for warranties
CREATE POLICY "own warranties" ON public.warranties 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Create warranties storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('warranties', 'warranties', true)
ON CONFLICT (id) DO NOTHING;

-- Drop policies on storage objects if they exist
DROP POLICY IF EXISTS "Allow authenticated upload to warranties" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read from warranties" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete own objects from warranties" ON storage.objects;

-- Storage policies for bucket
CREATE POLICY "Allow authenticated upload to warranties" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'warranties');

CREATE POLICY "Allow public read from warranties" ON storage.objects
  FOR SELECT USING (bucket_id = 'warranties');

CREATE POLICY "Allow users to delete own objects from warranties" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'warranties' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Force reload schema cache
NOTIFY pgrst, 'reload schema';
