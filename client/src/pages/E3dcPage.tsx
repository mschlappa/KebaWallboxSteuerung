import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Battery, Home as HomeIcon, Sun, Grid3x3, TrendingUp, TrendingDown, AlertCircle, PlugZap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { E3dcLiveData, Settings } from "@shared/schema";
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

  // Formatiere Leistungswerte: Unter 10 kW in Watt, ab 10 kW in kW
  const formatPower = (watts: number) => {
    if (watts === 0) return "0 W";
    if (Math.abs(watts) >= 10000) {
      return `${(watts / 1000).toFixed(1)} kW`;
    }
    return `${Math.round(watts)} W`;
  };

  // Settings werden noch geladen
  if (isLoadingSettings) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto pb-24 pt-6">
          <div className="max-w-2xl mx-auto px-4 space-y-6">
            <div className="flex items-center gap-3">
              <img src="/apple-touch-icon.png" alt="EnergyLink" className="w-10 h-10 rounded-lg" />
              <h1 className="text-2xl font-bold mb-0">EnergyLink Hauskraftwerk</h1>
            </div>

            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // E3DC IP nicht konfiguriert (nur prüfen NACH dem Settings-Load)
  if (!settings?.e3dcIp) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto pb-24 pt-6">
          <div className="max-w-2xl mx-auto px-4 space-y-6">
            <div className="flex items-center gap-3">
              <img src="/apple-touch-icon.png" alt="EnergyLink" className="w-10 h-10 rounded-lg" />
              <h1 className="text-2xl font-bold mb-0">EnergyLink Hauskraftwerk</h1>
            </div>

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
          </div>
        </div>
      </div>
    );
  }

  // Fehler beim Laden
  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto pb-24 pt-6">
          <div className="max-w-2xl mx-auto px-4 space-y-6">
            <div className="flex items-center gap-3">
              <img src="/apple-touch-icon.png" alt="EnergyLink" className="w-10 h-10 rounded-lg" />
              <h1 className="text-2xl font-bold mb-0">EnergyLink Hauskraftwerk</h1>
            </div>

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
          </div>
        </div>
      </div>
    );
  }

  // Berechne ob Batterie lädt oder entlädt
  const isBatteryCharging = (e3dcData?.batteryPower || 0) > 100;
  const isBatteryDischarging = (e3dcData?.batteryPower || 0) < -100;

  // Berechne Hausverbrauch ohne Wallbox
  const actualHousePower = (e3dcData?.housePower || 0) - (e3dcData?.wallboxPower || 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto pb-24 pt-6">
        <div className="max-w-2xl mx-auto px-4 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <img src="/apple-touch-icon.png" alt="EnergyLink" className="w-10 h-10 rounded-lg" />
            <h1 className="text-2xl font-bold mb-0">EnergyLink Hauskraftwerk</h1>
          </div>

          <div className="space-y-4">
            {/* Hausbatterie - Große Kachel */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hausbatterie</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : e3dcData ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Battery className="w-8 h-8 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Ladezustand</div>
                        <div className="text-3xl font-bold" data-testid="text-battery-soc">
                          {e3dcData.batterySoc}%
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Leistung</div>
                      <div className="flex items-center gap-1">
                        {isBatteryCharging && <TrendingUp className="w-4 h-4 text-muted-foreground" />}
                        {isBatteryDischarging && <TrendingDown className="w-4 h-4 text-muted-foreground" />}
                        <span className="text-xl font-semibold" data-testid="text-battery-power">
                          {formatPower(Math.abs(e3dcData.batteryPower))}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* PV, Wallbox, Hausverbrauch, Netz - 2x2 Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* PV-Leistung */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm">PV</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : e3dcData ? (
                    <div className="text-2xl font-bold" data-testid="text-pv-power">
                      {formatPower(e3dcData.pvPower)}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {/* Wallbox */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <PlugZap className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm">Wallbox</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : e3dcData ? (
                    <div className="text-2xl font-bold" data-testid="text-wallbox-power">
                      {formatPower(e3dcData.wallboxPower)}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {/* Hausverbrauch */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <HomeIcon className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm">Haus</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : e3dcData ? (
                    <div className="text-2xl font-bold" data-testid="text-house-power">
                      {formatPower(actualHousePower)}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {/* Netz */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Grid3x3 className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm">Netz</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : e3dcData ? (
                    <div className="space-y-1">
                      <div className="text-2xl font-bold" data-testid="text-grid-power">
                        {formatPower(Math.abs(e3dcData.gridPower))}
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="text-grid-direction">
                        {e3dcData.gridPower < 0 ? "Einspeisung" : "Bezug"}
                      </div>
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
          </div>
        </div>
      </div>
    </div>
  );
}
