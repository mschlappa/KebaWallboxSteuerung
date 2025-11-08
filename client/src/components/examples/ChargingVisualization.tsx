import { useState } from 'react';
import ChargingVisualization from '../ChargingVisualization';
import { Button } from '@/components/ui/button';

export default function ChargingVisualizationExample() {
  const [scenario, setScenario] = useState<'charging' | 'plugged' | 'unplugged'>('charging');

  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-2 justify-center">
        <Button
          size="sm"
          variant={scenario === 'charging' ? 'default' : 'outline'}
          onClick={() => setScenario('charging')}
        >
          Lädt
        </Button>
        <Button
          size="sm"
          variant={scenario === 'plugged' ? 'default' : 'outline'}
          onClick={() => setScenario('plugged')}
        >
          Eingesteckt
        </Button>
        <Button
          size="sm"
          variant={scenario === 'unplugged' ? 'default' : 'outline'}
          onClick={() => setScenario('unplugged')}
        >
          Nicht verbunden
        </Button>
      </div>
      
      <ChargingVisualization
        isCharging={scenario === 'charging'}
        isPluggedIn={scenario === 'charging' || scenario === 'plugged'}
      />
    </div>
  );
}
