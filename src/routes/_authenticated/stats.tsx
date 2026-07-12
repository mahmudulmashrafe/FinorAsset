import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, fmtMoney } from "@/lib/finance";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { useMemo, useState } from "react";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/stats")({
  component: Stats,
  head: () => ({ meta: [{ title: "Stats — FinorAsset" }] }),
});

function Stats() {
  const { data: txns = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => api.listTransactions(2000) });
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: api.listCategories });
  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });

  const { currency } = useUserProfile();

  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>(currentMonthKey);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const catMap = new Map(cats.map(c => [c.id, c]));

  const monthOptions = useMemo(() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      list.push({ value, label });
    }
    return list;
  }, []);

  const filteredTxns = useMemo(() => {
    return txns.filter(t => {
      if (accountFilter !== "all" && t.account_id !== accountFilter) return false;
      return true;
    });
  }, [txns, accountFilter]);

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; income: number; expense: number }>();
    const [yr, mn] = monthFilter.split("-").map(Number);
    const endDate = new Date(yr, mn - 1, 1);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(endDate.getFullYear(), endDate.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, { month: d.toLocaleDateString(undefined, { month: "short" }), income: 0, expense: 0 });
    }
    for (const t of filteredTxns) {
      const d = new Date(t.occurred_on);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const row = map.get(key); if (!row) continue;
      if (t.kind === "income") row.income += Number(t.amount);
      else if (t.kind === "expense") row.expense += Number(t.amount);
    }
    return Array.from(map.values());
  }, [filteredTxns, monthFilter]);

  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    const [yr, mn] = monthFilter.split("-").map(Number);
    for (const t of filteredTxns) {
      const d = new Date(t.occurred_on);
      if (d.getMonth() !== (mn - 1) || d.getFullYear() !== yr) continue;
      if (t.kind !== "expense" || !t.category_id) continue;
      m.set(t.category_id, (m.get(t.category_id) ?? 0) + Number(t.amount));
    }
    return Array.from(m.entries()).map(([id, v]) => ({
      name: catMap.get(id)?.name ?? "Other", value: v, color: catMap.get(id)?.color ?? "#999",
    })).sort((a, b) => b.value - a.value);
  }, [filteredTxns, monthFilter, catMap]);

  const totalExp = byCat.reduce((s, x) => s + x.value, 0);

  const filtersContent = (
    <>
      <div className="flex flex-col gap-1.5 flex-1 min-w-[150px]">
        <label className="text-[10px] font-serif font-bold text-muted-foreground uppercase tracking-wider">Account</label>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-full bg-background"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5 flex-1 min-w-[150px]">
        <label className="text-[10px] font-serif font-bold text-muted-foreground uppercase tracking-wider">Month</label>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-full bg-background"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[100]">
            {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </>
  );

  return (
    <div className="space-y-3 w-full">
      {/* Desktop Filters (inline, side-by-side, compact h-8) */}
      <div className="hidden md:flex flex-wrap items-center gap-4 rounded-xl border bg-card p-2 px-3">
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-serif font-bold text-muted-foreground uppercase tracking-wider">Account</label>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-36 h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[100]">
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-serif font-bold text-muted-foreground uppercase tracking-wider">Month</label>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-40 h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[100]">
              {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mobile Filters Trigger */}
      <div className="md:hidden flex items-center justify-between gap-3">
        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer bg-card border">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filters</span>
              {(accountFilter !== "all" || monthFilter !== currentMonthKey) && (
                <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[90vw] rounded-xl z-[99]">
            <DialogHeader>
              <DialogTitle className="font-serif">Filter Stats</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-3">
              {filtersContent}
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setFiltersOpen(false)} className="text-xs font-bold cursor-pointer">
                Apply Filters
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <section className="rounded-xl border bg-card p-3">
        <h2 className="font-serif text-base font-bold">Income vs Expense — 6 months</h2>
        <div className="h-48 mt-1.5">
          <ResponsiveContainer>
            <BarChart data={monthly}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={56} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="income" fill="var(--success)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-3">
          <h2 className="font-serif text-base font-bold">Spending by category</h2>
          <p className="text-[10px] text-muted-foreground font-serif">This month · {fmtMoney(totalExp, currency)} total</p>
          <div className="h-48 mt-1.5">
            {byCat.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No expenses this month yet.</div>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byCat} dataKey="value" nameKey="name" outerRadius={90} innerRadius={55} paddingAngle={2}>
                    {byCat.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} formatter={(v: any) => fmtMoney(Number(v), currency)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-3">
          <h2 className="font-serif text-base font-bold">Top categories</h2>
          <ul className="mt-1.5 divide-y text-xs">
            {byCat.slice(0, 6).map(c => (
              <li key={c.name} className="flex items-center justify-between py-1">
                <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />{c.name}</span>
                <span className="num font-serif font-bold">{fmtMoney(c.value, currency)}</span>
              </li>
            ))}
            {byCat.length === 0 && <li className="py-4 text-xs text-muted-foreground text-center">No data.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
