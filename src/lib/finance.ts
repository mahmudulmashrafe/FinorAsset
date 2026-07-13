import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Account = Database["public"]["Tables"]["accounts"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
export type Budget = Database["public"]["Tables"]["budgets"]["Row"];
export type TxnKind = "income" | "expense" | "transfer";

export function fmtMoney(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function monthKey(d: Date | string) {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-01`;
}

export const api = {
  async listAccounts() {
    const { data, error } = await supabase.from("accounts").select("*").order("created_at");
    if (error) throw error;
    return data as Account[];
  },
  async listCategories() {
    const { data, error } = await supabase.from("categories").select("*").order("name");
    if (error) throw error;
    return data as Category[];
  },
  async listTransactions(limit = 500) {
    const { data, error } = await supabase
      .from("transactions").select("*")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data as Transaction[];
  },
  async listBudgets(period: string) {
    const { data, error } = await supabase.from("budgets").select("*").eq("period_month", period);
    if (error) throw error;
    return data as Budget[];
  },
};

export function computeAccountBalances(accounts: Account[], txns: Transaction[]) {
  const map = new Map<string, number>();
  for (const a of accounts) map.set(a.id, Number(a.starting_balance));
  for (const t of txns) {
    const amt = Number(t.amount);
    if (t.kind === "income") map.set(t.account_id, (map.get(t.account_id) ?? 0) + amt);
    else if (t.kind === "expense") map.set(t.account_id, (map.get(t.account_id) ?? 0) - amt);
    else if (t.kind === "transfer") {
      map.set(t.account_id, (map.get(t.account_id) ?? 0) - amt);
      if (t.to_account_id) map.set(t.to_account_id, (map.get(t.to_account_id) ?? 0) + amt);
    }
  }
  return map;
}

export async function syncTransactionToLoan(action: "update" | "delete", txn: Transaction, nextAmt?: number) {
  const noteStr = txn.note ?? "";
  let personName = "";
  let isRepayment = false;
  let isLoanInitial = false;

  if (noteStr.startsWith("Loan: Borrowed from ")) {
    personName = noteStr.replace("Loan: Borrowed from ", "").split("(")[0].trim();
    isLoanInitial = true;
  } else if (noteStr.startsWith("Loan: Lent to ")) {
    personName = noteStr.replace("Loan: Lent to ", "").split("(")[0].trim();
    isLoanInitial = true;
  } else if (noteStr.startsWith("Repayment: ")) {
    personName = noteStr.replace("Repayment: ", "").split("(")[0].trim();
    isRepayment = true;
  }

  if (!personName) return;

  const { data: matchedLoans } = await supabase
    .from("loans")
    .select("*")
    .eq("person_name", personName)
    .eq("user_id", txn.user_id);

  if (!matchedLoans || matchedLoans.length === 0) return;
  const matchedLoan = matchedLoans[0];

  if (action === "delete") {
    if (isLoanInitial) {
      await supabase.from("loans").delete().eq("id", matchedLoan.id);
    } else if (isRepayment) {
      await supabase.from("loans").update({ status: "active" }).eq("id", matchedLoan.id);
    }
  } else if (action === "update" && nextAmt !== undefined) {
    if (isLoanInitial) {
      await supabase.from("loans").update({ amount: nextAmt }).eq("id", matchedLoan.id);
    }
  }
}

