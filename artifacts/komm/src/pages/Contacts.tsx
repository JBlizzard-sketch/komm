import { useState, useRef } from "react";
import {
  Plus, Upload, Search, Trash2, Users, FileSpreadsheet,
  CheckCircle2, AlertCircle, X, Download, UserPlus, CheckSquare, Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListContacts, useCreateContact, useDeleteContact,
  useImportContacts, useBulkDeleteContacts, useBulkAddContactsToGroup,
  useListGroups,
  getListContactsQueryKey, getListGroupsQueryKey, getGetDashboardStatsQueryKey,
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

interface ParsedContact { name: string; phone: string; email?: string; channel: string }

function parseCSV(text: string): ParsedContact[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));
  const col = (names: string[]) => { for (const n of names) { const i = headers.indexOf(n); if (i !== -1) return i; } return -1; };
  const nameCol = col(["name", "full name", "fullname", "contact name"]);
  const phoneCol = col(["phone", "phone number", "mobile", "msisdn", "tel"]);
  const emailCol = col(["email", "email address"]);
  const channelCol = col(["channel", "preferred channel"]);
  if (nameCol === -1 || phoneCol === -1) return [];
  return lines.slice(1)
    .map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return { name: cols[nameCol] ?? "", phone: cols[phoneCol] ?? "", email: emailCol !== -1 ? cols[emailCol] || undefined : undefined, channel: channelCol !== -1 && cols[channelCol] ? cols[channelCol].toLowerCase() : "sms" };
    })
    .filter((c) => c.name && c.phone);
}

