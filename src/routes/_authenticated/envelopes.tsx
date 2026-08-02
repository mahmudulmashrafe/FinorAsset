import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMoney, computeAccountBalances, monthKey } from "@/lib/finance";
import type { Envelope, EnvelopeAllocation } from "@/lib/finance";
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/use-user-profile";
import { 
  Mail, Plus, Trash2, Pencil, AlertTriangle, Loader2, RefreshCw, Lock, Unlock, 
  Wallet, Layers, ArrowRight, ShieldCheck, ChevronRight, X, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/envelopes")({
  component: EnvelopesPage,
  head: () => ({ meta: [{ title: "Envelopes — FinorAsset" }] }),
});

const COLORS = [
  "#F59E0B", "#D97706", "#F97316", "#EA580C",
  "#EF4444", "#DC2626", "#EC4899", "#DB2777",
  "#8B5CF6", "#7C3AED", "#6366F1", "#4F46E5",
  "#3B82F6", "#2563EB", "#06B6D4", "#0891B2",
  "#10B981", "#059669", "#14B8A6", "#0D9488",
  "#84CC16", "#65A30D", "#6B7280", "#374151",
];

const ICONS = ["✉️", "🏠", "🛒", "🚗", "✈️", "💡", "🍔", "💊", "🎓", "🎮", "🎁", "💳", "🏖️", "💻", "⚡"];

