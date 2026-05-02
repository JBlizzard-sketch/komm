import { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { ArrowLeft, Phone, Mail, Users, MessageSquare, Calendar, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetContact, useDeleteContact,
  getListContactsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const CHANNEL_BADGE: Record<string, string> = {
  sms: "bg-primary/10 text-primary",
  whatsapp: "bg-emerald-100 text-emerald-800",
  email: "bg-amber-100 text-amber-800",
};

const MSG_STATUS: Record<string, string> = {
  delivered: "bg-green-100 text-green-800",
  sent: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
  pending: "bg-muted text-muted-foreground",
  opened: "bg-purple-100 text-purple-800",
};

interface ContactMessage {
  id: number;
  campaignId: number;
  campaignName: string | null;
  campaignChannel: string;
  status: string;
  deliveredAt: string | null;
  errorMessage: string | null;
  sentAt: string | null;
}

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const contactId = parseInt(id);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const { data: contact, isLoading } = useGetContact(contactId, {
    query: {
      queryKey: ["contact", contactId],
      enabled: !!contactId && !isNaN(contactId),
    },
  });

  useEffect(() => {
    if (!contact) return;
    let cancelled = false;
    setMessagesLoading(true);
    fetch(`/api/contacts/${contactId}/messages?limit=30`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setMessages(json.data ?? []); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setMessagesLoading(false); });
    return () => { cancelled = true; };
  }, [contactId, contact]);

  const deleteContact = useDeleteContact();

  const handleDelete = () => {
    if (!window.confirm(`Delete ${contact?.name}? This cannot be undone.`)) return;
    deleteContact.mutate(
      { id: contactId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
          toast({ title: "Contact deleted" });
          navigate("/contacts");
        },
        onError: () => toast({ title: "Failed to delete contact", variant: "destructive" }),
      }
    );
  };

  if (isNaN(contactId)) {
    return <div className="p-6 text-center text-muted-foreground">Invalid contact ID.</div>;
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Contact not found.{" "}
        <Link href="/contacts" className="text-primary hover:underline">
          Back to Contacts
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/contacts">
          <Button variant="ghost" size="icon" className="w-8 h-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">{contact.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Added {format(new Date(contact.createdAt), "d MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-destructive hover:bg-destructive/10 border-destructive/30"
            onClick={handleDelete}
            disabled={deleteContact.isPending}
            data-testid="button-delete-contact"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </Button>
          <Link href={`/campaigns/new`}>
            <Button size="sm" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              New Campaign
            </Button>
          </Link>
        </div>
      </div>

      {/* Contact info */}
      <Card className="mb-5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="text-sm font-medium">{contact.phone}</p>
            </div>
          </div>

          {contact.email && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium">{contact.email}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Preferred Channel</p>
              <Badge variant="outline" className={`text-xs capitalize mt-0.5 ${CHANNEL_BADGE[contact.channel] ?? ""}`}>
                {contact.channel}
              </Badge>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Groups</p>
              {(contact.groupIds ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground mt-0.5">No groups</p>
              ) : (
                <div className="flex flex-wrap gap-1 mt-1">
                  {(contact.groupIds ?? []).map((gid) => (
                    <Badge key={gid} variant="outline" className="text-xs">
                      Group {gid}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date Added</p>
              <p className="text-sm font-medium">{format(new Date(contact.createdAt), "d MMM yyyy, HH:mm")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Message history */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Message History</CardTitle>
            {messages.length > 0 && (
              <span className="text-xs text-muted-foreground">{messages.length} messages</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {messagesLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : messages.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm px-4">
              No messages sent to this contact yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {messages.map((m) => (
                <Link key={m.id} href={`/campaigns/${m.campaignId}`}>
                  <div className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {m.campaignName ?? `Campaign #${m.campaignId}`}
                      </p>
                      {m.errorMessage && (
                        <p className="text-xs text-destructive mt-0.5 truncate">{m.errorMessage}</p>
                      )}
                    </div>
                    <Badge variant="outline" className={`text-[10px] capitalize shrink-0 ${CHANNEL_BADGE[m.campaignChannel] ?? ""}`}>
                      {m.campaignChannel}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] capitalize shrink-0 ${MSG_STATUS[m.status] ?? ""}`}>
                      {m.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {m.deliveredAt
                        ? format(new Date(m.deliveredAt), "d MMM, HH:mm")
                        : m.sentAt
                        ? format(new Date(m.sentAt), "d MMM, HH:mm")
                        : "—"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
