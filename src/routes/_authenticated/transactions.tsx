import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMoney, type Transaction, syncTransactionToLoan } from "@/lib/finance";
import { TransactionDialog } from "@/components/transaction-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Pencil, SlidersHorizontal, Plus, Calendar, Layers, Eye } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
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

export interface EventGroup {
  eventId: string;
  eventTitle: string;
  date: string;
  items: Transaction[];
  totalAmount: number;
}

export type DisplayRowItem =
  | { type: "single"; txn: Transaction }
  | { type: "event"; group: EventGroup };

export function parseEventNote(note: string | null) {
  if (!note || !note.startsWith("[Event: ")) return null;
  const match = note.match(/^\[Event:\s*(.*?)\|id:(.*?)\]\s*(.*)$/);
  if (!match) return null;
  return {
    eventTitle: match[1],
    eventId: match[2],
    itemNote: match[3],
  };
}

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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [showBatchDateChange, setShowBatchDateChange] = useState(false);
  const [batchNewDate, setBatchNewDate] = useState("");
  const [batchDateLoading, setBatchDateLoading] = useState(false);

  const [selectedEventGroup, setSelectedEventGroup] = useState<EventGroup | null>(null);
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);

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

  const displayRows = useMemo<DisplayRowItem[]>(() => {
    const result: DisplayRowItem[] = [];
    const eventMap = new Map<string, EventGroup>();
    const processedEventIds = new Set<string>();

    for (const t of filtered) {
      const parsed = parseEventNote(t.note);
      if (parsed) {
        if (!eventMap.has(parsed.eventId)) {
          eventMap.set(parsed.eventId, {
            eventId: parsed.eventId,
            eventTitle: parsed.eventTitle,
            date: t.occurred_on,
            items: [],
            totalAmount: 0,
          });
        }
        const grp = eventMap.get(parsed.eventId)!;
        grp.items.push(t);
        const amt = Number(t.amount);
        if (t.kind === "income") grp.totalAmount += amt;
        else if (t.kind === "expense") grp.totalAmount -= amt;
      }
    }

    for (const t of filtered) {
      const parsed = parseEventNote(t.note);
      if (parsed) {
        if (!processedEventIds.has(parsed.eventId)) {
          processedEventIds.add(parsed.eventId);
          result.push({ type: "event", group: eventMap.get(parsed.eventId)! });
        }
      } else {
        result.push({ type: "single", txn: t });
      }
    }

    return result;
  }, [filtered]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
  }

  async function confirmDelete(id: string) {
    const txnToDelete = txns.find(t => t.id === id);
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (txnToDelete) {
      await syncTransactionToLoan("delete", txnToDelete);
    }
    setSelectedIds(prev => prev.filter(x => x !== id));
    refresh();
    qc.invalidateQueries({ queryKey: ["loans"] });
    toast.success("Transaction deleted");
  }

  async function confirmBatchDelete() {
    setBatchLoading(true);
    try {
      const txnsToDelete = txns.filter(t => selectedIds.includes(t.id));
      const { error } = await supabase.from("transactions").delete().in("id", selectedIds);
      if (error) throw error;
      
      for (const t of txnsToDelete) {
        await syncTransactionToLoan("delete", t);
      }
      
      toast.success(`Successfully deleted ${selectedIds.length} transactions`);
      setSelectedIds([]);
      refresh();
      qc.invalidateQueries({ queryKey: ["loans"] });
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`);
    } finally {
      setBatchLoading(false);
      setShowBatchDelete(false);
    }
  }

  async function confirmBatchDateChange() {
    if (!batchNewDate) return toast.error("Please select a date");
    setBatchDateLoading(true);
    try {
      const { error } = await supabase
        .from("transactions")
        .update({ occurred_on: batchNewDate, updated_at: new Date().toISOString() })
        .in("id", selectedIds);
      
      if (error) throw error;

      // Also check if any of these transactions are linked to loans, and sync them!
      const selectedTxns = txns.filter(t => selectedIds.includes(t.id));
      for (const t of selectedTxns) {
        await syncTransactionToLoan("update", { ...t, occurred_on: batchNewDate });
      }

      toast.success(`Successfully updated the date for ${selectedIds.length} transactions`);
      setSelectedIds([]);
      refresh();
      qc.invalidateQueries({ queryKey: ["loans"] });
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`);
    } finally {
      setBatchDateLoading(false);
      setShowBatchDateChange(false);
    }
  }

  async function confirmDeleteEvent(eventId: string) {
    const eventItemsToDelete = txns.filter(t => t.note && t.note.includes(`|id:${eventId}]`));
    const ids = eventItemsToDelete.map(t => t.id);
    if (ids.length === 0) return;

    const { error } = await supabase.from("transactions").delete().in("id", ids);
    if (error) return toast.error(error.message);

    for (const t of eventItemsToDelete) {
      await syncTransactionToLoan("delete", t);
    }

    setSelectedIds(prev => prev.filter(x => !ids.includes(x)));
    setSelectedEventGroup(null);
    setDeleteEventId(null);
    refresh();
    toast.success("Event and all its records deleted");
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleAllVisible = () => {
    const visibleIds = displayRows.flatMap(row => row.type === "event" ? row.group.items.map(i => i.id) : [row.txn.id]);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  return (
    <div className="space-y-3 sm:space-y-6 w-full flex-1 min-h-0 md:h-[calc(100vh-8rem)] flex flex-col overflow-hidden">


      {/* Edit dialog (controlled, no trigger) */}
      {editingTxn && (
        <TransactionDialog
          editingTransaction={editingTxn}
          open={!!editingTxn}
          onOpenChange={(v) => { if (!v) { setEditingTxn(null); refresh(); } }}
        />
      )}

      {/* Desktop Filters (inline) */}
      <div className="hidden md:flex flex-shrink-0 flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
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
      <div className="md:hidden flex flex-shrink-0 items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
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

          {filtered.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer bg-card border rounded-lg px-2.5 py-1.5 select-none">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                checked={filtered.length > 0 && filtered.every(t => selectedIds.includes(t.id))}
                onChange={toggleAllVisible}
              />
              <span className="text-[11px] font-medium">Select all</span>
            </label>
          )}
        </div>

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
                <TableHead className="w-12 py-3 px-4 text-center">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                    checked={filtered.length > 0 && filtered.every(t => selectedIds.includes(t.id))}
                    onChange={toggleAllVisible}
                  />
                </TableHead>
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
              {displayRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    No transactions match.
                  </TableCell>
                </TableRow>
              )}
              {displayRows.map((row) => {
                if (row.type === "event") {
                  const grp = row.group;
                  const isAllSel = grp.items.length > 0 && grp.items.every(i => selectedIds.includes(i.id));
                  return (
                    <TableRow key={grp.eventId} className={`group bg-amber-500/5 hover:bg-amber-500/10 transition-colors ${isAllSel ? 'bg-accent/10' : ''}`}>
                      <TableCell className="w-12 py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                          checked={isAllSel}
                          onChange={() => {
                            const itemIds = grp.items.map(i => i.id);
                            if (isAllSel) setSelectedIds(prev => prev.filter(id => !itemIds.includes(id)));
                            else setSelectedIds(prev => Array.from(new Set([...prev, ...itemIds])));
                          }}
                        />
                      </TableCell>
                      <TableCell className="py-3 px-4 tabular-nums text-sm md:text-base">
                        {new Date(grp.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <Badge variant="secondary" className="gap-1 font-semibold text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20">
                          <Layers className="h-3 w-3" /> Event
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-sm md:text-base font-bold">
                        <button
                          onClick={() => setSelectedEventGroup(grp)}
                          className="flex items-center gap-2 hover:underline text-left cursor-pointer"
                        >
                          <span>🎉 {grp.eventTitle}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {grp.items.length} records
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-sm md:text-base text-muted-foreground">
                        Multiple accounts
                      </TableCell>
                      <TableCell className="py-3 px-4 text-muted-foreground max-w-[20ch] truncate text-sm md:text-base italic">
                        Click to view full record
                      </TableCell>
                      <TableCell className="py-3 px-4 text-right">
                        {(() => {
                          const sign = grp.totalAmount > 0 ? "+" : grp.totalAmount < 0 ? "−" : "";
                          const color = grp.totalAmount > 0 ? "text-[color:var(--success)]" : grp.totalAmount < 0 ? "text-[color:var(--destructive)]" : "text-foreground";
                          return (
                            <span className={`num font-serif font-bold text-sm md:text-base ${color}`}>
                              {sign}{fmtMoney(Math.abs(grp.totalAmount), currency)}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedEventGroup(grp)}
                            className="h-7 px-2 text-xs font-bold gap-1 cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </Button>
                          <button
                            onClick={() => setDeleteEventId(grp.eventId)}
                            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                            title="Delete Event"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                const t = row.txn;
                const parsed = parseEventNote(t.note);
                const acc = accMap.get(t.account_id);
                const cat = t.category_id ? catMap.get(t.category_id) : null;
                const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "↔";
                const amtColor = t.kind === "income"
                  ? "text-[color:var(--success)]"
                  : t.kind === "expense"
                  ? "text-[color:var(--destructive)]"
                  : "";
                const isSelected = selectedIds.includes(t.id);
                return (
                  <TableRow key={t.id} className={`group ${isSelected ? 'bg-accent/10 hover:bg-accent/15' : ''}`}>
                    <TableCell className="w-12 py-3 px-4 text-center">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                        checked={isSelected}
                        onChange={() => toggleSelect(t.id)}
                      />
                    </TableCell>
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
                      {parsed?.itemNote ?? t.note ?? "—"}
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
      <div className="md:hidden rounded-xl border bg-card p-3 overflow-y-auto overflow-x-hidden flex-1 min-h-0 thin-scroll">
        {displayRows.length === 0 && (
          <div className="text-center text-muted-foreground py-12 text-sm">
            No transactions match.
          </div>
        )}
        <div className="divide-y divide-border/50">
          {displayRows.map((row) => {
            if (row.type === "event") {
              const grp = row.group;
              const isAllSel = grp.items.length > 0 && grp.items.every(i => selectedIds.includes(i.id));
              return (
                <div key={grp.eventId} className="py-2.5 flex items-center justify-between gap-3 px-1 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer flex-shrink-0"
                      checked={isAllSel}
                      onChange={() => {
                        const itemIds = grp.items.map(i => i.id);
                        if (isAllSel) setSelectedIds(prev => prev.filter(id => !itemIds.includes(id)));
                        else setSelectedIds(prev => Array.from(new Set([...prev, ...itemIds])));
                      }}
                    />
                    <button
                      onClick={() => setSelectedEventGroup(grp)}
                      className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                    >
                      <span className="text-lg h-9 w-9 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center flex-shrink-0">
                        🎉
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-sm font-serif font-black truncate">{grp.eventTitle}</span>
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-600 border-amber-500/20">
                            {grp.items.length} records
                          </Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          Event · {new Date(grp.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </div>
                      </div>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {(() => {
                      const sign = grp.totalAmount > 0 ? "+" : grp.totalAmount < 0 ? "−" : "";
                      const color = grp.totalAmount > 0 ? "text-[color:var(--success)]" : grp.totalAmount < 0 ? "text-[color:var(--destructive)]" : "text-foreground";
                      return (
                        <span className={`num font-serif text-xs font-bold ${color}`}>
                          {sign}{fmtMoney(Math.abs(grp.totalAmount), currency)}
                        </span>
                      );
                    })()}
                    <button
                      onClick={() => setSelectedEventGroup(grp)}
                      className="h-6 px-2 text-[10px] font-bold rounded bg-accent/10 text-foreground flex items-center gap-1 cursor-pointer"
                    >
                      View
                    </button>
                  </div>
                </div>
              );
            }

            const t = row.txn;
            const parsed = parseEventNote(t.note);
            const acc = accMap.get(t.account_id);
            const cat = t.category_id ? catMap.get(t.category_id) : null;
            const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "↔";
            const amtColor = t.kind === "income"
              ? "text-[color:var(--success)]"
              : t.kind === "expense"
              ? "text-[color:var(--destructive)]"
              : "";
            const isSelected = selectedIds.includes(t.id);
            return (
              <div key={t.id} className={`py-2.5 flex items-center justify-between gap-3 px-1 rounded-lg ${isSelected ? 'bg-accent/10' : ''}`}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer flex-shrink-0"
                    checked={isSelected}
                    onChange={() => toggleSelect(t.id)}
                  />
                  <span className="text-xl h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    {cat?.icon ?? "💵"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-serif font-black truncate">{cat?.name ?? (t.kind === "transfer" ? "Transfer" : "Uncategorized")}</span>
                      <Badge variant="outline" className="capitalize text-[9px] px-1 py-0 scale-90 origin-left leading-none">{t.kind}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {acc?.name} {t.to_account_id && `→ ${accMap.get(t.to_account_id)?.name}`}
                      <span className="mx-1">·</span>
                      {new Date(t.occurred_on).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </div>
                    {(parsed?.itemNote || t.note) && (
                      <div className="text-[10px] text-muted-foreground italic truncate max-w-[160px] mt-0.5">
                        {parsed?.itemNote ?? t.note}
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

      {/* Floating Batch Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[40] flex items-center gap-3 px-4 py-2.5 rounded-full border bg-background/95 backdrop-blur-md shadow-2xl animate-in slide-in-from-bottom-5 duration-300 max-w-[95vw] overflow-x-auto">
          <span className="text-xs font-serif font-black text-foreground">
            {selectedIds.length} selected
          </span>
          <div className="h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds([])}
            className="h-7 text-xs font-semibold hover:bg-muted rounded-full cursor-pointer text-muted-foreground hover:text-foreground"
          >
            Clear
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBatchNewDate(new Date().toISOString().split("T")[0]);
              setShowBatchDateChange(true);
            }}
            className="h-7 px-3 text-xs font-bold rounded-full cursor-pointer flex items-center gap-1.5 bg-background border hover:bg-muted text-foreground"
          >
            <Calendar className="h-3.5 w-3.5 text-accent" />
            <span>Change Date</span>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowBatchDelete(true)}
            className="h-7 px-3 text-xs font-bold rounded-full cursor-pointer flex items-center gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </Button>
        </div>
      )}

      {/* Batch Deletion confirmation alert dialog */}
      <AlertDialog open={showBatchDelete} onOpenChange={setShowBatchDelete}>
        <AlertDialogContent className="z-[99]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Delete {selectedIds.length} Transactions?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete these {selectedIds.length} selected transactions? This action will permanently remove all of them from your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmBatchDelete} 
              disabled={batchLoading}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground cursor-pointer"
            >
              {batchLoading ? "Deleting..." : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Date Change Dialog */}
      <Dialog open={showBatchDateChange} onOpenChange={setShowBatchDateChange}>
        <DialogContent className="max-w-sm rounded-2xl p-6 z-[99]">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg font-bold">Change Date</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-xs text-muted-foreground">
              Select a new date for the {selectedIds.length} selected transactions.
            </p>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Date</label>
              <Input
                type="date"
                value={batchNewDate}
                onChange={(e) => setBatchNewDate(e.target.value)}
                className="w-full bg-background"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowBatchDateChange(false)}
              className="rounded-full h-10 px-4 text-xs font-bold cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmBatchDateChange}
              disabled={batchDateLoading || !batchNewDate}
              className="rounded-full h-10 px-5 text-xs font-bold bg-accent hover:bg-accent/90 text-accent-foreground cursor-pointer"
            >
              {batchDateLoading ? "Saving..." : "Change Date"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Event Details View Dialog */}
      <Dialog open={!!selectedEventGroup} onOpenChange={(open) => !open && setSelectedEventGroup(null)}>
        <DialogContent className="max-w-md flex flex-col max-h-[90vh] sm:max-h-[600px] p-0 z-[99] overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <div className="flex items-center gap-3">
              <span className="text-2xl h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center flex-shrink-0">
                🎉
              </span>
              <div>
                <DialogTitle className="font-serif text-lg font-bold">{selectedEventGroup?.eventTitle}</DialogTitle>
                <p className="text-xs text-muted-foreground font-serif">
                  Event Date: {selectedEventGroup && new Date(selectedEventGroup.date).toLocaleDateString()}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 thin-scroll">
            <div className="flex items-center justify-between text-xs font-serif font-bold uppercase tracking-wider text-muted-foreground pb-2 border-b">
              <span>Event Records ({selectedEventGroup?.items.length})</span>
              <span>Amount</span>
            </div>

            <div className="divide-y divide-border/50">
              {selectedEventGroup?.items.map((t) => {
                const parsed = parseEventNote(t.note);
                const acc = accMap.get(t.account_id);
                const cat = t.category_id ? catMap.get(t.category_id) : null;
                const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "↔";
                const color = t.kind === "income" ? "text-[color:var(--success)]" : t.kind === "expense" ? "text-[color:var(--destructive)]" : "";
                return (
                  <div key={t.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{cat?.icon ?? "💵"}</span>
                        <span className="font-bold font-serif">{cat?.name ?? "Uncategorized"}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">{t.kind}</Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {acc?.name}{parsed?.itemNote ? ` · ${parsed.itemNote}` : ""}
                      </div>
                    </div>
                    <span className={`num font-serif font-bold shrink-0 text-sm ${color}`}>
                      {sign}{fmtMoney(Number(t.amount), currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className="p-4 border-t flex-row items-center justify-between gap-2 shrink-0">
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-serif">Aggregate Total</div>
              {(() => {
                const tot = selectedEventGroup?.totalAmount ?? 0;
                const sign = tot > 0 ? "+" : tot < 0 ? "−" : "";
                const color = tot > 0 ? "text-[color:var(--success)]" : tot < 0 ? "text-[color:var(--destructive)]" : "text-foreground";
                return (
                  <div className={`font-serif num font-bold text-sm ${color}`}>
                    {sign}{fmtMoney(Math.abs(tot), currency)}
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteEventId(selectedEventGroup?.eventId ?? null)}
                className="text-xs font-bold gap-1 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Event
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedEventGroup(null)}>
                Close
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Event Confirmation Alert */}
      <AlertDialog open={!!deleteEventId} onOpenChange={(open) => !open && setDeleteEventId(null)}>
        <AlertDialogContent className="z-[100]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Delete Event & Records?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this event and all of its associated records? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteEventId) confirmDeleteEvent(deleteEventId);
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground cursor-pointer"
            >
              Delete Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
