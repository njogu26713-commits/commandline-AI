import { useState, useRef, useEffect } from "react";
import {
  useListAiSessions,
  useGetAiMessages,
  useCreateAiSession,
  useSendAiMessage,
  getListAiSessionsQueryKey,
  getGetAiMessagesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Plus, MessageSquare, Send, TrendingUp, BarChart2, Zap, RefreshCw } from "lucide-react";
import { PageTransition } from "@/components/page-transition";

const QUICK_PROMPTS = [
  { label: "BTC Analysis", prompt: "Analyze Bitcoin right now. Should I buy or sell? Give me entry, TP and SL levels.", icon: "₿" },
  { label: "ETH Signal", prompt: "Give me a trading signal for Ethereum with current market conditions.", icon: "Ξ" },
  { label: "Market Overview", prompt: "Give me a quick overview of the current crypto market — BTC, ETH, SOL. What's the sentiment?", icon: "📊" },
  { label: "Best Signal Now", prompt: "Which crypto pair has the strongest signal right now? Scan BTC, ETH, SOL and BNB and give me the best trade.", icon: "🎯" },
  { label: "Risk Check", prompt: "I'm thinking of buying BTC. What's the current risk level and what should my stop-loss be?", icon: "⚠️" },
  { label: "SOL Trade", prompt: "Analyze Solana and give me a precise entry, take profit and stop loss for today.", icon: "◎" },
];

function formatMessage(content: string) {
  const lines = content.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("## ")) return <h3 key={i} className="font-bold text-sm mt-3 mb-1">{line.slice(3)}</h3>;
    if (line.startsWith("# "))  return <h2 key={i} className="font-bold text-base mt-3 mb-1">{line.slice(2)}</h2>;
    if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="font-semibold">{line.slice(2, -2)}</p>;

    // Inline bold
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((p, j) =>
      p.startsWith("**") && p.endsWith("**")
        ? <strong key={j}>{p.slice(2, -2)}</strong>
        : p
    );

    if (line.startsWith("- ") || line.startsWith("• ")) {
      return <li key={i} className="ml-4 list-disc">{rendered.slice(1)}</li>;
    }
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return <p key={i}>{rendered}</p>;
  });
}

