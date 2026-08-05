import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fmtMoney, type Transaction, syncTransactionToLoan, isAccountIncludedInNetWorth } from "@/lib/finance";
import { TransactionDialog } from "@/components/transaction-dialog";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState, Fragment, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Pencil, SlidersHorizontal, Plus, Calendar, Layers, Eye, ChevronDown, ChevronRight, ChevronUp, Ungroup, MoveRight, MoreVertical, X } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
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

export interface EventGroup {
  eventId: string;
  eventTitle: string;
  date: string;
  items: Transaction[];
  totalAmount: number;
}

export type DisplayRowItem =
  | { type: "single"; txn: Transaction }
  | { type: "event"; group: EventGroup };

export function parseEventNote(note: string | null) {
  if (!note || !note.startsWith("[Event: ")) return null;
  const match = note.match(/^\[Event:\s*(.*?)\|id:(.*?)\]\s*(.*)$/);
  if (!match) return null;
  return {
    eventTitle: match[1],
    eventId: match[2],
    itemNote: match[3],
  };
}

function safeDateStr(d: any): string {
  if (!d) return "";
  const s = String(d);
  if (s.length >= 10 && s.includes("-")) return s.slice(0, 10);
  try {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

export const EVENT_COLOR_THEMES = [
  {
    // 1: Amber / Gold
    headerBg: "bg-amber-500/10 dark:bg-amber-500/15",
    headerHover: "hover:bg-amber-500/15 dark:hover:bg-amber-500/20",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    iconBg: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    subBorder: "border-amber-500/70 dark:border-amber-400/70",
    subBg: "bg-amber-500/[0.04] dark:bg-amber-500/[0.08]",
    subHover: "hover:bg-amber-500/[0.08] dark:hover:bg-amber-500/[0.12]",
    mobileCardBorder: "border-amber-500/30 dark:border-amber-500/40",
  },
  {
    // 2: Indigo / Blue
    headerBg: "bg-indigo-500/10 dark:bg-indigo-500/15",
    headerHover: "hover:bg-indigo-500/15 dark:hover:bg-indigo-500/20",
    badge: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
    iconBg: "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300",
    subBorder: "border-indigo-500/70 dark:border-indigo-400/70",
    subBg: "bg-indigo-500/[0.04] dark:bg-indigo-500/[0.08]",
    subHover: "hover:bg-indigo-500/[0.08] dark:hover:bg-indigo-500/[0.12]",
    mobileCardBorder: "border-indigo-500/30 dark:border-indigo-500/40",
  },
  {
    // 3: Emerald / Green
    headerBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
    headerHover: "hover:bg-emerald-500/15 dark:hover:bg-emerald-500/20",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    iconBg: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    subBorder: "border-emerald-500/70 dark:border-emerald-400/70",
    subBg: "bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08]",
    subHover: "hover:bg-emerald-500/[0.08] dark:hover:bg-emerald-500/[0.12]",
    mobileCardBorder: "border-emerald-500/30 dark:border-emerald-500/40",
  },
  {
    // 4: Violet / Purple
    headerBg: "bg-violet-500/10 dark:bg-violet-500/15",
    headerHover: "hover:bg-violet-500/15 dark:hover:bg-violet-500/20",
    badge: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
    iconBg: "bg-violet-500/20 text-violet-700 dark:text-violet-300",
    subBorder: "border-violet-500/70 dark:border-violet-400/70",
    subBg: "bg-violet-500/[0.04] dark:bg-violet-500/[0.08]",
    subHover: "hover:bg-violet-500/[0.08] dark:hover:bg-violet-500/[0.12]",
    mobileCardBorder: "border-violet-500/30 dark:border-violet-500/40",
  },
];

export function getEventTheme(eventId: string, themeMap?: Map<string, typeof EVENT_COLOR_THEMES[number]>) {
  if (themeMap && themeMap.has(eventId)) {
    return themeMap.get(eventId)!;
  }
  let hash = 0;
  for (let i = 0; i < eventId.length; i++) {
    hash = (hash << 5) - hash + eventId.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % EVENT_COLOR_THEMES.length;
  return EVENT_COLOR_THEMES[idx];
}

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TxnsPage,
  head: () => ({ meta: [{ title: "Transactions — FinorAsset" }] }),
});

function TxnsPage() {
  const qc = useQueryClient();
  const { data: txns = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => api.listTransactions(1000) });
  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const { data: cats = [] } = useQuery({ queryKey: ["categories"], queryFn: api.listCategories });
  const { currency } = useUserProfile();

  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [account, setAccount] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  function formatDateStr(y: number, m: number, d: number) {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function handleYearMonthChange(yr: string, mn: string) {
    setSelectedYear(yr);
    setSelectedMonth(mn);
    setMonthFilter("all");
    
    if (yr === "all" && mn === "all") {
      setStartDate("");
      setEndDate("");
      return;
    }
    
    const targetYr = yr === "all" ? new Date().getFullYear() : Number(yr);
    
    if (mn !== "all") {
      const mnNum = Number(mn);
      const lastDay = new Date(targetYr, mnNum, 0).getDate();
      setStartDate(formatDateStr(targetYr, mnNum, 1));
      setEndDate(formatDateStr(targetYr, mnNum, lastDay));
    } else {
      setStartDate(`${targetYr}-01-01`);
      setEndDate(`${targetYr}-12-31`);
    }
  }

  function applyPreset(preset: "today" | "this_month" | "last_month" | "this_year" | "all") {
    const now = new Date();
    setMonthFilter("all");
    if (preset === "all") {
      setSelectedYear("all");
      setSelectedMonth("all");
      setStartDate("");
      setEndDate("");
    } else if (preset === "today") {
      const todayStr = formatDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate());
      setSelectedYear(String(now.getFullYear()));
      setSelectedMonth(String(now.getMonth() + 1).padStart(2, "0"));
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "this_month") {
      handleYearMonthChange(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"));
    } else if (preset === "last_month") {
      const lastM = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      handleYearMonthChange(String(lastM.getFullYear()), String(lastM.getMonth() + 1).padStart(2, "0"));
    } else if (preset === "this_year") {
      handleYearMonthChange(String(now.getFullYear()), "all");
    }
  }
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [showBatchDateChange, setShowBatchDateChange] = useState(false);
  const [batchNewDate, setBatchNewDate] = useState("");
  const [batchDateLoading, setBatchDateLoading] = useState(false);
  const [showBatchEventGroup, setShowBatchEventGroup] = useState(false);
  const [batchEventTitle, setBatchEventTitle] = useState("");
  const [batchEventLoading, setBatchEventLoading] = useState(false);

  const [selectedEventGroup, setSelectedEventGroup] = useState<EventGroup | null>(null);
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);
  const [editingEventGroup, setEditingEventGroup] = useState<EventGroup | null>(null);
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());
  const [sameDateRanks, setSameDateRanks] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem("finorasset_same_date_ranks") || "{}");
    } catch {
      return {};
    }
  });

  // Per-event "Manage Records" mode — activated by 1-sec long-press on any record
  const [managingEventId, setManagingEventId] = useState<string | null>(null);
  const eventItemPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isEventItemLongPressActive = useRef(false);

  function startEventItemPress(eventId: string) {
    isEventItemLongPressActive.current = false;
    if (eventItemPressTimerRef.current) clearTimeout(eventItemPressTimerRef.current);
    eventItemPressTimerRef.current = setTimeout(() => {
      isEventItemLongPressActive.current = true;
      setManagingEventId(prev => prev === eventId ? null : eventId);
      if (typeof navigator !== "undefined" && navigator.vibrate) { try { navigator.vibrate(80); } catch {} }
      toast.success(managingEventId === eventId ? "Manage mode off" : "Manage mode on — tap Up/Down/Degroup/Shift");
    }, 1000);
  }

  function cancelEventItemPress() {
    if (eventItemPressTimerRef.current) { clearTimeout(eventItemPressTimerRef.current); eventItemPressTimerRef.current = null; }
  }

  // Shift-to-event state
  const [shiftingTxn, setShiftingTxn] = useState<Transaction | null>(null);
  const [shiftTargetEventId, setShiftTargetEventId] = useState("");
  const [shiftLoading, setShiftLoading] = useState(false);

  async function reorderEventItem(grp: EventGroup, txnId: string, direction: "up" | "down") {
    const items = [...grp.items];
    const idx = items.findIndex(i => i.id === txnId);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;

    // Restrict reordering to items with the same date
    const currentDateStr = safeDateStr(items[idx].occurred_on);
    const targetDateStr = safeDateStr(items[targetIdx].occurred_on);
    if (currentDateStr !== targetDateStr) {
      toast.error("Can only reorder records with the same date");
      return;
    }

    // Swap items
    [items[idx], items[targetIdx]] = [items[targetIdx], items[idx]];

    // Assign timestamps so DB/display ordering matches (newest first = top item)
    const baseNow = Date.now();
    const updatesMap = new Map<string, string>();
    for (let i = 0; i < items.length; i++) {
      const newTs = new Date(baseNow + (items.length - 1 - i) * 10).toISOString();
      updatesMap.set(items[i].id, newTs);
    }

    // 1. Optimistically update TanStack Query cache for INSTANT UI re-render on 1st click
    qc.setQueryData<Transaction[]>(["transactions"], (old = []) => {
      return old.map(t => {
        const newTs = updatesMap.get(t.id);
        return newTs ? { ...t, created_at: newTs } : t;
      });
    });

    toast.success(`Record moved ${direction}`);

    // 2. Persist order changes to Supabase in the background
    for (const [id, newTs] of updatesMap.entries()) {
      const { error } = await supabase.from("transactions").update({ created_at: newTs }).eq("id", id);
      if (error) {
        toast.error(`Reorder sync error: ${error.message}`);
        refresh();
        return;
      }
    }
  }

  async function degroupRecord(txn: Transaction) {
    const parsed = parseEventNote(txn.note);
    if (!parsed) return;
    const cleanNote = parsed.itemNote || null;
    const { error } = await supabase.from("transactions").update({ note: cleanNote }).eq("id", txn.id);
    if (error) return toast.error(error.message);
    await syncTransactionToLoan("update", { ...txn, note: cleanNote });
    toast.success("Record removed from event — now a standalone transaction");
    refresh();
    qc.invalidateQueries({ queryKey: ["loans"] });
  }

  async function shiftRecordToEvent() {
    if (!shiftingTxn || !shiftTargetEventId) return;
    setShiftLoading(true);
    try {
      // Find any txn in the target event to read its title
      const targetEventTxn = txns.find(t => t.note && t.note.includes(`|id:${shiftTargetEventId}]`));
      if (!targetEventTxn) throw new Error("Target event not found");
      const targetParsed = parseEventNote(targetEventTxn.note);
      if (!targetParsed) throw new Error("Could not parse target event");
      const currentParsed = parseEventNote(shiftingTxn.note);
      const itemNote = currentParsed?.itemNote || "";
      const newNote = `[Event: ${targetParsed.eventTitle}|id:${shiftTargetEventId}]${itemNote ? ` ${itemNote}` : ""}`.trim();
      const { error } = await supabase.from("transactions").update({ note: newNote }).eq("id", shiftingTxn.id);
      if (error) throw error;
      await syncTransactionToLoan("update", { ...shiftingTxn, note: newNote });
      toast.success(`Record shifted to "${targetParsed.eventTitle}"`);
      setShiftingTxn(null);
      setShiftTargetEventId("");
      refresh();
      qc.invalidateQueries({ queryKey: ["loans"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setShiftLoading(false);
    }
  }

  function saveSameDateRanks(newRanks: Record<string, number>) {
    setSameDateRanks(newRanks);
    if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
      localStorage.setItem("finorasset_same_date_ranks", JSON.stringify(newRanks));
    }
  }

  function toggleExpandEvent(eventId: string) {
    setExpandedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  const [reorderDate, setReorderDate] = useState<string | null>(null);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressActive = useRef(false);

  const startPress = (dateStr: string) => {
    isLongPressActive.current = false;
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      isLongPressActive.current = true;
      setReorderDate(prev => prev === dateStr ? null : dateStr);
      if (navigator.vibrate) {
        try {
          navigator.vibrate(100);
        } catch {}
      }
      toast.success(`Same-date reordering active for ${new Date(dateStr).toLocaleDateString()}`);
    }, 1000);
  };

  const cancelPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    };
  }, []);

  const catMap = useMemo(() => new Map(cats.map(c => [c.id, c])), [cats]);
  const accMap = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);

  const monthOptions = useMemo(() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; // e.g. "2026-07"
      const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" }); // e.g. "July 2026"
      list.push({ value, label });
    }
    return list;
  }, []);

  const dateLabel = useMemo(() => {
    if (startDate && endDate) {
      if (startDate === endDate) return `Date: ${startDate}`;
      return `${startDate} → ${endDate}`;
    }
    if (startDate) return `From: ${startDate}`;
    if (endDate) return `Until: ${endDate}`;
    if (monthFilter !== "all") {
      const m = monthOptions.find(o => o.value === monthFilter);
      return m ? m.label : monthFilter;
    }
    return "All Dates";
  }, [startDate, endDate, monthFilter, monthOptions]);

  const netWorthAccountIds = useMemo(() => {
    return new Set(accounts.filter(a => isAccountIncludedInNetWorth(a)).map(a => a.id));
  }, [accounts]);

  const accountOptions = useMemo(() => [
    { value: "all", label: "All accounts" },
    { value: "net_worth", label: "All Net Worth Accounts", icon: <span className="text-sm">🌐</span> },
    { value: "non_net_worth", label: "All Non Net Worth", icon: <span className="text-sm">🚫</span> },
    ...accounts.map(a => {
      const isNW = isAccountIncludedInNetWorth(a);
      return {
        value: a.id,
        label: a.name,
        icon: (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs">{isNW ? "🌐" : "🚫"}</span>
            {(a as any).image_url ? (
              <img src={(a as any).image_url} alt="" className="h-4 w-4 rounded-full object-cover shrink-0 border border-border/40" />
            ) : (
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: a.color }} />
            )}
          </div>
        )
      };
    })
  ], [accounts]);

  const filtered = useMemo(() => txns.filter(t => {
    if (kind !== "all" && t.kind !== kind) return false;
    
    // Account sub-filter (All, Net Worth, Non Net Worth, Specific Account)
    if (account === "net_worth") {
      if (!netWorthAccountIds.has(t.account_id)) return false;
    } else if (account === "non_net_worth") {
      if (netWorthAccountIds.has(t.account_id)) return false;
    } else if (account !== "all" && t.account_id !== account) {
      return false;
    }

    // Date Range (From -> To) or Month preset filter
    if (startDate) {
      if (t.occurred_on < startDate) return false;
    }
    if (endDate) {
      if (t.occurred_on > endDate) return false;
    }
    if (!startDate && !endDate && monthFilter !== "all") {
      const tDate = new Date(t.occurred_on);
      const tKey = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, "0")}`;
      if (tKey !== monthFilter) return false;
    }

    if (q) {
      const hay = `${t.note ?? ""} ${catMap.get(t.category_id ?? "")?.name ?? ""} ${accMap.get(t.account_id)?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => {
    // Primary: occurred_on descending
    const dateA = a.occurred_on ? new Date(a.occurred_on).getTime() : 0;
    const dateB = b.occurred_on ? new Date(b.occurred_on).getTime() : 0;
    const dateDiff = dateB - dateA;
    if (dateDiff !== 0) return dateDiff;
    // Secondary: created_at descending (newest added first within same date)
    const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
    const createdDiff = createdB - createdA;
    if (createdDiff !== 0) return createdDiff;
    // Tertiary: stable tiebreaker by id
    return (b.id || "").localeCompare(a.id || "");
  }), [txns, kind, account, monthFilter, startDate, endDate, q, catMap, accMap, netWorthAccountIds]);

  const displayRows = useMemo<DisplayRowItem[]>(() => {
    const result: DisplayRowItem[] = [];
    const eventMap = new Map<string, EventGroup>();
    const processedEventIds = new Set<string>();

    for (const t of filtered) {
      const parsed = parseEventNote(t.note);
      if (parsed) {
        if (!eventMap.has(parsed.eventId)) {
          eventMap.set(parsed.eventId, {
            eventId: parsed.eventId,
            eventTitle: parsed.eventTitle,
            date: t.occurred_on,
            items: [],
            totalAmount: 0,
          });
        }
        const grp = eventMap.get(parsed.eventId)!;
        grp.items.push(t);
        if (new Date(t.occurred_on) > new Date(grp.date)) {
          grp.date = t.occurred_on;
        }
        const amt = Number(t.amount);
        if (t.kind === "income") grp.totalAmount += amt;
        else if (t.kind === "expense") grp.totalAmount -= amt;
      }
    }

    // Sort each event's items by occurred_on DESC primary, created_at DESC secondary
    for (const grp of eventMap.values()) {
      grp.items.sort((a, b) => {
        const dateA = a.occurred_on ? new Date(a.occurred_on).getTime() : 0;
        const dateB = b.occurred_on ? new Date(b.occurred_on).getTime() : 0;
        const dateDiff = dateB - dateA;
        if (dateDiff !== 0) return dateDiff;

        const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
        const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return cb - ca;
      });
    }

    for (const t of filtered) {
      const parsed = parseEventNote(t.note);
      if (parsed) {
        if (!processedEventIds.has(parsed.eventId)) {
          processedEventIds.add(parsed.eventId);
          result.push({ type: "event", group: eventMap.get(parsed.eventId)! });
        }
      } else {
        result.push({ type: "single", txn: t });
      }
    }

    // Sort rows by Date (newest first). For items on the SAME DATE, use sameDateRanks!
    return result.sort((a, b) => {
      const dateA = a.type === "event" ? a.group.date : a.txn.occurred_on;
      const dateB = b.type === "event" ? b.group.date : b.txn.occurred_on;
      const timeA = new Date(dateA || 0).getTime() || 0;
      const timeB = new Date(dateB || 0).getTime() || 0;
      const dateDiff = timeB - timeA;
      if (dateDiff !== 0) return dateDiff;

      const idA = a.type === "event" ? a.group.eventId : a.txn.id;
      const idB = b.type === "event" ? b.group.eventId : b.txn.id;
      const rankA = sameDateRanks[idA] ?? 0;
      const rankB = sameDateRanks[idB] ?? 0;
      if (rankA !== rankB) return rankB - rankA;

      const createdA = a.type === "event" ? (a.group.items[0]?.created_at || a.group.date) : a.txn.created_at;
      const createdB = b.type === "event" ? (b.group.items[0]?.created_at || b.group.date) : b.txn.created_at;
      const cTimeA = new Date(createdA || 0).getTime() || 0;
      const cTimeB = new Date(createdB || 0).getTime() || 0;
      return cTimeB - cTimeA;
    });
  }, [filtered, sameDateRanks]);

  const eventThemeMap = useMemo(() => {
    const map = new Map<string, typeof EVENT_COLOR_THEMES[number]>();
    let count = 0;
    for (const item of displayRows) {
      if (item.type === "event" && !map.has(item.group.eventId)) {
        map.set(item.group.eventId, EVENT_COLOR_THEMES[count % EVENT_COLOR_THEMES.length]);
        count++;
      }
    }
    return map;
  }, [displayRows]);

  function moveSameDateRow(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= displayRows.length) return;

    const current = displayRows[index];
    const target = displayRows[targetIndex];

    const currentDate = current.type === "event" ? current.group.date : current.txn.occurred_on;
    const targetDate = target.type === "event" ? target.group.date : target.txn.occurred_on;

    const cDateStr = safeDateStr(currentDate);
    const tDateStr = safeDateStr(targetDate);

    if (!cDateStr || !tDateStr || cDateStr !== tDateStr) {
      toast.info("Reordering is allowed only between transactions on the same date");
      return;
    }

    const currentId = current.type === "event" ? current.group.eventId : current.txn.id;
    const targetId = target.type === "event" ? target.group.eventId : target.txn.id;

    const currentRank = sameDateRanks[currentId] ?? (1000 - index);
    const targetRank = sameDateRanks[targetId] ?? (1000 - targetIndex);

    saveSameDateRanks({
      ...sameDateRanks,
      [currentId]: targetRank,
      [targetId]: currentRank,
    });
    toast.success("Same-date order updated");
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["warranties"] });
  }

  async function confirmDelete(id: string) {
    const txnToDelete = txns.find(t => t.id === id);
    // Delete linked warranty if any
    await supabase.from("warranties" as any).delete().eq("transaction_id", id);

    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (txnToDelete) {
      await syncTransactionToLoan("delete", txnToDelete);
    }
    setSelectedIds(prev => prev.filter(x => x !== id));
    refresh();
    qc.invalidateQueries({ queryKey: ["loans"] });
    toast.success("Transaction deleted");
  }

  async function confirmBatchDelete() {
    setBatchLoading(true);
    try {
      const txnsToDelete = txns.filter(t => selectedIds.includes(t.id));
      // Delete linked warranties in batch
      await supabase.from("warranties" as any).delete().in("transaction_id", selectedIds);

      const { error } = await supabase.from("transactions").delete().in("id", selectedIds);
      if (error) throw error;
      
      for (const t of txnsToDelete) {
        await syncTransactionToLoan("delete", t);
      }
      
      toast.success(`Successfully deleted ${selectedIds.length} transactions`);
      setSelectedIds([]);
      refresh();
      qc.invalidateQueries({ queryKey: ["loans"] });
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`);
    } finally {
      setBatchLoading(false);
      setShowBatchDelete(false);
    }
  }

  async function confirmBatchDateChange() {
    if (!batchNewDate) return toast.error("Please select a date");
    setBatchDateLoading(true);
    try {
      const { error } = await supabase
        .from("transactions")
        .update({ occurred_on: batchNewDate })
        .in("id", selectedIds);
      
      if (error) throw error;

      // Also check if any of these transactions are linked to loans, and sync them!
      const selectedTxns = txns.filter(t => selectedIds.includes(t.id));
      for (const t of selectedTxns) {
        await syncTransactionToLoan("update", { ...t, occurred_on: batchNewDate });
      }

      toast.success(`Successfully updated the date for ${selectedIds.length} transactions`);
      setSelectedIds([]);
      refresh();
      qc.invalidateQueries({ queryKey: ["loans"] });
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`);
    } finally {
      setBatchDateLoading(false);
      setShowBatchDateChange(false);
    }
  }

  async function confirmBatchEventGroup() {
    if (!batchEventTitle.trim()) return toast.error("Please enter an event title");
    setBatchEventLoading(true);
    try {
      const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      // Sort by current display order so the event keeps the same sequence
      const displayOrder = displayRows.flatMap(r => r.type === "event" ? r.group.items.map(i => i.id) : [r.txn.id]);
      const txnsToGroup = txns
        .filter(t => selectedIds.includes(t.id))
        .sort((a, b) => {
          const ai = displayOrder.indexOf(a.id);
          const bi = displayOrder.indexOf(b.id);
          return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
        });

      const baseNow = Date.now();
      for (let i = 0; i < txnsToGroup.length; i++) {
        const t = txnsToGroup[i];
        let cleanNote = t.note ?? "";
        if (cleanNote.startsWith("[Event: ")) {
          const parsed = parseEventNote(cleanNote);
          if (parsed) cleanNote = parsed.itemNote;
        }
        const newNote = `[Event: ${batchEventTitle.trim()}|id:${eventId}]${cleanNote ? ` ${cleanNote}` : ""}`.trim();
        // Assign timestamps: first item in display order gets the HIGHEST timestamp (shows at top when sorted newest-first)
        const newTs = new Date(baseNow + (txnsToGroup.length - 1 - i) * 10).toISOString();
        const { error } = await supabase
          .from("transactions")
          .update({ note: newNote, created_at: newTs })
          .eq("id", t.id);
        if (error) throw error;
        await syncTransactionToLoan("update", { ...t, note: newNote });
      }

      toast.success(`Grouped ${selectedIds.length} transactions under event "${batchEventTitle.trim()}"`);
      setSelectedIds([]);
      refresh();
      qc.invalidateQueries({ queryKey: ["loans"] });
    } catch (err: any) {
      toast.error(`Grouping failed: ${err.message}`);
    } finally {
      setBatchEventLoading(false);
      setShowBatchEventGroup(false);
    }
  }

  async function confirmDeleteEvent(eventId: string) {
    const eventItemsToDelete = txns.filter(t => t.note && t.note.includes(`|id:${eventId}]`));
    const ids = eventItemsToDelete.map(t => t.id);
    if (ids.length === 0) return;

    // Delete linked warranties
    await supabase.from("warranties" as any).delete().in("transaction_id", ids);

    const { error } = await supabase.from("transactions").delete().in("id", ids);
    if (error) return toast.error(error.message);

    for (const t of eventItemsToDelete) {
      await syncTransactionToLoan("delete", t);
    }

    setSelectedIds(prev => prev.filter(x => !ids.includes(x)));
    setSelectedEventGroup(null);
    setDeleteEventId(null);
    refresh();
    toast.success("Event and all its records deleted");
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleAllVisible = () => {
    const visibleIds = displayRows.flatMap(row => row.type === "event" ? row.group.items.map(i => i.id) : [row.txn.id]);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Derive all event groups for the shift dialog
  const allEventGroups = useMemo(() => {
    const map = new Map<string, { id: string; title: string }>();
    for (const t of txns) {
      const p = parseEventNote(t.note);
      if (p && !map.has(p.eventId)) map.set(p.eventId, { id: p.eventId, title: p.eventTitle });
    }
    return Array.from(map.values());
  }, [txns]);

  return (
    <div className="space-y-3 sm:space-y-4 w-full flex-1 min-h-0 md:h-[calc(100vh-8.5rem)] md:max-h-[calc(100vh-8.5rem)] flex flex-col md:overflow-hidden">


      {/* Edit dialog (controlled, no trigger) */}
      {editingTxn && (
        <TransactionDialog
          editingTransaction={editingTxn}
          open={!!editingTxn}
          onOpenChange={(v) => { if (!v) { setEditingTxn(null); refresh(); } }}
          onDelete={(id) => { setDeleteId(id); setEditingTxn(null); }}
        />
      )}

      {/* Shift Record to Another Event Dialog */}
      <Dialog open={!!shiftingTxn} onOpenChange={(v) => { if (!v) { setShiftingTxn(null); setShiftTargetEventId(""); } }}>
        <DialogContent className="max-w-sm rounded-2xl z-[120]">
          <DialogHeader>
            <DialogTitle className="font-serif flex items-center gap-2"><MoveRight className="h-4 w-4 text-accent" /> Shift Record to Another Event</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-xs text-muted-foreground">Choose which event to move this record into:</p>
            <Select value={shiftTargetEventId} onValueChange={setShiftTargetEventId}>
              <SelectTrigger className="w-full bg-background">
                <SelectValue placeholder="Select an event…" />
              </SelectTrigger>
              <SelectContent className="z-[130]">
                {allEventGroups
                  .filter(eg => {
                    const p = shiftingTxn ? parseEventNote(shiftingTxn.note) : null;
                    return eg.id !== p?.eventId;
                  })
                  .map(eg => (
                    <SelectItem key={eg.id} value={eg.id}>🗓️ {eg.title}</SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setShiftingTxn(null); setShiftTargetEventId(""); }} className="cursor-pointer">Cancel</Button>
            <Button onClick={shiftRecordToEvent} disabled={!shiftTargetEventId || shiftLoading} className="cursor-pointer">
              {shiftLoading ? "Moving…" : "Move Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Pop-Up Date & Period Filter Dialog ── */}
      <Dialog open={dateFilterOpen} onOpenChange={setDateFilterOpen}>
        <DialogContent className="max-w-md rounded-2xl z-[150]">
          <DialogHeader>
            <DialogTitle className="font-serif flex items-center gap-2">
              <Calendar className="h-5 w-5 text-accent" /> Filter by Date & Period
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* ── Year & Month Dropdowns ── */}
            <div className="grid grid-cols-2 gap-3 bg-muted/40 p-3 rounded-xl border">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Year</label>
                <Select value={selectedYear} onValueChange={(yr) => handleYearMonthChange(yr, selectedMonth)}>
                  <SelectTrigger className="w-full bg-background text-xs h-9">
                    <SelectValue placeholder="All Years" />
                  </SelectTrigger>
                  <SelectContent className="z-[160]">
                    <SelectItem value="all">All Years</SelectItem>
                    {[2028, 2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Month</label>
                <Select value={selectedMonth} onValueChange={(mn) => handleYearMonthChange(selectedYear, mn)}>
                  <SelectTrigger className="w-full bg-background text-xs h-9">
                    <SelectValue placeholder="All Months" />
                  </SelectTrigger>
                  <SelectContent className="z-[160]">
                    <SelectItem value="all">All Months</SelectItem>
                    {[
                      { v: "01", l: "January" }, { v: "02", l: "February" }, { v: "03", l: "March" },
                      { v: "04", l: "April" }, { v: "05", l: "May" }, { v: "06", l: "June" },
                      { v: "07", l: "July" }, { v: "08", l: "August" }, { v: "09", l: "September" },
                      { v: "10", l: "October" }, { v: "11", l: "November" }, { v: "12", l: "December" },
                    ].map(m => (
                      <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── From Date & To Date Calendar Pickers ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">From Date</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setMonthFilter("all"); }}
                  className="w-full bg-background text-xs h-9 cursor-pointer"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">To Date</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setMonthFilter("all"); }}
                  className="w-full bg-background text-xs h-9 cursor-pointer"
                />
              </div>
            </div>

            {/* ── Quick Presets ── */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Quick Presets</label>
              <div className="flex flex-wrap gap-1.5">
                <Button variant="outline" size="sm" onClick={() => applyPreset("today")} className="text-[11px] h-7 px-2.5 rounded-lg cursor-pointer">Today</Button>
                <Button variant="outline" size="sm" onClick={() => applyPreset("this_month")} className="text-[11px] h-7 px-2.5 rounded-lg cursor-pointer">This Month</Button>
                <Button variant="outline" size="sm" onClick={() => applyPreset("last_month")} className="text-[11px] h-7 px-2.5 rounded-lg cursor-pointer">Last Month</Button>
                <Button variant="outline" size="sm" onClick={() => applyPreset("this_year")} className="text-[11px] h-7 px-2.5 rounded-lg cursor-pointer">This Year</Button>
                <Button variant="outline" size="sm" onClick={() => applyPreset("all")} className="text-[11px] h-7 px-2.5 rounded-lg cursor-pointer">All Time</Button>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between pt-2">
            <Button
              variant="ghost"
              onClick={() => applyPreset("all")}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Clear Filter
            </Button>
            <Button onClick={() => setDateFilterOpen(false)} className="text-xs font-bold cursor-pointer">
              Apply Filter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Desktop Filters (single inline row) */}
      <div className="hidden md:flex flex-nowrap items-center gap-2 rounded-xl border bg-card p-3 overflow-x-auto">
        <div className="flex-1 min-w-[140px] max-w-[260px]">
          <Input
            placeholder="Search notes, category, account…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full bg-background h-9 text-xs"
          />
        </div>
        
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-32 h-9 text-xs bg-background shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>

        <SearchableSelect
          options={accountOptions}
          value={account}
          onValueChange={setAccount}
          placeholder="Filter by account…"
          searchPlaceholder="Search account…"
          className="w-40 shrink-0"
          triggerClassName="h-9 text-xs bg-background"
        />

        {/* Date Pop-Up Filter Trigger */}
        <Button
          variant="outline"
          onClick={() => setDateFilterOpen(true)}
          className="bg-background text-xs h-9 px-2.5 flex items-center gap-1.5 rounded-lg cursor-pointer border shrink-0"
        >
          <Calendar className="h-3.5 w-3.5 text-accent shrink-0" />
          <span className="font-medium truncate max-w-[140px]">{dateLabel}</span>
          {(startDate || endDate || monthFilter !== "all") && (
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse shrink-0" />
          )}
        </Button>

        <span className="ml-auto shrink-0 text-xs text-muted-foreground font-serif whitespace-nowrap pl-1">
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Mobile Filters Trigger — Sticky fixed below app header, zero gap */}
      <div className="md:hidden sticky top-[96px] z-20 -mx-4 px-4 -mt-3 py-2 bg-background/95 backdrop-blur-md border-b shadow-sm">
        <div className="flex flex-shrink-0 items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer bg-card border">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Filters</span>
                {(kind !== "all" || account !== "all" || monthFilter !== "all" || startDate || endDate || q) && (
                  <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[90vw] rounded-xl z-[99]">
              <DialogHeader>
                <DialogTitle className="font-serif">Filter Transactions</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-serif font-bold text-muted-foreground uppercase tracking-wider">Search</label>
                  <Input
                    placeholder="Search notes, category, account…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="w-full bg-background"
                  />
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-serif font-bold text-muted-foreground uppercase tracking-wider">Type</label>
                  <Select value={kind} onValueChange={setKind}>
                    <SelectTrigger className="w-full bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[100]">
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-serif font-bold text-muted-foreground uppercase tracking-wider">Account Filter</label>
                  <SearchableSelect
                    options={accountOptions}
                    value={account}
                    onValueChange={setAccount}
                    placeholder="Filter by account…"
                    searchPlaceholder="Search account…"
                    className="w-full"
                  />
                </div>

                {/* Mobile Date Pop-Up Trigger */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-serif font-bold text-muted-foreground uppercase tracking-wider">Date Period</label>
                  <Button
                    variant="outline"
                    onClick={() => setDateFilterOpen(true)}
                    className="w-full bg-background text-xs h-10 px-3 flex items-center justify-between rounded-lg cursor-pointer border"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <Calendar className="h-4 w-4 text-accent" />
                      {dateLabel}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-between items-center pt-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQ("");
                    setKind("all");
                    setAccount("all");
                    applyPreset("all");
                    setFiltersOpen(false);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Clear all
                </Button>
                <Button onClick={() => setFiltersOpen(false)} className="text-xs font-bold cursor-pointer">
                  Done
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {filtered.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer bg-card border rounded-lg px-2.5 py-1.5 select-none">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                checked={filtered.length > 0 && filtered.every(t => selectedIds.includes(t.id))}
                onChange={toggleAllVisible}
              />
              <span className="text-[11px] font-medium">Select all</span>
            </label>
          )}
        </div>

        <span className="text-xs text-muted-foreground font-serif">
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
        </span>
        </div>
      </div>

      {/* Table (Desktop Layout) */}
      <div className="hidden md:flex rounded-xl border bg-card flex-1 flex-col min-h-0">
        <div className="overflow-auto flex-1 thin-scroll">
          <Table className="w-full min-w-[800px]">
            <TableHeader className="sticky top-0 z-10 bg-card/90 backdrop-blur-md border-b">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 py-3.5 px-4 text-center">
                  <input
                    type="checkbox"
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                    checked={filtered.length > 0 && filtered.every(t => selectedIds.includes(t.id))}
                    onChange={toggleAllVisible}
                  />
                </TableHead>
                <TableHead className="py-3.5 px-4 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Date</TableHead>
                <TableHead className="py-3.5 px-4 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Type</TableHead>
                <TableHead className="py-3.5 px-4 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Category</TableHead>
                <TableHead className="py-3.5 px-4 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Account</TableHead>
                <TableHead className="py-3.5 px-4 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Note</TableHead>
                <TableHead className="py-3.5 px-4 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-right">Amount</TableHead>
                <TableHead className="py-3.5 px-4 w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    No transactions match.
                  </TableCell>
                </TableRow>
              )}
              {displayRows.map((row, rowIdx) => {
                const rowDate = row.type === "event" ? row.group.date : row.txn.occurred_on;
                const prevRow = rowIdx > 0 ? displayRows[rowIdx - 1] : null;
                const nextRow = rowIdx < displayRows.length - 1 ? displayRows[rowIdx + 1] : null;

                const rStr = safeDateStr(rowDate);
                const prevDate = prevRow ? (prevRow.type === "event" ? prevRow.group.date : prevRow.txn.occurred_on) : null;
                const nextDate = nextRow ? (nextRow.type === "event" ? nextRow.group.date : nextRow.txn.occurred_on) : null;
                const pStr = safeDateStr(prevDate);
                const nStr = safeDateStr(nextDate);

                const isSameDateUp = !!rStr && !!pStr && rStr === pStr;
                const isSameDateDown = !!rStr && !!nStr && rStr === nStr;

                if (row.type === "event") {
                  const grp = row.group;
                  const theme = getEventTheme(grp.eventId, eventThemeMap);
                  const isAllSel = grp.items.length > 0 && grp.items.every(i => selectedIds.includes(i.id));
                  const isExpanded = expandedEventIds.has(grp.eventId);
                  return (
                    <Fragment key={grp.eventId}>
                      <TableRow
                        onMouseDown={() => startPress(rStr)}
                        onMouseUp={cancelPress}
                        onMouseLeave={cancelPress}
                        onTouchStart={() => startPress(rStr)}
                        onTouchEnd={cancelPress}
                        onTouchMove={cancelPress}
                        onClick={(e) => {
                          if (isLongPressActive.current) {
                            isLongPressActive.current = false;
                            return;
                          }
                          toggleExpandEvent(grp.eventId);
                        }}
                        className={`group ${theme.headerBg} ${theme.headerHover} transition-colors cursor-pointer ${isAllSel ? 'bg-accent/10' : ''} ${rStr === reorderDate ? 'border-y border-dashed border-primary/50 bg-primary/[0.03]' : ''}`}
                      >
                        <TableCell className="w-12 py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                            checked={isAllSel}
                            onChange={() => {
                              const itemIds = grp.items.map(i => i.id);
                              if (isAllSel) setSelectedIds(prev => prev.filter(id => !itemIds.includes(id)));
                              else setSelectedIds(prev => Array.from(new Set([...prev, ...itemIds])));
                            }}
                          />
                        </TableCell>
                        <TableCell className="py-3 px-4 tabular-nums text-xs text-muted-foreground/80 font-medium">
                          {new Date(grp.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          <Badge variant="secondary" className={`gap-1 font-semibold text-[10px] ${theme.badge}`}>
                            <Layers className="h-3 w-3" /> Event
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 px-4 text-xs font-semibold text-foreground/95">
                          <div className="flex items-center gap-2">
                            <span className={`p-0.5 rounded shrink-0 ${theme.iconBg}`}>
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </span>
                            <span>🗓️ {grp.eventTitle}</span>
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-normal">
                              {grp.items.length} records
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 px-4 text-xs font-semibold text-muted-foreground/80">
                          Multiple accounts
                        </TableCell>
                        <TableCell className="py-3 px-4 text-muted-foreground max-w-[20ch] truncate text-xs italic">
                          {isExpanded ? "Expanded inline" : "Click row to expand"}
                        </TableCell>
                        <TableCell className="py-3 px-4 text-right">
                          {(() => {
                            const sign = grp.totalAmount > 0 ? "+" : grp.totalAmount < 0 ? "−" : "";
                            const color = grp.totalAmount > 0 ? "text-[color:var(--success)]" : grp.totalAmount < 0 ? "text-[color:var(--destructive)]" : "text-foreground";
                            return (
                              <span className={`num font-serif font-black text-sm ${color}`}>
                                {sign}{fmtMoney(Math.abs(grp.totalAmount), currency)}
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingEventGroup(grp)}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer rounded-full"
                              title="Edit Event"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteEventId(grp.eventId)}
                              className="h-8 w-8 text-muted-foreground hover:text-destructive cursor-pointer rounded-full"
                              title="Delete Event"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            {reorderDate === rStr && (
                              <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
                                <Button variant="secondary" size="sm"
                                  onClick={() => moveSameDateRow(rowIdx, "up")}
                                  disabled={!isSameDateUp}
                                  className="h-7 w-7 p-0 flex items-center justify-center bg-accent/20 text-foreground hover:bg-accent/30 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                  title="Move Up"
                                ><ChevronUp className="h-4 w-4" /></Button>
                                <Button variant="secondary" size="sm"
                                  onClick={() => moveSameDateRow(rowIdx, "down")}
                                  disabled={!isSameDateDown}
                                  className="h-7 w-7 p-0 flex items-center justify-center bg-accent/20 text-foreground hover:bg-accent/30 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                  title="Move Down"
                                ><ChevronDown className="h-4 w-4" /></Button>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded Inline Event Rows (Standard TableRow per item with left border) */}
                      {isExpanded && grp.items.map((t, tIdx) => {
                        const parsed = parseEventNote(t.note);
                        const acc = accMap.get(t.account_id);
                        const cat = t.category_id ? catMap.get(t.category_id) : null;
                        const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "↔";
                        const amtColor = t.kind === "income"
                          ? "text-[color:var(--success)]"
                          : t.kind === "expense"
                          ? "text-[color:var(--destructive)]"
                          : "";
                        const isSelected = selectedIds.includes(t.id);
                        const isManaging = managingEventId === grp.eventId;

                        const itemDateStr = safeDateStr(t.occurred_on);
                        const prevItemDateStr = tIdx > 0 ? safeDateStr(grp.items[tIdx - 1].occurred_on) : null;
                        const nextItemDateStr = tIdx < grp.items.length - 1 ? safeDateStr(grp.items[tIdx + 1].occurred_on) : null;
                        const canMoveUp = tIdx > 0 && itemDateStr === prevItemDateStr;
                        const canMoveDown = tIdx < grp.items.length - 1 && itemDateStr === nextItemDateStr;

                        return (
                          <TableRow
                            key={t.id}
                            onMouseDown={(e) => { e.stopPropagation(); startEventItemPress(grp.eventId); }}
                            onMouseUp={(e) => { e.stopPropagation(); cancelEventItemPress(); }}
                            onMouseLeave={cancelEventItemPress}
                            onTouchStart={(e) => { e.stopPropagation(); startEventItemPress(grp.eventId); }}
                            onTouchEnd={(e) => { e.stopPropagation(); cancelEventItemPress(); }}
                            onTouchMove={(e) => { e.stopPropagation(); cancelEventItemPress(); }}
                            onClick={(e) => {
                              if (isEventItemLongPressActive.current) { isEventItemLongPressActive.current = false; return; }
                              setEditingTxn(t);
                            }}
                            className={`group ${theme.subBg} ${theme.subHover} transition-colors border-l-4 cursor-pointer ${
                              isManaging ? 'border-accent' : theme.subBorder
                            } ${isSelected ? 'bg-accent/15' : ''}`}
                          >
                            <TableCell className="w-12 py-3 px-4 text-center pl-6" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                                checked={isSelected}
                                onChange={() => toggleSelect(t.id)}
                              />
                            </TableCell>
                             <TableCell className="py-3.5 px-4 tabular-nums text-xs font-medium text-muted-foreground/80">
                              {new Date(t.occurred_on).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="py-3.5 px-4">
                              {t.kind === "income" ? (
                                <Badge variant="outline" className="capitalize text-[10px] px-2 py-0.5 font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 shrink-0">
                                  Income
                                </Badge>
                              ) : t.kind === "expense" ? (
                                <Badge variant="outline" className="capitalize text-[10px] px-2 py-0.5 font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 shrink-0">
                                  Expense
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="capitalize text-[10px] px-2 py-0.5 font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 shrink-0">
                                  Transfer
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="py-3.5 px-4 text-xs font-semibold">
                              {cat ? (
                                <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-accent/[0.04] border border-border/30">
                                  {cat.image_url ? (
                                    <img src={cat.image_url} alt="" className="h-4 w-4 rounded-full object-cover shrink-0" />
                                  ) : (
                                    <span className="text-xs">{cat.icon}</span>
                                  )}
                                  <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                                  <span className="text-muted-foreground text-[11px]">{cat.name}</span>
                                </span>
                              ) : t.kind === "transfer" ? (
                                <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-blue-500/5 border border-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px]">
                                  🔄 Transfer Category
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="py-3.5 px-4 text-xs font-bold text-foreground/95">
                              <span className="inline-flex items-center gap-1.5">
                                {acc ? (
                                  <>
                                    {(acc as any).image_url ? (
                                      <img src={(acc as any).image_url} alt="" className="h-4.5 w-4.5 rounded-full object-cover shrink-0 border border-border/40" />
                                    ) : (
                                      <span className="h-2 w-2 rounded-full inline-block shrink-0" style={{ background: acc.color }} />
                                    )}
                                    <span>{acc.name}</span>
                                  </>
                                ) : (
                                  <span>—</span>
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="py-3.5 px-4 text-muted-foreground/80 max-w-[24ch] truncate text-xs">
                              {parsed?.itemNote ?? t.note ?? "—"}
                            </TableCell>
                            <TableCell className={`py-3.5 px-4 text-right num font-serif font-black text-sm ${amtColor}`}>
                              {sign}{fmtMoney(Number(t.amount), currency)}
                            </TableCell>
                            <TableCell className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                              {isManaging && (
                                <div className="flex items-center justify-end gap-1 animate-in fade-in duration-150"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onTouchStart={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button title="Move Up" disabled={!canMoveUp}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onTouchStart={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); reorderEventItem(grp, t.id, "up"); }}
                                    className="h-6 w-6 flex items-center justify-center rounded bg-accent/20 text-foreground disabled:opacity-20 cursor-pointer hover:bg-accent/40 disabled:cursor-not-allowed"
                                  ><ChevronUp className="h-3.5 w-3.5" /></button>
                                  <button title="Move Down" disabled={!canMoveDown}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onTouchStart={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); reorderEventItem(grp, t.id, "down"); }}
                                    className="h-6 w-6 flex items-center justify-center rounded bg-accent/20 text-foreground disabled:opacity-20 cursor-pointer hover:bg-accent/40 disabled:cursor-not-allowed"
                                  ><ChevronDown className="h-3.5 w-3.5" /></button>
                                  <button title="Degroup (remove from event)"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onTouchStart={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); degroupRecord(t); }}
                                    className="h-6 w-6 flex items-center justify-center rounded bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 cursor-pointer"
                                  ><Ungroup className="h-3.5 w-3.5" /></button>
                                  {allEventGroups.filter(eg => { const p = parseEventNote(t.note); return eg.id !== p?.eventId; }).length > 0 && (
                                    <button title="Shift to another event"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onTouchStart={(e) => e.stopPropagation()}
                                      onClick={(e) => { e.stopPropagation(); setShiftingTxn(t); }}
                                      className="h-6 w-6 flex items-center justify-center rounded bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 cursor-pointer"
                                    ><MoveRight className="h-3.5 w-3.5" /></button>
                                  )}
                                  <button title="Edit record"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onTouchStart={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); setEditingTxn(t); }}
                                    className="h-6 w-6 flex items-center justify-center rounded bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                                  ><Pencil className="h-3 w-3" /></button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  );
                }

                const t = row.txn;
                const parsed = parseEventNote(t.note);
                const acc = accMap.get(t.account_id);
                const cat = t.category_id ? catMap.get(t.category_id) : null;
                const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "↔";
                const amtColor = t.kind === "income"
                  ? "text-[color:var(--success)]"
                  : t.kind === "expense"
                  ? "text-[color:var(--destructive)]"
                  : "";
                const isSelected = selectedIds.includes(t.id);
                return (
                  <TableRow
                    key={t.id}
                    onMouseDown={() => startPress(rStr)}
                    onMouseUp={cancelPress}
                    onMouseLeave={cancelPress}
                    onTouchStart={() => startPress(rStr)}
                    onTouchEnd={cancelPress}
                    onTouchMove={cancelPress}
                    onClick={(e) => {
                      if (isLongPressActive.current) {
                        isLongPressActive.current = false;
                        return;
                      }
                      setEditingTxn(t);
                    }}
                    className={`group cursor-pointer hover:bg-accent/5 ${isSelected ? 'bg-accent/10 hover:bg-accent/15' : ''} ${rStr === reorderDate ? 'border-y border-dashed border-primary/50 bg-primary/[0.01]' : ''}`}
                  >
                    <TableCell className="w-12 py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                        checked={isSelected}
                        onChange={() => toggleSelect(t.id)}
                      />
                    </TableCell>
                    <TableCell className="py-3.5 px-4 tabular-nums text-xs font-medium text-muted-foreground/80">
                      {new Date(t.occurred_on).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="py-3.5 px-4">
                      {t.kind === "income" ? (
                        <Badge variant="outline" className="capitalize text-[10px] px-2 py-0.5 font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 shrink-0">
                          Income
                        </Badge>
                      ) : t.kind === "expense" ? (
                        <Badge variant="outline" className="capitalize text-[10px] px-2 py-0.5 font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 shrink-0">
                          Expense
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="capitalize text-[10px] px-2 py-0.5 font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 shrink-0">
                          Transfer
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-xs font-semibold">
                      {cat ? (
                        <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-accent/[0.04] border border-border/30">
                          {cat.image_url ? (
                            <img src={cat.image_url} alt="" className="h-4 w-4 rounded-full object-cover shrink-0" />
                          ) : (
                            <span className="text-xs">{cat.icon}</span>
                          )}
                          <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                          <span className="text-muted-foreground text-[11px]">{cat.name}</span>
                        </span>
                      ) : t.kind === "transfer" ? (
                        <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-blue-500/5 border border-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px]">
                          🔄 Transfer Category
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-xs font-bold text-foreground/95">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {acc ? (
                          <span className="inline-flex items-center gap-1.5">
                            {(() => {
                              const envMatch = (t.note ?? "").match(/ENV_([^\s\-:;,\n]+)/);
                              if (envMatch) {
                                return (
                                  <span className="inline-flex items-center gap-1 font-bold text-accent">
                                    <span>✉️</span>
                                    <span>ENV_{envMatch[1]}</span>
                                  </span>
                                );
                              }
                              return (
                                <>
                                  {(acc as any).image_url ? (
                                    <img src={(acc as any).image_url} alt="" className="h-4.5 w-4.5 rounded-full object-cover shrink-0 border border-border/40" />
                                  ) : (
                                    <span className="h-2 w-2 rounded-full inline-block shrink-0" style={{ background: acc.color }} />
                                  )}
                                  <span>{acc.name}</span>
                                </>
                              );
                            })()}
                          </span>
                        ) : (
                          <span>—</span>
                        )}
                        {t.to_account_id && (
                          <>
                            <span className="text-muted-foreground font-normal">→</span>
                            {(() => {
                              const toAcc = accMap.get(t.to_account_id);
                              return toAcc ? (
                                <span className="inline-flex items-center gap-1.5">
                                  {(toAcc as any).image_url ? (
                                    <img src={(toAcc as any).image_url} alt="" className="h-4.5 w-4.5 rounded-full object-cover shrink-0 border border-border/40" />
                                  ) : (
                                    <span className="h-2 w-2 rounded-full inline-block shrink-0" style={{ background: toAcc.color }} />
                                  )}
                                  <span>{toAcc.name}</span>
                                </span>
                              ) : (
                                <span>—</span>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-4 text-muted-foreground/80 max-w-[24ch] truncate text-xs">
                      {parsed?.itemNote ?? t.note ?? "—"}
                    </TableCell>
                    <TableCell className={`py-3.5 px-4 text-right num font-serif font-black text-sm ${amtColor}`}>
                      {sign}{fmtMoney(Number(t.amount), currency)}
                    </TableCell>
                    <TableCell className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      {reorderDate === rStr && (
                        <div className="flex items-center justify-end gap-1.5 animate-in fade-in duration-200">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => moveSameDateRow(rowIdx, "up")}
                            disabled={!isSameDateUp}
                            className="h-7 w-7 p-0 flex items-center justify-center bg-accent/20 text-foreground hover:bg-accent/30 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            title="Move Up"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => moveSameDateRow(rowIdx, "down")}
                            disabled={!isSameDateDown}
                            className="h-7 w-7 p-0 flex items-center justify-center bg-accent/20 text-foreground hover:bg-accent/30 disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            title="Move Down"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* List (Mobile Layout) */}
      <div className="md:hidden rounded-xl border bg-card p-3 overflow-y-auto overflow-x-hidden flex-1 min-h-0 thin-scroll">
        {displayRows.length === 0 && (
          <div className="text-center text-muted-foreground py-12 text-sm">
            No transactions match.
          </div>
        )}
        <div className="divide-y divide-border/50">
          {displayRows.map((row, rowIdx) => {
            const rowDate = row.type === "event" ? row.group.date : row.txn.occurred_on;
            const prevRow = rowIdx > 0 ? displayRows[rowIdx - 1] : null;
            const nextRow = rowIdx < displayRows.length - 1 ? displayRows[rowIdx + 1] : null;

            const rStr = safeDateStr(rowDate);
            const prevDate = prevRow ? (prevRow.type === "event" ? prevRow.group.date : prevRow.txn.occurred_on) : null;
            const nextDate = nextRow ? (nextRow.type === "event" ? nextRow.group.date : nextRow.txn.occurred_on) : null;
            const pStr = safeDateStr(prevDate);
            const nStr = safeDateStr(nextDate);

            const isSameDateUp = !!rStr && !!pStr && rStr === pStr;
            const isSameDateDown = !!rStr && !!nStr && rStr === nStr;

            if (row.type === "event") {
              const grp = row.group;
              const theme = getEventTheme(grp.eventId, eventThemeMap);
              const isAllSel = grp.items.length > 0 && grp.items.every(i => selectedIds.includes(i.id));
              const isExpanded = expandedEventIds.has(grp.eventId);
              return (
                <div
                  key={grp.eventId}
                  onMouseDown={() => startPress(rStr)}
                  onMouseUp={cancelPress}
                  onMouseLeave={cancelPress}
                  onTouchStart={() => startPress(rStr)}
                  onTouchEnd={cancelPress}
                  onTouchMove={cancelPress}
                  className={`py-2.5 px-2 rounded-xl border ${theme.headerBg} ${theme.mobileCardBorder} my-1 space-y-2 transition-all ${rStr === reorderDate ? 'border-dashed border-primary/50 bg-primary/[0.02]' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer flex-shrink-0"
                        checked={isAllSel}
                        onChange={() => {
                          const itemIds = grp.items.map(i => i.id);
                          if (isAllSel) setSelectedIds(prev => prev.filter(id => !itemIds.includes(id)));
                          else setSelectedIds(prev => Array.from(new Set([...prev, ...itemIds])));
                        }}
                      />
                      <div
                        onClick={(e) => {
                          if (isLongPressActive.current) {
                            isLongPressActive.current = false;
                            return;
                          }
                          toggleExpandEvent(grp.eventId);
                        }}
                        className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                      >
                        <span className={`text-lg h-9 w-9 rounded-lg ${theme.iconBg} flex items-center justify-center flex-shrink-0`}>
                          🗓️
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold truncate">{grp.eventTitle}</span>
                            <Badge variant="secondary" className={`text-[8px] px-1 py-0 leading-none ${theme.badge}`}>
                              {grp.items.length} records
                            </Badge>
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            Event · {new Date(grp.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {(() => {
                        const sign = grp.totalAmount > 0 ? "+" : grp.totalAmount < 0 ? "−" : "";
                        const color = grp.totalAmount > 0 ? "text-[color:var(--success)]" : grp.totalAmount < 0 ? "text-[color:var(--destructive)]" : "text-foreground";
                        return (
                          <span className={`num font-serif text-xs font-bold ${color}`}>
                            {sign}{fmtMoney(Math.abs(grp.totalAmount), currency)}
                          </span>
                        );
                      })()}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingEventGroup(grp); }}
                          className="h-6 w-6 flex items-center justify-center rounded-full bg-accent/10 text-muted-foreground hover:text-foreground cursor-pointer"
                          title="Edit Event"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteEventId(grp.eventId); }}
                          className="h-6 w-6 flex items-center justify-center rounded-full bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer"
                          title="Delete Event"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        {reorderDate === rStr && (
                          <div className="flex items-center gap-1 animate-in fade-in duration-200">
                            <button onClick={(e) => { e.stopPropagation(); moveSameDateRow(rowIdx, "up"); }} disabled={!isSameDateUp}
                              className="h-6 w-6 flex items-center justify-center rounded bg-accent/20 text-foreground disabled:opacity-20 cursor-pointer"
                            ><ChevronUp className="h-3.5 w-3.5" /></button>
                            <button onClick={(e) => { e.stopPropagation(); moveSameDateRow(rowIdx, "down"); }} disabled={!isSameDateDown}
                              className="h-6 w-6 flex items-center justify-center rounded bg-accent/20 text-foreground disabled:opacity-20 cursor-pointer"
                            ><ChevronDown className="h-3.5 w-3.5" /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Sub-Records Mobile List */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-border/40 space-y-1.5">
                      {grp.items.map((t, tIdx) => {
                        const parsed = parseEventNote(t.note);
                        const acc = accMap.get(t.account_id);
                        const cat = t.category_id ? catMap.get(t.category_id) : null;
                        const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "↔";
                        const amtColor = t.kind === "income"
                          ? "text-[color:var(--success)]"
                          : t.kind === "expense"
                          ? "text-[color:var(--destructive)]"
                          : "";
                        const isSelected = selectedIds.includes(t.id);
                        const isManaging = managingEventId === grp.eventId;

                        const itemDateStr = safeDateStr(t.occurred_on);
                        const prevItemDateStr = tIdx > 0 ? safeDateStr(grp.items[tIdx - 1].occurred_on) : null;
                        const nextItemDateStr = tIdx < grp.items.length - 1 ? safeDateStr(grp.items[tIdx + 1].occurred_on) : null;
                        const canMoveUp = tIdx > 0 && itemDateStr === prevItemDateStr;
                        const canMoveDown = tIdx < grp.items.length - 1 && itemDateStr === nextItemDateStr;

                        return (
                          <div
                            key={t.id}
                            onMouseDown={(e) => { e.stopPropagation(); startEventItemPress(grp.eventId); }}
                            onMouseUp={(e) => { e.stopPropagation(); cancelEventItemPress(); }}
                            onMouseLeave={cancelEventItemPress}
                            onTouchStart={(e) => { e.stopPropagation(); startEventItemPress(grp.eventId); }}
                            onTouchEnd={(e) => { e.stopPropagation(); cancelEventItemPress(); }}
                            onTouchMove={(e) => { e.stopPropagation(); cancelEventItemPress(); }}
                            onClick={() => {
                              if (isEventItemLongPressActive.current) { isEventItemLongPressActive.current = false; return; }
                              setEditingTxn(t);
                            }}
                            className={`py-2 px-2.5 rounded-lg border-l-4 ${theme.subBg} cursor-pointer transition-all ${
                              isManaging ? 'border-accent' : theme.subBorder
                            } ${isSelected ? 'bg-accent/15' : ''}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer flex-shrink-0"
                                  checked={isSelected}
                                  onChange={(e) => { e.stopPropagation(); toggleSelect(t.id); }}
                                />
                                <span className="text-base h-8 w-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                                  {cat?.icon ?? "💵"}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-serif font-bold truncate">{cat?.name ?? (t.kind === "transfer" ? "Transfer Category" : "Uncategorized")}</span>
                                    <Badge variant="outline" className="capitalize text-[8px] px-1 py-0 leading-none">{t.kind}</Badge>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground truncate">
                                    {acc?.name} · {new Date(t.occurred_on).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                  </div>
                                  {(parsed?.itemNote || t.note) && (
                                    <div className="text-[9px] text-muted-foreground italic truncate max-w-[140px]">
                                      {parsed?.itemNote ?? t.note}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <span className={`num font-serif text-xs font-bold flex-shrink-0 ${amtColor}`}>{sign}{fmtMoney(Number(t.amount), currency)}</span>
                            </div>

                            {/* Action bar — visible when manage mode active for this event */}
                            {isManaging && (
                              <div className="mt-2 flex items-center flex-wrap gap-1 p-1.5 bg-accent/10 rounded-lg border border-accent/20 animate-in fade-in duration-150"
                                onMouseDown={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  title="Move Up" disabled={!canMoveUp}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onTouchStart={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); reorderEventItem(grp, t.id, "up"); }}
                                  className="h-7 px-2 flex items-center gap-1 rounded bg-accent/20 text-foreground disabled:opacity-20 text-[10px] font-bold cursor-pointer disabled:cursor-not-allowed"
                                ><ChevronUp className="h-3 w-3" /> Up</button>
                                <button
                                  title="Move Down" disabled={!canMoveDown}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onTouchStart={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); reorderEventItem(grp, t.id, "down"); }}
                                  className="h-7 px-2 flex items-center gap-1 rounded bg-accent/20 text-foreground disabled:opacity-20 text-[10px] font-bold cursor-pointer disabled:cursor-not-allowed"
                                ><ChevronDown className="h-3 w-3" /> Down</button>
                                <button
                                  title="Degroup"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onTouchStart={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); degroupRecord(t); }}
                                  className="h-7 px-2 flex items-center gap-1 rounded bg-orange-500/10 text-orange-600 text-[10px] font-bold cursor-pointer"
                                ><Ungroup className="h-3 w-3" /> Degroup</button>
                                {allEventGroups.filter(eg => { const p = parseEventNote(t.note); return eg.id !== p?.eventId; }).length > 0 && (
                                  <button
                                    title="Shift to event"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onTouchStart={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); setShiftingTxn(t); }}
                                    className="h-7 px-2 flex items-center gap-1 rounded bg-blue-500/10 text-blue-600 text-[10px] font-bold cursor-pointer"
                                  ><MoveRight className="h-3 w-3" /> Shift</button>
                                )}
                                <button
                                  title="Edit"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onTouchStart={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); setEditingTxn(t); }}
                                  className="h-7 px-2 flex items-center gap-1 rounded bg-muted text-muted-foreground text-[10px] font-bold cursor-pointer"
                                ><Pencil className="h-3 w-3" /> Edit</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const t = row.txn;
            const parsed = parseEventNote(t.note);
            const acc = accMap.get(t.account_id);
            const cat = t.category_id ? catMap.get(t.category_id) : null;
            const sign = t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "↔";
            const amtColor = t.kind === "income"
              ? "text-[color:var(--success)]"
              : t.kind === "expense"
              ? "text-[color:var(--destructive)]"
              : "";
            const isSelected = selectedIds.includes(t.id);
            return (
              <div
                key={t.id}
                onMouseDown={() => startPress(rStr)}
                onMouseUp={cancelPress}
                onMouseLeave={cancelPress}
                onTouchStart={() => startPress(rStr)}
                onTouchEnd={cancelPress}
                onTouchMove={cancelPress}
                onClick={(e) => {
                  if (isLongPressActive.current) {
                    isLongPressActive.current = false;
                    return;
                  }
                  setEditingTxn(t);
                }}
                className={`py-2.5 flex items-center justify-between gap-3 px-1 rounded-lg cursor-pointer hover:bg-accent/5 transition-all ${isSelected ? 'bg-accent/10' : ''} ${rStr === reorderDate ? 'border border-dashed border-primary/50 bg-primary/[0.02]' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer flex-shrink-0"
                    checked={isSelected}
                    onChange={(e) => { e.stopPropagation(); toggleSelect(t.id); }}
                  />
                  <span className="text-xl h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    {cat?.icon ?? "💵"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-serif font-black truncate">{cat?.name ?? (t.kind === "transfer" ? "Transfer Category" : "Uncategorized")}</span>
                      <Badge variant="outline" className="capitalize text-[9px] px-1 py-0 scale-90 origin-left leading-none">{t.kind}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {(() => {
                        const envMatch = (t.note ?? "").match(/ENV_([^\s\-:;,\n]+)/);
                        if (envMatch) {
                          return <span className="font-bold text-accent">✉️ ENV_{envMatch[1]}</span>;
                        }
                        return `${acc?.name || "—"} ${t.to_account_id ? `→ ${accMap.get(t.to_account_id)?.name}` : ""}`;
                      })()}
                      <span className="mx-1">·</span>
                      {new Date(t.occurred_on).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </div>
                    {(parsed?.itemNote || t.note) && (
                      <div className="text-[10px] text-muted-foreground italic truncate max-w-[160px] mt-0.5">
                        {parsed?.itemNote ?? t.note}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`num font-serif text-sm font-bold ${amtColor}`}>{sign}{fmtMoney(Number(t.amount), currency)}</span>
                  {reorderDate === rStr && (
                    <div className="flex items-center gap-1 animate-in fade-in duration-200">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveSameDateRow(rowIdx, "up"); }}
                        disabled={!isSameDateUp}
                        className="h-6 w-6 flex items-center justify-center rounded bg-accent/20 text-foreground disabled:opacity-20 cursor-pointer"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveSameDateRow(rowIdx, "down"); }}
                        disabled={!isSameDateDown}
                        className="h-6 w-6 flex items-center justify-center rounded bg-accent/20 text-foreground disabled:opacity-20 cursor-pointer"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Deletion confirmation alert dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Delete Transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this transaction? This action will permanently remove it from your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (deleteId) {
                  confirmDelete(deleteId);
                  setDeleteId(null);
                }
              }} 
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground cursor-pointer"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Floating Batch Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[40] flex items-center gap-3 px-4 py-2.5 rounded-full border bg-background/95 backdrop-blur-md shadow-2xl animate-in slide-in-from-bottom-5 duration-300 max-w-[95vw] overflow-x-auto">
          <span className="text-xs font-serif font-black text-foreground">
            {selectedIds.length} selected
          </span>
          <div className="h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds([])}
            className="h-7 text-xs font-semibold hover:bg-muted rounded-full cursor-pointer text-muted-foreground hover:text-foreground"
          >
            Clear
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBatchNewDate(new Date().toISOString().split("T")[0]);
              setShowBatchDateChange(true);
            }}
            className="h-7 px-3 text-xs font-bold rounded-full cursor-pointer flex items-center gap-1.5 bg-background border hover:bg-muted text-foreground"
          >
            <Calendar className="h-3.5 w-3.5 text-accent" />
            <span>Change Date</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBatchEventTitle("");
              setShowBatchEventGroup(true);
            }}
            className="h-7 px-3 text-xs font-bold rounded-full cursor-pointer flex items-center gap-1.5 bg-background border hover:bg-muted text-foreground"
          >
            <Layers className="h-3.5 w-3.5 text-accent" />
            <span>Group as Event</span>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowBatchDelete(true)}
            className="h-7 px-3 text-xs font-bold rounded-full cursor-pointer flex items-center gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </Button>
        </div>
      )}

      {/* Batch Deletion confirmation alert dialog */}
      <AlertDialog open={showBatchDelete} onOpenChange={setShowBatchDelete}>
        <AlertDialogContent className="z-[99]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Delete {selectedIds.length} Transactions?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete these {selectedIds.length} selected transactions? This action will permanently remove all of them from your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmBatchDelete} 
              disabled={batchLoading}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground cursor-pointer"
            >
              {batchLoading ? "Deleting..." : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Date Change Dialog */}
      <Dialog open={showBatchDateChange} onOpenChange={setShowBatchDateChange}>
        <DialogContent className="max-w-sm rounded-2xl p-6 z-[99]">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg font-bold">Change Date</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-xs text-muted-foreground">
              Select a new date for the {selectedIds.length} selected transactions.
            </p>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Date</label>
              <Input
                type="date"
                value={batchNewDate}
                onChange={(e) => setBatchNewDate(e.target.value)}
                className="w-full bg-background"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowBatchDateChange(false)}
              className="rounded-full h-10 px-4 text-xs font-bold cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmBatchDateChange}
              disabled={batchDateLoading || !batchNewDate}
              className="rounded-full h-10 px-5 text-xs font-bold bg-accent hover:bg-accent/90 text-accent-foreground cursor-pointer"
            >
              {batchDateLoading ? "Saving..." : "Change Date"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Event Group Dialog */}
      <Dialog open={showBatchEventGroup} onOpenChange={setShowBatchEventGroup}>
        <DialogContent className="max-w-sm rounded-2xl p-6 z-[99]">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg font-bold">Group as Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-xs text-muted-foreground">
              Enter a title to group the {selectedIds.length} selected transactions into a new event.
            </p>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Event Title</label>
              <Input
                placeholder="e.g. Vacation, Conference, Birthday Party"
                value={batchEventTitle}
                onChange={(e) => setBatchEventTitle(e.target.value)}
                className="w-full bg-background"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowBatchEventGroup(false)}
              className="rounded-full h-10 px-4 text-xs font-bold cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmBatchEventGroup}
              disabled={batchEventLoading || !batchEventTitle.trim()}
              className="rounded-full h-10 px-5 text-xs font-bold bg-accent hover:bg-accent/90 text-accent-foreground cursor-pointer"
            >
              {batchEventLoading ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>



      {/* Edit Event Dialog */}
      <TransactionDialog
        editingEvent={editingEventGroup}
        open={!!editingEventGroup}
        onOpenChange={(open) => !open && setEditingEventGroup(null)}
      />

      {/* Delete Event Confirmation Alert */}
      <AlertDialog open={!!deleteEventId} onOpenChange={(open) => !open && setDeleteEventId(null)}>
        <AlertDialogContent className="z-[100]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">Delete Event & Records?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this event and all of its associated records? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteEventId) confirmDeleteEvent(deleteEventId);
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground cursor-pointer"
            >
              Delete Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
