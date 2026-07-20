import { useState, useEffect, useRef } from "react";
import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Receipt, Wallet, PiggyBank, BarChart3, LogOut, User, Tag, Plus, ChevronDown, Settings, ChevronUp, Cpu, CircleDollarSign, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient, useIsFetching } from "@tanstack/react-query";
import { api, fmtMoney, computeAccountBalances } from "@/lib/finance";
import { useUserProfile } from "@/hooks/use-user-profile";
import { TransactionDialog } from "@/components/transaction-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoriesDialog } from "@/components/categories-dialog";
import { ProfileDialog } from "@/components/profile-dialog";
import { NotificationBell, NotificationItem } from "@/components/notification-bell";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

const items = [
  { title: "Dashboard",    url: "/dashboard",    icon: LayoutDashboard,  mobile: true },
  { title: "Transactions", url: "/transactions", icon: Receipt,          mobile: true },
  { title: "Accounts",     url: "/accounts",     icon: Wallet,           mobile: true },
  { title: "Budgets",      url: "/budgets",      icon: PiggyBank,        mobile: true },
  { title: "Loans",        url: "/loans",        icon: CircleDollarSign, mobile: true },
  { title: "Warranty",     url: "/warranties",   icon: ShieldCheck,      mobile: true },
  { title: "Stats",        url: "/stats",        icon: BarChart3,        mobile: false },
  { title: "Automation",   url: "/automation",   icon: Cpu,              mobile: true },
] as const;

// ─── Time-of-day greeting ─────────────────────────────────────────────────────
function greetTime() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

// ─── Blinking dot logo (reusable) ─────────────────────────────────────────────
function FinorAssetLogo({ className = "", iconSize = "h-6 w-6", dotSize = "h-4 w-4" }: { className?: string; iconSize?: string; dotSize?: string }) {
  return (
    <div className={`flex items-center gap-4 font-serif font-black select-none ${className}`}>
      <span className={`relative flex ${iconSize} flex-shrink-0 items-center justify-center`}>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
        <span className={`relative inline-flex ${dotSize} rounded-full bg-accent shadow-[0_0_12px_rgba(217,119,6,0.5)]`} />
      </span>
      <span>FinorAsset</span>
    </div>
  );
}

// ─── Top Bar Logo (conditionally visible) ──────────────────────────────────
function TopBarLogo() {
  const { state, isMobile } = useSidebar();
  if (state === "expanded" && !isMobile) {
    // Spacer matching the width of the collapsed sidebar to prevent layout shifting
    return <div className="h-9 w-9 flex-shrink-0" />;
  }
  return <FinorAssetLogo className="text-xl md:text-2xl flex-shrink-0" iconSize="h-6 w-6" dotSize="h-3.5 w-3.5" />;
}

// ─── Sidebar header with hover-reveal trigger ─────────────────────────────────
function SidebarLogoHeader() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  if (!isCollapsed) {
    return (
      <div className="group/hdr flex items-center justify-between px-3 py-6 relative w-full">
        <FinorAssetLogo className="text-xl flex-shrink-0" iconSize="h-6 w-6" dotSize="h-3.5 w-3.5" />
        <SidebarTrigger
          className="h-9 w-9 [&_svg]:h-5 [&_svg]:w-5 flex-shrink-0 opacity-0 group-hover/hdr:opacity-100 transition-opacity duration-150 cursor-pointer"
        />
      </div>
    );
  }

  return (
    <div className="group/hdr flex items-center justify-center px-4 py-6 relative w-full">
      {/* Round icon badge — centered, always visible */}
      <div className="flex items-center justify-center select-none w-full">
        <span className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 border border-accent/30 shadow-[0_0_15px_rgba(217,119,6,0.15)]">
          <span className="absolute inline-flex h-7 w-7 animate-ping rounded-full bg-accent opacity-45" />
          <span className="relative inline-flex h-4.5 w-4.5 rounded-full bg-accent shadow-[0_0_8px_rgba(217,119,6,0.4)]" />
        </span>
      </div>

      {/* SidebarTrigger — hidden until user hovers the header area */}
      {/* In collapsed state: always visible so user can click to expand */}
      <SidebarTrigger
        className="h-9 w-9 [&_svg]:h-5 [&_svg]:w-5 flex-shrink-0 absolute inset-0 m-auto opacity-0 hover:opacity-100 w-full h-full rounded-none cursor-pointer"
      />
    </div>
  );
}

