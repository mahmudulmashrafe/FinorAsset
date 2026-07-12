import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, fmtMoney } from "@/lib/finance";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { useMemo } from "react";
import { useUserProfile } from "@/hooks/use-user-profile";

export const Route = createFileRoute("/_authenticated/stats")({
  component: Stats,
  head: () => ({ meta: [{ title: "Stats — FinorAsset" }] }),
});

function Stats() {
  const { data: txns = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => api.listTransactions(2000) });
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: api.listCategories });

  const { currency } = useUserProfile();

  const catMap = new Map(cats.map(c => [c.id, c]));

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; income: number; expense: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, { month: d.toLocaleDateString(undefined, { month: "short" }), income: 0, expense: 0 });
    }
    for (const t of txns) {
      const d = new Date(t.occurred_on);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const row = map.get(key); if (!row) continue;
      if (t.kind === "income") row.income += Number(t.amount);
      else if (t.kind === "expense") row.expense += Number(t.amount);
    }
    return Array.from(map.values());
  }, [txns]);

  const now = new Date();
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txns) {
      const d = new Date(t.occurred_on);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
      if (t.kind !== "expense" || !t.category_id) continue;
      m.set(t.category_id, (m.get(t.category_id) ?? 0) + Number(t.amount));
    }
    return Array.from(m.entries()).map(([id, v]) => ({
      name: catMap.get(id)?.name ?? "Other", value: v, color: catMap.get(id)?.color ?? "#999",
    })).sort((a, b) => b.value - a.value);
  }, [txns, catMap]);

  const totalExp = byCat.reduce((s, x) => s + x.value, 0);

  return (
    <div className="space-y-5 w-full">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Insights</p>
        <h1 className="mt-1 font-serif text-3xl">Stats</h1>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-serif text-xl">Income vs Expense — 6 months</h2>
        <div className="h-60 mt-3">
          <ResponsiveContainer>
            <BarChart data={monthly}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} width={64} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="income" fill="var(--success)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="expense" fill="var(--accent)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-serif text-xl">Spending by category</h2>
          <p className="text-sm text-muted-foreground">This month · {fmtMoney(totalExp, currency)} total</p>
          <div className="h-60 mt-3">
            {byCat.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No expenses this month yet.</div>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byCat} dataKey="value" nameKey="name" outerRadius={90} innerRadius={55} paddingAngle={2}>
                    {byCat.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} formatter={(v: any) => fmtMoney(Number(v), currency)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-serif text-xl">Top categories</h2>
          <ul className="mt-3 divide-y">
            {byCat.slice(0, 8).map(c => (
              <li key={c.name} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: c.color }} />{c.name}</span>
                <span className="num font-serif">{fmtMoney(c.value, currency)}</span>
              </li>
            ))}
            {byCat.length === 0 && <li className="py-6 text-sm text-muted-foreground">No data.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
