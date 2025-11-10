# KEBA Wallbox PWA - Entwicklungsleitfaden

## Overview

This Progressive Web App (PWA) controls a KEBA Wallbox charging station for electric vehicles. It provides real-time status monitoring, charge control, and SmartHome integration features. The application enables users to monitor charging status, start/stop charging, and configure automated charging based on PV surplus, night schedules, and battery lockout rules. **Now includes E3DC integration via CLI tool (e3dcset) for battery discharge control and grid charging during night charging intervals.** It adheres to Material Design 3 principles with a mobile-first approach, optimized for German users.

**Latest Update (Nov 2025):** Moon icon on status page now correctly reflects night charging scheduler enabled status. Auto-save implemented for scheduler toggle with robust form hydration guards to prevent data integrity issues.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

The frontend uses React 18+ with TypeScript, Wouter for routing, TanStack Query for state management, and shadcn/ui (Radix UI primitives) for UI components. Styling is managed with Tailwind CSS, customized with design tokens following Material Design 3 principles. The design is mobile-first, responsive, and uses Roboto typography. Core components include `StatusCard`, `ChargingVisualization`, and `BottomNav`, structured with Atomic Design. **SmartHome control toggles (PV surplus, battery lock, grid charging) are integrated directly into the Settings page for streamlined manual configuration. Night charging is controlled exclusively via the automatic scheduler configuration.** PWA features like manifest configuration and Apple Touch Icons are included for a standalone app experience. **The StatusCard component on the main page displays contextual status icons (Sun, Moon, ShieldOff, PlugZap) indicating active SmartHome features. The Moon icon specifically represents automatic night charging scheduler enabled status - it appears when `settings.nightChargingSchedule.enabled === true`, providing immediate visual feedback about the scheduler configuration.**

### Backend

The backend is built with Express.js and TypeScript, exposing a RESTful API (`/api` prefix). It features a storage abstraction layer (`IStorage`) with file-based persistence for settings in `data/settings.json`. The backend proxies communication with the KEBA Wallbox and integrates with external SmartHome systems via configurable webhooks. **E3DC integration is handled via CLI tool execution (e3dcset), providing battery discharge lock control and grid charging functionality. All CLI outputs are sanitized before logging to prevent credential leakage in both development and production modes.**

### Data Storage

Drizzle ORM is configured for PostgreSQL, with schemas defined in `shared/schema.ts` and migrations via `drizzle-kit` using the Neon Serverless PostgreSQL driver. Current implementation uses file-based persistence, storing `WallboxStatus`, `Settings`, and `ControlState` in `data/settings.json` to ensure persistence across server restarts, especially in Docker environments. **The ControlState schema includes four boolean flags: `pvSurplus`, `nightCharging`, `batteryLock`, and `gridCharging`. The `nightCharging` flag is read-only and controlled exclusively by the automatic scheduler - manual changes via API are rejected. The storage layer ensures backward compatibility by backfilling missing fields with default values when retrieving state.**

### Authentication

Currently, no authentication is implemented, as the application is designed for single-user local network use. Future authentication would likely be minimal for home automation contexts.

### Key Architectural Decisions

1.  **Separation of Concerns**: Shared schema definitions (`shared/`) for type safety across frontend and backend.
2.  **File-based Persistency**: Settings are saved to `data/settings.json` and control state to `data/control-state.json` for persistence across server restarts.
3.  **Storage Abstraction**: Interface-based storage design allows flexible persistence strategy changes with backward compatibility via default value backfilling.
4.  **Mobile-First PWA**: Optimized for touch devices with a standalone app experience.
5.  **Webhook Integration Pattern**: External SmartHome systems are integrated via HTTP callbacks (fallback when E3DC disabled).
6.  **E3DC CLI Integration**: Battery control via e3dcset CLI tool with configurable command strings, supporting discharge lock and grid charging.
7.  **Type Safety**: Zod schemas provide runtime validation and TypeScript types.
8.  **Security-First Logging**: CLI outputs are sanitized to prevent credential leakage - development mode shows sanitized previews (200 chars), production mode shows only metadata. HTTP request logs are controlled by log level setting (only appear in debug mode).
9.  **Visual Status Feedback**: Icon-based status indicators on the main screen provide immediate visual feedback for active SmartHome features, improving user awareness.
10. **Fixed Timezone**: Application uses Europe/Berlin (MEZ/MESZ) timezone for all time-based operations including night charging scheduler. No user configuration required.
11. **Auto-Save with Form Hydration Guards**: Scheduler toggle implements immediate auto-save with robust guards (`formHydratedRef`) to prevent race conditions and data corruption. Settings are never saved until form is fully hydrated with server data.
12. **Optimistic UI with Refetch-on-Mount**: StatusPage uses `refetchOnMount: true` for settings query to ensure Moon icon always reflects current scheduler state after navigation from settings.

## External Dependencies

*   **UI Components**: shadcn/ui (New York style), Radix UI Primitives, Lucide React (icons).
*   **Styling & Build Tools**: Tailwind CSS with PostCSS, Vite, esbuild.
*   **State Management & Data Fetching**: TanStack Query v5, React Hook Form with Zod Resolvers.
*   **Database & ORM**: Drizzle ORM, @neondatabase/serverless (PostgreSQL), drizzle-zod.
*   **SmartHome Integration**: 
    *   **E3DC**: CLI-based integration via e3dcset tool (user-configurable commands for discharge lock and grid charging)
    *   **FHEM**: Webhook-based fallback integration for PV surplus and battery lockout
    *   **KEBA Wallbox**: Direct UDP/HTTP API communication
*   **Development Tools**: Replit-specific plugins, TypeScript Strict Mode, path aliases (`@/`, `@shared/`, `@assets/`).