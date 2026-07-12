import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Fetch the current user's profile row from `public.profiles`. */
export function useUserProfile() {
  // First, get the authenticated user's ID from the Supabase auth session.
  const { data: authUser, isLoading: isAuthLoading } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
    retry: false,
    staleTime: 60_000,
  });

  // Then fetch the profile using the user's ID so we always get the right row.
  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ["profile", authUser?.id],
    queryFn: async () => {
      if (!authUser?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!authUser?.id,
    retry: false,
    staleTime: 30_000,
  });

  const currency: string = (profile?.currency ?? "USD").toUpperCase();
  const isLoading = isAuthLoading || isProfileLoading;

  return { profile, authUser, currency, isLoading };
}
