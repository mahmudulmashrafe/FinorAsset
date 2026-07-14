import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMoney, computeAccountBalances } from "@/lib/finance";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Pencil, Plus, TrendingDown, TrendingUp, CheckCircle2, Clock, CircleDollarSign } from "lucide-react";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
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
    queryKey: ["loans", authUser?.id],
    enabled: !!authUser,
    initialData: loadLocalLoans,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loans")
        .select("*")
        .order("occurred_on", { ascending: false });

      if (error) {
        if (error.code === "42P01") return loadLocalLoans();
        throw error;
      }
      return (data as any[]).map(l => ({
        ...l,
        amount: Number(l.amount),
      })) as Loan[];
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
        const { error } = await supabase.from("loans").insert({ ...payload, user_id: authUser?.id });
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
            qc.setQueryData(["loans", authUser?.id], updated);
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
            .eq("user_id", authUser?.id)
            .eq("account_id", loan.account_id)
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
    try {
      const loan = loans.find((l) => l.id === id);
      if (loan) {
        const person = loan.person_name.trim();
        // Delete linked transactions first
        await supabase
          .from("transactions")
          .delete()
          .eq("user_id", authUser?.id)
          .eq("account_id", loan.account_id)
          .or(`note.ilike.Loan: %${person}%,note.ilike.Repayment: %${person}%`);
      }

      const { error } = await supabase.from("loans").delete().eq("id", id);
      if (error) {
        if (error.code === "42P01") {
          const updated = loans.filter((l) => l.id !== id);
          localStorage.setItem("finorasset_loans", JSON.stringify(updated));
          qc.setQueryData(["loans", authUser?.id], updated);
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

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">I Take Loan (Borrowed)</p>
            <h3 className="mt-1 font-serif text-2xl font-bold text-destructive">{fmtMoney(activeBorrowed, currency)}</h3>
            <p className="text-[10px] text-muted-foreground mt-1">Total active debts you owe</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
            <TrendingDown className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">I Give Loan (Lent)</p>
            <h3 className="mt-1 font-serif text-2xl font-bold text-success">{fmtMoney(activeLent, currency)}</h3>
            <p className="text-[10px] text-muted-foreground mt-1">Total active funds lent out</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center text-success">
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Net Debt Position</p>
            <h3 className={`mt-1 font-serif text-2xl font-bold ${netBalance >= 0 ? "text-success" : "text-destructive"}`}>
              {netBalance >= 0 ? "+" : ""}{fmtMoney(netBalance, currency)}
            </h3>
            <p className="text-[10px] text-muted-foreground mt-1">Lent minus borrowed</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
            <CircleDollarSign className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Main content tabs/grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Part 1: I Take Loan (Borrowed) */}
        <section className="rounded-xl border bg-card p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h2 className="font-serif text-lg font-bold flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-destructive" />
                I Take Loan (Borrowed)
              </h2>
              <span className="text-xs text-muted-foreground font-serif">
                {loans.filter(l => l.kind === "borrowed").length} records
              </span>
            </div>

            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 thin-scroll">
              {loans.filter(l => l.kind === "borrowed").length === 0 && (
                <p className="text-center text-muted-foreground py-10 text-xs">No borrowed loan records.</p>
              )}
              {loans.filter(l => l.kind === "borrowed").map((loan) => (
                <div key={loan.id} className={`p-3 rounded-lg border flex items-center justify-between gap-3 transition-colors ${loan.status === "paid" ? "bg-muted/40 opacity-70" : "bg-card hover:bg-muted/10"}`}>
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
                    <div className="flex items-center gap-1">
                      {loan.status === "active" && (
                        <button onClick={() => toggleStatus(loan)} className="p-1 rounded bg-muted hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors cursor-pointer" title="Mark as Paid">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => handleEdit(loan)} className="p-1 rounded bg-muted hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors cursor-pointer" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteLoan({ id: loan.id, name: loan.person_name })} className="p-1 rounded bg-muted hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors cursor-pointer" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Part 2: I Give Loan (Lent) */}
        <section className="rounded-xl border bg-card p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h2 className="font-serif text-lg font-bold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-success" />
                I Give Loan (Lent)
              </h2>
              <span className="text-xs text-muted-foreground font-serif">
                {loans.filter(l => l.kind === "lent").length} records
              </span>
            </div>

            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 thin-scroll">
              {loans.filter(l => l.kind === "lent").length === 0 && (
                <p className="text-center text-muted-foreground py-10 text-xs">No lent loan records.</p>
              )}
              {loans.filter(l => l.kind === "lent").map((loan) => (
                <div key={loan.id} className={`p-3 rounded-lg border flex items-center justify-between gap-3 transition-colors ${loan.status === "paid" ? "bg-muted/40 opacity-70" : "bg-card hover:bg-muted/10"}`}>
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
                      {loan.due_date && <span className="text-success font-semibold">Due: {new Date(loan.due_date).toLocaleDateString()}</span>}
                      {loan.account_id && <span className="text-accent font-medium">Linked: {accMap.get(loan.account_id)?.name}</span>}
                    </div>
                    {loan.note && <p className="text-xs text-muted-foreground/80 mt-1 italic font-serif">"{loan.note}"</p>}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-serif font-bold text-base num text-success">{fmtMoney(loan.amount, currency)}</span>
                    <div className="flex items-center gap-1">
                      {loan.status === "active" && (
                        <button onClick={() => toggleStatus(loan)} className="p-1 rounded bg-muted hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors cursor-pointer" title="Mark as Paid">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => handleEdit(loan)} className="p-1 rounded bg-muted hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors cursor-pointer" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteLoan({ id: loan.id, name: loan.person_name })} className="p-1 rounded bg-muted hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors cursor-pointer" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Adding/Editing Dialog */}
      <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) resetForm(); }}>
        <DialogContent className="max-w-[90vw] sm:max-w-md rounded-xl z-[99]">
          <DialogHeader>
            <DialogTitle className="font-serif">{editingLoan ? "Edit Loan" : "New Loan"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-3">
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
                  <Select value={accountId} onValueChange={(val) => setAccountId(val)}>
                    <SelectTrigger className="w-full h-11 bg-background rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[100]">
                      <SelectItem value="none">Do not link account</SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground leading-normal mt-1">
                    Linking an account automatically records the financial inflow/outflow as a transaction in that account.
                  </p>
                </div>
              )
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="loan-account" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linked Account</Label>
                <Select value={accountId} onValueChange={(val) => setAccountId(val)} disabled>
                  <SelectTrigger className="w-full h-11 bg-background rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[100]">
                    <SelectItem value="none">Do not link account</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => { setOpen(false); resetForm(); }} className="rounded-xl h-11 cursor-pointer">Cancel</Button>
              <Button type="submit" className="rounded-xl h-11 font-bold cursor-pointer" disabled={loading}>
                {loading ? "Saving..." : "Save Record"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Repay Loan Dialog */}
      <Dialog open={!!repayLoan} onOpenChange={(val) => { if (!val) setRepayLoan(null); }}>
        <DialogContent className="max-w-[90vw] sm:max-w-md rounded-xl z-[99]">
          <DialogHeader>
            <DialogTitle className="font-serif">Repay Loan: {repayLoan?.person_name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRepaySubmit} className="space-y-4 py-3">
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

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setRepayLoan(null)} className="rounded-xl h-11 cursor-pointer">Cancel</Button>
              <Button type="submit" className="rounded-xl h-11 font-bold cursor-pointer" disabled={loading}>
                {loading ? "Recording..." : "Confirm Repayment"}
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
  accounts: Account[];
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

          return (
            <div key={idx} className="flex gap-2 items-start">
              <div className="flex-1 min-w-0">
                <Select
                  value={split.accountId || "none"}
                  onValueChange={(val) => handleSplitChange(idx, "accountId", val)}
                >
                  <SelectTrigger className="w-full h-10 bg-background rounded-lg text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[250]">
                    <SelectItem value="none">Do not link account</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({fmtMoney(balances.get(a.id) ?? 0, currency)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

