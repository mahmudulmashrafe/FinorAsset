import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMoney, type Transaction } from "@/lib/finance";
import { TransactionDialog } from "@/components/transaction-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Pencil, SlidersHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TxnsPage,
  head: () => ({ meta: [{ title: "Transactions — FinorAsset" }] }),
});

function TxnsPage() {
  const qc = useQueryClient();
  const { data: txns = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => api.listTransactions(1000) });
  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: api.listCategories });
  const { currency } = useUserProfile();

  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [account, setAccount] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const catMap = new Map(cats.map(c => [c.id, c]));
  const accMap = new Map(accounts.map(a => [a.id, a]));

  const monthOptions = useMemo(() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; // e.g. "2026-07"
      const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" }); // e.g. "July 2026"
      list.push({ value, label });
    }
    return list;
  }, []);

  const filtered = useMemo(() => txns.filter(t => {
    if (kind !== "all" && t.kind !== kind) return false;
    if (account !== "all" && t.account_id !== account) return false;
    if (monthFilter !== "all") {
      const tDate = new Date(t.occurred_on);
      const tKey = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, "0")}`;
      if (tKey !== monthFilter) return false;
    }
    if (q) {
      const hay = `${t.note ?? ""} ${catMap.get(t.category_id ?? "")?.name ?? ""} ${accMap.get(t.account_id)?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => {
    // Primary: occurred_on descending
    const dateDiff = new Date(b.occurred_on).getTime() - new Date(a.occurred_on).getTime();
    if (dateDiff !== 0) return dateDiff;
    // Secondary: created_at descending (newest added first within same date)
    const createdDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (createdDiff !== 0) return createdDiff;
    // Tertiary: stable tiebreaker by id
    return b.id.localeCompare(a.id);
  }), [txns, kind, account, monthFilter, q, catMap, accMap]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
  }

  async function confirmDelete(id: string) {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
    toast.success("Transaction deleted");
  }

  return (
    <div className="space-y-6 w-full h-[calc(100svh-14rem)] md:h-[calc(100vh-12rem)] flex flex-col overflow-hidden">


      {/* Edit dialog (controlled, no trigger) */}
      {editingTxn && (
        <TransactionDialog
          editingTransaction={editingTxn}
          open={!!editingTxn}
          onOpenChange={(v) => { if (!v) { setEditingTxn(null); refresh(); } }}
        />
      )}

      {/* Desktop Filters (inline) */}
      <div className="hidden md:flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <Input
            placeholder="Search notes, category, account…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full bg-background"
          />
        </div>
        
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-40 bg-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>

        <Select value={account} onValueChange={setAccount}>
          <SelectTrigger className="w-48 bg-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-48 bg-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <span className="ml-auto self-center text-sm text-muted-foreground font-serif">
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Mobile Filters Trigger */}
      <div className="md:hidden flex items-center justify-between gap-3">
        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer bg-card border">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filters</span>
              {(kind !== "all" || account !== "all" || monthFilter !== "all" || q) && (
                <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[90vw] rounded-xl z-[99]">
            <DialogHeader>
              <DialogTitle className="font-serif">Filter Transactions</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-serif font-bold text-muted-foreground uppercase tracking-wider">Search</label>
                <Input
                  placeholder="Search notes, category, account…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="w-full bg-background"
                />
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-serif font-bold text-muted-foreground uppercase tracking-wider">Type</label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger className="w-full bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[100]">
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-serif font-bold text-muted-foreground uppercase tracking-wider">Account</label>
                <Select value={account} onValueChange={setAccount}>
                  <SelectTrigger className="w-full bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[100]">
                    <SelectItem value="all">All accounts</SelectItem>
                    {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-serif font-bold text-muted-foreground uppercase tracking-wider">Month</label>
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className="w-full bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[100]">
                    <SelectItem value="all">All months</SelectItem>
                    {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-between items-center pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setQ("");
                  setKind("all");
                  setAccount("all");
                  setMonthFilter("all");
                  setFiltersOpen(false);
                }}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Clear all
              </Button>
              <Button onClick={() => setFiltersOpen(false)} className="text-xs font-bold cursor-pointer">
                Apply Filters
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <span className="text-xs text-muted-foreground font-serif">
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table (Desktop Layout) */}
      <div className="hidden md:flex rounded-xl border bg-card overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="overflow-y-auto flex-1 thin-scroll">
          <Table className="w-full">
            <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
              <TableRow>
                <TableHead className="py-3 px-4 text-sm md:text-base font-bold">Date</TableHead>
                <TableHead className="py-3 px-4 text-sm md:text-base font-bold">Type</TableHead>
                <TableHead className="py-3 px-4 text-sm md:text-base font-bold">Category</TableHead>
                <TableHead className="py-3 px-4 text-sm md:text-base font-bold">Account</TableHead>
                <TableHead className="py-3 px-4 text-sm md:text-base font-bold">Note</TableHead>
                <TableHead className="py-3 px-4 text-sm md:text-base font-bold text-right">Amount</TableHead>
                <TableHead className="py-3 px-4 w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    No transactions match.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((t) => {
                const acc = accMap.get(t.account_id);
                const cat = t.category_id ? catMap.get(t.category_id) : null;
                const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "↔";
                const amtColor = t.kind === "income"
                  ? "text-[color:var(--success)]"
                  : t.kind === "expense"
                  ? "text-[color:var(--destructive)]"
                  : "";
                return (
                  <TableRow key={t.id} className="group">
                    <TableCell className="py-3 px-4 tabular-nums text-sm md:text-base">
                      {new Date(t.occurred_on).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <Badge variant="outline" className="capitalize text-sm px-2.5 py-0.5">{t.kind}</Badge>
                    </TableCell>
                    <TableCell className="py-3 px-4 text-sm md:text-base">
                      {cat ? (
                        <span className="inline-flex items-center gap-2">
                          <span>{cat.icon}</span>
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                          {cat.name}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-sm md:text-base">
                      {acc?.name}
                      {t.to_account_id && ` → ${accMap.get(t.to_account_id)?.name}`}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-muted-foreground max-w-[20ch] truncate text-sm md:text-base">
                      {t.note ?? "—"}
                    </TableCell>
                    <TableCell className={`py-3 px-4 text-right num font-serif font-semibold text-sm md:text-base ${amtColor}`}>
                      {sign}{fmtMoney(Number(t.amount), currency)}
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingTxn(t)}
                          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors cursor-pointer"
                          title="Edit transaction"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteId(t.id)}
                          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                          title="Delete transaction"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* List (Mobile Layout) */}
      <div className="md:hidden rounded-xl border bg-card p-3 overflow-y-auto overflow-x-hidden flex-1 thin-scroll">
        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground py-12 text-sm">
            No transactions match.
          </div>
        )}
        <div className="divide-y divide-border/50">
          {filtered.map((t) => {
            const acc = accMap.get(t.account_id);
            const cat = t.category_id ? catMap.get(t.category_id) : null;
            const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "↔";
            const amtColor = t.kind === "income"
              ? "text-[color:var(--success)]"
              : t.kind === "expense"
              ? "text-[color:var(--destructive)]"
              : "";
            return (
              <div key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    {cat?.icon ?? "💵"}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-serif font-black truncate">{cat?.name ?? (t.kind === "transfer" ? "Transfer" : "Uncategorized")}</span>
                      <Badge variant="outline" className="capitalize text-[9px] px-1 py-0 scale-90 origin-left leading-none">{t.kind}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {acc?.name} {t.to_account_id && `→ ${accMap.get(t.to_account_id)?.name}`}
                      <span className="mx-1">·</span>
                      {new Date(t.occurred_on).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </div>
                    {t.note && (
                      <div className="text-[10px] text-muted-foreground italic truncate max-w-[160px] mt-0.5">
                        {t.note}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`num font-serif text-sm font-bold ${amtColor}`}>{sign}{fmtMoney(Number(t.amount), currency)}</span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => setEditingTxn(t)}
                      className="h-6 w-6 flex items-center justify-center rounded bg-accent/10 text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Edit transaction"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setDeleteId(t.id)}
                      className="h-6 w-6 flex items-center justify-center rounded bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer"
                      title="Delete transaction"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Deletion confirmation alert dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Delete Transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this transaction? This action will permanently remove it from your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (deleteId) {
                  confirmDelete(deleteId);
                  setDeleteId(null);
                }
              }} 
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground cursor-pointer"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
