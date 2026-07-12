-- Add 'mobile_banking' to the account_type enum
ALTER TYPE public.account_type ADD VALUE IF NOT EXISTS 'mobile_banking';
