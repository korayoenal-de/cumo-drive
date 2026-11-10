/**
 * Garage als Unterseite der Einstellungen: Fahrzeuge anlegen, bearbeiten, das aktuelle wählen.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { Garage } from '@/components/settings/garage';
import { SubScreen } from '@/components/settings/settings-ui';
import { useSession } from '@/lib/auth';
import { listDrives, type Drive } from '@/lib/drives';

export default function GarageScreen() {
  const session = useSession();
  const [drives, setDrives] = useState<Drive[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      listDrives()
        .then(setDrives)
        .catch(() => setDrives([]));
    }, [session]),
  );
  return (
    <SubScreen title="Garage">
      <Garage drives={session ? drives : null} />
    </SubScreen>
  );
}
