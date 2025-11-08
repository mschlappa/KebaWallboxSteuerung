import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { settingsSchema } from "@shared/schema";
import type { Settings } from "@shared/schema";
import { z } from "zod";

export default function SettingsPage() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const form = useForm<Settings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      wallboxIp: "192.168.40.16",
      pvSurplusOnUrl: "http://192.168.40.11:8083/fhem?detail=autoWallboxPV&cmd.autoWallboxPV=set%20autoWallboxPV%20on",
      pvSurplusOffUrl: "http://192.168.40.11:8083/fhem?detail=autoWallboxPV&cmd.autoWallboxPV=set%20autoWallboxPV%20off",
      nightChargingOnUrl: "http://192.168.40.11:8083/fhem?detail=steckdoseAutoNachtladung&cmd.steckdoseAutoNachtladung=set%20steckdoseAutoNachtladung%20on",
      nightChargingOffUrl: "http://192.168.40.11:8083/fhem?detail=steckdoseAutoNachtladung&cmd.steckdoseAutoNachtladung=set%20steckdoseAutoNachtladung%20off",
      batteryLockOnUrl: "http://192.168.40.11:8083/fhem?detail=s10EntladenSperren&cmd.s10EntladenSperren=set%20s10EntladenSperren%20on",
      batteryLockOffUrl: "http://192.168.40.11:8083/fhem?detail=s10EntladenSperren&cmd.s10EntladenSperren=set%20s10EntladenSperren%20off",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset(settings);
    }
  }, [settings, form]);

  const saveSettingsMutation = useMutation({
    mutationFn: (data: Settings) =>
      apiRequest("POST", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Einstellungen gespeichert",
        description: "Ihre Konfiguration wurde erfolgreich gespeichert.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Die Einstellungen konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  const handleSave = (data: Settings) => {
    saveSettingsMutation.mutate(data);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto pb-24 pt-6">
        <div className="max-w-2xl mx-auto px-4 space-y-6">
          <div>
            <h1 className="text-2xl font-bold mb-2">Einstellungen</h1>
            <p className="text-sm text-muted-foreground">
              Wallbox-IP und SmartHome-URLs konfigurieren
            </p>
          </div>

          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="wallbox-ip" className="text-sm font-medium">
                Wallbox IP-Adresse
              </Label>
              <Input
                id="wallbox-ip"
                type="text"
                placeholder="192.168.40.16"
                {...form.register("wallboxIp")}
                className="h-12"
                data-testid="input-wallbox-ip"
              />
              <p className="text-xs text-muted-foreground">
                IP-Adresse Ihrer KEBA Wallbox im lokalen Netzwerk
              </p>
            </div>

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="pv-surplus">
                <AccordionTrigger className="text-base font-medium">
                  PV Überschussladung URLs
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label htmlFor="pv-on" className="text-sm font-medium">
                        URL zum Einschalten
                      </Label>
                      <Input
                        id="pv-on"
                        type="url"
                        placeholder="https://smarthome.local/pv/on"
                        {...form.register("pvSurplusOnUrl")}
                        className="h-12"
                        data-testid="input-pv-on"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pv-off" className="text-sm font-medium">
                        URL zum Ausschalten
                      </Label>
                      <Input
                        id="pv-off"
                        type="url"
                        placeholder="https://smarthome.local/pv/off"
                        {...form.register("pvSurplusOffUrl")}
                        className="h-12"
                        data-testid="input-pv-off"
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="night-charging">
                <AccordionTrigger className="text-base font-medium">
                  Nachtladung URLs
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label htmlFor="night-on" className="text-sm font-medium">
                        URL zum Einschalten
                      </Label>
                      <Input
                        id="night-on"
                        type="url"
                        placeholder="https://smarthome.local/night/on"
                        {...form.register("nightChargingOnUrl")}
                        className="h-12"
                        data-testid="input-night-on"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="night-off" className="text-sm font-medium">
                        URL zum Ausschalten
                      </Label>
                      <Input
                        id="night-off"
                        type="url"
                        placeholder="https://smarthome.local/night/off"
                        {...form.register("nightChargingOffUrl")}
                        className="h-12"
                        data-testid="input-night-off"
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="battery-lock">
                <AccordionTrigger className="text-base font-medium">
                  Batterie entladen sperren URLs
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label htmlFor="battery-on" className="text-sm font-medium">
                        URL zum Einschalten
                      </Label>
                      <Input
                        id="battery-on"
                        type="url"
                        placeholder="https://smarthome.local/battery/lock"
                        {...form.register("batteryLockOnUrl")}
                        className="h-12"
                        data-testid="input-battery-on"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="battery-off" className="text-sm font-medium">
                        URL zum Ausschalten
                      </Label>
                      <Input
                        id="battery-off"
                        type="url"
                        placeholder="https://smarthome.local/battery/unlock"
                        {...form.register("batteryLockOffUrl")}
                        className="h-12"
                        data-testid="input-battery-off"
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <Button
              type="submit"
              size="lg"
              className="w-full h-12 text-base font-medium"
              data-testid="button-save-settings"
              disabled={isLoading || saveSettingsMutation.isPending}
            >
              {saveSettingsMutation.isPending ? "Wird gespeichert..." : "Einstellungen speichern"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
