-- 1. Add 'loan' to public.txn_kind ENUM
ALTER TYPE public.txn_kind ADD VALUE IF NOT EXISTS 'loan';

-- 2. Clean up previous categories
DELETE FROM public.categories WHERE name IN ('Loan Inflow', 'Loan Outflow');

-- 3. Retroactively create Borrow and Lent categories (kind: 'loan') for all existing profiles
INSERT INTO public.categories (user_id, name, kind, color, icon)
SELECT p.id, 'Borrow', 'loan', '#8B5CF6', 'CircleDollarSign'
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c 
  WHERE c.user_id = p.id AND c.name = 'Borrow' AND c.kind = 'loan'
);

INSERT INTO public.categories (user_id, name, kind, color, icon)
SELECT p.id, 'Lent', 'loan', '#EC4899', 'CircleDollarSign'
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c 
  WHERE c.user_id = p.id AND c.name = 'Lent' AND c.kind = 'loan'
);

-- 4. Update default categories function for future signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));

  INSERT INTO public.accounts (user_id, name, type, color)
    VALUES (NEW.id, 'Cash', 'cash', '#D97706');

  INSERT INTO public.categories (user_id, name, kind, color, icon) VALUES
    (NEW.id, 'Salary',        'income',  '#3F6B4A', 'Briefcase'),
    (NEW.id, 'Freelance',     'income',  '#7C8C5C', 'Laptop'),
    (NEW.id, 'Borrow',        'loan',    '#8B5CF6', 'CircleDollarSign'),
    (NEW.id, 'Lent',          'loan',    '#EC4899', 'CircleDollarSign'),
    (NEW.id, 'Groceries',     'expense', '#D97706', 'ShoppingCart'),
    (NEW.id, 'Dining',        'expense', '#B45309', 'Utensils'),
    (NEW.id, 'Transport',     'expense', '#92400E', 'Car'),
    (NEW.id, 'Rent',          'expense', '#7C2D12', 'Home'),
    (NEW.id, 'Utilities',     'expense', '#A16207', 'Plug'),
    (NEW.id, 'Entertainment', 'expense', '#9A3412', 'Film'),
    (NEW.id, 'Health',        'expense', '#65A30D', 'Heart'),
    (NEW.id, 'Shopping',      'expense', '#C2410C', 'ShoppingBag');
  RETURN NEW;
END $$;
