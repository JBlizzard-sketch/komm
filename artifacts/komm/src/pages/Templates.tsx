import { useState } from "react";
import { Plus, FileText, Trash2, Edit2, Tag, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  useListTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  getListTemplatesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Template } from "@workspace/api-client-react";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  body: z.string().min(1, "Body is required"),
  channel: z.enum(["sms", "whatsapp", "email"]),
  category: z.enum(["sacco", "church", "general"]),
});

type FormValues = z.infer<typeof schema>;

const CHANNEL_COLORS: Record<string, string> = {
  sms: "bg-primary/10 text-primary",
  whatsapp: "bg-emerald-100 text-emerald-800",
  email: "bg-amber-100 text-amber-800",
};

const CATEGORY_COLORS: Record<string, string> = {
  sacco: "bg-blue-100 text-blue-800",
  church: "bg-purple-100 text-purple-800",
  general: "bg-muted text-muted-foreground",
};

function highlightVariables(text: string) {
  const parts = text.split(/({{[^}]+}})/g);
  return parts.map((part, i) =>
    part.startsWith("{{") ? (
      <span key={i} className="bg-amber-100 text-amber-800 rounded px-0.5 font-mono text-xs">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function Templates() {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: templates, isLoading } = useListTemplates(
    {
      category: categoryFilter !== "all" ? (categoryFilter as "sacco" | "church" | "general") : undefined,
      channel: channelFilter !== "all" ? (channelFilter as "sms" | "whatsapp" | "email") : undefined,
    },
    {
      query: {
        queryKey: getListTemplatesQueryKey({
          category: categoryFilter !== "all" ? (categoryFilter as "sacco" | "church" | "general") : undefined,
          channel: channelFilter !== "all" ? (channelFilter as "sms" | "whatsapp" | "email") : undefined,
        }),
      },
    }
  );

  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", body: "", channel: "sms", category: "general" },
  });

  const openCreate = () => {
    form.reset({ name: "", body: "", channel: "sms", category: "general" });
    setEditTemplate(null);
    setShowCreate(true);
  };

  const openEdit = (t: Template) => {
    form.reset({ name: t.name, body: t.body, channel: t.channel as "sms"|"whatsapp"|"email", category: t.category as "sacco"|"church"|"general" });
    setEditTemplate(t);
    setShowCreate(true);
  };

  const onSubmit = (values: FormValues) => {
    const vars = [...values.body.matchAll(/{{([^}]+)}}/g)].map((m) => m[1]);
    if (editTemplate) {
      updateTemplate.mutate(
        { id: editTemplate.id, data: { ...values, variables: vars } },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
            toast({ title: "Template updated" });
            setShowCreate(false);
          },
        }
      );
    } else {
      createTemplate.mutate(
        { data: { ...values, variables: vars } },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
            toast({ title: "Template created" });
            setShowCreate(false);
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    deleteTemplate.mutate(
      { id },
      { onSuccess: () => { qc.invalidateQueries({ queryKey: getListTemplatesQueryKey() }); toast({ title: "Template deleted" }); } }
    );
  };

  const useInCampaign = (t: Template) => {
    navigate(`/campaigns/new?channel=${t.channel}&templateId=${t.id}`);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Templates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Reusable message templates with variable placeholders</p>
        </div>
        <Button size="sm" className="gap-2" onClick={openCreate} data-testid="button-create-template">
          <Plus className="w-4 h-4" />
          New Template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="filter-category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="sacco">SACCO</SelectItem>
            <SelectItem value="church">Church</SelectItem>
            <SelectItem value="general">General</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="filter-channel">
            <SelectValue placeholder="All channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="email">Email</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : !templates || templates.length === 0 ? (
        <div className="text-center py-20">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No templates yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Create reusable templates for SACCO contributions, church announcements, meeting notices, and more.
          </p>
          <Button size="sm" className="mt-4 gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Create Template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <Card key={t.id} data-testid={`template-card-${t.id}`} className="group hover:shadow-sm transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{t.name}</p>
                    <div className="flex gap-1.5 mt-1.5">
                      <Badge variant="outline" className={`text-[11px] capitalize ${CHANNEL_COLORS[t.channel] ?? ""}`}>
                        {t.channel}
                      </Badge>
                      <Badge variant="outline" className={`text-[11px] capitalize ${CATEGORY_COLORS[t.category] ?? ""}`}>
                        {t.category}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => useInCampaign(t)}
                      title="Use in campaign"
                      data-testid={`use-template-${t.id}`}
                      className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => openEdit(t)} data-testid={`edit-template-${t.id}`}
                      className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(t.id)} data-testid={`delete-template-${t.id}`}
                      className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-sm text-foreground leading-relaxed line-clamp-3">
                  {highlightVariables(t.body)}
                </p>

                {t.variables && t.variables.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                    <Tag className="w-3 h-3 text-muted-foreground" />
                    {t.variables.map((v) => (
                      <Badge key={v} variant="outline" className="text-[10px] font-mono bg-amber-50 text-amber-700">
                        {`{{${v}}}`}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-border flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => useInCampaign(t)}
                    data-testid={`use-template-btn-${t.id}`}
                  >
                    <Send className="w-3 h-3" />
                    Use in Campaign
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTemplate ? "Edit Template" : "New Template"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Template Name</FormLabel>
                  <FormControl><Input placeholder="e.g. Monthly Contribution Reminder" data-testid="input-template-name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="channel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Channel</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger data-testid="select-template-channel"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger data-testid="select-template-category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sacco">SACCO</SelectItem>
                        <SelectItem value="church">Church</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="body" render={({ field }) => (
                <FormItem>
                  <FormLabel>Message Body</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Dear {{name}}, your contribution of Ksh {{amount}} is due on {{date}}. Please ensure timely payment."
                      rows={5}
                      data-testid="input-template-body"
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Use &#123;&#123;variable&#125;&#125; for personalisation placeholders.</p>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" disabled={createTemplate.isPending || updateTemplate.isPending} data-testid="button-save-template">
                  {editTemplate ? "Save Changes" : "Create Template"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
