import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import type { Category } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/categories")({
  component: CategoriesPage,
  head: () => ({ meta: [{ title: "Categories — FinorAsset" }] }),
});

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = [
  "#F59E0B", "#D97706", "#F97316", "#EA580C",
  "#EF4444", "#DC2626", "#EC4899", "#DB2777",
  "#8B5CF6", "#7C3AED", "#6366F1", "#4F46E5",
  "#3B82F6", "#2563EB", "#06B6D4", "#0891B2",
  "#10B981", "#059669", "#14B8A6", "#0D9488",
  "#84CC16", "#65A30D", "#6B7280", "#374151",
];

const ICONS = [
  // Transport (with rickshaw!)
  "🛺", "🚗", "🚌", "✈️", "🚂", "🛵", "🚲", "🚕", "⛽", "🛻",
  // Food & drink
  "🍔", "🍕", "🍜", "🍣", "☕", "🧋", "🥗", "🍱", "🍰", "🥤",
  // Shopping & home
  "🛒", "🏠", "🛋️", "💡", "🔧", "🧹", "🪣", "🛁", "🪟", "🛏️",
  // Health & fitness
  "💊", "🏥", "💪", "🏋️", "🩺", "🧘", "🏃", "🩹", "🧴", "🦷",
  // Entertainment
  "🎬", "🎮", "🎵", "🎸", "📺", "🎭", "🎨", "📷", "🎤", "🎲",
  // Education & work
  "📚", "🎓", "💼", "📱", "💻", "🖥️", "📝", "🏫", "✏️", "📐",
  // Money & finance
  "💰", "💳", "📈", "📉", "🏦", "🧾", "💵", "🪙", "💸", "🤑",
  // Nature & misc
  "🌿", "🌱", "🐾", "🎁", "⚡", "💧", "🔑", "🧳", "🎀", "🎊",
  // Bangladesh specific
  "🕌", "🌾", "🐟", "🥭", "🌶️", "🧆", "🛕", "🌊", "🪔", "🏏",
];

type Kind = "income" | "expense";

