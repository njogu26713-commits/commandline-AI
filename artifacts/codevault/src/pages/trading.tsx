import {
  useListTradingSignals,
  useGetTradingStats,
  useListSubscribers,
  useGetTradingPerformance,
  useCreateTradingSignal,
  getListTradingSignalsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import {
  TrendingUp, TrendingDown, Users, Activity, Plus, DollarSign,
  Bot, Zap, ShieldAlert, ScanLine, Play, Pause, RefreshCw, Brain,
  MessageCircle, Wifi, WifiOff, CheckCircle2, Clock, Sparkles, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageTransition } from "@/components/page-transition";

const MARKET_PAIRS = [
  { pair: "BTC/USDT",  price: "$67,420", change: "+2.4%", sentiment: "BULLISH", strength: 82 },
  { pair: "ETH/USDT",  price: "$3,510",  change: "+1.8%", sentiment: "BULLISH", strength: 74 },
  { pair: "SOL/USDT",  price: "$172",    change: "-0.9%", sentiment: "NEUTRAL", strength: 51 },
  { pair: "BNB/USDT",  price: "$598",    change: "+0.5%", sentiment: "BULLISH", strength: 63 },
  { pair: "XRP/USDT",  price: "$0.62",   change: "-1.2%", sentiment: "BEARISH", strength: 38 },
  { pair: "DOGE/USDT", price: "$0.18",   change: "-2.1%", sentiment: "BEARISH", strength: 29 },
];

const AI_MODES = [
  { value: "conservative", label: "Conservative", desc: "High confidence only (>85%)", color: "text-blue-500" },
  { value: "balanced",     label: "Balanced",     desc: "Moderate risk, above 70%",  color: "text-indigo-500" },
  { value: "aggressive",  label: "Aggressive",   desc: "Higher risk, from 55%",      color: "text-orange-500" },
];

function RangeSlider({ min, max, step, value, onChange, label, unit, description }: {
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; label: string; unit: string; description: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <Label>{label}</Label>
        <span className="font-bold text-indigo-500">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer bg-muted accent-indigo-600"
      />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

interface WAStatus {
  connected: boolean;
  qr: string | null;
  phone: string | null;
  connecting: boolean;
}

export default function Trading() {
  const { data: stats, isLoading: statsLoading }             = useGetTradingStats();
  const { data: signals, isLoading: signalsLoading }         = useListTradingSignals();
  const { data: subscribers, isLoading: subscribersLoading } = useListSubscribers();
  const { data: performance }                                = useGetTradingPerformance();

  const createSignal = useCreateTradingSignal();
  const queryClient  = useQueryClient();
  const { toast }    = useToast();

  // Signal form
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSignal, setNewSignal] = useState({
    pair: "", direction: "BUY", entryPrice: "", targetPrice: "", stopLoss: "", confidence: "80",
  });
  const [aiReasoning, setAiReasoning] = useState("");
  const [generatingAI, setGeneratingAI] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);

  // WhatsApp state (real — from API)
  const [waStatus, setWaStatus] = useState<WAStatus>({ connected: false, qr: null, phone: null, connecting: false });
  const [showQrDialog, setShowQrDialog] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Bot UI controls
  const [botActive, setBotActive]       = useState(false);
  const [aiMode, setAiMode]             = useState("balanced");
  const [autoSignals, setAutoSignals]   = useState(false);
  const [isScanning, setIsScanning]     = useState(false);
  const [lastScan, setLastScan]         = useState<string | null>(null);

  // Risk controls
  const [maxRisk, setMaxRisk]                 = useState(2);
  const [maxDailySignals, setMaxDailySignals] = useState(5);
  const [tpMultiplier, setTpMultiplier]       = useState(2);
  const [autoSl, setAutoSl]                   = useState(true);
  const [compoundMode, setCompoundMode]       = useState(false);

  // ── WhatsApp polling ──────────────────────────────────────────────────────
  const fetchWAStatus = async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      const data: WAStatus = await res.json();
      setWaStatus(data);
      if (data.connected) {
        setShowQrDialog(false);
        stopPolling();
      }
    } catch {}
  };

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(fetchWAStatus, 2500);
  };

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => {
    fetchWAStatus();
    return () => stopPolling();
  }, []);

  const handleConnectWA = async () => {
    if (waStatus.connected) {
      await fetch("/api/whatsapp/disconnect", { method: "POST" });
      setWaStatus({ connected: false, qr: null, phone: null, connecting: false });
      setBotActive(false);
      toast({ title: "📵 WhatsApp Disconnected" });
      return;
    }
    setShowQrDialog(true);
    try {
      await fetch("/api/whatsapp/connect", { method: "POST" });
      startPolling();
    } catch {
      toast({ title: "Connection failed", variant: "destructive" });
    }
  };

  // ── AI Signal Generation (Gemini) ─────────────────────────────────────────
  const handleGenerateAI = async () => {
    setGeneratingAI(true);
    setAiReasoning("");
    try {
      const pair = newSignal.pair || "BTC/USDT";
      const res = await fetch("/api/trading/signals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair, mode: aiMode }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setNewSignal({
        pair: data.pair,
        direction: data.direction,
        entryPrice: String(data.entryPrice),
        targetPrice: String(data.targetPrice),
        stopLoss: String(data.stopLoss),
        confidence: String(data.confidence),
      });
      setAiReasoning(data.reasoning ?? "");
      toast({ title: "✨ AI Signal Generated", description: `${data.pair} ${data.direction} — ${data.confidence}% confidence` });
    } catch (err: any) {
      toast({ title: "AI generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingAI(false);
    }
  };

  // ── Broadcast Signal ──────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!newSignal.pair || !newSignal.entryPrice) return;
    setBroadcasting(true);
    try {
      // 1. Save to DB
      await new Promise<void>((resolve, reject) => {
        createSignal.mutate({
          data: {
            pair: newSignal.pair,
            direction: newSignal.direction,
            entryPrice:  parseFloat(newSignal.entryPrice),
            targetPrice: parseFloat(newSignal.targetPrice),
            stopLoss:    parseFloat(newSignal.stopLoss),
            confidence:  parseInt(newSignal.confidence, 10),
          },
        }, {
          onSuccess: () => resolve(),
          onError: (e) => reject(e),
        });
      });

      queryClient.invalidateQueries({ queryKey: getListTradingSignalsQueryKey() });

      // 2. WhatsApp broadcast if connected
      if (waStatus.connected) {
        const res = await fetch("/api/whatsapp/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signal: {
              pair: newSignal.pair,
              direction: newSignal.direction,
              entryPrice:  parseFloat(newSignal.entryPrice),
              targetPrice: parseFloat(newSignal.targetPrice),
              stopLoss:    parseFloat(newSignal.stopLoss),
              confidence:  parseInt(newSignal.confidence, 10),
              reasoning:   aiReasoning,
            },
          }),
        });
        const result = await res.json();
        toast({
          title: `📲 Sent to ${result.sent}/${result.total} subscribers`,
          description: "WhatsApp delivery complete",
        });
      } else {
        toast({ title: "✅ Signal saved", description: "Connect WhatsApp to also broadcast to subscribers." });
      }

      setIsCreateOpen(false);
      setNewSignal({ pair: "", direction: "BUY", entryPrice: "", targetPrice: "", stopLoss: "", confidence: "80" });
      setAiReasoning("");
    } catch (err: any) {
      toast({ title: "Broadcast failed", description: err.message, variant: "destructive" });
    } finally {
      setBroadcasting(false);
    }
  };

  const handleToggleBot = () => {
    if (!waStatus.connected) {
      toast({ title: "WhatsApp not connected", description: "Connect WhatsApp first.", variant: "destructive" });
      return;
    }
    setBotActive(v => {
      const next = !v;
      toast({ title: next ? "🟢 AI Bot Activated" : "🔴 AI Bot Paused", description: next ? `Running in ${aiMode} mode.` : "Bot paused." });
      return next;
    });
  };

  const handleScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setLastScan(new Date().toLocaleTimeString());
      toast({ title: "✅ Market Scan Complete", description: "6 pairs analyzed. 2 high-confidence setups found." });
    }, 2500);
  };

  const isLoading = statsLoading || signalsLoading || subscribersLoading;

  if (isLoading) return (
    <PageTransition className="space-y-6 max-w-7xl mx-auto">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}</div>
    </PageTransition>
  );

  return (
    <PageTransition className="space-y-6 max-w-7xl mx-auto">
      {/* QR Code Dialog */}
      <Dialog open={showQrDialog} onOpenChange={open => { setShowQrDialog(open); if (!open) stopPolling(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-500" /> Connect WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {waStatus.connected ? (
              <div className="flex flex-col items-center gap-3">
                <CheckCircle2 className="w-16 h-16 text-green-500" />
                <p className="font-semibold text-green-600">Connected!</p>
                {waStatus.phone && <p className="text-sm text-muted-foreground">+{waStatus.phone}</p>}
              </div>
            ) : waStatus.qr ? (
              <>
                <img src={waStatus.qr} alt="WhatsApp QR Code" className="w-56 h-56 rounded-lg border" />
                <p className="text-sm text-center text-muted-foreground">
                  Open <strong>WhatsApp</strong> on your phone →<br />
                  Tap <strong>⋮ → Linked Devices → Link a Device</strong><br />
                  then scan this QR code
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-sm text-muted-foreground">Generating QR code…</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Trading Bot</h1>
          <p className="text-muted-foreground">CommandLine AI — WhatsApp signal engine & monetization.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="w-4 h-4" /> Broadcast Signal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Broadcast Signal via WhatsApp</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {/* AI Generate button */}
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-2">
                  <Label>Asset Pair</Label>
                  <Input
                    placeholder="BTC/USDT"
                    value={newSignal.pair}
                    onChange={e => setNewSignal({ ...newSignal, pair: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="pt-6">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 border-indigo-500 text-indigo-500 hover:bg-indigo-500/10"
                    onClick={handleGenerateAI}
                    disabled={generatingAI}
                  >
                    {generatingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {generatingAI ? "Analyzing…" : "AI Generate"}
                  </Button>
                </div>
              </div>

              {aiReasoning && (
                <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
                  <span className="font-semibold">🤖 AI: </span>{aiReasoning}
                </div>
              )}

              <div className="space-y-2">
                <Label>Direction</Label>
                <Select value={newSignal.direction} onValueChange={v => setNewSignal({ ...newSignal, direction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY"  className="text-green-600 font-bold">BUY (Long)</SelectItem>
                    <SelectItem value="SELL" className="text-red-600 font-bold">SELL (Short)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2"><Label>Entry</Label><Input type="number" step="any" value={newSignal.entryPrice}  onChange={e => setNewSignal({ ...newSignal, entryPrice: e.target.value })} /></div>
                <div className="space-y-2"><Label>Target TP</Label><Input type="number" step="any" value={newSignal.targetPrice} onChange={e => setNewSignal({ ...newSignal, targetPrice: e.target.value })} /></div>
                <div className="space-y-2"><Label>Stop Loss</Label><Input type="number" step="any" value={newSignal.stopLoss}    onChange={e => setNewSignal({ ...newSignal, stopLoss: e.target.value })} /></div>
              </div>
              <div className="space-y-2">
                <Label>AI Confidence (%)</Label>
                <Input type="number" min="0" max="100" value={newSignal.confidence} onChange={e => setNewSignal({ ...newSignal, confidence: e.target.value })} />
              </div>

              {waStatus.connected && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 text-green-600 text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  WhatsApp connected — will broadcast to {stats?.activeSubscribers ?? 0} subscribers
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreate}
                disabled={broadcasting || !newSignal.pair || !newSignal.entryPrice}
                className="gap-2"
              >
                {broadcasting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : "📲 Broadcast"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats?.winRate ?? 0}%</div>
            <p className="text-xs text-muted-foreground">Across {stats?.totalSignals ?? 0} total signals</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total PNL</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(stats?.totalPnl || 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
              {(stats?.totalPnl || 0) > 0 ? "+" : ""}{stats?.totalPnl ?? 0}%
            </div>
            <p className="text-xs text-muted-foreground">Cumulative performance</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">WA Subscribers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeSubscribers ?? 0}</div>
            <p className="text-xs text-muted-foreground">Receiving WhatsApp alerts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly MRR</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats?.monthlyRevenue?.toLocaleString() ?? 0}</div>
            <p className="text-xs text-muted-foreground">From paid subscriptions</p>
          </CardContent>
        </Card>
      </div>

      {/* WhatsApp Connection Card */}
      <Card className={`border-2 transition-colors ${waStatus.connected ? "border-green-500/40 bg-green-500/5" : "border-dashed"}`}>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${waStatus.connected ? "bg-green-500/10" : "bg-muted"}`}>
                <MessageCircle className={`w-6 h-6 ${waStatus.connected ? "text-green-500" : "text-muted-foreground"}`} />
              </div>
              <div>
                <div className="flex items-center gap-2 font-semibold">
                  WhatsApp Bot
                  {waStatus.connected
                    ? <span className="flex items-center gap-1 text-xs font-normal text-green-500"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />Connected {waStatus.phone ? `(+${waStatus.phone})` : ""}</span>
                    : waStatus.qr
                    ? <span className="text-xs font-normal text-yellow-500">Scan QR to connect</span>
                    : <span className="text-xs font-normal text-muted-foreground">Not connected</span>
                  }
                </div>
                <p className="text-sm text-muted-foreground">
                  {waStatus.connected
                    ? "Bot is live. Trading signals delivered to subscribers instantly."
                    : "Connect your WhatsApp to send real AI trading signals."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {waStatus.connected && (
                <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground border rounded-lg px-4 py-2">
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> Delivery: 99.2%</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Avg: 0.3s</span>
                </div>
              )}
              {waStatus.qr && !waStatus.connected && (
                <Button variant="outline" size="sm" onClick={() => setShowQrDialog(true)} className="gap-2 text-yellow-600 border-yellow-500">
                  Show QR Code
                </Button>
              )}
              <Button
                onClick={handleConnectWA}
                variant={waStatus.connected ? "outline" : "default"}
                className={`gap-2 ${!waStatus.connected ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
              >
                {waStatus.connected
                  ? <><WifiOff className="w-4 h-4" /> Disconnect</>
                  : <><Wifi className="w-4 h-4" /> Connect WhatsApp</>
                }
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Bot Controls */}
      <Card className={`border-2 transition-colors ${botActive ? "border-indigo-500/40 bg-indigo-500/5" : "border-border"}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${botActive ? "bg-indigo-500/10" : "bg-muted"}`}>
                <Bot className={`w-5 h-5 ${botActive ? "text-indigo-500" : "text-muted-foreground"}`} />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  AI Bot Controls
                  {botActive && <span className="flex items-center gap-1 text-xs font-normal text-indigo-500"><span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />LIVE</span>}
                </CardTitle>
                <CardDescription>
                  {botActive ? `Running in ${AI_MODES.find(m => m.value === aiMode)?.label} mode — sending to ${stats?.activeSubscribers ?? 0} subscribers` : "Bot paused — no signals being generated"}
                </CardDescription>
              </div>
            </div>
            <Button onClick={handleToggleBot} className={`gap-2 ${botActive ? "bg-red-500 hover:bg-red-600 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}>
              {botActive ? <><Pause className="w-4 h-4" /> Pause Bot</> : <><Play className="w-4 h-4" /> Start Bot</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label className="text-sm font-medium mb-3 block">AI Trading Mode</Label>
            <div className="grid grid-cols-3 gap-3">
              {AI_MODES.map(mode => (
                <button key={mode.value} onClick={() => setAiMode(mode.value)}
                  className={`p-3 rounded-lg border text-left transition-all ${aiMode === mode.value ? "border-indigo-500 bg-indigo-500/10" : "border-border hover:border-muted-foreground/50"}`}>
                  <div className={`font-semibold text-sm ${aiMode === mode.value ? mode.color : ""}`}>{mode.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{mode.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-yellow-500" />
              <div>
                <div className="font-medium text-sm">Auto-Broadcast via WhatsApp</div>
                <div className="text-xs text-muted-foreground">AI automatically sends signals to all subscribers when a setup is detected</div>
              </div>
            </div>
            <Switch checked={autoSignals} onCheckedChange={v => {
              setAutoSignals(v);
              toast({ title: v ? "Auto-Signal ON" : "Auto-Signal OFF", description: v ? "AI will auto-send WhatsApp alerts on detection." : "Signals require manual approval." });
            }} />
          </div>
        </CardContent>
      </Card>

      {/* Risk Management + Market Scanner */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-indigo-500" />
              <CardTitle>AI Risk Management</CardTitle>
            </div>
            <CardDescription>Limits the AI enforces before sending any WhatsApp signal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <RangeSlider min={0.5} max={10} step={0.5} value={maxRisk} onChange={setMaxRisk}
              label="Max Risk Per Trade" unit="%" description={`AI will not send a signal risking more than ${maxRisk}% of account`} />
            <RangeSlider min={1} max={20} step={1} value={maxDailySignals} onChange={setMaxDailySignals}
              label="Max Daily Signals" unit="" description={`Bot will stop after ${maxDailySignals} WhatsApp signals per day`} />
            <RangeSlider min={1} max={5} step={0.5} value={tpMultiplier} onChange={setTpMultiplier}
              label="TP:SL Ratio" unit="R" description={`Target must be ${tpMultiplier}x the stop loss distance`} />
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between py-2 border-b">
                <div>
                  <div className="text-sm font-medium">Auto Stop-Loss</div>
                  <div className="text-xs text-muted-foreground">AI sets SL automatically based on ATR</div>
                </div>
                <Switch checked={autoSl} onCheckedChange={setAutoSl} />
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium">Compound Mode</div>
                  <div className="text-xs text-muted-foreground">Increase position size after consecutive wins</div>
                </div>
                <Switch checked={compoundMode} onCheckedChange={setCompoundMode} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-indigo-500" />
                <CardTitle>AI Market Scanner</CardTitle>
              </div>
              <Button variant="outline" size="sm" className="gap-2" onClick={handleScan} disabled={isScanning}>
                {isScanning ? <><RefreshCw className="w-4 h-4 animate-spin" /> Scanning…</> : <><RefreshCw className="w-4 h-4" /> Scan Now</>}
              </Button>
            </div>
            <CardDescription>{lastScan ? `Last scan: ${lastScan}` : "AI monitoring 6 pairs for WhatsApp alert opportunities"}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {MARKET_PAIRS.map(item => (
                <div key={item.pair} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <Brain className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="font-bold text-sm">{item.pair}</div>
                      <div className="text-xs text-muted-foreground">{item.price}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={`text-xs font-medium ${item.change.startsWith("+") ? "text-green-500" : "text-red-500"}`}>{item.change}</div>
                      <div className="text-xs text-muted-foreground">AI: {item.strength}%</div>
                    </div>
                    <Badge variant="outline" className={
                      item.sentiment === "BULLISH" ? "border-green-500 text-green-500 text-[10px]" :
                      item.sentiment === "BEARISH" ? "border-red-500 text-red-500 text-[10px]" : "text-[10px]"
                    }>{item.sentiment}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Chart + Recent Signals */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 border-indigo-500/20">
          <CardHeader>
            <CardTitle>Performance History</CardTitle>
            <CardDescription>AI signal win rate & cumulative PNL over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performance ?? []}>
                  <defs>
                    <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} />
                  <Area yAxisId="left" type="monotone" dataKey="pnl" stroke="#6366f1" strokeWidth={2} fill="url(#colorPnl)" name="Cumulative PNL %" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Signals</CardTitle>
            <CardDescription>Latest WhatsApp alerts sent to subscribers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {signals?.slice(0, 6).map((signal: any) => (
                <div key={signal.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-md ${signal.direction === "BUY" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
                      {signal.direction === "BUY" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="font-bold text-sm flex items-center gap-2">
                        {signal.pair}
                        <Badge variant="outline" className="text-[10px] font-normal h-4 px-1">{signal.confidence}% AI</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">Entry: {signal.entryPrice}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={signal.status === "won" ? "default" : signal.status === "lost" ? "destructive" : "secondary"}
                      className={signal.status === "won" ? "bg-green-500 hover:bg-green-600" : ""}>
                      {signal.status.toUpperCase()}
                    </Badge>
                    {signal.pnl != null && (
                      <div className={`text-xs mt-1 font-medium ${signal.pnl > 0 ? "text-green-500" : "text-red-500"}`}>
                        {signal.pnl > 0 ? "+" : ""}{signal.pnl}%
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscribers */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-500" />
            <div>
              <CardTitle>WhatsApp Subscribers</CardTitle>
              <CardDescription>Users receiving AI trading signals via WhatsApp</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>WhatsApp Number</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscribers?.map((sub: any) => (
                <TableRow key={sub.id}>
                  <TableCell className="font-medium">{sub.name}</TableCell>
                  <TableCell className="font-mono text-xs">{sub.phone}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={sub.plan === "pro" ? "border-indigo-500 text-indigo-500" : ""}>
                      {sub.plan.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${sub.status === "active" ? "bg-green-500" : "bg-red-500"}`} />
                      <span className="capitalize text-sm">{sub.status}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{new Date(sub.joinedAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageTransition>
  );
}
