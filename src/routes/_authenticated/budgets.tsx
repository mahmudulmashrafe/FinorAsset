import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMoney, monthKey } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
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

  const expenseCats = cats.filter(c => c.kind === "expense");
  const usedIds = new Set(budgets.map(b => b.category_id));
  const availCats = expenseCats.filter(c => !usedIds.has(c.id));

  const activeCat = cats.find(c => c.id === (editingBudget ? editingBudget.category_id : catId));

  async function save() {
    const targetCatId = editingBudget ? editingBudget.category_id : catId;
    if (!targetCatId || !Number(amount)) return toast.error("Pick category and amount");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    if (editingBudget) {
      const { error } = await supabase
        .from("budgets")
        .update({ amount: Number(amount) })
        .eq("id", editingBudget.id);
      if (error) return toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["budgets", period] });
      setOpen(false); setEditingBudget(null); setCatId(""); setAmount("");
      toast.success("Budget updated");
    } else {
      const { error } = await supabase.from("budgets").insert({
        user_id: u.user.id, category_id: targetCatId, amount: Number(amount), period_month: period,
      });
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
            <div key={b.id} className="rounded-xl border bg-card p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: cat?.color }} />
                  <h3 className="font-serif text-xl">{cat?.name ?? "—"}</h3>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button 
                    onClick={() => {
                      setEditingBudget(b);
                      setAmount(String(b.amount));
                      setCatId(b.category_id);
                      setOpen(true);
                    }} 
                    className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors cursor-pointer"
                    title="Edit budget"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button 
                    onClick={() => setDeleteId(b.id)} 
                    className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                    title="Delete budget"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
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

      {/* Floatable Add Budget FAB */}
      <div className="fixed bottom-20 md:bottom-6 right-6 z-40">
        <Dialog open={open} onOpenChange={(val) => {
          setOpen(val);
          if (!val) {
            setEditingBudget(null);
            setCatId("");
            setAmount("");
          }
        }}>
          <DialogTrigger asChild>
            <Button 
              disabled={availCats.length === 0}
              onClick={() => {
                setEditingBudget(null);
                setCatId("");
                setAmount("");
              }}
              size="icon"
              className="h-14 w-14 rounded-full bg-primary hover:bg-[#2c2826] text-primary-foreground shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer border border-primary/10 flex items-center justify-center"
              title="New budget"
            >
              <Plus className="h-6 w-6 text-accent" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-serif">
                {editingBudget ? "Edit budget" : "New monthly budget"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Category</Label>
                {editingBudget ? (
                  <Input value={activeCat?.name ?? "—"} disabled className="bg-muted" />
                ) : (
                  <Select value={catId} onValueChange={setCatId}>
                    <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent className="z-[100]">
                      {availCats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label>Amount</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)} 
                  placeholder="0.00"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => { setOpen(false); setEditingBudget(null); }}>
                Cancel
              </Button>
              <Button onClick={save}>
                {editingBudget ? "Save changes" : "Set budget"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
