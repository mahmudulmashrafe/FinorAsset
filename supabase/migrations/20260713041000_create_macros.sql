-- Create macros table for automation rules
CREATE TABLE IF NOT EXISTS public.macros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.macros ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.macros TO authenticated;
GRANT ALL ON public.macros TO service_role;

-- RLS policies
CREATE POLICY "own macros" ON public.macros 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER trg_macros_updated BEFORE UPDATE ON public.macros
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
