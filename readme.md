# KEBA Wallbox PWA - Entwicklungsleitfaden

## Überblick

Dies ist eine Progressive Web App (PWA) zur Steuerung einer KEBA Wallbox-Ladestation für Elektrofahrzeuge. Die Anwendung bietet Echtzeit-Statusüberwachung, Ladesteuerung und SmartHome-Integrationsfunktionen zur Verwaltung des EV-Ladevorgangs. Sie folgt Material Design 3 Prinzipien mit einem Mobile-First-Ansatz, optimiert für deutsche Nutzer.

**Hauptzweck**: Nutzer können den Wallbox-Ladestatus überwachen, Ladevorgänge starten/stoppen und automatisches Laden basierend auf PV-Überschuss, Nachtzeitplänen und Batteriesperrregeln konfigurieren.

## Benutzerpräferenzen

Bevorzugter Kommunikationsstil: Einfache, alltägliche Sprache.

## Systemarchitektur

### Frontend-Architektur

**Technologie-Stack**:
- **Framework**: React 18+ mit TypeScript
- **Routing**: Wouter (leichtgewichtiges Client-seitiges Routing)
- **State Management**: TanStack Query (React Query) für Server-State
- **UI Framework**: shadcn/ui Komponenten basierend auf Radix UI Primitives
- **Styling**: Tailwind CSS mit benutzerdefinierten Design-Tokens

**Design-System**:
- Material Design 3 Prinzipien für funktionsorientierte Steuerungsanwendungen
- Benutzerdefinierte Tailwind-Konfiguration mit CSS-Variablen für Theming
- Typografie: Roboto Schriftfamilie (400, 500, 700 Schriftgewichte)
- Mobile-First responsives Design mit 48px minimalen Touch-Targets
- Durchgehend deutsche Benutzeroberfläche

**Komponenten-Architektur**:
- Atomic Design mit wiederverwendbaren UI-Komponenten in `client/src/components/ui/`
- Feature-spezifische Komponenten: `StatusCard`, `ChargingVisualization`, `ToggleListItem`, `BottomNav`
- Drei Hauptseiten: Status, Steuerung, Einstellungen
- Bottom-Navigation für mobile-optimiertes Navigationsmuster

**PWA-Funktionen**:
- Manifest-Konfiguration für Standalone-App-Erlebnis
- Apple Touch Icons und Mobile Web App Meta-Tags
- Viewport-fit für Safe Area Handling auf mobilen Geräten

### Backend-Architektur

**Server-Framework**: Express.js mit TypeScript

**API-Design**:
- RESTful API-Muster mit `/api` Präfix für alle Endpunkte
- Routen registriert über `server/routes.ts`
- Storage-Abstraktionsschicht über `IStorage` Interface
- Derzeit wird `MemStorage` (In-Memory) Implementierung verwendet

**Geplanter Datenfluss**:
- Frontend kommuniziert mit KEBA Wallbox über Backend-Proxy
- Backend speichert Benutzereinstellungen und Steuerungsstatus
- Integration mit externen SmartHome-Systemen über konfigurierbare Webhook-URLs

### Datenspeicher-Lösungen

**Datenbank-Konfiguration**:
- Drizzle ORM konfiguriert für PostgreSQL
- Schema definiert in `shared/schema.ts`
- Migrations-Unterstützung über `drizzle-kit`
- Neon Serverless PostgreSQL Treiber

**Datenmodelle**:
- `WallboxStatus`: Echtzeit-Ladezustand (state, plug, power, current, phases)
- `Settings`: Wallbox-IP und Webhook-URLs für SmartHome-Integrationen
- `ControlState`: Boolean-Schalter für PV-Überschuss, Nachtladung, Batteriesperrung

**Aktueller Stand**: Storage-Interface definiert, aber noch nicht mit Datenbank-Persistenz implementiert. Einstellungen werden derzeit im localStorage des Frontends gespeichert.

### Authentifizierung und Autorisierung

**Aktueller Stand**: Keine Authentifizierung implementiert

**Design-Überlegung**: Die Anwendung ist für Einzelnutzer-Verwendung im lokalen Netzwerk konzipiert. Zukünftige Authentifizierung wäre wahrscheinlich minimal (Basic Auth oder einfache PIN) im Kontext der Heimautomatisierung.

### Externe Abhängigkeiten

**UI-Komponenten-Bibliothek**:
- shadcn/ui (New York Stil-Variante)
- Radix UI Primitives für Barrierefreiheit
- Lucide React für Icons