function EnvelopesPage() {
  const qc = useQueryClient();
  const { currency, authUser } = useUserProfile();

  const [currentMonth, setCurrentMonth] = useState(() => monthKey(new Date()));
  const [dbError, setDbError] = useState<any>(null);

  const { data: envelopes = [], isLoading: loadingEnv } = useQuery({
    queryKey: ["envelopes", currentMonth],
    queryFn: async () => {
      try {
        const data = await api.listEnvelopes(currentMonth);
        setDbError(null);
        return data;
      } catch (err: any) {
        if (err.code === "42P01") {
          setDbError(err);
          return [];
        }
        throw err;
      }
    },
    enabled: !!authUser,
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ["envelope_allocations"],
    queryFn: async () => {
      try {
        return await api.listEnvelopeAllocations();
      } catch {
        return [];
      }
    },
    enabled: !!authUser,
  });

  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const { data: txns = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => api.listTransactions(1000) });

  const accountBalances = computeAccountBalances(accounts, txns);
  const accMap = new Map(accounts.map(a => [a.id, a]));

  // Calculate locked money per account across all envelope allocations
  const lockedPerAccount = new Map<string, number>();
  allocations.forEach((alloc) => {
    const prev = lockedPerAccount.get(alloc.account_id) ?? 0;
    lockedPerAccount.set(alloc.account_id, prev + Number(alloc.amount));
  });

  // Calculate total allocated funds per envelope
  const allocatedPerEnvelope = new Map<string, number>();
  const allocationsByEnvelope = new Map<string, EnvelopeAllocation[]>();
  allocations.forEach((alloc) => {
    const prev = allocatedPerEnvelope.get(alloc.envelope_id) ?? 0;
    allocatedPerEnvelope.set(alloc.envelope_id, prev + Number(alloc.amount));

    const list = allocationsByEnvelope.get(alloc.envelope_id) ?? [];
    list.push(alloc);
    allocationsByEnvelope.set(alloc.envelope_id, list);
  });

  // View and summary states (matching Loans page)
  const [envView, setEnvView] = useState<"all" | "funded" | "pending">("all");
  const [showSummary, setShowSummary] = useState(false);

  // Dialog states
  const [open, setOpen] = useState(false);
  const [editingEnvelope, setEditingEnvelope] = useState<Envelope | null>(null);
  const [selectedEnvelope, setSelectedEnvelope] = useState<Envelope | null>(null);
  const [deleteEnvelope, setDeleteEnvelope] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [icon, setIcon] = useState("✉️");
  const [color, setColor] = useState(COLORS[0]);
  const [note, setNote] = useState("");

  // Allocation Form State in Modal
  const [allocAccountId, setAllocAccountId] = useState("");
  const [allocAmount, setAllocAmount] = useState("");
  const [allocating, setAllocating] = useState(false);

  function resetForm() {
    setName("");
    setTargetAmount("");
    setIcon("✉️");
    setColor(COLORS[0]);
    setNote("");
    setEditingEnvelope(null);
  }

  function handleAddClick() {
    resetForm();
    setOpen(true);
  }

  function handleEdit(env: Envelope) {
    setEditingEnvelope(env);
    setName(env.name);
    setTargetAmount(String(env.target_amount));
    setIcon(env.icon || "✉️");
    setColor(env.color || COLORS[0]);
    setNote(env.note || "");
    setOpen(true);
  }

  async function handleSaveEnvelope() {
    if (!name.trim()) return toast.error("Please enter envelope name");
    const numTarget = Number(targetAmount);
    if (isNaN(numTarget) || numTarget < 0) return toast.error("Please enter a valid target amount");
    if (!authUser) return;

    setSaving(true);
    try {
      if (editingEnvelope) {
        const { error } = await supabase
          .from("envelopes" as any)
          .update({
            name: name.trim(),
            target_amount: numTarget,
            icon,
            color,
            note: note.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingEnvelope.id);
        if (error) throw error;
        toast.success("Envelope updated!");
      } else {
        const { error } = await supabase.from("envelopes" as any).insert({
          user_id: authUser.id,
          name: name.trim(),
          target_amount: numTarget,
          icon,
          color,
          note: note.trim() || null,
          month_key: currentMonth,
        });
        if (error) throw error;
        toast.success("Envelope created!");
      }

      qc.invalidateQueries({ queryKey: ["envelopes"] });
      setOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Failed to save envelope");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEnvelope(id: string) {
    try {
      const { error } = await supabase.from("envelopes" as any).delete().eq("id", id);
      if (error) throw error;
      toast.success("Envelope deleted!");
      qc.invalidateQueries({ queryKey: ["envelopes"] });
      qc.invalidateQueries({ queryKey: ["envelope_allocations"] });
      setSelectedEnvelope(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete envelope");
    }
  }

  // Allocate / Lock funds into envelope
  async function handleAddAllocation(envId: string) {
    if (!allocAccountId) return toast.error("Please select an account to lock funds from");
    const amt = Number(allocAmount);
    if (isNaN(amt) || amt <= 0) return toast.error("Please enter a valid allocation amount");

    const rawBal = accountBalances.get(allocAccountId) ?? 0;
    const locked = lockedPerAccount.get(allocAccountId) ?? 0;
    const availableToLock = rawBal - locked;

    if (amt > availableToLock) {
      const acc = accMap.get(allocAccountId);
      return toast.error(`Cannot lock ${fmtMoney(amt, currency)}. Available unlocked in ${acc?.name || "account"}: ${fmtMoney(availableToLock, currency)}`);
    }

    setAllocating(true);
    try {
      const { error } = await supabase.from("envelope_allocations" as any).insert({
        envelope_id: envId,
        account_id: allocAccountId,
        amount: amt,
      });
      if (error) throw error;

      toast.success(`Locked ${fmtMoney(amt, currency)} into envelope!`);
      qc.invalidateQueries({ queryKey: ["envelope_allocations"] });
      setAllocAmount("");
      setAllocAccountId("");
    } catch (err: any) {
      toast.error(err.message || "Failed to allocate funds");
    } finally {
      setAllocating(false);
    }
  }

  // Release / Remove allocation from envelope
  async function handleRemoveAllocation(allocId: string) {
    try {
      const { error } = await supabase.from("envelope_allocations" as any).delete().eq("id", allocId);
      if (error) throw error;

      toast.success("Allocation released back to account!");
      qc.invalidateQueries({ queryKey: ["envelope_allocations"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to release allocation");
    }
  }

  // Release all allocations for the month
  async function handleReleaseAllAllocations() {
    if (envelopes.length === 0) return;
    const envIds = envelopes.map(e => e.id);

    try {
      const { error } = await supabase
        .from("envelope_allocations" as any)
        .delete()
        .in("envelope_id", envIds);
      if (error) throw error;

      toast.success("All envelope allocations released for new month!");
      qc.invalidateQueries({ queryKey: ["envelope_allocations"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to release allocations");
    }
  }

  // Summary Metrics
  const totalTarget = envelopes.reduce((acc, e) => acc + Number(e.target_amount), 0);
  const totalAllocated = envelopes.reduce((acc, e) => acc + (allocatedPerEnvelope.get(e.id) ?? 0), 0);
  const totalUnallocated = Math.max(0, totalTarget - totalAllocated);

  const fundedCount = envelopes.filter(e => (allocatedPerEnvelope.get(e.id) ?? 0) >= Number(e.target_amount) && Number(e.target_amount) > 0).length;
  const pendingCount = envelopes.filter(e => (allocatedPerEnvelope.get(e.id) ?? 0) < Number(e.target_amount)).length;

  const displayedEnvelopes = envelopes.filter((env) => {
    const allocated = allocatedPerEnvelope.get(env.id) ?? 0;
    const target = Number(env.target_amount);
    if (envView === "funded") return target > 0 && allocated >= target;
    if (envView === "pending") return allocated < target;
    return true;
  });

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="h-7 w-7 text-accent" />
            <h1 className="font-serif text-3xl font-black text-foreground">Envelopes</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Lock money from accounts into virtual envelopes. Bank balances remain intact until spent.
          </p>
        </div>
      </div>

      {/* ── Top Bar Header & Floatable / Collapsible Summary Block (identical to Loans page) ── */}
      <div className="sticky top-[96px] md:top-[80px] -mt-4 md:-mt-6 -mx-4 px-4 md:-mx-6 md:px-6 py-2 bg-background/95 backdrop-blur-md border-b shadow-sm space-y-2 z-20 mb-4">
        {/* Main Header Row: Toggles (Left) + View Summary Button (Right) */}
        <div className="flex items-center justify-between gap-1.5 flex-nowrap overflow-x-auto thin-scroll">
          {/* Toggle Option Buttons — Micro-Compact h-6 (24px) */}
          <div className="flex items-center gap-0.5 p-0.5 bg-muted/60 border rounded-md shrink-0 relative z-30">
            <button
              type="button"
              onClick={() => setEnvView("all")}
              className={`h-6 px-2 text-[10px] sm:text-[11px] font-bold rounded cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 transition-all ${
                envView === "all"
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <span>All</span>
              <span className={`text-[8px] sm:text-[9px] px-1 py-0 rounded-full font-bold ${
                envView === "all" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {envelopes.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setEnvView("funded")}
              className={`h-6 px-2 text-[10px] sm:text-[11px] font-bold rounded cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 transition-all ${
                envView === "funded"
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <span>Funded</span>
              <span className={`text-[8px] sm:text-[9px] px-1 py-0 rounded-full font-bold ${
                envView === "funded" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {fundedCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setEnvView("pending")}
              className={`h-6 px-2 text-[10px] sm:text-[11px] font-bold rounded cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 transition-all ${
                envView === "pending"
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <span>Needs Funds</span>
              <span className={`text-[8px] sm:text-[9px] px-1 py-0 rounded-full font-bold ${
                envView === "pending" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {pendingCount}
              </span>
            </button>
          </div>

          {/* Month Picker & Reset Month */}
          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <Input
              type="month"
              value={currentMonth.substring(0, 7)}
              onChange={(e) => {
                if (e.target.value) setCurrentMonth(`${e.target.value}-01`);
              }}
              className="h-6 w-28 text-[10px] font-semibold bg-background p-1 border rounded-md"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleReleaseAllAllocations}
              className="h-6 px-2 text-[10px] font-bold gap-1 border-amber-500/40 text-amber-600 hover:bg-amber-500/10 cursor-pointer rounded-md shrink-0"
              title="Release locked funds for new month"
            >
              <RefreshCw className="h-3 w-3" />
              <span className="hidden sm:inline">Reset Month</span>
            </Button>
          </div>

          {/* Web View (Desktop): Direct Inline Summary Pills matching toggle button height & style */}
          <div className="hidden md:flex items-center gap-1.5 ml-auto shrink-0">
            <div className="h-6 px-2.5 text-[11px] font-bold rounded-md bg-muted/60 border flex items-center gap-1.5">
              <span className="text-muted-foreground uppercase text-[9px]">Target:</span>
              <span className="font-serif num font-black text-foreground">{fmtMoney(totalTarget, currency)}</span>
            </div>

            <div className="h-6 px-2.5 text-[11px] font-bold rounded-md bg-muted/60 border flex items-center gap-1.5">
              <span className="text-muted-foreground uppercase text-[9px]">Locked:</span>
              <span className="font-serif num font-black text-emerald-600">{fmtMoney(totalAllocated, currency)}</span>
            </div>

            <div className="h-6 px-2.5 text-[11px] font-bold rounded-md bg-muted/60 border flex items-center gap-1.5">
              <span className="text-muted-foreground uppercase text-[9px]">Unallocated:</span>
              <span className={`font-serif num font-black ${totalUnallocated > 0 ? "text-amber-500" : "text-foreground"}`}>
                {fmtMoney(totalUnallocated, currency)}
              </span>
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
            <span className="font-serif num font-bold text-emerald-600">
              ({fmtMoney(totalAllocated, currency)})
            </span>
            <ChevronDown className={`h-2.5 w-2.5 text-accent transition-transform duration-200 ${showSummary ? "rotate-180" : ""}`} />
          </Button>
        </div>

        {/* Collapsible Summary Panel (Mobile View Only) */}
        {showSummary && (
          <div className="md:hidden p-3 rounded-2xl bg-card border shadow-lg border-accent/20 animate-in fade-in slide-in-from-top-2 duration-200 mt-2">
            <div className="grid grid-cols-3 gap-1.5 w-full">
              <div className="bg-background px-2 py-2 rounded-xl border shadow-xs flex flex-col justify-center text-center">
                <span className="text-[8px] uppercase tracking-wider text-muted-foreground block font-bold mb-0.5 truncate">Target</span>
                <span className="font-serif num text-[11px] font-bold truncate text-foreground">
                  {fmtMoney(totalTarget, currency)}
                </span>
              </div>

              <div className="bg-background px-2 py-2 rounded-xl border shadow-xs flex flex-col justify-center text-center">
                <span className="text-[8px] uppercase tracking-wider text-muted-foreground block font-bold mb-0.5 truncate">Locked</span>
                <span className="font-serif num text-[11px] font-bold text-emerald-600 truncate">
                  {fmtMoney(totalAllocated, currency)}
                </span>
              </div>

              <div className="bg-background px-2 py-2 rounded-xl border shadow-xs flex flex-col justify-center text-center">
                <span className="text-[8px] uppercase tracking-wider text-muted-foreground block font-bold mb-0.5 truncate">Unallocated</span>
                <span className={`font-serif num text-[11px] font-bold truncate ${totalUnallocated > 0 ? "text-amber-500" : "text-foreground"}`}>
                  {fmtMoney(totalUnallocated, currency)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Database Table Setup SQL Notice if missing */}
      {dbError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <h3 className="font-serif font-black text-destructive text-lg">Database Setup Required</h3>
          </div>
          <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
            <p>
              The <strong>envelopes</strong> and <strong>envelope_allocations</strong> tables do not exist in your Supabase database yet.
            </p>
            <p>
              Please copy the SQL command below, open <strong>Supabase Dashboard → SQL Editor</strong>, and click <strong>Run</strong>:
            </p>
          </div>
          <pre className="p-4 bg-card border rounded-lg text-[10px] font-mono overflow-auto max-h-52 text-foreground/80 thin-scroll">
{`-- Create envelopes table
CREATE TABLE IF NOT EXISTS public.envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  icon TEXT NOT NULL DEFAULT '✉️',
  color TEXT NOT NULL DEFAULT '#F59E0B',
  note TEXT,
  month_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create envelope_allocations table
CREATE TABLE IF NOT EXISTS public.envelope_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id UUID NOT NULL REFERENCES public.envelopes(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS & Permissions
ALTER TABLE public.envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.envelope_allocations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.envelopes TO authenticated;
GRANT ALL ON public.envelope_allocations TO authenticated;

DROP POLICY IF EXISTS "own envelopes" ON public.envelopes;
CREATE POLICY "own envelopes" ON public.envelopes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own envelope allocations" ON public.envelope_allocations;
CREATE POLICY "own envelope allocations" ON public.envelope_allocations FOR ALL USING (
  EXISTS (SELECT 1 FROM public.envelopes e WHERE e.id = envelope_allocations.envelope_id AND e.user_id = auth.uid())
);`}
          </pre>
        </div>
      )}



      {/* Envelopes 2-Column Split Cards Layout */}
      {!dbError && (
        <>
          {loadingEnv && (
            <div className="py-16 text-center text-muted-foreground border rounded-2xl bg-card">
              <Loader2 className="h-7 w-7 animate-spin mx-auto opacity-40 mb-3" />
              <p className="text-sm font-medium">Loading envelopes…</p>
            </div>
          )}

          {!loadingEnv && displayedEnvelopes.length === 0 && (
            <div className="py-16 text-center text-muted-foreground text-sm border rounded-2xl bg-card/60 p-6">
              <Mail className="h-10 w-10 mx-auto opacity-30 mb-2 text-accent" />
              <p className="font-semibold text-foreground">No envelopes found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {envelopes.length === 0 ? "Click the + button below to create your first envelope." : "No envelopes match the selected filter."}
              </p>
            </div>
          )}

          {!loadingEnv && displayedEnvelopes.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedEnvelopes.map((env) => {
                const allocated = allocatedPerEnvelope.get(env.id) ?? 0;
                const target = Number(env.target_amount);
                const rawPct = target > 0 ? (allocated / target) * 100 : 0;
                const pct = Math.min(100, Math.max(0, rawPct));
                const envAllocs = allocationsByEnvelope.get(env.id) ?? [];

                let badgeColorClass = "bg-muted text-muted-foreground border-border/60";
                let barColorClass = "bg-accent";
                if (pct >= 100) {
                  badgeColorClass = "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
                  barColorClass = "bg-emerald-500";
                } else if (pct > 0) {
                  badgeColorClass = "bg-accent/10 text-accent border-accent/20";
                  barColorClass = "bg-accent";
                }

                return (
                  <div
                    key={env.id}
                    onClick={() => setSelectedEnvelope(env)}
                    className="group relative rounded-2xl border bg-card hover:bg-accent/[0.02] transition-all hover:shadow-lg hover:border-accent/40 overflow-hidden flex flex-row cursor-pointer min-h-[150px]"
                  >
                    {/* Left 1/3 Column: Envelope Icon & Theme */}
                    <div
                      className="w-1/3 shrink-0 relative flex flex-col items-center justify-center p-3 text-center border-r border-border/40 overflow-hidden"
                      style={{
                        background: env.color
                          ? `linear-gradient(135deg, ${env.color}25, ${env.color}10)`
                          : undefined,
                      }}
                    >
                      <span className="text-3xl mb-1 drop-shadow-2xs">{env.icon || "✉️"}</span>
                      <span className="text-[9px] font-bold tracking-wider uppercase text-muted-foreground truncate max-w-full px-1">
                        {env.name}
                      </span>

                      {/* Percentage Badge */}
                      <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-md px-1.5 py-0.5 rounded border border-border/60 shadow-2xs">
                        <span className="font-serif num font-black text-[10px] text-foreground">
                          {rawPct.toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    {/* Right 2/3 Column: Details & Allocations */}
                    <div className="w-2/3 p-3.5 flex flex-col justify-between min-w-0">
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-1">
                          <h3 className="font-serif font-black text-sm sm:text-base text-foreground truncate" title={env.name}>
                            {env.name}
                          </h3>
                        </div>

                        {/* Allocated vs Target */}
                        <div className="flex items-baseline gap-1 text-xs truncate">
                          <span className="font-serif num font-bold text-xs sm:text-sm text-emerald-600">
                            {fmtMoney(allocated, currency)}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate">
                            of {fmtMoney(target, currency)} target
                          </span>
                        </div>
                      </div>

                      {/* Progress Tracker & Pointer Knob */}
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Locked Funds</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none ${badgeColorClass}`}>
                            {envAllocs.length} Source{envAllocs.length === 1 ? "" : "s"}
                          </span>
                        </div>

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
          )}
        </>
      )}

      {/* Add / Edit Envelope Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 z-[95] rounded-xl overflow-hidden">
          <DialogHeader className="p-4 border-b border-border/40 shrink-0">
            <DialogTitle className="font-serif text-xl font-black">
              {editingEnvelope ? "Edit Envelope" : "New Envelope"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 thin-scroll">
            <div className="space-y-1.5">
              <Label htmlFor="env-name" className="text-xs font-semibold">Envelope Name</Label>
              <Input
                id="env-name"
                placeholder="e.g. Rent, Groceries, Vacation"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="env-target" className="text-xs font-semibold">Target Budget ({currency})</Label>
              <Input
                id="env-target"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                disabled={saving}
              />
            </div>

            {/* Icon Picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Icon</Label>
              <div className="flex flex-wrap gap-1.5">
                {ICONS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setIcon(em)}
                    className={`h-8 w-8 rounded-lg text-lg flex items-center justify-center transition-all cursor-pointer ${
                      icon === em ? "ring-2 ring-foreground bg-accent/20" : "hover:bg-muted"
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Color</Label>
              <div className="grid grid-cols-12 gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-6 w-6 rounded-full transition-all cursor-pointer ${
                      color === c ? "ring-2 ring-offset-1 ring-foreground scale-110" : "hover:scale-105"
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="env-note" className="text-xs font-semibold">Notes (Optional)</Label>
              <Textarea
                id="env-note"
                placeholder="Purpose or conditions..."
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <DialogFooter className="p-4 border-t border-border/40 flex flex-row items-center justify-between shrink-0 bg-background">
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }} disabled={saving} className="cursor-pointer">
              Cancel
            </Button>
            <Button onClick={handleSaveEnvelope} disabled={saving} className="cursor-pointer">
              {saving ? "Saving…" : "Save Envelope"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Envelope Details & Fund Allocation Modal */}
      <Dialog open={!!selectedEnvelope} onOpenChange={(val) => { if (!val) setSelectedEnvelope(null); }}>
        <DialogContent className="max-w-md z-[100] max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b shrink-0 bg-background">
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <span className="text-2xl">{selectedEnvelope?.icon || "✉️"}</span>
              <span>{selectedEnvelope?.name}</span>
            </DialogTitle>
          </DialogHeader>

          {selectedEnvelope && (() => {
            const envId = selectedEnvelope.id;
            const envAllocs = allocationsByEnvelope.get(envId) ?? [];
            const currentAllocated = allocatedPerEnvelope.get(envId) ?? 0;
            const target = Number(selectedEnvelope.target_amount);

            const accountOptions = accounts.map((a) => {
              const rawBal = accountBalances.get(a.id) ?? 0;
              const locked = lockedPerAccount.get(a.id) ?? 0;
              const available = rawBal - locked;
              return {
                value: a.id,
                label: `${a.name} (Available to lock: ${fmtMoney(available, currency)})`,
                imageUrl: (a as any).image_url,
                icon: (a as any).image_url ? undefined : <span className="h-2.5 w-2.5 rounded-full inline-block shrink-0" style={{ background: a.color }} />
              };
            });

            return (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 thin-scroll">
                {/* Envelope Status Banner */}
                <div className="p-3.5 rounded-xl border bg-muted/40 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground uppercase font-bold text-[10px]">Target Budget</span>
                    <span className="font-serif num font-black text-sm">{fmtMoney(target, currency)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground uppercase font-bold text-[10px]">Currently Locked</span>
                    <span className="font-serif num font-black text-sm text-emerald-600">{fmtMoney(currentAllocated, currency)}</span>
                  </div>
                </div>

                {/* Lock Money Form */}
                <div className="space-y-3 p-3.5 rounded-xl border bg-card">
                  <h4 className="font-serif font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-accent" />
                    Lock Funds from Account
                  </h4>

                  <div className="space-y-2">
                    <SearchableSelect
                      options={accountOptions}
                      value={allocAccountId}
                      onValueChange={setAllocAccountId}
                      placeholder="Select account to lock from"
                      searchPlaceholder="Search account..."
                    />

                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Amount to lock"
                        value={allocAmount}
                        onChange={(e) => setAllocAmount(e.target.value)}
                        className="h-9 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddAllocation(envId)}
                        disabled={allocating}
                        className="h-9 px-3 text-xs font-bold gap-1 cursor-pointer shrink-0"
                      >
                        {allocating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        <span>Lock</span>
                      </Button>
                    </div>
                  </div>
                </div>

                {/* List of Accounts Supplying Locked Funds */}
                <div className="space-y-2">
                  <h4 className="font-serif font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                    <span>Locked Fund Sources ({envAllocs.length})</span>
                  </h4>

                  {envAllocs.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-3 text-center border rounded-xl bg-muted/20">
                      No account funds locked in this envelope yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {envAllocs.map((alloc) => {
                        const acc = accMap.get(alloc.account_id);
                        return (
                          <div key={alloc.id} className="flex items-center justify-between p-2.5 rounded-xl border bg-card text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: acc?.color || "#F59E0B" }} />
                              <span className="font-semibold truncate">{acc?.name || "Account"}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-serif num font-bold text-emerald-600">{fmtMoney(Number(alloc.amount), currency)}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveAllocation(alloc.id)}
                                className="h-6 w-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                                title="Release allocation"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedEnvelope.note && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Notes</span>
                    <p className="p-2.5 bg-muted/40 rounded-xl border text-xs text-foreground italic">"{selectedEnvelope.note}"</p>
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter className="p-3 border-t shrink-0 flex flex-row items-center justify-between bg-background">
            {selectedEnvelope && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteEnvelope(selectedEnvelope.id)}
                className="cursor-pointer text-xs h-8"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const env = selectedEnvelope;
                setSelectedEnvelope(null);
                if (env) handleEdit(env);
              }}
              className="cursor-pointer text-xs h-8 ml-auto"
            >
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Action Button (FAB) for creating new envelope */}
      {!dbError && createPortal(
        <button
          onClick={handleAddClick}
          className="fixed bottom-[5rem] md:bottom-6 right-6 z-40 h-10 w-10 md:h-12 md:w-12 rounded-full bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg border border-accent/20 flex items-center justify-center cursor-pointer transition-transform active:scale-95 hover:scale-105"
          title="New Envelope"
        >
          <Plus className="h-5 w-5 md:h-6 md:w-6 text-accent-foreground" />
        </button>,
        document.body
      )}
    </div>
  );
}
