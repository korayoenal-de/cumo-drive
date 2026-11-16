/**
 * Fahren als Unterseite der Einstellungen: Stimme und Ansagen, Vermeiden für neue Touren und die
 * Kartendarstellung für alle Karten.
 */
import { MapStylePicker } from '@/components/settings/map-style-picker';
import { Group, SubScreen, SwitchRow } from '@/components/settings/settings-ui';
import { VoiceSection } from '@/components/settings/voice-section';
import { AVOID_OPTIONS, useAvoid } from '@/lib/avoid-settings';
import { t } from '@/i18n';

export default function Ansagen() {
  const [avoid, setAvoid] = useAvoid();
  return (
    <SubScreen title={t('Fahren')}>
      <VoiceSection />
      <Group label={t('Vermeiden')} hint={t('Gilt für jede neue Tour. Beim Planen kannst du es auch für eine Tour ändern, das bleibt dann so stehen.')}>
        {AVOID_OPTIONS.map(([key, label]) => (
          <SwitchRow key={key} title={label} value={avoid[key]} onChange={(v) => setAvoid((a) => ({ ...a, [key]: v }))} />
        ))}
      </Group>
      <Group label={t('Kartendarstellung')} hint={t('Gilt für alle Karten der App.')}>
        <MapStylePicker />
      </Group>
    </SubScreen>
  );
}
