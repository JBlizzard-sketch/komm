import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, Send as SendIcon,
  Users, Copy, FlaskConical, Phone, Mail, CalendarOff, Edit2, ChevronLeft, ChevronRight, Loader2, Download, BellOff, RefreshCw,
} from "lucide-react";
import { Link } from "wouter";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useGetCampaign,
  useListCampaignMessages,
  useSendCampaign,
  useTestCampaign,
  useDuplicateCampaign,
  getGetCampaignQueryKey,
  getListCampaignMessagesQueryKey,
  getListCampaignsQueryKey,
  getGetDashboardStatsQueryKey,
  ListCampaignMessagesStatus,
} from "@workspace/api-client-react";
import type { ListCampaignMessagesStatus as MsgStatusType } from "@workspace/api-client-react";
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

const CAMPAIGN_STATUS_CLASS: Record<string, string> = {
  sent: "bg-green-100 text-green-800",
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-amber-100 text-amber-800",
  sending: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
};

function formatCountdown(isoTarget: string, now: Date): string {
  const diff = new Date(isoTarget).getTime() - now.getTime();
  if (diff <= 0) return "now";
  const totalMins = Math.floor(diff / 60_000);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

const MSG_STATUS_TABS: { label: string; value: MsgStatusType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Delivered", value: ListCampaignMessagesStatus.delivered },
  { label: "Sent", value: ListCampaignMessagesStatus.sent },
  { label: "Failed", value: ListCampaignMessagesStatus.failed },
];

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const campaignId = parseInt(id);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [showTest, setShowTest] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testEmail, setTestEmail] = useState("");

  const [cancelling, setCancelling] = useState(false);
  const [optingOutFailed, setOptingOutFailed] = useState(false);

  const [resendingFailed, setResendingFailed] = useState(false);

  const handleResendFailed = async () => {
    if (!window.confirm(`Create a new draft campaign targeting only the ${campaign?.failedCount ?? 0} failed contacts?`)) return;
    setResendingFailed(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/resend-failed`, { method: "POST" });
      if (!res.ok) { const e = await res.json() as { error: string }; throw new Error(e.error); }
      const newCampaign = await res.json() as { id: number };
      qc.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
      toast({ title: "Retry campaign created as draft" });
      navigate(`/campaigns/${newCampaign.id}`);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to create retry campaign", variant: "destructive" });
    } finally {
      setResendingFailed(false);
    }
  };

  const handleOptOutFailed = async () => {
    if (!window.confirm("Opt out all contacts with failed delivery? They won't receive future campaigns.")) return;
    setOptingOutFailed(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/opt-out-failed`, { method: "POST" });
      const data: { updated: number } = await res.json();
      qc.invalidateQueries({ queryKey: getListCampaignMessagesQueryKey(campaignId) });
      toast({ title: `${data.updated} contact${data.updated !== 1 ? "s" : ""} opted out` });
    } catch {
      toast({ title: "Failed to opt out contacts", variant: "destructive" });
    } finally {
      setOptingOutFailed(false);
    }
  };

  const sendCampaign = useSendCampaign();
  const testCampaign = useTestCampaign();
  const duplicateCampaign = useDuplicateCampaign();

  const handleCancelSchedule = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error();
      qc.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
      qc.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
      toast({ title: "Campaign unscheduled — moved back to Draft" });
    } catch {
      toast({ title: "Failed to cancel schedule", variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  const { data: campaign, isLoading } = useGetCampaign(campaignId, {
    query: {
      enabled: !!campaignId,
      queryKey: getGetCampaignQueryKey(campaignId),
      refetchInterval: (query) => query.state.data?.status === "sending" ? 5000 : false,
    },
  });

  const [msgPage, setMsgPage] = useState(1);
  const [msgStatus, setMsgStatus] = useState<MsgStatusType | "all">("all");
  const MSG_PAGE_SIZE = 50;

  const msgParams = {
    page: msgPage,
    limit: MSG_PAGE_SIZE,
    ...(msgStatus !== "all" ? { status: msgStatus } : {}),
  };

  const { data: messages, isLoading: msgLoading } = useListCampaignMessages(
    campaignId,
    msgParams,
    {
      query: {
        enabled: !!campaignId,
        queryKey: getListCampaignMessagesQueryKey(campaignId, msgParams),
        refetchInterval: campaign?.status === "sending" ? 5000 : false,
      },
    }
  );

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [exporting, setExporting] = useState(false);
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const statusParam = msgStatus !== "all" ? `&status=${msgStatus}` : "";
      const res = await fetch(`/api/campaigns/${campaignId}/messages?page=1&limit=5000${statusParam}`);
      const json = await res.json() as { data: Array<{ contactName: string; phone: string; status: string; deliveredAt: string | null }> };
      const rows = json.data ?? [];
      const header = "Name,Phone,Status,Delivered At";
      const lines = rows.map((m) =>
        [`"${m.contactName.replace(/"/g, '""')}"`, m.phone, m.status, m.deliveredAt ? format(new Date(m.deliveredAt), "yyyy-MM-dd HH:mm") : ""].join(",")
      );
      const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campaign-${campaignId}-delivery${msgStatus !== "all" ? `-${msgStatus}` : ""}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

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
        onError: () => toast({ title: "Failed to send", variant: "destructive" }),
      }
    );
  };

  const handleDuplicate = () => {
    duplicateCampaign.mutate(
      { id: campaignId },
      {
        onSuccess: (newCampaign) => {
          qc.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
          toast({ title: "Campaign duplicated" });
          navigate(`/campaigns/${newCampaign.id}`);
        },
        onError: () => toast({ title: "Duplicate failed", variant: "destructive" }),
      }
    );
  };

  const handleTest = () => {
    if (!testPhone) return;
    testCampaign.mutate(
      { id: campaignId, data: { phone: testPhone, email: testEmail || null } },
      {
        onSuccess: (result) => {
          if (result.success) {
            toast({
              title: result.simulated ? "Test simulated ✓" : "Test message sent ✓",
              description: result.simulated
                ? "No real provider configured — message was simulated."
                : `Message ID: ${result.messageId}`,
            });
          } else {
            toast({ title: "Test failed", description: result.error ?? "Unknown error", variant: "destructive" });
          }
          setShowTest(false);
        },
        onError: () => toast({ title: "Test failed", variant: "destructive" }),
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
    return <div className="p-6 text-center text-muted-foreground">Campaign not found.</div>;
  }

  const deliveryPct = campaign.deliveryRate ?? 0;
  const isDraft = campaign.status === "draft";
  const isScheduled = campaign.status === "scheduled";
  const isSending = campaign.status === "sending";
  const awaitingCount = Math.max(0, (campaign.recipientCount ?? 0) - (campaign.deliveredCount ?? 0) - (campaign.failedCount ?? 0));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
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
        <div className="flex items-center gap-2 shrink-0">
          {(isDraft || isScheduled) && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigate(`/campaigns/new?edit=${campaignId}`)}
              data-testid="button-edit-campaign"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </Button>
          )}
          {(campaign.failedCount ?? 0) > 0 && campaign.status === "sent" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"
              onClick={handleResendFailed}
              disabled={resendingFailed}
              data-testid="button-resend-failed"
            >
              <RefreshCw className="w-4 h-4" />
              {resendingFailed ? "Creating…" : `Retry Failed (${campaign.failedCount})`}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleDuplicate}
            disabled={duplicateCampaign.isPending}
            data-testid="button-duplicate-campaign"
          >
            <Copy className="w-4 h-4" />
            Duplicate
          </Button>
          {isScheduled && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"
              onClick={handleCancelSchedule}
              disabled={cancelling}
              data-testid="button-cancel-schedule"
            >
              <CalendarOff className="w-4 h-4" />
              Cancel Schedule
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowTest(true)}
            data-testid="button-test-campaign"
          >
            <FlaskConical className="w-4 h-4" />
            Send Test
          </Button>
          {(isDraft || isScheduled) && (
            <Button
              onClick={handleSend}
              disabled={sendCampaign.isPending}
              size="sm"
              className="gap-2"
              data-testid="button-send-campaign"
            >
              <SendIcon className="w-4 h-4" />
              {isDraft ? "Send Now" : "Send Now (Override Schedule)"}
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      {isSending && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
          <span className="text-xs text-blue-700 font-medium">Sending in progress — stats refresh automatically every 5 seconds</span>
        </div>
      )}
      {(() => {
        const delivered = campaign.deliveredCount ?? 0;
        const failed = campaign.failedCount ?? 0;
        const awaiting = awaitingCount;
        const hasPie = (delivered + failed + awaiting) > 0;
        const pieData = [
          { name: "Delivered", value: delivered, color: "#16a34a" },
          { name: "Failed",    value: failed,    color: "#dc2626" },
          { name: "Awaiting",  value: awaiting,  color: "#3b82f6" },
        ].filter((d) => d.value > 0);
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Donut chart */}
            <Card className="flex flex-col items-center justify-center py-4">
              <CardContent className="p-0 flex flex-col items-center w-full">
                {hasPie ? (
                  <>
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={62} dataKey="value" strokeWidth={0}>
                          {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: number, name: string) => [v.toLocaleString(), name]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex gap-3 mt-1">
                      {pieData.map((d) => (
                        <span key={d.name} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: d.color }} />
                          {d.name}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground py-10">No messages sent yet</p>
                )}
              </CardContent>
            </Card>
            {/* Stat numbers */}
            <Card className="md:col-span-2">
              <CardContent className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 h-full items-center">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{campaign.recipientCount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Recipients</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{delivered.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Delivered</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{failed.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Failed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{deliveryPct}%</p>
                  <p className="text-xs text-muted-foreground mt-1">Delivery Rate</p>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Message preview */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Message</CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs capitalize">{campaign.channel}</Badge>
              <Badge
                variant="outline"
                className={`text-xs capitalize ${CAMPAIGN_STATUS_CLASS[campaign.status] ?? ""}`}
              >
                {campaign.status}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/40 rounded-lg p-4">{campaign.body}</p>
          {campaign.scheduledAt && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Scheduled for {format(new Date(campaign.scheduledAt), "d MMM yyyy, HH:mm")}
              {campaign.status === "scheduled" && (
                <span className="text-amber-700 font-medium">
                  ({formatCountdown(campaign.scheduledAt, now)})
                </span>
              )}
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
          {/* Status filter tabs + export */}
          <div className="flex items-center justify-between gap-2 mt-2">
            <div className="flex gap-1">
              {MSG_STATUS_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => { setMsgStatus(tab.value); setMsgPage(1); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    msgStatus === tab.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                  data-testid={`msg-filter-${tab.value}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {msgStatus === "failed" && (messages?.total ?? 0) > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs shrink-0 text-destructive hover:bg-destructive/10 border-destructive/30"
                  onClick={handleOptOutFailed}
                  disabled={optingOutFailed}
                  data-testid="button-opt-out-failed"
                >
                  <BellOff className="w-3 h-3" />
                  {optingOutFailed ? "Opting out…" : `Opt out all (${messages?.total ?? 0})`}
                </Button>
              )}
              {(messages?.total ?? 0) > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs shrink-0"
                  onClick={handleExportCSV}
                  disabled={exporting}
                  data-testid="button-export-delivery-log"
                >
                  <Download className="w-3 h-3" />
                  {exporting ? "Exporting…" : "Export CSV"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

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
                {isDraft ? "Send this campaign to see delivery records." : "No delivery records yet."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {messages.data.map((msg) => {
                const s = STATUS_CONFIG[msg.status] ?? STATUS_CONFIG.pending;
                const StatusIcon = s.icon;
                return (
                  <div key={msg.id} className="flex items-center gap-4 px-5 py-3">
                    <Link
                      href={`/contacts/${msg.contactId}`}
                      className="flex-1 text-sm font-medium truncate hover:text-primary hover:underline"
                    >
                      {msg.contactName}
                    </Link>
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

      {/* Delivery log pagination */}
      {(messages?.total ?? 0) > MSG_PAGE_SIZE && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            Page {msgPage} of {Math.ceil((messages?.total ?? 0) / MSG_PAGE_SIZE)} · {messages?.total ?? 0} recipients
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setMsgPage((p) => Math.max(1, p - 1))}
              disabled={msgPage === 1}
              data-testid="msg-page-prev"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setMsgPage((p) => Math.min(Math.ceil((messages?.total ?? 0) / MSG_PAGE_SIZE), p + 1))}
              disabled={msgPage >= Math.ceil((messages?.total ?? 0) / MSG_PAGE_SIZE)}
              data-testid="msg-page-next"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Send Test Dialog */}
      <Dialog open={showTest} onOpenChange={setShowTest}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-primary" />
              Send Test Message
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Send the campaign message to a single number or email to verify it looks correct before broadcasting.
            </p>
            <div>
              <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <Phone className="w-3.5 h-3.5" /> Phone Number
              </label>
              <Input
                placeholder="+254712345678"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                data-testid="input-test-phone"
              />
            </div>
            {campaign.channel === "email" && (
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <Mail className="w-3.5 h-3.5" /> Email Address
                </label>
                <Input
                  placeholder="you@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  data-testid="input-test-email"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              Channel: <span className="font-medium capitalize">{campaign.channel}</span>
              {" · "}
              <span>Using configured provider</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTest(false)}>Cancel</Button>
            <Button
              onClick={handleTest}
              disabled={!testPhone || testCampaign.isPending}
              data-testid="button-send-test"
            >
              {testCampaign.isPending ? "Sending…" : "Send Test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
