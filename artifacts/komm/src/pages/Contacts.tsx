import { useState } from "react";
import { Plus, Upload, Search, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListContacts,
  useCreateContact,
  useDeleteContact,
  useListGroups,
  getListContactsQueryKey,
  getListGroupsQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(9, "Valid phone number required"),
  email: z.string().email().optional().or(z.literal("")),
  channel: z.enum(["sms", "whatsapp", "email"]),
  groupIds: z.array(z.number()),
});

type ContactFormValues = z.infer<typeof contactSchema>;

const CHANNEL_CONFIG: Record<string, string> = {
  sms: "bg-primary/10 text-primary",
  whatsapp: "bg-emerald-100 text-emerald-800",
  email: "bg-amber-100 text-amber-800",
};

export default function Contacts() {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: groups } = useListGroups({ query: { queryKey: getListGroupsQueryKey() } });

  const { data, isLoading } = useListContacts(
    {
      search: search || undefined,
      groupId: groupFilter !== "all" ? parseInt(groupFilter) : undefined,
      page: 1,
      limit: 100,
    },
    {
      query: {
        queryKey: getListContactsQueryKey({
          search: search || undefined,
          groupId: groupFilter !== "all" ? parseInt(groupFilter) : undefined,
          page: 1,
          limit: 100,
        }),
      },
    }
  );

  const createContact = useCreateContact();
  const deleteContact = useDeleteContact();

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", phone: "", email: "", channel: "sms", groupIds: [] },
  });

  const onSubmit = (values: ContactFormValues) => {
    createContact.mutate(
      {
        data: {
          name: values.name,
          phone: values.phone,
          email: values.email || null,
          channel: values.channel,
          groupIds: values.groupIds,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          toast({ title: "Contact added" });
          setShowAdd(false);
          form.reset();
        },
        onError: () => toast({ title: "Failed to add contact", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteContact.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          toast({ title: "Contact removed" });
        },
      }
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data?.total ?? 0} contacts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" data-testid="button-import">
            <Upload className="w-4 h-4" />
            Import CSV
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)} data-testid="button-add-contact">
            <Plus className="w-4 h-4" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
            data-testid="input-search-contacts"
          />
        </div>
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="w-40 h-8 text-sm" data-testid="filter-group">
            <SelectValue placeholder="All groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            {(groups ?? []).map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>
                {g.name} ({g.contactCount})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        {/* Table header */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-border bg-muted/30">
          <span className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</span>
          <span className="w-32 text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone</span>
          <span className="w-24 text-xs font-medium text-muted-foreground uppercase tracking-wide">Channel</span>
          <span className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Groups</span>
          <span className="w-28 text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">Added</span>
          <span className="w-7" />
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="px-5 py-3">
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : !data?.data || data.data.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No contacts yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add contacts manually or import from a CSV file.</p>
              <Button size="sm" className="mt-4 gap-2" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4" />
                Add Contact
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.data.map((contact) => (
                <div
                  key={contact.id}
                  data-testid={`contact-row-${contact.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{contact.name}</p>
                    {contact.email && <p className="text-xs text-muted-foreground truncate">{contact.email}</p>}
                  </div>
                  <span className="text-sm text-muted-foreground w-32 shrink-0">{contact.phone}</span>
                  <div className="w-24">
                    <Badge variant="outline" className={`text-[11px] capitalize ${CHANNEL_CONFIG[contact.channel] ?? ""}`}>
                      {contact.channel}
                    </Badge>
                  </div>
                  <div className="flex-1 flex flex-wrap gap-1">
                    {(contact.groupIds ?? []).slice(0, 3).map((gid) => {
                      const g = groups?.find((gr) => gr.id === gid);
                      return g ? (
                        <Badge key={gid} variant="outline" className="text-[10px]">{g.name}</Badge>
                      ) : null;
                    })}
                    {(contact.groupIds ?? []).length > 3 && (
                      <Badge variant="outline" className="text-[10px]">+{(contact.groupIds ?? []).length - 3}</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground w-28 text-right shrink-0">
                    {format(new Date(contact.createdAt), "MMM d, yyyy")}
                  </span>
                  <button
                    onClick={() => handleDelete(contact.id)}
                    data-testid={`delete-contact-${contact.id}`}
                    className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add contact dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input placeholder="Jane Wambua" data-testid="input-contact-name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl><Input placeholder="+254712345678" data-testid="input-contact-phone" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl><Input placeholder="jane@example.com" data-testid="input-contact-email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preferred Channel</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger data-testid="select-contact-channel">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit" disabled={createContact.isPending} data-testid="button-save-contact">
                  Add Contact
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
