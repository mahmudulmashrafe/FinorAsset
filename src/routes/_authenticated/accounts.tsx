import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, computeAccountBalances, fmtMoney } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
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
}

function AccountFormDialog({ open, onOpenChange, defaultCurrency, editingAccount, onSaved }: AccountFormProps) {
  const isEdit = !!editingAccount;

  const [name, setName] = useState("");
  const [type, setType] = useState("bank");
  const [start, setStart] = useState("0");
  const [currencyInput, setCurrencyInput] = useState(defaultCurrency);
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pre-fill when editing
  useEffect(() => {
    if (open) {
      if (editingAccount) {
        setName(editingAccount.name);
        setType(editingAccount.type);
        setStart(String(editingAccount.starting_balance));
        setCurrencyInput(editingAccount.currency ?? defaultCurrency);
        setColor(editingAccount.color ?? COLORS[0]);
      } else {
        setName("");
        setType("bank");
        setStart("0");
        setCurrencyInput(defaultCurrency);
        setColor(COLORS[0]);
      }
      setErrors({});
    }
  }, [open, editingAccount, defaultCurrency]);

  async function save() {
    setErrors({});
    if (!name.trim()) {
      setErrors({ name: "Account name is required" });
      return;
    }
    setSaving(true);

    if (isEdit) {
      const { error } = await supabase
        .from("accounts")
        .update({
          name: name.trim(),
          type,
          color,
          currency: currencyInput,
          starting_balance: Number(start),
        })
        .eq("id", editingAccount!.id);

      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Account updated!");
    } else {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setSaving(false); return; }
      const { error } = await supabase.from("accounts").insert({
        user_id: u.user.id,
        name: name.trim(),
        type,
        starting_balance: Number(start),
        color,
        currency: currencyInput,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Account added!");
    }

    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">{isEdit ? "Edit account" : "New account"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
            {/* Preview strip */}
            <div className="mt-3 flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
              <span className="h-4 w-4 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="text-sm font-medium truncate">{name || "Account name"}</span>
              <span className="ml-auto text-xs text-muted-foreground capitalize">{TYPE_LABELS[type] ?? type}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? (isEdit ? "Saving…" : "Adding…") : (isEdit ? "Save changes" : "Add account")}
          </Button>
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
      />

      {/* ── Account cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {accounts.map((a) => (
          <div
            key={a.id}
            className="rounded-xl border bg-card p-4 relative group transition-shadow hover:shadow-md flex flex-col justify-between"
          >
            <div>
              {/* Color dot + name */}
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: a.color }} />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{TYPE_LABELS[a.type] ?? a.type}</span>
              </div>
              <h3 className="mt-1.5 font-serif text-base font-bold">{a.name}</h3>
              <p className="mt-3.5 num font-serif text-xl font-bold">{fmtMoney(balances.get(a.id) ?? 0, profileCurrency)}</p>
            </div>

            {/* Action buttons at bottom — always visible and easy to tap */}
            <div className="flex items-center gap-2 mt-4 pt-3 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setEditAccount(a); }}
                className="flex-1 gap-1.5 h-8 text-xs cursor-pointer"
              >
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setDeleteAccount({ id: a.id, name: a.name }); }}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
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
