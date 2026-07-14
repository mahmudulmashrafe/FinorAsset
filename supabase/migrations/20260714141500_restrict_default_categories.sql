-- Update handle_new_user default setup for future signups to only seed Salary, Borrow, and Lent categories
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));

  INSERT INTO public.accounts (user_id, name, type, color)
    VALUES (NEW.id, 'Cash', 'cash', '#D97706');

  INSERT INTO public.categories (user_id, name, kind, color, icon) VALUES
    (NEW.id, 'Salary',        'income',  '#3F6B4A', 'Briefcase'),
    (NEW.id, 'Borrow',        'income',  '#8B5CF6', 'CircleDollarSign'),
    (NEW.id, 'Lent',          'expense', '#EC4899', 'CircleDollarSign');
  RETURN NEW;
END $$;

-- Force reload Postgrest schema cache
NOTIFY pgrst, 'reload schema';
