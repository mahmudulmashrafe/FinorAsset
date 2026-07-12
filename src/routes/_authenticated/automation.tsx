import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMoney } from "@/lib/finance";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Play, Plus, Cpu, Sparkles, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useUserProfile } from "@/hooks/use-user-profile";

export const Route = createFileRoute("/_authenticated/automation")({
  component: AutomationPage,
  head: () => ({ meta: [{ title: "Automation — FinorAsset" }] }),
});

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).substring(2, 15) + "-" + Date.now().toString(36);
}

interface AutomationAction {
  id: string;
  kind: "income" | "expense" | "transfer";
  category_id?: string;
  account_id: string;
  to_account_id?: string;
  amount: number;
  note?: string;
}

interface AutomationRule {
  id: string;
  name: string;
  actions: AutomationAction[];
}

function AutomationPage() {
  const qc = useQueryClient();
  const { currency, authUser } = useUserProfile();

  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: api.listCategories });

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [actions, setActions] = useState<Omit<AutomationAction, "id">[]>([
    { kind: "expense", account_id: "", category_id: "", amount: 0, note: "" }
  ]);

  // Load rules from localStorage and migrate legacy single-action rules
  useEffect(() => {
    const stored = localStorage.getItem("finorasset_automations");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const migrated = parsed.map((rule: any) => {
            if (rule.actions && Array.isArray(rule.actions)) {
              return rule;
            }
            // Migrate single action schema to multiple actions schema
            return {
              id: rule.id || generateId(),
              name: rule.name || "Legacy Macro",
              actions: [
                {
                  id: generateId(),
                  kind: rule.kind || "expense",
                  category_id: rule.category_id,
                  account_id: rule.account_id || "",
                  to_account_id: rule.to_account_id,
                  amount: Number(rule.amount || 0),
                  note: rule.note,
                }
              ]
            };
          });
          saveRules(migrated);
        }
      } catch (e) {
        console.error("Local storage load/migration error:", e);
      }
    }
  }, []);

  // Sync editing rule to form state
  useEffect(() => {
    if (editingRule) {
      setName(editingRule.name);
      setActions(editingRule.actions);
      setCreateOpen(true);
    }
  }, [editingRule]);

  function saveRules(newRules: AutomationRule[]) {
    setRules(newRules);
    localStorage.setItem("finorasset_automations", JSON.stringify(newRules));
  }

  function addActionForm() {
    setActions([...actions, { kind: "expense", account_id: "", category_id: "", amount: 0, note: "" }]);
  }

  function removeActionForm(index: number) {
    const next = [...actions];
    next.splice(index, 1);
    setActions(next);
  }

  function updateActionField(index: number, field: string, value: any) {
    const next = [...actions];
    next[index] = { ...next[index], [field]: value };
    // Reset dependency fields if kind transitions
    if (field === "kind") {
      next[index].category_id = "";
      next[index].to_account_id = "";
    }
    setActions(next);
  }

  function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Automation name is required");
    
    // Validate all actions
    for (let i = 0; i < actions.length; i++) {
      const act = actions[i];
      const prefix = `Transaction #${i + 1}: `;
      if (!act.account_id) return toast.error(`${prefix}Please select an account`);
      if (act.kind === "transfer" && !act.to_account_id) return toast.error(`${prefix}Please select a destination account`);
      if (act.kind === "transfer" && act.account_id === act.to_account_id) return toast.error(`${prefix}Source and destination accounts must differ`);
      if (act.kind !== "transfer" && !act.category_id) return toast.error(`${prefix}Please select a category`);
      if (!act.amount || Number(act.amount) <= 0) return toast.error(`${prefix}Please enter a valid amount`);
    }

    if (editingRule) {
      const updatedRules = rules.map((r) =>
        r.id === editingRule.id
          ? {
              ...r,
              name: name.trim(),
              actions: actions.map((act) => ({
                id: (act as any).id || generateId(),
                kind: act.kind,
                account_id: act.account_id,
                to_account_id: act.to_account_id || undefined,
                category_id: act.category_id || undefined,
                amount: Number(act.amount),
                note: act.note?.trim() || undefined,
              })),
            }
          : r
      );
      saveRules(updatedRules);
      toast.success(`Automation "${name}" updated!`);
    } else {
      const newRule: AutomationRule = {
        id: generateId(),
        name: name.trim(),
        actions: actions.map((act) => ({
          id: generateId(),
          kind: act.kind,
          account_id: act.account_id,
          to_account_id: act.to_account_id || undefined,
          category_id: act.category_id || undefined,
          amount: Number(act.amount),
          note: act.note?.trim() || undefined,
        })),
      };
      saveRules([...rules, newRule]);
      toast.success(`Automation "${name}" created with ${actions.length} shortcuts!`);
    }

    // Reset Form
    setName("");
    setActions([{ kind: "expense", account_id: "", category_id: "", amount: 0, note: "" }]);
    setEditingRule(null);
    setCreateOpen(false);
  }

  function handleDeleteRule(id: string) {
    const newRules = rules.filter((r) => r.id !== id);
    saveRules(newRules);
    toast.success("Automation template deleted.");
  }

  async function executeAutomation(rule: AutomationRule) {
    if (executingId) return;
    if (!authUser?.id) {
      return toast.error("User session expired. Please sign in again.");
    }
    setExecutingId(rule.id);

    try {
      const inserts = rule.actions.map((act) => ({
        user_id: authUser.id, // Authenticated user ID matches DB RLS policies
        kind: act.kind,
        category_id: act.kind !== "transfer" ? act.category_id || null : null,
        account_id: act.account_id,
        to_account_id: act.kind === "transfer" ? act.to_account_id || null : null,
        amount: Number(act.amount),
        note: act.note || `Automation shortcut: ${rule.name}`,
        occurred_on: new Date().toISOString().split("T")[0],
      }));

      const { error } = await supabase.from("transactions").insert(inserts);

      if (error) {
        toast.error(`Execution failed: ${error.message}`);
      } else {
        toast.success(`Executed "${rule.name}"! Logged ${rule.actions.length} transactions successfully.`);
        qc.invalidateQueries({ queryKey: ["transactions"] });
        qc.invalidateQueries({ queryKey: ["accounts"] });
      }
    } catch (e: any) {
      toast.error(`Execution error: ${e.message}`);
    } finally {
      setExecutingId(null);
    }
  }

  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const catMap = new Map(cats.map((c) => [c.id, c]));

  return (
    <div className="w-full relative min-h-[60vh] pb-10">
      
      {rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/40 p-12 text-center max-w-xl mx-auto flex flex-col items-center gap-4 mt-12">
          <div className="h-12 w-12 rounded-full bg-accent/10 text-accent flex items-center justify-center">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold">No Shortcuts Yet</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              Automations allow you to record templates for recurring transactions (like rent, salary, or coffee) and log them with a single click.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="rounded-full cursor-pointer text-xs font-semibold bg-accent hover:bg-accent/90 text-accent-foreground shadow-sm">
            Create your first macro
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map((rule) => {
            return (
              <div key={rule.id} className="relative rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group overflow-hidden">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b pb-2">
                    <h3 className="font-serif text-base font-bold truncate pr-6">{rule.name}</h3>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      {rule.actions.length} action{rule.actions.length > 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Actions summary list */}
                  <div className="space-y-3">
                    {rule.actions.map((act, i) => {
                      const acc = accountMap.get(act.account_id);
                      const toAcc = act.to_account_id ? accountMap.get(act.to_account_id) : null;
                      const cat = act.category_id ? catMap.get(act.category_id) : null;

                      const textBadgeColor = 
                        act.kind === "income" 
                          ? "text-[color:var(--success)]"
                          : act.kind === "expense"
                          ? "text-[color:var(--destructive)]"
                          : "text-blue-500";

                      return (
                        <div key={act.id} className="text-xs space-y-1 bg-muted/30 p-2 rounded-lg border border-border/40">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">#{i + 1}</span>
                            <span className={`font-serif num font-bold ${textBadgeColor}`}>
                              {act.kind === "expense" ? "−" : act.kind === "income" ? "+" : "↔"} {fmtMoney(act.amount, currency)}
                            </span>
                          </div>

                          <div className="text-[11px] text-muted-foreground space-y-0.5 mt-1">
                            <div className="flex items-center gap-1">
                              <span className="font-semibold text-foreground/80">Account:</span>
                              <span className="truncate flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: acc?.color || "#888" }} />
                                {acc?.name || "Deleted"}
                              </span>
                            </div>

                            {act.kind === "transfer" ? (
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-foreground/80">To:</span>
                                <span className="truncate flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: toAcc?.color || "#888" }} />
                                  {toAcc?.name || "Deleted"}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-foreground/80">Category:</span>
                                <span className="truncate">
                                  {cat?.icon} {cat?.name || "Deleted"}
                                </span>
                              </div>
                            )}

                            {act.note && (
                              <div className="text-[9px] italic text-muted-foreground truncate mt-0.5">
                                "{act.note}"
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-5 pt-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    Total: <span className="font-serif num font-bold text-foreground text-sm">
                      {fmtMoney(rule.actions.reduce((sum, act) => sum + (act.kind === "expense" ? act.amount : act.kind === "income" ? act.amount : 0), 0), currency)}
                    </span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditingRule(rule)}
                      className="h-8 w-8 flex items-center justify-center rounded-full bg-accent/10 text-muted-foreground hover:text-foreground hover:bg-accent/15 transition-colors cursor-pointer"
                      title="Edit Macro"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="h-8 w-8 flex items-center justify-center rounded-full bg-destructive/10 text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors cursor-pointer"
                      title="Delete Macro"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <Button
                      onClick={() => executeAutomation(rule)}
                      disabled={executingId === rule.id}
                      className="gap-1 rounded-full cursor-pointer h-8 px-3.5 text-xs font-semibold shadow-sm bg-accent hover:bg-accent/90 text-accent-foreground"
                    >
                      <Play className="h-3 w-3 fill-current shrink-0" />
                      {executingId === rule.id ? "Running..." : "Trigger"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Add Macro FAB Button */}
      <Dialog open={createOpen} onOpenChange={(val) => {
        setCreateOpen(val);
        if (!val) {
          setEditingRule(null);
          setName("");
          setActions([{ kind: "expense", account_id: "", category_id: "", amount: 0, note: "" }]);
        }
      }}>
        <DialogTrigger asChild>
          <Button 
            className="fixed bottom-20 md:bottom-6 right-6 z-40 rounded-full h-10 w-10 md:h-14 md:w-14 p-0 shadow-lg cursor-pointer bg-accent hover:bg-accent/90 text-accent-foreground border border-accent/20"
            title="Create Automation Macro"
          >
            <Plus className="h-5 w-5 md:h-6 md:w-6" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md z-[100] max-h-[90vh] overflow-y-auto thin-scroll">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              {editingRule ? "Edit Automation Macro" : "New Automation Macro"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateRule} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="macro-name" className="text-xs font-semibold">Macro Name</Label>
              <Input
                id="macro-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Daily Coffee, Rent Payment"
              />
            </div>

            <div className="border-t pt-3 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold">Transactions ({actions.length})</Label>
                <Button type="button" variant="outline" size="sm" onClick={addActionForm} className="h-8 rounded-full text-xs font-semibold cursor-pointer">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Transaction
                </Button>
              </div>

              {actions.map((act, idx) => (
                <div key={idx} className="p-3 border rounded-xl bg-muted/40 space-y-3 relative">
                  {actions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeActionForm(idx)}
                      className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-destructive text-[10px] font-semibold cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Transaction #{idx + 1}</span>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold">Type</Label>
                      <Select value={act.kind} onValueChange={(v: any) => updateActionField(idx, "kind", v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[150]">
                          <SelectItem value="expense">Expense</SelectItem>
                          <SelectItem value="income">Income</SelectItem>
                          <SelectItem value="transfer">Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold">Amount</Label>
                      <Input
                        type="number"
                        step="any"
                        className="h-8 text-xs"
                        value={act.amount || ""}
                        onChange={(e) => updateActionField(idx, "amount", Number(e.target.value))}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold">
                        {act.kind === "transfer" ? "Source Account" : "Account"}
                      </Label>
                      <Select value={act.account_id} onValueChange={(v) => updateActionField(idx, "account_id", v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent className="z-[150]">
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {act.kind === "transfer" ? (
                      <div className="space-y-1">
                        <Label className="text-[10px] font-semibold">Destination Account</Label>
                        <Select value={act.to_account_id || ""} onValueChange={(v) => updateActionField(idx, "to_account_id", v)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                          <SelectContent className="z-[150]">
                            {accounts.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label className="text-[10px] font-semibold">Category</Label>
                        <Select value={act.category_id || ""} onValueChange={(v) => updateActionField(idx, "category_id", v)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent className="z-[150]">
                            {cats.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.icon} {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold">Optional Note</Label>
                    <Input
                      className="h-8 text-xs"
                      value={act.note || ""}
                      onChange={(e) => updateActionField(idx, "note", e.target.value)}
                      placeholder="e.g. coffee details"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <Button type="submit" className="rounded-full cursor-pointer text-xs font-semibold bg-primary hover:bg-[#2c2826] text-primary-foreground">
                {editingRule ? "Update Macro" : "Save Macro"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
