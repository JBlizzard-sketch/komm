import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Send,
  Users,
  FolderOpen,
  FileText,
  Inbox,
  Menu,
  MessageSquare,
  ChevronRight,
  Settings2,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetDashboardStats, getGetDashboardStatsQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/groups", label: "Groups", icon: FolderOpen },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/reports", label: "Reports", icon: BarChart2 },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function NavLink({
  href,
  label,
  icon: Icon,
  badge,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
  collapsed: boolean;
}) {
  const [location] = useLocation();
  const active = location === href || (href !== "/dashboard" && location.startsWith(href));

  return (
    <Link href={href}>
      <div
        data-testid={`nav-${label.toLowerCase()}`}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer relative group",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
      >
        <Icon className={cn("shrink-0", collapsed ? "w-5 h-5" : "w-4 h-4")} />
        {!collapsed && <span className="flex-1 truncate">{label}</span>}
        {!collapsed && badge !== undefined && badge > 0 && (
          <Badge className="bg-amber-500 text-white text-xs px-1.5 py-0 min-w-5 h-5 flex items-center justify-center">
            {badge > 99 ? "99+" : badge}
          </Badge>
        )}
        {collapsed && badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full text-[10px] text-white flex items-center justify-center">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: stats } = useGetDashboardStats({
    query: { queryKey: getGetDashboardStatsQueryKey() },
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 shrink-0",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {/* Logo */}
        <div className={cn("flex items-center h-14 border-b border-sidebar-border px-3 shrink-0", collapsed ? "justify-center" : "gap-2 px-4")}>
          {!collapsed && (
            <div className="flex items-center gap-2 flex-1">
              <div className="w-7 h-7 rounded-md bg-sidebar-primary flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-sidebar-foreground text-base tracking-tight">Komm</span>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-md bg-sidebar-primary flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
          )}
          <button
            data-testid="sidebar-toggle"
            onClick={() => setCollapsed((c) => !c)}
            className={cn("text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors", collapsed && "hidden")}
          >
            <ChevronRight className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {collapsed && (
            <button
              data-testid="sidebar-expand"
              onClick={() => setCollapsed(false)}
              className="w-full flex items-center justify-center py-2 text-sidebar-foreground/50 hover:text-sidebar-foreground mb-2"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              collapsed={collapsed}
              badge={item.label === "Inbox" ? stats?.unreadReplies : undefined}
            />
          ))}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="p-3 border-t border-sidebar-border">
            <p className="text-xs text-sidebar-foreground/30 text-center">Komm v1.0</p>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
