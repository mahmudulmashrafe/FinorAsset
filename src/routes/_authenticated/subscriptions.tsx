import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMoney, computeAccountBalances } from "@/lib/finance";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Trash2, Plus, Sparkles, Pencil, RefreshCw, AlertTriangle, 
  CreditCard, CheckCircle2, XCircle, Calendar, Receipt, Power
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/searchable-select";
import { useUserProfile } from "@/hooks/use-user-profile";
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

export const Route = createFileRoute("/_authenticated/subscriptions")({
  component: SubscriptionsPage,
  head: () => ({ meta: [{ title: "Subscriptions — FinorAsset" }] }),
});

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).substring(2, 15) + "-" + Date.now().toString(36);
}

export interface SubscriptionItem {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  billing_cycle: "monthly" | "yearly" | "weekly" | "daily" | "quarterly";
  next_due_date: string;
  account_id: string | null;
  category_id: string | null;
  status: "active" | "inactive" | "cancelled";
  note: string | null;
  image_url: string | null;
  is_split?: boolean;
  splits?: { accountId: string; amount: number }[];
  last_payment_date?: string | null;
  created_at: string;
  updated_at: string;
}

function SubscriptionsPage() {
  const qc = useQueryClient();
  const { currency, authUser } = useUserProfile();

  const [dbError, setDbError] = useState(false);
  const [subView, setSubView] = useState<"all" | "active" | "inactive">("all");

  // Load queries
  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: api.listCategories });
  const { data: txns = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => api.listTransactions(1000) });
  const { data: envelopeAllocations = [] } = useQuery({
    queryKey: ["envelope_allocations"],
    queryFn: async () => { try { return await api.listEnvelopeAllocations(); } catch { return []; } },
  });

  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ["subscriptions", authUser?.id],
    queryFn: async () => {
      try {
        setDbError(false);
        const { data, error } = await supabase
          .from("subscriptions" as any)
          .select("*")
          .order("next_due_date", { ascending: true });

        if (error) {
          if (error.code === "42P01") {
            setDbError(true);
            const local = localStorage.getItem("finorasset_subscriptions");
            return local ? JSON.parse(local) : [];
          }
          throw error;
        }
        return data as any as SubscriptionItem[];
      } catch (err: any) {
        if (err?.code === "42P01") {
          setDbError(true);
          const local = localStorage.getItem("finorasset_subscriptions");
          return local ? JSON.parse(local) : [];
        }
        throw err;
      }
    },
    enabled: !!authUser,
  });

  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const catMap = new Map(cats.map((c) => [c.id, c]));

  const balances = computeAccountBalances(accounts, txns);
  const lockedPerAccount = new Map<string, number>();
  envelopeAllocations.forEach((alloc) => {
    const prev = lockedPerAccount.get(alloc.account_id) ?? 0;
    lockedPerAccount.set(alloc.account_id, prev + Number(alloc.amount));
  });

  const accountOptions = accounts.map((a) => {
    const rawBal = balances.get(a.id) ?? 0;
    const locked = lockedPerAccount.get(a.id) ?? 0;
    const availableUnlocked = rawBal - locked;
    let label = `${a.name} (${fmtMoney(rawBal, currency)})`;
    if (locked > 0) {
      label = `${a.name} (${fmtMoney(availableUnlocked, currency)} avail · 🔒 ${fmtMoney(locked, currency)})`;
    }
    return {
      value: a.id,
      label,
      imageUrl: (a as any).image_url,
      icon: (a as any).image_url ? undefined : <span className="h-2.5 w-2.5 rounded-full inline-block shrink-0" style={{ background: a.color }} />
    };
  });

  const categoryOptions = cats.map((c) => ({
    value: c.id,
    label: c.name,
    imageUrl: c.image_url || undefined,
    icon: c.image_url ? undefined : <span>{c.icon}</span>
  }));

  // Form State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<SubscriptionItem | null>(null);
  const [selectedSub, setSelectedSub] = useState<SubscriptionItem | null>(null);
  const [deleteSubId, setDeleteSubId] = useState<string | null>(null);

  // Txn History Modal State
  const [txnsModalOpen, setTxnsModalOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<any | null>(null);
  const [deleteTxnId, setDeleteTxnId] = useState<string | null>(null);

  // Subscription Form Inputs
  const [subName, setSubName] = useState("");
  const [subAmount, setSubAmount] = useState("0");
  const [subCycle, setSubCycle] = useState<"monthly" | "yearly" | "weekly" | "daily" | "quarterly">("monthly");
  const [subNextDate, setSubNextDate] = useState(new Date().toISOString().split("T")[0]);
  const [subAccountId, setSubAccountId] = useState("none");
  const [subCategoryId, setSubCategoryId] = useState("none");
  const [subStatus, setSubStatus] = useState<"active" | "inactive">("active");
  const [subImageUrl, setSubImageUrl] = useState("");
  const [subImageFile, setSubImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [subNote, setSubNote] = useState("");

  const [subIsSplit, setSubIsSplit] = useState(false);
  const [subSplits, setSubSplits] = useState<{ accountId: string; amount: string }[]>([
    { accountId: "none", amount: "" },
    { accountId: "none", amount: "" }
  ]);

  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setEditingSub(null);
    setSubName("");
    setSubAmount("0");
    setSubCycle("monthly");
    setSubNextDate(new Date().toISOString().split("T")[0]);
    setSubAccountId("none");
    setSubCategoryId("none");
    setSubStatus("active");
    setSubImageUrl("");
    setSubImageFile(null);
    setSubNote("");
    setSubIsSplit(false);
    setSubSplits([
      { accountId: "none", amount: "" },
      { accountId: "none", amount: "" }
    ]);
  };

  const openCreateModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEditModal = (sub: SubscriptionItem) => {
    setEditingSub(sub);
    setSubName(sub.name);
    setSubAmount(String(sub.amount));
    setSubCycle(sub.billing_cycle || "monthly");
    setSubNextDate(sub.next_due_date || new Date().toISOString().split("T")[0]);
    setSubAccountId(sub.account_id || "none");
    setSubCategoryId(sub.category_id || "none");
    setSubStatus(sub.status === "active" ? "active" : "inactive");
    setSubImageUrl(sub.image_url || "");
    setSubImageFile(null);
    setSubNote(sub.note || "");

    if (sub.is_split && Array.isArray(sub.splits) && sub.splits.length > 0) {
      setSubIsSplit(true);
      setSubSplits(sub.splits.map((s) => ({ accountId: s.accountId, amount: String(s.amount) })));
    } else {
      setSubIsSplit(false);
      setSubSplits([
        { accountId: "none", amount: "" },
        { accountId: "none", amount: "" }
      ]);
    }

    setModalOpen(true);
  };

  const handleSaveSub = async () => {
    if (!subName.trim()) return toast.error("Subscription name is required");
    const numAmt = Number(subAmount);
    if (isNaN(numAmt) || numAmt < 0) return toast.error("Please enter a valid amount (0 or greater)");

    if (subIsSplit) {
      const validSplits = subSplits.filter(s => s.accountId !== "none" && Number(s.amount) > 0);
      if (validSplits.length < 2) return toast.error("Please select at least 2 valid accounts with amounts for split subscription");
      const totalAllocated = validSplits.reduce((acc, s) => acc + Number(s.amount), 0);
      if (Math.abs(totalAllocated - numAmt) > 0.01) {
        return toast.error(`Total split amount (${fmtMoney(totalAllocated, currency)}) must match subscription amount (${fmtMoney(numAmt, currency)})`);
      }
    }

    setSaving(true);

    try {
      let uploadedUrl = subImageUrl;
      if (subImageFile && authUser) {
        setUploadingImage(true);
        const fileExt = subImageFile.name.split(".").pop();
        const filePath = `${authUser.id}/${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("warranties")
          .upload(filePath, subImageFile);

        if (uploadError) {
          console.error("Storage upload error:", uploadError);
        } else {
          const { data: pubData } = supabase.storage.from("warranties").getPublicUrl(filePath);
          if (pubData?.publicUrl) {
            uploadedUrl = pubData.publicUrl;
          }
        }
        setUploadingImage(false);
      }

      const payload: Record<string, any> = {
        name: subName.trim(),
        amount: numAmt,
        billing_cycle: subCycle,
        next_due_date: subNextDate,
        account_id: subIsSplit ? null : subAccountId === "none" ? null : subAccountId,
        category_id: subIsSplit ? null : subCategoryId === "none" ? null : subCategoryId,
        status: subStatus,
        image_url: uploadedUrl || null,
        note: subNote.trim() || null,
        is_split: subIsSplit,
        splits: subIsSplit ? subSplits.filter(s => s.accountId !== "none" && Number(s.amount) > 0).map(s => ({ accountId: s.accountId, amount: Number(s.amount) })) : null,
        updated_at: new Date().toISOString(),
      };

      if (!authUser) throw new Error("Unauthenticated");

      if (editingSub) {
        let { error } = await supabase
          .from("subscriptions" as any)
          .update(payload)
          .eq("id", editingSub.id);

        if (error && (error.code === "42703" || error.message?.includes("status"))) {
          const { status, ...payloadWithoutStatus } = payload;
          const retry = await supabase
            .from("subscriptions" as any)
            .update(payloadWithoutStatus)
            .eq("id", editingSub.id);
          error = retry.error;
        }

        if (error) {
          if (error.code === "42P01") {
            const updated = subscriptions.map((s: SubscriptionItem) => s.id === editingSub.id ? { ...s, ...payload } : s);
            localStorage.setItem("finorasset_subscriptions", JSON.stringify(updated));
            qc.setQueryData(["subscriptions", authUser.id], updated);
          } else {
            throw error;
          }
        }
        toast.success("Subscription updated!");
      } else {
        const newId = generateId();
        const newPayload = { ...payload, id: newId, user_id: authUser.id, created_at: new Date().toISOString() };
        let { error } = await supabase
          .from("subscriptions" as any)
          .insert(newPayload);

        if (error && (error.code === "42703" || error.message?.includes("status"))) {
          const { status, ...payloadWithoutStatus } = newPayload as Record<string, any>;
          const retry = await supabase
            .from("subscriptions" as any)
            .insert(payloadWithoutStatus);
          error = retry.error;
        }

        if (error) {
          if (error.code === "42P01") {
            const updated = [newPayload, ...subscriptions];
            localStorage.setItem("finorasset_subscriptions", JSON.stringify(updated));
            qc.setQueryData(["subscriptions", authUser.id], updated);
          } else {
            throw error;
          }
        }
        toast.success("Subscription created!");
      }

      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      setModalOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "Failed to save subscription");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSubStatus = async (sub: SubscriptionItem) => {
    const nextStatus = sub.status === "active" ? "inactive" : "active";
    try {
      let { error } = await supabase
        .from("subscriptions" as any)
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", sub.id);

      if (error && (error.code === "42703" || error.message?.includes("status"))) {
        const updated = subscriptions.map((s: SubscriptionItem) => s.id === sub.id ? { ...s, status: nextStatus } : s);
        localStorage.setItem("finorasset_subscriptions", JSON.stringify(updated));
        qc.setQueryData(["subscriptions", authUser?.id], updated);
        error = null;
      } else if (error && error.code === "42P01") {
        const updated = subscriptions.map((s: SubscriptionItem) => s.id === sub.id ? { ...s, status: nextStatus } : s);
        localStorage.setItem("finorasset_subscriptions", JSON.stringify(updated));
        qc.setQueryData(["subscriptions", authUser?.id], updated);
      } else if (error) {
        throw error;
      }

      toast.success(`Subscription ${nextStatus === "active" ? "activated" : "deactivated"}`);
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      if (selectedSub?.id === sub.id) {
        setSelectedSub({ ...sub, status: nextStatus });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle status");
    }
  };

  const handleDeleteSub = async (id: string) => {
    try {
      const { error } = await supabase.from("subscriptions" as any).delete().eq("id", id);
      if (error && error.code === "42P01") {
        const updated = subscriptions.filter((s: SubscriptionItem) => s.id !== id);
        localStorage.setItem("finorasset_subscriptions", JSON.stringify(updated));
        qc.setQueryData(["subscriptions", authUser?.id], updated);
      } else if (error) {
        throw error;
      }

      toast.success("Subscription deleted");
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      setDeleteSubId(null);
      setSelectedSub(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete subscription");
    }
  };

  // Helper to check active status (defaults to true if status is null or active)
  const isSubActive = (s: SubscriptionItem) => !s.status || s.status.toLowerCase() === "active";

  // Filter Subscriptions
  const activeSubs = subscriptions.filter(isSubActive);
  const inactiveSubs = subscriptions.filter((s: SubscriptionItem) => !isSubActive(s));

  const displayedSubs = subscriptions.filter((s: SubscriptionItem) => {
    if (subView === "active") return isSubActive(s);
    if (subView === "inactive") return !isSubActive(s);
    return true;
  });

  // Calculate monthly commitment
  const totalMonthlyCommitment = activeSubs.reduce((acc: number, sub: SubscriptionItem) => {
    const amt = Number(sub.amount);
    if (sub.billing_cycle === "yearly") return acc + amt / 12;
    if (sub.billing_cycle === "weekly") return acc + amt * 4.33;
    if (sub.billing_cycle === "daily") return acc + amt * 30;
    if (sub.billing_cycle === "quarterly") return acc + amt / 3;
    return acc + amt;
  }, 0);

  // Filter transactions linked to selected sub
  const linkedTxns = selectedSub ? txns.filter((t) => {
    const noteStr = t.note ?? "";
    return noteStr.includes(`Subscription: ${selectedSub.name}`) || (t as any).subscription_id === selectedSub.id;
  }) : [];

  const handleDeleteLinkedTxn = async (txnId: string) => {
    try {
      const { error } = await supabase.from("transactions").delete().eq("id", txnId);
      if (error) throw error;
      toast.success("Transaction deleted!");
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setDeleteTxnId(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete transaction");
    }
  };

  return (
    <div className="space-y-6 w-full pb-10">
      {/* SQL Setup Notice if table doesn't exist */}
      {dbError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <h3 className="font-serif font-black text-destructive text-lg">Database Table Setup Required</h3>
          </div>
          <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
            <p>The <strong>subscriptions</strong> table does not exist in your Supabase database yet.</p>
            <p>Please copy the SQL below and run it in <strong>Supabase Dashboard → SQL Editor</strong>:</p>
          </div>
          <pre className="p-4 bg-card border rounded-lg text-[10px] font-mono overflow-auto max-h-52 text-foreground/80 thin-scroll">
{`CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  next_due_date DATE NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT,
  image_url TEXT,
  is_split BOOLEAN DEFAULT false,
  splits JSONB,
  last_payment_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

DROP POLICY IF EXISTS "own subscriptions" ON public.subscriptions;
CREATE POLICY "own subscriptions" ON public.subscriptions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);`}
          </pre>
        </div>
      )}

      {/* ── Top Sticky Bar Header ── */}
      {!dbError && (
        <div className="sticky top-[96px] md:top-[80px] -mt-4 md:-mt-6 -mx-4 px-4 md:-mx-6 md:px-6 py-2 bg-background/95 backdrop-blur-md border-b shadow-sm z-20 mb-4 flex items-center justify-between gap-2">
          {/* Left: Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto thin-scroll shrink min-w-0">
            <div className="flex items-center gap-0.5 p-0.5 bg-muted/60 border rounded-md shrink-0">
              <button
                type="button"
                onClick={() => setSubView("all")}
                className={`h-6 px-2 text-[10px] sm:text-[11px] font-bold rounded cursor-pointer flex items-center gap-1 shrink-0 transition-all ${
                  subView === "all" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <span>All</span>
                <span className={`text-[8px] sm:text-[9px] px-1 py-0 rounded-full font-bold ${
                  subView === "all" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {subscriptions.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSubView("active")}
                className={`h-6 px-2 text-[10px] sm:text-[11px] font-bold rounded cursor-pointer flex items-center gap-1 shrink-0 transition-all ${
                  subView === "active" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <span>Active</span>
                <span className={`text-[8px] sm:text-[9px] px-1 py-0 rounded-full font-bold ${
                  subView === "active" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {activeSubs.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSubView("inactive")}
                className={`h-6 px-2 text-[10px] sm:text-[11px] font-bold rounded cursor-pointer flex items-center gap-1 shrink-0 transition-all ${
                  subView === "inactive" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <span>Inactive</span>
                <span className={`text-[8px] sm:text-[9px] px-1 py-0 rounded-full font-bold ${
                  subView === "inactive" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {inactiveSubs.length}
                </span>
              </button>
            </div>
          </div>

          {/* Right: Summary & Add Button */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border bg-muted/30 text-xs">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Monthly:</span>
              <span className="font-serif num font-black text-foreground">{fmtMoney(totalMonthlyCommitment, currency)}</span>
            </div>

            <Button
              onClick={openCreateModal}
              size="sm"
              className="h-6 px-2 text-[10px] sm:text-[11px] font-bold gap-1 rounded-md bg-accent hover:bg-accent/90 text-accent-foreground cursor-pointer shrink-0 shadow-xs"
            >
              <Plus className="h-3 w-3" />
              <span>Add Subscription</span>
            </Button>
          </div>
        </div>
      )}

      {/* ── Subscriptions Cards Grid ── */}
      {!dbError && (
        <>
          {isLoading && (
            <div className="py-16 text-center text-muted-foreground border rounded-2xl bg-card">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 opacity-50" />
              <p className="text-xs">Loading subscriptions…</p>
            </div>
          )}

          {!isLoading && displayedSubs.length === 0 && (
            <div className="py-16 text-center text-muted-foreground border rounded-2xl bg-card p-6 space-y-3">
              <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <h3 className="font-serif text-lg font-bold text-foreground">No Subscriptions Found</h3>
              <p className="text-xs max-w-sm mx-auto text-muted-foreground">
                Track recurring monthly services, software, domain renewals, or bills.
              </p>
              <Button onClick={openCreateModal} size="sm" className="rounded-full text-xs font-semibold bg-accent text-accent-foreground mt-2">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Your First Subscription
              </Button>
            </div>
          )}

          {!isLoading && displayedSubs.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayedSubs.map((sub: SubscriptionItem) => {
                const isActive = isSubActive(sub);
                const isOverdue = isActive && new Date(sub.next_due_date) < new Date();
                const acc = sub.account_id ? accountMap.get(sub.account_id) : null;
                const cat = sub.category_id ? catMap.get(sub.category_id) : null;

                return (
                  <div
                    key={sub.id}
                    onClick={() => setSelectedSub(sub)}
                    className="relative rounded-2xl border bg-card shadow-sm hover:shadow-md transition-all flex h-36 group overflow-hidden cursor-pointer w-full"
                  >
                    {/* Left 1/3 Column for Custom Logo / Image */}
                    <div className="w-1/3 shrink-0 h-full relative overflow-hidden bg-muted/40 border-r flex items-center justify-center">
                      {sub.image_url ? (
                        <img
                          src={sub.image_url}
                          alt={sub.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-accent/10 text-accent">
                          <span className="font-serif font-black text-xl sm:text-2xl tracking-wider">
                            {sub.name.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right 2/3 Column for Details */}
                    <div className="w-2/3 p-3.5 flex flex-col justify-between min-w-0">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-start justify-between gap-1.5 min-w-0">
                          <h3 className="font-serif font-bold text-sm sm:text-base truncate text-foreground leading-snug flex-1">{sub.name}</h3>
                          <Badge
                            variant="outline"
                            className={`capitalize text-[9px] px-1.5 py-0.5 leading-none shrink-0 font-bold ${
                              !isActive
                                ? "bg-muted text-muted-foreground border-muted-foreground/30"
                                : isOverdue
                                ? "bg-destructive/15 text-destructive border-destructive/30 animate-pulse"
                                : "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                            }`}
                          >
                            {!isActive ? "Inactive" : isOverdue ? "Overdue" : "Active"}
                          </Badge>
                        </div>

                        <div className="text-[10px] text-muted-foreground flex items-center gap-1 capitalize truncate">
                          <span>{sub.billing_cycle}</span>
                          {cat && (
                            <>
                              <span>•</span>
                              <span className="truncate">{cat.name}</span>
                            </>
                          )}
                        </div>

                        {acc && !sub.is_split && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-0.5 truncate">
                            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: acc.color }} />
                            <span className="truncate">{acc.name}</span>
                          </div>
                        )}

                        {sub.is_split && (
                          <div className="text-[9px] text-muted-foreground italic truncate">
                            Split accounts
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1.5 border-t mt-1">
                        <div>
                          <span className="text-[8px] uppercase font-bold text-muted-foreground block leading-none">Cost</span>
                          <span className="font-serif num font-black text-foreground text-sm">
                            {fmtMoney(Number(sub.amount), currency)}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[8px] uppercase font-bold text-muted-foreground block leading-none">Next Date</span>
                          <span className="text-[10px] font-semibold text-foreground">
                            {new Date(sub.next_due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
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

      {/* ── Add / Edit Subscription Dialog ── */}
      <Dialog open={modalOpen} onOpenChange={(v) => { setModalOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 z-[95] rounded-xl overflow-hidden">
          <DialogHeader className="p-4 border-b border-border/40 shrink-0">
            <DialogTitle className="font-serif text-xl font-black">
              {editingSub ? "Edit Subscription" : "New Subscription"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 thin-scroll">
            <div className="space-y-1.5">
              <Label htmlFor="sub-name" className="text-xs font-semibold">Subscription Name</Label>
              <Input
                id="sub-name"
                placeholder="e.g. Netflix, Spotify, iCloud, Rent"
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sub-amount" className="text-xs font-semibold">Amount ({currency})</Label>
                <Input
                  id="sub-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={subAmount}
                  onChange={(e) => setSubAmount(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Billing Cycle</Label>
                <Select value={subCycle} onValueChange={(val: any) => setSubCycle(val)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Cycle" />
                  </SelectTrigger>
                  <SelectContent className="z-[110]">
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sub-date" className="text-xs font-semibold">Next Billing Date</Label>
                <Input
                  id="sub-date"
                  type="date"
                  value={subNextDate}
                  onChange={(e) => setSubNextDate(e.target.value)}
                  disabled={saving}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Status</Label>
                <Select value={subStatus} onValueChange={(val: any) => setSubStatus(val)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="z-[110]">
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive / Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Split Account Toggle */}
            <div className="flex items-center justify-between pt-1">
              <Label className="text-xs font-semibold">Split Across Accounts?</Label>
              <Switch checked={subIsSplit} onCheckedChange={setSubIsSplit} />
            </div>

            {!subIsSplit ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Payment Account</Label>
                  <SearchableSelect
                    options={accountOptions}
                    value={subAccountId}
                    onValueChange={setSubAccountId}
                    placeholder="Select Account"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Category</Label>
                  <SearchableSelect
                    options={categoryOptions}
                    value={subCategoryId}
                    onValueChange={setSubCategoryId}
                    placeholder="Select Category"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 border p-3 rounded-lg bg-card/40">
                <Label className="text-xs font-semibold block mb-1">Account Allocations</Label>
                {subSplits.map((split, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <SearchableSelect
                        options={accountOptions}
                        value={split.accountId}
                        onValueChange={(val) => {
                          const next = [...subSplits];
                          next[i].accountId = val;
                          setSubSplits(next);
                        }}
                        placeholder={`Account #${i + 1}`}
                      />
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={split.amount}
                      onChange={(e) => {
                        const next = [...subSplits];
                        next[i].amount = e.target.value;
                        setSubSplits(next);
                      }}
                      className="w-24 h-9 text-xs"
                    />
                    {subSplits.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setSubSplits(subSplits.filter((_, idx) => idx !== i))}
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSubSplits([...subSplits, { accountId: "none", amount: "" }])}
                  className="w-full text-xs h-8 border-dashed mt-1"
                >
                  + Add Another Account Split
                </Button>
              </div>
            )}

            {/* Logo / Image Upload */}
            <div className="space-y-1.5 pt-1 border-t">
              <Label className="text-xs font-semibold">Custom Logo / Image (Optional)</Label>
              <div className="flex items-center gap-3">
                {subImageUrl || subImageFile ? (
                  <div className="flex items-center gap-2">
                    <img
                      src={subImageFile ? URL.createObjectURL(subImageFile) : subImageUrl}
                      alt="Logo"
                      className="h-10 w-10 rounded-xl object-cover border bg-background"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setSubImageUrl(""); setSubImageFile(null); }}
                      className="h-8 text-xs text-destructive hover:bg-destructive/10"
                    >
                      Remove Logo
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-8 text-xs"
                      disabled={saving || uploadingImage}
                    >
                      {uploadingImage ? "Uploading…" : "Upload Logo"}
                    </Button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setSubImageFile(e.target.files[0]);
                        }
                      }}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sub-note" className="text-xs font-semibold">Notes (Optional)</Label>
              <Textarea
                id="sub-note"
                placeholder="Billing account details, cancellation link, or reminder details..."
                value={subNote}
                onChange={(e) => setSubNote(e.target.value)}
                disabled={saving}
                rows={2}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="p-4 border-t shrink-0 flex items-center justify-end gap-2 bg-card">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving} className="h-9 text-xs">
              Cancel
            </Button>
            <Button onClick={handleSaveSub} disabled={saving} className="h-9 text-xs bg-accent text-accent-foreground font-semibold">
              {saving ? "Saving…" : editingSub ? "Update Subscription" : "Save Subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Subscription Details Modal ── */}
      <Dialog open={!!selectedSub} onOpenChange={(val) => { if (!val) setSelectedSub(null); }}>
        <DialogContent className="max-w-md z-[100] max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-5 pb-3 border-b">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="font-serif text-xl font-bold flex items-center gap-2.5 text-foreground truncate">
                {selectedSub?.image_url ? (
                  <img src={selectedSub.image_url} alt="" className="h-8 w-8 rounded-lg object-cover border shrink-0 bg-background" />
                ) : (
                  <Sparkles className="h-5 w-5 text-accent shrink-0" />
                )}
                <span className="truncate">{selectedSub?.name}</span>
              </DialogTitle>

              {selectedSub && (
                <Badge
                  variant="outline"
                  className={`capitalize text-[9px] px-2 py-0.5 leading-none shrink-0 font-bold ${
                    selectedSub.status !== "active"
                      ? "bg-muted text-muted-foreground"
                      : new Date(selectedSub.next_due_date) < new Date()
                      ? "bg-destructive/15 text-destructive border-destructive/30 animate-pulse"
                      : "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                  }`}
                >
                  {selectedSub.status !== "active" ? "Inactive" : new Date(selectedSub.next_due_date) < new Date() ? "Overdue" : "Active"}
                </Badge>
              )}
            </div>
          </DialogHeader>

          {selectedSub && (() => {
            const acc = selectedSub.account_id ? accountMap.get(selectedSub.account_id) : null;
            const cat = selectedSub.category_id ? catMap.get(selectedSub.category_id) : null;

            return (
              <div className="flex-1 overflow-y-auto p-5 space-y-4 thin-scroll">
                <div className="space-y-3 bg-muted/40 p-4 rounded-xl border border-border/60 text-xs">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Amount</span>
                    <span className="font-serif num font-black text-lg text-foreground">
                      {fmtMoney(Number(selectedSub.amount), currency)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Billing Cycle</span>
                    <span className="font-semibold text-foreground capitalize">{selectedSub.billing_cycle}</span>
                  </div>

                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Next Billing Date</span>
                    <span className="font-semibold text-foreground">
                      {new Date(selectedSub.next_due_date).toLocaleDateString()}
                    </span>
                  </div>

                  {acc && !selectedSub.is_split && (
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Account</span>
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: acc.color }} />
                        {acc.name}
                      </span>
                    </div>
                  )}

                  {cat && (
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Category</span>
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        {cat.icon} {cat.name}
                      </span>
                    </div>
                  )}

                  {selectedSub.note && (
                    <div className="text-[11px] italic text-muted-foreground pt-1">
                      "{selectedSub.note}"
                    </div>
                  )}
                </div>

                {/* View Transactions History Button */}
                <Button
                  variant="outline"
                  onClick={() => setTxnsModalOpen(true)}
                  className="w-full h-9 text-xs font-semibold gap-2 border-accent/40 text-accent hover:bg-accent/10 cursor-pointer"
                >
                  <Receipt className="h-4 w-4" />
                  View Linked Transactions ({linkedTxns.length})
                </Button>
              </div>
            );
          })()}

          {/* Action Buttons: Toggle Active, Edit, Delete */}
          <DialogFooter className="p-4 border-t flex flex-row items-center justify-between gap-2 bg-card mt-0">
            {selectedSub && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggleSubStatus(selectedSub)}
                className={`h-9 px-3 text-xs font-semibold gap-1.5 cursor-pointer ${
                  selectedSub.status === "active"
                    ? "border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                    : "border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                }`}
              >
                <Power className="h-3.5 w-3.5" />
                {selectedSub.status === "active" ? "Deactivate" : "Activate"}
              </Button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedSub) {
                    const subToEdit = selectedSub;
                    setSelectedSub(null);
                    openEditModal(subToEdit);
                  }
                }}
                className="h-9 px-3 text-xs font-semibold gap-1.5 cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (selectedSub) {
                    setDeleteSubId(selectedSub.id);
                  }
                }}
                className="h-9 px-3 text-xs font-semibold gap-1.5 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Linked Transactions Dialog ── */}
      <Dialog open={txnsModalOpen} onOpenChange={setTxnsModalOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0 z-[110] rounded-xl overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="font-serif text-lg font-bold flex items-center gap-2">
              <Receipt className="h-5 w-5 text-accent" />
              Transactions for {selectedSub?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 thin-scroll">
            {linkedTxns.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">
                No recorded transactions for this subscription yet.
              </p>
            ) : (
              linkedTxns.map((t) => {
                const acc = accountMap.get(t.account_id);
                return (
                  <div key={t.id} className="p-3 rounded-lg border bg-card flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold block truncate text-foreground">{t.note || selectedSub?.name}</span>
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span>{new Date(t.occurred_on).toLocaleDateString()}</span>
                        {acc && <span>• {acc.name}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-serif num font-bold text-destructive">
                        −{fmtMoney(Number(t.amount), currency)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTxnId(t.id)}
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Subscription Delete Confirmation */}
      <AlertDialog open={!!deleteSubId} onOpenChange={(v) => { if (!v) setDeleteSubId(null); }}>
        <AlertDialogContent className="z-[120]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Delete Subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this subscription? This will remove it from your active tracking list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteSubId) handleDeleteSub(deleteSubId); }}
              className="h-9 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Linked Transaction Delete Confirmation */}
      <AlertDialog open={!!deleteTxnId} onOpenChange={(v) => { if (!v) setDeleteTxnId(null); }}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Delete Linked Transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this recorded subscription transaction? This will update your account balance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTxnId) handleDeleteLinkedTxn(deleteTxnId); }}
              className="h-9 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Transaction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
