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
import { Bot, User, Plus, MessageSquare, Send, Code } from "lucide-react";
import { PageTransition } from "@/components/page-transition";

export default function AiBuilder() {
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
  }, [messages]);

  const handleNewSession = () => {
    createSession.mutate({ data: { title: "New Session" } }, {
      onSuccess: (newSession) => {
        queryClient.invalidateQueries({ queryKey: getListAiSessionsQueryKey() });
        setActiveSessionId(newSession.id);
      }
    });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeSessionId) return;
    
    const content = input;
    setInput("");
    
    // Optimistically add message
    const previousMessages = queryClient.getQueryData(getGetAiMessagesQueryKey(activeSessionId)) as any[];
    if (previousMessages) {
      queryClient.setQueryData(getGetAiMessagesQueryKey(activeSessionId), [
        ...previousMessages,
        { id: Date.now(), sessionId: activeSessionId, role: "user", content, createdAt: new Date().toISOString() }
      ]);
    }

    sendMessage.mutate({ id: activeSessionId, data: { content } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAiMessagesQueryKey(activeSessionId) });
      },
      onError: () => {
        // Revert optimistic update
        queryClient.invalidateQueries({ queryKey: getGetAiMessagesQueryKey(activeSessionId) });
      }
    });
  };

  return (
    <PageTransition className="flex h-[calc(100vh-8rem)] bg-background border rounded-xl overflow-hidden shadow-sm">
      {/* Sidebar */}
      <div className="w-80 border-r flex flex-col bg-muted/30">
        <div className="p-4 border-b">
          <Button onClick={handleNewSession} className="w-full justify-start gap-2" disabled={createSession.isPending}>
            <Plus className="w-4 h-4" /> New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {sessionsLoading ? (
            <div className="p-4 space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {sessions?.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors ${
                    activeSessionId === session.id 
                      ? 'bg-primary/10 text-primary font-medium' 
                      : 'hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <div className="flex-1 truncate">{session.title}</div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-card relative">
        {activeSessionId ? (
          <>
            <div className="p-4 border-b flex items-center justify-between bg-card z-10">
              <div className="font-semibold flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                CodeVault Assistant
              </div>
              <Button variant="outline" size="sm" className="gap-2">
                <Code className="w-4 h-4" /> Current Context
              </Button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
              {messagesLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-20 w-3/4 ml-auto rounded-2xl rounded-tr-sm" />
                  <Skeleton className="h-32 w-3/4 rounded-2xl rounded-tl-sm" />
                </div>
              ) : messages?.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-8 h-8 text-primary" />
                  </div>
                  <p>How can I help you build today?</p>
                </div>
              ) : (
                messages?.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex gap-3 max-w-[80%] ${msg.role === 'user' ? 'ml-auto' : ''}`}
                  >
                    {msg.role !== 'user' && (
                      <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="w-5 h-5 text-primary" />
                      </div>
                    )}
                    
                    <div className={`p-4 rounded-2xl ${
                      msg.role === 'user' 
                        ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                        : 'bg-muted rounded-tl-sm border'
                    }`}>
                      <div className="text-sm whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </div>
                    </div>

                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-1">
                        <User className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                ))
              )}
              {sendMessage.isPending && (
                <div className="flex gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div className="p-4 rounded-2xl bg-muted rounded-tl-sm border flex items-center gap-1">
                    <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-card border-t">
              <form onSubmit={handleSendMessage} className="relative flex items-center max-w-4xl mx-auto">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask CodeVault AI to build, debug, or explain..."
                  className="pr-12 py-6 rounded-xl shadow-sm bg-background border-muted-foreground/20 focus-visible:ring-primary/50"
                  disabled={sendMessage.isPending}
                />
                <Button 
                  type="submit" 
                  size="icon" 
                  className="absolute right-2 h-9 w-9 rounded-lg"
                  disabled={!input.trim() || sendMessage.isPending}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
              <div className="text-center mt-2 text-[10px] text-muted-foreground">
                CodeVault AI can make mistakes. Verify code before deploying.
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select or create a session to start building.
          </div>
        )}
      </div>
    </PageTransition>
  );
}