import { useState } from "react";
import { Link } from "wouter";
import { BarChart2, TrendingUp, Send, Users, CheckCircle2, MessageSquare, Mail, Smartphone, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useGetDashboardStats, useListCampaigns, getGetDashboardStatsQueryKey, getListCampaignsQueryKey } from "@workspace/api-client-react";
import { format, parseISO } from "date-fns";

interface TrendPoint { date: string; sms: number; whatsapp: number; email: number }
interface ChannelBreakdown { channel: string; count: number; percentage: number }

const CHANNEL_COLORS: Record<string, string> = {
  sms: "hsl(153 58% 28%)",
  whatsapp: "#25d366",
  email: "#6366f1",
};
const CHANNEL_LABELS: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp", email: "Email" };
const CHANNEL_ICONS: Record<string, React.ElementType> = { sms: Smartphone, whatsapp: MessageSquare, email: Mail };

function fmt(d: string) {
  try { return format(parseISO(d), "d MMM"); } catch { return d; }
}

function StatCard({ label, value, sub, icon: Icon, iconClass }: { label: string; value: string | number; sub?: string; icon: React.ElementType; iconClass: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconClass}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: { queryKey: getGetDashboardStatsQueryKey(), staleTime: 60_000 },
  });

  const { data: campaignsData, isLoading: campaignsLoading } = useListCampaigns(
    { page: 1, limit: 20 },
    { query: { queryKey: getListCampaignsQueryKey({ page: 1, limit: 20 }), staleTime: 60_000 } }
  );

  const { data: trend, isLoading: trendLoading } = useQuery<TrendPoint[]>({
    queryKey: ["dashboard", "delivery-trend"],
    queryFn: () => fetch("/api/dashboard/delivery-trend").then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: breakdown, isLoading: breakdownLoading } = useQuery<ChannelBreakdown[]>({
    queryKey: ["dashboard", "channel-breakdown"],
    queryFn: () => fetch("/api/dashboard/channel-breakdown").then((r) => r.json()),
    staleTime: 60_000,
  });

  const sentCampaigns = (campaignsData?.data ?? [])
    .filter((c) => c.status === "sent" && c.recipientCount > 0)
    .sort((a, b) => b.recipientCount - a.recipientCount)
    .slice(0, 8);

  const totalMessages = (trend ?? []).reduce((s, p) => s + p.sms + p.whatsapp + p.email, 0);
  const totalSent = (breakdown ?? []).reduce((s, b) => s + b.count, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-muted-foreground" />
          Reports
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Delivery analytics for the last 30 days
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statsLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <StatCard label="Total Contacts" value={(stats?.totalContacts ?? 0).toLocaleString()} icon={Users} iconClass="bg-primary/10 text-primary" />
            <StatCard label="Total Campaigns" value={(stats?.totalCampaigns ?? 0).toLocaleString()} icon={Send} iconClass="bg-blue-50 text-blue-600" />
            <StatCard label="Messages (30d)" value={(stats?.messagesSentThisMonth ?? 0).toLocaleString()} sub="in the last 30 days" icon={TrendingUp} iconClass="bg-emerald-50 text-emerald-600" />
            <StatCard label="Delivery Rate" value={`${stats?.deliveryRate ?? 0}%`} sub="across all campaigns" icon={CheckCircle2} iconClass="bg-green-50 text-green-600" />
          </>
        )}
      </div>

      {/* Delivery trend */}
      <Card className="mb-5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Messages Sent — Last 30 Days</CardTitle>
          <CardDescription className="text-xs">Daily volume by channel</CardDescription>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : !trend || trend.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">No messages in the last 30 days.</div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="gSms" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHANNEL_COLORS.sms} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={CHANNEL_COLORS.sms} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gWa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHANNEL_COLORS.whatsapp} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={CHANNEL_COLORS.whatsapp} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gEmail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHANNEL_COLORS.email} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={CHANNEL_COLORS.email} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tickFormatter={fmt} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                  labelFormatter={fmt}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="sms" name="SMS" stroke={CHANNEL_COLORS.sms} fill="url(#gSms)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="whatsapp" name="WhatsApp" stroke={CHANNEL_COLORS.whatsapp} fill="url(#gWa)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="email" name="Email" stroke={CHANNEL_COLORS.email} fill="url(#gEmail)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Channel breakdown + top campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">
        {/* Channel pie */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Channel Breakdown</CardTitle>
            <CardDescription className="text-xs">All-time message distribution</CardDescription>
          </CardHeader>
          <CardContent>
            {breakdownLoading ? (
              <Skeleton className="h-44 w-full" />
            ) : !breakdown || breakdown.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-sm text-muted-foreground">No data yet.</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={breakdown} dataKey="count" nameKey="channel" cx="50%" cy="50%" outerRadius={68} innerRadius={38} paddingAngle={3}>
                      {breakdown.map((b) => (
                        <Cell key={b.channel} fill={CHANNEL_COLORS[b.channel] ?? "#999"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                      formatter={(v, n) => [`${v} msgs`, CHANNEL_LABELS[n as string] ?? n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-1">
                  {breakdown.map((b) => {
                    const Icon = CHANNEL_ICONS[b.channel] ?? MessageSquare;
                    return (
                      <div key={b.channel} className="flex items-center gap-2 text-sm">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHANNEL_COLORS[b.channel] ?? "#999" }} />
                        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium capitalize">{CHANNEL_LABELS[b.channel] ?? b.channel}</span>
                        <span className="ml-auto text-muted-foreground">{b.count.toLocaleString()} ({b.percentage}%)</span>
                      </div>
                    );
                  })}
                  {totalSent > 0 && (
                    <p className="text-xs text-muted-foreground pt-1 border-t border-border mt-2">
                      {totalSent.toLocaleString()} total messages all-time
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Top campaigns by reach */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Top Campaigns by Reach</CardTitle>
            <CardDescription className="text-xs">Sent campaigns, sorted by recipient count</CardDescription>
          </CardHeader>
          <CardContent>
            {campaignsLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : sentCampaigns.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">No sent campaigns yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sentCampaigns} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 16) + "…" : v} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                    formatter={(v) => [`${v} recipients`, "Reach"]}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Bar dataKey="recipientCount" name="Recipients" radius={[0, 4, 4, 0]}>
                    {sentCampaigns.map((c) => (
                      <Cell key={c.id} fill={CHANNEL_COLORS[c.channel] ?? "hsl(var(--primary))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaign table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Campaign Performance</CardTitle>
              <CardDescription className="text-xs mt-0.5">Recent sent campaigns with delivery stats</CardDescription>
            </div>
            <Link href="/campaigns">
              <button className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                All campaigns <ArrowRight className="w-3 h-3" />
              </button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {campaignsLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : sentCampaigns.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              No sent campaigns yet.{" "}
              <Link href="/campaigns/new" className="text-primary hover:underline">Create your first campaign</Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Header */}
              <div className="grid grid-cols-12 px-5 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/40">
                <span className="col-span-5">Campaign</span>
                <span className="col-span-2 text-center">Channel</span>
                <span className="col-span-2 text-right">Recipients</span>
                <span className="col-span-2 text-right">Sent</span>
                <span className="col-span-1" />
              </div>
              {sentCampaigns.map((c) => {
                const Icon = CHANNEL_ICONS[c.channel] ?? MessageSquare;
                return (
                  <Link key={c.id} href={`/campaigns/${c.id}`}>
                    <div className="grid grid-cols-12 px-5 py-3 items-center hover:bg-muted/20 transition-colors cursor-pointer">
                      <div className="col-span-5 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        {c.sentAt && (
                          <p className="text-xs text-muted-foreground">{format(new Date(c.sentAt), "d MMM yyyy")}</p>
                        )}
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <Badge variant="outline" className="text-[10px] capitalize gap-1">
                          <Icon className="w-3 h-3" />
                          {CHANNEL_LABELS[c.channel] ?? c.channel}
                        </Badge>
                      </div>
                      <p className="col-span-2 text-sm text-right">{c.recipientCount.toLocaleString()}</p>
                      <div className="col-span-2 flex justify-end">
                        <Badge variant="outline" className="text-[10px] bg-green-50 text-green-800 border-green-200">Sent</Badge>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
