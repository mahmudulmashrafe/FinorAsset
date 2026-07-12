import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMoney } from "@/lib/finance";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Play, Plus, Cpu, Sliders, Info, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useUserProfile } from "@/hooks/use-user-profile";

export const Route = createFileRoute("/_authenticated/automation")({
  component: AutomationPage,
  head: () => ({ meta: [{ title: "Automation — FinorAsset" }] }),
});

interface AutomationRule {
  id: string;
  name: string;
  kind: "income" | "expense" | "transfer";
  category_id?: string;
  account_id: string;
  to_account_id?: string;
  amount: number;
  note?: string;
}

function AutomationPage() {
  const qc = useQueryClient();
  const { currency } = useUserProfile();

  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: api.listCategories });

  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"income" | "expense" | "transfer">("expense");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  // Load rules from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("finorasset_automations");
    if (stored) {
      try {
        setRules(JSON.parse(stored));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  function saveRules(newRules: AutomationRule[]) {
    setRules(newRules);
    localStorage.setItem("finorasset_automations", JSON.stringify(newRules));
  }

  function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Automation name is required");
    if (!accountId) return toast.error("Please select an account");
    if (kind === "transfer" && !toAccountId) return toast.error("Please select a destination account");
    if (kind === "transfer" && accountId === toAccountId) return toast.error("Source and destination accounts must differ");
    if (kind !== "transfer" && !categoryId) return toast.error("Please select a category");
    if (!amount || Number(amount) <= 0) return toast.error("Please enter a valid amount");

    const newRule: AutomationRule = {
      id: crypto.randomUUID(),
      name: name.trim(),
      kind,
      account_id: accountId,
      to_account_id: kind === "transfer" ? toAccountId : undefined,
      category_id: kind !== "transfer" ? categoryId : undefined,
      amount: Number(amount),
      note: note.trim() || undefined,
    };

    saveRules([...rules, newRule]);
    toast.success(`Automation "${name}" created!`);

    // Reset Form
    setName("");
    setKind("expense");
    setAccountId("");
    setToAccountId("");
    setCategoryId("");
    setAmount("");
    setNote("");
    setCreateOpen(false);
  }

  function handleDeleteRule(id: string) {
    const newRules = rules.filter((r) => r.id !== id);
    saveRules(newRules);
    toast.success("Automation template deleted.");
  }

  async function executeAutomation(rule: AutomationRule) {
    if (executingId) return;
    setExecutingId(rule.id);

    try {
      const { error } = await supabase.from("transactions").insert({
        kind: rule.kind,
        category_id: rule.kind !== "transfer" ? rule.category_id || null : null,
        account_id: rule.account_id,
        to_account_id: rule.kind === "transfer" ? rule.to_account_id || null : null,
        amount: Number(rule.amount),
        note: rule.note || `Automation shortcut: ${rule.name}`,
        occurred_on: new Date().toISOString().split("T")[0],
      });

      if (error) {
        toast.error(`Execution failed: ${error.message}`);
      } else {
        toast.success(`Executed "${rule.name}"! Entry logged successfully.`);
        // Refresh values across dashboard pages
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
    <div className="space-y-6 w-full">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1">
            <Cpu className="h-3 w-3 text-accent" /> One-Click Shortcuts
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold">Automation</h1>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5 rounded-full cursor-pointer text-xs font-semibold shadow-md bg-accent hover:bg-accent/90 text-accent-foreground">
              <Plus className="h-4 w-4" /> Create Macro
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md z-[100] max-h-[90vh] overflow-y-auto thin-scroll">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">New Automation Macro</DialogTitle>
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

              <div className="space-y-1.5">
                <Label htmlFor="macro-kind" className="text-xs font-semibold">Transaction Type</Label>
                <Select value={kind} onValueChange={(v: any) => setKind(v)}>
                  <SelectTrigger id="macro-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[150]">
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="macro-acc" className="text-xs font-semibold">
                  {kind === "transfer" ? "Source Account" : "Account"}
                </Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="macro-acc">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent className="z-[150]">
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {kind === "transfer" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="macro-to-acc" className="text-xs font-semibold">Destination Account</Label>
                  <Select value={toAccountId} onValueChange={setToAccountId}>
                    <SelectTrigger id="macro-to-acc">
                      <SelectValue placeholder="Select destination account" />
                    </SelectTrigger>
                    <SelectContent className="z-[150]">
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({a.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="macro-cat" className="text-xs font-semibold">Category</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger id="macro-cat">
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

              <div className="space-y-1.5">
                <Label htmlFor="macro-amt" className="text-xs font-semibold">Amount</Label>
                <Input
                  id="macro-amt"
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="macro-note" className="text-xs font-semibold">Optional Note</Label>
                <Input
                  id="macro-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Specific tags or details"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button type="submit" className="rounded-full cursor-pointer text-xs font-semibold bg-primary hover:bg-[#2c2826] text-primary-foreground">
                  Save Macro
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/40 p-12 text-center max-w-xl mx-auto flex flex-col items-center gap-4">
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
            const acc = accountMap.get(rule.account_id);
            const toAcc = rule.to_account_id ? accountMap.get(rule.to_account_id) : null;
            const cat = rule.category_id ? catMap.get(rule.category_id) : null;
            
            // Badge color scheme
            const badgeColor = 
              rule.kind === "income" 
                ? "bg-[color:var(--success)]/10 text-[color:var(--success)] border-[color:var(--success)]/20"
                : rule.kind === "expense"
                ? "bg-[color:var(--destructive)]/10 text-[color:var(--destructive)] border-[color:var(--destructive)]/20"
                : "bg-blue-500/10 text-blue-500 border-blue-500/20";

            return (
              <div key={rule.id} className="relative rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group overflow-hidden">
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-serif text-lg font-bold truncate pr-6">{rule.name}</h3>
                    <Badge variant="outline" className={`capitalize text-[9px] px-1.5 py-0 leading-none shrink-0 ${badgeColor}`}>
                      {rule.kind}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-foreground shrink-0">From:</span>
                      <span className="truncate flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: acc?.color || "#888" }} />
                        {acc?.name || "Deleted Account"}
                      </span>
                    </div>

                    {rule.kind === "transfer" ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground shrink-0">To:</span>
                        <span className="truncate flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: toAcc?.color || "#888" }} />
                          {toAcc?.name || "Deleted Account"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground shrink-0">Category:</span>
                        <span className="truncate">
                          {cat?.icon} {cat?.name || "Deleted Category"}
                        </span>
                      </div>
                    )}

                    {rule.note && (
                      <div className="text-[10px] italic text-muted-foreground/80 truncate border-t pt-1.5 mt-2">
                        "{rule.note}"
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-5 pt-3 border-t">
                  <span className="font-serif text-xl num font-bold text-foreground">
                    {fmtMoney(rule.amount, currency)}
                  </span>

                  <div className="flex items-center gap-1.5">
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
    </div>
  );
}
