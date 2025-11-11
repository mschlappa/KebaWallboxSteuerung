import { Zap, Battery, Home as HomeIcon, Grid3x3, Car, ArrowRight, ArrowDown } from "lucide-react";

interface EnergyFlowData {
  pvPower: number;        // PV-Leistung in Watt
  batteryPower: number;   // Batterie-Leistung (negativ = Entladung, positiv = Ladung)
  housePower: number;     // Hausverbrauch in Watt
  gridPower: number;      // Netzleistung (negativ = Einspeisung, positiv = Bezug)
  batterySoc: number;     // Batterie-Ladestand in %
  wallboxPower: number;   // Wallbox-Ladeleistung in Watt
}

interface EnergyFlowDiagramProps {
  data: EnergyFlowData;
}

export default function EnergyFlowDiagram({ data }: EnergyFlowDiagramProps) {
  const formatPower = (watts: number) => {
    if (watts === 0) return "0 W";
    if (Math.abs(watts) >= 1000) {
      return `${(watts / 1000).toFixed(1)} kW`;
    }
    return `${Math.round(watts)} W`;
  };

  // Berechne ob Flüsse aktiv sind
  const isPvActive = data.pvPower > 100;
  const isBatteryCharging = data.batteryPower > 100;
  const isBatteryDischarging = data.batteryPower < -100;
  const isGridImport = data.gridPower > 100;
  const isGridExport = data.gridPower < -100;
  const isWallboxActive = data.wallboxPower > 100;

  return (
    <div className="relative w-full" style={{ minHeight: "400px" }}>
      {/* Grid Layout für Komponenten */}
      <div className="grid grid-cols-2 gap-4 relative">
        {/* PV - Oben Links */}
        <div className="flex flex-col items-center space-y-2">
          <div className={`flex flex-col items-center justify-center w-20 h-20 rounded-full border-2 ${
            isPvActive ? "bg-yellow-500/10 border-yellow-500" : "bg-muted border-border"
          }`}>
            <Zap className={`w-8 h-8 ${isPvActive ? "text-yellow-500" : "text-muted-foreground"}`} />
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">PV</div>
            <div className={`text-sm font-semibold ${isPvActive ? "text-foreground" : "text-muted-foreground"}`}>
              {formatPower(data.pvPower)}
            </div>
          </div>
        </div>

        {/* Batterie - Oben Rechts */}
        <div className="flex flex-col items-center space-y-2">
          <div className={`flex flex-col items-center justify-center w-20 h-20 rounded-full border-2 ${
            isBatteryCharging || isBatteryDischarging 
              ? "bg-primary/10 border-primary" 
              : "bg-muted border-border"
          }`}>
            <Battery className={`w-8 h-8 ${
              isBatteryCharging || isBatteryDischarging 
                ? "text-primary" 
                : "text-muted-foreground"
            }`} />
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Batterie</div>
            <div className="text-sm font-semibold">
              {data.batterySoc}%
              <span className={`text-xs ml-1 ${
                isBatteryCharging ? "text-green-500" : 
                isBatteryDischarging ? "text-orange-500" : 
                "text-muted-foreground"
              }`}>
                {isBatteryCharging && "↑"}
                {isBatteryDischarging && "↓"}
              </span>
            </div>
          </div>
        </div>

        {/* Haus - Mitte Links */}
        <div className="flex flex-col items-center space-y-2 mt-8">
          <div className="flex flex-col items-center justify-center w-20 h-20 rounded-full border-2 bg-blue-500/10 border-blue-500">
            <HomeIcon className="w-8 h-8 text-blue-500" />
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Haus</div>
            <div className="text-sm font-semibold text-foreground">
              {formatPower(data.housePower)}
            </div>
          </div>
        </div>

        {/* Wallbox - Mitte Rechts */}
        <div className="flex flex-col items-center space-y-2 mt-8">
          <div className={`flex flex-col items-center justify-center w-20 h-20 rounded-full border-2 ${
            isWallboxActive ? "bg-green-500/10 border-green-500" : "bg-muted border-border"
          }`}>
            <Car className={`w-8 h-8 ${isWallboxActive ? "text-green-500" : "text-muted-foreground"}`} />
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Wallbox</div>
            <div className={`text-sm font-semibold ${isWallboxActive ? "text-foreground" : "text-muted-foreground"}`}>
              {formatPower(data.wallboxPower)}
            </div>
          </div>
        </div>

        {/* Netz - Unten Zentriert */}
        <div className="col-span-2 flex flex-col items-center space-y-2 mt-8">
          <div className={`flex flex-col items-center justify-center w-20 h-20 rounded-full border-2 ${
            isGridImport || isGridExport 
              ? "bg-purple-500/10 border-purple-500" 
              : "bg-muted border-border"
          }`}>
            <Grid3x3 className={`w-8 h-8 ${
              isGridImport || isGridExport ? "text-purple-500" : "text-muted-foreground"
            }`} />
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Netz</div>
            <div className="text-sm font-semibold">
              {formatPower(Math.abs(data.gridPower))}
              <span className={`text-xs ml-1 ${
                isGridImport ? "text-orange-500" : 
                isGridExport ? "text-green-500" : 
                "text-muted-foreground"
              }`}>
                {isGridImport && "↓"}
                {isGridExport && "↑"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SVG für animierte Flusslinien - wird in Phase 2 erweitert */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: -1 }}>
        {/* Platzhalter für animierte Pfeile zwischen Komponenten */}
        {/* Wird in der nächsten Iteration implementiert */}
      </svg>

      {/* Info-Box für aktuelle Flussrichtungen */}
      <div className="mt-6 p-3 bg-muted/50 rounded-lg text-xs space-y-1">
        <div className="font-medium text-muted-foreground mb-1">Aktive Energieflüsse:</div>
        {isPvActive && (
          <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-500">
            <ArrowRight className="w-3 h-3" />
            <span>PV erzeugt {formatPower(data.pvPower)}</span>
          </div>
        )}
        {isBatteryCharging && (
          <div className="flex items-center gap-1 text-green-600 dark:text-green-500">
            <ArrowDown className="w-3 h-3" />
            <span>Batterie lädt mit {formatPower(data.batteryPower)}</span>
          </div>
        )}
        {isBatteryDischarging && (
          <div className="flex items-center gap-1 text-orange-600 dark:text-orange-500">
            <ArrowDown className="w-3 h-3" />
            <span>Batterie entlädt mit {formatPower(Math.abs(data.batteryPower))}</span>
          </div>
        )}
        {isWallboxActive && (
          <div className="flex items-center gap-1 text-green-600 dark:text-green-500">
            <ArrowRight className="w-3 h-3" />
            <span>Wallbox lädt mit {formatPower(data.wallboxPower)}</span>
          </div>
        )}
        {isGridImport && (
          <div className="flex items-center gap-1 text-orange-600 dark:text-orange-500">
            <ArrowDown className="w-3 h-3" />
            <span>Netzbezug {formatPower(data.gridPower)}</span>
          </div>
        )}
        {isGridExport && (
          <div className="flex items-center gap-1 text-green-600 dark:text-green-500">
            <ArrowDown className="w-3 h-3" />
            <span>Einspeisung {formatPower(Math.abs(data.gridPower))}</span>
          </div>
        )}
      </div>
    </div>
  );
}
