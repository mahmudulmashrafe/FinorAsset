import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMoney, computeAccountBalances } from "@/lib/finance";
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/use-user-profile";
import { 
  ShieldCheck, Plus, Trash2, Pencil, Calendar, Image as ImageIcon, 
  ExternalLink, AlertTriangle, ShieldAlert, Loader2, Upload, X, Shield, FileText, ChevronDown 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { CategoryFormDialog } from "@/components/categories-dialog";

export const Route = createFileRoute("/_authenticated/warranties")({
  component: WarrantiesPage,
  head: () => ({ meta: [{ title: "Warranties — FinorAsset" }] }),
});

interface Warranty {
  id: string;
  user_id: string;
  title: string;
  purchase_date: string;
  expiry_date: string;
  amount: number;
  account_id: string | null;
  category_id: string | null;
  transaction_id: string | null;
  note: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

function getWarrantyStatusInfo(diffDays: number, isExpired: boolean) {
  let badgeColorClass = "";
  let barColorClass = "";
  let textColorClass = "";
  let colorName = "";

  if (isExpired || diffDays < 1) {
    badgeColorClass = "bg-red-700/15 text-red-700 border-red-700/40 dark:bg-red-950/40 dark:text-red-400 dark:border-red-700/60 font-bold";
    barColorClass = "bg-red-700";
    textColorClass = "text-red-700 font-bold";
    colorName = "Deep Red";
  } else if (diffDays < 15) {
    badgeColorClass = "bg-rose-400/15 text-rose-500 border-rose-400/30 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-400/50 font-bold";
    barColorClass = "bg-rose-400";
    textColorClass = "text-rose-500 font-bold";
    colorName = "Light Red";
  } else if (diffDays < 30) {
    badgeColorClass = "bg-orange-500/15 text-orange-600 border-orange-500/30 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-500/50 font-bold";
    barColorClass = "bg-orange-500";
    textColorClass = "text-orange-600 font-bold";
    colorName = "Orange";
  } else if (diffDays < 90) {
    badgeColorClass = "bg-yellow-500/15 text-yellow-600 border-yellow-500/30 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-500/50 font-bold";
    barColorClass = "bg-yellow-500";
    textColorClass = "text-yellow-600 font-bold";
    colorName = "Yellow";
  } else if (diffDays < 180) {
    badgeColorClass = "bg-teal-500/15 text-teal-600 border-teal-500/30 dark:bg-teal-950/30 dark:text-teal-400 dark:border-teal-500/50 font-bold";
    barColorClass = "bg-teal-500";
    textColorClass = "text-teal-600 font-bold";
    colorName = "Semi Green";
  } else {
    badgeColorClass = "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-500/50 font-bold";
    barColorClass = "bg-emerald-500";
    textColorClass = "text-emerald-600 font-bold";
    colorName = "Green";
  }

  // Label Formatting Logic
  let formattedLabel = "";

  if (isExpired || diffDays < 1) {
    formattedLabel = "Expired";
  } else if (diffDays < 30) {
    // Less than 1 month => Days ONLY
    formattedLabel = diffDays === 1 ? "1 day left" : `${diffDays} days left`;
  } else if (diffDays < 365) {
    // 1 Month to < 1 Year => Months and Days
    const months = Math.floor(diffDays / 30);
    const days = diffDays % 30;
    const monthStr = months === 1 ? "1 month" : `${months} months`;

    if (days === 0) {
      formattedLabel = `${monthStr} left`;
    } else {
      const dayStr = days === 1 ? "1 day" : `${days} days`;
      formattedLabel = `${monthStr} ${dayStr} left`;
    }
  } else {
    // 1 Year / 12 Months or more => Years, Months, and Days
    const years = Math.floor(diffDays / 365);
    const remDays = diffDays % 365;
    const months = Math.floor(remDays / 30);
    const days = remDays % 30;

    const yearStr = years === 1 ? "1 year" : `${years} years`;

    if (months === 0 && days === 0) {
      formattedLabel = `${yearStr} left`;
    } else if (months > 0 && days === 0) {
      const monthStr = months === 1 ? "1 month" : `${months} months`;
      formattedLabel = `${yearStr} ${monthStr} left`;
    } else if (months === 0 && days > 0) {
      const dayStr = days === 1 ? "1 day" : `${days} days`;
      formattedLabel = `${yearStr} ${dayStr} left`;
    } else {
      const monthStr = months === 1 ? "1 month" : `${months} months`;
      const dayStr = days === 1 ? "1 day" : `${days} days`;
      formattedLabel = `${yearStr} ${monthStr} ${dayStr} left`;
    }
  }

  return {
    daysLabel: formattedLabel,
    badgeColorClass,
    barColorClass,
    textColorClass,
    colorName,
  };
}

function WarrantiesPage() {
  const qc = useQueryClient();
  const { currency, authUser } = useUserProfile();

  const [dbError, setDbError] = useState<any>(null);

  const { data: warranties = [], isLoading } = useQuery({
    queryKey: ["warranties"],
    queryFn: async () => {
      try {
        const data = await api.listWarranties();
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

  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: api.listCategories });
  const { data: txns = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => api.listTransactions(1000) });
  const { data: envelopeAllocations = [] } = useQuery({
    queryKey: ["envelope_allocations"],
    queryFn: async () => { try { return await api.listEnvelopeAllocations(); } catch { return []; } },
  });

  const balances = computeAccountBalances(accounts, txns);
  const lockedPerAccount = new Map<string, number>();
  envelopeAllocations.forEach((alloc) => {
    const prev = lockedPerAccount.get(alloc.account_id) ?? 0;
    lockedPerAccount.set(alloc.account_id, prev + Number(alloc.amount));
  });
  const catMap = new Map(cats.map(c => [c.id, c]));
  const accMap = new Map(accounts.map(a => [a.id, a]));

  const accountOptions = accounts.map(a => {
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

  const warrantyCategories = cats.filter(c => (c as any).is_warranty === true || (c as any).is_warranty === 1);
  const effectiveWarrantyCats = warrantyCategories.length > 0 ? warrantyCategories : cats.filter(c => c.kind === "expense");

  const categoryOptions = [
    { value: "none", label: "None" },
    ...effectiveWarrantyCats.map(c => ({
      value: c.id,
      label: c.name,
      imageUrl: c.image_url || undefined,
      icon: c.image_url ? undefined : <span>{c.icon}</span>
    }))
  ];

  // Form & Dialog States
  const [open, setOpen] = useState(false);
  const [editingWarranty, setEditingWarranty] = useState<Warranty | null>(null);
  const [deleteWarranty, setDeleteWarranty] = useState<{ id: string; title: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Category filter & creation modal state
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [categoryModalOpen, setCategoryModalOpen] = useState<boolean>(false);

  // View and summary states (matching accounts page)
  const [warrantyView, setWarrantyView] = useState<"all" | "active" | "expiring" | "expired">("all");
  const [showSummary, setShowSummary] = useState(false);

  // Mobile list & Detail popup states (Matching Loans Page design)
  const [selectedWarranty, setSelectedWarranty] = useState<Warranty | null>(null);
  const [activeListOpen, setActiveListOpen] = useState(false);
  const [expiringListOpen, setExpiringListOpen] = useState(false);
  const [expiredListOpen, setExpiredListOpen] = useState(false);

  // Form values
  const [title, setTitle] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [expiryDate, setExpiryDate] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("none");
  const [note, setNote] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [productImageUrl, setProductImageUrl] = useState("");
  const [uploadingProductImage, setUploadingProductImage] = useState(false);

  // Lightbox / Image Preview State
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const productFileInputRef = useRef<HTMLInputElement>(null);

  // Duration calculation states
  const [durationNum, setDurationNum] = useState<string>("1");
  const [durationUnit, setDurationUnit] = useState<"years" | "months" | "days">("years");

  // Helper to calculate Expiry Date from Purchase Date + Duration
  function applyDuration(numStr: string, unit: "years" | "months" | "days", baseDateStr: string = purchaseDate) {
    const num = Number(numStr);
    if (!baseDateStr || isNaN(num) || num <= 0) return;
    const d = new Date(baseDateStr);
    if (isNaN(d.getTime())) return;

    if (unit === "years") {
      d.setFullYear(d.getFullYear() + num);
    } else if (unit === "months") {
      d.setMonth(d.getMonth() + num);
    } else if (unit === "days") {
      d.setDate(d.getDate() + num);
    }

    setExpiryDate(d.toISOString().split("T")[0]);
  }

  function resetForm() {
    setTitle("");
    const todayStr = new Date().toISOString().split("T")[0];
    setPurchaseDate(todayStr);
    setAmount("");
    setAccountId(accounts[0]?.id || "");
    setCategoryId("none");
    setNote("");
    setImageFile(null);
    setImageUrl("");
    setProductImageFile(null);
    setProductImageUrl("");
    setDurationNum("1");
    setDurationUnit("years");
    applyDuration("1", "years", todayStr);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (productFileInputRef.current) productFileInputRef.current.value = "";
  }

  function handleAddClick() {
    resetForm();
    setEditingWarranty(null);
    setOpen(true);
  }

  function handleRowClick(w: Warranty) {
    setSelectedWarranty(w);
  }

  function handleEditWarranty(w: Warranty) {
    setTitle(w.title);
    setPurchaseDate(w.purchase_date);
    setExpiryDate(w.expiry_date);
    setAmount(String(w.amount));
    setAccountId(w.account_id || "");
    setCategoryId(w.category_id || "none");
    setNote(w.note || "");
    setImageUrl(w.image_url || "");
    setImageFile(null);
    setProductImageUrl((w as any).product_image_url || "");
    setProductImageFile(null);
    setEditingWarranty(w);
    setOpen(true);
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  const handleProductFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setProductImageFile(e.target.files[0]);
    }
  };

  async function handleSave() {
    if (!title.trim()) return toast.error("Please enter a title");
    if (!purchaseDate) return toast.error("Please select purchase date");
    if (!expiryDate) return toast.error("Please select expiry date");
    if (new Date(expiryDate) <= new Date(purchaseDate)) {
      return toast.error("Expiry date must be after purchase date");
    }
    const numAmount = amount === "" || amount === undefined || amount === null ? 0 : Number(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return toast.error("Please enter a valid amount (0 or higher)");
    }

    if (numAmount > 0 && !accountId) {
      return toast.error("Please select an account");
    }

    // Balance validation for paid warranties
    if (numAmount > 0 && accountId) {
      const targetAcc = accounts.find(a => a.id === accountId);
      if (targetAcc) {
        const rawBal = balances.get(accountId) ?? 0;
        const lockedAmt = lockedPerAccount.get(accountId) ?? 0;
        let availableUnlocked = rawBal - lockedAmt;
        if (editingWarranty && editingWarranty.account_id === accountId) {
          availableUnlocked += Number(editingWarranty.amount);
        }
        if (availableUnlocked < numAmount) {
          if (lockedAmt > 0) {
            return toast.error(`Insufficient unlocked funds in ${targetAcc.name}. Total balance: ${fmtMoney(rawBal, currency)}, locked in envelopes: ${fmtMoney(lockedAmt, currency)}, available unlocked: ${fmtMoney(availableUnlocked, currency)}`);
          } else {
            return toast.error(`Insufficient funds in ${targetAcc.name}. Available: ${fmtMoney(rawBal, currency)}, required: ${fmtMoney(numAmount, currency)}`);
          }
        }
      }
    }

    if (!authUser) return;

    setSaving(true);
    let finalImageUrl = imageUrl;
    let finalProductImageUrl = productImageUrl;

    try {
      // 1. Upload receipt image if selected
      if (imageFile) {
        setUploadingImage(true);
        const fileExt = imageFile.name.split('.').pop();
        const filePath = `${authUser.id}/receipt-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('warranties')
          .upload(filePath, imageFile);
          
        if (uploadError) {
          throw new Error(`Receipt image upload failed: ${uploadError.message}`);
        }
        
        const { data: { publicUrl } } = supabase.storage
          .from('warranties')
          .getPublicUrl(filePath);
          
        finalImageUrl = publicUrl;
        setUploadingImage(false);
      }

      // 2. Upload product image if selected
      if (productImageFile) {
        setUploadingProductImage(true);
        const fileExt = productImageFile.name.split('.').pop();
        const filePath = `${authUser.id}/product-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('warranties')
          .upload(filePath, productImageFile);
          
        if (uploadError) {
          throw new Error(`Product picture upload failed: ${uploadError.message}`);
        }
        
        const { data: { publicUrl } } = supabase.storage
          .from('warranties')
          .getPublicUrl(filePath);
          
        finalProductImageUrl = publicUrl;
        setUploadingProductImage(false);
      }

      const categoryVal = categoryId === "none" ? null : categoryId;
      const validAccountId = accountId === "none" || !accountId ? null : accountId;

      if (editingWarranty) {
        let finalTxnId = editingWarranty.transaction_id;

        if (numAmount > 0 && validAccountId) {
          if (finalTxnId) {
            const { error: txnError } = await supabase
              .from("transactions")
              .update({
                amount: numAmount,
                account_id: validAccountId,
                category_id: categoryVal,
                occurred_on: purchaseDate,
                note: `[Warranty] ${title.trim()}${note.trim() ? ` · ${note.trim()}` : ""}`,
              })
              .eq("id", finalTxnId);
              
            if (txnError) console.error("Failed to update linked transaction:", txnError);
          } else {
            const { data: newTxn, error: txnError } = await supabase
              .from("transactions")
              .insert({
                user_id: authUser.id,
                kind: "expense",
                amount: numAmount,
                account_id: validAccountId,
                category_id: categoryVal,
                occurred_on: purchaseDate,
                note: `[Warranty] ${title.trim()}${note.trim() ? ` · ${note.trim()}` : ""}`,
              })
              .select()
              .single();
              
            if (!txnError && newTxn) {
              finalTxnId = newTxn.id;
            }
          }
        } else if (finalTxnId && numAmount === 0) {
          // If updated to 0 cost, delete linked transaction to clean up expense
          await supabase.from("transactions").delete().eq("id", finalTxnId);
          finalTxnId = null;
        }

        // Update Warranty
        const { error } = await supabase
          .from("warranties" as any)
          .update({
            title: title.trim(),
            purchase_date: purchaseDate,
            expiry_date: expiryDate,
            amount: numAmount,
            account_id: validAccountId,
            category_id: categoryVal,
            transaction_id: finalTxnId,
            note: note.trim() || null,
            image_url: finalImageUrl || null,
            product_image_url: finalProductImageUrl || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingWarranty.id);

        if (error) throw error;
        toast.success("Warranty updated successfully!");
      } else {
        let newTxnId = null;
        if (numAmount > 0 && validAccountId) {
          const { data: newTxn, error: txnError } = await supabase
            .from("transactions")
            .insert({
              user_id: authUser.id,
              kind: "expense",
              amount: numAmount,
              account_id: validAccountId,
              category_id: categoryVal,
              occurred_on: purchaseDate,
              note: `[Warranty] ${title.trim()}${note.trim() ? ` · ${note.trim()}` : ""}`,
            })
            .select()
            .single();

          if (!txnError && newTxn) {
            newTxnId = newTxn.id;
          }
        }

        // Insert Warranty
        const { error } = await supabase.from("warranties" as any).insert({
          user_id: authUser.id,
          title: title.trim(),
          purchase_date: purchaseDate,
          expiry_date: expiryDate,
          amount: numAmount,
          account_id: validAccountId,
          category_id: categoryVal,
          transaction_id: newTxnId,
          note: note.trim() || null,
          image_url: finalImageUrl || null,
          product_image_url: finalProductImageUrl || null,
        });

        if (error) throw error;
        toast.success("Warranty created successfully!");
      }

      qc.invalidateQueries({ queryKey: ["warranties"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setSaving(false);
      setUploadingImage(false);
    }
  }

  async function confirmDeleteWarranty(id: string) {
    const target = warranties.find(w => w.id === id);
    if (!target) return;

    setSaving(true);
    try {
      // 1. Delete associated transaction if any
      if (target.transaction_id) {
        const { error: txnErr } = await supabase
          .from("transactions")
          .delete()
          .eq("id", target.transaction_id);
        if (txnErr) console.error("Failed to delete linked transaction:", txnErr);
      }

      // 2. Delete warranty
      const { error } = await supabase
        .from("warranties" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Warranty deleted");
      qc.invalidateQueries({ queryKey: ["warranties"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!editingWarranty) return;
    setOpen(false);
    setDeleteWarranty({ id: editingWarranty.id, title: editingWarranty.title });
  }

  // Stats Computations & Expiry Sorting
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function sortWarranties(list: Warranty[]): Warranty[] {
    const todayTime = today.getTime();
    return [...list].sort((a, b) => {
      const aTime = a.expiry_date ? new Date(a.expiry_date).getTime() : 0;
      const bTime = b.expiry_date ? new Date(b.expiry_date).getTime() : 0;
      const aExpired = aTime < todayTime;
      const bExpired = bTime < todayTime;

      // Active warranties come before Expired warranties
      if (!aExpired && bExpired) return -1;
      if (aExpired && !bExpired) return 1;

      if (!aExpired && !bExpired) {
        // Both Active: Expiring soonest comes first (Ascending order)
        return aTime - bTime;
      } else {
        // Both Expired: Most recently expired comes first (Descending order)
        return bTime - aTime;
      }
    });
  }

  const activeWarranties = sortWarranties(warranties.filter(w => new Date(w.expiry_date) >= today));
  const expiredWarranties = sortWarranties(warranties.filter(w => new Date(w.expiry_date) < today));

  const soonExpiring = sortWarranties(warranties.filter(w => {
    const expiry = new Date(w.expiry_date);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 30;
  }));

  const filteredWarranties = warranties.filter((w) => {
    if (categoryFilter !== "all" && w.category_id !== categoryFilter) return false;
    if (warrantyView === "active") return new Date(w.expiry_date) >= today;
    if (warrantyView === "expiring") {
      const expiry = new Date(w.expiry_date);
      const diffTime = expiry.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30;
    }
    if (warrantyView === "expired") return new Date(w.expiry_date) < today;
    return true;
  });

  const displayedWarranties = sortWarranties(filteredWarranties);

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
            <p>
              The <strong>warranties</strong> table and storage bucket do not exist in your Supabase database yet.
            </p>
            <p>
              Please copy the SQL commands below, open your <strong>Supabase Dashboard → SQL Editor</strong>, and click <strong>Run</strong>:
            </p>
          </div>
          <pre className="p-4 bg-card border rounded-lg text-[10px] font-mono overflow-auto max-h-52 text-foreground/80 thin-scroll">
{`-- Create warranties table
CREATE TABLE IF NOT EXISTS public.warranties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  purchase_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  note TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranties TO authenticated;
GRANT ALL ON public.warranties TO service_role;

-- Drop policies on warranties if they exist (to avoid duplication errors)
DROP POLICY IF EXISTS "own warranties" ON public.warranties;

-- RLS policies for warranties
CREATE POLICY "own warranties" ON public.warranties 
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Create warranties storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('warranties', 'warranties', true)
ON CONFLICT (id) DO NOTHING;

-- Drop policies on storage objects if they exist
DROP POLICY IF EXISTS "Allow authenticated upload to warranties" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read from warranties" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete own objects from warranties" ON storage.objects;

-- Storage policies for bucket
CREATE POLICY "Allow authenticated upload to warranties" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'warranties');

CREATE POLICY "Allow public read from warranties" ON storage.objects
  FOR SELECT USING (bucket_id = 'warranties');

CREATE POLICY "Allow users to delete own objects from warranties" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'warranties' AND auth.uid()::text = (storage.foldername(name))[1]);`}
          </pre>
          <div className="text-xs text-muted-foreground">
            After running the script, refresh this page to begin managing warranties!
          </div>
        </div>
      )}

      {/* ── Top Bar Header: Toggle Buttons & Category Selector ── */}
      {!dbError && (
        <div className="sticky top-[96px] md:top-[80px] -mt-4 md:-mt-6 -mx-4 px-4 md:-mx-6 md:px-6 py-2 bg-background/95 backdrop-blur-md border-b shadow-sm z-20 mb-4 flex items-center justify-between gap-2">
          {/* Left: Horizontal Scrollable Toggle Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto thin-scroll shrink min-w-0">
            <div className="flex items-center gap-0.5 p-0.5 bg-muted/60 border rounded-md shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setWarrantyView("all");
                }}
                className={`h-6 px-2 text-[10px] sm:text-[11px] font-bold rounded cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 transition-all ${
                  warrantyView === "all"
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <span>All</span>
                <span className={`text-[8px] sm:text-[9px] px-1 py-0 rounded-full font-bold ${
                  warrantyView === "all" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {warranties.length}
                </span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setWarrantyView("active");
                }}
                className={`h-6 px-2 text-[10px] sm:text-[11px] font-bold rounded cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 transition-all ${
                  warrantyView === "active"
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <span>Active</span>
                <span className={`text-[8px] sm:text-[9px] px-1 py-0 rounded-full font-bold ${
                  warrantyView === "active" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {activeWarranties.length}
                </span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setWarrantyView("expiring");
                }}
                className={`h-6 px-2 text-[10px] sm:text-[11px] font-bold rounded cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 transition-all ${
                  warrantyView === "expiring"
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <span>Expiring</span>
                <span className={`text-[8px] sm:text-[9px] px-1 py-0 rounded-full font-bold ${
                  warrantyView === "expiring" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {soonExpiring.length}
                </span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setWarrantyView("expired");
                }}
                className={`h-6 px-2 text-[10px] sm:text-[11px] font-bold rounded cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 transition-all ${
                  warrantyView === "expired"
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <span>Expired</span>
                <span className={`text-[8px] sm:text-[9px] px-1 py-0 rounded-full font-bold ${
                  warrantyView === "expired" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {expiredWarranties.length}
                </span>
              </button>
            </div>
          </div>

          {/* Right: Static Category Dropdown & Add Button (outside overflow-x-auto) */}
          <div className="flex items-center gap-1.5 shrink-0 z-30 ml-auto">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-6 text-[10px] sm:text-[11px] font-bold bg-muted/60 border rounded-md px-2 py-0 cursor-pointer min-w-[120px] max-w-[170px] truncate">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="z-[150] max-h-60" position="popper" side="bottom" align="end" sideOffset={4} collisionPadding={{ top: 110, bottom: 20 }}>
                <SelectItem value="all">Categories</SelectItem>
                {effectiveWarrantyCats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-1.5 truncate">
                      {c.image_url ? (
                        <img src={c.image_url} alt="" className="h-3.5 w-3.5 rounded-full object-cover shrink-0" />
                      ) : (
                        <span className="text-xs shrink-0">{c.icon}</span>
                      )}
                      <span className="truncate">{c.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCategoryModalOpen(true)}
              className="h-6 w-6 p-0 flex items-center justify-center font-bold rounded-md border-accent/40 text-accent hover:bg-accent/10 cursor-pointer shrink-0"
              title="Add or Edit Warranty Category"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Cards View ── */}
      {!dbError && (
        <>
          {isLoading && (
            <div className="py-16 text-center text-muted-foreground border rounded-2xl bg-card">
              <Loader2 className="h-7 w-7 animate-spin mx-auto opacity-40 mb-3" />
              <p className="text-sm font-medium">Loading warranties…</p>
            </div>
          )}

          {!isLoading && displayedWarranties.length === 0 && (
            <div className="py-16 text-center text-muted-foreground text-sm border rounded-2xl bg-card/60 p-6">
              <ShieldCheck className="h-10 w-10 mx-auto opacity-30 mb-2 text-accent" />
              <p className="font-semibold text-foreground">No warranties found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {warrantyView === "all"
                  ? "Click Add Warranty to protect your first product."
                  : `No ${warrantyView} warranties right now.`}
              </p>
            </div>
          )}

          {!isLoading && displayedWarranties.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedWarranties.map((w) => {
                const acc = w.account_id ? accMap.get(w.account_id) : null;
                const cat = w.category_id ? catMap.get(w.category_id) : null;

                const purchaseDateObj = w.purchase_date ? new Date(w.purchase_date) : new Date();
                const expiryDateObj = w.expiry_date ? new Date(w.expiry_date) : new Date();

                const validPurchase = !isNaN(purchaseDateObj.getTime());
                const validExpiry = !isNaN(expiryDateObj.getTime());

                const isExpired = validExpiry ? expiryDateObj < today : false;

                const totalDurationDays = (validPurchase && validExpiry)
                  ? Math.max(1, Math.round((expiryDateObj.getTime() - purchaseDateObj.getTime()) / (1000 * 60 * 60 * 24)))
                  : 1;

                const elapsedDays = validPurchase
                  ? Math.round((today.getTime() - purchaseDateObj.getTime()) / (1000 * 60 * 60 * 24))
                  : 0;

                const diffDays = validExpiry
                  ? Math.round((expiryDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                  : 0;

                const rawPct = Math.round((elapsedDays / totalDurationDays) * 100);
                const progressPct = isNaN(rawPct) ? 0 : isExpired ? 100 : Math.min(100, Math.max(0, rawPct));

                const statusInfo = getWarrantyStatusInfo(diffDays, isExpired);
                const daysLabel = statusInfo.daysLabel;
                const badgeColorClass = statusInfo.badgeColorClass;
                const barColorClass = statusInfo.barColorClass;

                const expiryFormatted = validExpiry
                  ? expiryDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                  : "N/A";

                return (
                  <div
                    key={w.id}
                    onClick={() => handleRowClick(w)}
                    className={`group relative rounded-2xl border transition-all hover:shadow-lg hover:border-accent/40 overflow-hidden flex flex-row cursor-pointer min-h-[160px] ${
                      isExpired
                        ? "bg-card/60 opacity-70 grayscale-[25%] hover:opacity-90 hover:grayscale-0 border-destructive/20"
                        : "bg-card hover:bg-accent/[0.02]"
                    }`}
                  >
                    {/* Left 1/3 Column: Product Image */}
                    <div className="w-1/3 shrink-0 relative bg-muted flex items-center justify-center border-r border-border/40 overflow-hidden">
                      {(w as any).product_image_url ? (
                        <img
                          src={(w as any).product_image_url}
                          alt={w.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-accent/10 via-muted to-accent/5 flex flex-col items-center justify-center p-2 text-center text-accent">
                          <ShieldCheck className="h-9 w-9 mb-1 opacity-80" />
                          <span className="text-[9px] font-bold tracking-wider uppercase text-muted-foreground/80">No Picture</span>
                        </div>
                      )}
                    </div>

                    {/* Right 2/3 Column: Product Details */}
                    <div className="w-2/3 p-3.5 flex flex-col justify-between min-w-0">
                      <div className="space-y-1">
                        {/* Product Title */}
                        <h3 className="font-serif font-black text-sm sm:text-base text-foreground truncate group-hover:text-accent transition-colors" title={w.title}>
                          {w.title}
                        </h3>

                        {/* Expires On */}
                        <p className="text-xs text-muted-foreground flex items-center gap-1 font-medium truncate">
                          <Calendar className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                          <span className="truncate">
                            Expires on: <strong className="text-foreground font-semibold">{expiryFormatted}</strong>
                          </span>
                        </p>
                      </div>

                      {/* Days Left Tracker & Visual Bar */}
                      <div className="mt-2.5 space-y-1">
                        <div className="flex items-center justify-end gap-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none ${badgeColorClass}`}>
                            {daysLabel}
                          </span>
                        </div>

                        {/* Visual Progress Bar with Pointer Knob */}
                        <div className="relative w-full h-1.5 bg-muted rounded-full flex items-center my-0.5">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${barColorClass}`}
                            style={{ width: `${progressPct}%` }}
                          />
                          <div
                            className={`absolute h-2.5 w-2.5 rounded-full border-2 border-background shadow-xs transition-all duration-500 -translate-x-1/2 ${barColorClass}`}
                            style={{ left: `${Math.max(2, Math.min(98, progressPct))}%` }}
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

      {/* Add / Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0 z-[95] rounded-xl overflow-hidden">
          <DialogHeader className="p-4 border-b border-border/40 shrink-0">
            <DialogTitle className="font-serif text-xl font-black">
              {editingWarranty ? "Edit Warranty" : "Add Warranty"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 thin-scroll">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="title" className="text-xs font-semibold">Product Name / Title</Label>
              <Input 
                id="title" 
                placeholder="e.g. MacBook Pro, Sony Headphones" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                disabled={saving}
              />
            </div>

            {/* Paid From Account in a separate full-width row */}
            <div className="space-y-1.5">
              <Label htmlFor="account" className="text-xs font-semibold">Paid From Account</Label>
              <SearchableSelect
                options={accountOptions}
                value={accountId}
                onValueChange={setAccountId}
                placeholder="Select account"
                searchPlaceholder="Search account..."
              />
            </div>

            {/* Price / Cost & Category in another row */}
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="amount" className="text-xs font-semibold">Price / Cost ({currency})</Label>
                <Input 
                  id="amount" 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)} 
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="category" className="text-xs font-semibold">Category (Optional)</Label>
                <SearchableSelect
                  options={categoryOptions}
                  value={categoryId}
                  onValueChange={setCategoryId}
                  placeholder="Select category"
                  searchPlaceholder="Search category..."
                />
              </div>
            </div>

            {/* Warranty Duration Auto-Fill */}
            <div className="space-y-2 p-3 rounded-xl bg-muted/40 border border-border/60">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Warranty Duration (Auto-Fills Expiry)
                </Label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  placeholder="Duration (e.g. 1)"
                  value={durationNum}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDurationNum(val);
                    applyDuration(val, durationUnit);
                  }}
                  disabled={saving}
                  className="bg-background text-xs h-9"
                />

                <Select
                  value={durationUnit}
                  onValueChange={(val: "years" | "months" | "days") => {
                    setDurationUnit(val);
                    applyDuration(durationNum, val);
                  }}
                >
                  <SelectTrigger className="w-full bg-background text-xs h-9">
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent className="z-[110]">
                    <SelectItem value="years">Year(s)</SelectItem>
                    <SelectItem value="months">Month(s)</SelectItem>
                    <SelectItem value="days">Day(s)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Quick Duration Presets */}
              <div className="flex flex-wrap items-center gap-1 pt-1">
                <span className="text-[10px] text-muted-foreground mr-1">Presets:</span>
                {[
                  { num: "6", unit: "months" as const, label: "6 Months" },
                  { num: "1", unit: "years" as const, label: "1 Year" },
                  { num: "2", unit: "years" as const, label: "2 Years" },
                  { num: "3", unit: "years" as const, label: "3 Years" },
                  { num: "5", unit: "years" as const, label: "5 Years" },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDurationNum(preset.num);
                      setDurationUnit(preset.unit);
                      applyDuration(preset.num, preset.unit);
                    }}
                    className="h-6 px-2 text-[10px] font-semibold rounded-md hover:bg-accent/10 cursor-pointer"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Purchase & Expiry Dates in another row */}
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="purchaseDate" className="text-xs font-semibold">Purchase Date</Label>
                <Input 
                  id="purchaseDate" 
                  type="date" 
                  value={purchaseDate} 
                  onChange={(e) => {
                    const newPurchase = e.target.value;
                    setPurchaseDate(newPurchase);
                    if (durationNum) {
                      applyDuration(durationNum, durationUnit, newPurchase);
                    }
                  }} 
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expiryDate" className="text-xs font-semibold">Expiry Date</Label>
                <Input 
                  id="expiryDate" 
                  type="date" 
                  value={expiryDate} 
                  onChange={(e) => setExpiryDate(e.target.value)} 
                  disabled={saving}
                />
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <Label htmlFor="note" className="text-xs font-semibold">Notes / Serial Number</Label>
              <Textarea 
                id="note" 
                placeholder="Serial number, service contact, conditions..." 
                rows={2.5}
                value={note} 
                onChange={(e) => setNote(e.target.value)} 
                disabled={saving}
              />
            </div>

            {/* Image Uploaders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* Receipt Image Upload */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Receipt / Invoice</Label>
                
                {imageUrl && (
                  <div className="relative border rounded-lg overflow-hidden h-28 bg-muted flex items-center justify-center">
                    <img src={imageUrl} alt="Receipt Preview" className="h-full object-contain" />
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="absolute top-1.5 right-1.5 h-5 w-5 p-0 rounded-full cursor-pointer"
                      onClick={() => setImageUrl("")}
                      disabled={saving}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {!imageUrl && (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border/60 hover:border-accent/40 rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-accent/[0.01] hover:bg-accent/[0.03] transition-all h-28 text-center"
                  >
                    <Upload className="h-4 w-4 text-muted-foreground opacity-60" />
                    <span className="text-[10px] font-medium leading-tight">
                      {imageFile ? imageFile.name : "Upload Receipt"}
                    </span>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept="image/*" 
                      className="hidden" 
                      disabled={saving}
                    />
                  </div>
                )}
              </div>

              {/* Product Picture Upload */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Product Picture</Label>
                
                {productImageUrl && (
                  <div className="relative border rounded-lg overflow-hidden h-28 bg-muted flex items-center justify-center">
                    <img src={productImageUrl} alt="Product Preview" className="h-full object-contain" />
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="absolute top-1.5 right-1.5 h-5 w-5 p-0 rounded-full cursor-pointer"
                      onClick={() => setProductImageUrl("")}
                      disabled={saving}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {!productImageUrl && (
                  <div 
                    onClick={() => productFileInputRef.current?.click()}
                    className="border-2 border-dashed border-border/60 hover:border-emerald-500/40 rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-emerald-500/[0.01] hover:bg-emerald-500/[0.03] transition-all h-28 text-center"
                  >
                    <ImageIcon className="h-4 w-4 text-muted-foreground opacity-60" />
                    <span className="text-[10px] font-medium leading-tight">
                      {productImageFile ? productImageFile.name : "Upload Product Pic"}
                    </span>
                    <input 
                      type="file" 
                      ref={productFileInputRef} 
                      onChange={handleProductFileChange} 
                      accept="image/*" 
                      className="hidden" 
                      disabled={saving}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="p-4 border-t border-border/40 gap-2 flex-row justify-between sm:justify-between items-center shrink-0">
            {editingWarranty && (
              <Button 
                variant="destructive" 
                onClick={handleDelete} 
                disabled={saving || uploadingImage || uploadingProductImage}
                className="cursor-pointer mr-auto"
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button 
                variant="outline" 
                onClick={() => { setOpen(false); resetForm(); }} 
                disabled={saving || uploadingImage || uploadingProductImage}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={saving || uploadingImage || uploadingProductImage}
                className="cursor-pointer"
              >
                {saving || uploadingImage || uploadingProductImage ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    {uploadingImage || uploadingProductImage ? "Uploading..." : "Saving..."}
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warranty Details Pop-up Dialog */}
      <Dialog open={!!selectedWarranty} onOpenChange={(val) => { if (!val) setSelectedWarranty(null); }}>
        <DialogContent className="max-w-md z-[100]">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-accent" />
              Warranty Details
            </DialogTitle>
          </DialogHeader>

          {selectedWarranty && (() => {
            const acc = selectedWarranty.account_id ? accMap.get(selectedWarranty.account_id) : null;
            const cat = selectedWarranty.category_id ? catMap.get(selectedWarranty.category_id) : null;
            const isExpired = new Date(selectedWarranty.expiry_date) < today;
            const expiryDateObj = new Date(selectedWarranty.expiry_date);
            const diffTime = expiryDateObj.getTime() - today.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            const statusInfo = getWarrantyStatusInfo(diffDays, isExpired);
            const daysLabel = statusInfo.daysLabel;

            return (
              <div className="space-y-4 mt-3">
                <div className="flex items-center gap-3 border-b pb-3 min-w-0">
                  {(selectedWarranty as any).product_image_url ? (
                    <img 
                      src={(selectedWarranty as any).product_image_url} 
                      alt={selectedWarranty.title} 
                      className="h-12 w-12 rounded-xl object-cover border shrink-0" 
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-serif font-black text-base sm:text-lg text-foreground break-words leading-snug">{selectedWarranty.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Purchased: {new Date(selectedWarranty.purchase_date).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-xs text-muted-foreground uppercase font-bold">Coverage Status</span>
                  <Badge className={`capitalize font-semibold border ${statusInfo.badgeColorClass}`}>
                    {daysLabel}
                  </Badge>
                </div>

                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-xs text-muted-foreground uppercase font-bold">Cost</span>
                  <span className="font-serif num font-black text-lg text-foreground">
                    {fmtMoney(Number(selectedWarranty.amount), currency)}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-xs text-muted-foreground uppercase font-bold">Expiry Date</span>
                  <span className={`text-xs ${statusInfo.textColorClass}`}>
                    {new Date(selectedWarranty.expiry_date).toLocaleDateString()}
                  </span>
                </div>

                {acc && (
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-xs text-muted-foreground uppercase font-bold">Paid From</span>
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: acc.color }} />
                      {acc.name}
                    </span>
                  </div>
                )}

                {cat && (
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-xs text-muted-foreground uppercase font-bold">Category</span>
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      {cat.image_url ? (
                        <img src={cat.image_url} alt="" className="h-4 w-4 rounded-full object-cover" />
                      ) : (
                        <span>{cat.icon}</span>
                      )}
                      <span>{cat.name}</span>
                    </span>
                  </div>
                )}

                {selectedWarranty.note && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase font-bold block">Note</span>
                    <p className="p-3 bg-muted/40 rounded-xl border text-xs text-foreground font-serif italic">"{selectedWarranty.note}"</p>
                  </div>
                )}

                {(selectedWarranty.image_url || (selectedWarranty as any).product_image_url) && (
                  <div className="space-y-1 pt-1">
                    <span className="text-xs text-muted-foreground uppercase font-bold block">Attachments</span>
                    <div className="flex gap-2">
                      {(selectedWarranty as any).product_image_url && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-xs h-8 cursor-pointer gap-1 text-emerald-600 border-emerald-500/30"
                          onClick={() => setPreviewImage((selectedWarranty as any).product_image_url)}
                        >
                          <ImageIcon className="h-3.5 w-3.5" /> Product Pic
                        </Button>
                      )}
                      {selectedWarranty.image_url && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-xs h-8 cursor-pointer gap-1 text-accent border-accent/30"
                          onClick={() => setPreviewImage(selectedWarranty.image_url)}
                        >
                          <FileText className="h-3.5 w-3.5" /> Receipt
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const w = selectedWarranty;
                      setSelectedWarranty(null);
                      handleEditWarranty(w);
                    }}
                    className="gap-1 rounded-full cursor-pointer h-9 px-4 text-xs font-semibold"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit Details
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      const w = selectedWarranty;
                      setSelectedWarranty(null);
                      setDeleteWarranty({ id: w.id, title: w.title });
                    }}
                    className="gap-1 rounded-full cursor-pointer h-9 px-4 text-xs font-semibold"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Mobile popup lists */}
      {/* Active Warranties Popup List */}
      <Dialog open={activeListOpen} onOpenChange={setActiveListOpen}>
        <DialogContent className="max-w-[95vw] rounded-xl max-h-[85vh] overflow-y-auto thin-scroll z-[99]">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-600" />
              Active Warranties ({activeWarranties.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-3 max-h-[360px] overflow-y-auto overflow-x-hidden pr-1 thin-scroll">
            {activeWarranties.length === 0 && (
              <p className="text-center text-muted-foreground py-10 text-xs">No active warranties found.</p>
            )}
            {activeWarranties.map((w) => {
              const diffDays = Math.round((new Date(w.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const statusInfo = getWarrantyStatusInfo(diffDays, false);
              return (
                <div 
                  key={w.id} 
                  onClick={() => { 
                    setActiveListOpen(false); 
                    setSelectedWarranty(w);
                  }} 
                  className="p-3 rounded-lg border bg-card hover:bg-muted/10 flex items-center justify-between gap-3 transition-colors cursor-pointer w-full min-w-0 overflow-hidden"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-serif font-bold text-sm truncate block">{w.title}</span>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                      <span>Purchased: {new Date(w.purchase_date).toLocaleDateString()}</span>
                      <span className={`${statusInfo.textColorClass}`}>Expires: {new Date(w.expiry_date).toLocaleDateString()} ({statusInfo.daysLabel})</span>
                    </div>
                  </div>
                  <span className="font-serif font-bold text-base num text-foreground shrink-0">{fmtMoney(Number(w.amount), currency)}</span>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Expiring Warranties Popup List */}
      <Dialog open={expiringListOpen} onOpenChange={setExpiringListOpen}>
        <DialogContent className="max-w-[95vw] rounded-xl max-h-[85vh] overflow-y-auto thin-scroll z-[99]">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Expiring Warranties (30d) ({soonExpiring.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-3 max-h-[360px] overflow-y-auto overflow-x-hidden pr-1 thin-scroll">
            {soonExpiring.length === 0 && (
              <p className="text-center text-muted-foreground py-10 text-xs">No warranties expiring within 30 days.</p>
            )}
            {soonExpiring.map((w) => {
              const diffDays = Math.round((new Date(w.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const statusInfo = getWarrantyStatusInfo(diffDays, false);
              return (
                <div 
                  key={w.id} 
                  onClick={() => { 
                    setExpiringListOpen(false); 
                    setSelectedWarranty(w);
                  }} 
                  className="p-3 rounded-lg border bg-card hover:bg-muted/10 flex items-center justify-between gap-3 transition-colors cursor-pointer w-full min-w-0 overflow-hidden"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-serif font-bold text-sm truncate block">{w.title}</span>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                      <span>Purchased: {new Date(w.purchase_date).toLocaleDateString()}</span>
                      <span className={`${statusInfo.textColorClass}`}>Expires: {new Date(w.expiry_date).toLocaleDateString()} ({statusInfo.daysLabel})</span>
                    </div>
                  </div>
                  <span className="font-serif font-bold text-base num text-foreground shrink-0">{fmtMoney(Number(w.amount), currency)}</span>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Expired Warranties Popup List */}
      <Dialog open={expiredListOpen} onOpenChange={setExpiredListOpen}>
        <DialogContent className="max-w-[95vw] rounded-xl max-h-[85vh] overflow-y-auto thin-scroll z-[99]">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Expired Warranties ({expiredWarranties.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-3 max-h-[360px] overflow-y-auto overflow-x-hidden pr-1 thin-scroll">
            {expiredWarranties.length === 0 && (
              <p className="text-center text-muted-foreground py-10 text-xs">No expired warranties found.</p>
            )}
            {expiredWarranties.map((w) => (
              <div 
                key={w.id} 
                onClick={() => { 
                  setExpiredListOpen(false); 
                  setSelectedWarranty(w);
                }} 
                className="p-3 rounded-lg border bg-muted/40 opacity-80 flex items-center justify-between gap-3 transition-colors cursor-pointer w-full min-w-0 overflow-hidden"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-serif font-bold text-sm truncate block">{w.title}</span>
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span>Purchased: {new Date(w.purchase_date).toLocaleDateString()}</span>
                    <span className="text-destructive font-bold">Expired: {new Date(w.expiry_date).toLocaleDateString()}</span>
                  </div>
                </div>
                <span className="font-serif font-bold text-base num text-foreground shrink-0">{fmtMoney(Number(w.amount), currency)}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Preview Lightbox */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[160] bg-black/85 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center gap-3">
            <button 
              className="absolute -top-10 right-0 text-white hover:text-gray-300 flex items-center gap-1 text-xs cursor-pointer"
              onClick={() => setPreviewImage(null)}
            >
              <X className="h-4 w-4" /> Close
            </button>
            <img 
              src={previewImage} 
              alt="Receipt receipt_image" 
              className="max-w-full max-h-[80vh] rounded-lg object-contain border" 
              onClick={(e) => e.stopPropagation()}
            />
            <a 
              href={previewImage} 
              target="_blank" 
              rel="noreferrer"
              className="text-xs text-accent hover:underline flex items-center gap-1 mt-2"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open full image in new tab
            </a>
          </div>
        </div>
      )}

      {/* Floating Action Button (FAB) for adding new warranty */}
      {!dbError && createPortal(
        <button 
          onClick={handleAddClick} 
          className="fixed bottom-[5rem] md:bottom-6 right-6 z-40 h-10 w-10 md:h-12 md:w-12 rounded-full bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg border border-accent/20 flex items-center justify-center cursor-pointer transition-transform active:scale-95 hover:scale-105"
          title="Add Warranty"
        >
          <Plus className="h-5 w-5 md:h-6 md:w-6 text-accent-foreground" />
        </button>,
        document.body
      )}

      {/* Category Creation / Edit Modal */}
      <CategoryFormDialog
        open={categoryModalOpen}
        onOpenChange={setCategoryModalOpen}
        defaultIsWarranty={true}
        onSaved={() => qc.invalidateQueries({ queryKey: ["categories"] })}
      />

      {/* Delete Confirmation Alert */}
      <AlertDialog open={!!deleteWarranty} onOpenChange={(val) => !val && setDeleteWarranty(null)}>
        <AlertDialogContent className="z-[110]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Delete Warranty?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the warranty for "{deleteWarranty?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-between">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteWarranty) {
                  confirmDeleteWarranty(deleteWarranty.id);
                  setDeleteWarranty(null);
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
