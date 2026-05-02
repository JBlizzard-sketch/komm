import { useParams } from "wouter";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Send as SendIcon, Users } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetCampaign,
  useListCampaignMessages,
  useSendCampaign,
  getGetCampaignQueryKey,
  getListCampaignMessagesQueryKey,
  getListCampaignsQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending: { label: "Pending", icon: Clock, className: "bg-muted text-muted-foreground" },
  sent: { label: "Sent", icon: SendIcon, className: "bg-blue-100 text-blue-800" },
  delivered: { label: "Delivered", icon: CheckCircle2, className: "bg-green-100 text-green-800" },
  failed: { label: "Failed", icon: XCircle, className: "bg-red-100 text-red-800" },
  opened: { label: "Opened", icon: CheckCircle2, className: "bg-purple-100 text-purple-800" },
};

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const campaignId = parseInt(id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const sendCampaign = useSendCampaign();

  const { data: campaign, isLoading } = useGetCampaign(campaignId, {
    query: { enabled: !!campaignId, queryKey: getGetCampaignQueryKey(campaignId) },
  });

  const { data: messages, isLoading: msgLoading } = useListCampaignMessages(
    campaignId,
    { page: 1, limit: 100 },
    {
      query: {
        enabled: !!campaignId,
        queryKey: getListCampaignMessagesQueryKey(campaignId, { page: 1, limit: 100 }),
      },
    }
  );

  const handleSend = () => {
    sendCampaign.mutate(
      { id: campaignId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
          qc.invalidateQueries({ queryKey: getListCampaignMessagesQueryKey(campaignId) });
          qc.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          toast({ title: "Campaign sent!" });
        },
        onError: () => {
          toast({ title: "Failed to send", variant: "destructive" });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-6 text-center text-muted-foreground">Campaign not found.</div>
    );
  }

  const deliveryPct = campaign.deliveryRate ?? 0;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/campaigns">
          <Button variant="ghost" size="icon" className="w-8 h-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Created {format(new Date(campaign.createdAt), "d MMM yyyy, HH:mm")}
          </p>
        </div>
        {campaign.status === "draft" && (
          <Button
            onClick={handleSend}
            disabled={sendCampaign.isPending}
            className="gap-2 shrink-0"
            data-testid="button-send-campaign"
          >
            <SendIcon className="w-4 h-4" />
            Send Now
          </Button>
        )}
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{campaign.recipientCount.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Recipients</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{(campaign as any).deliveredCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Delivered</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{(campaign as any).failedCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{deliveryPct}%</p>
            <p className="text-xs text-muted-foreground mt-1">Delivery Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Message preview */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Message</CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs capitalize">{campaign.channel}</Badge>
              <Badge
                variant="outline"
                className={`text-xs ${
                  campaign.status === "sent" ? "bg-green-100 text-green-800" :
                  campaign.status === "draft" ? "bg-muted text-muted-foreground" :
                  campaign.status === "scheduled" ? "bg-amber-100 text-amber-800" :
                  "bg-muted text-muted-foreground"
                }`}
              >
                {campaign.status}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/40 rounded-lg p-4">{campaign.body}</p>
          {campaign.scheduledAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Scheduled for: {format(new Date(campaign.scheduledAt), "d MMM yyyy, HH:mm")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Delivery log */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Delivery Log</CardTitle>
            <span className="text-xs text-muted-foreground">{messages?.total ?? 0} messages</span>
          </div>
        </CardHeader>

        {/* Header row */}
        <div className="flex items-center gap-4 px-5 py-2 border-y border-border bg-muted/30">
          <span className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide w-32">Phone</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide w-24">Status</span>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide w-32 text-right">Delivered At</span>
        </div>

        <CardContent className="p-0">
          {msgLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !messages?.data || messages.data.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {campaign.status === "draft" ? "Send this campaign to see delivery records." : "No delivery records yet."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {messages.data.map((msg) => {
                const s = STATUS_CONFIG[msg.status] ?? STATUS_CONFIG.pending;
                const StatusIcon = s.icon;
                return (
                  <div
                    key={msg.id}
                    data-testid={`message-row-${msg.id}`}
                    className="flex items-center gap-4 px-5 py-3"
                  >
                    <span className="flex-1 text-sm font-medium truncate">{msg.contactName}</span>
                    <span className="text-sm text-muted-foreground w-32">{msg.phone}</span>
                    <div className="flex items-center gap-1.5 w-24">
                      <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                      <Badge variant="outline" className={`text-[11px] ${s.className}`}>{s.label}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground w-32 text-right">
                      {msg.deliveredAt ? format(new Date(msg.deliveredAt), "MMM d, HH:mm") : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