export default function AiAnalyst() {
  const queryClient = useQueryClient();
  const { data: sessions, isLoading: sessionsLoading } = useListAiSessions();
  const createSession = useCreateAiSession();
  const sendMessage = useSendAiMessage();

  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeSessionId && sessions?.length) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  const { data: messages, isLoading: messagesLoading } = useGetAiMessages(activeSessionId || 0, {
    query: { enabled: !!activeSessionId, queryKey: getGetAiMessagesQueryKey(activeSessionId || 0) }
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sendMessage.isPending]);

  const handleNewSession = () => {
    createSession.mutate({ data: { title: "Market Analysis" } }, {
      onSuccess: (newSession) => {
        queryClient.invalidateQueries({ queryKey: getListAiSessionsQueryKey() });
        setActiveSessionId(newSession.id);
      }
    });
  };

  const send = (text: string) => {
    if (!text.trim() || !activeSessionId || sendMessage.isPending) return;
    setInput("");

    const previousMessages = queryClient.getQueryData(getGetAiMessagesQueryKey(activeSessionId)) as any[] | undefined;
    if (previousMessages) {
      queryClient.setQueryData(getGetAiMessagesQueryKey(activeSessionId), [
        ...previousMessages,
        { id: Date.now(), sessionId: activeSessionId, role: "user", content: text, createdAt: new Date().toISOString() }
      ]);
    }

    sendMessage.mutate({ id: activeSessionId, data: { content: text } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAiMessagesQueryKey(activeSessionId) });
        queryClient.invalidateQueries({ queryKey: getListAiSessionsQueryKey() });
      },
      onError: () => {
        queryClient.invalidateQueries({ queryKey: getGetAiMessagesQueryKey(activeSessionId) });
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const isEmpty = !messages?.length && !sendMessage.isPending;

  return (
    <PageTransition className="flex h-[calc(100vh-8rem)] bg-background border rounded-xl overflow-hidden shadow-sm">
      {/* Sidebar — hidden on mobile */}
      <div className="hidden md:flex w-72 border-r flex-col bg-muted/30">
        <div className="p-4 border-b">
          <Button onClick={handleNewSession} className="w-full justify-start gap-2" variant="outline" disabled={createSession.isPending}>
            <Plus className="w-4 h-4" /> New Analysis
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {sessionsLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {sessions?.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    activeSessionId === session.id
                      ? "bg-green-500/10 text-green-600 dark:text-green-400 font-medium"
                      : "hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span className="flex-1 truncate">{session.title}</span>
                  {session.messageCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">{session.messageCount}</Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Live data badge */}
        <div className="p-3 border-t">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted rounded-lg px-3 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live Binance data · Gemini AI
          </div>
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col bg-card">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <div className="font-semibold text-sm">CommandLine AI Analyst</div>
              <div className="text-[10px] text-muted-foreground">Live market data · Real signals</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 text-[10px]">
              <TrendingUp className="w-3 h-3 text-green-500" /> Crypto
            </Badge>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <BarChart2 className="w-3 h-3 text-blue-500" /> Forex
            </Badge>
          </div>
        </div>

        {/* Mobile session bar */}
        <div className="md:hidden border-b p-2 flex gap-2">
          <Button onClick={handleNewSession} size="sm" variant="outline" className="gap-1.5 shrink-0" disabled={createSession.isPending}>
            <Plus className="w-3.5 h-3.5" /> New
          </Button>
          <select
            value={activeSessionId ?? ""}
            onChange={e => setActiveSessionId(Number(e.target.value))}
            className="flex-1 text-sm rounded-md border bg-background px-2 py-1.5 text-foreground"
          >
            {sessions?.map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>

        {activeSessionId ? (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
              {messagesLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-16 w-2/3 ml-auto rounded-2xl" />
                  <Skeleton className="h-28 w-3/4 rounded-2xl" />
                </div>
              ) : isEmpty ? (
                <div className="h-full flex flex-col items-center justify-center gap-6 py-8">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                      <Zap className="w-8 h-8 text-green-500" />
                    </div>
                    <h3 className="font-semibold">AI Market Analyst</h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      Ask me to analyze any market, generate signals, or explain trends — I'll fetch live data from Binance.
                    </p>
                  </div>

                  {/* Quick prompts */}
                  <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                    {QUICK_PROMPTS.map((qp) => (
                      <button
                        key={qp.label}
                        onClick={() => send(qp.prompt)}
                        disabled={sendMessage.isPending}
                        className="text-left p-3 rounded-xl border border-border hover:border-green-500/50 hover:bg-green-500/5 transition-all group"
                      >
                        <div className="text-base mb-1">{qp.icon}</div>
                        <div className="text-xs font-medium group-hover:text-green-600 dark:group-hover:text-green-400">{qp.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages?.map((msg) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role !== "user" && (
                      <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="w-4 h-4 text-green-500" />
                      </div>
                    )}
                    <div className={`max-w-[78%] p-3.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted rounded-tl-sm border"
                    }`}>
                      {msg.role === "user"
                        ? <p className="whitespace-pre-wrap">{msg.content}</p>
                        : <div className="space-y-0.5">{formatMessage(msg.content)}</div>
                      }
                    </div>
                    {msg.role === "user" && (
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-1">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                ))
              )}

              {sendMessage.isPending && (
                <div className="flex gap-3 justify-start">
                  <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="p-3.5 rounded-2xl bg-muted rounded-tl-sm border flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-green-500 animate-spin" />
                    <span className="text-xs text-muted-foreground">Fetching live data & analyzing…</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 bg-card border-t">
              <form onSubmit={handleSubmit} className="relative flex items-center max-w-4xl mx-auto">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about BTC, ETH, market trends, or request a signal…"
                  className="pr-12 py-5 rounded-xl bg-background border-border focus-visible:ring-green-500/50"
                  disabled={sendMessage.isPending}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="absolute right-2 h-8 w-8 rounded-lg bg-green-600 hover:bg-green-700"
                  disabled={!input.trim() || sendMessage.isPending}
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </form>
              <p className="text-center mt-2 text-[10px] text-muted-foreground">
                AI uses live Binance prices. Always manage your risk — never risk more than 1–2% per trade.
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <Bot className="w-10 h-10 opacity-30" />
            <p className="text-sm">Create a new analysis session to start</p>
            <Button onClick={handleNewSession} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" /> New Analysis
            </Button>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
