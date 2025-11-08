import StatusCard from '../StatusCard';
import { Battery, Plug, Zap } from 'lucide-react';

export default function StatusCardExample() {
  return (
    <div className="space-y-4 p-4">
      <StatusCard
        icon={Zap}
        title="Ladeleistung"
        value="11.5"
        unit="kW"
        status="charging"
        badge="Lädt"
      />
      <StatusCard
        icon={Battery}
        title="Energie"
        value="24.3"
        unit="kWh"
        status="charging"
      />
      <StatusCard
        icon={Plug}
        title="Stecker"
        value="Verbunden"
        status="ready"
        badge="Bereit"
      />
    </div>
  );
}
