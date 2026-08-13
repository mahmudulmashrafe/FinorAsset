import { Bell, AlertTriangle, AlertCircle, X, Trash2 } from "lucide-react";
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
  type: "warning" | "critical" | "info" | string;
  read: boolean;
  created_at?: string;
}

export function NotificationBell({
  notifications,
  unreadCount,
  onMarkAllRead,
  onDeleteNotification,
  onClearAll,
  onBellClick,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onDeleteNotification?: (id: string) => void;
  onClearAll?: () => void;
  onBellClick?: () => void;
}) {
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => { if (open && onBellClick) onBellClick(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative cursor-pointer rounded-full h-9 w-9 bg-card/60 border hover:bg-accent/10 transition-colors">
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1.5 -right-1.5 h-4.5 min-w-4.5 flex items-center justify-center p-0.5 text-[9px] font-bold bg-destructive text-destructive-foreground animate-pulse rounded-full border-2 border-background">
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[380px] overflow-y-auto thin-scroll z-[150] p-1.5 rounded-xl shadow-xl">
        <div className="px-3 py-2 text-xs font-serif font-black text-foreground border-b border-border/40 flex items-center justify-between">
          <span>Notifications</span>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkAllRead();
                }}
                className="text-[9px] text-accent hover:underline font-sans font-semibold cursor-pointer"
              >
                Mark all as read
              </button>
            )}
            {notifications.length > 0 && onClearAll && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearAll();
                }}
                className="text-[9px] text-muted-foreground hover:text-destructive hover:underline font-sans font-semibold cursor-pointer"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
        {notifications.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground font-serif italic">
            No notifications.
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {notifications.map((n) => (
              <div key={n.id} className={`group relative flex gap-2.5 items-start py-2.5 px-3 transition-colors select-none rounded-lg ${!n.read ? 'bg-accent/5' : 'hover:bg-muted/40'}`}>
                {n.type === "critical" ? (
                  <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5 min-w-0 flex-1 pr-5">
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-[11px] font-bold text-foreground leading-none">{n.title}</div>
                    {!n.read && (
                      <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-snug break-words">{n.message}</div>
                </div>
                {onDeleteNotification && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNotification(n.id);
                    }}
                    className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive hover:bg-muted/80 rounded transition-all cursor-pointer"
                    title="Dismiss notification"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
