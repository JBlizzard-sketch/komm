import { useState, useRef, useEffect } from "react";
import {
  Plus, Upload, Search, Trash2, Users, FileSpreadsheet,
  CheckCircle2, AlertCircle, X, Download, UserPlus, CheckSquare, Square, Edit2,
  ChevronLeft, ChevronRight, History, ExternalLink, BellOff, Bell,
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
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ContactFormDialog } from "@/components/ContactFormDialog";
import {
  useListContacts, useDeleteContact,
  useImportContacts, useBulkDeleteContacts, useBulkAddContactsToGroup,
  useListGroups,
  getListContactsQueryKey, getListGroupsQueryKey, getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";
import type { Contact } from "@workspace/api-client-react";

const CHANNEL_CONFIG: Record<string, string> = {
  sms: "bg-primary/10 text-primary",
  whatsapp: "bg-emerald-100 text-emerald-800",
  email: "bg-amber-100 text-amber-800",
};

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  delivered: { label: "Delivered", class: "bg-green-100 text-green-800 border-green-200" },
  sent:      { label: "Sent",      class: "bg-blue-100 text-blue-800 border-blue-200" },
  pending:   { label: "Pending",   class: "bg-amber-100 text-amber-800 border-amber-200" },
  failed:    { label: "Failed",    class: "bg-red-100 text-red-800 border-red-200" },
};

const PAGE_SIZE = 50;

// ── Types ──────────────────────────────────────────────────────────────────

interface ParsedContact { name: string; phone: string; email?: string; channel: string; customFields?: Record<string, string> }

interface ContactMessage {
  id: number;
  campaignId: number;
  campaignName: string;
  channel: string;
  status: string;
  errorMessage?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
}

// ── CSV helpers ────────────────────────────────────────────────────────────

const KNOWN_CSV_COLS = new Set(["name", "full name", "fullname", "contact name", "phone", "phone number", "mobile", "msisdn", "tel", "email", "email address", "channel", "preferred channel"]);

interface SkippedRow { row: number; reason: string; raw: string }
interface ParseResult { valid: ParsedContact[]; skipped: SkippedRow[] }

function parseCSV(text: string): ParseResult {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { valid: [], skipped: [] };
  const headers = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));
  const col = (names: string[]) => { for (const n of names) { const i = headers.indexOf(n); if (i !== -1) return i; } return -1; };
  const nameCol = col(["name", "full name", "fullname", "contact name"]);
  const phoneCol = col(["phone", "phone number", "mobile", "msisdn", "tel"]);
  const emailCol = col(["email", "email address"]);
  const channelCol = col(["channel", "preferred channel"]);
  const extraCols = headers.map((h, i) => ({ key: h, idx: i })).filter(({ key }) => !KNOWN_CSV_COLS.has(key));
  if (nameCol === -1 || phoneCol === -1) return { valid: [], skipped: [] };
  const valid: ParsedContact[] = [];
  const skipped: SkippedRow[] = [];
  lines.slice(1).forEach((line, idx) => {
    if (!line.trim()) return;
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const name = cols[nameCol] ?? "";
    const phone = cols[phoneCol] ?? "";
    if (!name && !phone) { skipped.push({ row: idx + 2, reason: "Missing name and phone", raw: line.slice(0, 60) }); return; }
    if (!name) { skipped.push({ row: idx + 2, reason: "Missing name", raw: line.slice(0, 60) }); return; }
    if (!phone) { skipped.push({ row: idx + 2, reason: "Missing phone number", raw: line.slice(0, 60) }); return; }
    const customFields: Record<string, string> = {};
    for (const { key, idx: cidx } of extraCols) { if (cols[cidx]) customFields[key] = cols[cidx]; }
    valid.push({ name, phone, email: emailCol !== -1 ? cols[emailCol] || undefined : undefined, channel: channelCol !== -1 && cols[channelCol] ? cols[channelCol].toLowerCase() : "sms", ...(Object.keys(customFields).length > 0 ? { customFields } : {}) });
  });
  return { valid, skipped };
}

