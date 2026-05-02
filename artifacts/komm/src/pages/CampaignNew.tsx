import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, MessageSquare, Mail, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateCampaign, useUpdateCampaign, useSendCampaign,
  useGetCampaign,
  useListGroups, useListTemplates,
  getListCampaignsQueryKey, getGetDashboardStatsQueryKey, getGetDashboardActivityQueryKey,
  getGetCampaignQueryKey, getListGroupsQueryKey, getListTemplatesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const schema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  channel: z.enum(["sms", "whatsapp", "email"]),
  subject: z.string().optional(),
  body: z.string().min(1, "Message body is required"),
  templateId: z.number().nullable().optional(),
  groupIds: z.array(z.number()),
  scheduledAt: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function smsSegments(text: string) {
  if (text.length === 0) return { chars: 0, segments: 0 };
  const chars = text.length;
  const segments = chars <= 160 ? 1 : Math.ceil(chars / 153);
  return { chars, segments };
}

// Approximate cost in KES per message
const COST_PER_MSG: Record<string, number> = {
  sms: 1.2,      // Africa's Talking Kenya rate
  whatsapp: 0.5, // WhatsApp Cloud API approx.
  email: 0,
};

function estimateCost(channel: string, recipients: number, segments = 1) {
  const rate = COST_PER_MSG[channel] ?? 0;
  const total = rate * recipients * (channel === "sms" ? segments : 1);
  if (total === 0) return null;
  return `~KES ${total.toFixed(2)}`;
}

const SAMPLE_VARS: Record<string, string> = {
  name: "Jane Wambua",
  amount: "KES 5,000",
  date: new Date().toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }),
  balance: "KES 12,400",
  due: new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-KE", { day: "numeric", month: "long" }),
  org_name: "Your Organisation",
};

function applyVars(text: string) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => SAMPLE_VARS[key] ?? `{{${key}}}`);
}

