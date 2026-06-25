import { useState } from "react";
import { Zap, Star, Crown, CheckCircle2, MessageCircle, Copy, ArrowRight, Loader2, Bitcoin, TrendingUp, DollarSign, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const ADMIN_WHATSAPP = "0118234849";
const ADMIN_PHONE_INTL = "254118234849";

const PLANS = [
  {
    key: "basic",
    label: "Basic",
    price: "KES 500",
    period: "/month",
    icon: Star,
    color: "text-slate-600 dark:text-slate-300",
    border: "border-slate-300 dark:border-slate-600",
    activeBorder: "border-slate-500 ring-2 ring-slate-400/40",
    bg: "bg-slate-50 dark:bg-slate-900/30",
    activeBg: "bg-slate-100 dark:bg-slate-800/60",
    highlight: false,
    signalType: "crypto",
    perks: ["Crypto signals only", "Up to 5 signals/day", "WhatsApp delivery", "Entry, TP & SL levels"],
  },
  {
    key: "premium",
    label: "Premium",
    price: "KES 1,000",
    period: "/month",
    icon: Zap,
    color: "text-yellow-600 dark:text-yellow-400",
    border: "border-yellow-400",
    activeBorder: "border-yellow-500 ring-2 ring-yellow-400/40",
    bg: "bg-yellow-50 dark:bg-yellow-900/20",
    activeBg: "bg-yellow-100 dark:bg-yellow-800/40",
    highlight: true,
    signalType: "both",
    perks: ["Crypto + Forex signals", "Up to 15 signals/day", "WhatsApp delivery", "Entry, TP & SL levels", "Market analysis notes"],
  },
  {
    key: "vip",
    label: "VIP",
    price: "KES 2,000",
    period: "/month",
    icon: Crown,
    color: "text-purple-600 dark:text-purple-400",
    border: "border-purple-400",
    activeBorder: "border-purple-500 ring-2 ring-purple-400/40",
    bg: "bg-purple-50 dark:bg-purple-900/20",
    activeBg: "bg-purple-100 dark:bg-purple-800/40",
    highlight: false,
    signalType: "both",
    perks: ["All markets, unlimited signals", "Priority WhatsApp delivery", "Detailed AI analysis", "Entry, TP & SL levels", "1-on-1 support", "Early access to new pairs"],
  },
] as const;

type PlanKey = "basic" | "premium" | "vip";

export default function Subscribe() {
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("premium");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const plan = PLANS.find(p => p.key === selectedPlan)!;
  const amount = plan.price;

  const copyNumber = () => {
    navigator.clipboard.writeText(ADMIN_WHATSAPP);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const normalizePhone = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.startsWith("0") && digits.length === 10) return "254" + digits.slice(1);
    if (digits.startsWith("254") && digits.length === 12) return digits;
    return digits;
  };

  const handleSubmit = async () => {
    if (!name.trim()) { toast({ title: "Enter your full name", variant: "destructive" }); return; }
    const normalized = normalizePhone(phone);
    if (normalized.length < 9) { toast({ title: "Enter a valid WhatsApp number", variant: "destructive" }); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/trading/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: normalized,
          plan: selectedPlan,
          signalType: plan.signalType,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save");
      }
      setDone(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-950 via-gray-950 to-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500/40 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-green-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">You're registered! 🎉</h2>
            <p className="text-green-200/70 text-sm leading-relaxed">
              Complete your activation by sending payment and proof to our WhatsApp.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-left space-y-3">
            <p className="text-xs text-green-400 font-semibold uppercase tracking-wider">Next steps</p>
            <div className="space-y-3">
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                <p className="text-white/80 text-sm">Open <strong className="text-white">M-Pesa → Send Money</strong> and send <strong className="text-green-400">{amount}</strong> to <strong className="text-white">{ADMIN_WHATSAPP}</strong></p>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                <p className="text-white/80 text-sm">WhatsApp the M-Pesa confirmation screenshot to <strong className="text-white">{ADMIN_WHATSAPP}</strong></p>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                <p className="text-white/80 text-sm">Include your name: <strong className="text-white">{name}</strong> in the message</p>
              </div>
            </div>
          </div>

          <a
            href={`https://wa.me/${ADMIN_PHONE_INTL}?text=Hi!%20I%20just%20signed%20up%20for%20the%20${encodeURIComponent(plan.label)}%20plan%20(${encodeURIComponent(amount)}%2Fmo).%20My%20name%20is%20${encodeURIComponent(name)}.%20Please%20find%20attached%20my%20M-Pesa%20proof.`}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Button className="w-full bg-green-500 hover:bg-green-600 text-white gap-2 py-6 text-base rounded-xl">
              <MessageCircle className="w-5 h-5" />
              Open WhatsApp to Send Proof
            </Button>
          </a>
          <p className="text-white/30 text-xs">You'll be activated within 30 minutes after payment confirmation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-950 via-gray-950 to-gray-900 text-white">
      {/* Hero */}
      <div className="pt-10 pb-6 px-4 text-center">
        <div className="inline-flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center">
            <Zap className="w-6 h-6 text-green-400" />
          </div>
          <span className="text-xl font-bold tracking-tight">CommandLine Signals</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">Join Trading Signals</h1>
        <p className="text-green-200/60 text-sm max-w-xs mx-auto">
          AI-powered crypto &amp; forex signals delivered to your WhatsApp daily
        </p>

        {/* Social proof */}
        <div className="flex items-center justify-center gap-4 mt-4">
          <div className="flex items-center gap-1.5 text-xs text-green-300/70">
            <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
            Trusted signals
          </div>
          <div className="flex items-center gap-1.5 text-xs text-green-300/70">
            <MessageCircle className="w-3.5 h-3.5 text-green-400" />
            WhatsApp delivery
          </div>
          <div className="flex items-center gap-1.5 text-xs text-green-300/70">
            <TrendingUp className="w-3.5 h-3.5 text-green-400" />
            70%+ win rate
          </div>
        </div>
      </div>

      <div className="px-4 pb-12 space-y-6 max-w-md mx-auto">

        {/* Plan selection */}
        <div>
          <p className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3">Choose your plan</p>
          <div className="space-y-3">
            {PLANS.map(p => {
              const active = selectedPlan === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => setSelectedPlan(p.key)}
                  className={`w-full text-left rounded-2xl border-2 p-4 transition-all relative ${
                    active
                      ? `border-current ring-2 ring-current/20 ${p.color} bg-white/5`
                      : "border-white/10 hover:border-white/20 bg-white/3"
                  }`}
                >
                  {p.highlight && (
                    <span className="absolute -top-2.5 left-4 text-[10px] font-bold bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full uppercase tracking-wide">
                      Most popular
                    </span>
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <p.icon className={`w-5 h-5 ${active ? p.color : "text-white/40"}`} />
                      <span className={`font-bold text-base ${active ? "text-white" : "text-white/70"}`}>{p.label}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-xl font-bold ${active ? p.color : "text-white/60"}`}>{p.price}</span>
                      <span className="text-white/40 text-xs">/mo</span>
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {p.perks.map(perk => (
                      <li key={perk} className="flex items-center gap-2 text-xs text-white/60">
                        <CheckCircle2 className={`w-3 h-3 flex-shrink-0 ${active ? p.color : "text-white/30"}`} />
                        {perk}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          <p className="text-xs font-semibold text-green-400 uppercase tracking-wider">Your details</p>

          <div className="space-y-1.5">
            <Label className="text-white/70 text-sm">Full Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. John Kamau"
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30 focus-visible:ring-green-500/50 focus-visible:border-green-500/50 rounded-xl py-5"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-white/70 text-sm">WhatsApp Number</Label>
            <Input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="0712 345 678 or 254712345678"
              type="tel"
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30 focus-visible:ring-green-500/50 focus-visible:border-green-500/50 rounded-xl py-5"
            />
            <p className="text-white/30 text-[11px]">Signals will be sent to this number on WhatsApp</p>
          </div>
        </div>

        {/* Payment instructions */}
        <div className="bg-green-500/8 border border-green-500/25 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-green-400 font-extrabold text-lg leading-none">M</span>
            <p className="text-xs font-semibold text-green-400 uppercase tracking-wider">M-Pesa Payment</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <div>
                <p className="text-white/80 text-sm font-medium">Send Money via M-Pesa</p>
                <p className="text-white/50 text-xs mt-0.5">Go to M-Pesa → <strong className="text-white/70">Send Money</strong></p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="bg-white/10 rounded-lg px-3 py-2 flex-1">
                    <p className="text-[10px] text-white/40 mb-0.5">Send to number</p>
                    <p className="text-white font-bold text-lg tracking-widest">{ADMIN_WHATSAPP}</p>
                  </div>
                  <button onClick={copyNumber} className="bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 transition-colors flex flex-col items-center gap-0.5">
                    <Copy className="w-4 h-4 text-white/60" />
                    <span className="text-[9px] text-white/40">{copied ? "Copied!" : "Copy"}</span>
                  </button>
                </div>
                <div className="mt-2 bg-white/5 rounded-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-white/50 text-xs">Amount to send</span>
                  <span className="text-green-400 font-bold">{amount}</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <div>
                <p className="text-white/80 text-sm font-medium">Send Proof on WhatsApp</p>
                <p className="text-white/50 text-xs mt-0.5">
                  Screenshot your M-Pesa confirmation and send it to{" "}
                  <strong className="text-white">{ADMIN_WHATSAPP}</strong> on WhatsApp with your name
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="space-y-3">
          <Button
            onClick={handleSubmit}
            disabled={loading || !name.trim() || !phone.trim()}
            className="w-full bg-green-500 hover:bg-green-600 text-white gap-2 py-6 text-base rounded-xl font-semibold disabled:opacity-40"
          >
            {loading
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Registering…</>
              : <><ArrowRight className="w-5 h-5" /> Register &amp; Get Payment Details</>
            }
          </Button>
          <p className="text-center text-white/25 text-[11px]">
            By registering you agree to receive trading signals on WhatsApp. Past performance does not guarantee future results.
          </p>
        </div>

        {/* Market badges */}
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {[
            { icon: Bitcoin, label: "Bitcoin" },
            { icon: TrendingUp, label: "Ethereum" },
            { icon: DollarSign, label: "Forex" },
            { icon: Zap, label: "Altcoins" },
          ].map(m => (
            <span key={m.label} className="flex items-center gap-1.5 text-[11px] text-white/30 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
              <m.icon className="w-3 h-3" />
              {m.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
