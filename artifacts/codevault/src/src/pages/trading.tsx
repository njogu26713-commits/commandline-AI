import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Zap, TrendingUp, TrendingDown, Users, DollarSign, Activity,
  MessageCircle, Wifi, WifiOff, Sparkles, Loader2, CheckCircle2,
  Bitcoin, RefreshCw, Bot, Play, Pause, FlaskConical,
  ThumbsUp, ThumbsDown, BarChart2, Clock, AlertCircle, XCircle,
  CalendarDays, Target, Timer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageTransition } from "@/components/page-transition";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────
interface WAStatus { connected: boolean; qr: string | null; phone: string | null; connecting: boolean; }
interface Signal {
  id: number; pair: string; direction: string; entryPrice: number;
  targetPrice: number; stopLoss: number; confidence: number;
  status: string; pnl: number | null; category: string; createdAt: string;
}
interface Stats {
  totalSignals: number; winRate: number; activeSubscribers: number;
  monthlyRevenue: number; totalPnl: number; closedSignals: number;
}

// ── Pairs ─────────────────────────────────────────────────────────────────────
const CRYPTO_PAIRS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","MATICUSDT"];
const FOREX_PAIRS  = ["EUR/USD","GBP/USD","USD/JPY","XAU/USD","AUD/USD","EUR/GBP","USD/CAD","NZD/USD"];

const AI_MODES = [
  { value: "conservative", label: "Conservative", conf: ">82%", color: "border-blue-500 text-blue-500" },
  { value: "balanced",     label: "Balanced",     conf: ">68%", color: "border-green-500 text-green-500" },
  { value: "aggressive",   label: "Aggressive",   conf: ">55%", color: "border-orange-500 text-orange-500" },
];