function MessagePreview({ channel, body, subject }: { channel: string; body: string; subject?: string }) {
  const preview = applyVars(body);
  if (channel === "email") {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1.5">Preview (sample values)</p>
        <div className="bg-white border rounded overflow-hidden text-sm text-foreground">
          {subject && (
            <div className="border-b px-3 py-2 bg-muted/40">
              <span className="text-muted-foreground text-xs mr-2">Subject:</span>
              <span className="font-medium">{applyVars(subject)}</span>
            </div>
          )}
          <div className="p-3 whitespace-pre-wrap leading-relaxed">{preview}</div>
        </div>
      </div>
    );
  }
  const isWhatsApp = channel === "whatsapp";
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs font-medium text-foreground mb-2">Preview (sample values)</p>
      <div className="flex justify-end">
        <div className={`max-w-xs rounded-2xl rounded-tr-sm px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed shadow-sm ${isWhatsApp ? "bg-[#dcf8c6] text-gray-900" : "bg-primary text-primary-foreground"}`}>
          {preview}
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className={`text-[10px] ${isWhatsApp ? "text-gray-500" : "text-primary-foreground/60"}`}>
              {new Date().toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
            </span>
            {isWhatsApp && <span className="text-[10px] text-blue-500">✓✓</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

const CHANNELS = [
  { value: "sms", label: "SMS", icon: MessageSquare, desc: "Via Africa's Talking — best Kenyan delivery" },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare, desc: "Pre-approved templates — Cloud API" },
  { value: "email", label: "Email", icon: Mail, desc: "Send to email addresses in your contacts" },
];

export default function CampaignNew() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const editId = params.get("edit") ? parseInt(params.get("edit")!) : null;
  const fromTemplateId = params.get("templateId") ? parseInt(params.get("templateId")!) : null;
  const fromChannel = (params.get("channel") ?? "") as "sms" | "whatsapp" | "email" | "";
  const fromGroupId = params.get("groupId") ? parseInt(params.get("groupId")!) : null;

  const qc = useQueryClient();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const sendCampaign = useSendCampaign();

  const { data: existingCampaign, isLoading: loadingEdit } = useGetCampaign(
    editId ?? 0,
    { query: { queryKey: getGetCampaignQueryKey(editId ?? 0), enabled: !!editId } }
  );

  const { data: groups } = useListGroups({ query: { queryKey: getListGroupsQueryKey() } });
  const { data: templates } = useListTemplates({}, { query: { queryKey: getListTemplatesQueryKey() } });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      channel: fromChannel || "sms",
      subject: "",
      body: "",
      templateId: null,
      groupIds: [],
      scheduledAt: "",
    },
  });

  // Pre-select template from URL param (e.g. ?templateId=3&channel=sms)
  useEffect(() => {
    if (!fromTemplateId || !templates) return;
    const tmpl = templates.find((t) => t.id === fromTemplateId);
    if (tmpl) {
      form.setValue("templateId", tmpl.id);
      form.setValue("body", tmpl.body);
      if (fromChannel) form.setValue("channel", fromChannel);
    }
  }, [fromTemplateId, templates]);

  // Pre-select group from URL param (e.g. ?groupId=4 from "Message Group" button)
  useEffect(() => {
    if (!fromGroupId || !groups) return;
    const g = groups.find((gr) => gr.id === fromGroupId);
    if (g) form.setValue("groupIds", [fromGroupId]);
  }, [fromGroupId, groups]);

  // Pre-fill form when editing an existing campaign
  useEffect(() => {
    if (existingCampaign && editId) {
      form.reset({
        name: existingCampaign.name,
        channel: existingCampaign.channel as "sms" | "whatsapp" | "email",
        subject: existingCampaign.subject ?? "",
        body: existingCampaign.body ?? "",
        templateId: existingCampaign.templateId ?? null,
        groupIds: existingCampaign.groupIds ?? [],
        scheduledAt: existingCampaign.scheduledAt
          ? format(new Date(existingCampaign.scheduledAt), "yyyy-MM-dd'T'HH:mm")
          : "",
      });
    }
  }, [existingCampaign, editId]);

  const channel = form.watch("channel");
  const body = form.watch("body");
  const selectedGroupIds = form.watch("groupIds");
  const { chars, segments } = smsSegments(body);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertVar = (variable: string) => {
    const el = textareaRef.current;
    const tag = `{{${variable}}}`;
    if (!el) {
      form.setValue("body", body + tag);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const newVal = body.slice(0, start) + tag + body.slice(end);
    form.setValue("body", newVal, { shouldDirty: true });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  const handleTemplateSelect = (templateId: string) => {
    if (templateId === "none") { form.setValue("templateId", null); return; }
    const tid = parseInt(templateId);
    const tmpl = templates?.find((t) => t.id === tid);
    if (tmpl) { form.setValue("templateId", tid); form.setValue("body", tmpl.body); }
  };

  const toggleGroup = (gid: number) => {
    const current = form.getValues("groupIds");
    form.setValue("groupIds", current.includes(gid) ? current.filter((id) => id !== gid) : [...current, gid]);
  };

  const invalidateAll = (campaignId: number) => {
    qc.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() });
    qc.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaignId) });
  };

  const doSend = (campaignId: number, onDone: () => void) => {
    sendCampaign.mutate(
      { id: campaignId },
      {
        onSuccess: () => {
          invalidateAll(campaignId);
          toast({ title: "Campaign sent!" });
          onDone();
        },
        onError: () => {
          invalidateAll(campaignId);
          toast({ title: "Campaign saved but send failed", variant: "destructive" });
          onDone();
        },
      }
    );
  };

  const onSubmit = (values: FormValues, sendNow = false) => {
    if (submitting) return;
    setSubmitting(true);

    const payload = {
      name: values.name,
      channel: values.channel,
      body: values.body,
      subject: values.channel === "email" && values.subject ? values.subject : null,
      templateId: values.templateId ?? null,
      groupIds: values.groupIds,
      scheduledAt: values.scheduledAt ? new Date(values.scheduledAt).toISOString() : null,
    };

    if (editId) {
      updateCampaign.mutate(
        { id: editId, data: payload },
        {
          onSuccess: (campaign) => {
            if (sendNow) {
              doSend(campaign.id, () => { setSubmitting(false); setLocation(`/campaigns/${campaign.id}`); });
            } else {
              invalidateAll(campaign.id);
              toast({ title: "Campaign updated" });
              setSubmitting(false);
              setLocation(`/campaigns/${campaign.id}`);
            }
          },
          onError: () => { toast({ title: "Failed to update campaign", variant: "destructive" }); setSubmitting(false); },
        }
      );
    } else {
      createCampaign.mutate(
        { data: payload },
        {
          onSuccess: (campaign) => {
            if (sendNow) {
              doSend(campaign.id, () => { setSubmitting(false); setLocation(`/campaigns/${campaign.id}`); });
            } else {
              invalidateAll(campaign.id);
              toast({ title: "Draft saved" });
              setSubmitting(false);
              setLocation(`/campaigns/${campaign.id}`);
            }
          },
          onError: () => { toast({ title: "Failed to create campaign", variant: "destructive" }); setSubmitting(false); },
        }
      );
    }
  };

  if (editId && loadingEdit) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation(editId ? `/campaigns/${editId}` : "/campaigns")} className="w-8 h-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{editId ? "Edit Campaign" : "New Campaign"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {editId ? "Update this campaign's details" : "Compose and send a message to your members"}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => onSubmit(v, false))} className="space-y-5">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>Campaign Name</FormLabel>
              <FormControl><Input placeholder="e.g. June Contribution Reminder" data-testid="input-campaign-name" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <div>
            <Label className="text-sm font-medium">Channel</Label>
            <div className="grid grid-cols-3 gap-3 mt-2">
              {CHANNELS.map((ch) => (
                <button key={ch.value} type="button" data-testid={`channel-${ch.value}`}
                  onClick={() => form.setValue("channel", ch.value as "sms" | "whatsapp" | "email")}
                  className={`p-3 rounded-lg border text-left transition-colors ${channel === ch.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-muted-foreground/30"}`}
                >
                  <p className="text-sm font-semibold">{ch.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{ch.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {channel === "email" && (
            <FormField control={form.control} name="subject" render={({ field }) => (
              <FormItem>
                <FormLabel>Email Subject <span className="text-muted-foreground font-normal">(required for email)</span></FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. June Contribution Reminder — Umoja SACCO"
                    data-testid="input-email-subject"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          )}

          <div>
            <Label className="text-sm font-medium">Template (optional)</Label>
            <Select onValueChange={handleTemplateSelect} defaultValue="none">
              <SelectTrigger className="mt-1.5" data-testid="select-template">
                <SelectValue placeholder="Select a template..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template</SelectItem>
                {(templates ?? []).filter((t) => t.channel === channel).map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    <span className="font-medium">{t.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs capitalize">({t.category})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <FormField control={form.control} name="body" render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Message</FormLabel>
                {channel === "sms" && body.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {chars} chars · {segments} SMS segment{segments !== 1 ? "s" : ""}
                  </span>
                )}
                {channel === "whatsapp" && body.length > 0 && (
                  <span className={`text-xs ${chars > 4096 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {chars.toLocaleString()} / 4,096 chars
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {["name", "amount", "date", "balance", "due", "org_name"].map((v) => (
                  <button key={v} type="button" onClick={() => insertVar(v)}
                    className="px-2 py-0.5 rounded border border-dashed border-primary/40 text-xs text-primary/80 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors font-mono">
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
              <FormControl>
                <Textarea
                  placeholder="Type your message... Click a tag above to insert personalisation."
                  rows={5}
                  data-testid="input-message-body"
                  {...field}
                  ref={(el) => {
                    (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
                    if (typeof field.ref === "function") field.ref(el);
                  }}
                />
              </FormControl>
              <FormMessage />
              {channel === "sms" && chars > 160 && (
                <p className="text-xs text-amber-600">Messages over 160 characters count as multiple SMS and cost more.</p>
              )}
            </FormItem>
          )} />

          {body.length > 0 && (
            <MessagePreview channel={channel} body={body} subject={form.watch("subject")} />
          )}

          <div>
            <Label className="text-sm font-medium">Send To (Groups)</Label>
            <p className="text-xs text-muted-foreground mb-2 mt-0.5">Select one or more contact groups</p>
            {!groups ? (
              <Skeleton className="h-10 w-full" />
            ) : groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No groups yet. Create groups in the Groups section.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => (
                    <button key={g.id} type="button" data-testid={`group-toggle-${g.id}`} onClick={() => toggleGroup(g.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors ${selectedGroupIds.includes(g.id) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-muted-foreground/40"}`}
                    >
                      {g.name}
                      <span className={`text-xs ${selectedGroupIds.includes(g.id) ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{g.contactCount}</span>
                    </button>
                  ))}
                </div>
                {selectedGroupIds.length > 0 && (() => {
                  const approxTotal = groups.filter((g) => selectedGroupIds.includes(g.id)).reduce((sum, g) => sum + g.contactCount, 0);
                  const costLabel = estimateCost(channel, approxTotal, segments);
                  return (
                    <div className="mt-2 flex items-center gap-3 flex-wrap">
                      <p className="text-xs text-muted-foreground">
                        ~{approxTotal.toLocaleString()} recipient{approxTotal !== 1 ? "s" : ""} across {selectedGroupIds.length} group{selectedGroupIds.length !== 1 ? "s" : ""}
                        {selectedGroupIds.length > 1 ? " (unique at send time)" : ""}
                      </p>
                      {costLabel && (
                        <span className="text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                          Est. cost: {costLabel}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          <FormField control={form.control} name="scheduledAt" render={({ field }) => (
            <FormItem>
              <FormLabel>Schedule (optional)</FormLabel>
              <FormControl><Input type="datetime-local" data-testid="input-scheduled-at" {...field} /></FormControl>
              <p className="text-xs text-muted-foreground">
                Leave blank to save as draft or send immediately. Times are in <span className="font-medium">East Africa Time (EAT, UTC+3)</span>.
              </p>
            </FormItem>
          )} />

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="outline" disabled={submitting} data-testid="button-save-draft">
              {editId ? "Save Changes" : "Save as Draft"}
            </Button>
            <Button type="button" disabled={submitting} data-testid="button-send-now"
              onClick={form.handleSubmit((v) => onSubmit(v, true))} className="gap-2"
            >
              <Send className="w-4 h-4" />
              {submitting ? "Sending…" : "Send Now"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
