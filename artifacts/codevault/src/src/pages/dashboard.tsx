import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/page-transition";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import {
  Activity, TrendingUp, Zap, DollarSign, Bot, Clock,
  CheckCircle2, XCircle, AlertCircle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Signal {
  id: number; pair: string; direction: string; entryPrice: number;
  targetPrice: number; stopLoss: number; confidence: number;
  status: string; pnl: number | null; category: string; createdAt: string;
}
interface BotLog { time: string; message: string; type: "info" | "signal" | "skip" | "error"; }
interface Stats {
  totalSignals: number; winRate: number; activeSubscribers: number;
  monthlyRevenue: number; totalPnl: number; closedSignals: number;
}

function useSignals() {
  return useQuery<Signal[]>({
    queryKey: ["signals-analytics"],
    queryFn: () => fetch("/api/trading/signals").then(r => r.json()),
    refetchInterval: 15000,
  });
}
function useStats() {
  return useQuery<Stats>({
    queryKey: ["stats-analytics"],
    queryFn: () => fetch("/api/trading/stats").then(r => r.json()),
    refetchInterval: 30000,
  });
}
function useBotLogs() {
  return useQuery<BotLog[]>({
    queryKey: ["bot-logs"],
    queryFn: () => fetch("/api/bot/logs").then(r => r.json()),
    refetchInterval: 3000,
  });
}

function logIcon(type: BotLog["type"]) {
  if (type === "signal") return <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />;
  if (type === "skip")   return <AlertCircle  className="w-3 h-3 text-yellow-500 mt-0.5 flex-shrink-0" />;
  if (type === "error")  return <XCircle      className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />;
  return <Clock className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />;
}

function logBg(type: BotLog["type"]) {
  if (type === "signal") return "bg-green-500/10 border border-green-500/20";
  if (type === "skip")   return "bg-yellow-500/10 border border-yellow-500/20";
  if (type === "error")  return "bg-red-500/10 border border-red-500/20";
  return "bg-muted/40";
}

