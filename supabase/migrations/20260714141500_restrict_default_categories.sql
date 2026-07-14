-- 1. Fix existing categories that have string names instead of emojis
UPDATE public.categories SET icon = '💼' WHERE icon = 'Briefcase';
UPDATE public.categories SET icon = '💰' WHERE name = 'Borrow' AND (icon = 'CircleDollarSign' OR icon = 'CircleDollar');
UPDATE public.categories SET icon = '💸' WHERE name = 'Lent' AND (icon = 'CircleDollarSign' OR icon = 'CircleDollar');

-- 2. Update handle_new_user default setup for future signups to use actual emojis
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));

  INSERT INTO public.accounts (user_id, name, type, color)
    VALUES (NEW.id, 'Cash', 'cash', '#D97706');

  INSERT INTO public.categories (user_id, name, kind, color, icon) VALUES
    (NEW.id, 'Salary',        'income',  '#3F6B4A', '💼'),
    (NEW.id, 'Borrow',        'income',  '#8B5CF6', '💰'),
    (NEW.id, 'Lent',          'expense', '#EC4899', '💸');
  RETURN NEW;
END $$;

-- Force reload Postgrest schema cache
NOTIFY pgrst, 'reload schema';
