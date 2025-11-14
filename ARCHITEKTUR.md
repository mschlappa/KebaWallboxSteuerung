# EnergyLink - Architektur-Übersicht

## 1. Realbetrieb (Production Mode)

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React)                           │
│  ┌────────────┬────────────┬────────────┬────────────────────────┐ │
│  │ StatusPage │ E3dcPage   │ LogsPage   │ SettingsPage           │ │
│  └────────────┴────────────┴────────────┴────────────────────────┘ │
│                                                                     │
│  Components:                                                        │
│  - StatusCard (Wallbox-Status, aktive Features)                    │
│  - ChargingVisualization (Ladekurve)                               │
│  - EnergyFlowDiagram (E3DC Energiefluss)                           │
│  - BottomNav (Navigation)                                          │
│                                                                     │
│  State Management: TanStack Query v5                               │
│  Routing: Wouter                                                   │
│  UI: shadcn/ui + Tailwind CSS (Material Design 3)                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST API
                              │ (Port 5000)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKEND (Express.js)                            │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                   API Routes (routes.ts)                      │ │
│  │  /api/wallbox/status  /api/settings  /api/control/*          │ │
│  │  /api/e3dc/live       /api/logs      /api/strategy/*         │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                              │                                     │
│  ┌──────────────────────────┼─────────────────────────────────┐  │
│  │                          │                                  │  │
│  │  ┌───────────────────────▼──────────────────────┐           │  │
│  │  │    Charging Strategy Controller              │           │  │
│  │  │  - 4 Ladestrategien (Surplus, Max, Off)      │           │  │
│  │  │  - Automatische Phasenumschaltung (1P/3P)    │           │  │
│  │  │  - Input X1 Integration                      │           │  │
│  │  │  - Start/Stop Delays, Dwell-Time Guards      │           │  │
│  │  └──────────────────────────────────────────────┘           │  │
│  │                                                              │  │
│  │  ┌──────────────────────────────────────────────┐           │  │
│  │  │    Broadcast Listener                        │           │  │
│  │  │  - UDP Broadcasts (Input X1, Plug, State)    │           │  │
│  │  │  - Echtzeit Status-Tracking                  │           │  │
│  │  │  - Persistierung von Statusänderungen        │           │  │
│  │  └──────────────────────────────────────────────┘           │  │
│  │                                                              │  │
│  │  ┌──────────────────────────────────────────────┐           │  │
│  │  │    Storage Layer (storage.ts)                │           │  │
│  │  │  - Settings, ControlState, PlugTracking      │           │  │
│  │  │  - ChargingContext, Logs                     │           │  │
│  │  │  - JSON-basierte Persistenz (data/*.json)    │           │  │
│  │  └──────────────────────────────────────────────┘           │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                     │
         │                    │                     │
         │ UDP                │ Modbus TCP          │ HTTP
         │ Port 7090          │ Port 5502           │ Port 8083
         │                    │ + CLI (e3dcset)     │ (Webhooks)
         │                    │                     │
         ▼                    ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  KEBA Wallbox    │  │  E3DC S10        │  │  FHEM            │
│                  │  │                  │  │                  │
│  - Status Abruf  │  │  - Live-Daten    │  │  - PV Surplus    │
│  - Kommandos     │  │    (Modbus TCP)  │  │    Status        │
│  - UDP Broadcast │  │  - Batterielock  │  │  - Webhooks      │
│  - Ladestrom     │  │  - Netzladung    │  │                  │
│    Steuerung     │  │    (e3dcset CLI) │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### Datenfluss Realbetrieb:

1. **Frontend → Backend**: REST API Calls (GET/POST)
2. **Backend → KEBA Wallbox**: 
   - UDP Kommandos (Start/Stop/Strom setzen)
   - UDP Broadcast Empfang (Echtzeit-Updates)
3. **Backend → E3DC S10**: 
   - Modbus TCP (Live-Daten alle 5s)
   - CLI-Tool e3dcset (Batteriesteuerung)
4. **Backend → FHEM**: 
   - HTTP GET (Status-Abfrage)
   - Webhook Callbacks

---

## 2. Demo-Modus (Mock Mode)

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React)                           │
│  ┌────────────┬────────────┬────────────┬────────────────────────┐ │
│  │ StatusPage │ E3dcPage   │ LogsPage   │ SettingsPage           │ │
│  └────────────┴────────────┴────────────┴────────────────────────┘ │
│                                                                     │
│  Components: (identisch zu Realbetrieb)                            │
│  - StatusCard, ChargingVisualization, EnergyFlowDiagram            │
│                                                                     │
│  Demo-spezifische Komponenten:                                     │
│  - Plug Status Dropdown (Test aller KEBA Kabelzustände)           │
│  - Demo-Modus Toggle in Settings                                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST API
                              │ (Port 5000)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKEND (Express.js)                            │
│                                                                     │
│  API Routes & Controllers: (identisch zu Realbetrieb)              │
│  - Charging Strategy Controller                                    │
│  - Broadcast Listener                                              │
│  - Storage Layer (JSON-basiert)                                    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │         Unified Mock Server (unified-mock.ts)                 │ │
│  │                                                                │ │
│  │  Auto-Start wenn:                                              │ │
│  │  - DEMO_AUTOSTART=true (Env)                                   │ │
│  │  - demoMode=true (Settings)                                    │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                     │
         │                    │                     │
         │ UDP                │ Modbus TCP          │ HTTP
         │ localhost:7090     │ localhost:5502      │ localhost:8083
         │                    │                     │
         ▼                    ▼                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│              UNIFIED MOCK SERVER (Single Process)                    │
│                                                                      │
│  ┌────────────────────┐  ┌────────────────────┐  ┌───────────────┐ │
│  │  KEBA Mock         │  │  E3DC Mock         │  │  FHEM Mock    │ │
│  │  (wallbox-mock.ts) │  │  (e3dc-mock.ts)    │  │               │ │
│  │                    │  │                    │  │               │ │
│  │  - UDP Server      │  │  - Modbus TCP      │  │  - HTTP       │ │
│  │  - Broadcast       │  │    Server          │  │    Server     │ │
│  │  - State Simulator │  │  - PV Simulation   │  │  - Status     │ │
│  │  - Plug States     │  │    (tageszeit-     │  │    Simulator  │ │
│  │  - Lade-Simulation │  │    abhängig)       │  │               │ │
│  │                    │  │  - Batterie SOC    │  │               │ │
│  │                    │  │  - Hausverbrauch   │  │               │ │
│  │                    │  │    (Peaks 7-9h,    │  │               │ │
│  │                    │  │     12-14h,        │  │               │ │
│  │                    │  │     18-20h)        │  │               │ │
│  │                    │  │  - CLI Mock        │  │               │ │
│  │                    │  │    (e3dcset)       │  │               │ │
│  └────────────────────┘  └────────────────────┘  └───────────────┘ │
│                                                                      │
│  Features:                                                           │
│  - Realistische Simulationsdaten                                     │
│  - Zeitzonenbasiert (Europe/Berlin)                                  │
│  - Saisonale PV-Kurven (Nov: 7:30-16:30, 3.5kW Peak)                │
│  - Atomare Modbus-Snapshots (konsistente Energiebilanz)             │
│  - Graceful Shutdown                                                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Demo-Modus Besonderheiten:

1. **Alle externen Systeme simuliert in einem Prozess**
2. **Realistische Testdaten**:
   - Tageszeit-abhängige PV-Produktion
   - Typische Hausverbrauchsmuster
   - Saisonale Variationen (November-spezifisch)
3. **Vollständige Feature-Abdeckung**:
   - Alle Ladestrategien testbar
   - Input X1 Simulation
   - Plug Status Wechsel
   - E3DC Batteriesteuerung
4. **Deployment-Ready**: 
   - Replit Autoscale (~$3-6/Monat)
   - Single-Process Architecture
   - Keine persistente Datenbank nötig

---

## 3. Gemeinsame Komponenten (beide Modi)

### Shared Schema (shared/schema.ts)
Zod-basierte Type-Safety für:
- `WallboxStatus` (state, plug, power, phases, etc.)
- `Settings` (IPs, URLs, E3DC Config, Charging Strategy)
- `ControlState` (pvSurplus, nightCharging, batteryLock, gridCharging)
- `ChargingContext` (strategy, isActive, currentAmpere, phases)
- `E3dcLiveData` (PV, Batterie, Netz, Haus, Autarkie, Eigenverbrauch)
- `PlugStatusTracking` (lückenlose Kabel-Status-Historie)
- `LogEntry` (level, category, message, details)

### Storage Layer
- **Interface**: `IStorage` (storage.ts)
- **Implementation**: `MemStorage` (JSON-basiert)
- **Dateien** (data/*.json):
  - `settings.json`
  - `control-state.json`
  - `plug-tracking.json`
  - `charging-context.json`

### API Endpunkte (routes.ts)
| Endpunkt | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/wallbox/status` | GET | Aktueller Wallbox-Status |
| `/api/wallbox/start` | POST | Ladung starten |
| `/api/wallbox/stop` | POST | Ladung stoppen |
| `/api/wallbox/set-current` | POST | Ladestrom setzen |
| `/api/settings` | GET/POST | Einstellungen lesen/schreiben |
| `/api/control/pv-surplus` | POST | PV-Überschuss an/aus |
| `/api/control/battery-lock` | POST | Batteriesperrung an/aus |
| `/api/control/grid-charging` | POST | Netzladung an/aus |
| `/api/e3dc/live` | GET | E3DC Live-Daten (Modbus) |
| `/api/strategy/config` | GET/POST | Ladestrategie-Konfiguration |
| `/api/strategy/status` | GET | Aktueller Strategie-Status |
| `/api/logs` | GET | Log-Einträge |
| `/api/logs/settings` | GET/POST | Log-Level Konfiguration |
| `/api/demo/mock/start` | POST | Mock-Server starten (Demo) |
| `/api/demo/mock/stop` | POST | Mock-Server stoppen (Demo) |

---

## 4. Deployment-Szenarien

### Szenario A: Lokaler Realbetrieb (empfohlen)
**Ziel**: Raspberry Pi, Home Server, Docker
- **Hardware**: KEBA Wallbox, E3DC S10, optional FHEM
- **Netzwerk**: Lokales 192.168.x.x Netzwerk
- **Persistenz**: Dateisystem (data/*.json)
- **Kosten**: Kostenlos (selbst gehostet)
- **Dokumentation**: `DEPLOYMENT.md`, `README.Docker.md`

### Szenario B: Replit Autoscale Demo
**Ziel**: Showcase, Entwicklung, Präsentation
- **Hardware**: Vollständig simuliert (Unified Mock Server)
- **Persistenz**: Temporär (bei Redeploy verloren)
- **Kosten**: ~$3-6/Monat
- **Environment**: `DEMO_AUTOSTART=true`, `NODE_ENV=production`
- **Dokumentation**: `README-AUTOSCALE.md`

---

## 5. Technologie-Stack

### Frontend
- **Framework**: React 18+, TypeScript
- **Routing**: Wouter
- **State**: TanStack Query v5
- **UI**: shadcn/ui (Radix UI), Tailwind CSS
- **Design**: Material Design 3, Mobile-First
- **Build**: Vite

### Backend
- **Runtime**: Node.js, TypeScript
- **Framework**: Express.js
- **Validation**: Zod
- **Kommunikation**:
  - UDP (dgram) - KEBA Wallbox
  - Modbus TCP (modbus-serial) - E3DC
  - HTTP/Fetch - FHEM Webhooks
  - CLI (child_process) - e3dcset

### DevOps
- **Container**: Docker (multi-stage build)
- **Orchestration**: docker-compose
- **Cloud**: Replit Autoscale (optional)

---

## 6. Sicherheits- und Best Practices

1. **Type Safety**: Zod-Schemas für Runtime-Validation
2. **Error Handling**: Graceful Degradation bei Hardware-Ausfällen
3. **Logging**: 3-Level System (debug, info, warning, error)
4. **CLI Security**: Sanitization von e3dcset Ausgaben
5. **Fail-Safe**: Automatische Wiederverbindung (Modbus, UDP)
6. **Timezone**: Fest Europe/Berlin für alle Zeitberechnungen
7. **Optimistic UI**: Sofortige Reaktion, Backend-Bestätigung
8. **Debouncing**: Start/Stop Delays zur Vermeidung von Flapping

---

## 7. Geplante Erweiterungen

Siehe `replit.md` - Abschnitt "Geplante Features (Backlog)":
- **Automatische Wallbox-Abschaltung bei E3DC Notstrom**
  - Modbus Register 40084 (Emergency Power Status)
  - Safety-relevant (verhindert Batterie-Entleerung)
  - Priorität: HIGH
  - Geschätzter Aufwand: 6-8 Stunden
