import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import StatusPage from "@/pages/StatusPage";
import SettingsPage from "@/pages/SettingsPage";
import LogsPage from "@/pages/LogsPage";
import E3dcPage from "@/pages/E3dcPage";
import BottomNav from "@/components/BottomNav";

function Router() {
  return (
    <Switch>
      <Route path="/" component={StatusPage} />
      <Route path="/e3dc" component={E3dcPage} />
      <Route path="/logs" component={LogsPage} />
      <Route path="/einstellungen" component={SettingsPage} />
    </Switch>
  );
}

function AppContent() {
  return (
    <div className="flex flex-col h-screen bg-background">
      <Router />
      <BottomNav />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
