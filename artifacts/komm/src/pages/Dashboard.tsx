import { Link } from "wouter";
import {
  Users,
  Send,
  TrendingUp,
  MessageSquare,
  CalendarClock,
  Inbox,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  useGetDashboardStats,
  useGetDashboardActivity,
  useGetDeliveryTrend,
  useGetChannelBreakdown,
  getGetDashboardStatsQueryKey,
  getGetDashboardActivityQueryKey,
  getGetDeliveryTrendQueryKey,
  getGetChannelBreakdownQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";

const CHANNEL_COLORS: Record<string, string> = {
  sms: "#1e7e4f",
  whatsapp: "#25D366",
  email: "#f59e0b",
};

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
  loading,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <Card data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-24 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
            )}
            {sub && !loading && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  campaign_sent: "Sent",
  campaign_scheduled: "Scheduled",
  contact_imported: "Imported",
  reply_received: "Reply",
};

const ACTIVITY_TYPE_COLOR: Record<string, string> = {
  campaign_sent: "bg-primary/10 text-primary",
  campaign_scheduled: "bg-amber-100 text-amber-800",
  contact_imported: "bg-blue-100 text-blue-800",
  reply_received: "bg-purple-100 text-purple-800",
};

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: { queryKey: getGetDashboardStatsQueryKey() },
  });
  const { data: activity, isLoading: activityLoading } = useGetDashboardActivity(
    { limit: 8 },
    { query: { queryKey: getGetDashboardActivityQueryKey({ limit: 8 }) } }
  );
  const { data: trend, isLoading: trendLoading } = useGetDeliveryTrend({
    query: { queryKey: getGetDeliveryTrendQueryKey() },
  });
  const { data: channelBreakdown, isLoading: channelLoading } = useGetChannelBreakdown({
    query: { queryKey: getGetChannelBreakdownQueryKey() },
  });

  const trendData = (trend ?? []).map((d) => ({
    ...d,
    label: format(new Date(d.date), "MMM d"),
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, d MMMM yyyy")}
          </p>
        </div>
        <Link href="/campaigns/new">
          <Button data-testid="button-new-campaign" size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            New Campaign
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <div className="col-span-2 lg:col-span-1 xl:col-span-1">
          <StatCard
            label="Total Contacts"
            value={stats?.totalContacts?.toLocaleString() ?? 0}
            icon={Users}
            loading={statsLoading}
          />
        </div>
        <div className="col-span-2 lg:col-span-1 xl:col-span-1">
          <StatCard
            label="Total Campaigns"
            value={stats?.totalCampaigns?.toLocaleString() ?? 0}
            icon={Send}
            loading={statsLoading}
          />
        </div>
        <div className="col-span-2 lg:col-span-1 xl:col-span-1">
          <StatCard
            label="Sent This Month"
            value={stats?.messagesSentThisMonth?.toLocaleString() ?? 0}
            icon={TrendingUp}
            loading={statsLoading}
          />
        </div>
        <div className="col-span-2 lg:col-span-1 xl:col-span-1">
          <StatCard
            label="Delivery Rate"
            value={`${stats?.deliveryRate ?? 0}%`}
            icon={MessageSquare}
            loading={statsLoading}
          />
        </div>
        <div className="col-span-2 lg:col-span-1 xl:col-span-1">
          <StatCard
            label="Scheduled"
            value={stats?.scheduledCampaigns ?? 0}
            icon={CalendarClock}
            loading={statsLoading}
          />
        </div>
        <div className="col-span-2 lg:col-span-1 xl:col-span-1">
          <StatCard
            label="Unread Replies"
            value={stats?.unreadReplies ?? 0}
            icon={Inbox}
            loading={statsLoading}
          />
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        {/* Delivery trend */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Message Volume — Last 30 Days</CardTitle>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : trendData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                No data yet. Send your first campaign to see trends.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={192}>
                <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="sms" name="SMS" stroke="#1e7e4f" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="whatsapp" name="WhatsApp" stroke="#25D366" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="email" name="Email" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Channel breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Channel Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {channelLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : !channelBreakdown || channelBreakdown.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                No messages sent yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={192}>
                <PieChart>
                  <Pie
                    data={channelBreakdown}
                    dataKey="count"
                    nameKey="channel"
                    cx="50%"
                    cy="50%"
                    outerRadius={60}
                    innerRadius={35}
                  >
                    {channelBreakdown.map((entry) => (
                      <Cell key={entry.channel} fill={CHANNEL_COLORS[entry.channel] ?? "#888"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    formatter={(value, name) => [`${value} (${channelBreakdown.find(c => c.channel === name)?.percentage ?? 0}%)`, name]}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {activityLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !activity || activity.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No activity yet. Create and send your first campaign.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {activity.map((item) => (
                <div
                  key={item.id}
                  data-testid={`activity-item-${item.id}`}
                  className="flex items-center gap-4 px-5 py-3"
                >
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold shrink-0 ${ACTIVITY_TYPE_COLOR[item.type] ?? ""}`}
                  >
                    {ACTIVITY_TYPE_LABEL[item.type] ?? item.type}
                  </Badge>
                  <span className="text-sm text-foreground flex-1 truncate">{item.description}</span>
                  {item.channel && (
                    <Badge variant="outline" className="text-xs capitalize shrink-0">
                      {item.channel}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(item.createdAt), "MMM d, HH:mm")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
