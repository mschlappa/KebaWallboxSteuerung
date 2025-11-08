import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface ToggleListItemProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export default function ToggleListItem({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: ToggleListItemProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <Label
            htmlFor={id}
            className="text-base font-medium cursor-pointer block"
          >
            {label}
          </Label>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">
              {description}
            </p>
          )}
        </div>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          data-testid={`switch-${id}`}
        />
      </div>
    </Card>
  );
}
