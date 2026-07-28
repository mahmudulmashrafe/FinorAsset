import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, computeAccountBalances, fmtMoney, isAccountIncludedInNetWorth, setAccountNetWorthInclusion, isTransactionIncomeForNetWorth, isTransactionExpenseForNetWorth } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X, Eye, Calendar, ChevronDown } from "lucide-react";
import { useUserProfile } from "@/hooks/use-user-profile";
import type { Account, Transaction, Category } from "@/lib/finance";
import { TransactionDialog } from "@/components/transaction-dialog";
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
  const [includeInNetWorth, setIncludeInNetWorth] = useState(true);
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
        setIncludeInNetWorth(isAccountIncludedInNetWorth(editingAccount));
        setImageUrl((editingAccount as any).image_url ?? "");
        setImageFile(null);
      } else {
        setName("");
        setType("bank");
        setStart("0");
        setCurrencyInput(defaultCurrency);
        setColor(COLORS[0]);
        setIncludeInNetWorth(true);
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
        setAccountNetWorthInclusion(editingAccount!.id, includeInNetWorth);
        toast.success("Account updated!");
      } else {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) { setSaving(false); setUploadingImage(false); return; }
        const { data: newAcc, error } = await supabase
          .from("accounts")
          .insert({
            user_id: u.user.id,
            name: name.trim(),
            type,
            starting_balance: Number(start),
            color,
            currency: currencyInput,
            image_url: finalImageUrl || null,
          } as any)
          .select()
          .single();

        setSaving(false);
        setUploadingImage(false);
        if (error) return toast.error(error.message);
        if (newAcc) {
          setAccountNetWorthInclusion(newAcc.id, includeInNetWorth);
        }
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

          {/* Include in Net Worth Option */}
          <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/20 my-1">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold cursor-pointer" htmlFor="networth-toggle">Include in Net Worth</Label>
              <p className="text-[10px] text-muted-foreground">
                Calculate balance in total Net Worth on Dashboard
              </p>
            </div>
            <Switch
              id="networth-toggle"
              checked={includeInNetWorth}
              onCheckedChange={setIncludeInNetWorth}
            />
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
                      size="sm" 
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

        <DialogFooter className="p-4 border-t gap-2 flex-row justify-between sm:justify-between items-center shrink-0">
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
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Account Transactions Filter Popup Dialog ─────────────────────────────────

interface AccountTransactionsDialogProps {
  account: Account | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  txns: Transaction[];
  cats: Category[];
  profileCurrency: string;
  onEditTxn: (txn: Transaction) => void;
}

