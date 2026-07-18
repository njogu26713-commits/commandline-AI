import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { PageTransition } from "@/components/page-transition";
import {
  Wifi, WifiOff, Link2, RefreshCw, Loader2, Plus, Wallet,
  TrendingUp, TrendingDown, ShieldCheck, BarChart2, Activity,
  ChevronRight, AlertCircle, CheckCircle2, X, Eye, EyeOff,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TradingAccount {
  id: number;
  platform: string;
  broker: string | null;
  accountNumber: string;
  serverName: string | null;
  status: string;
  balance: number | null;
  equity: number | null;
  margin: number | null;
  freeMargin: number | null;
  marginLevel: number | null;
  openTrades: number | null;
  profit: number | null;
  currency: string | null;
  leverage: number | null;
  lastSyncAt: string | null;
  createdAt: string;
}

// ── Platforms ─────────────────────────────────────────────────────────────────
const PLATFORMS = [
  { id: "mt5",    label: "MetaTrader 5", short: "MT5",     logo: "M5", color: "bg-blue-600",   available: true  },
  { id: "ctrader",label: "cTrader",      short: "cTrader", logo: "CT", color: "bg-cyan-600",   available: false },
  { id: "binance",label: "Binance",      short: "BNB",     logo: "B",  color: "bg-yellow-500", available: false },
  { id: "bybit",  label: "Bybit",        short: "BB",      logo: "By", color: "bg-orange-500", available: false },
];

const MT5_BROKERS = ["Exness", "IC Markets", "XM", "Pepperstone", "Tickmill", "Other"];

const BROKER_SERVERS: Record<string, string> = {
  Exness:      "Exness-MT5Real",
  "IC Markets":"ICMarketsSC-MT5-1",
  XM:          "XM.COM-MT5 1",
  Pepperstone: "Pepperstone-MT5-Real01",
  Tickmill:    "Tickmill-MT5Live",
  Other:       "",
};

// ── API hooks ─────────────────────────────────────────────────────────────────
function useAccounts() {
  return useQuery<TradingAccount[]>({
    queryKey: ["trading-accounts"],
    queryFn: () => fetch("/api/trading-accounts").then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
  });
}

function useConnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      fetch("/api/trading-accounts/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Connection failed");
        return j;
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trading-accounts"] }),
  });
}

function useSync(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetch(`/api/trading-accounts/${id}/sync`, { method: "POST" }).then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Sync failed");
        return j;
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trading-accounts"] }),
  });
}

function useDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/trading-accounts/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trading-accounts"] }),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number | null, currency = "USD") {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}
function fmtPct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(2)}%`;
}
function sinceSync(iso: string | null) {
  if (!iso) return "Never synced";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── Account card ──────────────────────────────────────────────────────────────
function AccountCard({ account }: { account: TradingAccount }) {
  const { toast } = useToast();
  const sync = useSync(account.id);
  const disconnect = useDisconnect();
  const cur = account.currency ?? "USD";
  const profit = account.profit ?? 0;
  const platform = PLATFORMS.find(p => p.id === account.platform);

  const handleSync = async () => {
    try {
      await sync.mutateAsync();
      toast({ title: "✅ Account synced", description: "Live data updated." });
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect this trading account?")) return;
    await disconnect.mutateAsync(account.id);
    toast({ title: "Account disconnected" });
  };

  return (
    <Card className="border-2 border-green-500/30 bg-green-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${platform?.color ?? "bg-blue-600"} flex items-center justify-center text-white font-bold text-sm`}>
              {platform?.logo ?? "M5"}
            </div>
            <div>
              <div className="font-bold flex items-center gap-2">
                {account.broker ?? platform?.label}
                <Badge className="bg-green-500/10 text-green-600 border-green-500/30 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1 animate-pulse inline-block" />
                  CONNECTED
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {platform?.label} · #{account.accountNumber}
                {account.serverName && ` · ${account.serverName}`}
                {account.leverage && ` · 1:${account.leverage}`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="ghost"
              onClick={handleSync} disabled={sync.isPending}
              className="text-muted-foreground hover:text-foreground"
            >
              {sync.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDisconnect} className="text-muted-foreground hover:text-destructive">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Balance hero */}
        <div className="rounded-xl bg-background border p-4">
          <div className="text-xs text-muted-foreground mb-1">Account Balance</div>
          <div className="text-3xl font-bold">{fmt(account.balance, cur)}</div>
          <div className={`text-sm mt-1 flex items-center gap-1 ${profit >= 0 ? "text-green-500" : "text-red-500"}`}>
            {profit >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {profit >= 0 ? "+" : ""}{fmt(profit, cur)} open P&L
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Equity",       value: fmt(account.equity, cur),       icon: Wallet,    color: "text-blue-500" },
            { label: "Free Margin",  value: fmt(account.freeMargin, cur),   icon: ShieldCheck,color: "text-green-500" },
            { label: "Margin Level", value: fmtPct(account.marginLevel),    icon: BarChart2,  color: "text-yellow-500" },
            { label: "Open Trades",  value: account.openTrades ?? 0,        icon: Activity,   color: "text-indigo-500" },
          ].map(m => (
            <div key={m.label} className="rounded-lg border bg-background p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">{m.label}</span>
                <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
              </div>
              <div className="text-sm font-bold">{m.value}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <RefreshCw className="w-3 h-3" />
          Last synced: {sinceSync(account.lastSyncAt)}
          <span className="ml-auto">Margin: {fmt(account.margin, cur)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Connect dialog ────────────────────────────────────────────────────────────
function ConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const connect = useConnect();
  const [step, setStep]         = useState<"platform" | "form">("platform");
  const [platform, setPlatform] = useState("mt5");
  const [broker, setBroker]     = useState("Exness");
  const [login, setLogin]       = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer]     = useState("Exness-MT5Real");
  const [showPass, setShowPass] = useState(false);

  const reset = () => { setStep("platform"); setLogin(""); setPassword(""); setBroker("Exness"); setServer("Exness-MT5Real"); setShowPass(false); };

  const handleBrokerChange = (b: string) => {
    setBroker(b);
    setServer(BROKER_SERVERS[b] ?? "");
  };

  const handleConnect = async () => {
    if (!login.trim())    return toast({ title: "MT5 login required", variant: "destructive" });
    if (!password.trim()) return toast({ title: "Trading password required", variant: "destructive" });
    try {
      await connect.mutateAsync({ platform, broker, login: login.trim(), password, server: server.trim() });
      toast({ title: "✅ Trading account connected!", description: `${broker} MT5 #${login} is now linked.` });
      reset();
      onClose();
    } catch (e: any) {
      toast({ title: "Connection failed", description: e.message, variant: "destructive" });
    }
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-green-500" />
            Connect Trading Account
          </DialogTitle>
        </DialogHeader>

        {step === "platform" ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Choose your trading platform. Your funds always stay in your broker account — CommandLine AI only reads and displays your data.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  disabled={!p.available}
                  onClick={() => { setPlatform(p.id); setStep("form"); }}
                  className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                    p.available
                      ? "hover:border-green-500 hover:bg-green-500/5 cursor-pointer"
                      : "opacity-50 cursor-not-allowed"
                  } ${platform === p.id ? "border-green-500 bg-green-500/5" : "border-border"}`}
                >
                  <div className={`w-10 h-10 ${p.color} rounded-lg flex items-center justify-center text-white font-bold text-sm mb-2`}>
                    {p.logo}
                  </div>
                  <div className="font-semibold text-sm">{p.label}</div>
                  {!p.available && (
                    <span className="absolute top-2 right-2 text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">
                      Soon
                    </span>
                  )}
                  {p.available && (
                    <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/60 text-xs text-muted-foreground">
              <ShieldCheck className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              <span>CommandLine AI <strong>never holds your funds.</strong> We connect read-only to display your account and, once authorized, can place trades — but your money always stays with your broker.</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <button onClick={() => setStep("platform")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              ← Back to platform selection
            </button>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">M5</div>
              <div>
                <div className="font-semibold text-sm">MetaTrader 5</div>
                <div className="text-xs text-muted-foreground">Use your MT5 trading account credentials</div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Broker</Label>
                <Select value={broker} onValueChange={handleBrokerChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MT5_BROKERS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>MT5 Login (Account Number)</Label>
                <Input
                  placeholder="e.g. 12345678"
                  value={login}
                  onChange={e => setLogin(e.target.value)}
                  type="number"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Trading Password</Label>
                <div className="relative">
                  <Input
                    placeholder="Your MT5 trading password"
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">Use your trading password, not your investor (read-only) password.</p>
              </div>

              <div className="space-y-1.5">
                <Label>Server Name</Label>
                <Input
                  placeholder="e.g. Exness-MT5Real"
                  value={server}
                  onChange={e => setServer(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Find this in MT5 → File → Open Account → Server list.</p>
              </div>
            </div>

            <Separator />

            <Button
              onClick={handleConnect}
              disabled={connect.isPending}
              className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              {connect.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Connecting to MT5…</>
              ) : (
                <><Wifi className="w-4 h-4" /> Connect Account</>
              )}
            </Button>

            {connect.isPending && (
              <p className="text-xs text-center text-muted-foreground">
                Verifying credentials and fetching account data…
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TradingAccounts() {
  const { data: accounts = [], isLoading } = useAccounts();
  const [showConnect, setShowConnect] = useState(false);

  return (
    <PageTransition className="space-y-6 max-w-4xl mx-auto">
      <ConnectDialog open={showConnect} onClose={() => setShowConnect(false)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Link2 className="w-6 h-6 text-green-500" /> Trading Accounts
          </h1>
          <p className="text-sm text-muted-foreground">
            Connect your broker accounts — your funds always stay with your broker.
          </p>
        </div>
        <Button onClick={() => setShowConnect(true)} className="bg-green-600 hover:bg-green-700 text-white gap-2">
          <Plus className="w-4 h-4" /> Connect Account
        </Button>
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl border bg-muted/40">
        <ShieldCheck className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <span className="font-semibold">Your money never moves.</span>{" "}
          <span className="text-muted-foreground">
            CommandLine AI connects to your broker read-only to display live account data. Once connected, the AI can place trades on your behalf — but all funds remain in your broker account at all times.
          </span>
        </div>
      </div>

      {/* Accounts list */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : accounts.length === 0 ? (
        /* Empty state */
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Wallet className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">No accounts connected</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Connect your MT5, cTrader, Binance, or Bybit account to see your live balance and let the AI trade on your behalf.
              </p>
            </div>

            {/* Platform grid in empty state */}
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {PLATFORMS.map(p => (
                <div
                  key={p.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border font-medium ${
                    p.available ? "bg-green-500/10 border-green-500/30 text-green-600" : "bg-muted border-muted text-muted-foreground"
                  }`}
                >
                  <div className={`w-4 h-4 ${p.color} rounded-sm flex items-center justify-center text-white text-[8px] font-bold`}>
                    {p.logo.charAt(0)}
                  </div>
                  {p.short}
                  {!p.available && <span className="text-[9px]">(soon)</span>}
                </div>
              ))}
            </div>

            <Button
              onClick={() => setShowConnect(true)}
              className="bg-green-600 hover:bg-green-700 text-white gap-2 mt-2"
            >
              <Plus className="w-4 h-4" /> Connect Your First Account
            </Button>

            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              Works like "Connect with Google" — connect once, stay connected
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {accounts.map(account => (
            <AccountCard key={account.id} account={account} />
          ))}
          <Button
            variant="outline"
            className="w-full gap-2 border-dashed"
            onClick={() => setShowConnect(true)}
          >
            <Plus className="w-4 h-4" /> Connect Another Account
          </Button>
        </div>
      )}
    </PageTransition>
  );
}
