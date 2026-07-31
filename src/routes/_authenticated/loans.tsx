import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMoney, computeAccountBalances } from "@/lib/finance";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Pencil, Plus, TrendingDown, TrendingUp, CheckCircle2, Clock, CircleDollarSign, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/searchable-select";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/_authenticated/loans")({
  component: LoansPage,
  head: () => ({ meta: [{ title: "Loans & Debts — FinorAsset" }] }),
});

interface Loan {
  id: string;
  person_name: string;
  amount: number;
  kind: "borrowed" | "lent";
  status: "active" | "paid";
  note?: string;
  due_date?: string;
  occurred_on: string;
  account_id?: string;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

function LoansPage() {
  const qc = useQueryClient();
  const { currency, authUser } = useUserProfile();

  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: api.listCategories });
  const { data: txns = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => api.listTransactions(1000) });

  const balances = computeAccountBalances(accounts, txns);

  // Dialog states
  const [open, setOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [deleteLoan, setDeleteLoan] = useState<{ id: string; name: string } | null>(null);
  const [repayLoan, setRepayLoan] = useState<Loan | null>(null);

  // View and summary states (matching accounts page)
  const [loanView, setLoanView] = useState<"all" | "borrowed" | "lent">("all");
  const [showSummary, setShowSummary] = useState(false);

  // Mobile collapse and click details popup states
  const [borrowedCollapsed, setBorrowedCollapsed] = useState(true);
  const [lentCollapsed, setLentCollapsed] = useState(true);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [borrowedListOpen, setBorrowedListOpen] = useState(false);
  const [lentListOpen, setLentListOpen] = useState(false);

  // Form states
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"borrowed" | "lent">("borrowed");
  const [status, setStatus] = useState<"active" | "paid">("active");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().split("T")[0]);
  const [accountId, setAccountId] = useState<string>("none");
  const [isSplit, setIsSplit] = useState(false);
  const [accountSplits, setAccountSplits] = useState<{ accountId: string; amount: number }[]>([
    { accountId: "none", amount: 0 }
  ]);
  const [repaySplits, setRepaySplits] = useState<{ accountId: string; amount: number }[]>([
    { accountId: "none", amount: 0 }
  ]);

  // Load loans — try localStorage first (instant), then Supabase as background upgrade
  function loadLocalLoans(): Loan[] {
    const stored = localStorage.getItem("finorasset_loans");
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.map((l: any) => ({
          id: l.id || generateId(),
          person_name: l.person_name || "Unknown",
          amount: Number(l.amount || 0),
          kind: l.kind === "lent" ? "lent" : "borrowed",
          status: l.status === "paid" ? "paid" : "active",
          note: l.note || "",
          due_date: l.due_date || "",
          occurred_on: l.occurred_on || new Date().toISOString().split("T")[0],
          account_id: l.account_id || "",
        }));
      }
    } catch {
      return [];
    }
    return [];
  }

  const { data: loans = [] } = useQuery({
    queryKey: ["loans"],
    enabled: !!authUser,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loans")
        .select("*")
        .order("occurred_on", { ascending: false });

      if (error) {
        if (error.code === "42P01") return loadLocalLoans();
        throw error;
      }

      const dbLoans = (data as any[]).map(l => ({
        ...l,
        amount: Number(l.amount),
      })) as Loan[];

      if (Array.isArray(dbLoans) && dbLoans.length > 0) {
        try {
          localStorage.setItem("finorasset_loans", JSON.stringify(dbLoans));
        } catch {}
        return dbLoans;
      }

      return loadLocalLoans();
    }
  });

  // Sync back to local storage whenever queries change
  useEffect(() => {
    if (loans.length > 0) {
      localStorage.setItem("finorasset_loans", JSON.stringify(loans));
    }
  }, [loans]);

  // Auto-select first account for new loans
  useEffect(() => {
    if (open && accounts.length && (accountId === "none" || !accountId) && !editingLoan) {
      setAccountId(accounts[0].id);
      setAccountSplits([{ accountId: accounts[0].id, amount: Number(amount) || 0 }]);
    }
  }, [open, accounts, accountId, editingLoan, amount]);

  // Helper to find category ID dynamically
  const findLoanCategory = (targetName: "Borrow" | "Lent", txnKind: "income" | "expense") => {
    return cats.find(c => c.name.toLowerCase() === targetName.toLowerCase() && c.kind === txnKind)?.id || null;
  };

  // Form submission: save or update
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!authUser) return toast.error("Not logged in");
    if (!personName.trim()) return toast.error("Please enter a name");
    if (!amount || Number(amount) <= 0) return toast.error("Please enter a valid amount");

    const accMap = new Map(accounts.map(a => [a.id, a]));

    // Splits validation for new loans
    if (!editingLoan) {
      if (isSplit) {
        const totalAllocated = accountSplits.reduce((sum, s) => sum + s.amount, 0);
        if (totalAllocated !== Number(amount)) {
          return toast.error(`Total split amount (${fmtMoney(totalAllocated, currency)}) must match the loan amount (${fmtMoney(Number(amount), currency)})`);
        }

        if (kind === "lent") {
          for (const split of accountSplits) {
            if (split.accountId !== "none") {
              const balance = balances.get(split.accountId) ?? 0;
              if (balance < split.amount) {
                return toast.error(`Insufficient funds in ${accMap.get(split.accountId)?.name || 'selected account'}. Available: ${fmtMoney(balance, currency)}, required: ${fmtMoney(split.amount, currency)}`);
              }
            }
          }
        }
      } else {
        // Single account balance check
        if (kind === "lent" && accountId !== "none") {
          const balance = balances.get(accountId) ?? 0;
          if (balance < Number(amount)) {
            return toast.error(`Insufficient funds in ${accMap.get(accountId)?.name || 'selected account'}. Available: ${fmtMoney(balance, currency)}, required: ${fmtMoney(Number(amount), currency)}`);
          }
        }
      }
    }

    const firstValidAccount = accountSplits.find(s => s.accountId !== "none")?.accountId || null;

    const payload = {
      person_name: personName.trim(),
      amount: Number(amount),
      kind,
      status,
      note: note.trim() || null,
      due_date: dueDate || null,
      occurred_on: occurredOn,
      account_id: editingLoan ? (accountId === "none" ? null : accountId) : (isSplit ? firstValidAccount : (accountId === "none" ? null : accountId)),
    };

    setOpen(false);
    setLoading(true);

    try {
      if (editingLoan) {
        // Update
        const { error } = await supabase.from("loans").update(payload).eq("id", editingLoan.id);
        if (error) {
          if (error.code === "42P01") {
            const updated = loans.map((l) => (l.id === editingLoan.id ? { ...l, ...payload } : l));
            localStorage.setItem("finorasset_loans", JSON.stringify(updated));
            qc.setQueryData(["loans", authUser?.id], updated);
            toast.success("Loan updated locally");
          } else {
            throw error;
          }
        } else {
          toast.success("Loan updated");
          qc.invalidateQueries({ queryKey: ["loans"] });
        }
      } else {
        // Insert loan (DB or local fallback)
        const newId = generateId();
        const { error } = await supabase.from("loans").insert({ ...payload, user_id: authUser.id });
        if (error) {
          if (error.code === "42P01") {
            const updated = [{ id: newId, ...payload }, ...loans];
            localStorage.setItem("finorasset_loans", JSON.stringify(updated));
            qc.setQueryData(["loans", authUser?.id], updated);
            toast.success("Loan created locally");
          } else {
            throw error;
          }
        } else {
          toast.success("Loan created");
          qc.invalidateQueries({ queryKey: ["loans"] });
        }

        // Always create transactions in the transactions table if accounts are linked
        if (isSplit) {
          let txnRecorded = false;
          for (const split of accountSplits) {
            if (split.accountId !== "none") {
              const txnKind = (kind === "borrowed" ? "income" : "expense") as "income" | "expense";
              const catId = findLoanCategory(kind === "borrowed" ? "Borrow" : "Lent", txnKind);
              const txnPayload: Record<string, any> = {
                user_id: authUser?.id,
                account_id: split.accountId,
                amount: Number(split.amount),
                kind: txnKind,
                note: `Loan: ${kind === "borrowed" ? "Borrowed from" : "Lent to"} ${personName.trim()}${note.trim() ? ` (${note.trim()})` : ""}`,
                occurred_on: occurredOn,
              };
              if (catId) txnPayload.category_id = catId;
              const { error: txnErr } = await supabase.from("transactions").insert(txnPayload);
              if (txnErr) {
                console.error("Transaction insert error:", JSON.stringify(txnErr));
                toast.error(`Transaction failed for ${accMap.get(split.accountId)?.name || 'account'}: ${txnErr.message}`);
              } else {
                txnRecorded = true;
              }
            }
          }
          if (txnRecorded) {
            toast.success("Split transactions recorded!");
          }
        } else {
          if (accountId !== "none") {
            const txnKind = (kind === "borrowed" ? "income" : "expense") as "income" | "expense";
            const catId = findLoanCategory(kind === "borrowed" ? "Borrow" : "Lent", txnKind);
            const txnPayload = {
              user_id: authUser?.id,
              account_id: accountId,
              amount: Number(amount),
              kind: txnKind,
              note: `Loan: ${kind === "borrowed" ? "Borrowed from" : "Lent to"} ${personName.trim()}${note.trim() ? ` (${note.trim()})` : ""}`,
              occurred_on: occurredOn,
              category_id: catId || undefined,
            };
            const { error: txnErr } = await supabase.from("transactions").insert(txnPayload as any);
            if (txnErr) {
              toast.error(`Transaction failed: ${txnErr.message}`);
            } else {
              toast.success("Transaction recorded!");
            }
          }
        }
        qc.invalidateQueries({ queryKey: ["transactions"] });
        qc.invalidateQueries({ queryKey: ["accounts"] });
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
      resetForm();
    }
  }

  // Trigger repayment modal
  function triggerRepayment(loan: Loan) {
    setRepayLoan(loan);
    setRepaySplits([{ accountId: loan.account_id || accounts[0]?.id || "none", amount: loan.amount }]);
  }

  // Toggle status
  async function toggleStatus(loan: Loan) {
    if (!authUser) return;
    if (loan.status === "active") {
      triggerRepayment(loan);
    } else {
      setLoading(true);
      try {
        const { error } = await supabase.from("loans").update({ status: "active" }).eq("id", loan.id);
        if (error) {
          if (error.code === "42P01") {
            const updated = loans.map((l) => (l.id === loan.id ? { ...l, status: "active" as const } : l));
            localStorage.setItem("finorasset_loans", JSON.stringify(updated));
            qc.setQueryData(["loans", authUser.id], updated);
            toast.success("Status updated locally");
          } else {
            throw error;
          }
        } else {
          // Delete any balancing repayment transactions
          const person = loan.person_name.trim();
          await supabase
            .from("transactions")
            .delete()
            .eq("user_id", authUser.id)
            .eq("account_id", loan.account_id || "")
            .ilike("note", `Repayment: ${person}%`);

          toast.success("Marked as active");
          qc.invalidateQueries({ queryKey: ["loans"] });
          qc.invalidateQueries({ queryKey: ["transactions"] });
          qc.invalidateQueries({ queryKey: ["accounts"] });
        }
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    }
  }

  // Submit repayment dialog splits
  async function handleRepaySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!repayLoan) return;

    const totalAllocated = repaySplits.reduce((sum, s) => sum + s.amount, 0);
    if (totalAllocated !== repayLoan.amount) {
      return toast.error(`Total repayment splits (${fmtMoney(totalAllocated, currency)}) must match the loan amount (${fmtMoney(repayLoan.amount, currency)})`);
    }

    const accMap = new Map(accounts.map(a => [a.id, a]));

    // If borrowing, repaying it means money leaves our account -> validate balance
    if (repayLoan.kind === "borrowed") {
      for (const split of repaySplits) {
        if (split.accountId !== "none") {
          const balance = balances.get(split.accountId) ?? 0;
          if (balance < split.amount) {
            return toast.error(`Insufficient funds in ${accMap.get(split.accountId)?.name || 'selected account'}. Available: ${fmtMoney(balance, currency)}, required: ${fmtMoney(split.amount, currency)}`);
          }
        }
      }
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("loans").update({ status: "paid" }).eq("id", repayLoan.id);
      if (error) {
        if (error.code === "42P01") {
          const updated = loans.map((l) => (l.id === repayLoan.id ? { ...l, status: "paid" as const } : l));
          localStorage.setItem("finorasset_loans", JSON.stringify(updated));
          qc.setQueryData(["loans", authUser?.id], updated);
          toast.success("Status updated locally");
        } else {
          throw error;
        }
      } else {
        // Create repayment transactions
        let txnRecorded = false;
        for (const split of repaySplits) {
          if (split.accountId !== "none") {
            const txnKind = (repayLoan.kind === "borrowed" ? "expense" : "income") as "income" | "expense";
            const catId = findLoanCategory(repayLoan.kind === "borrowed" ? "Lent" : "Borrow", txnKind);
            const txnPayload = {
              user_id: authUser?.id,
              account_id: split.accountId,
              amount: Number(split.amount),
              kind: txnKind,
              note: `Repayment: ${repayLoan.person_name}${repayLoan.note ? ` (${repayLoan.note})` : ""}`,
              occurred_on: new Date().toISOString().split("T")[0],
              category_id: catId || undefined,
            };
            const { error: txnErr } = await supabase.from("transactions").insert(txnPayload as any);
            if (txnErr) {
              console.error("Repayment Txn Error:", txnErr);
              toast.error(`Failed to record repayment for ${accMap.get(split.accountId)?.name || 'account'}: ${txnErr.message}`);
            } else {
              txnRecorded = true;
            }
          }
        }
        if (txnRecorded) {
          toast.success("Repayment transaction(s) recorded!");
        }
        toast.success("Marked as paid");
        qc.invalidateQueries({ queryKey: ["loans"] });
        qc.invalidateQueries({ queryKey: ["transactions"] });
        qc.invalidateQueries({ queryKey: ["accounts"] });
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
      setRepayLoan(null);
    }
  }

  // Delete confirm
  async function confirmDelete(id: string) {
    if (!authUser) return;
    try {
      const loan = loans.find((l) => l.id === id);
      if (loan) {
        const person = loan.person_name.trim();
        // Delete linked transactions first
        await supabase
          .from("transactions")
          .delete()
          .eq("user_id", authUser.id)
          .eq("account_id", loan.account_id || "")
          .or(`note.ilike.Loan: %${person}%,note.ilike.Repayment: %${person}%`);
      }

      const { error } = await supabase.from("loans").delete().eq("id", id);
      if (error) {
        if (error.code === "42P01") {
          const updated = loans.filter((l) => l.id !== id);
          localStorage.setItem("finorasset_loans", JSON.stringify(updated));
          qc.setQueryData(["loans", authUser.id], updated);
          toast.success("Loan deleted locally");
        } else {
          throw error;
        }
      } else {
        toast.success("Loan deleted");
        qc.invalidateQueries({ queryKey: ["loans"] });
        qc.invalidateQueries({ queryKey: ["transactions"] });
        qc.invalidateQueries({ queryKey: ["accounts"] });
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setEditingLoan(null);
    setPersonName("");
    setAmount("");
    setKind("borrowed");
    setStatus("active");
    setDueDate("");
    setNote("");
    setOccurredOn(new Date().toISOString().split("T")[0]);
    setAccountId("none");
  };

  const handleEdit = (loan: Loan) => {
    setEditingLoan(loan);
    setPersonName(loan.person_name);
    setAmount(String(loan.amount));
    setKind(loan.kind);
    setStatus(loan.status);
    setDueDate(loan.due_date || "");
    setNote(loan.note || "");
    setOccurredOn(loan.occurred_on);
    setAccountId(loan.account_id || "none");
    setOpen(true);
  };

  // Calculations
  const activeBorrowed = loans.filter(l => l.kind === "borrowed" && l.status === "active").reduce((sum, l) => sum + l.amount, 0);
  const activeLent = loans.filter(l => l.kind === "lent" && l.status === "active").reduce((sum, l) => sum + l.amount, 0);
  const netBalance = activeLent - activeBorrowed; // positive means others owe you

  const accMap = new Map(accounts.map(a => [a.id, a]));

  const accountOptions = [
    { value: "none", label: "Do not link account" },
    ...accounts.map(a => ({
      value: a.id,
      label: `${a.name} (${fmtMoney(balances.get(a.id) ?? 0, currency)})`,
      imageUrl: (a as any).image_url,
      icon: (a as any).image_url ? undefined : <span className="h-2.5 w-2.5 rounded-full inline-block shrink-0" style={{ background: a.color }} />
    }))
  ];

  const displayedLoans = loans.filter((l) => {
    if (loanView === "borrowed") return l.kind === "borrowed";
    if (loanView === "lent") return l.kind === "lent";
    return true;
  });

  return (
    <div className="space-y-6 w-full pb-10">
      {/* ── Top Bar Header & Floatable / Collapsible Summary Block ── */}
      <div className="sticky top-[96px] md:top-[80px] -mt-4 md:-mt-6 -mx-4 px-4 md:-mx-6 md:px-6 py-2 bg-background/95 backdrop-blur-md border-b shadow-sm space-y-2 z-20 mb-4">
        {/* Main Header Row: Toggles (Left) + View Summary Button (Right) */}
        <div className="flex items-center justify-between gap-1.5 flex-nowrap overflow-x-auto thin-scroll">
          {/* Toggle Option Buttons — Micro-Compact h-6 (24px), clean text without emojis */}
          <div className="flex items-center gap-0.5 p-0.5 bg-muted/60 border rounded-md shrink-0 relative z-30">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLoanView("all");
              }}
              className={`h-6 px-2 text-[10px] sm:text-[11px] font-bold rounded cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 transition-all ${
                loanView === "all"
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <span>All</span>
              <span className={`text-[8px] sm:text-[9px] px-1 py-0 rounded-full font-bold ${
                loanView === "all" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {loans.length}
              </span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLoanView("borrowed");
              }}
              className={`h-6 px-2 text-[10px] sm:text-[11px] font-bold rounded cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 transition-all ${
                loanView === "borrowed"
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <span>Borrowed</span>
              <span className={`text-[8px] sm:text-[9px] px-1 py-0 rounded-full font-bold ${
                loanView === "borrowed" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {loans.filter(l => l.kind === "borrowed").length}
              </span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLoanView("lent");
              }}
              className={`h-6 px-2 text-[10px] sm:text-[11px] font-bold rounded cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 transition-all ${
                loanView === "lent"
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <span>Lent</span>
              <span className={`text-[8px] sm:text-[9px] px-1 py-0 rounded-full font-bold ${
                loanView === "lent" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {loans.filter(l => l.kind === "lent").length}
              </span>
            </button>
          </div>

          {/* Web View (Desktop): Direct Inline Summary Pills matching toggle button height & style */}
          <div className="hidden md:flex items-center gap-1.5 ml-auto shrink-0">
            <div className="h-6 px-2.5 text-[11px] font-bold rounded-md bg-muted/60 border flex items-center gap-1.5">
              <span className="text-muted-foreground uppercase text-[9px]">Net Debt:</span>
              <span className={`font-serif num ${netBalance >= 0 ? "text-success" : "text-destructive"}`}>
                {netBalance >= 0 ? "+" : ""}{fmtMoney(netBalance, currency)}
              </span>
            </div>

            <div className="h-6 px-2.5 text-[11px] font-bold rounded-md bg-muted/60 border flex items-center gap-1.5">
              <span className="text-muted-foreground uppercase text-[9px]">Borrowed:</span>
              <span className="font-serif num text-destructive">{fmtMoney(activeBorrowed, currency)}</span>
            </div>

            <div className="h-6 px-2.5 text-[11px] font-bold rounded-md bg-muted/60 border flex items-center gap-1.5">
              <span className="text-muted-foreground uppercase text-[9px]">Lent:</span>
              <span className="font-serif num text-success">{fmtMoney(activeLent, currency)}</span>
            </div>
          </div>

          {/* Mobile View: Floatable Summary Trigger Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowSummary(!showSummary)}
            className="md:hidden h-6 px-2 text-[10px] font-bold gap-1 rounded-md border-accent/40 hover:border-accent hover:bg-accent/10 transition-all cursor-pointer shadow-2xs shrink-0 ml-auto"
          >
            <span>{showSummary ? "Hide" : "Summary"}</span>
            <span className="font-serif num font-bold text-accent">
              ({fmtMoney(loanView === "borrowed" ? activeBorrowed : loanView === "lent" ? activeLent : netBalance, currency)})
            </span>
            <ChevronDown className={`h-2.5 w-2.5 text-accent transition-transform duration-200 ${showSummary ? "rotate-180" : ""}`} />
          </Button>
        </div>

        {/* Collapsible Summary Panel (Mobile View Only) */}
        {showSummary && (
          <div className="md:hidden p-3 rounded-2xl bg-card border shadow-lg border-accent/20 animate-in fade-in slide-in-from-top-2 duration-200 mt-2">
            <div className="grid grid-cols-3 gap-1.5 w-full">
              <div className="bg-background px-2 py-2 rounded-xl border shadow-xs flex flex-col justify-center text-center">
                <span className="text-[8px] uppercase tracking-wider text-muted-foreground block font-bold mb-0.5 truncate">Net Debt</span>
                <span className={`font-serif num text-[11px] font-bold truncate ${netBalance >= 0 ? "text-success" : "text-destructive"}`}>
                  {netBalance >= 0 ? "+" : ""}{fmtMoney(netBalance, currency)}
                </span>
              </div>

              <div className="bg-background px-2 py-2 rounded-xl border shadow-xs flex flex-col justify-center text-center">
                <span className="text-[8px] uppercase tracking-wider text-muted-foreground block font-bold mb-0.5 truncate">Borrowed</span>
                <span className="font-serif num text-[11px] font-bold text-destructive truncate">
                  {fmtMoney(activeBorrowed, currency)}
                </span>
              </div>

              <div className="bg-background px-2 py-2 rounded-xl border shadow-xs flex flex-col justify-center text-center">
                <span className="text-[8px] uppercase tracking-wider text-muted-foreground block font-bold mb-0.5 truncate">Lent</span>
                <span className="font-serif num text-[11px] font-bold text-success truncate">
                  {fmtMoney(activeLent, currency)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayedLoans.length === 0 && (
          <div className="col-span-full rounded-2xl border bg-card/60 p-12 text-center text-muted-foreground space-y-2">
            <div className="h-10 w-10 mx-auto rounded-full bg-accent/10 flex items-center justify-center text-accent mb-2">
              <CircleDollarSign className="h-5 w-5" />
            </div>
            <p className="font-semibold text-foreground">No loan records found</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              {loanView === "borrowed"
                ? "No borrowed loans recorded yet."
                : loanView === "lent"
                ? "No lent loans recorded yet."
                : "Click the + button to add a new borrowed or lent loan."}
            </p>
          </div>
        )}

        {displayedLoans.map((loan) => {
          const acc = loan.account_id ? accMap.get(loan.account_id) : null;
          const isPaid = loan.status === "paid";
          const isBorrowed = loan.kind === "borrowed";

          const occurredDateFormatted = loan.occurred_on
            ? new Date(loan.occurred_on).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            : "N/A";

          const dueDateFormatted = loan.due_date
            ? new Date(loan.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            : null;

          return (
            <div
              key={loan.id}
              className={`group relative rounded-2xl border transition-all hover:shadow-lg hover:border-accent/40 overflow-hidden flex flex-row min-h-[160px] ${
                isPaid
                  ? "bg-card/60 opacity-70 grayscale-[25%] hover:opacity-90 hover:grayscale-0 border-border/40"
                  : isBorrowed
                  ? "bg-card hover:bg-accent/[0.02]"
                  : "bg-card hover:bg-accent/[0.02]"
              }`}
            >
              {/* Left 1/3 Column: Visual Icon & Type */}
              <div className="w-1/3 shrink-0 relative bg-muted flex items-center justify-center border-r border-border/40 overflow-hidden">
                <div
                  className={`h-full w-full flex flex-col items-center justify-center p-2 text-center bg-gradient-to-br ${
                    isBorrowed
                      ? "from-destructive/15 via-muted to-destructive/5 text-destructive"
                      : "from-emerald-500/15 via-muted to-emerald-500/5 text-emerald-600"
                  }`}
                >
                  {isBorrowed ? (
                    <TrendingDown className="h-9 w-9 mb-1 opacity-90 drop-shadow-2xs" />
                  ) : (
                    <TrendingUp className="h-9 w-9 mb-1 opacity-90 drop-shadow-2xs" />
                  )}
                  <span className="text-[9px] font-bold tracking-wider uppercase text-muted-foreground/80">
                    {isBorrowed ? "Borrowed" : "Lent"}
                  </span>
                </div>

                {/* Amount Badge Overlaid on Left Block */}
                <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-md px-1.5 py-0.5 rounded border border-border/60 shadow-2xs">
                  <span className={`font-serif num font-black text-[10px] ${isBorrowed ? "text-destructive" : "text-emerald-600"}`}>
                    {fmtMoney(Number(loan.amount), currency)}
                  </span>
                </div>
              </div>

              {/* Right 2/3 Column: Details & Quick Actions */}
              <div className="w-2/3 p-3.5 flex flex-col justify-between min-w-0">
                <div className="space-y-1.5">
                  {/* Title & Status Badge */}
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="font-serif font-black text-sm sm:text-base text-foreground truncate" title={loan.person_name}>
                      {loan.person_name}
                    </h3>

                    {isPaid ? (
                      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] bg-emerald-500/15 text-emerald-600 border border-emerald-500/20 font-bold shrink-0">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Paid
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold shrink-0 border ${
                        isBorrowed
                          ? "bg-destructive/10 text-destructive border-destructive/20"
                          : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      }`}>
                        <Clock className="h-2.5 w-2.5" /> Active
                      </span>
                    )}
                  </div>

                  {/* Dates & Linked Account */}
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    <p className="truncate">
                      Date: <strong className="text-foreground font-semibold">{occurredDateFormatted}</strong>
                    </p>
                    {dueDateFormatted && (
                      <p className="truncate">
                        Due: <strong className={`font-semibold ${isBorrowed ? "text-destructive" : "text-emerald-600"}`}>{dueDateFormatted}</strong>
                      </p>
                    )}
                    {acc && (
                      <p className="flex items-center gap-1 truncate text-accent font-medium">
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: acc.color }} />
                        <span className="truncate">{acc.name}</span>
                      </p>
                    )}
                  </div>

                  {loan.note && (
                    <p className="text-[10px] text-muted-foreground/80 italic font-serif truncate" title={loan.note}>
                      "{loan.note}"
                    </p>
                  )}
                </div>

                {/* Bottom Row: Actions */}
                <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between gap-1">
                  {!isPaid ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRepayLoan(loan)}
                      className="h-6 px-2 text-[10px] font-bold gap-1 rounded-md border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 transition-all cursor-pointer shadow-2xs shrink-0"
                    >
                      <span>Repay</span>
                    </Button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60 font-medium">Completed</span>
                  )}

                  <div className="flex items-center gap-0.5 shrink-0 ml-auto">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(loan)}
                      className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/10 cursor-pointer"
                      title="Edit Loan"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteLoan({ id: loan.id, name: loan.person_name })}
                      className="h-6 w-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                      title="Delete Loan"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Adding/Editing Dialog */}
      <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) resetForm(); }}>
        <DialogContent className="max-w-[90vw] sm:max-w-md flex flex-col max-h-[90vh] sm:max-h-[600px] p-0 z-[99] overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="font-serif">{editingLoan ? "Edit Loan" : "New Loan"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 thin-scroll">
              <div className="space-y-1.5">
                <Label htmlFor="person-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Person Name</Label>
                <Input id="person-name" value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="e.g. John Doe" className="rounded-xl h-11" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="loan-amount" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount</Label>
                  <Input 
                    id="loan-amount" 
                    type="number" 
                    step="any" 
                    value={amount} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setAmount(val);
                      if (accountSplits.length === 1) {
                        setAccountSplits([{ ...accountSplits[0], amount: Number(val) || 0 }]);
                      }
                    }} 
                    placeholder="0.00" 
                    className="rounded-xl h-11" 
                    required 
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="loan-kind" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</Label>
                  <Select value={kind} onValueChange={(val: any) => setKind(val)}>
                    <SelectTrigger className="w-full h-11 bg-background rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[100]">
                      <SelectItem value="borrowed">I Take Loan (Borrowed)</SelectItem>
                      <SelectItem value="lent">I Give Loan (Lent)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!editingLoan && (
                <div className="flex items-center justify-between border-y py-2.5 my-1">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold">Split across multiple accounts</Label>
                    <p className="text-[10px] text-muted-foreground">Allocate this loan's amount to more than one account</p>
                  </div>
                  <Switch
                    checked={isSplit}
                    onCheckedChange={(checked) => {
                      setIsSplit(checked);
                      if (checked) {
                        setAccountSplits([{ accountId: accountId !== "none" ? accountId : (accounts[0]?.id || "none"), amount: Number(amount) || 0 }]);
                      }
                    }}
                  />
                </div>
              )}

              {!editingLoan ? (
                isSplit ? (
                  <AccountSplitsSelector
                    splits={accountSplits}
                    setSplits={setAccountSplits}
                    totalAmount={Number(amount) || 0}
                    accounts={accounts}
                    balances={balances}
                    currency={currency}
                    showBalanceCheck={kind === "lent"}
                  />
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="loan-account" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Link Account (Optional)</Label>
                    <SearchableSelect
                      options={accountOptions}
                      value={accountId}
                      onValueChange={setAccountId}
                      placeholder="Link Account"
                      searchPlaceholder="Search Account..."
                      triggerClassName="h-11 rounded-xl"
                    />
                    <p className="text-[10px] text-muted-foreground leading-normal mt-1">
                      Linking an account automatically records the financial inflow/outflow as a transaction in that account.
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="loan-account" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linked Account</Label>
                  <SearchableSelect
                    options={accountOptions}
                    value={accountId}
                    onValueChange={setAccountId}
                    placeholder="Link Account"
                    searchPlaceholder="Search Account..."
                    triggerClassName="h-11 rounded-xl"
                    disabled
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="occurred-on" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</Label>
                  <Input id="occurred-on" type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} className="rounded-xl h-11" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="due-date" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Due Date (Optional)</Label>
                  <Input id="due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-xl h-11" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="loan-status" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</Label>
                  <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                    <SelectTrigger className="w-full h-11 bg-background rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[100]">
                      <SelectItem value="active">Active (Owed)</SelectItem>
                      <SelectItem value="paid">Paid (Cleared)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="loan-note" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes (Optional)</Label>
                <Input id="loan-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. For college fee" className="rounded-xl h-11" />
              </div>
            </div>

            <DialogFooter className="p-4 border-t gap-2 flex-row justify-between items-center shrink-0">
              {editingLoan ? (
                <Button 
                  type="button"
                  variant="destructive" 
                  onClick={() => {
                    setOpen(false);
                    setDeleteLoan({ id: editingLoan.id, name: editingLoan.person_name });
                  }} 
                  disabled={loading}
                  className="cursor-pointer"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              ) : (
                <div />
              )}
              <div className="flex gap-2 ml-auto">
                <Button type="button" variant="outline" onClick={() => { setOpen(false); resetForm(); }} className="cursor-pointer" disabled={loading}>Cancel</Button>
                <Button type="submit" className="cursor-pointer" disabled={loading}>
                  {loading ? "Saving…" : "Save"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Repay Loan Dialog */}
      <Dialog open={!!repayLoan} onOpenChange={(val) => { if (!val) setRepayLoan(null); }}>
        <DialogContent className="max-w-[90vw] sm:max-w-md flex flex-col max-h-[90vh] sm:max-h-[600px] p-0 z-[99] overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="font-serif">Repay Loan: {repayLoan?.person_name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRepaySubmit} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 thin-scroll">
              <p className="text-xs text-muted-foreground leading-normal">
                Specify the account(s) and amounts to record the repayment of <strong>{repayLoan ? fmtMoney(repayLoan.amount, currency) : ""}</strong>.
              </p>

              {repayLoan && (
                <AccountSplitsSelector
                  splits={repaySplits}
                  setSplits={setRepaySplits}
                  totalAmount={repayLoan.amount}
                  accounts={accounts}
                  balances={balances}
                  currency={currency}
                  showBalanceCheck={repayLoan.kind === "borrowed"}
                />
              )}
            </div>

            <DialogFooter className="p-4 border-t gap-2 flex flex-row justify-end items-center shrink-0">
              <Button type="button" variant="outline" onClick={() => setRepayLoan(null)} className="cursor-pointer" disabled={loading}>Cancel</Button>
              <Button type="submit" className="cursor-pointer" disabled={loading}>
                {loading ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={!!deleteLoan} onOpenChange={(val) => !val && setDeleteLoan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Delete Loan Record?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this loan record with "{deleteLoan?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteLoan) {
                  confirmDelete(deleteLoan.id);
                  setDeleteLoan(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground cursor-pointer"
            >
              Delete Record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Loan Details Pop-up Dialog */}
      <Dialog open={!!selectedLoan} onOpenChange={(val) => { if (!val) setSelectedLoan(null); }}>
        <DialogContent className="max-w-md z-[100]">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl flex items-center gap-2">
              {selectedLoan?.kind === "borrowed" ? (
                <TrendingDown className="h-6 w-6 text-destructive" />
              ) : (
                <TrendingUp className="h-6 w-6 text-success" />
              )}
              Loan Details
            </DialogTitle>
          </DialogHeader>

          {selectedLoan && (
            <div className="space-y-4 mt-3">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs text-muted-foreground uppercase font-bold">Person Name</span>
                <span className="font-serif font-black text-foreground text-sm">{selectedLoan.person_name}</span>
              </div>

              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs text-muted-foreground uppercase font-bold">Type</span>
                <Badge variant="outline" className={`capitalize font-semibold ${selectedLoan.kind === "borrowed" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-success/10 text-success border-success/20"}`}>
                  {selectedLoan.kind === "borrowed" ? "Borrowed" : "Lent"}
                </Badge>
              </div>

              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs text-muted-foreground uppercase font-bold">Status</span>
                <Badge className={`capitalize font-semibold ${selectedLoan.status === "paid" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground"}`}>
                  {selectedLoan.status}
                </Badge>
              </div>

              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs text-muted-foreground uppercase font-bold">Amount</span>
                <span className={`font-serif num font-black text-lg ${selectedLoan.kind === "borrowed" ? "text-destructive" : "text-success"}`}>
                  {fmtMoney(selectedLoan.amount, currency)}
                </span>
              </div>

              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs text-muted-foreground uppercase font-bold">Date Occurred</span>
                <span className="text-xs text-foreground font-medium">{new Date(selectedLoan.occurred_on).toLocaleDateString()}</span>
              </div>

              {selectedLoan.due_date && (
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-xs text-muted-foreground uppercase font-bold">Due Date</span>
                  <span className="text-xs text-destructive font-bold">{new Date(selectedLoan.due_date).toLocaleDateString()}</span>
                </div>
              )}

              {selectedLoan.account_id && (
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-xs text-muted-foreground uppercase font-bold">Linked Account</span>
                  <span className="text-xs text-accent font-bold">{accMap.get(selectedLoan.account_id)?.name}</span>
                </div>
              )}

              {selectedLoan.note && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase font-bold block">Note</span>
                  <p className="p-3 bg-muted/40 rounded-xl border text-xs text-foreground font-serif italic">"{selectedLoan.note}"</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                {selectedLoan.status === "active" && (
                  <Button
                    onClick={() => {
                      toggleStatus(selectedLoan);
                      setSelectedLoan(null);
                    }}
                    className="gap-1 rounded-full cursor-pointer h-9 px-4 text-xs font-semibold bg-success hover:bg-success/90 text-success-foreground"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark Paid
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    handleEdit(selectedLoan);
                    setSelectedLoan(null);
                  }}
                  className="gap-1 rounded-full cursor-pointer h-9 px-4 text-xs font-semibold"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit Details
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setDeleteLoan({ id: selectedLoan.id, name: selectedLoan.person_name });
                    setSelectedLoan(null);
                  }}
                  className="gap-1 rounded-full cursor-pointer h-9 px-4 text-xs font-semibold"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* Mobile popup lists */}
      <Dialog open={borrowedListOpen} onOpenChange={setBorrowedListOpen}>
        <DialogContent className="max-w-[95vw] rounded-xl max-h-[85vh] overflow-y-auto thin-scroll z-[99]">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-destructive" />
              I Take Loan (Borrowed)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-3 max-h-[360px] overflow-y-auto overflow-x-hidden pr-1 thin-scroll">
            {loans.filter(l => l.kind === "borrowed").length === 0 && (
              <p className="text-center text-muted-foreground py-10 text-xs">No borrowed loan records.</p>
            )}
            {loans.filter(l => l.kind === "borrowed").map((loan) => (
              <div 
                key={loan.id} 
                onClick={() => { 
                  handleEdit(loan); 
                  setBorrowedListOpen(false); 
                }} 
                className={`p-3 rounded-lg border flex items-center justify-between gap-3 transition-colors cursor-pointer ${loan.status === "paid" ? "bg-muted/40 opacity-70" : "bg-card hover:bg-muted/10"} w-full min-w-0 overflow-hidden`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-bold text-sm truncate">{loan.person_name}</span>
                    {loan.status === "paid" ? (
                      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] bg-success/15 text-success font-medium">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Paid
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] bg-destructive/15 text-destructive font-medium">
                        <Clock className="h-2.5 w-2.5" /> Active
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span>Date: {new Date(loan.occurred_on).toLocaleDateString()}</span>
                    {loan.due_date && <span className="text-destructive font-semibold">Due: {new Date(loan.due_date).toLocaleDateString()}</span>}
                    {loan.account_id && <span className="text-accent font-medium">Linked: {accMap.get(loan.account_id)?.name}</span>}
                  </div>
                  {loan.note && <p className="text-xs text-muted-foreground/80 mt-1 italic font-serif">"{loan.note}"</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-serif font-bold text-base num text-destructive">{fmtMoney(loan.amount, currency)}</span>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={lentListOpen} onOpenChange={setLentListOpen}>
        <DialogContent className="max-w-[95vw] rounded-xl max-h-[85vh] overflow-y-auto thin-scroll z-[99]">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-success" />
              I Give Loan (Lent)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-3 max-h-[360px] overflow-y-auto overflow-x-hidden pr-1 thin-scroll">
            {loans.filter(l => l.kind === "lent").length === 0 && (
              <p className="text-center text-muted-foreground py-10 text-xs">No lent loan records.</p>
            )}
            {loans.filter(l => l.kind === "lent").map((loan) => (
              <div 
                key={loan.id} 
                onClick={() => { 
                  handleEdit(loan); 
                  setLentListOpen(false); 
                }} 
                className={`p-3 rounded-lg border flex items-center justify-between gap-3 transition-colors cursor-pointer ${loan.status === "paid" ? "bg-muted/40 opacity-70" : "bg-card hover:bg-muted/10"} w-full min-w-0 overflow-hidden`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-bold text-sm truncate">{loan.person_name}</span>
                    {loan.status === "paid" ? (
                      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] bg-success/15 text-success font-medium">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Paid
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] bg-success/15 text-success font-medium">
                        <Clock className="h-2.5 w-2.5" /> Active
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span>Date: {new Date(loan.occurred_on).toLocaleDateString()}</span>
                    {loan.due_date && <span className="text-destructive font-semibold">Due: {new Date(loan.due_date).toLocaleDateString()}</span>}
                    {loan.account_id && <span className="text-accent font-medium">Linked: {accMap.get(loan.account_id)?.name}</span>}
                  </div>
                  {loan.note && <p className="text-xs text-muted-foreground/80 mt-1 italic font-serif">"{loan.note}"</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-serif font-bold text-base num text-success">{fmtMoney(loan.amount, currency)}</span>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Floatable Add Trigger — portaled to body to escape transform ancestor */}
      {typeof document !== 'undefined' && createPortal(
        <Button 
          onClick={() => {
            resetForm();
            setOpen(true);
          }} 
          size="icon" 
          className="fixed bottom-[5rem] md:bottom-6 right-6 z-40 h-10 w-10 md:h-12 md:w-12 rounded-full bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg border border-accent/20 flex items-center justify-center cursor-pointer" 
          title="New Loan"
        >
          <Plus className="h-5 w-5 md:h-6 md:w-6" />
        </Button>,
        document.body
      )}
    </div>
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
    setSplits([...splits, { accountId: accounts[0]?.id || "none", amount: 0 }]);
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
    <div className="space-y-2 border-t pt-3 mt-2">
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
          const isOverdrawn = showBalanceCheck && split.accountId !== "none" && balance < split.amount;

          const splitAccountOptions = [
            { value: "none", label: "Do not link account" },
            ...accounts.map(a => ({
              value: a.id,
              label: `${a.name} (${fmtMoney(balances.get(a.id) ?? 0, currency)})`,
              imageUrl: (a as any).image_url,
              icon: (a as any).image_url ? undefined : <span className="h-2 w-2 rounded-full inline-block shrink-0" style={{ background: a.color }} />
            }))
          ];

          return (
            <div key={idx} className="flex gap-2 items-start">
              <div className="flex-1 min-w-0">
                <SearchableSelect
                  options={splitAccountOptions}
                  value={split.accountId || "none"}
                  onValueChange={(val) => handleSplitChange(idx, "accountId", val)}
                  placeholder="Select Account"
                  searchPlaceholder="Search Account..."
                  triggerClassName="h-10 text-xs bg-background rounded-lg"
                />
                {split.accountId !== "none" && (
                  <div className="text-[10px] text-muted-foreground mt-0.5 px-1 flex justify-between">
                    <span>Available: {fmtMoney(balance, currency)}</span>
                    {isOverdrawn && <span className="text-destructive font-semibold">Insufficient funds</span>}
                  </div>
                )}
              </div>

              <div className="w-28 flex-shrink-0">
                <Input
                  type="number"
                  step="any"
                  value={split.amount || ""}
                  onChange={(e) => handleSplitChange(idx, "amount", Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className={`rounded-lg h-10 text-xs ${isOverdrawn ? "border-destructive text-destructive" : ""}`}
                />
              </div>

              {splits.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveSplit(idx)}
                  className="h-10 w-10 text-muted-foreground hover:text-destructive rounded-lg cursor-pointer"
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

