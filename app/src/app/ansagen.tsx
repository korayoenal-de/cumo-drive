/**
 * Fahren als Unterseite der Einstellungen: Stimme und Ansagen, dazu die Kartendarstellung für alle Karten.
 */
import { MapStylePicker } from '@/components/settings/map-style-picker';
import { Group, SubScreen } from '@/components/settings/settings-ui';
import { VoiceSection } from '@/components/settings/voice-section';

export default function Ansagen() {
  return (
    <SubScreen title="Fahren">
      <VoiceSection />
      <Group label="Kartendarstellung" hint="Gilt für alle Karten der App.">
        <MapStylePicker />
      </Group>
    </SubScreen>
  );
}
