import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  useCreateContact, useUpdateContact,
  getListContactsQueryKey, getListGroupsQueryKey, getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import type { Contact } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(9, "Valid phone number required"),
  email: z.string().email().optional().or(z.literal("")),
  channel: z.enum(["sms", "whatsapp", "email"]),
  groupIds: z.array(z.number()),
});
export type ContactFormValues = z.infer<typeof contactSchema>;

export function ContactFormDialog({
  open, onClose, editContact, groups,
}: {
  open: boolean;
  onClose: () => void;
  editContact: Contact | null;
  groups: { id: number; name: string; contactCount: number }[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const isEdit = !!editContact;

  const [cfPairs, setCfPairs] = useState<{ key: string; value: string }[]>([]);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: "", phone: "", email: "", channel: "sms", groupIds: [] },
  });

  const pairsFromContact = (c: Contact | null) =>
    Object.entries((c?.customFields as Record<string, string> | null | undefined) ?? {}).map(([key, value]) => ({ key, value }));

  useState(() => {
    if (editContact) {
      form.reset({ name: editContact.name, phone: editContact.phone, email: editContact.email ?? "", channel: editContact.channel as "sms" | "whatsapp" | "email", groupIds: editContact.groupIds ?? [] });
      setCfPairs(pairsFromContact(editContact));
    } else {
      form.reset({ name: "", phone: "", email: "", channel: "sms", groupIds: [] });
      setCfPairs([]);
    }
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      if (editContact) {
        form.reset({ name: editContact.name, phone: editContact.phone, email: editContact.email ?? "", channel: editContact.channel as "sms" | "whatsapp" | "email", groupIds: editContact.groupIds ?? [] });
        setCfPairs(pairsFromContact(editContact));
      } else {
        form.reset({ name: "", phone: "", email: "", channel: "sms", groupIds: [] });
        setCfPairs([]);
      }
    } else {
      onClose();
    }
  };

  const selectedGroupIds = form.watch("groupIds");
  const toggleGroup = (gid: number) => {
    const current = form.getValues("groupIds");
    form.setValue("groupIds", current.includes(gid) ? current.filter((id) => id !== gid) : [...current, gid]);
  };

  const onSubmit = (values: ContactFormValues) => {
    const customFields = cfPairs.reduce<Record<string, string>>((acc, { key, value }) => {
      if (key.trim()) acc[key.trim()] = value;
      return acc;
    }, {});
    const cfPayload = Object.keys(customFields).length > 0 ? customFields : null;

    if (isEdit && editContact) {
      updateContact.mutate(
        { id: editContact.id, data: { name: values.name, phone: values.phone, email: values.email || null, channel: values.channel, groupIds: values.groupIds, customFields: cfPayload } },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
            qc.invalidateQueries({ queryKey: getListGroupsQueryKey() });
            toast({ title: "Contact updated" });
            onClose();
          },
          onError: () => toast({ title: "Failed to update contact", variant: "destructive" }),
        }
      );
    } else {
      createContact.mutate(
        { data: { name: values.name, phone: values.phone, email: values.email || null, channel: values.channel, groupIds: values.groupIds, customFields: cfPayload } },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
            qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
            qc.invalidateQueries({ queryKey: getListGroupsQueryKey() });
            toast({ title: "Contact added" });
            onClose();
            form.reset();
            setCfPairs([]);
          },
          onError: () => toast({ title: "Failed to add contact", variant: "destructive" }),
        }
      );
    }
  };

  const isPending = createContact.isPending || updateContact.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Edit Contact" : "Add Contact"}</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input placeholder="Jane Wambua" data-testid="input-contact-name" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input placeholder="+254712345678" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem><FormLabel>Email (optional)</FormLabel><FormControl><Input placeholder="jane@example.com" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="channel" render={({ field }) => (
              <FormItem><FormLabel>Preferred Channel</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {groups.length > 0 && (
              <div>
                <label className="text-sm font-medium block mb-2">Groups</label>
                <div className="flex flex-wrap gap-1.5">
                  {groups.map((g) => (
                    <button key={g.id} type="button" onClick={() => toggleGroup(g.id)}
                      className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${selectedGroupIds.includes(g.id) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-muted-foreground/40"}`}>
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Member Data / Custom Fields ─────────────────────────── */}
            <div className="border border-border rounded-lg p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Member Data</label>
                <span className="text-[11px] text-muted-foreground">{"Powers {{name}}, {{amount}}, {{balance}} in messages"}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["amount", "balance", "member_no", "due"].map((k) => {
                  const exists = cfPairs.some((p) => p.key === k);
                  return !exists ? (
                    <button key={k} type="button"
                      className="px-2 py-0.5 text-[11px] border border-dashed border-primary/40 text-primary/80 rounded font-mono hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                      onClick={() => setCfPairs((prev) => [...prev, { key: k, value: "" }])}>
                      + {`{{${k}}}`}
                    </button>
                  ) : null;
                })}
                <button type="button"
                  className="px-2 py-0.5 text-[11px] border border-dashed border-border rounded text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground transition-colors"
                  onClick={() => setCfPairs((prev) => [...prev, { key: "", value: "" }])}>
                  + custom field
                </button>
              </div>
              {cfPairs.length > 0 && (
                <div className="space-y-1.5">
                  {cfPairs.map((pair, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <Input
                        placeholder="field"
                        value={pair.key}
                        onChange={(e) => setCfPairs((prev) => prev.map((p, j) => j === i ? { ...p, key: e.target.value } : p))}
                        className="h-7 text-xs font-mono w-28 shrink-0"
                      />
                      <Input
                        placeholder="value"
                        value={pair.value}
                        onChange={(e) => setCfPairs((prev) => prev.map((p, j) => j === i ? { ...p, value: e.target.value } : p))}
                        className="h-7 text-xs flex-1"
                      />
                      <button type="button"
                        onClick={() => setCfPairs((prev) => prev.filter((_, j) => j !== i))}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1 shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isPending} data-testid="button-save-contact">
                {isPending ? (isEdit ? "Saving…" : "Adding…") : (isEdit ? "Save Changes" : "Add Contact")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
