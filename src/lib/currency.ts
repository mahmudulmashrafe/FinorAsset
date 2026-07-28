import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const FALLBACK_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.78,
  BDT: 120.5,
  INR: 83.5,
  CAD: 1.36,
  AUD: 1.52,
  JPY: 155.0,
};

const STORAGE_KEY = "finor_exchange_rates_cache_v1";

export interface ExchangeRatesData {
  base: string;
  rates: Record<string, number>;
  timestamp: number;
}

export async function fetchExchangeRates(): Promise<Record<string, number>> {
  // Try loading from localStorage first if cached within 12 hours
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed: ExchangeRatesData = JSON.parse(cached);
        const twelveHoursInMs = 12 * 60 * 60 * 1000;
        if (Date.now() - parsed.timestamp < twelveHoursInMs && parsed.rates) {
          return { ...FALLBACK_RATES, ...parsed.rates };
        }
      }
    } catch {}
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) throw new Error("Failed to fetch exchange rates");
    const json = await res.json();
    if (json && json.rates) {
      const rates = json.rates as Record<string, number>;
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              base: "USD",
              rates,
              timestamp: Date.now(),
            })
          );
        } catch {}
      }
      return { ...FALLBACK_RATES, ...rates };
    }
  } catch (err) {
    console.warn("Exchange rate fetch error, using fallback rates:", err);
  }

  return FALLBACK_RATES;
}

export function useExchangeRates() {
  return useQuery({
    queryKey: ["exchange-rates"],
    queryFn: fetchExchangeRates,
    staleTime: 12 * 60 * 60 * 1000, // 12 hours
    gcTime: 24 * 60 * 60 * 1000,
  });
}

/**
 * Convert an amount from one currency to another using the provided rates dictionary.
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string | null | undefined,
  toCurrency: string | null | undefined,
  rates: Record<string, number> = FALLBACK_RATES
): number {
  if (!amount || isNaN(amount)) return 0;
  const from = (fromCurrency || "USD").toUpperCase();
  const to = (toCurrency || "USD").toUpperCase();
  if (from === to) return amount;

  const fromRate = rates[from] || FALLBACK_RATES[from] || 1;
  const toRate = rates[to] || FALLBACK_RATES[to] || 1;

  // Convert from `fromCurrency` to USD, then from USD to `toCurrency`
  const amountInUsd = amount / fromRate;
  return amountInUsd * toRate;
}

/**
 * Automatically convert all existing user record amounts in Supabase & LocalStorage when profile currency is updated.
 */
export async function convertAllUserFinancialRecords(
  userId: string,
  fromCurr: string,
  toCurr: string
): Promise<number> {
  if (!userId || !fromCurr || !toCurr || fromCurr.toUpperCase() === toCurr.toUpperCase()) return 1;

  const rates = await fetchExchangeRates();
  const multiplier = convertCurrency(1, fromCurr, toCurr, rates);

  if (Math.abs(multiplier - 1) < 0.0001) return 1;

  try {
    // 1. Convert Accounts
    const { data: accs } = await supabase.from("accounts").select("id, starting_balance").eq("user_id", userId);
    if (accs && accs.length > 0) {
      for (const a of accs) {
        await supabase
          .from("accounts")
          .update({
            starting_balance: Math.round(Number(a.starting_balance) * multiplier * 100) / 100,
            currency: toCurr.toUpperCase(),
          })
          .eq("id", a.id);
      }
    }

    // 2. Convert Transactions
    const { data: txs } = await supabase.from("transactions").select("id, amount").eq("user_id", userId);
    if (txs && txs.length > 0) {
      for (const t of txs) {
        await supabase
          .from("transactions")
          .update({
            amount: Math.round(Number(t.amount) * multiplier * 100) / 100,
          })
          .eq("id", t.id);
      }
    }

    // 3. Convert Loans
    const { data: lns } = await supabase.from("loans").select("id, amount").eq("user_id", userId);
    if (lns && lns.length > 0) {
      for (const l of lns) {
        await supabase
          .from("loans")
          .update({
            amount: Math.round(Number(l.amount) * multiplier * 100) / 100,
          })
          .eq("id", l.id);
      }
    }

    // Sync local storage loans cache
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("finorasset_loans");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const updated = parsed.map((l: any) => ({
              ...l,
              amount: Math.round(Number(l.amount) * multiplier * 100) / 100,
            }));
            localStorage.setItem("finorasset_loans", JSON.stringify(updated));
          }
        }
      } catch {}
    }

    // 4. Convert Budgets
    const { data: bdgs } = await supabase.from("budgets").select("id, amount").eq("user_id", userId);
    if (bdgs && bdgs.length > 0) {
      for (const b of bdgs) {
        await supabase
          .from("budgets")
          .update({
            amount: Math.round(Number(b.amount) * multiplier * 100) / 100,
          })
          .eq("id", b.id);
      }
    }

    // 5. Convert Warranties
    const { data: wrns } = await supabase.from("warranties" as any).select("id, amount").eq("user_id", userId);
    if (wrns && wrns.length > 0) {
      for (const w of wrns) {
        await supabase
          .from("warranties" as any)
          .update({
            amount: Math.round(Number(w.amount) * multiplier * 100) / 100,
          })
          .eq("id", w.id);
      }
    }

    // 6. Convert Subscriptions
    const { data: subs } = await supabase.from("subscriptions").select("id, amount").eq("user_id", userId);
    if (subs && subs.length > 0) {
      for (const s of subs) {
        await supabase
          .from("subscriptions")
          .update({
            amount: Math.round(Number(s.amount) * multiplier * 100) / 100,
          })
          .eq("id", s.id);
      }
    }

    // 7. Convert Local Automations / Macros
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("finorasset_automations");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const updated = parsed.map((rule: any) => ({
              ...rule,
              actions: (rule.actions || []).map((act: any) => ({
                ...act,
                amount: Math.round(Number(act.amount) * multiplier * 100) / 100,
              })),
            }));
            localStorage.setItem("finorasset_automations", JSON.stringify(updated));
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error("Error performing database currency conversion:", err);
  }

  return multiplier;
}
