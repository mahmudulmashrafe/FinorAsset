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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {budgets.length === 0 && (
          <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
            No budgets yet — set monthly limits for expense categories.
          </div>
        )}
        {budgets.map(b => {
          const cat = cats.find(c => c.id === b.category_id);
          const spent = spentByCat.get(b.category_id) ?? 0;
          const pct = Math.min(100, (spent / Number(b.amount)) * 100);
          const over = spent > Number(b.amount);
          return (
            <div 
              key={b.id} 
              onClick={() => {
                setEditingBudget(b);
                setAmount(String(b.amount));
                setCatId(b.category_id);
                setOpen(true);
              }}
              className="rounded-xl border bg-card p-6 cursor-pointer hover:border-accent/40 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: cat?.color }} />
                  <h3 className="font-serif text-xl">{cat?.name ?? "—"}</h3>
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className={`num font-serif text-2xl ${over ? "text-destructive" : ""}`}>{fmtMoney(spent, currency)}</span>
                <span className="text-sm text-muted-foreground">of {fmtMoney(Number(b.amount), currency)}</span>
              </div>
              <Progress value={pct} className="mt-3" />
              <p className="mt-2 text-xs text-muted-foreground">{over ? `Over by ${fmtMoney(spent - Number(b.amount), currency)}` : `${fmtMoney(Number(b.amount) - spent, currency)} left`}</p>
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
                autoFocus
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
