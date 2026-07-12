import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, computeAccountBalances, fmtMoney, monthKey } from "@/lib/finance";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, ArrowRight, Zap, Target } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Link } from "@tanstack/react-router";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — FinorAsset" }] }),
});

function Dashboard() {
  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const { data: txns = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => api.listTransactions(1000) });
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: api.listCategories });
  const { data: budgets = [] } = useQuery({ queryKey: ["budgets", monthKey(new Date())], queryFn: () => api.listBudgets(monthKey(new Date())) });

  const { currency, profile } = useUserProfile();
  const displayName = profile?.display_name || "there";

  const balances = computeAccountBalances(accounts, txns);
  const net = Array.from(balances.values()).reduce((s, n) => s + n, 0);

  const now = new Date();
  const monthTxns = txns.filter((t) => {
    const d = new Date(t.occurred_on);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const income = monthTxns.filter(t => t.kind === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = monthTxns.filter(t => t.kind === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const savingsRate = income > 0 ? Math.max(0, Math.round(((income - expense) / income) * 100)) : 0;

  // Last 30 days cashflow
  const series: { day: string; net: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(now.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const dayTxns = txns.filter((t) => t.occurred_on === iso);
    const inc = dayTxns.filter(t => t.kind === "income").reduce((s, t) => s + Number(t.amount), 0);
    const exp = dayTxns.filter(t => t.kind === "expense").reduce((s, t) => s + Number(t.amount), 0);
    series.push({ day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), net: inc - exp });
  }

  // Top spending categories this month
  const expenseTxns = monthTxns.filter(t => t.kind === "expense");
  const catSpend = new Map<string, number>();
  for (const t of expenseTxns) {
    if (!t.category_id) continue;
    catSpend.set(t.category_id, (catSpend.get(t.category_id) ?? 0) + Number(t.amount));
  }
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const topCats = [...catSpend.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, amt]) => ({ cat: catMap.get(id), amt }))
    .filter(x => x.cat);

  const PIE_COLORS = ["#D97706", "#3B82F6", "#10B981", "#8B5CF6", "#EC4899"];

  // Budget health
  const budgetItems = budgets.map(b => {
    const spent = monthTxns
      .filter(t => t.kind === "expense" && t.category_id === b.category_id)
      .reduce((s, t) => s + Number(t.amount), 0);
    const pct = Math.min(100, income > 0 ? (spent / Number(b.amount)) * 100 : 0);
    const over = spent > Number(b.amount);
    return { b, spent, pct, over, cat: catMap.get(b.category_id) };
  }).slice(0, 3);

  const recent = txns.slice(0, 10);
  const accMap = new Map(accounts.map((a) => [a.id, a]));

  return (
    <div className="space-y-2.5">

      {/* ── KPI Cards ── */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Net Worth" value={fmtMoney(net, currency)} icon={Wallet} accent />
        <StatCard label="Income this month" value={fmtMoney(income, currency)} icon={TrendingUp} positive />
        <StatCard label="Expenses this month" value={fmtMoney(expense, currency)} icon={TrendingDown} negative />
        <div className="rounded-xl border bg-card py-2.5 px-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Savings Rate</p>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-1 font-serif text-2xl num">{savingsRate}%</p>
          <Progress value={savingsRate} className="mt-1.5 h-1.5" />
          <p className="mt-0.5 text-xs text-muted-foreground">of income saved</p>
        </div>
      </div>

      {/* ── Chart + Top Spending ── */}
      <div className="grid gap-2.5 lg:grid-cols-3">
        {/* Cashflow chart */}
        <section className="rounded-xl border bg-card p-3.5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-base font-bold">Last 30 days</h2>
              <p className="text-[10px] text-muted-foreground">Daily net cashflow</p>
            </div>
          </div>
          <div className="h-28 mt-1.5">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval={Math.floor(series.length / 5)} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={48} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 10 }} />
                <Line type="monotone" dataKey="net" stroke="var(--accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Top spending categories */}
        <section className="rounded-xl border bg-card p-3.5">
          <h2 className="font-serif text-base font-bold">Top Spending</h2>
          <p className="text-[10px] text-muted-foreground mb-1.5">This month by category</p>
          {topCats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 text-muted-foreground text-xs text-center gap-1.5">
              <Target className="h-7 w-7 opacity-40" />
              <p>No expense transactions yet</p>
            </div>
          ) : (
            <>
              <div className="h-20 mb-1.5">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={topCats} dataKey="amt" nameKey="cat.name" cx="50%" cy="50%" outerRadius={36} innerRadius={18}>
                      {topCats.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => fmtMoney(v, currency)}
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 10 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1 text-xs">
                {topCats.map(({ cat, amt }, i) => (
                  <li key={cat!.id} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="truncate">{cat!.icon} {cat!.name}</span>
                    </span>
                    <span className="font-serif num font-medium flex-shrink-0">{fmtMoney(amt, currency)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* ── Budget Health + Accounts + Recent ── */}
      <div className="grid gap-2.5 lg:grid-cols-3">
        {/* Budget health */}
        <section className="rounded-xl border bg-card p-3.5">
          <div className="flex items-center justify-between mb-1.5">
            <h2 className="font-serif text-base font-bold">Budget Health</h2>
            <Link to="/budgets" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
              All <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>
          {budgetItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 text-muted-foreground text-xs text-center gap-1.5">
              <PiggyBank className="h-7 w-7 opacity-40" />
              <p>No budgets set</p>
              <Link to="/budgets" className="text-xs text-accent hover:underline">Set a budget →</Link>
            </div>
          ) : (
            <ul className="space-y-2 overflow-y-auto max-h-[400px] pr-1.5 pb-1 thin-scroll text-xs">
              {budgetItems.map(({ b, spent, pct, over, cat }) => (
                <li key={b.id}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium flex items-center gap-1.5">
                      {cat?.icon} {cat?.name ?? "—"}
                    </span>
                    <span className={`font-mono text-[10px] ${over ? "text-destructive" : "text-muted-foreground"}`}>
                      {fmtMoney(spent, currency)} / {fmtMoney(Number(b.amount), currency)}
                    </span>
                  </div>
                  <Progress value={pct} className={`h-1.5 ${over ? "[&>div]:bg-destructive" : ""}`} />
                  {over && <p className="text-[10px] text-destructive mt-0.5 leading-none">Over by {fmtMoney(spent - Number(b.amount), currency)}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Accounts */}
        <section className="rounded-xl border bg-card p-3.5">
          <div className="flex items-center justify-between mb-1.5">
            <h2 className="font-serif text-base font-bold">Accounts</h2>
            <Link to="/accounts" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
              All <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>
          <ul className="divide-y overflow-y-auto max-h-[400px] pr-2 pb-1 thin-scroll text-xs">
            {accounts.length === 0 && (
              <li className="py-4 text-xs text-muted-foreground text-center">
                No accounts yet.{" "}
                <Link to="/accounts" className="text-accent hover:underline">Add one →</Link>
              </li>
            )}
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: a.color }} />
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{a.type}</div>
                  </div>
                </div>
                <div className="num font-serif text-xs">{fmtMoney(balances.get(a.id) ?? 0, currency)}</div>
              </li>
            ))}
          </ul>
        </section>

        {/* Recent activity */}
        <section className="rounded-xl border bg-card p-3.5">
          <div className="flex items-center justify-between mb-1.5">
            <h2 className="font-serif text-base font-bold">Recent</h2>
            <Link to="/transactions" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
              All <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>
          <ul className="divide-y overflow-y-auto max-h-[400px] pr-2 pb-1 thin-scroll text-xs">
            {recent.length === 0 && (
              <li className="py-4 text-xs text-muted-foreground text-center">No transactions yet.</li>
            )}
            {recent.map((t) => {
              const cat = t.category_id ? catMap.get(t.category_id) : null;
              const acc = accMap.get(t.account_id);
              const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "↔";
              const color = t.kind === "income" ? "text-[color:var(--success)]" : t.kind === "expense" ? "text-[color:var(--destructive)]" : "text-muted-foreground";
              return (
                <li key={t.id} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {cat?.icon && <span className="text-sm flex-shrink-0">{cat.icon}</span>}
                    <div className="min-w-0">
                      <div className="truncate max-w-[90px] font-medium">{cat?.name ?? (t.kind === "transfer" ? "Transfer" : "Uncategorized")}</div>
                      <div className="text-[9px] text-muted-foreground truncate">{acc?.name} · {new Date(t.occurred_on).toLocaleDateString(undefined, {month: "numeric", day: "numeric"})}</div>
                    </div>
                  </div>
                  <div className={`num font-serif text-xs flex-shrink-0 ${color}`}>{sign}{fmtMoney(Number(t.amount), currency)}</div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent, positive, negative }: {
  label: string; value: string; icon: React.ElementType;
  accent?: boolean; positive?: boolean; negative?: boolean;
}) {
  const color = positive ? "text-[color:var(--success)]" : negative ? "text-[color:var(--destructive)]" : "";
  return (
    <div className="rounded-xl border bg-card py-2.5 px-3.5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className={`mt-1 font-serif text-2xl num ${color}`}>{value}</p>
    </div>
  );
}
