import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, Plus, Pencil, Trash2, Star, TrendingUp, Shield, Zap } from "lucide-react";
import { PageTransition } from "@/components/page-transition";

interface Broker {
  id: number;
  name: string;
  description: string;
  logo: string;
  category: string;
  referralLink: string;
  commission: string;
  features: string[];
  isActive: string;
  createdAt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  crypto: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
  forex:  "bg-blue-500/10 text-blue-500 border-blue-500/30",
  both:   "bg-green-500/10 text-green-500 border-green-500/30",
};

const CATEGORY_LABELS: Record<string, string> = {
  crypto: "Crypto",
  forex:  "Forex & CFD",
  both:   "Crypto & Forex",
};

const FEATURE_ICONS = [Star, TrendingUp, Shield, Zap];

function useBrokers() {
  return useQuery<Broker[]>({
    queryKey: ["brokers"],
    queryFn: () => fetch("/api/brokers/all").then(r => r.json()),
  });
}

const EMPTY_FORM = { name: "", description: "", logo: "🏦", category: "both", referralLink: "", commission: "", features: "" };

export default function Brokers() {
  const { data: brokers = [], isLoading } = useBrokers();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "crypto" | "forex" | "both">("all");
  const [editBroker, setEditBroker] = useState<Broker | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [dialogOpen, setDialogOpen] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const payload = { ...data, features: data.features.split("\n").map(f => f.trim()).filter(Boolean) };
      if (editBroker) {
        return fetch(`/api/brokers/${editBroker.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(r => r.json());
      }
      return fetch("/api/brokers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(r => r.json());
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["brokers"] }); setDialogOpen(false); setEditBroker(null); setForm(EMPTY_FORM); toast({ title: editBroker ? "Broker updated" : "Broker added" }); },
    onError: () => toast({ title: "Failed to save broker", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/brokers/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["brokers"] }); toast({ title: "Broker removed" }); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: string }) =>
      fetch(`/api/brokers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brokers"] }),
  });

  const openEdit = (b: Broker) => {
    setEditBroker(b);
    setForm({ name: b.name, description: b.description, logo: b.logo, category: b.category, referralLink: b.referralLink, commission: b.commission, features: b.features.join("\n") });
    setDialogOpen(true);
  };

  const openAdd = () => { setEditBroker(null); setForm(EMPTY_FORM); setDialogOpen(true); };

  const visible = brokers.filter(b => filter === "all" || b.category === filter);
  const active = brokers.filter(b => b.isActive === "true");

  return (
    <PageTransition className="space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Recommended Brokers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Earn commissions by referring your subscribers to trusted brokers</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAdd} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white self-start sm:self-auto">
              <Plus className="w-4 h-4" /> Add Broker
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editBroker ? "Edit Broker" : "Add Broker"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Logo (emoji)</Label>
                  <Input value={form.logo} onChange={e => setForm(f => ({ ...f, logo: e.target.value }))} placeholder="🏦" className="text-xl text-center" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                    <option value="both">Crypto & Forex</option>
                    <option value="crypto">Crypto only</option>
                    <option value="forex">Forex / CFD only</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Broker name</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Binance, Exness…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description of the broker…" rows={2} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Your referral link</Label>
                <Input value={form.referralLink} onChange={e => setForm(f => ({ ...f, referralLink: e.target.value }))} placeholder="https://broker.com/register?ref=…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Commission / incentive</Label>
                <Input value={form.commission} onChange={e => setForm(f => ({ ...f, commission: e.target.value }))} placeholder="e.g. Up to $200 per client" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Key features (one per line)</Label>
                <Textarea value={form.features} onChange={e => setForm(f => ({ ...f, features: e.target.value }))} placeholder={"Low spreads\nMT4 & MT5\n24/7 support"} rows={4} />
              </div>
              <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.name || !form.referralLink} className="w-full bg-green-600 hover:bg-green-700 text-white">
                {saveMutation.isPending ? "Saving…" : editBroker ? "Save changes" : "Add broker"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active Brokers", value: active.length, color: "text-green-500" },
          { label: "Crypto Brokers", value: brokers.filter(b => b.category === "crypto" || b.category === "both").length, color: "text-yellow-500" },
          { label: "Forex Brokers", value: brokers.filter(b => b.category === "forex" || b.category === "both").length, color: "text-blue-500" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {(["all", "crypto", "forex", "both"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium capitalize ${filter === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
            {f === "all" ? "All" : f === "both" ? "Crypto & Forex" : f === "crypto" ? "Crypto" : "Forex & CFD"}
          </button>
        ))}
      </div>

      {/* Broker grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1,2,3,4,5].map(i => <Card key={i} className="animate-pulse h-64" />)}
        </div>
      ) : visible.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground text-sm">No brokers yet. Click "Add Broker" to get started.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map(b => (
            <Card key={b.id} className={`relative group transition-all ${b.isActive !== "true" ? "opacity-50" : "hover:shadow-md hover:border-primary/30"}`}>
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center text-2xl flex-shrink-0">{b.logo}</div>
                    <div>
                      <CardTitle className="text-base">{b.name}</CardTitle>
                      <Badge variant="outline" className={`text-[10px] mt-0.5 ${CATEGORY_COLORS[b.category] ?? ""}`}>
                        {CATEGORY_LABELS[b.category] ?? b.category}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(b)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(b.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">{b.description}</p>

                {b.commission && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-green-500 bg-green-500/10 rounded-md px-2.5 py-1.5">
                    <Star className="w-3 h-3" /> {b.commission}
                  </div>
                )}

                {b.features.length > 0 && (
                  <ul className="space-y-1">
                    {b.features.slice(0, 4).map((feat, i) => {
                      const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length];
                      return (
                        <li key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Icon className="w-3 h-3 text-primary flex-shrink-0" />
                          {feat}
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs"
                    onClick={() => window.open(b.referralLink, "_blank")}>
                    <ExternalLink className="w-3 h-3" /> Open Account
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs"
                    onClick={() => toggleMutation.mutate({ id: b.id, isActive: b.isActive === "true" ? "false" : "true" })}>
                    {b.isActive === "true" ? "Hide" : "Show"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
