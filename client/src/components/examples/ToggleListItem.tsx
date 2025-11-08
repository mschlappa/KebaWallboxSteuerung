import { useState } from 'react';
import ToggleListItem from '../ToggleListItem';

export default function ToggleListItemExample() {
  const [checked1, setChecked1] = useState(true);
  const [checked2, setChecked2] = useState(false);
  const [checked3, setChecked3] = useState(true);

  return (
    <div className="space-y-2 p-4">
      <ToggleListItem
        id="pv-surplus"
        label="PV Überschussladung"
        description="Laden mit Solarstrom-Überschuss"
        checked={checked1}
        onCheckedChange={setChecked1}
      />
      <ToggleListItem
        id="night-charging"
        label="Nachtladung"
        description="Automatisches Laden nachts"
        checked={checked2}
        onCheckedChange={setChecked2}
      />
      <ToggleListItem
        id="battery-lock"
        label="Batterie entladen sperren"
        description="Hausbatterie vor Entladung schützen"
        checked={checked3}
        onCheckedChange={setChecked3}
      />
    </div>
  );
}
