import { Bell, AlertTriangle, AlertCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: "warning" | "critical";
}

export function NotificationBell({ notifications }: { notifications: NotificationItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative cursor-pointer rounded-full h-9 w-9 bg-card/60 border hover:bg-accent/10 transition-colors">
          <Bell className="h-4.5 w-4.5" />
          {notifications.length > 0 && (
            <Badge className="absolute -top-1.5 -right-1.5 h-4.5 min-w-4.5 flex items-center justify-center p-0.5 text-[9px] font-bold bg-destructive text-destructive-foreground animate-pulse rounded-full border-2 border-background">
              {notifications.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[350px] overflow-y-auto thin-scroll z-[150] p-1.5 rounded-xl border bg-background/95 backdrop-blur-md shadow-xl">
        <div className="px-3 py-2 text-xs font-serif font-black text-foreground border-b border-border/40">
          Notifications ({notifications.length})
        </div>
        {notifications.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground font-serif italic">
            No new notifications.
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {notifications.map((n) => (
              <DropdownMenuItem key={n.id} className="flex gap-2.5 items-start py-2.5 px-3 focus:bg-accent/10 focus:text-accent-foreground outline-none transition-colors select-none">
                {n.type === "critical" ? (
                  <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5 min-w-0">
                  <div className="text-[11px] font-bold text-foreground leading-none">{n.title}</div>
                  <div className="text-[10px] text-muted-foreground leading-snug break-words">{n.message}</div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
