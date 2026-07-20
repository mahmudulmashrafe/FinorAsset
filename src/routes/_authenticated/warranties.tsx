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
  ExternalLink, AlertTriangle, ShieldAlert, Loader2, Upload, X, Shield, FileText 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const { data: txns = [] } = useQuery({ queryKey: ["transactions"], queryFn: api.listTransactions });

  const balances = computeAccountBalances(accounts, txns);
  const catMap = new Map(cats.map(c => [c.id, c]));
  const accMap = new Map(accounts.map(a => [a.id, a]));

  // Form & Dialog States
  const [open, setOpen] = useState(false);
  const [editingWarranty, setEditingWarranty] = useState<Warranty | null>(null);
  const [deleteWarranty, setDeleteWarranty] = useState<{ id: string; title: string } | null>(null);
  const [saving, setSaving] = useState(false);

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

  function resetForm() {
    setTitle("");
    setPurchaseDate(new Date().toISOString().split("T")[0]);
    setExpiryDate("");
    setAmount("");
    setAccountId(accounts[0]?.id || "");
    setCategoryId("none");
    setNote("");
    setImageFile(null);
    setImageUrl("");
    setProductImageFile(null);
    setProductImageUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (productFileInputRef.current) productFileInputRef.current.value = "";
  }

  function handleAddClick() {
    resetForm();
    setEditingWarranty(null);
    setOpen(true);
  }

  function handleRowClick(w: Warranty) {
    setTitle(w.title);
    setPurchaseDate(w.purchase_date);
    setExpiryDate(w.expiry_date);
    setAmount(String(w.amount));
    setAccountId(w.account_id || "");
    setCategoryId(w.category_id || "none");
    setNote(w.note || "");
    setImageUrl(w.image_url || "");
    setImageFile(null);
    setProductImageUrl(w.product_image_url || "");
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
    if (!amount || Number(amount) <= 0) return toast.error("Please enter a valid amount");
    if (!accountId) return toast.error("Please select an account");

    // Balance validation
    const targetAcc = accounts.find(a => a.id === accountId);
    if (targetAcc) {
      const currentBal = balances.get(accountId) ?? 0;
      let available = currentBal;
      // If editing, add back original amount if same account
      if (editingWarranty && editingWarranty.account_id === accountId) {
        available += Number(editingWarranty.amount);
      }
      const required = Number(amount);
      if (available < required) {
        return toast.error(`Insufficient funds in ${targetAcc.name}. Available: ${fmtMoney(available, currency)}, required: ${fmtMoney(required, currency)}`);
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

      if (editingWarranty) {
        // Update transaction if exists
        let finalTxnId = editingWarranty.transaction_id;
        if (finalTxnId) {
          const { error: txnError } = await supabase
            .from("transactions")
            .update({
              amount: Number(amount),
              account_id: accountId,
              category_id: categoryVal,
              occurred_on: purchaseDate,
              note: `[Warranty] ${title.trim()}${note.trim() ? ` · ${note.trim()}` : ""}`,
            })
            .eq("id", finalTxnId);
            
          if (txnError) console.error("Failed to update linked transaction:", txnError);
        } else {
          // If transaction didn't exist before, create one now
          const { data: newTxn, error: txnError } = await supabase
            .from("transactions")
            .insert({
              user_id: authUser.id,
              kind: "expense",
              amount: Number(amount),
              account_id: accountId,
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

        // Update Warranty
        const { error } = await supabase
          .from("warranties")
          .update({
            title: title.trim(),
            purchase_date: purchaseDate,
            expiry_date: expiryDate,
            amount: Number(amount),
            account_id: accountId,
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
        // Create Transaction first
        const { data: newTxn, error: txnError } = await supabase
          .from("transactions")
          .insert({
            user_id: authUser.id,
            kind: "expense",
            amount: Number(amount),
            account_id: accountId,
            category_id: categoryVal,
            occurred_on: purchaseDate,
            note: `[Warranty] ${title.trim()}${note.trim() ? ` · ${note.trim()}` : ""}`,
          })
          .select()
          .single();

        if (txnError) {
          console.error("Failed to insert warranty transaction:", txnError);
        }

        // Insert Warranty
        const { error } = await supabase.from("warranties").insert({
          user_id: authUser.id,
          title: title.trim(),
          purchase_date: purchaseDate,
          expiry_date: expiryDate,
          amount: Number(amount),
          account_id: accountId,
          category_id: categoryVal,
          transaction_id: newTxn ? newTxn.id : null,
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
        .from("warranties")
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

  // Stats Computations
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeWarranties = warranties.filter(w => new Date(w.expiry_date) >= today);
  const expiredWarranties = warranties.filter(w => new Date(w.expiry_date) < today);

  const soonExpiring = warranties.filter(w => {
    const expiry = new Date(w.expiry_date);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 30;
  });

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

      {/* Stats Grid */}
      {!dbError && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active Warranties</p>
              <h3 className="font-serif text-2xl font-black mt-1 num">{activeWarranties.length}</h3>
            </div>
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <Shield className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Expiring (30d)</p>
              <h3 className="font-serif text-2xl font-black mt-1 num text-amber-500">{soonExpiring.length}</h3>
            </div>
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center animate-pulse">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Expired</p>
              <h3 className="font-serif text-2xl font-black mt-1 num text-destructive">{expiredWarranties.length}</h3>
            </div>
            <div className="h-10 w-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </div>
      )}

      {/* List / Table */}
      {!dbError && (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold py-3 px-4">Item Name</TableHead>
                  <TableHead className="font-bold py-3 px-4">Purchase Date</TableHead>
                  <TableHead className="font-bold py-3 px-4">Expiry Date</TableHead>
                  <TableHead className="font-bold py-3 px-4">Paid From</TableHead>
                  <TableHead className="font-bold py-3 px-4">Category</TableHead>
                  <TableHead className="font-bold py-3 px-4 text-right">Cost</TableHead>
                  <TableHead className="font-bold py-3 px-4 text-center">Receipt & Pic</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto opacity-40 mb-2" />
                      Loading warranties…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && warranties.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      No warranties added yet. Click Add Warranty to begin.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && warranties.map((w) => {
                  const acc = w.account_id ? accMap.get(w.account_id) : null;
                  const cat = w.category_id ? catMap.get(w.category_id) : null;
                  
                  const isExpired = new Date(w.expiry_date) < today;
                  const expiryDateObj = new Date(w.expiry_date);
                  const diffTime = expiryDateObj.getTime() - today.getTime();
                  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                  let daysLabel = "";
                  if (isExpired) {
                    daysLabel = "Expired";
                  } else if (diffDays === 0) {
                    daysLabel = "Expires today";
                  } else if (diffDays === 1) {
                    daysLabel = "Expires tomorrow";
                  } else {
                    daysLabel = `${diffDays} days left`;
                  }

                  return (
                    <TableRow 
                      key={w.id} 
                      onClick={() => handleRowClick(w)}
                      className="cursor-pointer hover:bg-accent/5 transition-colors group"
                    >
                      <TableCell className="font-medium py-3 px-4">
                        <div className="flex items-center gap-3">
                          {w.product_image_url ? (
                            <img 
                              src={w.product_image_url} 
                              alt={w.title} 
                              className="h-8 w-8 rounded-lg object-cover bg-muted border border-border/60 shrink-0" 
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                              <ShieldCheck className="h-4 w-4" />
                            </div>
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className="font-serif font-black truncate">{w.title}</span>
                            {w.note && <span className="text-[10px] text-muted-foreground max-w-[30ch] truncate mt-0.5">{w.note}</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4 tabular-nums text-xs sm:text-sm">
                        {new Date(w.purchase_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="tabular-nums text-xs sm:text-sm font-semibold">{new Date(w.expiry_date).toLocaleDateString()}</span>
                          <span className={`text-[10px] font-medium leading-none ${isExpired ? "text-destructive" : diffDays <= 30 ? "text-amber-500" : "text-emerald-500"}`}>
                            {daysLabel}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-xs sm:text-sm text-muted-foreground">
                        {acc ? (
                          <div className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: acc.color }} />
                            {acc.name}
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-xs sm:text-sm">
                        {cat ? (
                          <span className="inline-flex items-center gap-1.5">
                            {cat.image_url ? (
                              <img src={cat.image_url} alt="" className="h-4 w-4 rounded-full object-cover shrink-0" />
                            ) : (
                              <span>{cat.icon}</span>
                            )}
                            <span>{cat.name}</span>
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-right font-serif font-bold tabular-nums">
                        {fmtMoney(Number(w.amount), currency)}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          {w.product_image_url && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 w-7 p-0 cursor-pointer text-emerald-500 hover:text-emerald-400"
                              onClick={() => setPreviewImage(w.product_image_url)}
                              title="View Product Picture"
                            >
                              <ImageIcon className="h-4 w-4" />
                            </Button>
                          )}
                          {w.image_url && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 w-7 p-0 cursor-pointer text-accent hover:text-accent/80"
                              onClick={() => setPreviewImage(w.image_url)}
                              title="View Receipt"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                          {!w.image_url && !w.product_image_url && (
                            <span className="text-muted-foreground/30 text-xs">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile List View */}
          <div className="md:hidden space-y-2.5">
            {isLoading && (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto opacity-40 mb-2" />
                Loading warranties…
              </div>
            )}
            {!isLoading && warranties.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-sm border rounded-xl bg-card">
                No warranties added yet.
              </div>
            )}
            {!isLoading && warranties.map((w) => {
              const acc = w.account_id ? accMap.get(w.account_id) : null;
              const cat = w.category_id ? catMap.get(w.category_id) : null;
              const isExpired = new Date(w.expiry_date) < today;
              const expiryDateObj = new Date(w.expiry_date);
              const diffTime = expiryDateObj.getTime() - today.getTime();
              const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

              let daysLabel = "";
              if (isExpired) {
                daysLabel = "Expired";
              } else if (diffDays === 0) {
                daysLabel = "Expires today";
              } else if (diffDays === 1) {
                daysLabel = "Expires tomorrow";
              } else {
                daysLabel = `${diffDays} days left`;
              }

              return (
                <div 
                  key={w.id} 
                  onClick={() => handleRowClick(w)}
                  className={`rounded-xl border bg-card/85 p-3.5 space-y-3 cursor-pointer hover:bg-accent/[0.02] active:bg-accent/[0.04] transition-all`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {w.product_image_url ? (
                        <img 
                          src={w.product_image_url} 
                          alt={w.title} 
                          className="h-10 w-10 rounded-lg object-cover bg-muted border border-border/60 shrink-0" 
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h4 className="font-serif font-black text-sm truncate">{w.title}</h4>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded leading-none ${isExpired ? "bg-destructive/10 text-destructive border border-destructive/20" : diffDays <= 30 ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"}`}>
                            {daysLabel}
                          </span>
                          {cat && (
                            <Badge variant="outline" className="text-[8px] py-0 px-1 border-border/80 text-muted-foreground gap-0.5">
                              {cat.image_url ? (
                                <img src={cat.image_url} alt="" className="h-3 w-3 rounded-full object-cover shrink-0" />
                              ) : (
                                <span>{cat.icon}</span>
                              )}
                              <span>{cat.name}</span>
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="font-serif font-bold text-sm tabular-nums shrink-0">
                      {fmtMoney(Number(w.amount), currency)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground pt-1.5 border-t border-border/40">
                    <div>
                      <p className="uppercase tracking-wider text-[8px]">Purchase Date</p>
                      <p className="font-medium text-foreground mt-0.5">{new Date(w.purchase_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-wider text-[8px]">Expiry Date</p>
                      <p className="font-medium text-foreground mt-0.5 font-semibold">{new Date(w.expiry_date).toLocaleDateString()}</p>
                    </div>
                    {acc && (
                      <div className="col-span-2">
                        <p className="uppercase tracking-wider text-[8px]">Paid From</p>
                        <p className="font-medium text-foreground mt-0.5 flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: acc.color }} />
                          {acc.name}
                        </p>
                      </div>
                    )}
                  </div>

                  {(w.image_url || w.product_image_url) && (
                    <div className="pt-2 border-t border-border/40 flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {w.product_image_url && (
                        <Button 
                          variant="outline" 
                          size="xs" 
                          className="text-[10px] h-6 py-0 px-2 cursor-pointer gap-1 text-emerald-600 hover:text-emerald-700 bg-emerald-500/[0.03]"
                          onClick={() => setPreviewImage(w.product_image_url)}
                        >
                          <ImageIcon className="h-3 w-3" /> Product Pic
                        </Button>
                      )}
                      {w.image_url && (
                        <Button 
                          variant="outline" 
                          size="xs" 
                          className="text-[10px] h-6 py-0 px-2 cursor-pointer gap-1"
                          onClick={() => setPreviewImage(w.image_url)}
                        >
                          <FileText className="h-3 w-3" /> Receipt
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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

            {/* Purchase & Expiry Dates */}
            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="purchaseDate" className="text-xs font-semibold">Purchase Date</Label>
                <Input 
                  id="purchaseDate" 
                  type="date" 
                  value={purchaseDate} 
                  onChange={(e) => setPurchaseDate(e.target.value)} 
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

            {/* Cost & Account */}
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
                <Label htmlFor="account" className="text-xs font-semibold">Paid From</Label>
                <Select value={accountId} onValueChange={setAccountId} disabled={saving}>
                  <SelectTrigger id="account" className="bg-background">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent className="z-[150]">
                    {accounts.map(a => {
                      const bal = balances.get(a.id) ?? 0;
                      return (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({fmtMoney(bal, currency)})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="category" className="text-xs font-semibold">Category (Optional)</Label>
              <Select value={categoryId} onValueChange={setCategoryId} disabled={saving}>
                <SelectTrigger id="category" className="bg-background">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="z-[150]">
                  <SelectItem value="none">None</SelectItem>
                  {cats.filter(c => c.kind === "expense").map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-1.5">
                        {c.image_url ? (
                          <img src={c.image_url} alt="" className="h-4 w-4 rounded-full object-cover shrink-0" />
                        ) : (
                          <span>{c.icon}</span>
                        )}
                        <span>{c.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                      size="xs" 
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
                      size="xs" 
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
