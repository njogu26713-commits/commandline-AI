import { 
  useListTradingSignals, 
  useGetTradingStats, 
  useListSubscribers, 
  useGetTradingPerformance,
  useCreateTradingSignal,
  getListTradingSignalsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area
} from "recharts";
import { TrendingUp, TrendingDown, Users, Activity, Plus, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageTransition } from "@/components/page-transition";

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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Skeleton className="col-span-4 h-[400px]" />
        <Skeleton className="col-span-3 h-[400px]" />
      </div>
    </PageTransition>
  );

  return (
    <PageTransition className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Trading Bot</h1>
          <p className="text-muted-foreground">Manage algorithmic trading signals and monetization.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"><Plus className="w-4 h-4" /> Broadcast Signal</Button>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 border-indigo-500/20 shadow-md">
          <CardHeader>
            <CardTitle>Performance History</CardTitle>
            <CardDescription>AI Model win rate & PNL over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performance ?? []}>
                  <defs>
                    <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    yAxisId="left"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  />
                  <Area 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="pnl" 
                    stroke="#6366f1" 
                    strokeWidth={2}
                    fill="url(#colorPnl)" 
                    name="Cumulative PNL %"
                  />
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
            <div className="space-y-4">
              {signals?.slice(0, 5).map(signal => (
                <div key={signal.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-md ${signal.direction === 'BUY' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      {signal.direction === 'BUY' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        {signal.pair}
                        <Badge variant="outline" className="text-[10px] font-normal h-4 px-1">{signal.confidence}% AI</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">Entry: {signal.entryPrice}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={signal.status === 'won' ? 'default' : signal.status === 'lost' ? 'destructive' : 'secondary'} 
                           className={signal.status === 'won' ? 'bg-green-500 hover:bg-green-600' : ''}>
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
              {subscribers?.map(sub => (
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
                      <div className={`w-2 h-2 rounded-full ${sub.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></div>
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