# KEBA Wallbox PWA - Design Guidelines

## Design Approach
**Selected Approach**: Design System - Material Design 3
**Rationale**: This is a utility-focused control application requiring clarity, reliability, and mobile-first functionality. Material Design provides proven patterns for dashboards, toggles, and real-time status displays that work excellently on mobile devices.

## Core Design Principles
1. **Clarity First**: Status must be immediately readable
2. **Touch-Optimized**: All interactive elements minimum 48px tap targets
3. **Data Hierarchy**: Critical information (charging status, power) most prominent
4. **Consistent Feedback**: Clear visual confirmation for all actions
5. **German Language**: All labels and messaging in German

---

## Typography

**Font Family**: 
- Primary: 'Roboto' (via Google Fonts CDN)
- Weights: 400 (regular), 500 (medium), 700 (bold)

**Scale**:
- Page Headers: text-2xl (24px) font-bold
- Section Headers: text-xl (20px) font-medium
- Status Values: text-3xl (30px) font-bold (for critical metrics like kW)
- Body Text: text-base (16px) font-normal
- Labels: text-sm (14px) font-medium
- Helper Text: text-xs (12px) font-normal

---

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, and 8
- Component padding: p-4 or p-6
- Section gaps: space-y-6 or space-y-8
- Card spacing: p-6
- Button padding: px-6 py-3

**Container Strategy**:
- Max width: max-w-2xl (optimized for mobile/tablet)
- Page padding: px-4
- Safe area consideration for PWA

**Grid System**:
- Status cards: Single column stack on mobile
- Toggle list: Full-width single column
- Settings form: Full-width single column

---

## Component Library

### Navigation
- **Bottom Tab Bar**: Fixed bottom navigation with 3 icons
  - Status (home icon)
  - Steuerung/Controls (sliders icon)
  - Einstellungen/Settings (cog icon)
- Active state: Distinctive visual treatment
- Labels: Icon + text label below
- Height: 64px with safe-area-inset-bottom

### Status Dashboard (Page 1)

**Status Card**:
- Large card container with rounded-xl corners
- Icon + status text (e.g., "Lädt", "Bereit", "Gestoppt")
- Prominent metrics display:
  - Current power: Large numerical value + unit (kW)
  - Charging state: Clear text status
  - Plug status indicator
- Visual status indicator (could be icon, badge, or border treatment)

**Action Button**:
- Large, full-width primary button
- Clear labels: "Laden stoppen" / "Laden starten"
- Height: h-12 minimum
- Margin: mt-6

**Auto-refresh Indicator**:
- Small text at bottom: "Aktualisiert: vor X Sekunden"

### Control Switches (Page 2)

**Toggle List Items**:
- Each toggle as a card or list item with rounded-lg
- Layout: Label (left) + Toggle Switch (right)
- Padding: p-4 vertical spacing
- Clear separation: border-b or gap-2 between items
- Labels:
  - "PV Überschussladung"
  - "Nachtladung"
  - "Batterie entladen sperren"

**Toggle Switches**:
- Material Design toggle style
- Size: Thumb 20px, track 36px width
- Touch target: 48px minimum
- Clear on/off states

### Settings Form (Page 3)

**Form Groups**:
- Grouped by function with section headers
- Spacing between groups: space-y-8

**Input Fields**:
- Label above input: text-sm font-medium mb-2
- Input height: h-12
- Rounded corners: rounded-lg
- Border: border-2 in default state
- Full width: w-full
- Bottom margin: mb-4

**Wallbox IP Section**:
- Single text input
- Placeholder: "z.B. 192.168.1.100"
- Helper text below: "IP-Adresse Ihrer KEBA Wallbox"

**URL Configuration Sections** (for each switch):
- Section header with switch name
- Two URL inputs per section:
  - "URL zum Einschalten"
  - "URL zum Ausschalten"
- Collapsed/expandable accordion pattern to save space

**Save Button**:
- Primary action button
- Fixed at bottom or prominent at form end
- Label: "Einstellungen speichern"
- Success feedback after save

### Feedback Elements

**Success Toast**:
- Appears at top after actions
- Auto-dismiss after 3 seconds
- Message examples: "Ladevorgang gestartet", "Einstellungen gespeichert"

**Error States**:
- Inline error messages below inputs (text-sm)
- Error indicator on failed API calls
- Retry button when communication fails

---

## Animations

**Minimal Approach**:
- Toggle switch transitions: 200ms ease
- Page transitions: Simple fade or slide (150ms)
- Loading states: Subtle pulse for refresh indicator
- NO complex hero animations or scroll effects

---

## Mobile-First Considerations

- Viewport: Single-page app shell with tab navigation
- All pages: Full viewport height with scrollable content
- Headers: Sticky positioning (sticky top-0)
- Bottom navigation: Fixed positioning (fixed bottom-0)
- Form inputs: Proper mobile keyboard types (number for IP, url for URLs)
- Touch feedback: Brief active states on all tappable elements

---

## PWA-Specific Elements

**App Icon**: 192px and 512px required (placeholder icon initially)
**Splash Screen**: Simple branded loading state
**Offline Indicator**: Banner when network unavailable
**Install Prompt**: Subtle banner on first visit suggesting installation