// ─── Shared Profile Dropdown Content ─────────────────────────────────────────
function ProfileDropdownContent({
  displayName,
  email,
  onSignOut,
  onOpenCategories,
  onOpenProfile,
}: {
  displayName: string;
  email: string;
  onSignOut: () => void;
  onOpenCategories: () => void;
  onOpenProfile: () => void;
}) {
  return (
    <DropdownMenuContent side="top" align="start" className="w-64 mb-1">
      {/* User info header */}
      <div className="px-3 py-3 border-b">
        <p className="font-serif font-bold text-base truncate">{displayName}</p>
        <p className="text-sm text-muted-foreground truncate">{email}</p>
      </div>

      {/* Menu items */}
      <div className="md:hidden">
        <DropdownMenuItem asChild className="flex items-center gap-3 cursor-pointer py-2.5">
          <Link to="/stats" className="w-full flex items-center gap-3">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium text-sm">Stats & Trends</p>
              <p className="text-xs text-muted-foreground">Analyze your spending</p>
            </div>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
      </div>

      <DropdownMenuItem onClick={onOpenCategories} className="flex items-center gap-3 cursor-pointer py-2.5">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="font-medium text-sm">Personalization</p>
          <p className="text-xs text-muted-foreground">Manage your categories</p>
        </div>
      </DropdownMenuItem>

      <DropdownMenuItem onClick={onOpenProfile} className="flex items-center gap-3 cursor-pointer py-2.5">
        <Settings className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="font-medium text-sm">Settings</p>
          <p className="text-xs text-muted-foreground">Currency, display name</p>
        </div>
      </DropdownMenuItem>

      <DropdownMenuItem onClick={onOpenProfile} className="flex items-center gap-3 cursor-pointer py-2.5">
        <User className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="font-medium text-sm">Profile</p>
          <p className="text-xs text-muted-foreground">View your account</p>
        </div>
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem
        onClick={onSignOut}
        className="flex items-center gap-3 text-destructive focus:text-destructive cursor-pointer py-2.5"
      >
        <LogOut className="h-4 w-4" />
        <p className="font-medium text-sm">Sign out</p>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

// ─── Sidebar Profile Menu ─────────────────────────────────────────────────────
function SidebarProfileMenu({
  onSignOut,
  onOpenCategories,
  onOpenProfile,
}: {
  onSignOut: () => void;
  onOpenCategories: () => void;
  onOpenProfile: () => void;
}) {
  const { profile, authUser } = useUserProfile();
  const { state } = useSidebar();
  const displayName = profile?.display_name || authUser?.email?.split("@")[0] || "User";
  const initials = displayName.slice(0, 2).toUpperCase();
  const email = authUser?.email ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="w-full h-12 justify-start px-2.5 rounded-xl hover:bg-accent/10 transition-all text-left flex items-center gap-3 cursor-pointer group-data-[collapsible=icon]:!p-2"
        >
          {/* Avatar */}
          {profile?.avatar_url ? (
            <img 
              src={profile.avatar_url} 
              alt="Avatar" 
              className="h-9 w-9 group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-7 group-data-[collapsible=icon]:-translate-x-1.5 group-data-[collapsible=icon]:-translate-y-1 rounded-full object-cover flex-shrink-0 border border-border/40" 
            />
          ) : (
            <div className="h-9 w-9 group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-7 group-data-[collapsible=icon]:-translate-x-1.5 group-data-[collapsible=icon]:-translate-y-1 transform rounded-full bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center text-xs group-data-[collapsible=icon]:text-xs font-bold text-accent-foreground flex-shrink-0 shadow-sm transition-all">
              {initials}
            </div>
          )}
          {/* Name — hidden when sidebar is collapsed */}
          {state === "expanded" && (
            <div className="flex-1 min-w-0">
              <p className="font-serif font-semibold text-sm truncate leading-tight">{displayName}</p>
              <p className="text-[10px] text-muted-foreground truncate leading-tight">{email}</p>
            </div>
          )}
          {state === "expanded" && <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <ProfileDropdownContent
        displayName={displayName}
        email={email}
        onSignOut={onSignOut}
        onOpenCategories={onOpenCategories}
        onOpenProfile={onOpenProfile}
      />
    </DropdownMenu>
  );
}

// ─── Header Profile Menu (Mobile Only) ─────────────────────────────────────────
function HeaderProfileMenu({
  onSignOut,
  onOpenCategories,
  onOpenProfile,
}: {
  onSignOut: () => void;
  onOpenCategories: () => void;
  onOpenProfile: () => void;
}) {
  const { profile, authUser } = useUserProfile();
  const displayName = profile?.display_name || authUser?.email?.split("@")[0] || "User";
  const initials = displayName.slice(0, 2).toUpperCase();
  const email = authUser?.email ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {profile?.avatar_url ? (
          <button className="h-10 w-10 rounded-full overflow-hidden border border-border/40 flex-shrink-0 shadow-sm cursor-pointer hover:opacity-90 transition-opacity">
            <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
          </button>
        ) : (
          <button className="h-10 w-10 rounded-full bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center text-sm font-bold text-accent-foreground flex-shrink-0 shadow-sm cursor-pointer hover:opacity-90 transition-opacity">
            {initials}
          </button>
        )}
      </DropdownMenuTrigger>
      <ProfileDropdownContent
        displayName={displayName}
        email={email}
        onSignOut={onSignOut}
        onOpenCategories={onOpenCategories}
        onOpenProfile={onOpenProfile}
      />
    </DropdownMenu>
  );
}

// ─── Mobile Bottom Navigation ─────────────────────────────────────────────────
function MobileBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-16 border-t bg-background/80 backdrop-blur-md md:hidden flex items-center justify-around px-2 pb-safe shadow-sm">
      {items.filter(it => it.mobile).map((it) => {
        const isActive = path === it.url;
        return (
          <Link
            key={it.url}
            to={it.url}
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all ${
              isActive ? "text-accent scale-105" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <it.icon className="h-5.5 w-5.5 shrink-0" />
            <span className="text-[10px] font-medium tracking-tight font-serif">{it.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Layout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isPending = useRouterState({ select: (s) => s.status === "pending" });
  const isFetching = useIsFetching({ fetchStatus: "fetching" });
  const { profile, authUser } = useUserProfile();
  const displayName = profile?.display_name || authUser?.email?.split("@")[0] || "there";
  const isTxnsPage = path === "/transactions";

  // Show loader overlay when navigation is pending OR during initial queries fetching
  const showLoader = isPending || (isFetching > 0 && (!qc.getQueryData(["transactions"]) || !qc.getQueryData(["accounts"])));

  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const processingSubIds = useRef<Set<string>>(new Set());

  // Load queries inside Layout for notification computations
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: api.listAccounts,
    enabled: !!authUser,
  });

  const { data: txns = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => api.listTransactions(1000),
    enabled: !!authUser,
  });

  const { data: loans = [] } = useQuery({
    queryKey: ["loans"],
    queryFn: api.listLoans,
    enabled: !!authUser,
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: async () => {
      try {
        return await api.listSubscriptions();
      } catch (err: any) {
        // Safe check for table not existing yet during initial deployment
        if (err.code === "42P01") return [];
        throw err;
      }
    },
    enabled: !!authUser,
  });

  const { data: warranties = [] } = useQuery({
    queryKey: ["warranties"],
    queryFn: async () => {
      try {
        return await api.listWarranties();
      } catch (err: any) {
        if (err.code === "42P01") return [];
        throw err;
      }
    },
    enabled: !!authUser,
  });

  const { data: dbNotifications = [], refetch: refetchNotifications } = useQuery({
    queryKey: ["notifications", authUser?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("notifications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        if (error.code === "42P01") return [];
        throw error;
      }
      return data as NotificationItem[];
    },
    enabled: !!authUser,
  });

  const unreadCount = dbNotifications.filter((n) => !n.read).length;
  const last5Notifications = dbNotifications.slice(0, 5);

  async function markAllNotificationsRead() {
    if (!authUser) return;
    const { error } = await (supabase.from as any)("notifications")
      .update({ read: true })
      .eq("user_id", authUser.id)
      .eq("read", false);
    if (error) {
      console.error("Failed to mark notifications read:", error);
    } else {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  }

  useEffect(() => {
    if (!authUser || accounts.length === 0) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const latestBalances = computeAccountBalances(accounts, txns);
    const currency = profile?.currency || "USD";

    const newAlerts: any[] = [];

    // Helper to parse YYYY-MM-DD strictly in local timezone
    function parseLocalDate(dateStr: string) {
      const [year, month, day] = dateStr.split("-").map(Number);
      return new Date(year, month - 1, day, 0, 0, 0, 0);
    }

    // 1. Subscriptions Notifications Check
    for (const sub of subscriptions) {
      const nextDue = parseLocalDate(sub.next_due_date);

      let hasEnough = true;
      let accountNames = "";
      let shortAmount = 0;

      if (sub.is_split && sub.kind !== "transfer") {
        const splitsList = (Array.isArray(sub.splits) ? sub.splits : []) as any[];
        const names: string[] = [];
        for (const split of splitsList) {
          const balance = latestBalances.get(split?.accountId) ?? 0;
          const req = Number(split?.amount);
          const acc = accounts.find(a => a.id === split?.accountId);
          names.push(`${acc?.name || "Account"} (${fmtMoney(balance, currency)})`);
          if (balance < req) {
            hasEnough = false;
            shortAmount += (req - balance);
          }
        }
        accountNames = names.join(", ");
      } else {
        const balance = sub.account_id ? (latestBalances.get(sub.account_id) ?? 0) : 0;
        const acc = accounts.find(a => a.id === sub.account_id);
        accountNames = acc ? `${acc.name} (${fmtMoney(balance, currency)})` : "No account selected";
        if (balance < Number(sub.amount)) {
          hasEnough = false;
          shortAmount = Number(sub.amount) - balance;
        }
      }

      const diffTime = nextDue.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      const todayStr = today.toISOString().split("T")[0];

      if (diffDays >= 0 && diffDays <= 3) {
        const identifier = `sub-upcoming-${sub.id}-${sub.next_due_date}-${todayStr}`;
        if (hasEnough) {
          newAlerts.push({
            user_id: authUser.id,
            title: `Upcoming Subscription: ${sub.name}`,
            message: `"${sub.name}" (${fmtMoney(Number(sub.amount), currency)}) is due ${diffDays === 0 ? "today" : `in ${diffDays} day${diffDays > 1 ? "s" : ""}`}. Funds are available in ${accountNames} for auto-deduction.`,
            type: "info",
            identifier,
          });
        } else {
          newAlerts.push({
            user_id: authUser.id,
            title: `Upcoming Subscription Alert: ${sub.name}`,
            message: `"${sub.name}" (${fmtMoney(Number(sub.amount), currency)}) is due ${diffDays === 0 ? "today" : `in ${diffDays} day${diffDays > 1 ? "s" : ""}`}. Insufficient funds in ${accountNames} (Short by ${fmtMoney(shortAmount, currency)}). Please refill.`,
            type: "warning",
            identifier,
          });
        }
      } else if (diffDays < 0 && !hasEnough) {
        // Calculate how many months (payments) are overdue
        let missedCount = 0;
        let checkDate = new Date(nextDue);
        while (checkDate < today) {
          missedCount++;
          checkDate.setMonth(checkDate.getMonth() + 1);
        }

        const identifier = `sub-overdue-${sub.id}-${sub.next_due_date}-${todayStr}`;
        if (missedCount > 1) {
          newAlerts.push({
            user_id: authUser.id,
            title: `Subscription Overdue: ${sub.name}`,
            message: `"${sub.name}" is overdue by ${missedCount} months! Insufficient funds in ${accountNames}. Total outstanding for auto-deduction: ${fmtMoney(Number(sub.amount) * missedCount, currency)}.`,
            type: "critical",
            identifier,
          });
        } else {
          newAlerts.push({
            user_id: authUser.id,
            title: `Subscription Overdue: ${sub.name}`,
            message: `"${sub.name}" is overdue! Insufficient funds in ${accountNames} (Short by ${fmtMoney(shortAmount, currency)}).`,
            type: "critical",
            identifier,
          });
        }
      }
    }

    // 2. Loans Notifications Check
    for (const loan of loans) {
      if (loan.status !== "active" || !loan.due_date) continue;

      const due = parseLocalDate(loan.due_date);

      const diffTime = due.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      const todayStr = today.toISOString().split("T")[0];
      const identifier = `loan-${loan.id}-${loan.due_date}-${todayStr}`;

      if (diffDays >= 0 && diffDays <= 3) {
        newAlerts.push({
          user_id: authUser.id,
          title: "Loan Due Soon",
          message: `Loan with ${loan.person_name} (${fmtMoney(Number(loan.amount), currency)}) is due ${diffDays === 0 ? "today" : `in ${diffDays} day${diffDays > 1 ? "s" : ""}`}.`,
          type: "warning",
          identifier,
        });
      } else if (diffDays < 0) {
        newAlerts.push({
          user_id: authUser.id,
          title: "Loan Overdue",
          message: `Loan with ${loan.person_name} (${fmtMoney(Number(loan.amount), currency)}) is overdue!`,
          type: "critical",
          identifier: `loan-overdue-${loan.id}-${loan.due_date}-${todayStr}`,
        });
      }
    }

    // 3. Warranties Notifications Check
    for (const w of warranties) {
      if (!w.expiry_date) continue;

      const expiry = parseLocalDate(w.expiry_date);
      const diffTime = expiry.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      const todayStr = today.toISOString().split("T")[0];
      
      const alertDays = [30, 15, 7, 3, 2, 1, 0];

      if (alertDays.includes(diffDays)) {
        const identifier = `warranty-expire-${w.id}-${diffDays}-${todayStr}`;
        const dayMsg = diffDays === 0 ? "today" : diffDays === 1 ? "tomorrow" : `in ${diffDays} days`;
        newAlerts.push({
          user_id: authUser.id,
          title: "Warranty Expiring Soon",
          message: `Warranty for "${w.title}" (${fmtMoney(Number(w.amount), currency)}) expires ${dayMsg}!`,
          type: diffDays <= 3 ? "critical" : "warning",
          identifier,
        });
      } else if (diffDays < 0) {
        const identifier = `warranty-expired-${w.id}-${todayStr}`;
        newAlerts.push({
          user_id: authUser.id,
          title: "Warranty Expired",
          message: `Warranty for "${w.title}" expired on ${new Date(w.expiry_date).toLocaleDateString()}!`,
          type: "critical",
          identifier,
        });
      }
    }

    if (newAlerts.length === 0) return;

    async function insertAlerts() {
      try {
        const existingIdentifiers = new Set(dbNotifications.map(n => n.identifier));
        const alertsToInsert = newAlerts.filter(alert => !existingIdentifiers.has(alert.identifier));

        if (alertsToInsert.length === 0) return;

        const { error } = await (supabase.from as any)("notifications").insert(alertsToInsert);
        if (error && error.code !== "23505" && error.code !== "42P01") {
          console.error("Failed to insert notifications:", error);
        } else {
          qc.invalidateQueries({ queryKey: ["notifications"] });
        }
      } catch (e) {
        console.error(e);
      }
    }

    insertAlerts();
  }, [subscriptions, loans, warranties, accounts, txns, dbNotifications, authUser, profile?.currency, qc]);

  // Comprehensive click-to-sync notifications handler (updates and loads on bell click without page refresh)
  async function syncNotifications() {
    if (!authUser) return;
    try {
      // 1. Refetch all source queries in parallel to get latest database records
      const [freshSubs, freshLoans, freshAccounts, freshTxns, freshWarranties] = await Promise.all([
        api.listSubscriptions(),
        api.listLoans(),
        api.listAccounts(),
        api.listTransactions(1000),
        api.listWarranties().catch(() => []),
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const latestBalances = computeAccountBalances(freshAccounts, freshTxns);
      const currency = profile?.currency || "USD";
      const newAlerts: any[] = [];

      // Helper to parse YYYY-MM-DD strictly in local timezone
      function parseLocalDate(dateStr: string) {
        const [year, month, day] = dateStr.split("-").map(Number);
        return new Date(year, month - 1, day, 0, 0, 0, 0);
      }

      // Subscriptions
      for (const sub of freshSubs) {
        const nextDue = parseLocalDate(sub.next_due_date);
        let hasEnough = true;
        let accountNames = "";
        let shortAmount = 0;

        if (sub.is_split && sub.kind !== "transfer") {
          const splitsList = (Array.isArray(sub.splits) ? sub.splits : []) as any[];
          const names: string[] = [];
          for (const split of splitsList) {
            const balance = latestBalances.get(split?.accountId) ?? 0;
            const req = Number(split?.amount);
            const acc = freshAccounts.find(a => a.id === split?.accountId);
            names.push(`${acc?.name || "Account"} (${fmtMoney(balance, currency)})`);
            if (balance < req) {
              hasEnough = false;
              shortAmount += (req - balance);
            }
          }
          accountNames = names.join(", ");
        } else {
          const balance = sub.account_id ? (latestBalances.get(sub.account_id) ?? 0) : 0;
          const acc = freshAccounts.find(a => a.id === sub.account_id);
          accountNames = acc ? `${acc.name} (${fmtMoney(balance, currency)})` : "No account selected";
          if (balance < Number(sub.amount)) {
            hasEnough = false;
            shortAmount = Number(sub.amount) - balance;
          }
        }

        const diffTime = nextDue.getTime() - today.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        const todayStr = today.toISOString().split("T")[0];

        if (diffDays >= 0 && diffDays <= 3) {
          const identifier = `sub-upcoming-${sub.id}-${sub.next_due_date}-${todayStr}`;
          if (hasEnough) {
            newAlerts.push({
              user_id: authUser.id,
              title: `Upcoming Subscription: ${sub.name}`,
              message: `"${sub.name}" (${fmtMoney(Number(sub.amount), currency)}) is due ${diffDays === 0 ? "today" : `in ${diffDays} day${diffDays > 1 ? "s" : ""}`}. Funds are available in ${accountNames} for auto-deduction.`,
              type: "info",
              identifier,
            });
          } else {
            newAlerts.push({
              user_id: authUser.id,
              title: `Upcoming Subscription Alert: ${sub.name}`,
              message: `"${sub.name}" (${fmtMoney(Number(sub.amount), currency)}) is due ${diffDays === 0 ? "today" : `in ${diffDays} day${diffDays > 1 ? "s" : ""}`}. Insufficient funds in ${accountNames} (Short by ${fmtMoney(shortAmount, currency)}). Please refill.`,
              type: "warning",
              identifier,
            });
          }
        } else if (diffDays < 0 && !hasEnough) {
          let missedCount = 0;
          let checkDate = new Date(nextDue);
          while (checkDate < today) {
            missedCount++;
            checkDate.setMonth(checkDate.getMonth() + 1);
          }
          const identifier = `sub-overdue-${sub.id}-${sub.next_due_date}-${todayStr}`;
          if (missedCount > 1) {
            newAlerts.push({
              user_id: authUser.id,
              title: `Subscription Overdue: ${sub.name}`,
              message: `"${sub.name}" is overdue by ${missedCount} months! Insufficient funds in ${accountNames}. Total outstanding for auto-deduction: ${fmtMoney(Number(sub.amount) * missedCount, currency)}.`,
              type: "critical",
              identifier,
            });
          } else {
            newAlerts.push({
              user_id: authUser.id,
              title: `Subscription Overdue: ${sub.name}`,
              message: `"${sub.name}" is overdue! Insufficient funds in ${accountNames} (Short by ${fmtMoney(shortAmount, currency)}).`,
              type: "critical",
              identifier,
            });
          }
        }
      }

      // Loans
      for (const loan of freshLoans) {
        if (loan.status !== "active" || !loan.due_date) continue;
        const due = parseLocalDate(loan.due_date);
        const diffTime = due.getTime() - today.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        const todayStr = today.toISOString().split("T")[0];
        const identifier = `loan-${loan.id}-${loan.due_date}-${todayStr}`;

        if (diffDays >= 0 && diffDays <= 3) {
          newAlerts.push({
            user_id: authUser.id,
            title: "Loan Due Soon",
            message: `Loan with ${loan.person_name} (${fmtMoney(Number(loan.amount), currency)}) is due ${diffDays === 0 ? "today" : `in ${diffDays} day${diffDays > 1 ? "s" : ""}`}.`,
            type: "warning",
            identifier,
          });
        } else if (diffDays < 0) {
          newAlerts.push({
            user_id: authUser.id,
            title: "Loan Overdue",
            message: `Loan with ${loan.person_name} (${fmtMoney(Number(loan.amount), currency)}) is overdue!`,
            type: "critical",
            identifier: `loan-overdue-${loan.id}-${loan.due_date}-${todayStr}`,
          });
        }
      }

      // Warranties
      for (const w of freshWarranties) {
        if (!w.expiry_date) continue;
        const expiry = parseLocalDate(w.expiry_date);
        const diffTime = expiry.getTime() - today.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        const todayStr = today.toISOString().split("T")[0];
        const alertDays = [30, 15, 7, 3, 2, 1, 0];

        if (alertDays.includes(diffDays)) {
          const identifier = `warranty-expire-${w.id}-${diffDays}-${todayStr}`;
          const dayMsg = diffDays === 0 ? "today" : diffDays === 1 ? "tomorrow" : `in ${diffDays} days`;
          newAlerts.push({
            user_id: authUser.id,
            title: "Warranty Expiring Soon",
            message: `Warranty for "${w.title}" (${fmtMoney(Number(w.amount), currency)}) expires ${dayMsg}!`,
            type: diffDays <= 3 ? "critical" : "warning",
            identifier,
          });
        } else if (diffDays < 0) {
          const identifier = `warranty-expired-${w.id}-${todayStr}`;
          newAlerts.push({
            user_id: authUser.id,
            title: "Warranty Expired",
            message: `Warranty for "${w.title}" expired on ${new Date(w.expiry_date).toLocaleDateString()}!`,
            type: "critical",
            identifier,
          });
        }
      }

      // 2. Load what is currently in the DB notifications table
      const { data: dbNotifs = [] } = await (supabase.from as any)("notifications").select("identifier");
      const existingIdentifiers = new Set((dbNotifs || []).map((n: any) => n.identifier));

      const alertsToInsert = newAlerts.filter(alert => !existingIdentifiers.has(alert.identifier));

      if (alertsToInsert.length > 0) {
        await (supabase.from as any)("notifications").insert(alertsToInsert);
      }

      // 3. Force invalidate and refetch the notifications query so the UI updates in real-time
      await qc.refetchQueries({ queryKey: ["notifications"] });
      // Also update local cache for other collections
      qc.setQueryData(["subscriptions"], freshSubs);
      qc.setQueryData(["loans"], freshLoans);
      qc.setQueryData(["accounts"], freshAccounts);
      qc.setQueryData(["transactions"], freshTxns);
      qc.setQueryData(["warranties"], freshWarranties);

    } catch (err) {
      console.error("Failed to sync notifications", err);
    }
  }

  // Auto-deduction loop
  const [runningDeduction, setRunningDeduction] = useState(false);

  useEffect(() => {
    if (!authUser || subscriptions.length === 0 || runningDeduction || accounts.length === 0) return;

    const todayStr = new Date().toISOString().split("T")[0];
    const dueSubs = subscriptions.filter(s => s.next_due_date <= todayStr && !processingSubIds.current.has(s.id));

    if (dueSubs.length === 0) return;

    async function runAutoDeductions() {
      setRunningDeduction(true);
      const updatedAccounts = [...accounts];
      const updatedTxns = [...txns];

      for (const sub of dueSubs) {
        // Double check lock to avoid concurrent race conditions
        if (processingSubIds.current.has(sub.id)) continue;
        
        const balances = computeAccountBalances(updatedAccounts, updatedTxns);
        let hasEnough = true;

        if (sub.is_split && sub.kind !== "transfer") {
          const splitsList = (Array.isArray(sub.splits) ? sub.splits : []) as any[];
          for (const split of splitsList) {
            const accId = split?.accountId;
            const required = Number(split?.amount);
            const balance = balances.get(accId) ?? 0;
            if (balance < required) {
              hasEnough = false;
              break;
            }
          }
        } else {
          const accId = sub.account_id;
          const required = Number(sub.amount);
          const balance = accId ? (balances.get(accId) ?? 0) : 0;
          if (balance < required) {
            hasEnough = false;
          }
        }

        if (hasEnough && authUser) {
          // Lock the subscription immediately
          processingSubIds.current.add(sub.id);
          
          try {
            const inserts: any[] = [];
            const timestamp = new Date().toISOString();
            
            if (sub.is_split && sub.kind !== "transfer") {
              const splitsList = (Array.isArray(sub.splits) ? sub.splits : []) as any[];
              for (const split of splitsList) {
                inserts.push({
                  user_id: authUser.id,
                  account_id: split?.accountId,
                  amount: Number(split?.amount),
                  kind: sub.kind,
                  category_id: sub.category_id || null,
                  note: `Auto-Paid: ${sub.name}${sub.note ? ` (${sub.note})` : ""}`,
                  occurred_on: sub.next_due_date,
                });
              }
            } else {
              inserts.push({
                user_id: authUser.id,
                account_id: sub.account_id,
                to_account_id: sub.to_account_id || null,
                amount: Number(sub.amount),
                kind: sub.kind,
                category_id: sub.category_id || null,
                note: `Auto-Paid: ${sub.name}${sub.note ? ` (${sub.note})` : ""}`,
                occurred_on: sub.next_due_date,
              });
            }

            const { error: txnErr } = await supabase.from("transactions").insert(inserts);
            if (txnErr) throw txnErr;

            // Calculate next future due date (advances straight to the next billing date in the future)
            const todayDate = new Date();
            todayDate.setHours(0, 0, 0, 0);

            let nextDueDate = new Date(sub.next_due_date);
            nextDueDate.setHours(0, 0, 0, 0);

            while (nextDueDate <= todayDate) {
              nextDueDate.setMonth(nextDueDate.getMonth() + 1);
            }
            const nextDueDateStr = nextDueDate.toISOString().split("T")[0];

            const { error: subErr } = await supabase
              .from("subscriptions")
              .update({
                next_due_date: nextDueDateStr,
                last_payment_date: todayStr,
                updated_at: new Date().toISOString(),
              })
              .eq("id", sub.id);
            if (subErr) throw subErr;

            toast.success(`Subscription "${sub.name}" auto-deducted successfully!`);

            qc.invalidateQueries({ queryKey: ["transactions"] });
            qc.invalidateQueries({ queryKey: ["accounts"] });
            qc.invalidateQueries({ queryKey: ["subscriptions"] });
          } catch (err: any) {
            console.error("Auto-deduction failed", err);
            // Unlock on failure so it can retry
            processingSubIds.current.delete(sub.id);
          }
        }
      }
      setRunningDeduction(false);
    }

    runAutoDeductions();
  }, [subscriptions, accounts, txns, authUser, runningDeduction, qc]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <SidebarProvider>
      {showLoader && (
        <div className="fixed inset-0 bg-background/60 backdrop-blur-[2px] z-[100] flex flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-serif text-2xl font-black animate-pulse shadow-lg ring-4 ring-accent/15">
              F
            </div>
            <span className="text-[10px] text-muted-foreground font-serif tracking-[0.25em] uppercase animate-pulse">FinorAsset</span>
          </div>
        </div>
      )}

      {/* ── Left Sidebar ── */}
      <Sidebar collapsible="icon">

        {/* Header: logo + hover-reveal trigger */}
        <SidebarHeader>
          <SidebarLogoHeader />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            {/* No "Workspace" label — removed as requested */}
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((it) => (
                  <SidebarMenuItem key={it.url} className="px-2">
                    <SidebarMenuButton
                      asChild
                      isActive={path === it.url}
                      className="h-11 text-sm md:text-base font-semibold font-serif px-3"
                    >
                      <Link to={it.url} className="flex items-center gap-3">
                        <it.icon className="h-5 w-5 shrink-0" />
                        <span>{it.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-2">
          <SidebarMenu>
            <SidebarMenuItem className="px-2">
              <SidebarProfileMenu
                onSignOut={signOut}
                onOpenCategories={() => setCategoriesOpen(true)}
                onOpenProfile={() => setProfileOpen(true)}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-background min-h-svh">

        {/* Top bar — cleaner, with centered greeting */}
        <header className="relative flex flex-col justify-center md:flex-row md:items-center border-b px-4 md:px-6 bg-background/80 backdrop-blur-sm sticky top-0 z-10 h-24 md:h-20 gap-1 md:gap-0">
          
          {/* Mobile Layout (Logo row + Greeting row) */}
          <div className="md:hidden flex flex-col w-full">
            {/* Top row: Logo + Actions */}
            <div className="flex items-center justify-between w-full">
              <TopBarLogo />
              <div className="flex items-center gap-2">
                <NotificationBell 
                  notifications={last5Notifications} 
                  unreadCount={unreadCount} 
                  onMarkAllRead={markAllNotificationsRead} 
                  onBellClick={() => syncNotifications()}
                />
                <TransactionDialog
                  trigger={
                    <Button 
                      size="default" 
                      className="group relative gap-1.5 font-bold rounded-full h-9 px-3.5 bg-primary hover:bg-[#2c2826] text-primary-foreground text-xs transition-all duration-300 hover:scale-[1.04] active:scale-[0.96] shadow-sm border border-primary/10 cursor-pointer"
                      id="header-new-txn-btn"
                    >
                      <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90 text-accent" />
                      <span className="tracking-tight">Add</span>
                    </Button>
                  }
                />
                <HeaderProfileMenu
                  onSignOut={signOut}
                  onOpenCategories={() => setCategoriesOpen(true)}
                  onOpenProfile={() => setProfileOpen(true)}
                />
              </div>
            </div>
            {/* Bottom row: Greeting + Date */}
            <div className="flex items-baseline justify-between w-full mt-1.5">
              <span className="text-xs font-serif font-black tracking-tight text-foreground select-none">
                {greetTime()}, {displayName}.
              </span>
              <span className="text-[9px] text-muted-foreground font-serif">
                {new Date().toLocaleDateString(undefined, {
                  weekday: "short", month: "short", day: "numeric",
                })}
              </span>
            </div>
          </div>

          {/* Desktop Layout (Logo left, centered greeting, actions right) */}
          {/* Desktop Logo */}
          <div className="hidden md:flex items-center gap-2 z-10">
            <TopBarLogo />
          </div>

          {/* Desktop Center Greeting */}
          <div className="absolute inset-0 hidden md:flex flex-col items-center justify-center pointer-events-none">
            <p className="font-serif text-lg md:text-xl font-black tracking-tight">
              {greetTime()}, {displayName}.
            </p>
            <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 font-medium">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              })}
            </p>
          </div>

          {/* Desktop Right Actions */}
          <div className="hidden md:flex ml-auto items-center gap-3 z-10">
            <NotificationBell 
              notifications={last5Notifications} 
              unreadCount={unreadCount} 
              onMarkAllRead={markAllNotificationsRead} 
              onBellClick={() => syncNotifications()}
            />
            <TransactionDialog
              trigger={
                <Button 
                  size="default" 
                  className="group relative gap-2.5 font-bold rounded-full h-12 px-6 bg-primary hover:bg-[#2c2826] text-primary-foreground text-sm sm:text-base transition-all duration-300 hover:scale-[1.04] active:scale-[0.96] shadow-md hover:shadow-[0_4px_20px_rgba(217,119,6,0.25)] border border-primary/10 cursor-pointer"
                  id="header-new-txn-btn"
                >
                  <Plus className="h-5 w-5 transition-transform duration-300 group-hover:rotate-90 text-accent" />
                  <span className="tracking-tight">Add Transaction</span>
                </Button>
              }
            />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-x-hidden min-w-0 flex flex-col justify-between pb-20 md:pb-6">
          <div key={path} className="flex-1 page-transition relative flex flex-col">
            <Outlet />
          </div>
          <footer className={`mt-6 pt-3 border-t text-center text-xs text-muted-foreground font-serif tracking-wider${path === "/transactions" ? " hidden" : path !== "/" ? " hidden md:block" : ""}`}>
            © {new Date().getFullYear()} FINORASSET &middot; Personal Finance Compass &middot; Designed by Mahmudul Mashrafe
          </footer>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* ── Dialog Overlays ── */}
      <CategoriesDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} />
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </SidebarProvider>
  );
}
