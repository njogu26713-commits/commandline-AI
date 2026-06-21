import { 
  useListTradingSignals, 
  useGetTradingStats, 
  useListSubscribers, 
  useGetTradingPerformance,
  useCreateTradingSignal,
  getListTradingSignalsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { 
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area
} from "recharts";
import { 
  TrendingUp, TrendingDown, Users, Activity, Plus, DollarSign,
  Bot, Zap, ShieldAlert, ScanLine, Play, Pause, RefreshCw,
  Target, AlertTriangle, BarChart2, Brain
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageTransition } from "@/components/page-transition";

const MARKET_PAIRS = [
  { pair: "BTC/USDT", price: "$67,420", change: "+2.4%", sentiment: "BULLISH", strength: 82 },
  { pair: "ETH/USDT", price: "$3,510", change: "+1.8%", sentiment: "BULLISH", strength: 74 },
  { pair: "SOL/USDT", price: "$172", change: "-0.9%", sentiment: "NEUTRAL", strength: 51 },
  { pair: "BNB/USDT", price: "$598", change: "+0.5%", sentiment: "BULLISH", strength: 63 },
  { pair: "XRP/USDT", price: "$0.62", change: "-1.2%", sentiment: "BEARISH", strength: 38 },
  { pair: "DOGE/USDT", price: "$0.18", change: "-2.1%", sentiment: "BEARISH", strength: 29 },
];

const AI_MODES = [
  { value: "conservative", label: "Conservative", desc: "Low risk, high confidence signals only (>85%)", color: "text-blue-500" },
  { value: "balanced", label: "Balanced", desc: "Moderate risk, signals above 70% confidence", color: "text-indigo-500" },
  { value: "aggressive", label: "Aggressive", desc: "Higher risk, signals from 55% confidence", color: "text-orange-500" },
];

export default function Trading() {
  const { data: stats, isLoading: statsLoading } = useGetTradingStats();
  const { data: signals, isLoading: signalsLoading } = useListTradingSignals();
  const { data: subscribers, isLoading: subscribersLoading } = useListSubscribers();
  const { data: performance, isLoading: performanceLoading } = useGetTradingPerformance();
  
  const createSignal = useCreateTradingSignal();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSignal, setNewSignal] = useState({ 
    pair: "", direction: "BUY", entryPrice: "", targetPrice: "", stopLoss: "", confidence: "80" 
  });

  // AI Bot Controls
  const [botActive, setBotActive] = useState(false);
  const [aiMode, setAiMode] = useState("balanced");
  const [autoSignals, setAutoSignals] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);

  // Risk Management
  const [maxRisk, setMaxRisk] = useState([2]);
  const [maxDailySignals, setMaxDailySignals] = useState([5]);
  const [tpMultiplier, setTpMultiplier] = useState([2]);
  const [autoSl, setAutoSl] = useState(true);
  const [compoundMode, setCompoundMode] = useState(false);

  const handleToggleBot = () => {
    const next = !botActive;
    setBotActive(next);
    toast({
      title: next ? "🟢 AI Bot Activated" : "🔴 AI Bot Paused",
      description: next
        ? `Running in ${aiMode} mode. Scanning markets for signals.`
        : "Bot paused. No new signals will be auto-generated.",
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

  const handleAutoSignalToggle = (val: boolean) => {
    setAutoSignals(val);
    toast({
      title: val ? "Auto-Signal ON" : "Auto-Signal OFF",
      description: val
        ? "AI will automatically broadcast signals when setups are detected."
        : "Auto-broadcast disabled. Signals require manual approval.",
    });
  };

  const handleCreate = () => {
    if (!newSignal.pair || !newSignal.entryPrice) return;
    createSignal.mutate({ data: {
      pair: newSignal.pair,
      direction: newSignal.direction,
      entryPrice: parseFloat(newSignal.entryPrice),
      targetPrice: parseFloat(newSignal.targetPrice),
      stopLoss: parseFloat(newSignal.stopLoss),
      confidence: parseInt(newSignal.confidence, 10)
    }}, {
      onSuccess: () => {
        setIsCreateOpen(false);
        setNewSignal({ pair: "", direction: "BUY", entryPrice: "", targetPrice: "", stopLoss: "", confidence: "80" });
        queryClient.invalidateQueries({ queryKey: getListTradingSignalsQueryKey() });
        toast({ title: "Signal broadcasted successfully" });
      }
    });
  };

  const isLoading = statsLoading || signalsLoading || subscribersLoading || performanceLoading;

  if (isLoading) return (
    <PageTransition className="space-y-6 max-w-7xl mx-auto">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
    </PageTransition>
  );

  const selectedMode = AI_MODES.find(m => m.value === aiMode)!;

  return (
    <PageTransition className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Trading Bot</h1>
          <p className="text-muted-foreground">CommandLine AI — algorithmic signal engine & monetization.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="w-4 h-4" /> Broadcast Signal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Broadcast New Signal</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Asset Pair</Label>
                  <Input placeholder="BTC/USDT" value={newSignal.pair} onChange={e => setNewSignal({...newSignal, pair: e.target.value.toUpperCase()})} />
                </div>
                <div className="space-y-2">
                  <Label>Direction</Label>
                  <Select value={newSignal.direction} onValueChange={v => setNewSignal({...newSignal, direction: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BUY" className="text-green-600 font-bold">BUY (Long)</SelectItem>
                      <SelectItem value="SELL" className="text-red-600 font-bold">SELL (Short)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Entry Price</Label>
                  <Input type="number" step="any" value={newSignal.entryPrice} onChange={e => setNewSignal({...newSignal, entryPrice: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Target (TP)</Label>
                  <Input type="number" step="any" value={newSignal.targetPrice} onChange={e => setNewSignal({...newSignal, targetPrice: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Stop Loss (SL)</Label>
                  <Input type="number" step="any" value={newSignal.stopLoss} onChange={e => setNewSignal({...newSignal, stopLoss: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>AI Confidence (%)</Label>
                <Input type="number" min="0" max="100" value={newSignal.confidence} onChange={e => setNewSignal({...newSignal, confidence: e.target.value})} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createSignal.isPending || !newSignal.pair || !newSignal.entryPrice}>
                Broadcast
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
            <div className={`text-2xl font-bold ${(stats?.totalPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {(stats?.totalPnl || 0) > 0 ? '+' : ''}{stats?.totalPnl ?? 0}%
            </div>
            <p className="text-xs text-muted-foreground">Cumulative performance</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subscribers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeSubscribers ?? 0}</div>
            <p className="text-xs text-muted-foreground">Receiving real-time alerts</p>
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

      {/* AI Bot Control Panel */}
      <Card className={`border-2 transition-colors ${botActive ? 'border-green-500/40 bg-green-500/5' : 'border-border'}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${botActive ? 'bg-green-500/10' : 'bg-muted'}`}>
                <Bot className={`w-5 h-5 ${botActive ? 'text-green-500' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  AI Bot Controls
                  {botActive && (
                    <span className="flex items-center gap-1 text-xs font-normal text-green-500">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      LIVE
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  {botActive ? `Running in ${selectedMode.label} mode` : "Bot is paused — no signals being generated"}
                </CardDescription>
              </div>
            </div>
            <Button
              onClick={handleToggleBot}
              className={`gap-2 ${botActive ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}
            >
              {botActive ? <><Pause className="w-4 h-4" /> Pause Bot</> : <><Play className="w-4 h-4" /> Start Bot</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* AI Mode Selector */}
          <div>
            <Label className="text-sm font-medium mb-3 block">AI Trading Mode</Label>
            <div className="grid grid-cols-3 gap-3">
              {AI_MODES.map(mode => (
                <button
                  key={mode.value}
                  onClick={() => setAiMode(mode.value)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    aiMode === mode.value
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-border hover:border-muted-foreground/50'
                  }`}
                >
                  <div className={`font-semibold text-sm ${aiMode === mode.value ? mode.color : ''}`}>{mode.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{mode.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Auto-Signal Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-yellow-500" />
              <div>
                <div className="font-medium text-sm">Auto-Broadcast Signals</div>
                <div className="text-xs text-muted-foreground">AI automatically pushes signals to subscribers when detected</div>
              </div>
            </div>
            <Switch checked={autoSignals} onCheckedChange={handleAutoSignalToggle} />
          </div>
        </CardContent>
      </Card>

      {/* Risk Management + Market Scanner */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Risk Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-indigo-500" />
              <CardTitle>AI Risk Management</CardTitle>
            </div>
            <CardDescription>Limits the AI enforces on every trade it generates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Max Risk Per Trade</Label>
                <span className="font-bold text-indigo-500">{maxRisk[0]}%</span>
              </div>
              <Slider min={0.5} max={10} step={0.5} value={maxRisk} onValueChange={setMaxRisk} />
              <p className="text-xs text-muted-foreground">AI will not broadcast a signal risking more than {maxRisk[0]}% of account</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>Max Daily Signals</Label>
                <span className="font-bold text-indigo-500">{maxDailySignals[0]}</span>
              </div>
              <Slider min={1} max={20} step={1} value={maxDailySignals} onValueChange={setMaxDailySignals} />
              <p className="text-xs text-muted-foreground">AI will stop after {maxDailySignals[0]} signals per day</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label>TP:SL Ratio</Label>
                <span className="font-bold text-indigo-500">{tpMultiplier[0]}R</span>
              </div>
              <Slider min={1} max={5} step={0.5} value={tpMultiplier} onValueChange={setTpMultiplier} />
              <p className="text-xs text-muted-foreground">Target must be {tpMultiplier[0]}x the stop loss distance</p>
            </div>

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
                  <div className="text-xs text-muted-foreground">Increase position size after wins</div>
                </div>
                <Switch checked={compoundMode} onCheckedChange={setCompoundMode} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Market Scanner */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-indigo-500" />
                <CardTitle>AI Market Scanner</CardTitle>
              </div>
              <Button variant="outline" size="sm" className="gap-2" onClick={handleScan} disabled={isScanning}>
                {isScanning
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Scanning...</>
                  : <><RefreshCw className="w-4 h-4" /> Scan Now</>
                }
              </Button>
            </div>
            <CardDescription>
              {lastScan ? `Last scan: ${lastScan}` : "AI monitoring 6 pairs for entry setups"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {MARKET_PAIRS.map((item) => (
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
                      <div className={`text-xs font-medium ${item.change.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                        {item.change}
                      </div>
                      <div className="text-xs text-muted-foreground">AI: {item.strength}%</div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        item.sentiment === 'BULLISH' ? 'border-green-500 text-green-500 text-[10px]' :
                        item.sentiment === 'BEARISH' ? 'border-red-500 text-red-500 text-[10px]' :
                        'text-[10px]'
                      }
                    >
                      {item.sentiment}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Chart + Recent Signals */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 border-indigo-500/20 shadow-md">
          <CardHeader>
            <CardTitle>Performance History</CardTitle>
            <CardDescription>AI Model win rate & PNL over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performance ?? []}>
                  <defs>
                    <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }} />
                  <Area yAxisId="left" type="monotone" dataKey="pnl" stroke="#6366f1" strokeWidth={2} fill="url(#colorPnl)" name="Cumulative PNL %" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {signals?.slice(0, 6).map((signal: any) => (
                <div key={signal.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-md ${signal.direction === 'BUY' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      {signal.direction === 'BUY' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
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
                    <Badge
                      variant={signal.status === 'won' ? 'default' : signal.status === 'lost' ? 'destructive' : 'secondary'}
                      className={signal.status === 'won' ? 'bg-green-500 hover:bg-green-600' : ''}
                    >
                      {signal.status.toUpperCase()}
                    </Badge>
                    {signal.pnl !== null && signal.pnl !== undefined && (
                      <div className={`text-xs mt-1 font-medium ${signal.pnl > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {signal.pnl > 0 ? '+' : ''}{signal.pnl}%
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
          <CardTitle>Subscribers</CardTitle>
          <CardDescription>Users receiving trading alerts via SMS/Telegram</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
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
                    <Badge variant="outline" className={sub.plan === 'pro' ? 'border-indigo-500 text-indigo-500' : ''}>
                      {sub.plan.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${sub.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
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
