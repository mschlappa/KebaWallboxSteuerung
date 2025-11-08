import ToggleListItem from "@/components/ToggleListItem";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ControlState } from "@shared/schema";

export default function ControlsPage() {
  const { toast } = useToast();

  const { data: controlState } = useQuery<ControlState>({
    queryKey: ["/api/controls"],
  });

  const updateControlsMutation = useMutation({
    mutationFn: (newState: ControlState) =>
      apiRequest("POST", "/api/controls", newState),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/controls"] });
      toast({
        title: "Steuerung aktualisiert",
        description: "Die SmartHome-Funktion wurde erfolgreich geändert.",
      });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/controls"] });
      toast({
        title: "Fehler",
        description: "Die Steuerung konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  const handlePvSurplusChange = (checked: boolean) => {
    updateControlsMutation.mutate({
      pvSurplus: checked,
      nightCharging: controlState?.nightCharging || false,
      batteryLock: controlState?.batteryLock || false,
    });
  };

  const handleNightChargingChange = (checked: boolean) => {
    updateControlsMutation.mutate({
      pvSurplus: controlState?.pvSurplus || false,
      nightCharging: checked,
      batteryLock: controlState?.batteryLock || false,
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/controls"] });
        if (checked) {
          toast({
            title: "Nachtladung aktiviert",
            description: "Der Ladestrom wird automatisch auf Maximum gesetzt.",
          });
        } else {
          toast({
            title: "Nachtladung deaktiviert",
            description: "Die SmartHome-Funktion wurde erfolgreich geändert.",
          });
        }
      }
    });
  };

  const handleBatteryLockChange = (checked: boolean) => {
    updateControlsMutation.mutate({
      pvSurplus: controlState?.pvSurplus || false,
      nightCharging: controlState?.nightCharging || false,
      batteryLock: checked,
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto pb-24 pt-6">
        <div className="max-w-2xl mx-auto px-4 space-y-6">
          <div>
            <h1 className="text-2xl font-bold mb-2">Steuerung</h1>
            <p className="text-sm text-muted-foreground">
              SmartHome-Funktionen aktivieren und deaktivieren
            </p>
          </div>

          <div className="space-y-2">
            <ToggleListItem
              id="pv-surplus"
              label="PV Überschussladung"
              description="Automatisches Laden bei Solarstrom-Überschuss"
              checked={controlState?.pvSurplus || false}
              onCheckedChange={handlePvSurplusChange}
            />

            <ToggleListItem
              id="night-charging"
              label="Nachtladung"
              description="Zeitgesteuertes Laden in der Nacht"
              checked={controlState?.nightCharging || false}
              onCheckedChange={handleNightChargingChange}
            />

            <ToggleListItem
              id="battery-lock"
              label="Batterie entladen sperren"
              description="Verhindert Entladung der Hausbatterie"
              checked={controlState?.batteryLock || false}
              onCheckedChange={handleBatteryLockChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