function exportContactsCSV(contacts: { name: string; phone: string; email: string | null; channel: string; customFields?: Record<string, unknown> | null }[]) {
  const customKeys = Array.from(new Set(contacts.flatMap((c) => Object.keys(c.customFields ?? {}))));
  const header = ["name", "phone", "email", "channel", ...customKeys].join(",");
  const rows = contacts.map((c) => {
    const base = [`"${c.name}"`, `"${c.phone}"`, `"${c.email ?? ""}"`, `"${c.channel}"`];
    const extra = customKeys.map((k) => `"${(c.customFields as Record<string, string> | null | undefined)?.[k] ?? ""}"`);
    return [...base, ...extra].join(",");
  });
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `komm-contacts-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Contact History Sheet ──────────────────────────────────────────────────

function ContactHistorySheet({ contact, open, onClose }: { contact: Contact | null; open: boolean; onClose: () => void }) {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<{ data: ContactMessage[]; total: number }>({
    queryKey: ["contact-messages", contact?.id],
    queryFn: async () => {
      const res = await fetch(`/api/contacts/${contact!.id}/messages?limit=20`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: open && !!contact,
    staleTime: 30_000,
  });

  if (!contact) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 font-semibold text-primary text-sm">
              {contact.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base font-semibold">{contact.name}</SheetTitle>
              <p className="text-sm text-muted-foreground">{contact.phone}</p>
              {contact.email && <p className="text-xs text-muted-foreground truncate">{contact.email}</p>}
            </div>
            <Badge variant="outline" className={`text-[11px] capitalize shrink-0 ${CHANNEL_CONFIG[contact.channel] ?? ""}`}>
              {contact.channel}
            </Badge>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-muted-foreground" />
              Message History
            </p>
            {data && <span className="text-xs text-muted-foreground">{data.total} total</span>}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : !data?.data || data.data.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No messages yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                This contact hasn't been included in any campaigns.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.data.map((msg) => {
                const sc = STATUS_CONFIG[msg.status] ?? STATUS_CONFIG.pending;
                return (
                  <div key={msg.id} className="rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        className="text-sm font-medium text-foreground hover:text-primary hover:underline flex items-center gap-1 text-left"
                        onClick={() => { onClose(); navigate(`/campaigns/${msg.campaignId}`); }}
                      >
                        {msg.campaignName}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </button>
                      <Badge variant="outline" className={`shrink-0 text-[10px] ${sc.class}`}>
                        {sc.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="outline" className={`text-[10px] capitalize ${CHANNEL_CONFIG[msg.channel] ?? ""}`}>
                        {msg.channel}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(msg.createdAt), "d MMM yyyy, HH:mm")}
                      </span>
                    </div>
                    {msg.errorMessage && (
                      <p className="text-xs text-red-600 mt-1.5 bg-red-50 rounded px-2 py-1">{msg.errorMessage}</p>
                    )}
                    {msg.deliveredAt && (
                      <p className="text-xs text-green-700 mt-1">
                        Delivered {format(new Date(msg.deliveredAt), "d MMM, HH:mm")}
                      </p>
                    )}
                  </div>
                );
              })}
              {data.total > 20 && (
                <p className="text-center text-xs text-muted-foreground pt-2">
                  Showing latest 20 of {data.total} messages
                </p>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── CSV Import Dialog ──────────────────────────────────────────────────────

function CSVImportDialog({ open, onClose, groups }: { open: boolean; onClose: () => void; groups: { id: number; name: string; contactCount: number }[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parseResult, setParseResult] = useState<ParseResult>({ valid: [], skipped: [] });
  const [fileName, setFileName] = useState("");
  const [targetGroup, setTargetGroup] = useState("none");
  const [result, setResult] = useState<{ imported: number; duplicates: number; errors: number; errorDetails?: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const importContacts = useImportContacts();

  const handleFile = (file: File) => { setFileName(file.name); setResult(null); setShowSkipped(false); const r = new FileReader(); r.onload = (e) => { setParseResult(parseCSV(e.target?.result as string)); }; r.readAsText(file); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f?.name.endsWith(".csv")) handleFile(f); else toast({ title: "Please drop a CSV file", variant: "destructive" }); };

  const handleImport = () => {
    if (parseResult.valid.length === 0) return;
    importContacts.mutate(
      { data: { contacts: parseResult.valid.map((c) => ({ name: c.name, phone: c.phone, email: c.email ?? null, channel: (c.channel as "sms" | "whatsapp" | "email") || "sms", customFields: c.customFields ?? null })), groupId: targetGroup !== "none" ? parseInt(targetGroup) : undefined } },
      {
        onSuccess: (res) => { setResult(res); qc.invalidateQueries({ queryKey: getListContactsQueryKey() }); qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() }); qc.invalidateQueries({ queryKey: getListGroupsQueryKey() }); },
        onError: () => toast({ title: "Import failed", variant: "destructive" }),
      }
    );
  };

  const handleClose = () => { setParseResult({ valid: [], skipped: [] }); setFileName(""); setResult(null); setTargetGroup("none"); setShowSkipped(false); onClose(); };
  const parsed = parseResult.valid;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-primary" />Import from CSV</DialogTitle></DialogHeader>
        {!result ? (
          <div className="space-y-4">
            <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={() => fileRef.current?.click()}>
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              {fileName ? (<div><p className="text-sm font-medium">{fileName}</p><p className="text-xs text-muted-foreground mt-1">{parsed.length} contacts ready to import{parseResult.skipped.length > 0 ? `, ${parseResult.skipped.length} rows skipped` : ""}</p></div>)
                : (<div><p className="text-sm font-medium">Drop CSV file here or click to browse</p><p className="text-xs text-muted-foreground mt-1">Required: <code className="bg-muted px-1 rounded">name</code>, <code className="bg-muted px-1 rounded">phone</code> · Optional: <code className="bg-muted px-1 rounded">email</code>, <code className="bg-muted px-1 rounded">channel</code> · Any extra columns become member data (e.g. <code className="bg-muted px-1 rounded">amount</code>, <code className="bg-muted px-1 rounded">balance</code>)</p></div>)}
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
            {parseResult.skipped.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-amber-800"
                  onClick={() => setShowSkipped((s) => !s)}
                >
                  <span className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {parseResult.skipped.length} row{parseResult.skipped.length !== 1 ? "s" : ""} skipped (missing required fields)
                  </span>
                  <span className="text-amber-600">{showSkipped ? "▲ Hide" : "▼ Show"}</span>
                </button>
                {showSkipped && (
                  <div className="border-t border-amber-200 max-h-28 overflow-y-auto divide-y divide-amber-100">
                    {parseResult.skipped.map((s) => (
                      <div key={s.row} className="px-3 py-1.5 text-xs text-amber-800">
                        <span className="font-medium">Row {s.row}:</span> {s.reason} — <span className="text-amber-600 font-mono">{s.raw}</span>
                      </div>
                    ))}
                  </div>
                )}
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
            {parseResult.skipped.length > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                {parseResult.skipped.length} row{parseResult.skipped.length !== 1 ? "s" : ""} were skipped before import (missing name or phone).
              </p>
            )}
            <DialogFooter><Button onClick={handleClose}>Done</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Contacts() {
  const [search, setSearch] = useState("");
  const urlOptedOut = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("optedOut") === "1";
  const [groupFilter, setGroupFilter] = useState(urlOptedOut ? "opted-out" : "all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (urlOptedOut) setGroupFilter("opted-out");
  }, []);

  const [showContactForm, setShowContactForm] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkGroup, setShowBulkGroup] = useState(false);
  const [bulkGroupId, setBulkGroupId] = useState("none");
  const [historyContact, setHistoryContact] = useState<Contact | null>(null);
  const [exportingAll, setExportingAll] = useState(false);

  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: groups } = useListGroups({ query: { queryKey: getListGroupsQueryKey() } });

  const { data: contactStats } = useQuery<{ total: number; sms: number; whatsapp: number; email: number; optedOut: number }>({
    queryKey: ["contacts", "stats"],
    queryFn: () => fetch("/api/contacts/stats").then((r) => r.json()),
    staleTime: 30_000,
  });

  const isOptedOutFilter = groupFilter === "opted-out";
  const queryParams = {
    search: search || undefined,
    groupId: !isOptedOutFilter && groupFilter !== "all" ? parseInt(groupFilter) : undefined,
    page,
    limit: PAGE_SIZE,
  };
  const queryKey = [...getListContactsQueryKey(queryParams), isOptedOutFilter ? "opted-out" : "all", channelFilter] as const;
  const { data, isLoading } = useListContacts(
    queryParams,
    {
      query: {
        queryKey,
        queryFn: async () => {
          const qs = new URLSearchParams();
          if (queryParams.search) qs.set("search", queryParams.search);
          if (queryParams.groupId) qs.set("groupId", String(queryParams.groupId));
          qs.set("page", String(queryParams.page));
          qs.set("limit", String(queryParams.limit));
          if (isOptedOutFilter) qs.set("optedOutOnly", "true");
          if (channelFilter !== "all") qs.set("channel", channelFilter);
          const res = await fetch(`/api/contacts?${qs}`);
          return res.json();
        },
      },
    }
  );

  const contacts = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const deleteContact = useDeleteContact();
  const bulkDelete = useBulkDeleteContacts();
  const bulkGroup = useBulkAddContactsToGroup();

  const toggleOptOut = useMutation({
    mutationFn: async ({ id, optedOut }: { id: number; optedOut: boolean }) => {
      const action = optedOut ? "opt-out" : "opt-in";
      const res = await fetch(`/api/contacts/${id}/${action}`, { method: "POST" });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
    },
    onError: () => toast({ title: "Failed to update opt-out status", variant: "destructive" }),
  });

  const bulkOptOut = useMutation({
    mutationFn: async (contactIds: number[]) => {
      const res = await fetch("/api/contacts/bulk-opt-out", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds }),
      });
      if (!res.ok) throw new Error();
      return res.json() as Promise<{ updated: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
      toast({ title: `${data.updated} contact${data.updated !== 1 ? "s" : ""} opted out` });
      setSelected(new Set());
    },
    onError: () => toast({ title: "Bulk opt-out failed", variant: "destructive" }),
  });

  const bulkOptIn = useMutation({
    mutationFn: async (contactIds: number[]) => {
      const res = await fetch("/api/contacts/bulk-opt-in", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds }),
      });
      if (!res.ok) throw new Error();
      return res.json() as Promise<{ updated: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
      toast({ title: `${data.updated} contact${data.updated !== 1 ? "s" : ""} re-subscribed` });
      setSelected(new Set());
    },
    onError: () => toast({ title: "Bulk opt-in failed", variant: "destructive" }),
  });

  const openAdd = () => { setEditContact(null); setShowContactForm(true); };
  const openEdit = (c: Contact) => { setEditContact(c); setShowContactForm(true); };
  const closeForm = () => { setShowContactForm(false); setEditContact(null); };

  const handleExportAll = async () => {
    setExportingAll(true);
    try {
      const params = new URLSearchParams({ page: "1", limit: "9999" });
      if (search) params.set("search", search);
      if (groupFilter !== "all") params.set("groupId", groupFilter);
      const res = await fetch(`/api/contacts?${params}`);
      const json = await res.json();
      exportContactsCSV(json.data ?? []);
      toast({ title: `Exported ${(json.data ?? []).length} contacts` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExportingAll(false);
    }
  };

  const resetPage = () => setPage(1);

  const handleSearchChange = (v: string) => { setSearch(v); resetPage(); };
  const handleGroupFilterChange = (v: string) => { setGroupFilter(v); resetPage(); };
  const handleChannelFilterChange = (v: string) => { setChannelFilter(v); resetPage(); };

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

  const handleDelete = (id: number) => {
    deleteContact.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
        toast({ title: "Contact removed" });
      },
    });
  };

  const allSelected = contacts.length > 0 && selected.size === contacts.length;
  const someSelected = selected.size > 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} contacts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportAll} disabled={total === 0 || exportingAll} data-testid="button-export">
            <Download className="w-4 h-4" />{exportingAll ? "Exporting…" : `Export CSV${total > PAGE_SIZE ? ` (${total})` : ""}`}
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowImport(true)} data-testid="button-import">
            <Upload className="w-4 h-4" />Import CSV
          </Button>
          <Button size="sm" className="gap-2" onClick={openAdd} data-testid="button-add-contact">
            <Plus className="w-4 h-4" />Add Contact
          </Button>
        </div>
      </div>

      {contactStats && (contactStats.sms > 0 || contactStats.whatsapp > 0 || contactStats.email > 0) && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {contactStats.sms > 0 && (
            <button onClick={() => handleChannelFilterChange(channelFilter === "sms" ? "all" : "sms")} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${channelFilter === "sms" ? "bg-primary/10 text-primary border-primary/30" : "bg-background text-muted-foreground border-border hover:border-primary/40"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />SMS · {contactStats.sms}
            </button>
          )}
          {contactStats.whatsapp > 0 && (
            <button onClick={() => handleChannelFilterChange(channelFilter === "whatsapp" ? "all" : "whatsapp")} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${channelFilter === "whatsapp" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-background text-muted-foreground border-border hover:border-emerald-300"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />WhatsApp · {contactStats.whatsapp}
            </button>
          )}
          {contactStats.email > 0 && (
            <button onClick={() => handleChannelFilterChange(channelFilter === "email" ? "all" : "email")} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${channelFilter === "email" ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-background text-muted-foreground border-border hover:border-amber-300"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />Email · {contactStats.email}
            </button>
          )}
          {contactStats.optedOut > 0 && (
            <button onClick={() => handleGroupFilterChange(groupFilter === "opted-out" ? "all" : "opted-out")} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${groupFilter === "opted-out" ? "bg-red-100 text-red-700 border-red-300" : "bg-background text-muted-foreground border-border hover:border-red-300"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />Opted out · {contactStats.optedOut}
            </button>
          )}
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search name or phone..." value={search} onChange={(e) => handleSearchChange(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>
        <Select value={groupFilter} onValueChange={handleGroupFilterChange}>
          <SelectTrigger className="w-44 h-8 text-sm"><SelectValue placeholder="All groups" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            <SelectItem value="opted-out">Opted out only</SelectItem>
            {(groups ?? []).map((g) => (<SelectItem key={g.id} value={String(g.id)}>{g.name} ({g.contactCount})</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={handleChannelFilterChange}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-channel-filter"><SelectValue placeholder="All channels" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="email">Email</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {someSelected && (
        <div className="flex items-center gap-2 mb-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg flex-wrap">
          <span className="text-sm font-medium text-primary">{selected.size} selected</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setShowBulkGroup(true)}>
            <UserPlus className="w-3.5 h-3.5" />Add to Group
          </Button>
          <Button
            variant="outline" size="sm" className="gap-1.5 h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            onClick={() => bulkOptOut.mutate(Array.from(selected))}
            disabled={bulkOptOut.isPending}
          >
            <BellOff className="w-3.5 h-3.5" />{bulkOptOut.isPending ? "Opting out…" : "Opt Out"}
          </Button>
          <Button
            variant="outline" size="sm" className="gap-1.5 h-7 text-xs text-green-700 hover:text-green-800 hover:bg-green-50 border-green-200"
            onClick={() => bulkOptIn.mutate(Array.from(selected))}
            disabled={bulkOptIn.isPending}
          >
            <Bell className="w-3.5 h-3.5" />{bulkOptIn.isPending ? "Re-subscribing…" : "Re-subscribe"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleBulkDelete} disabled={bulkDelete.isPending}>
            <Trash2 className="w-3.5 h-3.5" />{bulkDelete.isPending ? "Deleting…" : "Delete"}
          </Button>
          <button onClick={clearSelected} className="text-muted-foreground hover:text-foreground ml-1">
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
          <span className="w-32 text-xs font-medium text-muted-foreground uppercase tracking-wide text-right">Last Contact</span>
          <span className="w-20" />
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
                <Button size="sm" className="gap-2" onClick={openAdd}><Plus className="w-4 h-4" />Add Contact</Button>
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
                    <button
                      className="text-sm font-medium text-left hover:text-primary hover:underline transition-colors"
                      onClick={() => setHistoryContact(contact)}
                      data-testid={`contact-name-${contact.id}`}
                    >
                      {contact.name}
                    </button>
                    {contact.email && <p className="text-xs text-muted-foreground truncate">{contact.email}</p>}
                  </div>
                  <span className="text-sm text-muted-foreground w-32 shrink-0">{contact.phone}</span>
                  <div className="w-24 flex flex-col gap-1">
                    <Badge variant="outline" className={`text-[11px] capitalize ${CHANNEL_CONFIG[contact.channel] ?? ""}`}>{contact.channel}</Badge>
                    {contact.optedOut && (
                      <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">Opted Out</Badge>
                    )}
                  </div>
                  <div className="flex-1 flex flex-wrap gap-1">
                    {(contact.groupIds ?? []).slice(0, 3).map((gid) => { const g = groups?.find((gr) => gr.id === gid); return g ? (<Badge key={gid} variant="outline" className="text-[10px]">{g.name}</Badge>) : null; })}
                    {(contact.groupIds ?? []).length > 3 && <Badge variant="outline" className="text-[10px]">+{(contact.groupIds ?? []).length - 3}</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground w-32 text-right shrink-0" title={(contact as any).lastContactedAt ? format(new Date((contact as any).lastContactedAt), "MMM d, yyyy HH:mm") : `Added ${format(new Date(contact.createdAt), "MMM d, yyyy")}`}>
                    {(contact as any).lastContactedAt
                      ? formatDistanceToNow(new Date((contact as any).lastContactedAt), { addSuffix: true })
                      : <span className="text-muted-foreground/50">Never</span>}
                  </span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0 w-24 justify-end">
                    <button onClick={() => setHistoryContact(contact)} title="View message history"
                      className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10" data-testid={`history-contact-${contact.id}`}>
                      <History className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toggleOptOut.mutate({ id: contact.id, optedOut: !contact.optedOut })}
                      title={contact.optedOut ? "Re-subscribe (opt back in)" : "Opt out of messages"}
                      className={`w-7 h-7 flex items-center justify-center rounded ${contact.optedOut ? "text-red-500 hover:text-primary hover:bg-primary/10" : "text-muted-foreground hover:text-red-500 hover:bg-red-50"}`}
                      data-testid={`opt-toggle-${contact.id}`}
                    >
                      {contact.optedOut ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => openEdit(contact)} className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted" data-testid={`edit-contact-${contact.id}`}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(contact.id)} className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10" data-testid={`delete-contact-${contact.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {total} contacts
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="page-prev"
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
                    data-testid={`page-${pg}`}
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
                data-testid="page-next"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

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

      <ContactFormDialog
        open={showContactForm}
        onClose={closeForm}
        editContact={editContact}
        groups={groups ?? []}
      />

      <ContactHistorySheet
        contact={historyContact}
        open={!!historyContact}
        onClose={() => setHistoryContact(null)}
      />
    </div>
  );
}
