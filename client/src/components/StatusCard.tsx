import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";

interface StatusCardProps {
  icon: LucideIcon;
  title: string;
  value: string;
  unit?: string;
  status?: "charging" | "ready" | "error" | "stopped";
  badge?: string;
  additionalInfo?: string;
  compact?: boolean;
  onClick?: () => void;
}

export default function StatusCard({
  icon: Icon,
  title,
  value,
  unit,
  status,
  badge,
  additionalInfo,
  compact = false,
  onClick,
}: StatusCardProps) {
  const getStatusColor = () => {
    switch (status) {
      case "charging":
        return "text-green-600 dark:text-green-400";
      case "ready":
        return "text-yellow-600 dark:text-yellow-400";
      case "error":
        return "text-destructive";
      case "stopped":
        return "text-muted-foreground";
      default:
        return "text-foreground";
    }
  };

  const getBadgeVariant = () => {
    switch (status) {
      case "charging":
        return "default";
      case "ready":
        return "secondary";
      case "error":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <Card 
      className={`p-6 ${onClick ? 'cursor-pointer hover-elevate active-elevate-2' : ''}`}
      data-testid={`card-${title.toLowerCase().replace(/\s/g, '-')}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <Icon className={`w-5 h-5 ${getStatusColor()}`} />
            <span className="text-base font-semibold">
              {title}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`${compact ? 'text-xl' : 'text-3xl'} font-bold ${getStatusColor()}`}
              data-testid={`value-${title.toLowerCase().replace(/\s/g, '-')}`}
            >
              {value}
            </span>
            {unit && (
              <span className="text-xl font-medium text-muted-foreground">
                {unit}
              </span>
            )}
          </div>
          {additionalInfo && (
            <div className="mt-2 text-sm text-muted-foreground" data-testid="text-additional-info">
              {additionalInfo}
            </div>
          )}
        </div>
        {badge && (
          <Badge variant={getBadgeVariant()} data-testid="badge-status">
            {badge}
          </Badge>
        )}
      </div>
    </Card>
  );
}
