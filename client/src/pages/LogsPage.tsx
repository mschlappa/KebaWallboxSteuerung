import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LogEntry, LogSettings, LogLevel, Settings } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Filter, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type LogCategory = "wallbox" | "wallbox-mock" | "e3dc" | "e3dc-mock" | "fhem" | "fhem-mock" | "webhook" | "system";

const ALL_CATEGORIES: LogCategory[] = ["wallbox", "wallbox-mock", "e3dc", "e3dc-mock", "fhem", "fhem-mock", "webhook", "system"];

export default function LogsPage() {
  const { toast } = useToast();
  const [filterLevel, setFilterLevel] = useState<LogLevel | "all">("all");
  const [selectedCategories, setSelectedCategories] = useState<LogCategory[]>([]);

  const { data: logs = [], isLoading: logsLoading, refetch } = useQuery<LogEntry[]>({
    queryKey: ["/api/logs"],
    refetchInterval: 2000,
  });

  const { data: logSettings } = useQuery<LogSettings>({
    queryKey: ["/api/logs/settings"],
  });

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const updateLogLevelMutation = useMutation({
    mutationFn: (level: LogLevel) => apiRequest("POST", "/api/logs/settings", { level }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs/settings"] });
      toast({
        title: "Log-Level aktualisiert",
        description: "Die Einstellung wurde gespeichert.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Log-Level konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  const clearLogsMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/logs"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
      toast({
        title: "Logs gelöscht",
        description: "Alle Log-Einträge wurden entfernt.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Logs konnten nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  const filteredLogs = logs
    .filter((log) => filterLevel === "all" || log.level === filterLevel)
    .filter((log) => selectedCategories.length === 0 || selectedCategories.includes(log.category as LogCategory))
    .reverse();

  const toggleCategory = (category: LogCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const getCategoryLabel = (category: LogCategory): string => {
    switch (category) {
      case "wallbox": return "Wallbox";
      case "wallbox-mock": return "Wallbox Mock";
      case "e3dc": return "E3DC";
      case "e3dc-mock": return "E3DC Mock";
      case "fhem": return "FHEM";
      case "fhem-mock": return "FHEM Mock";
      case "webhook": return "Webhook";
      case "system": return "System";
    }
  };

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case "debug":
        return "bg-muted text-muted-foreground";
      case "info":
        return "bg-primary text-primary-foreground";
      case "warning":
        return "bg-yellow-500 text-white dark:bg-yellow-600";
      case "error":
        return "bg-destructive text-destructive-foreground";
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "wallbox":
        return "bg-blue-500 text-white dark:bg-blue-600";
      case "wallbox-mock":
        return "bg-blue-400 text-white dark:bg-blue-500";
      case "e3dc":
        return "bg-orange-500 text-white dark:bg-orange-600";
      case "e3dc-mock":
        return "bg-orange-400 text-white dark:bg-orange-500";
      case "fhem":
        return "bg-teal-500 text-white dark:bg-teal-600";
      case "fhem-mock":
        return "bg-teal-400 text-white dark:bg-teal-500";
      case "webhook":
        return "bg-green-500 text-white dark:bg-green-600";
      case "system":
        return "bg-purple-500 text-white dark:bg-purple-600";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto pb-24 pt-6">
        <div className="max-w-4xl mx-auto px-4 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src="/apple-touch-icon.png" alt="EnergyLink" className="w-10 h-10 rounded-lg" />
              <h1 className="text-2xl font-bold mb-0">Logs</h1>
            </div>
            {settings?.demoMode && (
              <Badge variant="secondary" className="text-xs shrink-0" data-testid="badge-demo-mode">
                Demo
              </Badge>
            )}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Log-Level</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2">
                <Select
                  value={logSettings?.level || "info"}
                  onValueChange={(value) => updateLogLevelMutation.mutate(value as LogLevel)}
                  data-testid="select-log-level"
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debug">Debug (alle Meldungen)</SelectItem>
                    <SelectItem value="info">Info (Standard)</SelectItem>
                    <SelectItem value="warning">Warning (Warnungen)</SelectItem>
                    <SelectItem value="error">Error (nur Fehler)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Bestimmt welche Log-Meldungen aufgezeichnet werden
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Filter</span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => refetch()}
                    data-testid="button-refresh-logs"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => clearLogsMutation.mutate()}
                    disabled={clearLogsMutation.isPending}
                    data-testid="button-clear-logs"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm text-muted-foreground">Level</label>
                <Select
                  value={filterLevel}
                  onValueChange={(value) => setFilterLevel(value as LogLevel | "all")}
                  data-testid="select-filter-level"
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle</SelectItem>
                    <SelectItem value="debug">Debug</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-muted-foreground">
                    Kategorien ({selectedCategories.length > 0 ? selectedCategories.length : 'Alle'})
                  </label>
                  {selectedCategories.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedCategories([])}
                      className="h-6 text-xs"
                      data-testid="button-clear-category-filter"
                    >
                      Alle auswählen
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALL_CATEGORIES.map((category) => {
                    const isSelected = selectedCategories.includes(category);
                    return (
                      <Badge
                        key={category}
                        className={`cursor-pointer transition-all ${
                          isSelected
                            ? getCategoryColor(category)
                            : 'bg-muted text-muted-foreground hover-elevate'
                        }`}
                        onClick={() => toggleCategory(category)}
                        data-testid={`badge-filter-${category}`}
                      >
                        {getCategoryLabel(category)}
                      </Badge>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Klicke auf Kategorien um sie zu filtern. Ohne Auswahl werden alle angezeigt.
                </p>
              </div>
            </CardContent>
          </Card>

          {filteredLogs.length === 0 && !logsLoading && (
            <Alert data-testid="alert-no-logs">
              <Filter className="h-4 w-4" />
              <AlertDescription>
                Keine Log-Einträge vorhanden. Sobald die Wallbox abgefragt wird oder Webhooks aufgerufen werden, erscheinen hier die Logs.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            {filteredLogs.map((log) => (
              <Card key={log.id} className="overflow-hidden" data-testid={`log-entry-${log.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={getLevelColor(log.level)} data-testid={`badge-level-${log.level}`}>
                          {log.level.toUpperCase()}
                        </Badge>
                        <Badge className={getCategoryColor(log.category)} data-testid={`badge-category-${log.category}`}>
                          {log.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground" data-testid={`text-timestamp-${log.id}`}>
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm font-medium" data-testid={`text-message-${log.id}`}>
                        {log.message}
                      </p>
                      {log.details && (
                        <p className="text-xs text-muted-foreground font-mono break-all" data-testid={`text-details-${log.id}`}>
                          {log.details}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {logsLoading && filteredLogs.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              Lade Logs...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
