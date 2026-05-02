import { useState } from "react";
import { Plus, FolderOpen, Trash2, Edit2, Users, ChevronDown, ChevronUp, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListGroups, useCreateGroup, useUpdateGroup, useDeleteGroup,
  useListGroupMembers, useRemoveContactFromGroup, useAddContactsToGroup,
  useListContacts,
  getListGroupsQueryKey, getListGroupMembersQueryKey, getListContactsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { Group } from "@workspace/api-client-react";

const schema = z.object({
  name: z.string().min(1, "Group name is required"),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const CHANNEL_CONFIG: Record<string, string> = {
  sms: "bg-primary/10 text-primary",
  whatsapp: "bg-emerald-100 text-emerald-800",
  email: "bg-amber-100 text-amber-800",
};

function GroupMemberPanel({ group, onClose }: { group: Group; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAddMember, setShowAddMember] = useState(false);
  const [addContactId, setAddContactId] = useState("none");

  const { data: members, isLoading } = useListGroupMembers(
    group.id,
    { page: 1, limit: 200 },
    { query: { queryKey: getListGroupMembersQueryKey(group.id, { page: 1, limit: 200 }) } }
  );

  const { data: allContacts } = useListContacts(
    { page: 1, limit: 500 },
    { query: { queryKey: getListContactsQueryKey({ page: 1, limit: 500 }) } }
  );

  const removeMember = useRemoveContactFromGroup();
  const addContacts = useAddContactsToGroup();

  const memberIds = new Set((members?.data ?? []).map((m) => m.id));
  const nonMembers = (allContacts?.data ?? []).filter((c) => !memberIds.has(c.id));

  const handleRemove = (contactId: number) => {
    removeMember.mutate(
      { id: group.id, params: { contactId } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListGroupMembersQueryKey(group.id) });
          qc.invalidateQueries({ queryKey: getListGroupsQueryKey() });
          toast({ title: "Member removed" });
        },
        onError: () => toast({ title: "Remove failed", variant: "destructive" }),
      }
    );
  };

  const handleAdd = () => {
    if (addContactId === "none") return;
    addContacts.mutate(
      { id: group.id, data: { contactIds: [parseInt(addContactId)] } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListGroupMembersQueryKey(group.id) });
          qc.invalidateQueries({ queryKey: getListGroupsQueryKey() });
          qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
          toast({ title: "Contact added to group" });
          setShowAddMember(false);
          setAddContactId("none");
        },
        onError: () => toast({ title: "Failed to add", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {members?.total ?? 0} Members
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs gap-1 px-2"
          onClick={() => setShowAddMember(true)}
        >
          <UserPlus className="w-3 h-3" />
          Add
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : !members?.data || members.data.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2 text-center">No members yet. Add contacts from the Contacts page or use the Add button above.</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
          {members.data.map((contact) => (
            <div key={contact.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 group/member">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium truncate block">{contact.name}</span>
                <span className="text-xs text-muted-foreground">{contact.phone}</span>
              </div>
              <Badge variant="outline" className={`text-[10px] capitalize shrink-0 ${CHANNEL_CONFIG[contact.channel] ?? ""}`}>
                {contact.channel}
              </Badge>
              <button
                onClick={() => handleRemove(contact.id)}
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/member:opacity-100 transition-all shrink-0"
                title="Remove from group"
              >
                <UserMinus className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add member inline */}
      {showAddMember && (
        <div className="mt-2 flex gap-2">
          <Select value={addContactId} onValueChange={setAddContactId}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Choose contact…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Choose contact…</SelectItem>
              {nonMembers.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name} — {c.phone}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs px-3" onClick={handleAdd} disabled={addContactId === "none" || addContacts.isPending}>
            Add
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => { setShowAddMember(false); setAddContactId("none"); }}>
            ✕
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Groups() {
  const [showCreate, setShowCreate] = useState(false);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: groups, isLoading } = useListGroups({ query: { queryKey: getListGroupsQueryKey() } });
  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const deleteGroup = useDeleteGroup();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "" },
  });

  const openCreate = () => { form.reset({ name: "", description: "" }); setEditGroup(null); setShowCreate(true); };
  const openEdit = (g: Group) => { form.reset({ name: g.name, description: g.description ?? "" }); setEditGroup(g); setShowCreate(true); };

  const onSubmit = (values: FormValues) => {
    if (editGroup) {
      updateGroup.mutate(
        { id: editGroup.id, data: { name: values.name, description: values.description || null } },
        {
          onSuccess: () => { qc.invalidateQueries({ queryKey: getListGroupsQueryKey() }); toast({ title: "Group updated" }); setShowCreate(false); },
        }
      );
    } else {
      createGroup.mutate(
        { data: { name: values.name, description: values.description || null } },
        {
          onSuccess: () => { qc.invalidateQueries({ queryKey: getListGroupsQueryKey() }); toast({ title: "Group created" }); setShowCreate(false); },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    deleteGroup.mutate({ id }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListGroupsQueryKey() }); toast({ title: "Group deleted" }); if (expandedId === id) setExpandedId(null); },
    });
  };

  const toggleExpand = (id: number) => setExpandedId((prev) => prev === id ? null : id);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Groups</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Organise contacts into groups for targeted messaging</p>
        </div>
        <Button size="sm" className="gap-2" onClick={openCreate} data-testid="button-create-group">
          <Plus className="w-4 h-4" />New Group
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : !groups || groups.length === 0 ? (
        <div className="text-center py-20">
          <FolderOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No groups yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create groups to organise your contacts — by region, contribution tier, department, etc.</p>
          <Button size="sm" className="mt-4 gap-2" onClick={openCreate}><Plus className="w-4 h-4" />Create Group</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((g) => {
            const isExpanded = expandedId === g.id;
            return (
              <Card
                key={g.id}
                data-testid={`group-card-${g.id}`}
                className={`transition-shadow ${isExpanded ? "shadow-sm ring-1 ring-primary/20" : "hover:shadow-sm"}`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{g.name}</p>
                      {g.description && <p className="text-sm text-muted-foreground mt-0.5 truncate">{g.description}</p>}
                      <div className="flex items-center gap-3 mt-3">
                        <span className="text-2xl font-bold text-primary">{g.contactCount}</span>
                        <span className="text-xs text-muted-foreground">members</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Created {format(new Date(g.createdAt), "d MMM yyyy")}</p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => toggleExpand(g.id)}
                        title={isExpanded ? "Collapse" : "View members"}
                        className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${isExpanded ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => openEdit(g)}
                        data-testid={`edit-group-${g.id}`}
                        className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(g.id)}
                        data-testid={`delete-group-${g.id}`}
                        className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && <GroupMemberPanel group={g} onClose={() => setExpandedId(null)} />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editGroup ? "Edit Group" : "Create Group"}</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Group Name</FormLabel><FormControl><Input placeholder="e.g. Nairobi Branch Members" data-testid="input-group-name" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description (optional)</FormLabel><FormControl><Textarea placeholder="What is this group for?" rows={2} {...field} /></FormControl></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" disabled={createGroup.isPending || updateGroup.isPending} data-testid="button-save-group">
                  {editGroup ? "Save Changes" : "Create Group"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
