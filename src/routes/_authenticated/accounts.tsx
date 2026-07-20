import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, computeAccountBalances, fmtMoney } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { useUserProfile } from "@/hooks/use-user-profile";
import type { Account } from "@/lib/finance";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Constants ────────────────────────────────────────────────────────────────

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

const TYPES = ["cash", "bank", "card", "savings", "investment", "mobile_banking", "loan", "other"] as const;

const TYPE_LABELS: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
  card: "Card",
  savings: "Savings",
  investment: "Investment",
  mobile_banking: "Mobile Banking",
  loan: "Loan",
  other: "Other",
};

const COLORS = [
  // Ambers & oranges
  "#F59E0B", "#D97706", "#F97316", "#EA580C",
  // Reds & pinks
  "#EF4444", "#DC2626", "#EC4899", "#DB2777",
  // Purples & indigos
  "#8B5CF6", "#7C3AED", "#6366F1", "#4F46E5",
  // Blues & cyans
  "#3B82F6", "#2563EB", "#06B6D4", "#0891B2",
  // Greens & teals
  "#10B981", "#059669", "#14B8A6", "#0D9488",
  // Neutrals
  "#6B7280", "#374151",
];

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authenticated/accounts")({
  component: AccountsPage,
  head: () => ({ meta: [{ title: "Accounts — FinorAsset" }] }),
});

