import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Battery, Home as HomeIcon, Zap, Grid3x3, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { E3dcLiveData, Settings } from "@shared/schema";
import EnergyFlowDiagram from "@/components/EnergyFlowDiagram";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function E3dcPage() {
  // Lade Settings um zu prüfen ob E3DC IP konfiguriert ist
  const { data: settings, isLoading: isLoadingSettings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  // Lade E3DC Live-Daten
  const { data: e3dcData, isLoading, error, refetch } = useQuery<E3dcLiveData>({
    queryKey: ["/api/e3dc/live-data"],
    refetchInterval: 5000, // Aktualisiere alle 5 Sekunden
    enabled: !!settings?.e3dcIp, // Nur abfragen wenn E3DC IP konfiguriert ist
  });

  // Settings werden noch geladen
  if (isLoadingSettings) {
    return (
      <div className="flex flex-col h-screen pb-16 overflow-y-auto">
        <header className="sticky top-0 z-40 bg-card border-b border-card-border">
          <div className="flex items-center gap-3 p-4">
            <img src="/apple-touch-icon.png" alt="EnergyLink" className="w-10 h-10 rounded-lg" />
            <h1 className="text-xl font-semibold">E3DC Energie</h1>
          </div>
        </header>

        <main className="flex-1 p-4 space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // E3DC IP nicht konfiguriert (nur prüfen NACH dem Settings-Load)
  if (!settings?.e3dcIp) {
    return (
      <div className="flex flex-col h-screen pb-16 overflow-y-auto">
        <header className="sticky top-0 z-40 bg-card border-b border-card-border">
          <div className="flex items-center gap-3 p-4">
            <img src="/apple-touch-icon.png" alt="EnergyLink" className="w-10 h-10 rounded-lg" />
            <h1 className="text-xl font-semibold">E3DC Energie</h1>
          </div>
        </header>

        <main className="flex-1 p-4 flex items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="w-5 h-5" />
                <CardTitle>E3DC nicht konfiguriert</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Bitte konfigurieren Sie die IP-Adresse Ihres E3DC S10 in den Einstellungen,
                um Live-Daten über Modbus TCP anzuzeigen.
              </p>
              <Link href="/settings" data-testid="link-go-to-settings">
                <Button className="w-full" data-testid="button-go-to-settings">
                  Zu den Einstellungen
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Fehler beim Laden
  if (error) {
    return (
      <div className="flex flex-col h-screen pb-16 overflow-y-auto">
        <header className="sticky top-0 z-40 bg-card border-b border-card-border">
          <div className="flex items-center gap-3 p-4">
            <img src="/apple-touch-icon.png" alt="EnergyLink" className="w-10 h-10 rounded-lg" />
            <h1 className="text-xl font-semibold">E3DC Energie</h1>
          </div>
        </header>

        <main className="flex-1 p-4 flex items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-5 h-5" />
                <CardTitle>Verbindungsfehler</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Verbindung zum E3DC S10 ({settings.e3dcIp}) fehlgeschlagen.
              </p>
              <p className="text-xs text-muted-foreground">
                Fehler: {error instanceof Error ? error.message : String(error)}
              </p>
              <Button onClick={() => refetch()} className="w-full" data-testid="button-retry">
                Erneut versuchen
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen pb-16 overflow-y-auto">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-card-border">
        <div className="flex items-center gap-3 p-4">
          <img src="/apple-touch-icon.png" alt="EnergyLink" className="w-10 h-10 rounded-lg" />
          <h1 className="text-xl font-semibold">E3DC Energie</h1>
        </div>
      </header>

      <main className="flex-1 p-4 space-y-4">
        {/* Energieflussdiagramm */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Energiefluss</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-32 w-full" />
              </div>
            ) : e3dcData ? (
              <EnergyFlowDiagram data={e3dcData} />
            ) : null}
          </CardContent>
        </Card>

        {/* Leistungswerte */}
        <div className="grid grid-cols-2 gap-3">
          {/* PV-Leistung */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                <CardTitle className="text-sm">PV-Leistung</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : e3dcData ? (
                <div className="text-2xl font-bold" data-testid="text-pv-power">
                  {(e3dcData.pvPower / 1000).toFixed(1)} kW
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Batterie */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Battery className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm">Batterie</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : e3dcData ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold" data-testid="text-battery-soc">{e3dcData.batterySoc}%</span>
                  <span className="text-sm text-muted-foreground" data-testid="text-battery-power">
                    {e3dcData.batteryPower < 0 ? (
                      <TrendingDown className="inline w-4 h-4 text-orange-500" />
                    ) : (
                      <TrendingUp className="inline w-4 h-4 text-green-500" />
                    )}
                    {Math.abs(e3dcData.batteryPower / 1000).toFixed(1)} kW
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Hausverbrauch */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <HomeIcon className="w-4 h-4 text-blue-500" />
                <CardTitle className="text-sm">Hausverbrauch</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : e3dcData ? (
                <div className="text-2xl font-bold" data-testid="text-house-power">
                  {(e3dcData.housePower / 1000).toFixed(1)} kW
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Netz */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Grid3x3 className="w-4 h-4 text-purple-500" />
                <CardTitle className="text-sm">Netz</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : e3dcData ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold" data-testid="text-grid-power">
                    {Math.abs(e3dcData.gridPower / 1000).toFixed(1)} kW
                  </span>
                  <span className="text-xs text-muted-foreground" data-testid="text-grid-direction">
                    {e3dcData.gridPower < 0 ? "Einspeisung" : "Bezug"}
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Effizienzwerte */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Effizienz</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <>
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </>
            ) : e3dcData ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Autarkie</span>
                  <span className="text-lg font-semibold" data-testid="text-autarky">{e3dcData.autarky}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Eigenverbrauch</span>
                  <span className="text-lg font-semibold" data-testid="text-self-consumption">{e3dcData.selfConsumption}%</span>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
