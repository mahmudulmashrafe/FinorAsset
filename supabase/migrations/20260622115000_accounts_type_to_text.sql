-- Convert account type column from enum to text
-- This removes the enum restriction and lets any string be stored as account type.
-- Existing data is preserved automatically by Postgres.
ALTER TABLE public.accounts
  ALTER COLUMN type TYPE TEXT USING type::TEXT;

-- Drop the now-unused enum (optional but keeps the schema clean)
DROP TYPE IF EXISTS public.account_type;
