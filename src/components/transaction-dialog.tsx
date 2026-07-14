import { useState, useEffect, forwardRef, ElementRef, ComponentPropsWithoutRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogPortal } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type TxnKind, type Transaction, syncTransactionToLoan, computeAccountBalances, fmtMoney } from "@/lib/finance";
import { toast } from "sonner";
import { Plus, PlusCircle, X, Trash2 } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useUserProfile } from "@/hooks/use-user-profile";

// ─── Validation Schema ────────────────────────────────────────────────────────
const transactionSchema = z
  .object({
    kind: z.enum(["income", "expense", "transfer"]),
    amount: z.number({ invalid_type_error: "Enter a valid amount" }).positive("Amount must be greater than 0"),
    accountId: z.string().min(1, "Select an account"),
    toAccountId: z.string().optional(),
    categoryId: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
    note: z.string().max(500, "Note must be 500 characters or fewer").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "transfer" && !data.toAccountId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["toAccountId"], message: "Select a destination account" });
    }
    if (data.kind === "transfer" && data.toAccountId === data.accountId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["toAccountId"], message: "Destination must differ from source" });
    }
  });

type FieldErrors = Record<string, string>;

const QUICK_COLORS = [
  "#D97706", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6",
  "#EC4899", "#EF4444", "#14B8A6", "#F97316", "#6366F1",
];
const QUICK_ICONS = ["🛺", "🍔", "🛒", "🏠", "🚗", "💊", "📚", "✈️", "🎬", "👗", "💰", "📈", "🎁", "☕", "🎮", "💼"];

// ─── Custom dialog content wrapper that doesn't render double backdrops ───
const NoOverlayDialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    {/* Transparent backdrop overlay so stacked dialogs do not double-darken the screen */}
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-transparent" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
NoOverlayDialogContent.displayName = "NoOverlayDialogContent";

// ─── Floating New-Category Pop-up Dialog ────────────────────────────────────

