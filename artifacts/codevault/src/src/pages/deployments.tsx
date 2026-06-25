import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Plus, Trash2, ToggleLeft, ToggleRight, Bitcoin, DollarSign,
  TrendingUp, CheckCircle2, XCircle, Loader2, Smartphone, Crown,
  Star, Zap, CreditCard, ShieldCheck, AlertTriangle, HelpCircle, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageTransition } from "@/components/page-transition";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Subscriber {
  id: number; phone: string; name: string;
  plan: string; status: string; signalType: string; joinedAt: string;
}

// ── API ───────────────────────────────────────────────────────────────────────
const KEY = ["subscribers"];
function useSubs() {
  return useQuery<Subscriber[]>({
    queryKey: KEY,
    queryFn: () => fetch("/api/trading/subscribers").then(r => r.json()),
  });
}
function useAddSub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: any) => fetch("/api/trading/subscribers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
function useUpdateSub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }: any) => fetch(`/api/trading/subscribers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
function useDeleteSub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`/api/trading/subscribers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// ── Plan config ───────────────────────────────────────────────────────────────
const PLANS = {
  basic:   { label: "Basic",   price: "KES 500/mo",  icon: Star,  color: "text-slate-500",   bg: "bg-slate-500/10",   signals: "Crypto only, 5/day" },
  premium: { label: "Premium", price: "KES 1,000/mo", icon: Zap,   color: "text-yellow-500",  bg: "bg-yellow-500/10",  signals: "Crypto + Forex, 15/day" },
  vip:     { label: "VIP",     price: "KES 2,000/mo", icon: Crown, color: "text-purple-500",  bg: "bg-purple-500/10",  signals: "All markets, unlimited" },
};

function PlanBadge({ plan }: { plan: string }) {
  const p = PLANS[plan as keyof typeof PLANS] ?? PLANS.basic;
  return (
    <Badge className={`${p.bg} ${p.color} border-current/20 gap-1 capitalize`}>
      <p.icon className="w-3 h-3" />{p.label}
    </Badge>
  );
}

function SignalTypeBadge({ type }: { type: string }) {
  if (type === "crypto") return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 gap-1 text-[10px]"><Bitcoin className="w-2.5 h-2.5"/>Crypto</Badge>;
  if (type === "forex")  return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1 text-[10px]"><DollarSign className="w-2.5 h-2.5"/>Forex</Badge>;
  return <Badge className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 gap-1 text-[10px]"><TrendingUp className="w-2.5 h-2.5"/>Both</Badge>;
}

// ── M-Pesa Payment Dialog ──────────────────────────────────────────────────────
function MpesaDialog({ sub }: { sub: Subscriber }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState(sub.plan);
  const [phone, setPhone] = useState(sub.phone);
  const [pending, setPending] = useState(false);
  const [checkoutId, setCheckoutId] = useState("");
  const [paid, setPaid] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const initiate = async () => {
    setPending(true);
    try {
      const r = await fetch("/api/mpesa/stkpush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, plan, subscriberId: sub.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setCheckoutId(d.checkoutRequestId);
      toast({ title: "📲 STK Push sent", description: d.message });
    } catch (e: any) {
      toast({ title: "M-Pesa error", description: e.message, variant: "destructive" });
    } finally { setPending(false); }
  };

  const simulate = async () => {
    if (!checkoutId) return;
    setPending(true);
    try {
      const r = await fetch("/api/mpesa/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutRequestId: checkoutId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPaid(true);
      qc.invalidateQueries({ queryKey: KEY });
      toast({ title: "✅ Payment confirmed!", description: `${sub.name} upgraded to ${d.plan}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setPending(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="M-Pesa payment"><CreditCard className="w-4 h-4 text-green-600"/></Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-green-600 font-bold">M</span> M-Pesa Payment — {sub.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {paid ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 className="w-12 h-12 text-green-500"/>
              <p className="font-semibold text-green-600">Payment Confirmed!</p>
              <p className="text-sm text-muted-foreground">Subscriber upgraded to {plan} plan</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Select value={plan} onValueChange={setPlan}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLANS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        <span className="flex items-center gap-2"><v.icon className={`w-4 h-4 ${v.color}`}/>{v.label} — {v.price}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Phone (M-Pesa)</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 254712345678"/>
                <p className="text-xs text-muted-foreground">Start with country code, no + (e.g. 254712345678)</p>
              </div>

              {/* Plan summary */}
              {plan && (
                <div className="p-3 rounded-lg bg-muted text-sm space-y-1">
                  <div className="flex justify-between"><span>Plan</span><span className="font-medium capitalize">{plan}</span></div>
                  <div className="flex justify-between"><span>Amount</span><span className="font-bold text-green-600">{PLANS[plan as keyof typeof PLANS]?.price}</span></div>
                  <div className="flex justify-between"><span>Signals</span><span className="text-muted-foreground text-xs">{PLANS[plan as keyof typeof PLANS]?.signals}</span></div>
                </div>
              )}

              {checkoutId && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-yellow-700 dark:text-yellow-400 space-y-2">
                  <p className="font-medium">STK Push sent. Ask subscriber to enter M-Pesa PIN.</p>
                  <Button size="sm" variant="outline" onClick={simulate} disabled={pending} className="w-full text-green-600 border-green-500 hover:bg-green-500/10">
                    {pending ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : null}
                    ✅ Confirm Payment (Simulate)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        {!paid && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            {!checkoutId && (
              <Button onClick={initiate} disabled={pending || !phone} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
                {pending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Smartphone className="w-4 h-4"/>}
                Send STK Push
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── WA Number Status Badge ─────────────────────────────────────────────────────
function WaBadge({ status }: { status: boolean | null | undefined }) {
  if (status === true)  return <span title="On WhatsApp" className="flex items-center gap-0.5 text-[10px] text-green-500"><ShieldCheck className="w-3 h-3"/>WA</span>;
  if (status === false) return <span title="Not on WhatsApp" className="flex items-center gap-0.5 text-[10px] text-red-500"><AlertTriangle className="w-3 h-3"/>No WA</span>;
  return <span title="Not checked yet" className="flex items-center gap-0.5 text-[10px] text-muted-foreground"><HelpCircle className="w-3 h-3"/>?</span>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Deployments() {
  const { data: subs = [], isLoading } = useSubs();
  const addSub    = useAddSub();
  const updateSub = useUpdateSub();
  const deleteSub = useDeleteSub();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", plan: "basic", signalType: "both" });

  // WA number validation state
  const [validating, setValidating]         = useState(false);
  const [waStatus, setWaStatus]             = useState<Record<number, boolean | null>>({});
  const [lastValidated, setLastValidated]   = useState<Date | null>(null);

  const validateNumbers = async () => {
    setValidating(true);
    try {
      const r = await fetch("/api/whatsapp/validate");
      if (!r.ok) {
        const d = await r.json();
        toast({ title: "Validation failed", description: d.error ?? "WhatsApp not connected?", variant: "destructive" });
        return;
      }
      const data: { id: number; phone: string; name: string; onWhatsApp: boolean | null }[] = await r.json();
      const map: Record<number, boolean | null> = {};
      for (const item of data) map[item.id] = item.onWhatsApp;
      setWaStatus(map);
      setLastValidated(new Date());
      const invalid = data.filter(d => d.onWhatsApp === false);
      if (invalid.length === 0) {
        toast({ title: "✅ All numbers verified", description: "Every subscriber is on WhatsApp." });
      } else {
        toast({
          title: `⚠ ${invalid.length} number${invalid.length !== 1 ? "s" : ""} not on WhatsApp`,
          description: invalid.map(d => d.name).join(", "),
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setValidating(false);
    }
  };

  const handleAdd = async () => {
    if (!form.name || !form.phone) return;
    try {
      await addSub.mutateAsync(form);
      setIsOpen(false);
      setForm({ name: "", phone: "", plan: "basic", signalType: "both" });
      toast({ title: "✅ Subscriber added", description: `${form.name} will receive ${form.signalType} signals` });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const toggle = async (s: Subscriber) => {
    const next = s.status === "active" ? "inactive" : "active";
    await updateSub.mutateAsync({ id: s.id, status: next });
    toast({ title: next === "active" ? "✅ Activated" : "⏸ Paused", description: s.name });
  };
  const remove = async (s: Subscriber) => {
    await deleteSub.mutateAsync(s.id);
    toast({ title: "🗑 Removed", description: s.name });
  };

  const active  = subs.filter(s => s.status === "active");
  const crypto  = active.filter(s => s.signalType === "crypto" || s.signalType === "both");
  const forex   = active.filter(s => s.signalType === "forex"  || s.signalType === "both");
  const premium = active.filter(s => s.plan !== "basic");
  const mrr     = active.reduce((sum, s) => sum + (s.plan === "vip" ? 2000 : s.plan === "premium" ? 1000 : 500), 0);

  return (
    <PageTransition className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="w-6 h-6 text-green-500"/> Subscribers</h1>
          <p className="text-sm text-muted-foreground">Manage signal subscribers and M-Pesa subscriptions</p>
        </div>
        <div className="flex flex-wrap gap-2 items-start">
          <Button variant="outline" onClick={validateNumbers} disabled={validating} className="gap-1.5 text-xs" title={lastValidated ? `Last checked: ${lastValidated.toLocaleTimeString()}` : "Check if all numbers are registered on WhatsApp"}>
            {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <ShieldCheck className="w-3.5 h-3.5"/>}
            {validating ? "Checking…" : "Validate Numbers"}
          </Button>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-green-600 hover:bg-green-700 text-white"><Plus className="w-4 h-4"/> Add Subscriber</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add Subscriber</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input placeholder="e.g. John Kamau" value={form.name} onChange={e => setForm({...form, name: e.target.value})}/>
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp Number</Label>
                <Input placeholder="254712345678 (with country code)" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}/>
              </div>
              <div className="space-y-1.5">
                <Label>Signal Path</Label>
                <Select value={form.signalType} onValueChange={v => setForm({...form, signalType: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both"><span className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-indigo-500"/>Both (Crypto + Forex)</span></SelectItem>
                    <SelectItem value="crypto"><span className="flex items-center gap-2"><Bitcoin className="w-4 h-4 text-orange-500"/>Crypto Only</span></SelectItem>
                    <SelectItem value="forex"><span className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-blue-500"/>Forex Only</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Select value={form.plan} onValueChange={v => setForm({...form, plan: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLANS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        <span className="flex items-center gap-2"><v.icon className={`w-4 h-4 ${v.color}`}/>{v.label} — {v.price}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={addSub.isPending || !form.name || !form.phone} className="bg-green-600 hover:bg-green-700 text-white">
                {addSub.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : null}Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Active", value: active.length, icon: Users, color: "text-green-500" },
          { label: "Crypto Path", value: crypto.length, icon: Bitcoin, color: "text-orange-500" },
          { label: "Forex Path", value: forex.length, icon: DollarSign, color: "text-blue-500" },
          { label: "MRR", value: `KES ${mrr.toLocaleString()}`, icon: CreditCard, color: "text-yellow-500" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <s.icon className={`w-4 h-4 ${s.color}`}/>
              </div>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Subscriber Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Subscriber List</CardTitle>
              <CardDescription>Click 💳 to collect M-Pesa payment and upgrade their plan</CardDescription>
            </div>
            {lastValidated && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5"/> Last checked {lastValidated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>WA Status</TableHead>
                <TableHead>Signals</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array(4).fill(0).map((_,i) => (
                <TableRow key={i}>{Array(8).fill(0).map((_,j)=><TableCell key={j}><Skeleton className="h-4 w-full"/></TableCell>)}</TableRow>
              )) : subs.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="w-8 h-8 opacity-30"/>No subscribers yet.
                  </div>
                </TableCell></TableRow>
              ) : subs.map(s => (
                <TableRow key={s.id} className={s.status !== "active" ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{s.phone}</TableCell>
                  <TableCell><WaBadge status={waStatus[s.id]}/></TableCell>
                  <TableCell><SignalTypeBadge type={s.signalType}/></TableCell>
                  <TableCell><PlanBadge plan={s.plan}/></TableCell>
                  <TableCell>
                    {s.status === "active"
                      ? <span className="flex items-center gap-1 text-green-500 text-xs"><CheckCircle2 className="w-3 h-3"/>Active</span>
                      : <span className="flex items-center gap-1 text-muted-foreground text-xs"><XCircle className="w-3 h-3"/>Paused</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(s.joinedAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-0.5">
                      <MpesaDialog sub={s}/>
                      <Button variant="ghost" size="sm" onClick={() => toggle(s)} disabled={updateSub.isPending} title={s.status === "active" ? "Pause" : "Activate"}>
                        {s.status === "active" ? <ToggleRight className="w-4 h-4 text-green-500"/> : <ToggleLeft className="w-4 h-4 text-muted-foreground"/>}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(s)} disabled={deleteSub.isPending} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4"/>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* Plan breakdown */}
      <div className="grid gap-3 md:grid-cols-3">
        {Object.entries(PLANS).map(([key, plan]) => {
          const count = active.filter(s => s.plan === key).length;
          return (
            <Card key={key} className={`border ${count > 0 ? "border-current/20" : ""}`}>
              <CardContent className="pt-4 pb-3">
                <div className={`flex items-center gap-2 mb-2 ${plan.color}`}>
                  <div className={`p-1.5 rounded-lg ${plan.bg}`}><plan.icon className="w-4 h-4"/></div>
                  <span className="font-semibold">{plan.label}</span>
                  <Badge variant="secondary" className="ml-auto">{count} subs</Badge>
                </div>
                <div className="text-xl font-bold">{plan.price}</div>
                <p className="text-xs text-muted-foreground mt-1">{plan.signals}</p>
                <p className="text-xs text-muted-foreground mt-1 font-medium">
                  Revenue: KES {(count * parseInt(plan.price.replace(/[^0-9]/g, "").slice(0,4))).toLocaleString()}/mo
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </PageTransition>
  );
}
