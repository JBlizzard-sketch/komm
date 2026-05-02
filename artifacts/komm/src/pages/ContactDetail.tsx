import { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { ArrowLeft, Phone, Mail, Users, MessageSquare, Calendar, Edit2, Trash2, BellOff, Bell, Plus, Send as SendIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetContact, useDeleteContact, useListGroups,
  useRemoveContactFromGroup, useBulkAddContactsToGroup,
  getListContactsQueryKey, getGetContactQueryKey,
} from "@workspace/api-client-react";
import { useMutation } from "@tanstack/react-query";
import { ContactFormDialog } from "@/components/ContactFormDialog";
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
  const [showEdit, setShowEdit] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [selectedNewGroupId, setSelectedNewGroupId] = useState<string>("none");

  const { data: contact, isLoading } = useGetContact(contactId, {
    query: {
      queryKey: ["contact", contactId],
      enabled: !!contactId && !isNaN(contactId),
    },
  });

  const { data: allGroups } = useListGroups({ query: { queryKey: ["groups"] } });

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
  const removeFromGroup = useRemoveContactFromGroup();
  const addToGroup = useBulkAddContactsToGroup();

  const handleRemoveFromGroup = (groupId: number) => {
    removeFromGroup.mutate(
      { id: groupId, params: { contactId } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetContactQueryKey(contactId) });
          qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
          toast({ title: "Removed from group" });
        },
        onError: () => toast({ title: "Failed to remove from group", variant: "destructive" }),
      }
    );
  };

  const handleAddToGroup = () => {
    if (selectedNewGroupId === "none") return;
    addToGroup.mutate(
      { data: { contactIds: [contactId], groupId: parseInt(selectedNewGroupId) } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetContactQueryKey(contactId) });
          qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
          toast({ title: "Added to group" });
          setSelectedNewGroupId("none");
          setAddingGroup(false);
        },
        onError: () => toast({ title: "Failed to add to group", variant: "destructive" }),
      }
    );
  };

  const toggleOptOut = useMutation({
    mutationFn: async (optOut: boolean) => {
      const endpoint = optOut ? "bulk-opt-out" : "bulk-opt-in";
      const res = await fetch(`/api/contacts/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [contactId] }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (_data, optOut) => {
      qc.invalidateQueries({ queryKey: getGetContactQueryKey(contactId) });
      qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
      toast({ title: optOut ? "Contact opted out" : "Contact opted back in" });
    },
    onError: () => toast({ title: "Failed to update opt-out status", variant: "destructive" }),
  });

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
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold truncate">{contact.name}</h1>
            {(contact as { optedOut?: boolean }).optedOut && (
              <Badge variant="outline" className="text-[11px] bg-red-50 text-red-700 border-red-200 gap-1 shrink-0">
                <BellOff className="w-3 h-3" />Opted Out
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Added {format(new Date(contact.createdAt), "d MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => navigate(`/campaigns/new?channel=${contact.channel}`)}
            data-testid="button-send-message"
          >
            <SendIcon className="w-4 h-4" />
            New Campaign
          </Button>
          {(contact as { optedOut?: boolean }).optedOut ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-green-700 hover:bg-green-50 border-green-300"
              onClick={() => toggleOptOut.mutate(false)}
              disabled={toggleOptOut.isPending}
              data-testid="button-opt-in"
            >
              <Bell className="w-4 h-4" />
              Opt In
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-amber-700 hover:bg-amber-50 border-amber-300"
              onClick={() => toggleOptOut.mutate(true)}
              disabled={toggleOptOut.isPending}
              data-testid="button-opt-out"
            >
              <BellOff className="w-4 h-4" />
              Opt Out
            </Button>
          )}
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
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowEdit(true)}
            data-testid="button-edit-contact"
          >
            <Edit2 className="w-4 h-4" />
            Edit
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
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
              <Users className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Groups</p>
                <button
                  onClick={() => setAddingGroup((v) => !v)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                  data-testid="button-add-to-group"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </button>
              </div>
              {(contact.groupIds ?? []).length === 0 && !addingGroup ? (
                <p className="text-sm text-muted-foreground">Not in any group</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {(contact.groupIds ?? []).map((gid) => {
                    const grp = allGroups?.find((g) => g.id === gid);
                    return (
                      <span key={gid} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs">
                        {grp ? grp.name : `Group ${gid}`}
                        <button
                          onClick={() => handleRemoveFromGroup(gid)}
                          disabled={removeFromGroup.isPending}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Remove from group"
                          data-testid={`remove-from-group-${gid}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              {addingGroup && (
                <div className="flex items-center gap-2 mt-2">
                  <select
                    value={selectedNewGroupId}
                    onChange={(e) => setSelectedNewGroupId(e.target.value)}
                    className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    data-testid="select-add-to-group"
                  >
                    <option value="none">Select group…</option>
                    {(allGroups ?? [])
                      .filter((g) => !(contact.groupIds ?? []).includes(g.id))
                      .map((g) => (
                        <option key={g.id} value={String(g.id)}>{g.name}</option>
                      ))}
                  </select>
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={handleAddToGroup}
                    disabled={selectedNewGroupId === "none" || addToGroup.isPending}
                    data-testid="button-confirm-add-to-group"
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => { setAddingGroup(false); setSelectedNewGroupId("none"); }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
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

          {messages.length > 0 && (() => {
            const lastMsg = messages.reduce((best, m) => {
              const bestDate = best.deliveredAt ?? best.sentAt ?? "";
              const thisDate = m.deliveredAt ?? m.sentAt ?? "";
              return thisDate > bestDate ? m : best;
            });
            const lastDate = lastMsg.deliveredAt ?? lastMsg.sentAt;
            return lastDate ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Contacted</p>
                  <p className="text-sm font-medium">{format(new Date(lastDate), "d MMM yyyy, HH:mm")}</p>
                </div>
              </div>
            ) : null;
          })()}
        </CardContent>
      </Card>

      {/* Member Data / Custom Fields */}
      {Object.keys((contact.customFields as Record<string, string> | null | undefined) ?? {}).length > 0 && (
        <Card className="mb-5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Member Data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries((contact.customFields as Record<string, string>)).map(([key, value]) => (
                <div key={key} className="bg-muted/40 rounded-lg px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-0.5">{key}</p>
                  <p className="text-sm font-medium truncate">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Edit Contact Dialog */}
      <ContactFormDialog
        open={showEdit}
        onClose={() => setShowEdit(false)}
        editContact={contact as Parameters<typeof ContactFormDialog>[0]["editContact"]}
        groups={(allGroups ?? []).map((g) => ({ id: g.id, name: g.name, contactCount: g.contactCount ?? 0 }))}
      />
    </div>
  );
}