function exportContactsCSV(contacts: { name: string; phone: string; email: string | null; channel: string }[]) {
  const header = "name,phone,email,channel";
  const rows = contacts.map((c) => `"${c.name}","${c.phone}","${c.email ?? ""}","${c.channel}"`);
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `komm-contacts-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function CSVImportDialog({ open, onClose, groups }: { open: boolean; onClose: () => void; groups: { id: number; name: string; contactCount: number }[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedContact[]>([]);
  const [fileName, setFileName] = useState("");
  const [targetGroup, setTargetGroup] = useState("none");
  const [result, setResult] = useState<{ imported: number; duplicates: number; errors: number; errorDetails?: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const importContacts = useImportContacts();

  const handleFile = (file: File) => { setFileName(file.name); setResult(null); const r = new FileReader(); r.onload = (e) => { setParsed(parseCSV(e.target?.result as string)); }; r.readAsText(file); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f?.name.endsWith(".csv")) handleFile(f); else toast({ title: "Please drop a CSV file", variant: "destructive" }); };

  const handleImport = () => {
    if (parsed.length === 0) return;
    importContacts.mutate(
      { data: { contacts: parsed.map((c) => ({ name: c.name, phone: c.phone, email: c.email ?? null, channel: (c.channel as "sms" | "whatsapp" | "email") || "sms" })), groupId: targetGroup !== "none" ? parseInt(targetGroup) : undefined } },
      {
        onSuccess: (res) => { setResult(res); qc.invalidateQueries({ queryKey: getListContactsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() }); qc.invalidateQueries({ queryKey: getListGroupsQueryKey() }); },
        onError: () => toast({ title: "Import failed", variant: "destructive" }),
      }
    );
  };

  const handleClose = () => { setParsed([]); setFileName(""); setResult(null); setTargetGroup("none"); onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-primary" />Import from CSV</DialogTitle></DialogHeader>
        {!result ? (
          <div className="space-y-4">
            <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={() => fileRef.current?.click()}>
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              {fileName ? (<div><p className="text-sm font-medium">{fileName}</p><p className="text-xs text-muted-foreground mt-1">{parsed.length} contacts found</p></div>)
                : (<div><p className="text-sm font-medium">Drop CSV file here or click to browse</p><p className="text-xs text-muted-foreground mt-1">Required: <code className="bg-muted px-1 rounded">name</code>, <code className="bg-muted px-1 rounded">phone</code> · Optional: <code className="bg-muted px-1 rounded">email</code>, <code className="bg-muted px-1 rounded">channel</code></p></div>)}
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
            {parsed.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="grid grid-cols-3 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wide"><span>Name</span><span>Phone</span><span>Channel</span></div>
                <div className="max-h-40 overflow-y-auto divide-y divide-border">
                  {parsed.slice(0, 20).map((c, i) => (<div key={i} className="grid grid-cols-3 px-3 py-2 text-sm"><span className="truncate font-medium">{c.name}</span><span className="text-muted-foreground truncate">{c.phone}</span><Badge variant="outline" className={`w-fit text-[10px] capitalize ${CHANNEL_CONFIG[c.channel] ?? ""}`}>{c.channel}</Badge></div>))}
                  {parsed.length > 20 && <div className="px-3 py-2 text-xs text-muted-foreground">…and {parsed.length - 20} more</div>}
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium block mb-1.5">Add to group (optional)</label>
              <Select value={targetGroup} onValueChange={setTargetGroup}><SelectTrigger className="text-sm"><SelectValue placeholder="No group" /></SelectTrigger><SelectContent><SelectItem value="none">No group</SelectItem>{groups.map((g) => (<SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>))}</SelectContent></Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleImport} disabled={parsed.length === 0 || importContacts.isPending}>{importContacts.isPending ? "Importing…" : `Import ${parsed.length} contacts`}</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center"><CheckCircle2 className="w-6 h-6 text-green-600 mx-auto mb-1" /><p className="text-xl font-bold text-green-700">{result.imported}</p><p className="text-xs text-green-600">Imported</p></div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center"><AlertCircle className="w-6 h-6 text-amber-600 mx-auto mb-1" /><p className="text-xl font-bold text-amber-700">{result.duplicates}</p><p className="text-xs text-amber-600">Duplicates</p></div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center"><X className="w-6 h-6 text-red-600 mx-auto mb-1" /><p className="text-xl font-bold text-red-700">{result.errors}</p><p className="text-xs text-red-600">Failed</p></div>
            </div>
            <DialogFooter><Button onClick={handleClose}>Done</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Contacts() {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkGroup, setShowBulkGroup] = useState(false);
  const [bulkGroupId, setBulkGroupId] = useState("none");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: groups } = useListGroups({ query: { queryKey: getListGroupsQueryKey() } });

  const { data, isLoading } = useListContacts(
    { search: search || undefined, groupId: groupFilter !== "all" ? parseInt(groupFilter) : undefined, page: 1, limit: 200 },
    { query: { queryKey: getListContactsQueryKey({ search: search || undefined, groupId: groupFilter !== "all" ? parseInt(groupFilter) : undefined, page: 1, limit: 200 }) } }
  );

  const contacts = data?.data ?? [];
  const createContact = useCreateContact();
  const deleteContact = useDeleteContact();
  const bulkDelete = useBulkDeleteContacts();
  const bulkGroup = useBulkAddContactsToGroup();

  const form = useForm<ContactFormValues>({ resolver: zodResolver(contactSchema), defaultValues: { name: "", phone: "", email: "", channel: "sms", groupIds: [] } });

  const toggleSelect = (id: number) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const toggleAll = () => {
    if (selected.size === contacts.length) setSelected(new Set());
    else setSelected(new Set(contacts.map((c) => c.id)));
  };
  const clearSelected = () => setSelected(new Set());

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    bulkDelete.mutate(
      { data: { contactIds: [...selected] } },
      {
        onSuccess: (res) => {
          qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          toast({ title: `${res.deleted} contact${res.deleted !== 1 ? "s" : ""} deleted` });
          clearSelected();
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      }
    );
  };

  const handleBulkGroup = () => {
    if (selected.size === 0 || bulkGroupId === "none") return;
    bulkGroup.mutate(
      { data: { contactIds: [...selected], groupId: parseInt(bulkGroupId) } },
      {
        onSuccess: (res) => {
          qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
          qc.invalidateQueries({ queryKey: getListGroupsQueryKey() });
          toast({ title: `${res.added} contact${res.added !== 1 ? "s" : ""} added to group` });
          setShowBulkGroup(false);
          clearSelected();
        },
        onError: () => toast({ title: "Failed to add to group", variant: "destructive" }),
      }
    );
  };

  const onSubmit = (values: ContactFormValues) => {
    createContact.mutate(
      { data: { name: values.name, phone: values.phone, email: values.email || null, channel: values.channel, groupIds: values.groupIds } },
      {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getListContactsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() }); toast({ title: "Contact added" }); setShowAdd(false); form.reset(); },
        onError: () => toast({ title: "Failed to add contact", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteContact.mutate({ id }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListContactsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() }); toast({ title: "Contact removed" }); },
    });
  };

  const allSelected = contacts.length > 0 && selected.size === contacts.length;
  const someSelected = selected.size > 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data?.total ?? 0} contacts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => exportContactsCSV(contacts)} disabled={contacts.length === 0} data-testid="button-export">
            <Download className="w-4 h-4" />Export CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowImport(true)} data-testid="button-import">
            <Upload className="w-4 h-4" />Import CSV
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)} data-testid="button-add-contact">
            <Plus className="w-4 h-4" />Add Contact
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="All groups" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            {(groups ?? []).map((g) => (<SelectItem key={g.id} value={String(g.id)}>{g.name} ({g.contactCount})</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk actions bar */}
      {someSelected && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium text-primary">{selected.size} selected</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="gap-2 h-7 text-xs" onClick={() => setShowBulkGroup(true)}>
            <UserPlus className="w-3.5 h-3.5" />Add to Group
          </Button>
          <Button variant="outline" size="sm" className="gap-2 h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleBulkDelete} disabled={bulkDelete.isPending}>
            <Trash2 className="w-3.5 h-3.5" />{bulkDelete.isPending ? "Deleting…" : "Delete"}
          </Button>
          <button onClick={clearSelected} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <Card>
        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-border bg-muted/30">
          <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground shrink-0">
            {allSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
          </button>
          <span className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</span>
          <span className="w-32 text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone</span>
          <span className="w-24 text-xs font-medium text-muted-foreground uppercase tracking-wide">Channel</span>
          <span className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Groups</span>
          <span className="w-28 text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">Added</span>
          <span className="w-7" />
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">{[...Array(6)].map((_, i) => (<div key={i} className="px-5 py-3"><Skeleton className="h-10 w-full" /></div>))}</div>
          ) : contacts.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No contacts yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add contacts manually or import from a CSV file.</p>
              <div className="flex gap-2 justify-center mt-4">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowImport(true)}><Upload className="w-4 h-4" />Import CSV</Button>
                <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4" />Add Contact</Button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {contacts.map((contact) => (
                <div key={contact.id} className={`flex items-center gap-4 px-5 py-3 hover:bg-muted/20 group ${selected.has(contact.id) ? "bg-primary/5" : ""}`}>
                  <button onClick={() => toggleSelect(contact.id)} className="shrink-0 text-muted-foreground hover:text-primary">
                    {selected.has(contact.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{contact.name}</p>
                    {contact.email && <p className="text-xs text-muted-foreground truncate">{contact.email}</p>}
                  </div>
                  <span className="text-sm text-muted-foreground w-32 shrink-0">{contact.phone}</span>
                  <div className="w-24">
                    <Badge variant="outline" className={`text-[11px] capitalize ${CHANNEL_CONFIG[contact.channel] ?? ""}`}>{contact.channel}</Badge>
                  </div>
                  <div className="flex-1 flex flex-wrap gap-1">
                    {(contact.groupIds ?? []).slice(0, 3).map((gid) => { const g = groups?.find((gr) => gr.id === gid); return g ? (<Badge key={gid} variant="outline" className="text-[10px]">{g.name}</Badge>) : null; })}
                    {(contact.groupIds ?? []).length > 3 && <Badge variant="outline" className="text-[10px]">+{(contact.groupIds ?? []).length - 3}</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground w-28 text-right shrink-0">{format(new Date(contact.createdAt), "MMM d, yyyy")}</span>
                  <button onClick={() => handleDelete(contact.id)} className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk add to group dialog */}
      <Dialog open={showBulkGroup} onOpenChange={setShowBulkGroup}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add {selected.size} Contacts to Group</DialogTitle></DialogHeader>
          <div>
            <label className="text-sm font-medium block mb-1.5">Select group</label>
            <Select value={bulkGroupId} onValueChange={setBulkGroupId}>
              <SelectTrigger><SelectValue placeholder="Choose a group" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Choose a group</SelectItem>
                {(groups ?? []).map((g) => (<SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkGroup(false)}>Cancel</Button>
            <Button onClick={handleBulkGroup} disabled={bulkGroupId === "none" || bulkGroup.isPending}>
              {bulkGroup.isPending ? "Adding…" : "Add to Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CSVImportDialog open={showImport} onClose={() => setShowImport(false)} groups={groups ?? []} />

      {/* Add contact dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Full Name</FormLabel><FormControl><Input placeholder="Jane Wambua" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input placeholder="+254712345678" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email (optional)</FormLabel><FormControl><Input placeholder="jane@example.com" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="channel" render={({ field }) => (<FormItem><FormLabel>Preferred Channel</FormLabel><Select value={field.value} onValueChange={field.onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="email">Email</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit" disabled={createContact.isPending}>Add Contact</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