export default function Analytics() {
  const { data: signals = [], isLoading: sigsLoading } = useSignals();
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: logs = [], refetch: refetchLogs } = useBotLogs();

  const byPair: Record<string, { won: number; lost: number; active: number }> = {};
  for (const s of signals) {
    if (!byPair[s.pair]) byPair[s.pair] = { won: 0, lost: 0, active: 0 };
    if (s.status === "won") byPair[s.pair].won++;
    else if (s.status === "lost") byPair[s.pair].lost++;
    else byPair[s.pair].active++;
  }
  const pairData = Object.entries(byPair)
    .map(([pair, d]) => ({ pair, ...d, total: d.won + d.lost + d.active }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const closed = signals.filter(s => ["won", "lost"].includes(s.status)).slice(0, 15).reverse();
  const timelineData = closed.map((s, i) => ({
    n: i + 1,
    confidence: s.confidence,
    pnl: s.pnl ?? (s.status === "won" ? 2 : -1),
    pair: s.pair,
  }));

  const recent = [...signals].slice(0, 25);

  return (
    <PageTransition className="space-y-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="w-6 h-6 text-green-500" /> Analytics
        </h1>
        <p className="text-sm text-muted-foreground">Signal performance, bot activity and revenue overview</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statsLoading ? (
          [1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)
        ) : [
          { label: "Win Rate", value: `${stats?.winRate ?? 0}%`, sub: `${stats?.closedSignals ?? 0} closed signals`, icon: TrendingUp, color: "text-green-500" },
          { label: "Total Signals", value: stats?.totalSignals ?? 0, sub: "All-time signals sent", icon: Zap, color: "text-indigo-500" },
          { label: "Subscribers", value: stats?.activeSubscribers ?? 0, sub: "Active WhatsApp subs", icon: Activity, color: "text-blue-500" },
          { label: "Monthly Revenue", value: `KES ${(stats?.monthlyRevenue ?? 0).toLocaleString()}`, sub: "MRR from subscriptions", icon: DollarSign, color: "text-yellow-500" },
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

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Bot Analysis Log */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="w-4 h-4 text-indigo-500" /> AI Analysis Log
                </CardTitle>
                <CardDescription>Live feed of bot market analysis</CardDescription>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetchLogs()}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Bot className="w-8 h-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No analysis logs yet.</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Start the bot on the Signals page to see live AI analysis here.</p>
                </div>
              ) : logs.map((log) => (
                <div key={log.time} className={`flex items-start gap-2 px-2.5 py-1.5 rounded text-xs ${
                  log.type === "signal" ? "bg-green-500/10 border border-green-500/20 log-entry-signal" :
                  log.type === "skip"   ? "bg-yellow-500/10 border border-yellow-500/20 log-entry-skip" :
                  log.type === "error"  ? "bg-red-500/10 border border-red-500/20 log-entry-error" :
                  "bg-muted/40 log-entry"
                }`}>
                  {logIcon(log.type)}
                  <span className="flex-1 font-mono leading-relaxed">{log.message}</span>
                  <span className="text-muted-foreground whitespace-nowrap flex-shrink-0">
                    {new Date(log.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Signals by pair */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-green-500" /> Signals by Pair
            </CardTitle>
            <CardDescription>Win / Loss / Active breakdown per pair</CardDescription>
          </CardHeader>
          <CardContent>
            {sigsLoading ? <Skeleton className="h-56 w-full" /> : pairData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No signals yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={pairData} barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="pair" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontSize: 11 }}
                  />
                  <Bar dataKey="won"    stackId="a" fill="#22c55e" name="Won"    radius={[0,0,0,0]} />
                  <Bar dataKey="lost"   stackId="a" fill="#ef4444" name="Lost"   radius={[0,0,0,0]} />
                  <Bar dataKey="active" stackId="a" fill="#6366f1" name="Active" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* PNL timeline */}
      {timelineData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" /> PNL Timeline
            </CardTitle>
            <CardDescription>Profit/loss percentage on closed signals</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="n" tick={{ fontSize: 10 }} label={{ value: "Signal #", position: "insideBottom", offset: -2, fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                <Tooltip
                  formatter={(v: any) => [`${v}%`, "PNL"]}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontSize: 11 }}
                />
                <Area type="monotone" dataKey="pnl" stroke="#22c55e" fill="url(#pnlGrad)" dot={{ r: 3, fill: "#22c55e" }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Signal history table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" /> Full Signal History
          </CardTitle>
          <CardDescription>All AI-generated signals and their outcomes</CardDescription>
        </CardHeader>
        <CardContent>
          {sigsLoading ? <Skeleton className="h-40 w-full" /> : (
            <div className="space-y-0.5">
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No signals yet. Go to the Signals page and generate or start the bot.</p>
              ) : recent.map(s => (
                <div key={s.id} className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted/50 text-xs border-b border-border/40 last:border-0">
                  <span className={`font-bold w-10 ${s.direction === "BUY" ? "text-green-500" : "text-red-500"}`}>{s.direction}</span>
                  <span className="font-mono font-semibold w-20">{s.pair}</span>
                  <span className="hidden sm:inline text-muted-foreground w-24 font-mono">
                    {s.entryPrice >= 1000 ? s.entryPrice.toLocaleString("en-US", { maximumFractionDigits: 2 }) : s.entryPrice.toFixed(4)}
                  </span>
                  <span className="hidden sm:inline text-muted-foreground w-12">{s.confidence}%</span>
                  <div className="flex-1">
                    {s.status === "won"    && <Badge className="bg-green-500/10 text-green-500 border-green-500/30 text-[10px] h-5">✅ WON {s.pnl ? `+${s.pnl}%` : ""}</Badge>}
                    {s.status === "lost"   && <Badge className="bg-red-500/10 text-red-500 border-red-500/30 text-[10px] h-5">❌ LOST {s.pnl ? `${s.pnl}%` : ""}</Badge>}
                    {s.status === "active" && <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/30 text-[10px] h-5 animate-pulse">🔵 ACTIVE</Badge>}
                  </div>
                  <span className="text-muted-foreground/70 w-12 text-right">
                    {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
