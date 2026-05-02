import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  Plus, Send, Clock, CheckCircle2, XCircle, FileText,
  MoreHorizontal, Trash2, ChevronLeft, ChevronRight, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useListCampaigns, useDeleteCampaign, useSendCampaign,
  getListCampaignsQueryKey, getGetDashboardStatsQueryKey, getGetDashboardActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Campaign } from "@workspace/api-client-react";

const PAGE_SIZE = 25;

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  draft:     { label: "Draft",     icon: FileText,     className: "bg-muted text-muted-foreground" },
  scheduled: { label: "Scheduled", icon: Clock,        className: "bg-amber-100 text-amber-800" },
  sending:   { label: "Sending",   icon: Send,         className: "bg-blue-100 text-blue-800" },
  sent:      { label: "Sent",      icon: CheckCircle2, className: "bg-green-100 text-green-800" },
  failed:    { label: "Failed",    icon: XCircle,      className: "bg-red-100 text-red-800" },
};

const CHANNEL_CONFIG: Record<string, { label: string; color: string }> = {
  sms:      { label: "SMS",       color: "bg-primary/10 text-primary" },
  whatsapp: { label: "WhatsApp",  color: "bg-emerald-100 text-emerald-800" },
  email:    { label: "Email",     color: "bg-amber-100 text-amber-800" },
};

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const deleteCampaign = useDeleteCampaign();
  const sendCampaign = useSendCampaign();
  const status = STATUS_CONFIG[campaign.status] ?? STATUS_CONFIG.draft;
  const StatusIcon = status.icon;
  const channel = CHANNEL_CONFIG[campaign.channel] ?? CHANNEL_CONFIG.sms;

  const handleDelete = () => {
    deleteCampaign.mutate(
      { id: campaign.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          toast({ title: "Campaign deleted" });
        },
      }
    );
  };

  const handleSend = () => {
    sendCampaign.mutate(
      { id: campaign.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
          toast({ title: "Campaign sent successfully" });
        },
        onError: () => toast({ title: "Failed to send campaign", variant: "destructive" }),
      }
    );
  };

  return (
    <div
      data-testid={`campaign-row-${campaign.id}`}
      className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors group"
    >
      <Link href={`/campaigns/${campaign.id}`} className="flex-1 min-w-0 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{campaign.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{campaign.body}</p>
        </div>
      </Link>

      <Badge variant="outline" className={`text-[11px] font-semibold shrink-0 ${channel.color}`}>
        {channel.label}
      </Badge>

      <div className="flex items-center gap-1.5 shrink-0">
        <StatusIcon className="w-3.5 h-3.5" />
        <Badge variant="outline" className={`text-[11px] font-semibold ${status.className}`}>
          {status.label}
        </Badge>
      </div>

      <span className="text-sm text-muted-foreground shrink-0 w-20 text-right">
        {campaign.recipientCount.toLocaleString()} rcpts
      </span>

      <span className="text-xs text-muted-foreground shrink-0 w-28 text-right">
        {campaign.sentAt
          ? format(new Date(campaign.sentAt), "MMM d, HH:mm")
          : campaign.scheduledAt
          ? format(new Date(campaign.scheduledAt), "MMM d, HH:mm")
          : format(new Date(campaign.createdAt), "MMM d, HH:mm")}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 opacity-0 group-hover:opacity-100 shrink-0"
            data-testid={`campaign-menu-${campaign.id}`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <Link href={`/campaigns/${campaign.id}`}>
            <DropdownMenuItem>View details</DropdownMenuItem>
          </Link>
          {campaign.status === "draft" && (
            <>
              <Link href={`/campaigns/new?edit=${campaign.id}`}>
                <DropdownMenuItem>Edit</DropdownMenuItem>
              </Link>
              <DropdownMenuItem
                onClick={handleSend}
                disabled={sendCampaign.isPending}
                data-testid={`send-campaign-${campaign.id}`}
              >
                <Send className="w-4 h-4 mr-2" />
                Send now
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem
            onClick={handleDelete}
            className="text-destructive"
            disabled={deleteCampaign.isPending}
            data-testid={`delete-campaign-${campaign.id}`}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function Campaigns() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const queryParams = {
    status: statusFilter !== "all" ? (statusFilter as "draft" | "scheduled" | "sending" | "sent" | "failed") : undefined,
    channel: channelFilter !== "all" ? (channelFilter as "sms" | "whatsapp" | "email") : undefined,
    page,
    limit: PAGE_SIZE,
  };

  const { data, isLoading } = useListCampaigns(queryParams, {
    query: { queryKey: getListCampaignsQueryKey(queryParams) },
  });

  const allRows = data?.data ?? [];
  const filtered = useMemo(() => {
    if (!search.trim()) return allRows;
    const q = search.toLowerCase();
    return allRows.filter((c) => c.name.toLowerCase().includes(q) || c.body.toLowerCase().includes(q));
  }, [allRows, search]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetPage = () => setPage(1);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} total campaigns</p>
        </div>
        <Link href="/campaigns/new">
          <Button data-testid="button-new-campaign" size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            New Campaign
          </Button>
        </Link>
      </div>

      {/* Filters + search */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns…"
            className="h-8 pl-8 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring w-52"
            data-testid="search-campaigns"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); resetPage(); }}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="filter-status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="sending">Sending</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={channelFilter} onValueChange={(v) => { setChannelFilter(v); resetPage(); }}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="filter-channel">
            <SelectValue placeholder="All channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="email">Email</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        {/* Table header */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-border bg-muted/30">
          <span className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Campaign</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">Channel</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">Status</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0 w-20 text-right">Recipients</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0 w-28 text-right">Date</span>
          <span className="w-7" />
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="px-5 py-4">
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : !data?.data || data.data.length === 0 ? (
            <div className="py-16 text-center">
              <Send className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No campaigns yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create your first campaign to start reaching your members.
              </p>
              <Link href="/campaigns/new">
                <Button size="sm" className="mt-4 gap-2">
                  <Plus className="w-4 h-4" />
                  New Campaign
                </Button>
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No campaigns match your search.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} />
              ))}
            </div>
          )}
        </CardContent>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {total} campaigns
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="page-prev"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
                return (
                  <Button
                    key={pg}
                    variant={pg === page ? "default" : "outline"}
                    size="sm"
                    className="h-7 w-7 p-0 text-xs"
                    onClick={() => setPage(pg)}
                  >
                    {pg}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                data-testid="page-next"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