function CategoryCreatorDialog({
  open,
  onOpenChange,
  kind,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "income" | "expense";
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState(QUICK_COLORS[0]);
  const [icon, setIcon] = useState(QUICK_ICONS[0]);
  const [saving, setSaving] = useState(false);

  // Reset form state when opened
  useEffect(() => {
    if (open) {
      setName("");
      setColor(QUICK_COLORS[0]);
      setIcon(QUICK_ICONS[0]);
    }
  }, [open]);

  async function create() {
    if (!name.trim()) return toast.error("Enter a category name");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return; }
    const { data, error } = await supabase
      .from("categories")
      .insert({ user_id: u.user.id, name: name.trim(), kind, color, icon })
      .select("id")
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`"${name.trim()}" category created!`);
    await qc.invalidateQueries({ queryKey: ["categories"] });
    onCreated(data.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <NoOverlayDialogContent className="max-w-md z-[110]">
        <DialogHeader>
          <DialogTitle className="font-serif">New Category — {kind}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="quick-cat-name" className="text-xs font-semibold">Category Name</Label>
            <Input id="quick-cat-name" autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Rickshaw" onKeyDown={(e) => e.key === "Enter" && create()} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold font-serif">Icon</Label>
            <div className="flex flex-wrap gap-1">
              {QUICK_ICONS.map((em) => (
                <button key={em} type="button" onClick={() => setIcon(em)}
                  className={`h-7 w-7 rounded-lg text-base flex items-center justify-center transition-all ${icon === em ? "ring-2 ring-foreground bg-accent/20" : "hover:bg-accent/10"}`}>
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold font-serif">Color</Label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`h-5 w-5 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={saving}>
            {saving ? "Creating…" : "Create & select"}
          </Button>
        </DialogFooter>
      </NoOverlayDialogContent>
    </Dialog>
  );
}

// ─── Transaction Form Dialog (create + edit) ──────────────────────────────────
interface TransactionDialogProps {
  trigger?: React.ReactNode;
  editingTransaction?: Transaction | null;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}

export function TransactionDialog({
  trigger,
  editingTransaction,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: TransactionDialogProps) {
  const qc = useQueryClient();
  const { currency } = useUserProfile();
  const isEdit = !!editingTransaction;

  // Support both controlled (edit mode) and uncontrolled (trigger button) open state
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  function setOpen(v: boolean) {
    controlledOnOpenChange?.(v);
    setInternalOpen(v);
  }

  const [kind, setKind] = useState<TxnKind>("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showNewCat, setShowNewCat] = useState(false);

  // Splits states
  const [isSplit, setIsSplit] = useState(false);
  const [splits, setSplits] = useState<{ accountId: string; amount: number }[]>([]);

  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts, enabled: open });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: api.listCategories, enabled: open });
  const { data: txns = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => api.listTransactions(1000), enabled: open });

  const balances = computeAccountBalances(accounts, txns);

  // Pre-fill form when editing or set defaults for new
  useEffect(() => {
    if (!open) return;
    if (editingTransaction) {
      setKind(editingTransaction.kind as TxnKind);
      setAmount(String(editingTransaction.amount));
      setAccountId(editingTransaction.account_id);
      setToAccountId(editingTransaction.to_account_id ?? "");
      setCategoryId(editingTransaction.category_id ?? "");
      setNote(editingTransaction.note ?? "");
      setDate(editingTransaction.occurred_on);
      setIsSplit(false);
    } else {
      setKind("expense");
      setAmount("");
      setToAccountId("");
      setCategoryId("");
      setNote("");
      setDate(new Date().toISOString().slice(0, 10));
      setIsSplit(false);
      if (accounts.length) {
        setSplits([{ accountId: accounts[0].id, amount: 0 }]);
      }
    }
    setErrors({});
    setShowNewCat(false);
  }, [open, editingTransaction, accounts]);

  // Auto-select first account for new transactions
  useEffect(() => {
    if (open && accounts.length && !accountId && !isEdit) {
      const defaultId = accounts[0].id;
      setAccountId(defaultId);
      setSplits([{ accountId: defaultId, amount: Number(amount) || 0 }]);
    }
  }, [open, accounts, accountId, isEdit, amount]);

  // Reset category + new-cat form when switching kind
  useEffect(() => {
    if (!isEdit) { setShowNewCat(false); setCategoryId(""); }
  }, [kind, isEdit]);

  const filteredCats = categories.filter((c) => c.kind === kind);

  function reset() {
    setAmount(""); setNote(""); setCategoryId(""); setToAccountId("");
    setErrors({}); setShowNewCat(false); setAccountId("");
  }
  async function submit() {
    setErrors({});
    const parsed = transactionSchema.safeParse({
      kind, amount: Number(amount), accountId,
      toAccountId: toAccountId || undefined,
      categoryId: categoryId || undefined,
      date, note: note || undefined,
    });

    if (!parsed.success) {
      const fieldErrs: FieldErrors = {};
      parsed.error.errors.forEach((err) => { fieldErrs[err.path[0] as string] = err.message; });
      setErrors(fieldErrs);
      return;
    }

    setSaving(true);

    if (isEdit) {
      // Balance validation for editing a transaction
      if (kind === "expense" || kind === "transfer") {
        const originalAmt = Number(editingTransaction!.amount);
        const currentBal = balances.get(accountId) ?? 0;
        const available = currentBal + (editingTransaction!.kind === kind && editingTransaction!.account_id === accountId ? originalAmt : 0);
        if (available < parsed.data.amount) {
          const accName = accounts.find(a => a.id === accountId)?.name || "selected account";
          setSaving(false);
          return toast.error(`Insufficient funds in ${accName}. Available: ${fmtMoney(available, currency)}, required: ${fmtMoney(parsed.data.amount, currency)}`);
        }
      }

      // UPDATE existing transaction
      const { error } = await supabase.from("transactions").update({
        account_id: accountId,
        to_account_id: kind === "transfer" ? toAccountId : null,
        category_id: kind === "transfer" ? null : (categoryId || null),
        kind,
        amount: parsed.data.amount,
        note: note || null,
        occurred_on: date,
      }).eq("id", editingTransaction!.id);

      setSaving(false);
      if (error) return toast.error(error.message);
      await syncTransactionToLoan("update", editingTransaction!, parsed.data.amount);
      toast.success("Transaction updated!");
    } else {
      // INSERT new transaction
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setSaving(false); return; }

      if (isSplit) {
        // Splits validation
        const totalAllocated = splits.reduce((sum, s) => sum + s.amount, 0);
        if (Math.abs(totalAllocated - parsed.data.amount) >= 0.01) {
          setSaving(false);
          return toast.error(`Total split amount (${fmtMoney(totalAllocated, currency)}) must match the transaction amount (${fmtMoney(parsed.data.amount, currency)})`);
        }

        if (kind === "expense") {
          for (const split of splits) {
            const currentBal = balances.get(split.accountId) ?? 0;
            if (currentBal < split.amount) {
              const accName = accounts.find(a => a.id === split.accountId)?.name || "selected account";
              setSaving(false);
              return toast.error(`Insufficient funds in ${accName}. Available: ${fmtMoney(currentBal, currency)}, required: ${fmtMoney(split.amount, currency)}`);
            }
          }
        }

        // Insert multiple split transactions
        const insertPayloads = splits.map(split => ({
          user_id: u.user.id,
          account_id: split.accountId,
          to_account_id: null,
          category_id: categoryId || null,
          kind,
          amount: Number(split.amount),
          note: note || null,
          occurred_on: date,
        }));

        const { error } = await supabase.from("transactions").insert(insertPayloads);
        setSaving(false);
        if (error) return toast.error(error.message);
        toast.success("Split transactions added!");
      } else {
        // Single transaction balance validation
        if (kind === "expense" || kind === "transfer") {
          const currentBal = balances.get(accountId) ?? 0;
          if (currentBal < parsed.data.amount) {
            const accName = accounts.find(a => a.id === accountId)?.name || "selected account";
            setSaving(false);
            return toast.error(`Insufficient funds in ${accName}. Available: ${fmtMoney(currentBal, currency)}, required: ${fmtMoney(parsed.data.amount, currency)}`);
          }
        }

        const { error } = await supabase.from("transactions").insert({
          user_id: u.user.id,
          account_id: accountId,
          to_account_id: kind === "transfer" ? toAccountId : null,
          category_id: kind === "transfer" ? null : (categoryId || null),
          kind,
          amount: parsed.data.amount,
          note: note || null,
          occurred_on: date,
        });
        setSaving(false);
        if (error) return toast.error(error.message);
        toast.success("Transaction added!");
      }
    }

    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["loans"] });
    setOpen(false);
    if (!isEdit) reset();
  }

  const dialogContent = (
    <DialogContent className="max-w-md flex flex-col max-h-[90vh] sm:max-h-[600px] p-0 z-[99] overflow-hidden">
      <DialogHeader className="p-4 border-b">
        <DialogTitle className="font-serif">{isEdit ? "Edit transaction" : "New transaction"}</DialogTitle>
      </DialogHeader>

      <div className="px-4 py-3 border-b bg-muted/5 shrink-0">
        <ToggleGroup type="single" value={kind} onValueChange={(v) => v && setKind(v as TxnKind)} className="justify-start">
          <ToggleGroupItem value="expense" id="kind-expense">Expense</ToggleGroupItem>
          <ToggleGroupItem value="income" id="kind-income">Income</ToggleGroupItem>
          <ToggleGroupItem value="transfer" id="kind-transfer">Transfer</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 thin-scroll">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label htmlFor="txn-amount">Amount</Label>
            <Input id="txn-amount" type="number" step="0.01" min="0.01"
              value={amount} onChange={(e) => {
                const val = e.target.value;
                setAmount(val);
                if (splits.length === 1) {
                  setSplits([{ ...splits[0], amount: Number(val) || 0 }]);
                }
              }}
              placeholder="0.00" aria-invalid={!!errors.amount} autoFocus={isEdit} />
            {errors.amount && <p className="mt-1 text-xs text-destructive">{errors.amount}</p>}
          </div>

          {!isEdit && kind !== "transfer" && (
            <div className="col-span-2 flex items-center justify-between border-y py-2.5 my-1">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold">Split across multiple accounts</Label>
                <p className="text-[10px] text-muted-foreground">Allocate this transaction's amount to more than one account</p>
              </div>
              <Switch
                checked={isSplit}
                onCheckedChange={(checked) => {
                  setIsSplit(checked);
                  if (checked) {
                    setSplits([{ accountId: accountId || accounts[0]?.id || "", amount: Number(amount) || 0 }]);
                  }
                }}
              />
            </div>
          )}

          {isSplit ? (
            <div className="col-span-2">
              <AccountSplitsSelector
                splits={splits}
                setSplits={setSplits}
                totalAmount={Number(amount) || 0}
                accounts={accounts}
                balances={balances}
                currency={currency}
                showBalanceCheck={kind === "expense"}
              />
            </div>
          ) : (
            <div>
              <Label htmlFor="txn-account">{kind === "transfer" ? "From account" : "Account"}</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="txn-account" aria-invalid={!!errors.accountId}><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent className="z-[150]">{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
              {errors.accountId && <p className="mt-1 text-xs text-destructive">{errors.accountId}</p>}
            </div>
          )}

          {kind === "transfer" ? (
            <div>
              <Label htmlFor="txn-to-account">To account</Label>
              <Select value={toAccountId} onValueChange={setToAccountId}>
                <SelectTrigger id="txn-to-account" aria-invalid={!!errors.toAccountId}><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent className="z-[150]">{accounts.filter((a) => a.id !== accountId).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
              {errors.toAccountId && <p className="mt-1 text-xs text-destructive">{errors.toAccountId}</p>}
            </div>
          ) : (
            <div className={isSplit ? "col-span-2" : ""}>
              <Label htmlFor="txn-category">Category</Label>
              <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setShowNewCat(false); }}>
                <SelectTrigger id="txn-category"><SelectValue placeholder="Select or create" /></SelectTrigger>
                <SelectContent className="z-[150]">
                  {filteredCats.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No categories yet</div>}
                  {filteredCats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span>{c.icon}</span>
                        <span className="h-2 w-2 rounded-full inline-block flex-shrink-0" style={{ background: c.color }} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button type="button" onClick={() => setShowNewCat(true)}
                className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                <PlusCircle className="h-3.5 w-3.5" /> Create new category
              </button>
              <CategoryCreatorDialog
                open={showNewCat}
                onOpenChange={setShowNewCat}
                kind={kind as "income" | "expense"}
                onCreated={(id) => { setCategoryId(id); setShowNewCat(false); }}
              />
            </div>
          )}

          <div className="col-span-2">
            <Label htmlFor="txn-date">Date</Label>
            <Input id="txn-date" type="date" value={date}
              onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors.date} />
            {errors.date && <p className="mt-1 text-xs text-destructive">{errors.date}</p>}
          </div>

          <div className="col-span-2">
            <Label htmlFor="txn-note">Note</Label>
            <Textarea id="txn-note" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Optional" rows={2} aria-invalid={!!errors.note} />
            {errors.note && <p className="mt-1 text-xs text-destructive">{errors.note}</p>}
          </div>
        </div>
      </div>

      <DialogFooter className="p-4 border-t gap-2 sm:gap-0">
        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
        <Button onClick={submit} disabled={saving} id="txn-save-btn">
          {saving ? "Saving…" : isEdit ? "Save changes" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );

  // Edit mode: controlled open, no trigger button
  if (isEdit) {
    return (
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        {dialogContent}
      </Dialog>
    );
  }

  // Create mode: trigger button opens dialog
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? <Button id="new-transaction-btn"><Plus className="h-4 w-4 mr-1" /> New transaction</Button>}
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}

