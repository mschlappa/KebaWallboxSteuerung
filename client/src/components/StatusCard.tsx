import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StatusIcon {
  icon: LucideIcon;
  label: string;
  color?: string;
}

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
  statusIcons?: StatusIcon[];
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
  statusIcons = [],
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
            {statusIcons.length > 0 && (
              <TooltipProvider>
                <div className="flex items-center gap-1.5 ml-1">
                  {statusIcons.map((statusIcon, index) => {
                    const StatusIconComponent = statusIcon.icon;
                    return (
                      <Tooltip key={index}>
                        <TooltipTrigger asChild>
                          <div>
                            <StatusIconComponent 
                              className={`w-4 h-4 ${statusIcon.color || 'text-muted-foreground'}`}
                              data-testid={`icon-${statusIcon.label.toLowerCase().replace(/\s/g, '-')}`}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{statusIcon.label}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            )}
          </div>
          <div className="flex items-baseline gap-2 justify-between">
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
              <span className="text-sm text-muted-foreground text-right whitespace-nowrap" data-testid="text-additional-info">
                {additionalInfo}
              </span>
            )}
          </div>
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