function AccountTransactionsDialog({
  account,
  open,
  onOpenChange,
  txns,
  cats,
  profileCurrency,
  onEditTxn,
}: AccountTransactionsDialogProps) {
  if (!account) return null;

  const [kindFilter, setKindFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const catMap = useMemo(() => new Map(cats.map(c => [c.id, c])), [cats]);

  // All transactions for this account (source or destination of transfer)
  const accountTxns = useMemo(() => {
    return txns.filter(t => t.account_id === account.id || t.to_account_id === account.id);
  }, [txns, account.id]);

  // Unique months present in this account's transactions
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of accountTxns) {
      if (t.occurred_on) {
        set.add(t.occurred_on.slice(0, 7)); // "YYYY-MM"
      }
    }
    const arr = Array.from(set).sort().reverse();
    return arr.map(m => {
      const [yr, mn] = m.split("-").map(Number);
      const d = new Date(yr, mn - 1, 1);
      return {
        value: m,
        label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      };
    });
  }, [accountTxns]);

  function formatDateStr(y: number, m: number, d: number) {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function handleYearMonthChange(yr: string, mn: string) {
    setSelectedYear(yr);
    setSelectedMonth(mn);
    setPeriodFilter("all");
    
    if (yr === "all" && mn === "all") {
      setStartDate("");
      setEndDate("");
      return;
    }
    
    const targetYr = yr === "all" ? new Date().getFullYear() : Number(yr);
    
    if (mn !== "all") {
      const mnNum = Number(mn);
      const lastDay = new Date(targetYr, mnNum, 0).getDate();
      setStartDate(formatDateStr(targetYr, mnNum, 1));
      setEndDate(formatDateStr(targetYr, mnNum, lastDay));
    } else {
      setStartDate(`${targetYr}-01-01`);
      setEndDate(`${targetYr}-12-31`);
    }
  }

  function applyPreset(preset: "today" | "this_month" | "last_month" | "this_year" | "all") {
    const now = new Date();
    setPeriodFilter("all");
    if (preset === "all") {
      setSelectedYear("all");
      setSelectedMonth("all");
      setStartDate("");
      setEndDate("");
    } else if (preset === "today") {
      const todayStr = formatDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate());
      setSelectedYear(String(now.getFullYear()));
      setSelectedMonth(String(now.getMonth() + 1).padStart(2, "0"));
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "this_month") {
      handleYearMonthChange(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"));
    } else if (preset === "last_month") {
      const lastM = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      handleYearMonthChange(String(lastM.getFullYear()), String(lastM.getMonth() + 1).padStart(2, "0"));
    } else if (preset === "this_year") {
      handleYearMonthChange(String(now.getFullYear()), "all");
    }
  }

  const dateLabel = useMemo(() => {
    if (startDate && endDate) {
      if (startDate === endDate) return `Date: ${startDate}`;
      return `${startDate} → ${endDate}`;
    }
    if (startDate) return `From: ${startDate}`;
    if (endDate) return `Until: ${endDate}`;
    if (periodFilter !== "all") {
      if (periodFilter === "this_month") return "This Month";
      if (periodFilter === "last_month") return "Last Month";
      const m = monthOptions.find(o => o.value === periodFilter);
      return m ? m.label : periodFilter;
    }
    return "All Dates";
  }, [startDate, endDate, periodFilter, monthOptions]);

  // Filtered transactions
  const filtered = useMemo(() => {
    return accountTxns.filter(t => {
      // Kind filter
      if (kindFilter !== "all" && t.kind !== kindFilter) return false;

      // Date range or period filter
      if (startDate) {
        if (t.occurred_on < startDate) return false;
      }
      if (endDate) {
        if (t.occurred_on > endDate) return false;
      }
      if (!startDate && !endDate && periodFilter !== "all") {
        if (periodFilter === "this_month") {
          const now = new Date();
          const d = new Date(t.occurred_on);
          if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
        } else if (periodFilter === "last_month") {
          const d = new Date(t.occurred_on);
          const lm = new Date();
          lm.setMonth(lm.getMonth() - 1);
          if (d.getMonth() !== lm.getMonth() || d.getFullYear() !== lm.getFullYear()) return false;
        } else {
          if (!t.occurred_on || !t.occurred_on.startsWith(periodFilter)) return false;
        }
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const catName = t.category_id ? catMap.get(t.category_id)?.name?.toLowerCase() || "" : "";
        const noteStr = t.note ? t.note.toLowerCase() : "";
        const amtStr = String(t.amount);
        if (!catName.includes(q) && !noteStr.includes(q) && !amtStr.includes(q)) return false;
      }

      return true;
    });
  }, [accountTxns, kindFilter, periodFilter, startDate, endDate, search, catMap]);

  // Calculate filtered stats for this account
  const filteredIncome = useMemo(() => {
    return filtered
      .filter(t => t.kind === "income" || (t.kind === "transfer" && t.to_account_id === account.id))
      .reduce((s, t) => s + Number(t.amount), 0);
  }, [filtered, account.id]);

  const filteredExpense = useMemo(() => {
    return filtered
      .filter(t => t.kind === "expense" || (t.kind === "transfer" && t.account_id === account.id))
      .reduce((s, t) => s + Number(t.amount), 0);
  }, [filtered, account.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[85vh] sm:max-h-[700px] p-0 z-[100] overflow-hidden">
        {/* ── Pop-Up Date Filter Modal for Account Transactions ── */}
        <Dialog open={dateFilterOpen} onOpenChange={setDateFilterOpen}>
          <DialogContent className="max-w-md rounded-2xl z-[150]">
            <DialogHeader>
              <DialogTitle className="font-serif flex items-center gap-2">
                <Calendar className="h-5 w-5 text-accent" /> Filter by Date & Period
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Year & Month Selectors */}
              <div className="grid grid-cols-2 gap-3 bg-muted/40 p-3 rounded-xl border">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Year</label>
                  <Select value={selectedYear} onValueChange={(yr) => handleYearMonthChange(yr, selectedMonth)}>
                    <SelectTrigger className="w-full bg-background text-xs h-9">
                      <SelectValue placeholder="All Years" />
                    </SelectTrigger>
                    <SelectContent className="z-[160]">
                      <SelectItem value="all">All Years</SelectItem>
                      {[2028, 2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Month</label>
                  <Select value={selectedMonth} onValueChange={(mn) => handleYearMonthChange(selectedYear, mn)}>
                    <SelectTrigger className="w-full bg-background text-xs h-9">
                      <SelectValue placeholder="All Months" />
                    </SelectTrigger>
                    <SelectContent className="z-[160]">
                      <SelectItem value="all">All Months</SelectItem>
                      {[
                        { v: "01", l: "January" }, { v: "02", l: "February" }, { v: "03", l: "March" },
                        { v: "04", l: "April" }, { v: "05", l: "May" }, { v: "06", l: "June" },
                        { v: "07", l: "July" }, { v: "08", l: "August" }, { v: "09", l: "September" },
                        { v: "10", l: "October" }, { v: "11", l: "November" }, { v: "12", l: "December" },
                      ].map(m => (
                        <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* From Date & To Date Calendar Pickers */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">From Date</label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setPeriodFilter("all"); }}
                    className="w-full bg-background text-xs h-9 cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">To Date</label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setPeriodFilter("all"); }}
                    className="w-full bg-background text-xs h-9 cursor-pointer"
                  />
                </div>
              </div>

              {/* Quick Presets */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Quick Presets</label>
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => applyPreset("today")} className="text-[11px] h-7 px-2.5 rounded-lg cursor-pointer">Today</Button>
                  <Button variant="outline" size="sm" onClick={() => applyPreset("this_month")} className="text-[11px] h-7 px-2.5 rounded-lg cursor-pointer">This Month</Button>
                  <Button variant="outline" size="sm" onClick={() => applyPreset("last_month")} className="text-[11px] h-7 px-2.5 rounded-lg cursor-pointer">Last Month</Button>
                  <Button variant="outline" size="sm" onClick={() => applyPreset("this_year")} className="text-[11px] h-7 px-2.5 rounded-lg cursor-pointer">This Year</Button>
                  <Button variant="outline" size="sm" onClick={() => applyPreset("all")} className="text-[11px] h-7 px-2.5 rounded-lg cursor-pointer">All Time</Button>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between pt-2">
              <Button
                variant="ghost"
                onClick={() => applyPreset("all")}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Clear Filter
              </Button>
              <Button onClick={() => setDateFilterOpen(false)} className="text-xs font-bold cursor-pointer">
                Apply Filter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DialogHeader className="p-4 border-b flex flex-row items-center justify-between gap-3 space-y-0 bg-card">
          <div className="flex items-center gap-3 min-w-0">
            {(account as any).image_url ? (
              <img src={(account as any).image_url} alt="" className="h-8 w-8 rounded-full object-cover shrink-0 border border-border/40" />
            ) : (
              <span className="h-4 w-4 rounded-full shrink-0" style={{ background: account.color }} />
            )}
            <div className="min-w-0">
              <DialogTitle className="font-serif text-lg font-bold truncate flex items-center gap-2">
                <span>{account.name}</span>
                <Badge variant="outline" className="text-[10px] font-normal uppercase tracking-wider">
                  {TYPE_LABELS[account.type] ?? account.type}
                </Badge>
              </DialogTitle>
              <p className="text-xs text-muted-foreground">Account Transactions & Filtering</p>
            </div>
          </div>
        </DialogHeader>

        {/* Filter Controls & Summary Strip */}
        <div className="p-4 bg-muted/20 border-b space-y-3 shrink-0">
          {/* Summary Badges */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-card p-2.5 rounded-xl border text-left">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Filtered Income</span>
              <span className="font-serif num text-xs sm:text-sm font-bold text-[color:var(--success)]">+{fmtMoney(filteredIncome, profileCurrency)}</span>
            </div>
            <div className="bg-card p-2.5 rounded-xl border text-left">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-semibold">Filtered Outflow</span>
              <span className="font-serif num text-xs sm:text-sm font-bold text-[color:var(--destructive)]">−{fmtMoney(filteredExpense, profileCurrency)}</span>
            </div>
            <div className="bg-card p-2.5 rounded-xl border text-left">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-semibold">Total Records</span>
              <span className="font-serif num text-xs sm:text-sm font-bold">{filtered.length} items</span>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            {/* Kind filter */}
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="h-8 text-xs bg-background"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent className="z-[110]">
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="income">Income Only</SelectItem>
                <SelectItem value="expense">Expense Only</SelectItem>
                <SelectItem value="transfer">Transfers</SelectItem>
              </SelectContent>
            </Select>
            {/* Date Pop-Up Filter Trigger */}
            <Button
              variant="outline"
              onClick={() => setDateFilterOpen(true)}
              className="h-8 text-xs bg-background flex items-center justify-between gap-1.5 px-2.5 rounded-md cursor-pointer border"
            >
              <span className="flex items-center gap-1.5 truncate font-medium">
                <Calendar className="h-3.5 w-3.5 text-accent shrink-0" />
                <span className="truncate">{dateLabel}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </Button>

            {/* Search Input */}
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search notes/category..."
              className="h-8 text-xs bg-background"
            />
          </div>
        </div>

        {/* Transactions List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 thin-scroll">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No transactions found for this account matching active filters.
            </div>
          ) : (
            filtered.map((t) => {
              const cat = t.category_id ? catMap.get(t.category_id) : null;
              const isIncome = t.kind === "income" || (t.kind === "transfer" && t.to_account_id === account.id);
              const sign = isIncome ? "+" : "−";
              const amtColor = isIncome ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]";

              return (
                <div
                  key={t.id}
                  onClick={() => {
                    onOpenChange(false);
                    onEditTxn(t);
                  }}
                  className="flex items-center justify-between p-3 rounded-xl border bg-card hover:bg-accent/5 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-base h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      {cat?.icon ?? (t.kind === "transfer" ? "🔄" : "💵")}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-serif font-bold truncate">
                          {cat?.name ?? (t.kind === "transfer" ? "Transfer" : "Uncategorized")}
                        </span>
                        <Badge variant="outline" className="capitalize text-[8px] px-1 py-0 leading-none">
                          {t.kind}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {new Date(t.occurred_on).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        {t.note ? ` · "${t.note}"` : ""}
                      </div>
                    </div>
                  </div>
                  <span className={`font-serif num font-bold text-xs sm:text-sm shrink-0 ml-2 ${amtColor}`}>
                    {sign}{fmtMoney(Number(t.amount), profileCurrency)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function AccountsPage() {
  const qc = useQueryClient();
  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const { data: txns = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => api.listTransactions(1000) });
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: api.listCategories });
  const { currency: profileCurrency } = useUserProfile();

  const balances = computeAccountBalances(accounts, txns);

  const [accountView, setAccountView] = useState<"net_worth" | "non_net_worth">("net_worth");
  const [newOpen, setNewOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<{ id: string; name: string } | null>(null);
  const [viewingTxnAccount, setViewingTxnAccount] = useState<Account | null>(null);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);

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

  const filteredAccounts = useMemo(() => {
    if (accountView === "net_worth") {
      return accounts.filter(a => isAccountIncludedInNetWorth(a));
    }
    if (accountView === "non_net_worth") {
      return accounts.filter(a => !isAccountIncludedInNetWorth(a));
    }
    return accounts;
  }, [accounts, accountView]);

  const viewTotalWorth = useMemo(() => {
    return filteredAccounts.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);
  }, [filteredAccounts, balances]);

  const viewAccountIds = useMemo(() => new Set(filteredAccounts.map(a => a.id)), [filteredAccounts]);

  const now = new Date();
  const currentMonthTxns = useMemo(() => {
    return txns.filter(t => {
      const d = new Date(t.occurred_on);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }, [txns]);

  const netWorthAccountIds = useMemo(() => {
    return new Set(accounts.filter(a => isAccountIncludedInNetWorth(a)).map(a => a.id));
  }, [accounts]);

  const viewIncome = useMemo(() => {
    if (accountView === "net_worth") {
      return currentMonthTxns
        .filter(t => isTransactionIncomeForNetWorth(t, netWorthAccountIds))
        .reduce((s, t) => s + Number(t.amount), 0);
    }
    // Non Net Worth view
    return currentMonthTxns
      .filter(t => {
        if (t.kind === "income") return viewAccountIds.has(t.account_id);
        if (t.kind === "transfer" && t.to_account_id) return viewAccountIds.has(t.to_account_id) && !viewAccountIds.has(t.account_id);
        return false;
      })
      .reduce((s, t) => s + Number(t.amount), 0);
  }, [currentMonthTxns, viewAccountIds, accountView, netWorthAccountIds]);

  const viewExpense = useMemo(() => {
    if (accountView === "net_worth") {
      return currentMonthTxns
        .filter(t => isTransactionExpenseForNetWorth(t, netWorthAccountIds))
        .reduce((s, t) => s + Number(t.amount), 0);
    }
    // Non Net Worth view
    return currentMonthTxns
      .filter(t => {
        if (t.kind === "expense") return viewAccountIds.has(t.account_id);
        if (t.kind === "transfer" && t.to_account_id) return viewAccountIds.has(t.account_id) && !viewAccountIds.has(t.to_account_id);
        return false;
      })
      .reduce((s, t) => s + Number(t.amount), 0);
  }, [currentMonthTxns, viewAccountIds, accountView, netWorthAccountIds]);

  return (
    <div className="space-y-6 w-full">
      {/* ── Top Bar Header & Net Worth / Non Net Worth View Toggle (Sticky on Mobile) ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md pt-2 pb-3 border-b shadow-sm sm:shadow-none sm:border-b sm:pt-0 sm:pb-4 sm:static flex flex-col md:flex-row md:items-center justify-between gap-3 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-col sm:items-start">
          <h1 className="font-serif text-xl sm:text-2xl font-bold">Accounts</h1>
          
          {/* Toggle Option Buttons */}
          <div className="flex items-center gap-1 p-1 bg-muted/40 border rounded-xl w-fit">
            <Button
              variant={accountView === "net_worth" ? "default" : "ghost"}
              size="sm"
              onClick={() => setAccountView("net_worth")}
              className="text-[11px] sm:text-xs h-7 px-2.5 rounded-lg cursor-pointer font-medium"
            >
              🌐 Net Worth
            </Button>
            <Button
              variant={accountView === "non_net_worth" ? "default" : "ghost"}
              size="sm"
              onClick={() => setAccountView("non_net_worth")}
              className="text-[11px] sm:text-xs h-7 px-2.5 rounded-lg cursor-pointer font-medium"
            >
              🚫 Non Net Worth
            </Button>
          </div>
        </div>

        {/* Dynamic Summary Cards for Active View — Compact Grid on Mobile & Spacious on Desktop */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full md:w-auto">
          <div className="bg-card px-2.5 sm:px-5 py-2 sm:py-3 rounded-xl sm:rounded-2xl border min-w-0 md:min-w-[190px] flex-1 shadow-sm flex flex-col justify-center text-center sm:text-left">
            <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground block font-bold mb-0.5 truncate">
              {accountView === "net_worth" ? "Net Worth" : "Non NW Total"}
            </span>
            <span className="font-serif num text-xs sm:text-xl font-bold text-foreground truncate">
              {fmtMoney(viewTotalWorth, profileCurrency)}
            </span>
          </div>

          <div className="bg-card px-2.5 sm:px-5 py-2 sm:py-3 rounded-xl sm:rounded-2xl border min-w-0 md:min-w-[190px] flex-1 shadow-sm flex flex-col justify-center text-center sm:text-left">
            <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground block font-bold mb-0.5 truncate">Income</span>
            <span className="font-serif num text-xs sm:text-xl font-bold text-[color:var(--success)] truncate">
              +{fmtMoney(viewIncome, profileCurrency)}
            </span>
          </div>

          <div className="bg-card px-2.5 sm:px-5 py-2 sm:py-3 rounded-xl sm:rounded-2xl border min-w-0 md:min-w-[190px] flex-1 shadow-sm flex flex-col justify-center text-center sm:text-left">
            <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-muted-foreground block font-bold mb-0.5 truncate">Expense</span>
            <span className="font-serif num text-xs sm:text-xl font-bold text-[color:var(--destructive)] truncate">
              −{fmtMoney(viewExpense, profileCurrency)}
            </span>
          </div>
        </div>
      </div>

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

      {/* ── Account Transactions Filter Popup Dialog ── */}
      <AccountTransactionsDialog
        account={viewingTxnAccount}
        open={!!viewingTxnAccount}
        onOpenChange={(v) => !v && setViewingTxnAccount(null)}
        txns={txns}
        cats={cats}
        profileCurrency={profileCurrency}
        onEditTxn={(t) => setEditingTxn(t)}
      />

      {/* ── Edit Transaction Dialog ── */}
      <TransactionDialog
        open={!!editingTxn}
        onOpenChange={(v) => !v && setEditingTxn(null)}
        editingTransaction={editingTxn}
      />

      {/* ── Account cards grid ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredAccounts.map((a) => (
          <div
            key={a.id}
            onClick={() => setEditAccount(a)}
            className="rounded-xl border bg-card p-4 relative group transition-all hover:shadow-md hover:border-accent/40 cursor-pointer flex flex-col justify-between"
          >
            <div>
              {/* Card Top Header: Type Label + Eye Button */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {(a as any).image_url ? (
                    <img 
                      src={(a as any).image_url} 
                      alt={a.name} 
                      className="h-5 w-5 rounded-full object-cover flex-shrink-0 border border-border/40" 
                    />
                  ) : (
                    <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: a.color }} />
                  )}
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium truncate">{TYPE_LABELS[a.type] ?? a.type}</span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingTxnAccount(a);
                    }}
                    className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/10 cursor-pointer"
                    title="View Account Transactions"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Name & Excluded Badge */}
              <div className="mt-2 flex items-center justify-between gap-2">
                <h3 className="font-serif text-base font-bold truncate">{a.name}</h3>
                {!isAccountIncludedInNetWorth(a) && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground/80 bg-muted/30 border-border/50 shrink-0" title="Excluded from Net Worth">
                    Excluded NW
                  </Badge>
                )}
              </div>

              {/* Balance */}
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
