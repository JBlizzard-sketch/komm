import { useState, useCallback, useMemo } from "react";
import { Link } from "wouter";
import {
  CheckCheck, Inbox as InboxIcon, CheckSquare, ChevronLeft, ChevronRight, UserCircle, Reply, Search, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  useListInboxMessages,
  useMarkInboxRead,
  getListInboxMessagesQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const CHANNEL_COLORS: Record<string, string> = {
  sms: "bg-primary/10 text-primary",
  whatsapp: "bg-emerald-100 text-emerald-800",
};

const PAGE_SIZE = 25;

export default function Inbox() {
  const [readFilter, setReadFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [markingAll, setMarkingAll] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [replyMsg, setReplyMsg] = useState<{ id: number; name: string; channel: string } | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    const t = setTimeout(() => { setDebouncedSearch(val); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, []);

  const sendReply = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: string }) => {
      const res = await fetch(`/api/inbox/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error();
      return res.json() as Promise<{ success: boolean; simulated?: boolean; error?: string }>;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: data.simulated ? "Reply simulated ✓" : "Reply sent ✓",
          description: data.simulated ? "No real provider configured — simulated." : undefined,
        });
      } else {
        toast({ title: "Reply failed", description: data.error ?? "Unknown error", variant: "destructive" });
      }
      qc.invalidateQueries({ queryKey: getListInboxMessagesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
      setReplyMsg(null);
      setReplyBody("");
    },
    onError: () => toast({ title: "Reply failed", variant: "destructive" }),
  });

  const queryArgs = {
    read: readFilter === "unread" ? false : readFilter === "read" ? true : undefined,
    page,
    limit: PAGE_SIZE,
  };

  const { data, isLoading } = useListInboxMessages(queryArgs, {
    query: {
      queryKey: [...getListInboxMessagesQueryKey(queryArgs), debouncedSearch, channelFilter],
      queryFn: async () => {
        const qs = new URLSearchParams();
        if (queryArgs.read !== undefined) qs.set("read", String(queryArgs.read));
        qs.set("page", String(queryArgs.page));
        qs.set("limit", String(queryArgs.limit));
        if (debouncedSearch) qs.set("search", debouncedSearch);
        if (channelFilter !== "all") qs.set("channel", channelFilter);
        const res = await fetch(`/api/inbox?${qs}`);
        return res.json();
      },
    },
  });

  const markRead = useMarkInboxRead();

  const handleMarkRead = (id: number) => {
    markRead.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListInboxMessagesQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        },
        onError: () => toast({ title: "Failed to mark as read", variant: "destructive" }),
      }
    );
  };

  const handleMarkAllRead = async () => {
    if (markingAll || (data?.unreadCount ?? 0) === 0) return;
    setMarkingAll(true);
    try {
      await fetch("/api/inbox/read-all", { method: "POST" });
      qc.invalidateQueries({ queryKey: getListInboxMessagesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
      toast({ title: "All messages marked as read" });
    } catch {
      toast({ title: "Failed to mark all as read", variant: "destructive" });
    } finally {
      setMarkingAll(false);
    }
  };

  const unreadCount = data?.unreadCount ?? 0;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleFilterChange = (v: string) => { setReadFilter(v); setPage(1); setSearch(""); setDebouncedSearch(""); };
  const handleChannelChange = (v: string) => { setChannelFilter(v); setPage(1); };

  const channelFilters = useMemo(() => [
    { value: "all", label: "All" },
    { value: "sms", label: "SMS" },
    { value: "whatsapp", label: "WhatsApp" },
  ], []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Inbox</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm text-muted-foreground">Two-way replies from your members</span>
            {unreadCount > 0 && (
              <Badge className="bg-amber-500 text-white text-xs">{unreadCount} unread</Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by name or number…"
              className="h-8 pl-8 pr-7 text-sm w-52"
              data-testid="inbox-search"
            />
            {search && (
              <button
                onClick={() => handleSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs h-8"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              data-testid="button-mark-all-read"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              {markingAll ? "Marking…" : `Mark all read (${unreadCount})`}
            </Button>
          )}

          {/* Channel filter */}
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {channelFilters.map((f) => (
              <button
                key={f.value}
                data-testid={`inbox-channel-${f.value}`}
                onClick={() => handleChannelChange(f.value)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  channelFilter === f.value
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Read/unread filter */}
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {[
              { value: "all", label: "All" },
              { value: "unread", label: "Unread" },
              { value: "read", label: "Read" },
            ].map((f) => (
              <button
                key={f.value}
                data-testid={`inbox-filter-${f.value}`}
                onClick={() => handleFilterChange(f.value)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  readFilter === f.value
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="px-5 py-4">
                  <Skeleton className="h-14 w-full" />
                </div>
              ))}
            </div>
          ) : !data?.data || data.data.length === 0 ? (
            <div className="py-20 text-center">
              <InboxIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">
                {readFilter === "unread" ? "No unread messages" : "No replies yet"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                When members reply to your SMS or WhatsApp messages, they will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.data.map((msg) => (
                <div
                  key={msg.id}
                  data-testid={`inbox-message-${msg.id}`}
                  className={`flex items-start gap-4 px-5 py-4 transition-colors ${
                    !msg.read ? "bg-primary/5" : "hover:bg-muted/20"
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-semibold text-muted-foreground">
                    {(msg.contactName ?? msg.from).charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">
                        {msg.contactName ?? msg.from}
                      </span>
                      {msg.contactName && (
                        <span className="text-xs text-muted-foreground">{msg.from}</span>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[10px] capitalize ml-auto ${CHANNEL_COLORS[msg.channel] ?? ""}`}
                      >
                        {msg.channel}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground mt-1">{msg.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(msg.receivedAt), "d MMM yyyy, HH:mm")}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {msg.contactId && (
                      <Link href={`/contacts/${msg.contactId}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          title="View contact"
                          data-testid={`view-contact-${msg.id}`}
                        >
                          <UserCircle className="w-4 h-4" />
                        </Button>
                      </Link>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                      title={`Reply via ${msg.channel}`}
                      data-testid={`reply-${msg.id}`}
                      onClick={() => {
                        setReplyMsg({ id: msg.id, name: msg.contactName ?? msg.from, channel: msg.channel });
                        setReplyBody("");
                      }}
                    >
                      <Reply className="w-4 h-4" />
                    </Button>
                    {!msg.read ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 h-7 gap-1.5 text-xs"
                        onClick={() => handleMarkRead(msg.id)}
                        disabled={markRead.isPending}
                        data-testid={`mark-read-${msg.id}`}
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark read
                      </Button>
                    ) : (
                      <CheckCheck className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {total} messages
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="inbox-page-prev"
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
                data-testid="inbox-page-next"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Reply Dialog */}
      <Dialog open={!!replyMsg} onOpenChange={(open) => { if (!open) { setReplyMsg(null); setReplyBody(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Reply className="w-4 h-4 text-primary" />
              Reply to {replyMsg?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Sending via <span className="font-medium capitalize">{replyMsg?.channel}</span> to the same number they messaged from.
            </p>
            <Textarea
              placeholder="Type your reply…"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={4}
              className="resize-none"
              data-testid="reply-body"
            />
            {replyMsg?.channel === "sms" && (
              <p className="text-xs text-muted-foreground">
                {replyBody.length} / 160 chars
                {replyBody.length > 160 && (
                  <span className="text-amber-600 ml-1">
                    · {Math.ceil(replyBody.length / 160)} SMS segments
                  </span>
                )}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReplyMsg(null); setReplyBody(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => replyMsg && sendReply.mutate({ id: replyMsg.id, body: replyBody })}
              disabled={!replyBody.trim() || sendReply.isPending}
              data-testid="button-send-reply"
            >
              {sendReply.isPending ? "Sending…" : "Send Reply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