// ── API hooks ─────────────────────────────────────────────────────────────────
function useStats() {
  return useQuery<Stats>({ queryKey: ["stats"], queryFn: () => fetch("/api/trading/stats").then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }), refetchInterval: 30000 });
}
function useSignals() {
  return useQuery<Signal[]>({ queryKey: ["signals"], queryFn: () => fetch("/api/trading/signals").then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }), refetchInterval: 15000 });
}
function useUpdateSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; status: string; pnl?: number }) =>
      fetch(`/api/trading/signals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["signals"] }); qc.invalidateQueries({ queryKey: ["stats"] }); },
  });
}
function useCreateSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => fetch("/api/trading/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signals"] }),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtPrice(n: number, cat?: string) {
  if (cat === "forex") return n < 10 ? n.toFixed(5) : n.toFixed(2);
  return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n >= 1 ? n.toFixed(2) : n.toFixed(6);
}
function riskColor(conf: number) { return conf >= 80 ? "text-green-500" : conf >= 65 ? "text-yellow-500" : "text-red-500"; }
function statusBadge(status: string) {
  if (status === "won")    return <Badge className="bg-green-500/10 text-green-500 border-green-500/30">✅ WON</Badge>;
  if (status === "lost")   return <Badge className="bg-red-500/10 text-red-500 border-red-500/30">❌ LOST</Badge>;
  if (status === "active") return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/30 animate-pulse">🔵 ACTIVE</Badge>;
  return <Badge variant="secondary">{status.toUpperCase()}</Badge>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Trading() {
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: signals = [], isLoading: sigsLoading, refetch: refetchSignals } = useSignals();
  const updateSignal = useUpdateSignal();
  const { toast } = useToast();
  const qc = useQueryClient();

  // WhatsApp state
  const [waStatus, setWaStatus] = useState<WAStatus>({ connected: false, qr: null, phone: null, connecting: false });
  const [showQr, setShowQr]     = useState(false);
  const [testingWA, setTestingWA] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const { data: groupInfo, refetch: refetchGroup } = useQuery<{
    exists: boolean; groupJid: string | null; name: string | null;
    size: number; inviteLink: string | null;
  }>({
    queryKey: ["wa-group"],
    queryFn: () => fetch("/api/whatsapp/groups/info").then(r => r.json()),
    refetchInterval: 30000,
    enabled: waStatus.connected,
  });

  const handleCreateGroup = async () => {
    setCreatingGroup(true);
    try {
      const r = await fetch("/api/whatsapp/groups/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "CommandLine Signals 🔥" }) });
      const d = await r.json();
      if (!r.ok) {
        const isNoSubs = d.error === "no_subscribers";
        toast({
          title: isNoSubs ? "No subscribers yet" : "Group creation failed",
          description: isNoSubs
            ? "Add at least one active subscriber first, then create the group."
            : d.error ?? d.message ?? "Failed to create group",
          variant: "destructive",
        });
      } else {
        refetchGroup();
        toast({ title: "✅ Group created!", description: `${d.members} subscriber${d.members !== 1 ? "s" : ""} added to the group.` });
      }
    } catch (e: any) {
      toast({ title: "Network error", description: e?.message ?? "Could not reach the server", variant: "destructive" });
    } finally {
      setCreatingGroup(false);
    }
  };
  const pollRef = useRef<any>(null);

  // Bot state — synced with server
  const [aiMode, setAiMode] = useState("balanced");
  const [botLoading, setBotLoading] = useState(false);
  const { data: botStatus, refetch: refetchBot } = useQuery<{
    active: boolean; mode: string; intervalMinutes: number;
    lastSignalAt: string | null; lastScanAt: string | null;
    signalsToday: number; nextScanAt: string | null; pairs: string[];
    currentAction: string | null; scannedPairs: number; lastSignalPair: string | null;
  }>({
    queryKey: ["bot-status"],
    queryFn: () => fetch("/api/bot/status").then(r => r.json()),
    refetchInterval: 10000,
  });
  const botActive = botStatus?.active ?? false;

  // Bot analysis logs
  const { data: botLogs = [] } = useQuery<{ time: string; message: string; type: string }[]>({
    queryKey: ["bot-logs-feed"],
    queryFn: () => fetch("/api/bot/logs").then(r => r.json()),
    refetchInterval: botActive ? 3000 : false,
    enabled: botActive,
  });

  // AI panel
  const [category, setCategory]     = useState<"crypto"|"forex">("crypto");
  const [pair, setPair]             = useState("BTCUSDT");
  const [aiReason, setAiReason]     = useState("");
  const [generating, setGenerating] = useState(false);
  const [lastSignal, setLastSignal] = useState<any>(null);

  // WA polling
  const fetchWA = async () => {
    try {
      const d: WAStatus = await fetch("/api/whatsapp/status").then(r => r.json());
      setWaStatus(d);
      if (d.connected) { setShowQr(false); stopPoll(); }
    } catch {}
  };
  const startPoll = () => { if (!pollRef.current) pollRef.current = setInterval(fetchWA, 2500); };
  const stopPoll  = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  useEffect(() => { fetchWA(); return stopPoll; }, []);

  const handleConnectWA = async () => {
    if (waStatus.connected) {
      await fetch("/api/whatsapp/disconnect", { method: "POST" });
      setWaStatus({ connected: false, qr: null, phone: null, connecting: false });
      setBotActive(false);
      toast({ title: "📵 WhatsApp Disconnected" });
      return;
    }
    setShowQr(true);
    await fetch("/api/whatsapp/connect", { method: "POST" });
    startPoll();
  };

  const handleSendTest = async () => {
    setTestingWA(true);
    try {
      const r = await fetch("/api/whatsapp/test", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast({ title: "🧪 Test sent!", description: `Check WhatsApp on +${d.sentTo}` });
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally { setTestingWA(false); }
  };

  const safeJson = async (r: Response) => {
    const text = await r.text();
    if (!text) throw new Error("Empty response from server");
    try { return JSON.parse(text); } catch { throw new Error("Invalid server response"); }
  };

  // AI generate → server auto-saves to DB + broadcasts to WhatsApp subscribers
  const handleGenerate = async () => {
    setGenerating(true); setAiReason(""); setLastSignal(null);
    try {
      const r = await fetch("/api/trading/signals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair, mode: aiMode, category }),
      });
      const d = await safeJson(r);
      if (!r.ok) throw new Error(d.error ?? "AI generation failed");
      setAiReason(d.reasoning ?? "");
      setLastSignal({ id: d.id, pair, category, direction: d.direction, entryPrice: d.entryPrice, targetPrice: d.targetPrice, stopLoss: d.stopLoss, confidence: d.confidence, status: "active", createdAt: new Date().toISOString() });

      const bc = d.broadcast;
      if (bc && !bc.skipped) {
        if (bc.sent > 0) {
          toast({ title: `📲 Signal sent to ${bc.sent} subscriber${bc.sent !== 1 ? "s" : ""}`, description: `${d.direction} ${pair} @ ${d.entryPrice.toFixed(2)} — ${d.confidence}% confidence` });
        } else {
          toast({ title: `✅ ${d.direction} signal saved`, description: `WhatsApp connected but no active subscribers yet` });
        }
      } else {
        toast({ title: `✅ ${d.direction} signal saved`, description: `${pair} @ ${d.entryPrice.toFixed(2)} — connect WhatsApp to auto-send to subscribers` });
      }

      refetchSignals?.();
    } catch (e: any) {
      toast({ title: "Signal generation failed", description: e.message, variant: "destructive" });
    } finally { setGenerating(false); }
  };

  const handleResult = async (signal: Signal, result: "won" | "lost") => {
    const rr = Math.abs(signal.targetPrice - signal.entryPrice) / Math.abs(signal.entryPrice - signal.stopLoss);
    const pnl = result === "won" ? Math.round(rr * 100) / 10 : -1.0;
    await updateSignal.mutateAsync({ id: signal.id, status: result, pnl });
    toast({ title: result === "won" ? "✅ Signal marked Won!" : "❌ Signal marked Lost", description: `PNL: ${pnl > 0 ? "+" : ""}${pnl}%` });
  };

  const activeSignals = signals.filter(s => s.status === "active");
  const closedSignals = signals.filter(s => ["won", "lost"].includes(s.status)).slice(0, 10);

  // ── Today's summary ────────────────────────────────────────────────────────
  const todayStr = new Date().toDateString();
  const todaySignals = signals.filter(s => new Date(s.createdAt).toDateString() === todayStr);
  const todayWon    = todaySignals.filter(s => s.status === "won").length;
  const todayLost   = todaySignals.filter(s => s.status === "lost").length;
  const todayActive = todaySignals.filter(s => s.status === "active").length;
  const todayPnl    = todaySignals.reduce((sum, s) => sum + (s.pnl ?? 0), 0);
  const hasToday    = todaySignals.length > 0;

  return (
    <PageTransition className="space-y-5 max-w-7xl mx-auto">

      {/* QR Dialog */}
      <Dialog open={showQr} onOpenChange={v => { setShowQr(v); if (!v) stopPoll(); }}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader><DialogTitle className="flex items-center justify-center gap-2"><MessageCircle className="w-5 h-5 text-green-500" /> Connect WhatsApp</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {waStatus.connected ? (
              <><CheckCircle2 className="w-16 h-16 text-green-500" /><p className="font-semibold text-green-600">Connected!</p></>
            ) : waStatus.qr ? (
              <><img src={waStatus.qr} alt="QR" className="w-52 h-52 rounded-lg border" /><p className="text-xs text-muted-foreground">WhatsApp → ⋮ → Linked Devices → Link a Device</p></>
            ) : (
              <><Loader2 className="w-10 h-10 text-green-500 animate-spin" /><p className="text-sm text-muted-foreground">Generating QR code…</p></>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="w-6 h-6 text-green-500" /> CommandLine Signals
          </h1>
          <p className="text-sm text-muted-foreground">AI-powered WhatsApp trading bot</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-full self-start sm:self-auto">
          <CalendarDays className="w-3.5 h-3.5" />
          {new Date().toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })}
        </div>
      </div>

      {/* ── Today's Performance Card ─────────────────────────────────────────── */}
      <Card className={`border-2 transition-colors ${
        botActive
          ? "border-indigo-500/40 bg-gradient-to-r from-indigo-500/5 to-green-500/5"
          : "border-border"
      }`}>
        <CardContent className="pt-4 pb-4">
          {/* Title row */}
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="font-semibold text-sm">Today's Performance</span>
            {botActive ? (
              <span className="flex items-center gap-1 text-[10px] font-medium text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" /> BOT LIVE
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Bot off</span>
            )}
          </div>

          {/* Metrics — 3-col grid on mobile, flex row on sm+ */}
          <div className="grid grid-cols-3 sm:flex sm:flex-wrap sm:items-center gap-2 sm:gap-4">
            <div className="text-center">
              <div className="text-xl font-bold text-foreground">{todaySignals.length}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Signals today</div>
            </div>
            <div className="hidden sm:block w-px h-8 bg-border" />
            <div className="text-center">
              <div className="text-xl font-bold text-green-500">{todayWon}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Won</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-red-500">{todayLost}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Lost</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-blue-500">{todayActive}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">Active</div>
            </div>
            <div className="hidden sm:block w-px h-8 bg-border" />
            <div className="text-center">
              <div className={`text-xl font-bold ${todayPnl > 0 ? "text-green-500" : todayPnl < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                {todayPnl > 0 ? "+" : ""}{todayPnl.toFixed(1)}%
              </div>
              <div className="text-[10px] text-muted-foreground leading-tight">Today's PNL</div>
            </div>
            <div className="hidden sm:block w-px h-8 bg-border" />
            <div className="text-center">
              <div className={`text-xl font-bold ${
                (todayWon + todayLost) === 0 ? "text-muted-foreground" :
                (todayWon / (todayWon + todayLost)) >= 0.6 ? "text-green-500" : "text-yellow-500"
              }`}>
                {(todayWon + todayLost) === 0 ? "—" : `${Math.round((todayWon / (todayWon + todayLost)) * 100)}%`}
              </div>
              <div className="text-[10px] text-muted-foreground leading-tight">Win rate</div>
            </div>
            {botActive && botStatus?.nextScanAt && (
              <>
                <div className="hidden sm:block w-px h-8 bg-border" />
                <div className="text-center">
                  <div className="text-xl font-bold text-indigo-400 flex items-center gap-1 justify-center">
                    <Timer className="w-4 h-4" />
                    {new Date(botStatus.nextScanAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-tight">Next scan</div>
                </div>
              </>
            )}
          </div>

          {/* Progress bar — won vs lost */}
          {(todayWon + todayLost) > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-green-500 w-8 text-right">{todayWon}W</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all duration-700"
                    style={{ width: `${(todayWon / (todayWon + todayLost)) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-red-500 w-8">{todayLost}L</span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!hasToday && (
            <p className="text-xs text-muted-foreground mt-1">
              {botActive
                ? "First scan running now — signals will appear here as they're generated."
                : "No signals yet today. Start the bot or use AI Send Signal to generate your first."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* AI Generate Panel */}
      <Card className="border-green-500/30 bg-green-500/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* Category */}
            <div className="flex gap-1.5">
              {(["crypto","forex"] as const).map(c => (
                <button key={c} onClick={() => { setCategory(c); setPair(c === "crypto" ? "BTCUSDT" : "EUR/USD"); }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all ${category === c ? "border-green-500 bg-green-500/15 text-green-600 dark:text-green-400" : "border-border text-muted-foreground hover:border-green-500/50"}`}>
                  {c === "crypto" ? <Bitcoin className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5" />}
                  {c === "crypto" ? "Crypto" : "Forex"}
                </button>
              ))}
            </div>

            {/* Pair */}
            <div className="w-36">
              <Select value={pair} onValueChange={setPair}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(category === "crypto" ? CRYPTO_PAIRS : FOREX_PAIRS).map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* AI Mode */}
            <div className="flex gap-1">
              {AI_MODES.map(m => (
                <button key={m.value} onClick={() => setAiMode(m.value)}
                  className={`py-1 px-2.5 rounded-lg border text-[11px] font-medium transition-all ${aiMode === m.value ? m.color + " bg-current/10" : "border-border text-muted-foreground hover:border-green-500/40"}`}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Generate button */}
            <Button onClick={handleGenerate} disabled={generating}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto sm:ml-auto">
              {generating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
                : <><Sparkles className="w-4 h-4" /> AI Send Signal</>}
            </Button>
          </div>

          {/* Result / reasoning */}
          {generating && (
            <div className="mt-3 flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching live Binance data and analysing {pair}…
            </div>
          )}
          {aiReason && !generating && (
            <div className="mt-3 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-700 dark:text-green-400 flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{aiReason}</span>
            </div>
          )}
          {waStatus.connected && (
            <p className="mt-2 text-[11px] text-green-600/70 dark:text-green-500/60 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> WhatsApp connected — signal will be broadcast to subscribers automatically
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1,2,3,4].map(i=><Skeleton key={i} className="h-24"/>)}</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Win Rate", value: `${stats?.winRate ?? 0}%`, sub: `${stats?.closedSignals ?? 0} closed signals`, icon: Activity, color: "text-green-500" },
            { label: "WA Subscribers", value: stats?.activeSubscribers ?? 0, sub: "Active subscribers", icon: Users, color: "text-blue-500" },
            { label: "Monthly Revenue", value: `KES ${((stats?.monthlyRevenue ?? 0)).toLocaleString()}`, sub: "MRR from subscriptions", icon: DollarSign, color: "text-yellow-500" },
            { label: "Total Signals", value: stats?.totalSignals ?? 0, sub: "All-time signals sent", icon: Zap, color: "text-indigo-500" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* WhatsApp Card + Bot Controls */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={`border-2 ${waStatus.connected ? "border-green-500/40 bg-green-500/5" : "border-dashed"}`}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${waStatus.connected ? "bg-green-500/10" : "bg-muted"}`}>
                  <MessageCircle className={`w-5 h-5 ${waStatus.connected ? "text-green-500" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    WhatsApp Bot
                    {waStatus.connected
                      ? <span className="flex items-center gap-1 text-xs font-normal text-green-500"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/>Connected {waStatus.phone ? `(+${waStatus.phone})` : ""}</span>
                      : <span className="text-xs font-normal text-muted-foreground">Not connected</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {waStatus.connected ? "Signals sent as 6 conversational messages" : "Connect to broadcast signals"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {waStatus.connected && (
                  <Button size="sm" variant="outline" onClick={handleSendTest} disabled={testingWA} className="gap-1.5 text-xs text-indigo-500 border-indigo-500">
                    {testingWA ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />} Test
                  </Button>
                )}
                {waStatus.qr && !waStatus.connected && (
                  <Button size="sm" variant="outline" onClick={() => setShowQr(true)} className="text-xs">Show QR</Button>
                )}
                <Button size="sm" onClick={handleConnectWA}
                  className={waStatus.connected ? "" : "bg-green-600 hover:bg-green-700 text-white"}>
                  {waStatus.connected ? <><WifiOff className="w-3.5 h-3.5 mr-1" />Disconnect</> : <><Wifi className="w-3.5 h-3.5 mr-1" />Connect</>}
                </Button>
              </div>
            </div>

            {/* WhatsApp Group Management */}
            {waStatus.connected && (
              <div className="mt-3 pt-3 border-t border-border/60">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Signal Group</p>
                    {groupInfo?.exists ? (
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs font-medium text-green-500">{groupInfo.name}</span>
                        <span className="text-[10px] text-muted-foreground">· {groupInfo.size} members</span>
                        {groupInfo.inviteLink && (
                          <a href={groupInfo.inviteLink} target="_blank" rel="noreferrer"
                            className="text-[10px] text-primary underline underline-offset-2">Join link</a>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground mt-0.5">No group yet — create one to share signals</p>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={handleCreateGroup} disabled={creatingGroup}
                    className="text-xs flex-shrink-0 gap-1.5">
                    {creatingGroup ? <><Loader2 className="w-3 h-3 animate-spin" /> Creating…</> : groupInfo?.exists ? "Recreate" : "Create Group"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`border-2 ${botActive ? "border-indigo-500/40 bg-indigo-500/5" : "border-border"}`}>
          <CardContent className="pt-4 pb-4">
            {/* Header row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${botActive ? "bg-indigo-500/10" : "bg-muted"}`}>
                  <Bot className={`w-5 h-5 ${botActive ? "text-indigo-500 animate-pulse" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    Autonomous AI Bot
                    {botActive
                      ? <span className="flex items-center gap-1 text-xs text-indigo-500 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"/>LIVE</span>
                      : <span className="text-xs font-normal text-muted-foreground">Offline</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {botActive
                      ? `${(botStatus?.mode ?? aiMode).charAt(0).toUpperCase() + (botStatus?.mode ?? aiMode).slice(1)} mode · scans all ${botStatus?.pairs?.length ?? 7} pairs · signals sent automatically`
                      : "Start to scan all pairs automatically every 5 min"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!botActive && (
                  <div className="hidden sm:flex gap-1">
                    {AI_MODES.map(m => (
                      <button key={m.value} onClick={() => setAiMode(m.value)}
                        className={`text-[10px] px-1.5 py-0.5 rounded border transition-all ${aiMode === m.value ? m.color : "border-border text-muted-foreground"}`}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
                <Button size="sm" disabled={botLoading}
                  onClick={async () => {
                    if (!botActive && !waStatus.connected) { toast({ title: "Connect WhatsApp first", description: "The bot needs WhatsApp to send signals to subscribers.", variant: "destructive" }); return; }
                    setBotLoading(true);
                    try {
                      if (botActive) {
                        await fetch("/api/bot/stop", { method: "POST" });
                        toast({ title: "🔴 Bot stopped", description: "Autonomous scanning paused" });
                      } else {
                        const r = await fetch("/api/bot/start", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ mode: aiMode, intervalMinutes: 5 }),
                        });
                        const d = await r.json();
                        if (!r.ok) {
                          toast({ title: "Cannot start bot", description: d.error ?? "Failed to start bot", variant: "destructive" });
                          setBotLoading(false);
                          return;
                        }
                        toast({ title: "🟢 Bot is live!", description: `Scanning all pairs in ${aiMode} mode every 5 minutes. First scan running now…` });
                      }
                      qc.invalidateQueries({ queryKey: ["signals"] });
                      refetchBot();
                    } catch (e: any) {
                      toast({ title: "Error", description: e.message, variant: "destructive" });
                    } finally { setBotLoading(false); }
                  }}
                  className={botActive ? "bg-red-500 hover:bg-red-600 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"}>
                  {botLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin"/> : botActive ? <><Pause className="w-3.5 h-3.5 mr-1"/>Stop</> : <><Play className="w-3.5 h-3.5 mr-1"/>Start Bot</>}
                </Button>
              </div>
            </div>

            {/* Live status row — only when active */}
            {botActive && (
              <div className="mt-1 space-y-1.5">
                {/* Current action */}
                {botStatus?.currentAction && (
                  <div className="flex items-center gap-2 text-[11px] text-indigo-400 bg-indigo-500/5 border border-indigo-500/20 rounded-md px-2.5 py-1.5">
                    <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                    <span className="font-mono">{botStatus.currentAction}</span>
                  </div>
                )}
                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  {[
                    { label: "Signals Today", val: botStatus?.signalsToday ?? 0, color: "text-green-500" },
                    { label: "Pairs Watched", val: botStatus?.pairs?.length ?? 7, color: "text-blue-500" },
                    { label: "Last Signal", val: botStatus?.lastSignalPair ?? "—", color: "text-yellow-500" },
                    { label: "Next Scan", val: botStatus?.nextScanAt ? new Date(botStatus.nextScanAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : "—", color: "text-indigo-400" },
                  ].map(s => (
                    <div key={s.label} className="bg-muted/40 rounded-md py-1.5 px-1">
                      <div className={`text-sm font-bold ${s.color}`}>{s.val}</div>
                      <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>
                {/* Pairs being watched */}
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {(botStatus?.pairs ?? []).map(p => (
                    <span key={p} className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded px-1.5 py-0.5 font-mono">{p}</span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live AI Analysis Feed — only when bot is active */}
      {botActive && (
        <Card className="border-indigo-500/30 bg-indigo-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
              Live AI Analysis Feed
              <span className="ml-auto text-[10px] font-normal text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                Every 5 min
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
              {botLogs.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-indigo-400 py-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Running first market scan across all pairs…
                </div>
              ) : botLogs.map((log, i) => (
                <div key={`${log.time}-${i}`} className={`flex items-start gap-2 px-2 py-1.5 rounded text-xs ${
                  log.type === "signal" ? "bg-green-500/10 border border-green-500/20 log-entry-signal" :
                  log.type === "skip"   ? "bg-yellow-500/10 border border-yellow-500/20 log-entry-skip" :
                  log.type === "error"  ? "bg-red-500/10 border border-red-500/20 log-entry-error" :
                  "bg-muted/40 log-entry"
                }`}>
                  {log.type === "signal" ? <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" /> :
                   log.type === "skip"   ? <AlertCircle  className="w-3 h-3 text-yellow-500 mt-0.5 flex-shrink-0" /> :
                   log.type === "error"  ? <XCircle      className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" /> :
                   <Clock className="w-3 h-3 text-indigo-400/70 mt-0.5 flex-shrink-0" />}
                  <span className="flex-1 font-mono leading-relaxed">{log.message}</span>
                  <span className="text-muted-foreground/60 whitespace-nowrap text-[10px]">
                    {new Date(log.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Signals */}
      {activeSignals.length > 0 && (
        <Card className="border-green-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Active Signals
            </CardTitle>
            <CardDescription>Mark as Won or Lost once the trade closes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeSignals.map(s => {
                const rr = Math.abs(s.targetPrice - s.entryPrice) / Math.abs(s.entryPrice - s.stopLoss);
                return (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`p-1.5 rounded-md flex-shrink-0 ${s.direction === "BUY" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
                        {s.direction === "BUY" ? <TrendingUp className="w-4 h-4"/> : <TrendingDown className="w-4 h-4"/>}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm">{s.pair} <span className="text-xs font-normal text-muted-foreground">({s.direction})</span></div>
                        <div className="text-xs text-muted-foreground truncate">
                          Entry {fmtPrice(s.entryPrice, s.category)} → TP {fmtPrice(s.targetPrice, s.category)} | R:R {rr.toFixed(1)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline" className={`text-[10px] ${riskColor(s.confidence)}`}>{s.confidence}%</Badge>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-green-500 border-green-500/40 hover:bg-green-500/10" onClick={() => handleResult(s, "won")}>
                        <ThumbsUp className="w-3 h-3"/>
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-red-500 border-red-500/40 hover:bg-red-500/10" onClick={() => handleResult(s, "lost")}>
                        <ThumbsDown className="w-3 h-3"/>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signal History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><BarChart2 className="w-4 h-4"/>Signal History</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["signals"] })}><RefreshCw className="w-3.5 h-3.5"/></Button>
          </div>
        </CardHeader>
        <CardContent>
          {sigsLoading ? <Skeleton className="h-40 w-full"/> : (
            <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pair</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>TP</TableHead>
                  <TableHead>SL</TableHead>
                  <TableHead>Conf.</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>PNL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closedSignals.length === 0 && activeSignals.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No signals yet. Generate your first signal above.</TableCell></TableRow>
                ) : (
                  [...activeSignals, ...closedSignals].slice(0, 15).map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-bold text-sm">{s.pair}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={s.direction === "BUY" ? "text-green-500 border-green-500/40" : "text-red-500 border-red-500/40"}>
                          {s.direction === "BUY" ? "🟢" : "🔴"} {s.direction}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-mono">{fmtPrice(s.entryPrice, s.category)}</TableCell>
                      <TableCell className="text-sm font-mono text-green-500">{fmtPrice(s.targetPrice, s.category)}</TableCell>
                      <TableCell className="text-sm font-mono text-red-500">{fmtPrice(s.stopLoss, s.category)}</TableCell>
                      <TableCell><span className={`text-sm font-bold ${riskColor(s.confidence)}`}>{s.confidence}%</span></TableCell>
                      <TableCell>{statusBadge(s.status)}</TableCell>
                      <TableCell>
                        {s.pnl != null ? <span className={`text-sm font-bold ${s.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>{s.pnl > 0 ? "+" : ""}{s.pnl}%</span> : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
