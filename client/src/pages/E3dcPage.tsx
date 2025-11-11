import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Battery, Home as HomeIcon, Zap, Grid3x3, TrendingUp, TrendingDown } from "lucide-react";
import EnergyFlowDiagram from "@/components/EnergyFlowDiagram";

export default function E3dcPage() {
  // Mock-Daten für Design-Phase
  const mockE3dcData = {
    pvPower: 4500,        // PV-Leistung in Watt
    batteryPower: -1200,  // Batterie-Leistung (negativ = Entladung, positiv = Ladung)
    housePower: 2800,     // Hausverbrauch in Watt
    gridPower: -500,      // Netzleistung (negativ = Einspeisung, positiv = Bezug)
    batterySoc: 75,       // Batterie-Ladestand in %
    autarky: 92,          // Autarkie in %
    selfConsumption: 88,  // Eigenverbrauch in %
    wallboxPower: 3200,   // Wallbox-Ladeleistung aus KEBA (wird später aus bestehendem System geholt)
  };

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
            <EnergyFlowDiagram data={mockE3dcData} />
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
              <div className="text-2xl font-bold">
                {(mockE3dcData.pvPower / 1000).toFixed(1)} kW
              </div>
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
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{mockE3dcData.batterySoc}%</span>
                <span className="text-sm text-muted-foreground">
                  {mockE3dcData.batteryPower < 0 ? (
                    <TrendingDown className="inline w-4 h-4 text-orange-500" />
                  ) : (
                    <TrendingUp className="inline w-4 h-4 text-green-500" />
                  )}
                  {Math.abs(mockE3dcData.batteryPower / 1000).toFixed(1)} kW
                </span>
              </div>
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
              <div className="text-2xl font-bold">
                {(mockE3dcData.housePower / 1000).toFixed(1)} kW
              </div>
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
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">
                  {Math.abs(mockE3dcData.gridPower / 1000).toFixed(1)} kW
                </span>
                <span className="text-xs text-muted-foreground">
                  {mockE3dcData.gridPower < 0 ? "Einspeisung" : "Bezug"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Effizienzwerte */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Effizienz</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Autarkie</span>
              <span className="text-lg font-semibold">{mockE3dcData.autarky}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Eigenverbrauch</span>
              <span className="text-lg font-semibold">{mockE3dcData.selfConsumption}%</span>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
