import { useState, useRef } from "react";
import { Plus, Upload, Search, Trash2, Users, FileSpreadsheet, CheckCircle2, AlertCircle, X } from "lucide-react";
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
  useImportContacts,
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

interface ParsedContact {
  name: string;
  phone: string;
  email?: string;
  channel: string;
}

function parseCSV(text: string): ParsedContact[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(",").map((h) => h.trim().replace(/"/g, ""));

  const colIndex = (names: string[]) => {
    for (const n of names) {
      const idx = headers.indexOf(n);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const nameCol = colIndex(["name", "full name", "fullname", "contact name"]);
  const phoneCol = colIndex(["phone", "phone number", "mobile", "msisdn", "tel"]);
  const emailCol = colIndex(["email", "email address"]);
  const channelCol = colIndex(["channel", "preferred channel"]);

  if (nameCol === -1 || phoneCol === -1) return [];

  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return {
        name: cols[nameCol] ?? "",
        phone: cols[phoneCol] ?? "",
        email: emailCol !== -1 ? cols[emailCol] || undefined : undefined,
        channel: channelCol !== -1 && cols[channelCol] ? cols[channelCol].toLowerCase() : "sms",
      };
    })
    .filter((c) => c.name && c.phone);
}

interface ImportResult {
  imported: number;
  duplicates: number;
  errors: number;
  errorDetails?: string[];
}

function CSVImportDialog({
  open,
  onClose,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  groups: { id: number; name: string; contactCount: number }[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedContact[]>([]);
  const [fileName, setFileName] = useState("");
  const [targetGroup, setTargetGroup] = useState<string>("none");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const importContacts = useImportContacts();

  const handleFile = (file: File) => {
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const contacts = parseCSV(text);
      setParsed(contacts);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) handleFile(file);
    else toast({ title: "Please drop a CSV file", variant: "destructive" });
  };

  const handleImport = () => {
    if (parsed.length === 0) return;
    importContacts.mutate(
      {
        data: {
          contacts: parsed.map((c) => ({
            name: c.name,
            phone: c.phone,
            email: c.email ?? null,
            channel: (c.channel as "sms" | "whatsapp" | "email") || "sms",
          })),
          groupId: targetGroup !== "none" ? parseInt(targetGroup) : undefined,
        },
      },
      {
        onSuccess: (res) => {
          setResult(res);
          qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
          qc.invalidateQueries({ queryKey: getListGroupsQueryKey() });
        },
        onError: () => {
          toast({ title: "Import failed", variant: "destructive" });
        },
      }
    );
  };

  const handleClose = () => {
    setParsed([]);
    setFileName("");
    setResult(null);
    setTargetGroup("none");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Import from CSV
          </DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              {fileName ? (
                <div>
                  <p className="text-sm font-medium text-foreground">{fileName}</p>
                  <p className="text-xs text-muted-foreground mt-1">{parsed.length} contacts found</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-foreground">Drop CSV file here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Required columns: <code className="bg-muted px-1 rounded">name</code>,{" "}
                    <code className="bg-muted px-1 rounded">phone</code> · Optional:{" "}
                    <code className="bg-muted px-1 rounded">email</code>,{" "}
                    <code className="bg-muted px-1 rounded">channel</code>
                  </p>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            {/* Preview */}
            {parsed.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="grid grid-cols-3 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <span>Name</span><span>Phone</span><span>Channel</span>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-border">
                  {parsed.slice(0, 20).map((c, i) => (
                    <div key={i} className="grid grid-cols-3 px-3 py-2 text-sm">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="text-muted-foreground truncate">{c.phone}</span>
                      <Badge variant="outline" className={`w-fit text-[10px] capitalize ${CHANNEL_CONFIG[c.channel] ?? ""}`}>{c.channel}</Badge>
                    </div>
                  ))}
                  {parsed.length > 20 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      …and {parsed.length - 20} more contacts
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Group assignment */}
            <div>
              <label className="text-sm font-medium block mb-1.5">Add to group (optional)</label>
              <Select value={targetGroup} onValueChange={setTargetGroup}>
                <SelectTrigger className="text-sm" data-testid="select-import-group">
                  <SelectValue placeholder="No group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No group</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleImport}
                disabled={parsed.length === 0 || importContacts.isPending}
                data-testid="button-confirm-import"
              >
                {importContacts.isPending ? "Importing…" : `Import ${parsed.length} contacts`}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto mb-1" />
                <p className="text-xl font-bold text-green-700">{result.imported}</p>
                <p className="text-xs text-green-600">Imported</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                <AlertCircle className="w-6 h-6 text-amber-600 mx-auto mb-1" />
                <p className="text-xl font-bold text-amber-700">{result.duplicates}</p>
                <p className="text-xs text-amber-600">Duplicates</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <X className="w-6 h-6 text-red-600 mx-auto mb-1" />
                <p className="text-xl font-bold text-red-700">{result.errors}</p>
                <p className="text-xs text-red-600">Failed</p>
              </div>
            </div>
            {result.errorDetails && result.errorDetails.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <p className="text-xs font-medium text-red-700 mb-1">Errors:</p>
                {result.errorDetails.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-xs text-red-600">{e}</p>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Contacts() {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
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
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowImport(true)}
            data-testid="button-import"
          >
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
              <div className="flex gap-2 justify-center mt-4">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowImport(true)}>
                  <Upload className="w-4 h-4" />
                  Import CSV
                </Button>
                <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
                  <Plus className="w-4 h-4" />
                  Add Contact
                </Button>
              </div>
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

      {/* CSV Import Dialog */}
      <CSVImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        groups={groups ?? []}
      />

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
