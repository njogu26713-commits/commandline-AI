import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users, Plus, Trash2, ToggleLeft, ToggleRight, TrendingUp,
  Bitcoin, DollarSign, CheckCircle2, XCircle, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageTransition } from "@/components/page-transition";
import { useQuery, useMutation } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Subscriber {
  id: number;
  phone: string;
  name: string;
  plan: string;
  status: string;
  signalType: string;
  joinedAt: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────
const SUBS_KEY = ["subscribers"];

function useSubscribers() {
  return useQuery<Subscriber[]>({
    queryKey: SUBS_KEY,
    queryFn: async () => {
      const r = await fetch("/api/trading/subscribers");
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });
}

function useAddSubscriber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; phone: string; plan: string; signalType: string }) => {
      const r = await fetch("/api/trading/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SUBS_KEY }),
  });
}

function useUpdateSubscriber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; status?: string; signalType?: string; plan?: string }) => {
      const r = await fetch(`/api/trading/subscribers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SUBS_KEY }),
  });
}

function useDeleteSubscriber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/trading/subscribers/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SUBS_KEY }),
  });
}

// ── Signal type badge ─────────────────────────────────────────────────────────
function SignalTypeBadge({ type }: { type: string }) {
  if (type === "crypto")
    return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/30 gap-1"><Bitcoin className="w-3 h-3" />Crypto</Badge>;
  if (type === "forex")
    return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/30 gap-1"><DollarSign className="w-3 h-3" />Forex</Badge>;
  return <Badge className="bg-indigo-500/10 text-indigo-500 border-indigo-500/30 gap-1"><TrendingUp className="w-3 h-3" />Both</Badge>;
}

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, string> = {
    basic:   "bg-muted text-muted-foreground",
    premium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
    vip:     "bg-purple-500/10 text-purple-500 border-purple-500/30",
  };
  return <Badge className={`capitalize ${map[plan] ?? map.basic}`}>{plan}</Badge>;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Deployments() {
  const { data: subscribers, isLoading } = useSubscribers();
  const addSub    = useAddSubscriber();
  const updateSub = useUpdateSubscriber();
  const deleteSub = useDeleteSubscriber();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", plan: "basic", signalType: "both" });

  const handleAdd = async () => {
    if (!form.name || !form.phone) return;
    try {
      await addSub.mutateAsync(form);
      setIsOpen(false);
      setForm({ name: "", phone: "", plan: "basic", signalType: "both" });
      toast({ title: "✅ Subscriber added", description: `${form.name} will receive ${form.signalType === "both" ? "Crypto + Forex" : form.signalType} signals.` });
    } catch (err: any) {
      toast({ title: "Failed to add subscriber", description: err.message, variant: "destructive" });
    }
  };

  const handleToggleStatus = async (sub: Subscriber) => {
    const next = sub.status === "active" ? "inactive" : "active";
    await updateSub.mutateAsync({ id: sub.id, status: next });
    toast({ title: next === "active" ? "✅ Subscriber activated" : "⏸ Subscriber paused", description: sub.name });
  };

  const handleDelete = async (sub: Subscriber) => {
    await deleteSub.mutateAsync(sub.id);
    toast({ title: "🗑 Subscriber removed", description: sub.name });
  };

  const active   = subscribers?.filter(s => s.status === "active") ?? [];
  const crypto   = active.filter(s => s.signalType === "crypto" || s.signalType === "both");
  const forex    = active.filter(s => s.signalType === "forex"  || s.signalType === "both");

  return (
    <PageTransition className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bot Deployments</h1>
          <p className="text-muted-foreground">Manage subscribers — each user picks their signal path (Crypto, Forex, or Both).</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="w-4 h-4" /> Add Subscriber
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Subscriber</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  placeholder="e.g. John Doe"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp Number</Label>
                <Input
                  placeholder="+1234567890 (with country code)"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Include country code without spaces, e.g. +447911123456</p>
              </div>
              <div className="space-y-2">
                <Label>Signal Path</Label>
                <Select value={form.signalType} onValueChange={v => setForm({ ...form, signalType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">
                      <span className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-indigo-500" /> Both (Crypto + Forex)</span>
                    </SelectItem>
                    <SelectItem value="crypto">
                      <span className="flex items-center gap-2"><Bitcoin className="w-4 h-4 text-orange-500" /> Crypto Only</span>
                    </SelectItem>
                    <SelectItem value="forex">
                      <span className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-blue-500" /> Forex Only</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={form.plan} onValueChange={v => setForm({ ...form, plan: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button
                onClick={handleAdd}
                disabled={addSub.isPending || !form.name || !form.phone}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {addSub.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding…</> : "Add Subscriber"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subscribers</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{active.length}</div>
            <p className="text-xs text-muted-foreground">Receiving WhatsApp signals</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Crypto Subscribers</CardTitle>
            <Bitcoin className="w-4 h-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{crypto.length}</div>
            <p className="text-xs text-muted-foreground">Receive crypto signals</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Forex Subscribers</CardTitle>
            <DollarSign className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{forex.length}</div>
            <p className="text-xs text-muted-foreground">Receive forex signals</p>
          </CardContent>
        </Card>
      </div>

      {/* Subscriber Table */}
      <div className="border rounded-xl bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subscriber</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Signal Path</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <TableRow key={i}>
                  {Array(7).fill(0).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !subscribers?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="w-8 h-8 opacity-30" />
                    <p>No subscribers yet. Add your first subscriber above.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              subscribers.map((sub) => (
                <TableRow key={sub.id} className={sub.status !== "active" ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{sub.name}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{sub.phone}</TableCell>
                  <TableCell><SignalTypeBadge type={sub.signalType} /></TableCell>
                  <TableCell><PlanBadge plan={sub.plan} /></TableCell>
                  <TableCell>
                    {sub.status === "active"
                      ? <span className="flex items-center gap-1 text-green-500 text-sm"><CheckCircle2 className="w-4 h-4" /> Active</span>
                      : <span className="flex items-center gap-1 text-muted-foreground text-sm"><XCircle className="w-4 h-4" /> Paused</span>
                    }
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(sub.joinedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        title={sub.status === "active" ? "Pause subscriber" : "Activate subscriber"}
                        onClick={() => handleToggleStatus(sub)}
                        disabled={updateSub.isPending}
                      >
                        {sub.status === "active"
                          ? <ToggleRight className="w-4 h-4 text-green-500" />
                          : <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                        }
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Remove subscriber"
                        onClick={() => handleDelete(sub)}
                        disabled={deleteSub.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Info box */}
      <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">How signal paths work</p>
        <p>• <strong>Crypto</strong> — receives signals for BTC, ETH, SOL, BNB, XRP, DOGE, etc.</p>
        <p>• <strong>Forex</strong> — receives signals for EUR/USD, GBP/USD, XAU/USD, USD/JPY, etc.</p>
        <p>• <strong>Both</strong> — receives all signals regardless of market type.</p>
        <p className="pt-1">When you broadcast a signal from the Trading page, only subscribers who opted into that market will receive it.</p>
      </div>
    </PageTransition>
  );
}
