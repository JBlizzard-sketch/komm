import { useState } from "react";
import { MessageSquare, CheckCheck, Inbox as InboxIcon, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useListInboxMessages,
  useMarkInboxRead,
  getListInboxMessagesQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const CHANNEL_COLORS: Record<string, string> = {
  sms: "bg-primary/10 text-primary",
  whatsapp: "bg-emerald-100 text-emerald-800",
};

export default function Inbox() {
  const [readFilter, setReadFilter] = useState<string>("all");
  const [markingAll, setMarkingAll] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useListInboxMessages(
    {
      read: readFilter === "unread" ? false : readFilter === "read" ? true : undefined,
      page: 1,
      limit: 50,
    },
    {
      query: {
        queryKey: getListInboxMessagesQueryKey({
          read: readFilter === "unread" ? false : readFilter === "read" ? true : undefined,
          page: 1,
          limit: 50,
        }),
      },
    }
  );

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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Inbox</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm text-muted-foreground">Two-way replies from your members</span>
            {unreadCount > 0 && (
              <Badge className="bg-amber-500 text-white text-xs">{unreadCount} unread</Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
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

          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {[
              { value: "all", label: "All" },
              { value: "unread", label: "Unread" },
              { value: "read", label: "Read" },
            ].map((f) => (
              <button
                key={f.value}
                data-testid={`inbox-filter-${f.value}`}
                onClick={() => setReadFilter(f.value)}
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
                    <CheckCheck className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
