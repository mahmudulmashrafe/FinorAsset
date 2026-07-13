-- Add account_id reference to loans table
ALTER TABLE public.loans 
ADD COLUMN account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
