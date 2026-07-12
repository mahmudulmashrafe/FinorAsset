import { useState } from "react";
import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Receipt, Wallet, PiggyBank, BarChart3, LogOut, User, Tag, Plus, ChevronDown, Settings, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useUserProfile } from "@/hooks/use-user-profile";
import { TransactionDialog } from "@/components/transaction-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoriesDialog } from "@/components/categories-dialog";
import { ProfileDialog } from "@/components/profile-dialog";

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
  { title: "Dashboard",    url: "/dashboard",    icon: LayoutDashboard },
  { title: "Transactions", url: "/transactions", icon: Receipt },
  { title: "Accounts",     url: "/accounts",     icon: Wallet },
  { title: "Budgets",      url: "/budgets",      icon: PiggyBank },
  { title: "Stats",        url: "/stats",        icon: BarChart3 },
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
  const { state } = useSidebar();
  if (state === "expanded") {
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
          className="w-full h-14 justify-start px-2.5 rounded-xl hover:bg-accent/10 transition-all text-left flex items-center gap-3 cursor-pointer group-data-[collapsible=icon]:!p-2"
        >
          {/* Avatar */}
          <div className="h-10 w-10 group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-7 group-data-[collapsible=icon]:-translate-x-1.5 group-data-[collapsible=icon]:-translate-y-1 transform rounded-full bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center text-sm group-data-[collapsible=icon]:text-xs font-bold text-accent-foreground flex-shrink-0 shadow-sm transition-all">
            {initials}
          </div>
          {/* Name — hidden when sidebar is collapsed */}
          {state === "expanded" && (
            <div className="flex-1 min-w-0">
              <p className="font-serif font-semibold text-base truncate leading-tight">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate leading-tight">{email}</p>
            </div>
          )}
          {state === "expanded" && <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-64 mb-1">
        {/* User info header */}
        <div className="px-3 py-3 border-b">
          <p className="font-serif font-bold text-base truncate">{displayName}</p>
          <p className="text-sm text-muted-foreground truncate">{email}</p>
        </div>

        {/* Menu items */}
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
    </DropdownMenu>
  );
}

function Layout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { profile, authUser } = useUserProfile();
  const displayName = profile?.display_name || authUser?.email?.split("@")[0] || "there";

  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <SidebarProvider>
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
                      className="h-14 text-xl md:text-2xl font-semibold font-serif px-4"
                    >
                      <Link to={it.url} className="flex items-center gap-4">
                        <it.icon className="h-7 w-7 shrink-0" />
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

        {/* Top bar — taller, with centered greeting */}
        <header className="relative flex h-28 items-center border-b px-4 md:px-6 bg-background/80 backdrop-blur-sm sticky top-0 z-10">

          {/* Left: Logo */}
          <TopBarLogo />

          {/* Center: greeting + full date — absolutely centered */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="font-serif text-2xl md:text-3xl font-black tracking-tight">
              {greetTime()}, {displayName}.
            </p>
            <p className="text-sm md:text-base text-muted-foreground mt-0.5 font-medium">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              })}
            </p>
          </div>

          {/* Right: Add */}
          <div className="ml-auto flex items-center gap-2 md:gap-3 z-10">
            <TransactionDialog
              trigger={
                <Button 
                  size="default" 
                  className="group relative gap-2.5 font-bold rounded-full h-12 px-4 sm:px-6 bg-primary hover:bg-[#2c2826] text-primary-foreground text-sm sm:text-base transition-all duration-300 hover:scale-[1.04] active:scale-[0.96] shadow-md hover:shadow-[0_4px_20px_rgba(217,119,6,0.25)] border border-primary/10 cursor-pointer"
                  id="header-new-txn-btn"
                >
                  <Plus className="h-5 w-5 transition-transform duration-300 group-hover:rotate-90 text-accent" />
                  <span className="hidden sm:inline tracking-tight">Add Transaction</span>
                </Button>
              }
            />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-x-hidden min-w-0 flex flex-col justify-between">
          <div className="flex-1">
            <Outlet />
          </div>
          <footer className="mt-12 pt-6 border-t text-center text-xs text-muted-foreground font-serif tracking-wider">
            © {new Date().getFullYear()} FINORASSET &middot; Personal Finance Compass &middot; Designed by Mahmudul Mashrafe
          </footer>
        </main>
      </div>

      {/* ── Dialog Overlays ── */}
      <CategoriesDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} />
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </SidebarProvider>

  );
}