function AccountSplitsSelector({
  splits,
  setSplits,
  totalAmount,
  accounts,
  balances,
  currency,
  showBalanceCheck,
}: {
  splits: { accountId: string; amount: number }[];
  setSplits: React.Dispatch<React.SetStateAction<{ accountId: string; amount: number }[]>>;
  totalAmount: number;
  accounts: any[];
  balances: Map<string, number>;
  currency: string;
  showBalanceCheck: boolean;
}) {
  const handleAddSplit = () => {
    setSplits([...splits, { accountId: accounts[0]?.id || "", amount: 0 }]);
  };

  const handleRemoveSplit = (idx: number) => {
    setSplits(splits.filter((_, i) => i !== idx));
  };

  const handleSplitChange = (idx: number, field: "accountId" | "amount", value: any) => {
    const updated = splits.map((s, i) => {
      if (i === idx) {
        return { ...s, [field]: value };
      }
      return s;
    });
    setSplits(updated);
  };

  const allocated = splits.reduce((sum, s) => sum + s.amount, 0);
  const remaining = totalAmount - allocated;

  return (
    <div className="space-y-2 border-t pt-2 mt-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Account Source / Splits
        </Label>
        <button
          type="button"
          onClick={handleAddSplit}
          className="text-xs text-accent hover:underline flex items-center gap-0.5 cursor-pointer"
        >
          + Add Account Split
        </button>
      </div>

      <div className="space-y-2">
        {splits.map((split, idx) => {
          const balance = balances.get(split.accountId) ?? 0;
          const isOverdrawn = showBalanceCheck && balance < split.amount;

          return (
            <div key={idx} className="flex gap-2 items-start">
              <div className="flex-1 min-w-0">
                <Select
                  value={split.accountId || "none"}
                  onValueChange={(val) => handleSplitChange(idx, "accountId", val === "none" ? "" : val)}
                >
                  <SelectTrigger className="w-full h-8 bg-background rounded-lg text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[250]">
                    {(!split.accountId || split.accountId === "none") && (
                      <SelectItem value="none">Select account...</SelectItem>
                    )}
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({fmtMoney(balances.get(a.id) ?? 0, currency)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-[10px] text-muted-foreground mt-0.5 px-1 flex justify-between">
                  <span>Available: {fmtMoney(balance, currency)}</span>
                  {isOverdrawn && <span className="text-destructive font-semibold">Insufficient funds</span>}
                </div>
              </div>

              <div className="w-28 flex-shrink-0">
                <Input
                  type="number"
                  step="any"
                  value={split.amount || ""}
                  onChange={(e) => handleSplitChange(idx, "amount", Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className={`rounded-lg h-8 text-xs ${isOverdrawn ? "border-destructive text-destructive" : ""}`}
                />
              </div>

              {splits.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveSplit(idx)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-lg cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-[10px] flex justify-between px-1 pt-1">
        <span className={Math.abs(remaining) < 0.01 ? "text-success font-medium" : "text-muted-foreground"}>
          Allocated: {fmtMoney(allocated, currency)} / {fmtMoney(totalAmount, currency)}
        </span>
        {Math.abs(remaining) >= 0.01 && (
          <span className="text-destructive font-medium">
            {remaining > 0 ? `Remaining: ${fmtMoney(remaining, currency)}` : `Over-allocated by ${fmtMoney(Math.abs(remaining), currency)}`}
          </span>
        )}
      </div>
    </div>
  );
}