// ─── Shared color + icon pickers ─────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="grid grid-cols-12 gap-2 mt-2">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          className={`h-8 w-8 rounded-full transition-all duration-150 ${
            value === c
              ? "ring-2 ring-offset-2 ring-foreground scale-110 shadow-md"
              : "hover:scale-105 hover:shadow-sm"
          }`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (i: string) => void }) {
  const groups = [
    { label: "Transport", icons: ICONS.slice(0, 10) },
    { label: "Food & Drink", icons: ICONS.slice(10, 20) },
    { label: "Shopping & Home", icons: ICONS.slice(20, 30) },
    { label: "Health & Fitness", icons: ICONS.slice(30, 40) },
    { label: "Entertainment", icons: ICONS.slice(40, 50) },
    { label: "Work & Education", icons: ICONS.slice(50, 60) },
    { label: "Money & Finance", icons: ICONS.slice(60, 70) },
    { label: "Nature & Misc", icons: ICONS.slice(70, 80) },
    { label: "Bangladesh", icons: ICONS.slice(80, 90) },
  ];

  return (
    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto pr-1">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{g.label}</p>
          <div className="flex flex-wrap gap-1">
            {g.icons.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => onChange(em)}
                className={`h-9 w-9 rounded-lg text-xl flex items-center justify-center transition-all ${
                  value === em
                    ? "ring-2 ring-offset-1 ring-foreground bg-accent/20 scale-110"
                    : "hover:bg-accent/10 hover:scale-105"
                }`}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Category Form Dialog (shared for create & edit) ─────────────────────────

interface FormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingCategory?: Category | null;
  onSaved: () => void;
}

function CategoryFormDialog({ open, onOpenChange, editingCategory, onSaved }: FormDialogProps) {
  const isEdit = !!editingCategory;

  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("expense");
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(ICONS[0]);
  const [saving, setSaving] = useState(false);

  // Pre-fill when editing
  useEffect(() => {
    if (open) {
      if (editingCategory) {
        setName(editingCategory.name);
        setKind(editingCategory.kind as Kind);
        setColor(editingCategory.color ?? COLORS[0]);
        setIcon(editingCategory.icon ?? ICONS[0]);
      } else {
        setName("");
        setKind("expense");
        setColor(COLORS[0]);
        setIcon(ICONS[0]);
      }
    }
  }, [open, editingCategory]);

  async function save() {
    if (!name.trim()) return toast.error("Category name is required");
    setSaving(true);

    if (isEdit) {
      const { error } = await supabase
        .from("categories")
        .update({ name: name.trim(), kind, color, icon })
        .eq("id", editingCategory!.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Category updated!");
    } else {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setSaving(false); return; }
      const { error } = await supabase.from("categories").insert({
        user_id: u.user.id,
        name: name.trim(),
        kind,
        color,
        icon,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Category created!");
    }

    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg flex flex-col max-h-[90vh] sm:max-h-[600px] p-0 z-[90] overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="font-serif">{isEdit ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 thin-scroll">
          {/* Name + Kind row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Rickshaw"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
            </div>
            <div>
              <Label htmlFor="cat-kind">Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                <SelectTrigger id="cat-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Icon picker */}
          <div>
            <Label>Icon <span className="text-muted-foreground font-normal text-xs ml-1">— scroll to see all</span></Label>
            <IconPicker value={icon} onChange={setIcon} />
          </div>

          {/* Color picker */}
          <div>
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {/* Live preview */}
          <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-3">
            <span
              className="h-10 w-10 rounded-full flex items-center justify-center text-xl flex-shrink-0 shadow-sm"
              style={{ background: color + "33", border: `2px solid ${color}55` }}
            >
              {icon}
            </span>
            <div>
              <p className="font-semibold text-sm">{name || "Category name"}</p>
              <p className="text-xs text-muted-foreground capitalize">{kind}</p>
            </div>
            <span className="ml-auto h-3 w-3 rounded-full flex-shrink-0" style={{ background: color }} />
          </div>
        </div>

        <DialogFooter className="p-4 border-t gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? "Save changes" : "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Category Card ────────────────────────────────────────────────────────────

function CategoryCard({
  cat,
  onEdit,
  onDelete,
}: {
  cat: Category;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-3 group relative transition-shadow hover:shadow-md"
    >
      <span
        className="h-10 w-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
        style={{ background: cat.color + "22" }}
      >
        {cat.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{cat.name}</p>
        <p className="text-xs text-muted-foreground capitalize">{cat.kind}</p>
      </div>
      {/* Action buttons on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={onEdit}
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors"
          title="Edit category"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Delete category"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function CategoriesPage() {
  const qc = useQueryClient();
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: api.listCategories,
  });

  const [newOpen, setNewOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);

  const incomeCategories = categories.filter((c) => c.kind === "income");
  const expenseCategories = categories.filter((c) => c.kind === "expense");

  function refresh() {
    qc.invalidateQueries({ queryKey: ["categories"] });
  }

  async function remove(id: string, catName: string) {
    if (!confirm(`Delete "${catName}"? Transactions using this category will become uncategorized.`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
    toast.success("Category deleted");
  }

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Organize</p>
          <h1 className="mt-1 font-serif text-4xl">Categories</h1>
        </div>
        <Button id="new-category-btn" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New category
        </Button>
      </div>

      {/* New category dialog */}
      <CategoryFormDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onSaved={refresh}
      />

      {/* Edit category dialog */}
      <CategoryFormDialog
        open={!!editCategory}
        onOpenChange={(v) => { if (!v) setEditCategory(null); }}
        editingCategory={editCategory}
        onSaved={refresh}
      />

      {isLoading && <p className="text-muted-foreground animate-pulse">Loading categories…</p>}

      {/* Expense categories */}
      <section>
        <h2 className="font-serif text-2xl mb-3">
          Expense
          <span className="ml-2 text-base font-sans text-muted-foreground font-normal">({expenseCategories.length})</span>
        </h2>
        {expenseCategories.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground text-sm">
            No expense categories yet — create one above.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {expenseCategories.map((c) => (
              <CategoryCard
                key={c.id}
                cat={c}
                onEdit={() => setEditCategory(c)}
                onDelete={() => remove(c.id, c.name)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Income categories */}
      <section>
        <h2 className="font-serif text-2xl mb-3">
          Income
          <span className="ml-2 text-base font-sans text-muted-foreground font-normal">({incomeCategories.length})</span>
        </h2>
        {incomeCategories.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground text-sm">
            No income categories yet — create one above.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {incomeCategories.map((c) => (
              <CategoryCard
                key={c.id}
                cat={c}
                onEdit={() => setEditCategory(c)}
                onDelete={() => remove(c.id, c.name)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