**Styling & Build-Tools**:
- Tailwind CSS mit PostCSS
- Vite für Build und Entwicklung
- esbuild für Server-Bundling

**State Management & Datenabruf**:
- TanStack Query v5 für Server-State-Caching und Synchronisation
- React Hook Form mit Zod Resolvers für Formularvalidierung

**Datenbank & ORM**:
- Drizzle ORM für typsichere Datenbank-Abfragen
- @neondatabase/serverless für PostgreSQL-Verbindung
- drizzle-zod für Schema-Validierung

**SmartHome-Integration**:
- Webhook-basierte Integration mit externen Systemen
- Konfigurierbare URLs für PV-Überschuss, Nachtladung und Batteriesperrung
- Direkte HTTP-Kommunikation mit KEBA Wallbox UDP/HTTP API

**Entwicklungs-Tools**:
- Replit-spezifische Plugins für Entwicklungserfahrung
- TypeScript Strict Mode für Typsicherheit
- Pfad-Aliase (@/, @shared/, @assets/) für saubere Imports

**Wichtige Architektur-Entscheidungen**:

1. **Separation of Concerns**: Gemeinsame Schema-Definitionen in `shared/` werden von Frontend und Backend für Typsicherheit verwendet
2. **Storage-Abstraktion**: Interface-basiertes Storage-Design ermöglicht Wechsel von In-Memory zu Datenbank ohne Änderung der Business-Logik
3. **Mobile-First PWA**: Optimiert für Touch-Geräte mit Standalone-App-Erlebnis
4. **Webhook-Integrationsmuster**: Externe SmartHome-Systeme werden über HTTP-Callbacks statt direkter Integration gesteuert
5. **Typsicherheit**: Zod-Schemas bieten Laufzeit-Validierung und TypeScript-Typen aus einer einzigen Quelle

## Technische Details

### KEBA Wallbox Kommunikation

**Standard-IP-Adresse**: 192.168.40.16

**Befehlsbestätigung**:
- Alle Befehle (curr, ena 1, ena 0) warten auf TCH-OK :done Antwort
- 200ms Pause nach Befehlsempfang
- Report 2 Verifizierung vor Erfolgsbestätigung
- HTTP 500 bei Fehlschlägen

**Nachrichten-Validierung**:
- Reports verwenden ID-Feld (ID="1", ID="2", ID="3") zur Filterung von Broadcasts
- TCH-OK :done wird zu { "TCH-OK": "done" } geparst vor JSON-Parsing-Versuchen

**Einheiten-Konvertierungen**:
- E pres ÷10 für Wh
- P ÷1000000 für kW
- Max curr/Curr user ÷1000 für A

**3-Phasen-Ladung**: Maximaler Strom 16A (nicht 32A)

### UI-Verhalten

**Steuerungszustände**:
- PV-Überschuss deaktiviert Ladestrom-Slider komplett
- Nachtladung setzt automatisch maximalen Strom, erlaubt aber manuelle Änderungen
- Slider ist deaktiviert wenn: !isPluggedIn, pvSurplus aktiv, oder Mutation läuft

**Slider-Implementierung**:
- Verwendet Radix UI data-disabled/aria-disabled Attribute
- Visuell ausgegraut (50% Opazität) wenn deaktiviert
- Grauer Balken statt grün bei deaktiviertem Zustand

**Status-Anzeige**:
- Nach Klick auf "Laden starten": Badge zeigt "Warte auf Bestätigung"
- Wechselt zu "Lädt" sobald power > 0 empfangen wird
- Keine "Aktualisiert: vor X Sekunden" Zeitstempel-Anzeige

### Aktuelle Funktionen

**Status-Seite**:
- Ladeleistung-Karte mit Badge-Status
- Ladestrom-Karte (immer sichtbar, auch ohne Kabel)
- Geladene Energie
- Kabelverbindung (kompakte Anzeige)
- Start/Stop-Button

**Steuerungs-Seite**:
- PV-Überschuss Toggle
- Nachtladung Toggle
- Batteriesperrung Toggle

**Einstellungen-Seite**:
- Wallbox IP-Konfiguration (Standard: 192.168.40.16)
- SmartHome Webhook-URLs (PV-Überschuss, Nachtladung, Batteriesperrung)

## Entwicklung

**Workflow**: `npm run dev` startet Express-Server (Backend) und Vite-Server (Frontend)

**Auto-Restart**: Nach Änderungen wird der Workflow automatisch neu gestartet

**Port**: Frontend bindet an 0.0.0.0:5000
