import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { User, Mail, DollarSign, Calendar, Save } from "lucide-react";
import { useUserProfile } from "@/hooks/use-user-profile";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Profile — FinorAsset" }] }),
});

const CURRENCIES = [
  { code: "USD", name: "US Dollar ($)" },
  { code: "EUR", name: "Euro (€)" },
  { code: "GBP", name: "British Pound (£)" },
  { code: "CAD", name: "Canadian Dollar (CA$)" },
  { code: "AUD", name: "Australian Dollar (A$)" },
  { code: "JPY", name: "Japanese Yen (¥)" },
  { code: "INR", name: "Indian Rupee (₹)" },
  { code: "BDT", name: "Bangladeshi Taka (৳)" },
];

function ProfilePage() {
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  // Start as empty string — will be set once profile loads
  const [currency, setCurrency] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Use shared hook — same React Query cache as the rest of the app
  const { profile, authUser, isLoading } = useUserProfile();

  // Initialize form values exactly once when profile data arrives
  useEffect(() => {
    if (initialized) return; // don't overwrite user edits after init
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setCurrency((profile.currency ?? "USD").toUpperCase());
      setInitialized(true);
    } else if (!isLoading && authUser) {
      // No profile row yet — use email-derived name and default to USD
      setDisplayName(authUser.email?.split("@")[0] ?? "");
      setCurrency("USD");
      setInitialized(true);
    }
  }, [profile, authUser, isLoading, initialized]);

  async function updateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!authUser) return;
    if (!displayName.trim()) {
      return toast.error("Display name cannot be empty");
    }
    const saveCurrency = currency || "USD";
    setSaving(true);
    // Use upsert to create the row if it's missing, or update if it exists
    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: authUser.id,
        display_name: displayName.trim(),
        currency: saveCurrency.toUpperCase(),
        updated_at: new Date().toISOString(),
      });

    setSaving(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile settings updated!");
      // Invalidate queries to refresh values across the application
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    }
  }

  async function handleDeleteAccount() {
    if (!deletePassword) return toast.error("Password is required");
    setDeletingAccount(true);

    try {
      // 1. Verify password by logging in
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: authUser?.email ?? "",
        password: deletePassword,
      });

      if (verifyErr) {
        setDeletingAccount(false);
        return toast.error("Incorrect password. Verification failed.");
      }

      // 2. Call secure delete account RPC function
      const { data, error: deleteErr } = await (supabase.rpc as any)("delete_current_user");
      if (deleteErr) {
        setDeletingAccount(false);
        return toast.error(`Deletion failed: ${deleteErr.message}`);
      }
      if (data !== "OK") {
        setDeletingAccount(false);
        return toast.error(`Deletion failed: ${data}`);
      }

      // 3. Clear auth session and redirect
      await supabase.auth.signOut();
      toast.success("Account deleted successfully.");
      window.location.href = "/auth";
    } catch (err: any) {
      toast.error(err.message);
      setDeletingAccount(false);
    }
  }

  // Show loader until profile data is ready AND we've initialized form state
  if (isLoading || !initialized) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground font-serif italic text-lg animate-pulse">Loading your settings...</p>
      </div>
    );
  }

  const joinDate = authUser?.created_at
    ? new Date(authUser.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Account settings</p>
        <h1 className="mt-1 font-serif text-4xl">Profile</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left side card - Info overview */}
        <div className="rounded-xl border bg-card p-6 md:col-span-1 flex flex-col items-center text-center space-y-4">
          <div className="h-20 w-20 rounded-full bg-accent/10 text-accent flex items-center justify-center">
            <User className="h-10 w-10" />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-semibold">{displayName || "Anonymous"}</h2>
            <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <Mail className="h-3.5 w-3.5" /> {authUser?.email}
            </p>
          </div>
          <div className="w-full border-t pt-4 text-left space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Joined:</span>
              <span className="font-medium">{joinDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5"><DollarSign className="h-4 w-4" /> Currency:</span>
              <span className="font-medium font-serif">{currency}</span>
            </div>
          </div>
        </div>

        {/* Right side form */}
        <div className="rounded-xl border bg-card p-6 md:col-span-2">
          <h2 className="font-serif text-2xl mb-4">Edit Profile Settings</h2>
          <form onSubmit={updateProfile} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="display-name" className="text-sm font-semibold">Display Name</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="max-w-md"
              />
              <p className="text-xs text-muted-foreground">This is how you will be greeted on the dashboard.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency" className="text-sm font-semibold">Preferred Currency</Label>
              <div className="max-w-md">
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Standard currency used for computing totals and reports.</p>
            </div>

            <div className="border-t pt-5">
              <Button type="submit" disabled={saving} className="gap-2">
                <Save className="h-4 w-4" /> {saving ? "Saving Changes..." : "Save Settings"}
              </Button>
            </div>
          </form>
        </div>

        {/* Danger Zone */}
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 md:col-span-3 space-y-4">
          <div className="space-y-1">
            <h2 className="font-serif text-2xl text-destructive font-semibold">Danger Zone</h2>
            <p className="text-xs text-muted-foreground">Irreversible actions regarding your account data.</p>
          </div>
          <div className="border-t border-destructive/10 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-0.5">
              <span className="text-sm font-semibold text-foreground">Delete Account</span>
              <p className="text-xs text-muted-foreground">Permanently delete your profile and all linked financial accounts, transactions, and loans.</p>
            </div>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              className="cursor-pointer font-bold text-xs"
            >
              Delete Account...
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Account Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-destructive">Confirm Account Deletion</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This action is permanent and cannot be undone. To verify you are the account owner, please enter your password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2.5 py-3">
            <Label htmlFor="delete-confirm-password" className="text-xs font-semibold">Enter Password</Label>
            <Input
              id="delete-confirm-password"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletePassword("")}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deletingAccount || !deletePassword}
              onClick={handleDeleteAccount}
              className="cursor-pointer font-bold text-xs"
            >
              {deletingAccount ? "Deleting Account..." : "Permanently Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
