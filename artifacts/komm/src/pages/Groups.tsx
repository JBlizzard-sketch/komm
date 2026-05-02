import { useState } from "react";
import { Plus, FolderOpen, Trash2, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListGroups,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  getListGroupsQueryKey,
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

export default function Groups() {
  const [showCreate, setShowCreate] = useState(false);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
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

  const openCreate = () => {
    form.reset({ name: "", description: "" });
    setEditGroup(null);
    setShowCreate(true);
  };

  const openEdit = (g: Group) => {
    form.reset({ name: g.name, description: g.description ?? "" });
    setEditGroup(g);
    setShowCreate(true);
  };

  const onSubmit = (values: FormValues) => {
    if (editGroup) {
      updateGroup.mutate(
        { id: editGroup.id, data: { name: values.name, description: values.description || null } },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListGroupsQueryKey() });
            toast({ title: "Group updated" });
            setShowCreate(false);
          },
        }
      );
    } else {
      createGroup.mutate(
        { data: { name: values.name, description: values.description || null } },
        {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: getListGroupsQueryKey() });
            toast({ title: "Group created" });
            setShowCreate(false);
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    deleteGroup.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListGroupsQueryKey() });
          toast({ title: "Group deleted" });
        },
      }
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Groups</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Organise your contacts into groups for targeted messaging</p>
        </div>
        <Button size="sm" className="gap-2" onClick={openCreate} data-testid="button-create-group">
          <Plus className="w-4 h-4" />
          New Group
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
          <Button size="sm" className="mt-4 gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Create Group
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((g) => (
            <Card key={g.id} data-testid={`group-card-${g.id}`} className="group hover:shadow-sm transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{g.name}</p>
                    {g.description && (
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">{g.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-3">
                      <span className="text-2xl font-bold text-primary">{g.contactCount}</span>
                      <span className="text-xs text-muted-foreground">members</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Created {format(new Date(g.createdAt), "d MMM yyyy")}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editGroup ? "Edit Group" : "Create Group"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Nairobi Branch Members" data-testid="input-group-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="What is this group for?" rows={2} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button
                  type="submit"
                  disabled={createGroup.isPending || updateGroup.isPending}
                  data-testid="button-save-group"
                >
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
