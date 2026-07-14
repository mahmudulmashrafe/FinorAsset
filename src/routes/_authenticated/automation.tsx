import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMoney, computeAccountBalances } from "@/lib/finance";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
import { Switch } from "@/components/ui/switch";

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
  isSplit?: boolean;
  splits?: { accountId: string; amount: number }[];
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
  const { data: txns = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => api.listTransactions(1000) });
  const balances = computeAccountBalances(accounts, txns);

  // Load rules — try localStorage first (instant), then Supabase as background upgrade
  function loadLocalRules(): AutomationRule[] {
    const stored = localStorage.getItem("finorasset_automations");
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((rule: any) => {
        if (rule.actions && Array.isArray(rule.actions)) return rule;
        return {
          id: rule.id || generateId(),
          name: rule.name || "Legacy Macro",
          actions: [{
            id: generateId(),
            kind: rule.kind || "expense",
            category_id: rule.category_id,
            account_id: rule.account_id || "",
            to_account_id: rule.to_account_id,
            amount: Number(rule.amount || 0),
            note: rule.note,
          }]
        };
      });
    } catch { return []; }
  }

  const { data: rules = [] } = useQuery({
    queryKey: ["macros", authUser?.id],
    enabled: !!authUser,
    initialData: loadLocalRules,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("macros")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        // Table doesn't exist yet — use localStorage
        if (error.code === "42P01") return loadLocalRules();
        throw error;
      }
      return data as AutomationRule[];
    }
  });

  const [executingId, setExecutingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [selectedRule, setSelectedRule] = useState<AutomationRule | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [actions, setActions] = useState<Omit<AutomationAction, "id">[]>([
    { kind: "expense", account_id: "", category_id: "", amount: 0, note: "", isSplit: false, splits: [] }
  ]);

  // Sync editing rule to form state
  useEffect(() => {
    if (editingRule) {
      setName(editingRule.name);
      setActions(editingRule.actions);
      setCreateOpen(true);
    }
  }, [editingRule]);

  function addActionForm() {
    setActions([...actions, { kind: "expense", account_id: accounts[0]?.id || "", category_id: "", amount: 0, note: "", isSplit: false, splits: [] }]);
  }

  function removeActionForm(index: number) {
    const next = [...actions];
    next.splice(index, 1);
    setActions(next);
  }

  function updateActionFields(index: number, changes: Partial<Omit<AutomationAction, "id">>) {
    const next = [...actions];
    next[index] = { ...next[index], ...changes };
    
    // Auto-initialize or sync single split if it's the only one
    if ("amount" in changes) {
      const splitsList = next[index].splits || [];
      if (splitsList.length <= 1) {
        next[index].splits = [{ accountId: next[index].account_id || accounts[0]?.id || "", amount: Number(changes.amount) || 0 }];
      }
    }
    
    // Reset dependency fields if kind transitions
    if ("kind" in changes && changes.kind) {
      next[index].category_id = "";
      next[index].to_account_id = "";
      next[index].isSplit = false;
      next[index].splits = [];
    }
    setActions(next);
  }

  function updateActionField(index: number, field: string, value: any) {
    updateActionFields(index, { [field]: value });
  }

  function updateActionSplit(actionIndex: number, splitIndex: number, field: "accountId" | "amount", value: any) {
    const next = [...actions];
    const nextSplits = [...(next[actionIndex].splits || [])];
    nextSplits[splitIndex] = { ...nextSplits[splitIndex], [field]: value };
    next[actionIndex] = { ...next[actionIndex], splits: nextSplits };
    setActions(next);
  }

  function addActionSplit(actionIndex: number) {
    const next = [...actions];
    const nextSplits = [...(next[actionIndex].splits || [])];
    nextSplits.push({ accountId: accounts[0]?.id || "", amount: 0 });
    next[actionIndex] = { ...next[actionIndex], splits: nextSplits };
    setActions(next);
  }

  function removeActionSplit(actionIndex: number, splitIndex: number) {
    const next = [...actions];
    const nextSplits = [...(next[actionIndex].splits || [])];
    nextSplits.splice(splitIndex, 1);
    next[actionIndex] = { ...next[actionIndex], splits: nextSplits };
    setActions(next);
  }

  async function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Automation name is required");
    
    // Validate all actions
    for (let i = 0; i < actions.length; i++) {
      const act = actions[i];
      const prefix = `Transaction #${i + 1}: `;
      if (act.isSplit) {
        const splits = act.splits || [];
        const totalAllocated = splits.reduce((sum, s) => sum + s.amount, 0);
        if (Math.abs(totalAllocated - Number(act.amount)) >= 0.01) {
          return toast.error(`${prefix}Total split amount (${fmtMoney(totalAllocated, currency)}) must match transaction amount (${fmtMoney(Number(act.amount), currency)})`);
        }
        for (const split of splits) {
          if (!split.accountId) {
            return toast.error(`${prefix}Please select an account for all splits`);
          }
          if (!split.amount || split.amount <= 0) {
            return toast.error(`${prefix}Split amounts must be positive`);
          }
        }
      } else {
        if (!act.account_id) return toast.error(`${prefix}Please select an account`);
      }
      
      if (act.kind === "transfer" && !act.to_account_id) return toast.error(`${prefix}Please select a destination account`);
      if (act.kind === "transfer" && act.account_id === act.to_account_id) return toast.error(`${prefix}Source and destination accounts must differ`);
      if (act.kind !== "transfer" && !act.category_id) return toast.error(`${prefix}Please select a category`);
      if (!act.amount || Number(act.amount) <= 0) return toast.error(`${prefix}Please enter a valid amount`);
    }

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return toast.error("User session expired. Please sign in again.");

    const mappedActions = actions.map((act) => ({
      id: (act as any).id || generateId(),
      kind: act.kind,
      account_id: act.account_id,
      to_account_id: act.to_account_id || undefined,
      category_id: act.category_id || undefined,
      amount: Number(act.amount),
      note: act.note?.trim() || undefined,
      isSplit: !!act.isSplit,
      splits: act.isSplit ? act.splits : undefined,
    }));

    if (editingRule) {
      // 1. Try updating in Supabase
      const { error } = await supabase
        .from("macros")
        .update({
          name: name.trim(),
          actions: mappedActions
        })
        .eq("id", editingRule.id);

      if (error && error.code !== "42P01") {
        return toast.error(error.message);
      }

      if (error && error.code === "42P01") {
        // Fallback to local storage
        const stored = localStorage.getItem("finorasset_automations");
        const parsed = stored ? JSON.parse(stored) : [];
        const next = parsed.map((r: any) => r.id === editingRule.id ? { ...r, name: name.trim(), actions: mappedActions } : r);
        localStorage.setItem("finorasset_automations", JSON.stringify(next));
      }

      toast.success(`Automation "${name}" updated!`);
    } else {
      // 1. Try inserting in Supabase
      const { error } = await supabase
        .from("macros")
        .insert({
          user_id: u.user.id,
          name: name.trim(),
          actions: mappedActions
        });

      if (error && error.code !== "42P01") {
        return toast.error(error.message);
      }

      if (error && error.code === "42P01") {
        // Fallback to local storage
        const stored = localStorage.getItem("finorasset_automations");
        const parsed = stored ? JSON.parse(stored) : [];
        const newRule = {
          id: generateId(),
          name: name.trim(),
          actions: mappedActions
        };
        parsed.push(newRule);
        localStorage.setItem("finorasset_automations", JSON.stringify(parsed));
      }

      toast.success(`Automation "${name}" created with ${actions.length} shortcuts!`);
    }

    // Reset Form
    setName("");
    setActions([{ kind: "expense", account_id: accounts[0]?.id || "", category_id: "", amount: 0, note: "", isSplit: false, splits: [] }]);
    setEditingRule(null);
    setCreateOpen(false);
    qc.invalidateQueries({ queryKey: ["macros"] });
  }

  async function handleDeleteRule(id: string) {
    const { error } = await supabase
      .from("macros")
      .delete()
      .eq("id", id);

    if (error && error.code !== "42P01") {
      return toast.error(error.message);
    }

    if (error && error.code === "42P01") {
      // Fallback to local storage
      const stored = localStorage.getItem("finorasset_automations");
      const parsed = stored ? JSON.parse(stored) : [];
      const next = parsed.filter((r: any) => r.id !== id);
      localStorage.setItem("finorasset_automations", JSON.stringify(next));
    }

    toast.success("Automation template deleted.");
    qc.invalidateQueries({ queryKey: ["macros"] });
  }

  async function executeAutomation(rule: AutomationRule) {
    if (executingId) return;
    if (!authUser?.id) {
      return toast.error("User session expired. Please sign in again.");
    }

    // Balance check validation
    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const deductions = new Map<string, number>();

    for (const act of rule.actions) {
      if (act.isSplit) {
        const splits = act.splits || [];
        for (const split of splits) {
          const amount = Number(split.amount);
          if (act.kind === "expense") {
            deductions.set(split.accountId, (deductions.get(split.accountId) ?? 0) + amount);
          }
        }
      } else {
        const amount = Number(act.amount);
        if (act.kind === "expense" || act.kind === "transfer") {
          deductions.set(act.account_id, (deductions.get(act.account_id) ?? 0) + amount);
        }
      }
    }

    for (const [accountId, totalDeduction] of deductions.entries()) {
      const balance = balances.get(accountId) ?? 0;
      if (balance < totalDeduction) {
        const accName = accountMap.get(accountId)?.name || "selected account";
        return toast.error(`Insufficient funds to run macro "${rule.name}". ${accName} has ${fmtMoney(balance, currency)}, but macro requires ${fmtMoney(totalDeduction, currency)}.`);
      }
    }

    setExecutingId(rule.id);

    try {
      const inserts: any[] = [];
      for (const act of rule.actions) {
        if (act.isSplit) {
          const splits = act.splits || [];
          for (const split of splits) {
            inserts.push({
              user_id: authUser.id,
              kind: act.kind,
              category_id: act.category_id || null,
              account_id: split.accountId,
              to_account_id: null,
              amount: Number(split.amount),
              note: act.note || `Automation shortcut: ${rule.name}`,
              occurred_on: new Date().toISOString().split("T")[0],
            });
          }
        } else {
          inserts.push({
            user_id: authUser.id,
            kind: act.kind,
            category_id: act.kind !== "transfer" ? act.category_id || null : null,
            account_id: act.account_id,
            to_account_id: act.kind === "transfer" ? act.to_account_id || null : null,
            amount: Number(act.amount),
            note: act.note || `Automation shortcut: ${rule.name}`,
            occurred_on: new Date().toISOString().split("T")[0],
          });
        }
      }

      const { error } = await supabase.from("transactions").insert(inserts);

      if (error) {
        toast.error(`Execution failed: ${error.message}`);
      } else {
        toast.success(`Executed "${rule.name}"! Logged ${inserts.length} transactions successfully.`);
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
    <div className="w-full relative min-h-[60vh] pb-10 space-y-6">


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
              <div
                key={rule.id}
                className="relative rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group overflow-hidden h-[155px]"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-serif text-base font-bold truncate pr-2 text-foreground">
                      {rule.name}
                    </h3>
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold pt-1 flex items-center justify-between">
                    <span>{rule.actions.length} Shortcut{rule.actions.length > 1 ? "s" : ""}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-auto pt-2 border-t">
                  <span className="text-[10px] text-muted-foreground select-none max-w-[120px] truncate">
                    Actions: {rule.actions.map(a => a.note || a.kind).join(", ")}
                  </span>

                  <div className="flex items-center gap-1 z-[5]">
                    <button
                      onClick={() => setEditingRule(rule)}
                      className="h-8 w-8 flex items-center justify-center rounded-full bg-accent/10 text-muted-foreground hover:text-foreground hover:bg-accent/15 transition-colors cursor-pointer"
                      title="Edit Shortcut"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="h-8 w-8 flex items-center justify-center rounded-full bg-destructive/10 text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors cursor-pointer"
                      title="Delete Shortcut"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <Button
                      onClick={() => executeAutomation(rule)}
                      disabled={executingId === rule.id}
                      className="gap-1 rounded-full cursor-pointer h-8 px-3 text-xs font-semibold shadow-sm bg-accent hover:bg-accent/90 text-accent-foreground ml-1"
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

      {/* Details Dialog */}
      <Dialog open={!!selectedRule} onOpenChange={(val) => { if (!val) setSelectedRule(null); }}>
        <DialogContent className="max-w-md z-[100] max-h-[90vh] overflow-y-auto thin-scroll">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl flex items-center gap-2">
              <Cpu className="h-5 w-5 text-accent" /> {selectedRule?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              Transaction Shortcuts ({selectedRule?.actions.length || 0})
            </div>

            <div className="space-y-3">
              {selectedRule?.actions.map((act, i) => {
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
                  <div key={act.id} className="text-xs space-y-1.5 bg-muted/40 p-3 rounded-xl border border-border/60">
                    <div className="flex items-center justify-between gap-1 border-b pb-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Transaction #{i + 1}</span>
                      <span className={`font-serif num font-bold text-sm ${textBadgeColor}`}>
                        {act.kind === "expense" ? "−" : act.kind === "income" ? "+" : "↔"} {fmtMoney(act.amount, currency)}
                      </span>
                    </div>

                    <div className="text-xs text-muted-foreground space-y-1 mt-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground/80 w-16 shrink-0">Account:</span>
                        <span className="truncate flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: acc?.color || "#888" }} />
                          {acc?.name || "Deleted Account"}
                        </span>
                      </div>

                      {act.kind === "transfer" ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground/80 w-16 shrink-0">To:</span>
                          <span className="truncate flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: toAcc?.color || "#888" }} />
                            {toAcc?.name || "Deleted Account"}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground/80 w-16 shrink-0">Category:</span>
                          <span className="truncate">
                            {cat?.icon} {cat?.name || "Deleted Category"}
                          </span>
                        </div>
                      )}

                      {act.note && (
                        <div className="text-[10px] italic text-muted-foreground truncate border-t pt-1 mt-1.5">
                          "{act.note}"
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t mt-6">
              <div>
                <span className="text-xs text-muted-foreground block">Aggregate Total:</span>
                <span className="font-serif num font-black text-xl text-foreground">
                  {selectedRule && fmtMoney(selectedRule.actions.reduce((sum, act) => sum + (act.kind === "expense" ? act.amount : act.kind === "income" ? act.amount : 0), 0), currency)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedRule) {
                      setEditingRule(selectedRule);
                      setSelectedRule(null);
                    }
                  }}
                  className="gap-1.5 rounded-full cursor-pointer h-9 px-4 text-xs font-semibold"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  onClick={() => {
                    if (selectedRule) {
                      executeAutomation(selectedRule);
                      setSelectedRule(null);
                    }
                  }}
                  disabled={selectedRule && executingId === selectedRule.id}
                  className="gap-1.5 rounded-full cursor-pointer h-9 px-5 text-xs font-semibold shadow-sm bg-accent hover:bg-accent/90 text-accent-foreground"
                >
                  <Play className="h-3.5 w-3.5 fill-current shrink-0" />
                  Trigger Macro
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Floatable Add Macro Trigger — portaled to body to escape transform ancestor */}
      {typeof document !== 'undefined' && createPortal(
        <Button 
          onClick={() => {
            setEditingRule(null);
            setName("");
            setActions([{ kind: "expense", account_id: "", category_id: "", amount: 0, note: "" }]);
            setCreateOpen(true);
          }}
          size="icon"
          className="fixed bottom-[5rem] md:bottom-6 right-6 z-40 h-10 w-10 md:h-12 md:w-12 rounded-full bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg border border-accent/20 flex items-center justify-center cursor-pointer"
          title="Create Automation Macro"
        >
          <Plus className="h-5 w-5 md:h-6 md:w-6" />
        </Button>,
        document.body
      )}

      <Dialog open={createOpen} onOpenChange={(val) => {
        setCreateOpen(val);
        if (!val) {
          setEditingRule(null);
          setName("");
          setActions([{ kind: "expense", account_id: "", category_id: "", amount: 0, note: "" }]);
        }
      }}>
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

                  {act.kind !== "transfer" && (
                    <div className="flex items-center justify-between border-y py-1.5 my-1 bg-muted/20 px-2 rounded-lg">
                      <Label className="text-[10px] font-semibold">Split across multiple accounts</Label>
                      <Switch
                        checked={!!act.isSplit}
                        onCheckedChange={(checked) => {
                          updateActionFields(idx, {
                            isSplit: checked,
                            splits: checked ? [{ accountId: act.account_id || accounts[0]?.id || "", amount: Number(act.amount) || 0 }] : []
                          });
                        }}
                      />
                    </div>
                  )}

                  {act.isSplit && act.kind !== "transfer" ? (
                    <div className="space-y-2 border-t pt-2 mt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold uppercase text-muted-foreground">Account Splits</span>
                        <button
                          type="button"
                          onClick={() => addActionSplit(idx)}
                          className="text-[10px] text-accent hover:underline cursor-pointer"
                        >
                          + Add Account Split
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(act.splits || []).map((split, sIdx) => {
                          return (
                            <div key={sIdx} className="flex gap-2 items-center">
                              <Select
                                value={split.accountId || "none"}
                                onValueChange={(val) => updateActionSplit(idx, sIdx, "accountId", val === "none" ? "" : val)}
                              >
                                <SelectTrigger className="flex-1 h-8 text-xs bg-background">
                                  <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent className="z-[160]">
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
                              <Input
                                type="number"
                                step="any"
                                className="w-24 h-8 text-xs bg-background"
                                value={split.amount || ""}
                                onChange={(e) => updateActionSplit(idx, sIdx, "amount", Number(e.target.value) || 0)}
                                placeholder="0.00"
                              />
                              {(act.splits || []).length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeActionSplit(idx, sIdx)}
                                  className="text-muted-foreground hover:text-destructive p-1 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-[9px] text-muted-foreground flex justify-between px-1">
                        <span>Allocated: {fmtMoney((act.splits || []).reduce((sum, s) => sum + s.amount, 0), currency)} / {fmtMoney(Number(act.amount) || 0, currency)}</span>
                      </div>
                      
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
                    </div>
                  ) : (
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
                  )}

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
