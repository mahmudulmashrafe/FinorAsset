import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { User, Mail, DollarSign, Calendar, Save } from "lucide-react";
import { useUserProfile } from "@/hooks/use-user-profile";

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

export function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [currency, setCurrency] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);

  // Email update state
  const [newEmail, setNewEmail] = useState("");
  const [updatingEmail, setUpdatingEmail] = useState(false);

  // Password update state
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const { profile, authUser, isLoading } = useUserProfile();

  useEffect(() => {
    if (initialized) return;
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setCurrency((profile.currency ?? "USD").toUpperCase());
      setInitialized(true);
    } else if (!isLoading && authUser) {
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
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    }
  }

  async function handleUpdateEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) {
      return toast.error("New email address cannot be empty");
    }
    setUpdatingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setUpdatingEmail(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Confirmation emails sent to both addresses. Please check your inbox!");
      setNewEmail("");
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!oldPassword) {
      return toast.error("Please enter your current password");
    }
    if (newPassword.length < 6) {
      return toast.error("New password must be at least 6 characters long");
    }
    setUpdatingPassword(true);

    // Verify current password by logging in first
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: authUser?.email ?? "",
      password: oldPassword,
    });

    if (signInError) {
      setUpdatingPassword(false);
      return toast.error("Incorrect current password");
    }

    // Perform password update
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setUpdatingPassword(false);

    if (updateError) {
      toast.error(updateError.message);
    } else {
      toast.success("Password updated successfully!");
      setOldPassword("");
      setNewPassword("");
    }
  }

  const joinDate = authUser?.created_at
    ? new Date(authUser.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto thin-scroll z-[90]">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="font-serif text-3xl">Profile Settings</DialogTitle>
        </DialogHeader>

        {isLoading || !initialized ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-muted-foreground font-serif italic text-lg animate-pulse">Loading settings...</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3 mt-4">
            {/* Info summary */}
            <div className="rounded-xl border bg-card p-5 md:col-span-1 flex flex-col items-center text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-accent/10 text-accent flex items-center justify-center">
                <User className="h-8 w-8" />
              </div>
              <div className="min-w-0 w-full">
                <h2 className="font-serif text-xl font-semibold truncate">{displayName || "Anonymous"}</h2>
                <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1 flex-wrap break-all w-full select-all">
                  <Mail className="h-3 w-3 flex-shrink-0" /> <span className="break-all">{authUser?.email}</span>
                </p>
              </div>
              <div className="w-full border-t pt-4 text-left space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Joined:</span>
                  <span className="font-medium">{joinDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Currency:</span>
                  <span className="font-medium font-serif">{currency}</span>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="rounded-xl border bg-card p-5 md:col-span-2 space-y-6">
              
              {/* Profile Details Form */}
              <div>
                <h3 className="font-serif text-lg font-semibold mb-3">Edit Profile</h3>
                <form onSubmit={updateProfile} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="display-name" className="text-xs font-semibold">Display Name</Label>
                    <Input
                      id="display-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                    />
                    <p className="text-[10px] text-muted-foreground">Greeted on your dashboard header.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="currency" className="text-xs font-semibold">Preferred Currency</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger id="currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[150]">
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">Used for all totals and accounts computations.</p>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={saving} className="gap-2 text-xs font-semibold cursor-pointer">
                      <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Settings"}
                    </Button>
                  </div>
                </form>
              </div>

              <hr className="border-border/60" />

              {/* Change Email Form */}
              <div>
                <h3 className="font-serif text-lg font-semibold mb-3">Change Email Address</h3>
                <form onSubmit={handleUpdateEmail} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Current Email Address</Label>
                    <Input
                      value={authUser?.email ?? ""}
                      disabled
                      className="bg-muted text-muted-foreground select-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="new-email" className="text-xs font-semibold">New Email Address</Label>
                    <Input
                      id="new-email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="new@example.com"
                    />
                    <p className="text-[10px] text-muted-foreground">Verification emails will be sent to both your current and new addresses.</p>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={updatingEmail} className="gap-2 text-xs font-semibold cursor-pointer">
                      <Save className="h-4 w-4" /> {updatingEmail ? "Updating..." : "Update Email"}
                    </Button>
                  </div>
                </form>
              </div>

              <hr className="border-border/60" />

              {/* Change Password Form */}
              <div>
                <h3 className="font-serif text-lg font-semibold mb-3">Change Password</h3>
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="old-password" className="text-xs font-semibold">Current Password</Label>
                    <Input
                      id="old-password"
                      type="password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="new-password" className="text-xs font-semibold">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="•••••••• (min 6 chars)"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={updatingPassword} className="gap-2 text-xs font-semibold cursor-pointer">
                      <Save className="h-4 w-4" /> {updatingPassword ? "Updating..." : "Update Password"}
                    </Button>
                  </div>
                </form>
              </div>

            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
