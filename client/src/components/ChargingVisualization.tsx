interface ChargingVisualizationProps {
  isCharging: boolean;
  isPluggedIn: boolean;
}

export default function ChargingVisualization({
  isCharging,
  isPluggedIn,
}: ChargingVisualizationProps) {
  const cableColor = isCharging
    ? "stroke-green-500"
    : isPluggedIn
    ? "stroke-red-500"
    : "stroke-transparent";

  return (
    <div className="w-full max-w-md mx-auto py-8" data-testid="charging-visualization">
      <svg
        viewBox="0 0 400 200"
        className="w-full h-auto"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Wallbox */}
        <g className="wallbox">
          {/* Wallbox Gehäuse */}
          <rect
            x="20"
            y="40"
            width="80"
            height="120"
            rx="8"
            className="fill-card stroke-border"
            strokeWidth="2"
          />
          {/* Wallbox Display */}
          <rect
            x="35"
            y="55"
            width="50"
            height="30"
            rx="4"
            className="fill-primary/10 stroke-primary"
            strokeWidth="1"
          />
          {/* Wallbox Logo/Icon */}
          <circle cx="60" cy="70" r="8" className="fill-primary" />
          {/* Steckdose */}
          <rect
            x="45"
            y="100"
            width="30"
            height="40"
            rx="6"
            className="fill-muted stroke-border"
            strokeWidth="2"
          />
          <circle cx="55" cy="120" r="3" className="fill-foreground" />
          <circle cx="65" cy="120" r="3" className="fill-foreground" />
        </g>

        {/* Kabel (nur wenn eingesteckt) */}
        {isPluggedIn && (
          <g className="cable">
            <path
              d="M 100 120 Q 200 100, 280 120"
              fill="none"
              className={cableColor}
              strokeWidth="6"
              strokeLinecap="round"
            />
            {/* Stecker am Wallbox-Ende */}
            <circle cx="100" cy="120" r="5" className={cableColor.replace('stroke-', 'fill-')} />
            {/* Stecker am Auto-Ende */}
            <circle cx="280" cy="120" r="5" className={cableColor.replace('stroke-', 'fill-')} />
          </g>
        )}

        {/* Auto */}
        <g className="car">
          {/* Auto Karosserie */}
          <rect
            x="280"
            y="100"
            width="100"
            height="50"
            rx="8"
            className="fill-card stroke-border"
            strokeWidth="2"
          />
          {/* Auto Dach */}
          <path
            d="M 290 100 L 310 70 L 350 70 L 370 100 Z"
            className="fill-card stroke-border"
            strokeWidth="2"
          />
          {/* Fenster */}
          <rect
            x="295"
            y="75"
            width="30"
            height="20"
            className="fill-primary/5 stroke-border"
            strokeWidth="1"
          />
          <rect
            x="335"
            y="75"
            width="30"
            height="20"
            className="fill-primary/5 stroke-border"
            strokeWidth="1"
          />
          {/* Räder */}
          <circle cx="300" cy="150" r="12" className="fill-foreground" />
          <circle cx="300" cy="150" r="6" className="fill-muted" />
          <circle cx="360" cy="150" r="12" className="fill-foreground" />
          <circle cx="360" cy="150" r="6" className="fill-muted" />
          {/* Ladeanschluss am Auto */}
          <rect
            x="280"
            y="110"
            width="8"
            height="20"
            rx="2"
            className="fill-muted stroke-border"
            strokeWidth="1"
          />
        </g>

        {/* Ladeanzeige (nur beim Laden) */}
        {isCharging && (
          <g className="charging-indicator">
            {/* Blitz-Symbol */}
            <path
              d="M 195 85 L 185 95 L 192 95 L 188 105 L 198 95 L 191 95 Z"
              className="fill-green-500"
            />
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="scale"
              values="1;1.2;1"
              dur="1s"
              repeatCount="indefinite"
            />
          </g>
        )}
      </svg>

      {/* Status-Text */}
      <div className="text-center mt-4">
        <p
          className={`text-sm font-medium ${
            isCharging
              ? "text-green-600 dark:text-green-400"
              : isPluggedIn
              ? "text-red-600 dark:text-red-400"
              : "text-muted-foreground"
          }`}
          data-testid="visualization-status"
        >
          {isCharging
            ? "Lädt aktiv"
            : isPluggedIn
            ? "Verbunden, nicht geladen"
            : "Nicht verbunden"}
        </p>
      </div>
    </div>
  );
}
