import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, computeAccountBalances, fmtMoney, monthKey } from "@/lib/finance";
import { TransactionDialog } from "@/components/transaction-dialog";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, ArrowRight, Zap, Target } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Link } from "@tanstack/react-router";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — FinorAsset" }] }),
});

function greet(name: string) {
  const h = new Date().getHours();
  const salutation = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${salutation}, ${name}.`;
}

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

  const recent = txns.slice(0, 4);
  const accMap = new Map(accounts.map((a) => [a.id, a]));

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5 flex-wrap">
            <span>Summary</span>
            <span className="md:hidden text-muted-foreground/60 font-sans tracking-normal">&middot;</span>
            <span className="md:hidden text-muted-foreground/80 font-sans normal-case tracking-normal">{greet(displayName)}</span>
          </p>
          <h1 className="mt-1 font-serif text-3xl">Overview</h1>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Net Worth" value={fmtMoney(net, currency)} icon={Wallet} accent />
        <StatCard label="Income this month" value={fmtMoney(income, currency)} icon={TrendingUp} positive />
        <StatCard label="Expenses this month" value={fmtMoney(expense, currency)} icon={TrendingDown} negative />
        <div className="rounded-xl border bg-card py-4 px-5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Savings Rate</p>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 font-serif text-3xl num">{savingsRate}%</p>
          <Progress value={savingsRate} className="mt-2.5 h-1.5" />
          <p className="mt-1 text-xs text-muted-foreground">of income saved</p>
        </div>
      </div>

      {/* ── Chart + Top Spending ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Cashflow chart */}
        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-2xl">Last 30 days</h2>
              <p className="text-xs text-muted-foreground">Daily net cashflow</p>
            </div>
          </div>
          <div className="h-44 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} interval={Math.floor(series.length / 5)} />
                <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} width={52} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="net" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Top spending categories */}
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-serif text-2xl">Top Spending</h2>
          <p className="text-xs text-muted-foreground mb-3">This month by category</p>
          {topCats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-36 text-muted-foreground text-sm text-center gap-2">
              <Target className="h-8 w-8 opacity-40" />
              <p>No expense transactions yet</p>
            </div>
          ) : (
            <>
              <div className="h-28 mb-3">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={topCats} dataKey="amt" nameKey="cat.name" cx="50%" cy="50%" outerRadius={45} innerRadius={22}>
                      {topCats.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => fmtMoney(v, currency)}
                      contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1.5">
                {topCats.map(({ cat, amt }, i) => (
                  <li key={cat!.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="truncate">{cat!.icon} {cat!.name}</span>
                    </span>
                    <span className="font-serif num text-sm font-medium flex-shrink-0">{fmtMoney(amt, currency)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* ── Budget Health + Accounts + Recent ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Budget health */}
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-2xl">Budget Health</h2>
            <Link to="/budgets" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {budgetItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm text-center gap-2">
              <PiggyBank className="h-8 w-8 opacity-40" />
              <p>No budgets set</p>
              <Link to="/budgets" className="text-xs text-accent hover:underline">Set a budget →</Link>
            </div>
          ) : (
            <ul className="space-y-3.5 overflow-y-auto max-h-[190px] pr-2 pb-2 thin-scroll">
              {budgetItems.map(({ b, spent, pct, over, cat }) => (
                <li key={b.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium flex items-center gap-2">
                      {cat?.icon} {cat?.name ?? "—"}
                    </span>
                    <span className={`text-xs font-mono ${over ? "text-destructive" : "text-muted-foreground"}`}>
                      {fmtMoney(spent, currency)} / {fmtMoney(Number(b.amount), currency)}
                    </span>
                  </div>
                  <Progress value={pct} className={`h-2 ${over ? "[&>div]:bg-destructive" : ""}`} />
                  {over && <p className="text-xs text-destructive mt-1 leading-none">Over by {fmtMoney(spent - Number(b.amount), currency)}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Accounts */}
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-2xl">Accounts</h2>
            <Link to="/accounts" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="divide-y overflow-y-auto max-h-[190px] pb-2 thin-scroll">
            {accounts.length === 0 && (
              <li className="py-6 text-sm text-muted-foreground text-center">
                No accounts yet.{" "}
                <Link to="/accounts" className="text-accent hover:underline">Add one →</Link>
              </li>
            )}
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: a.color }} />
                  <div>
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">{a.type}</div>
                  </div>
                </div>
                <div className="num font-serif text-base">{fmtMoney(balances.get(a.id) ?? 0, currency)}</div>
              </li>
            ))}
          </ul>
        </section>

        {/* Recent activity */}
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-2xl">Recent</h2>
            <Link to="/transactions" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="divide-y overflow-y-auto max-h-[190px] pb-2 thin-scroll">
            {recent.length === 0 && (
              <li className="py-6 text-sm text-muted-foreground text-center">No transactions yet.</li>
            )}
            {recent.map((t) => {
              const cat = t.category_id ? catMap.get(t.category_id) : null;
              const acc = accMap.get(t.account_id);
              const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "↔";
              const color = t.kind === "income" ? "text-[color:var(--success)]" : t.kind === "expense" ? "text-[color:var(--destructive)]" : "text-muted-foreground";
              return (
                <li key={t.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {cat?.icon && <span className="text-base flex-shrink-0">{cat.icon}</span>}
                    <div className="min-w-0">
                      <div className="text-sm truncate max-w-[110px]">{cat?.name ?? (t.kind === "transfer" ? "Transfer" : "Uncategorized")}</div>
                      <div className="text-xs text-muted-foreground truncate">{acc?.name} · {new Date(t.occurred_on).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className={`num font-serif text-base flex-shrink-0 ${color}`}>{sign}{fmtMoney(Number(t.amount), currency)}</div>
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
    <div className="rounded-xl border bg-card py-4 px-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className={`mt-2 font-serif text-2xl num ${color}`}>{value}</p>
    </div>
  );
}

