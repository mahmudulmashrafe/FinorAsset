import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMoney, monthKey } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { SearchableSelect } from "@/components/searchable-select";
import { useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useUserProfile } from "@/hooks/use-user-profile";
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

export const Route = createFileRoute("/_authenticated/budgets")({
  component: BudgetsPage,
  head: () => ({ meta: [{ title: "Budgets — FinorAsset" }] }),
});

function BudgetsPage() {
  const qc = useQueryClient();
  const period = monthKey(new Date());
  const { data: budgets = [] } = useQuery({ queryKey: ["budgets", period], queryFn: () => api.listBudgets(period) });
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: api.listCategories });
  const { data: txns = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => api.listTransactions(1000) });

  // Use the shared profile hook so currency stays in sync with profile page
  const { currency } = useUserProfile();

  const now = new Date();
  const monthTxns = txns.filter(t => {
    const d = new Date(t.occurred_on);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && t.kind === "expense";
  });
  const spentByCat = new Map<string, number>();
  for (const t of monthTxns) {
    if (!t.category_id) continue;
    spentByCat.set(t.category_id, (spentByCat.get(t.category_id) ?? 0) + Number(t.amount));
  }

  const [open, setOpen] = useState(false);
  const [catId, setCatId] = useState("");
  const [amount, setAmount] = useState("");
  const [editingBudget, setEditingBudget] = useState<any | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const expenseCats = cats.filter(c => c.kind === "expense");
  const usedIds = new Set(budgets.map(b => b.category_id));
  const availCats = expenseCats.filter(c => !usedIds.has(c.id));

  const categoryOptions = (editingBudget ? expenseCats : availCats).map(c => ({
    value: c.id,
    label: c.name,
    imageUrl: c.image_url || undefined,
    icon: c.image_url ? undefined : <span>{c.icon}</span>
  }));

  const activeCat = cats.find(c => c.id === (editingBudget ? editingBudget.category_id : catId));

  async function save() {
    const targetCatId = editingBudget ? editingBudget.category_id : catId;
    if (!targetCatId || !Number(amount)) return toast.error("Pick category and amount");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return; }

    if (editingBudget) {
      const { error } = await supabase
        .from("budgets")
        .update({ amount: Number(amount) })
        .eq("id", editingBudget.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["budgets", period] });
      setOpen(false); setEditingBudget(null); setCatId(""); setAmount("");
      toast.success("Budget updated");
    } else {
      const { error } = await supabase.from("budgets").insert({
        user_id: u.user.id, category_id: targetCatId, amount: Number(amount), period_month: period,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["budgets", period] });
      setOpen(false); setCatId(""); setAmount("");
      toast.success("Budget set");
    }
  }

  async function confirmDelete(id: string) {
    const { error } = await supabase.from("budgets").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["budgets", period] });
    toast.success("Budget deleted");
  }

  return (
    <div className="space-y-6 w-full">

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {budgets.length === 0 && (
          <div className="col-span-full rounded-2xl border bg-card/60 p-12 text-center text-muted-foreground space-y-2">
            <div className="h-10 w-10 mx-auto rounded-full bg-accent/10 flex items-center justify-center text-accent mb-2">
              <Plus className="h-5 w-5" />
            </div>
            <p className="font-semibold text-foreground">No budgets set yet</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Click the + button to set monthly limits for your expense categories.
            </p>
          </div>
        )}

        {budgets.map((b) => {
          if (!b) return null;
          const cat = cats.find((c) => c.id === b.category_id);
          const spent = Number(spentByCat.get(b.category_id)) || 0;
          const budgetAmount = Number(b.amount) || 0;
          const over = spent > budgetAmount;
          const calcPct = budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0;
          const rawPct = isNaN(calcPct) ? 0 : Math.max(0, Math.round(calcPct));
          const pct = Math.min(100, rawPct);

          let trackerLabel = "";
          let badgeColorClass = "";
          let barColorClass = "";

          if (over) {
            trackerLabel = `Over by ${fmtMoney(Math.max(0, spent - budgetAmount), currency)}`;
            badgeColorClass = "bg-destructive/10 text-destructive border-destructive/20";
            barColorClass = "bg-destructive";
          } else if (pct >= 80) {
            trackerLabel = `${fmtMoney(Math.max(0, budgetAmount - spent), currency)} left`;
            badgeColorClass = "bg-amber-500/10 text-amber-600 border-amber-500/20";
            barColorClass = "bg-amber-500";
          } else {
            trackerLabel = `${fmtMoney(Math.max(0, budgetAmount - spent), currency)} left`;
            badgeColorClass = "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
            barColorClass = "bg-emerald-500";
          }

          return (
            <div
              key={b.id}
              className={`group relative rounded-2xl border transition-all hover:shadow-lg hover:border-accent/40 overflow-hidden flex flex-row min-h-[150px] ${
                over
                  ? "bg-card border-destructive/30"
                  : "bg-card hover:bg-accent/[0.02]"
              }`}
            >
              {/* Left 1/3 Column: Category Icon / Image */}
              <div className="w-1/3 shrink-0 relative bg-muted flex items-center justify-center border-r border-border/40 overflow-hidden">
                {cat?.image_url ? (
                  <img
                    src={cat.image_url}
                    alt={cat.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div
                    className="h-full w-full flex flex-col items-center justify-center p-2 text-center"
                    style={{
                      background: cat?.color
                        ? `linear-gradient(135deg, ${cat.color}25, ${cat.color}10)`
                        : undefined,
                    }}
                  >
                    <span className="text-3xl mb-1 drop-shadow-2xs">{cat?.icon || "📊"}</span>
                    <span className="text-[9px] font-bold tracking-wider uppercase text-muted-foreground truncate max-w-full px-1">
                      {cat?.name ?? "Category"}
                    </span>
                  </div>
                )}

                {/* Percentage Badge Overlaid on Left Block */}
                <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-md px-1.5 py-0.5 rounded border border-border/60 shadow-2xs">
                  <span className={`font-serif num font-black text-[10px] ${over ? "text-destructive" : "text-foreground"}`}>
                    {rawPct.toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Right 2/3 Column: Budget Details & Actions */}
              <div className="w-2/3 p-3.5 flex flex-col justify-between min-w-0">
                <div className="space-y-1">
                  {/* Header: Title + Quick Inline Actions */}
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="font-serif font-black text-sm sm:text-base text-foreground truncate" title={cat?.name}>
                      {cat?.name ?? "Budget"}
                    </h3>

                    {/* Edit & Delete Action Buttons Directly in Card View */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingBudget(b);
                          setAmount(String(b.amount));
                          setCatId(b.category_id);
                          setOpen(true);
                        }}
                        className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/10 cursor-pointer"
                        title="Edit Budget"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(b.id)}
                        className="h-6 w-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                        title="Delete Budget"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Spent vs Budgeted Amount */}
                  <div className="flex items-baseline gap-1 text-xs truncate">
                    <span className={`font-serif num font-bold text-xs sm:text-sm ${over ? "text-destructive" : "text-foreground"}`}>
                      {fmtMoney(spent, currency)}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      of {fmtMoney(budgetAmount, currency)}
                    </span>
                  </div>
                </div>

                {/* Progress Tracker & Pointer Knob */}
                <div className="mt-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Tracker</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none ${badgeColorClass}`}>
                      {trackerLabel}
                    </span>
                  </div>

                  {/* Visual Progress Bar with Pointer Knob */}
                  <div className="relative w-full h-1.5 bg-muted rounded-full flex items-center my-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColorClass}`}
                      style={{ width: `${pct}%` }}
                    />
                    <div
                      className={`absolute h-2.5 w-2.5 rounded-full border-2 border-background shadow-xs transition-all duration-500 -translate-x-1/2 ${barColorClass}`}
                      style={{ left: `${Math.max(2, Math.min(98, pct))}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Deletion confirmation alert dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Delete Budget?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this monthly budget limit? This will not delete your transactions.
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

      {typeof document !== 'undefined' && createPortal(
        <Button 
          disabled={availCats.length === 0}
          onClick={() => {
            setEditingBudget(null);
            setCatId("");
            setAmount("");
            setOpen(true);
          }}
          size="icon"
          className="fixed bottom-[5rem] md:bottom-6 right-6 z-40 h-10 w-10 md:h-12 md:w-12 rounded-full bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg border border-accent/20 flex items-center justify-center cursor-pointer"
          title="New budget"
        >
          <Plus className="h-5 w-5 md:h-6 md:w-6" />
        </Button>,
        document.body
      )}

      <Dialog open={open} onOpenChange={(val) => {
        setOpen(val);
        if (!val) {
          setEditingBudget(null);
          setCatId("");
          setAmount("");
        }
      }}>
        <DialogContent className="max-w-md flex flex-col max-h-[85vh] p-0 z-[90]">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="font-serif">
              {editingBudget ? "Edit budget" : "New monthly budget"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 thin-scroll">
            <div>
              <Label>Category</Label>
              {editingBudget ? (
                <Input value={activeCat ? `${activeCat.icon} ${activeCat.name}` : "—"} disabled className="bg-muted" />
              ) : (
                <SearchableSelect
                  options={categoryOptions}
                  value={catId}
                  onValueChange={setCatId}
                  placeholder="Select category"
                  searchPlaceholder="Search category..."
                />
              )}
            </div>
            <div>
              <Label>Monthly Amount</Label>
              <Input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter className="p-4 border-t gap-2 flex-row justify-between sm:justify-between items-center shrink-0">
            {editingBudget ? (
              <Button
                variant="destructive"
                onClick={() => {
                  setOpen(false);
                  setDeleteId(editingBudget.id);
                }}
                className="cursor-pointer"
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => { setOpen(false); setEditingBudget(null); }} className="cursor-pointer">
                Cancel
              </Button>
              <Button onClick={save} disabled={saving} className="cursor-pointer">
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