// ─── Color Picker ─────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="grid grid-cols-11 gap-2 mt-2">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          className={`h-8 w-8 rounded-full transition-all duration-150 ${
            value === c
              ? "ring-2 ring-offset-2 ring-foreground scale-110 shadow-md"
              : "hover:scale-105 hover:shadow-sm"
          }`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

// ─── Account Form (shared by New + Edit) ─────────────────────────────────────

interface AccountFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultCurrency: string;
  editingAccount?: Account | null;
  onSaved: () => void;
  onDelete?: (id: string) => void;
}

function AccountFormDialog({ open, onOpenChange, defaultCurrency, editingAccount, onSaved, onDelete }: AccountFormProps) {
  const isEdit = !!editingAccount;

  const [name, setName] = useState("");
  const [type, setType] = useState("bank");
  const [start, setStart] = useState("0");
  const [currencyInput, setCurrencyInput] = useState(defaultCurrency);
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pre-fill when editing
  useEffect(() => {
    if (open) {
      if (editingAccount) {
        setName(editingAccount.name);
        setType(editingAccount.type);
        setStart(String(editingAccount.starting_balance));
        setCurrencyInput(editingAccount.currency ?? defaultCurrency);
        setColor(editingAccount.color ?? COLORS[0]);
        setImageUrl((editingAccount as any).image_url ?? "");
        setImageFile(null);
      } else {
        setName("");
        setType("bank");
        setStart("0");
        setCurrencyInput(defaultCurrency);
        setColor(COLORS[0]);
        setImageUrl("");
        setImageFile(null);
      }
      setErrors({});
    }
  }, [open, editingAccount, defaultCurrency]);

  async function save() {
    setErrors({});
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrors({ name: "Account name is required" });
      return;
    }
    setSaving(true);

    // Duplicate account name & category validation
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return; }

    const { data: existingAccounts } = await supabase
      .from("accounts")
      .select("id, name, type")
      .eq("user_id", u.user.id);

    const isDuplicate = existingAccounts?.some((a) =>
      a.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
      a.type === type &&
      (!isEdit || a.id !== editingAccount?.id)
    );

    if (isDuplicate) {
      setSaving(false);
      const catLabel = TYPE_LABELS[type as keyof typeof TYPE_LABELS] || type;
      const errMsg = `An account named "${trimmedName}" already exists in ${catLabel}.`;
      setErrors({ name: errMsg });
      return toast.error(errMsg);
    }

    let finalImageUrl = imageUrl;
    try {
      if (imageFile) {
        setUploadingImage(true);
        const { data: userResp } = await supabase.auth.getUser();
        if (userResp.user) {
          const fileExt = imageFile.name.split('.').pop();
          const filePath = `${userResp.user.id}/account-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('warranties')
            .upload(filePath, imageFile);
            
          if (uploadError) throw uploadError;
          
          const { data: { publicUrl } } = supabase.storage
            .from('warranties')
            .getPublicUrl(filePath);
            
          finalImageUrl = publicUrl;
        }
      }

      if (isEdit) {
        const { error } = await supabase
          .from("accounts")
          .update({
            name: name.trim(),
            type,
            color,
            currency: currencyInput,
            starting_balance: Number(start),
            image_url: finalImageUrl || null,
          } as any)
          .eq("id", editingAccount!.id);

        setSaving(false);
        setUploadingImage(false);
        if (error) return toast.error(error.message);
        toast.success("Account updated!");
      } else {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) { setSaving(false); setUploadingImage(false); return; }
        const { error } = await supabase.from("accounts").insert({
          user_id: u.user.id,
          name: name.trim(),
          type,
          starting_balance: Number(start),
          color,
          currency: currencyInput,
          image_url: finalImageUrl || null,
        } as any);
        setSaving(false);
        setUploadingImage(false);
        if (error) return toast.error(error.message);
        toast.success("Account added!");
      }
    } catch (err: any) {
      setSaving(false);
      setUploadingImage(false);
      toast.error(err.message || "An error occurred while uploading image");
      return;
    }

    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md flex flex-col max-h-[90vh] sm:max-h-[600px] p-0 z-[90] overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="font-serif">{isEdit ? "Edit account" : "New account"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 thin-scroll">
          {/* Name */}
          <div>
            <Label htmlFor="account-name">Name</Label>
            <Input
              id="account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., bKash, My Bank"
              aria-invalid={!!errors.name}
              autoFocus
            />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Type + Balance */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="account-type">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="account-type"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[100]">
                  {TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="account-balance">Starting balance</Label>
              <Input
                id="account-balance"
                type="number"
                step="0.01"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                aria-invalid={!!errors.starting_balance}
              />
            </div>
          </div>

          {/* Currency */}
          <div>
            <Label htmlFor="account-currency">Currency</Label>
            <Select value={currencyInput} onValueChange={setCurrencyInput}>
              <SelectTrigger id="account-currency"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[100]">
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Color picker */}
          <div>
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} />
            {/* Custom Account Image */}
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-semibold">Account Image (Optional)</Label>
              <div className="flex items-center gap-3">
                {imageUrl || imageFile ? (
                  <div className="relative border rounded-lg overflow-hidden h-14 w-14 bg-muted flex items-center justify-center shrink-0">
                    <img 
                      src={imageFile ? URL.createObjectURL(imageFile) : imageUrl} 
                      alt="Account Custom Pic" 
                      className="h-full w-full object-cover" 
                    />
                    <Button 
                      variant="destructive" 
                      size="xs" 
                      type="button"
                      className="absolute top-0 right-0 h-4 w-4 p-0 rounded-full cursor-pointer z-10"
                      onClick={() => { setImageUrl(""); setImageFile(null); }}
                      disabled={saving || uploadingImage}
                    >
                      <X className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                ) : (
                  <div 
                    onClick={() => inputRef.current?.click()}
                    className="border border-dashed hover:border-accent/40 rounded-lg p-2 flex flex-col items-center justify-center gap-1 cursor-pointer bg-accent/[0.01] hover:bg-accent/[0.03] transition-all text-center w-24 h-14 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-60" />
                    <span className="text-[9px] font-medium leading-none text-muted-foreground">Upload</span>
                    <input 
                      type="file" 
                      ref={inputRef} 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setImageFile(e.target.files[0]);
                        }
                      }} 
                      accept="image/*" 
                      className="hidden" 
                      disabled={saving || uploadingImage}
                    />
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground leading-normal">
                  Upload a custom picture to identify this account visually.
                </div>
              </div>
            </div>

            {/* Preview strip */}
            <div className="mt-3 flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
              {imageUrl || imageFile ? (
                <img 
                  src={imageFile ? URL.createObjectURL(imageFile) : imageUrl} 
                  alt="preview" 
                  className="h-5 w-5 rounded-full object-cover flex-shrink-0" 
                />
              ) : (
                <span className="h-4 w-4 rounded-full flex-shrink-0" style={{ background: color }} />
              )}
              <span className="text-sm font-medium truncate">{name || "Account name"}</span>
              <span className="ml-auto text-xs text-muted-foreground capitalize">{TYPE_LABELS[type] ?? type}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 border-t gap-2 flex-row justify-between items-center shrink-0">
          {isEdit && onDelete ? (
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm(`Are you sure you want to delete "${editingAccount?.name}"?`)) {
                  onDelete(editingAccount.id);
                  onOpenChange(false);
                }
              }}
              disabled={saving}
              className="cursor-pointer"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="cursor-pointer">Cancel</Button>
            <Button onClick={save} disabled={saving} className="cursor-pointer">
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Account"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function AccountsPage() {
  const qc = useQueryClient();
  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const { data: txns = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => api.listTransactions(1000) });
  const { currency: profileCurrency } = useUserProfile();

  const balances = computeAccountBalances(accounts, txns);

  const [newOpen, setNewOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<{ id: string; name: string } | null>(null);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  }

  async function confirmDelete(id: string) {
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
    toast.success("Account deleted");
  }

  return (
    <div className="space-y-6 w-full">

      {/* ── New account dialog ── */}
      <AccountFormDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        defaultCurrency={profileCurrency}
        onSaved={refresh}
      />

      {/* ── Edit account dialog ── */}
      <AccountFormDialog
        open={!!editAccount}
        onOpenChange={(v) => { if (!v) setEditAccount(null); }}
        defaultCurrency={profileCurrency}
        editingAccount={editAccount}
        onSaved={refresh}
        onDelete={confirmDelete}
      />

      {/* ── Account cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {accounts.map((a) => (
          <div
            key={a.id}
            onClick={() => setEditAccount(a)}
            className="rounded-xl border bg-card p-4 relative group transition-all hover:shadow-md hover:border-accent/40 cursor-pointer flex flex-col justify-between"
          >
            <div>
              {/* Color dot or Account Image + name */}
              <div className="flex items-center gap-2">
                {(a as any).image_url ? (
                  <img 
                    src={(a as any).image_url} 
                    alt={a.name} 
                    className="h-5 w-5 rounded-full object-cover flex-shrink-0 border border-border/40" 
                  />
                ) : (
                  <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: a.color }} />
                )}
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{TYPE_LABELS[a.type] ?? a.type}</span>
              </div>
              <h3 className="mt-1.5 font-serif text-base font-bold">{a.name}</h3>
              <p className="mt-3.5 num font-serif text-xl font-bold">{fmtMoney(balances.get(a.id) ?? 0, profileCurrency)}</p>
            </div>
          </div>
        ))}

        {accounts.length === 0 && (
          <div className="col-span-full rounded-xl border bg-card p-12 text-center text-muted-foreground">
            No accounts yet — create one to start tracking.
          </div>
        )}
      </div>

      {/* Deletion confirmation alert dialog */}
      <AlertDialog open={!!deleteAccount} onOpenChange={(open) => !open && setDeleteAccount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Delete Account?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteAccount?.name}" and all of its associated transactions? This action is permanent and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (deleteAccount) {
                  confirmDelete(deleteAccount.id);
                  setDeleteAccount(null);
                }
              }} 
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground cursor-pointer"
            >
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Floatable Add Account Trigger — portaled to body to escape transform ancestor */}
      {typeof document !== 'undefined' && createPortal(
        <Button 
          onClick={() => setNewOpen(true)} 
          size="icon" 
          className="fixed bottom-[5rem] md:bottom-6 right-6 z-40 h-10 w-10 md:h-12 md:w-12 rounded-full bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg border border-accent/20 flex items-center justify-center cursor-pointer" 
          title="New account"
        >
          <Plus className="h-5 w-5 md:h-6 md:w-6" />
        </Button>,
        document.body
      )}
    </div>
  );
}
