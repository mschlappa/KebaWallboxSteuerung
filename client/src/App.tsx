import { Switch, Route } from "wouter";
import { useEffect } from "react";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider, useMutation } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import StatusPage from "@/pages/StatusPage";
import ControlsPage from "@/pages/ControlsPage";
import SettingsPage from "@/pages/SettingsPage";
import LogsPage from "@/pages/LogsPage";
import BottomNav from "@/components/BottomNav";
import type { ControlState } from "@shared/schema";

function Router() {
  return (
    <Switch>
      <Route path="/" component={StatusPage} />
      <Route path="/steuerung" component={ControlsPage} />
      <Route path="/logs" component={LogsPage} />
      <Route path="/einstellungen" component={SettingsPage} />
    </Switch>
  );
}

function AppContent() {
  const syncControlsMutation = useMutation({
    mutationFn: async (): Promise<ControlState> => {
      const response = await apiRequest("POST", "/api/controls/sync", {});
      return response.json();
    },
    onSuccess: (data: ControlState) => {
      queryClient.setQueryData(["/api/controls"], data);
    },
    onError: () => {
      // Stille Fehlerbehandlung für Hintergrund-Synchronisation
    },
  });

  useEffect(() => {
    // Initialer Sync beim App-Start
    syncControlsMutation.mutate();

    // Regelmäßige Synchronisation alle 10 Sekunden
    const interval = setInterval(() => {
      syncControlsMutation.mutate();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

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
