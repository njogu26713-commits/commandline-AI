import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import NotFound from "@/pages/not-found";

import Layout from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import AiBuilder from "@/pages/ai-builder";
import Deployments from "@/pages/deployments";
import Trading from "@/pages/trading";
import Profile from "@/pages/profile";
import Settings from "@/pages/settings";
import Brokers from "@/pages/brokers";
import Subscribe from "@/pages/subscribe";
import TradingAccounts from "@/pages/trading-accounts";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Trading} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/ai-analyst" component={AiBuilder} />
      <Route path="/deployments" component={Deployments} />
      <Route path="/profile" component={Profile} />
      <Route path="/settings" component={Settings} />
      <Route path="/brokers" component={Brokers} />
      <Route path="/trading-accounts" component={TradingAccounts} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Switch>
              {/* Public signup page — no sidebar */}
              <Route path="/subscribe" component={Subscribe} />
              {/* All other pages use the sidebar layout */}
              <Route>
                <Layout>
                  <AppRoutes />
                </Layout>
              </Route>
            </Switch>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
