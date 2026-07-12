import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "FinorAsset — A warm place for your money" },
      { name: "description", content: "Personal finance for people who like their numbers neat and their pages quiet. Track transactions, accounts, budgets and trends." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col justify-between relative">
      {/* Premium subtle background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,oklch(0.72_0.16_55_/_8%),transparent_50%)] pointer-events-none" />

      {/* Header navbar - Large logo and navigation */}
      <header className="w-full border-b bg-background/50 backdrop-blur-sm sticky top-0 z-50 h-20 md:h-28 flex items-center">
        <div className="flex w-full items-center justify-between px-4 md:px-12 lg:px-20 py-2 md:py-4">
          <div className="flex items-center gap-2 md:gap-4 font-serif text-xl md:text-3xl font-black select-none">
            <span className="relative flex h-5 w-5 md:h-7 md:w-7 flex-shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-3 w-3 md:h-4 md:w-4 rounded-full bg-accent shadow-[0_0_12px_rgba(217,119,6,0.5)]" />
            </span>
            <span>FinorAsset</span>
          </div>
          <nav className="flex items-center gap-3 md:gap-6 text-sm md:text-xl font-bold">
            <Link to="/auth" className="text-muted-foreground hover:text-foreground transition-colors">Sign in</Link>
            <Link to="/auth" className="rounded-full bg-primary hover:bg-[#2c2826] px-4 py-2 md:px-6 md:py-3 text-primary-foreground transition-all duration-300 hover:scale-105 active:scale-95 shadow-sm">Get started</Link>
          </nav>
        </div>
      </header>

      {/* Main hero - centered vertically and horizontally, compact (fits on single screen) */}
      <main className="flex-1 flex flex-col items-center justify-center w-full px-4 md:px-12 lg:px-20 py-8 relative z-10">
        <div className="max-w-4xl flex flex-col items-center text-center">
          <p className="text-[10px] md:text-sm uppercase tracking-[0.3em] text-muted-foreground/80 font-bold">Vol. 01 — Personal Finance</p>
          <h1 className="mt-3 md:mt-5 font-serif text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08]">
            A warm, quiet place <br />
            <em className="text-accent not-italic">for your money.</em>
          </h1>
          <p className="mt-4 md:mt-6 max-w-2xl text-sm md:text-lg text-muted-foreground/90 leading-relaxed mx-auto">
            FinorAsset is a personal finance journal — track transactions, balance your wallets, set monthly budgets,
            and watch your trends unfold in unhurried, beautiful charts.
          </p>
          
          <div className="mt-6 md:mt-10 flex flex-wrap justify-center gap-4">
            <Link 
              to="/auth" 
              className="group inline-flex items-center gap-2.5 rounded-full bg-primary hover:bg-[#2c2826] px-6 py-3 md:px-8 md:py-4 text-primary-foreground text-sm md:text-lg font-bold transition-all duration-300 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg hover:shadow-accent/15"
            >
              Start tracking 
              <ArrowRight className="h-4 w-4 md:h-5 md:w-5 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/5 w-full relative z-10 h-16 flex items-center justify-center px-4">
        <div className="text-center text-[10px] sm:text-xs text-muted-foreground font-serif tracking-wider leading-relaxed">
          © {new Date().getFullYear()} FINORASSET &middot; Personal Finance Compass &middot; Designed by Mahmudul Mashrafe
        </div>
      </footer>
    </div>
  );
}
