/**
 * Live Activity der Navigation: nächstes Manöver auf dem Sperrbildschirm, in der Dynamic Island
 * und (ab iOS 26) auf dem CarPlay Dashboard.
 *
 * Achtung: Die Funktion mit 'widget' läuft isoliert im Widget Prozess. Keine Hooks, keine Imports
 * im Rumpf, keine Konstanten von außen. Alles Nötige kommt über die Props.
 */
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { activityBackgroundTint, font, foregroundStyle, lineLimit, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type NavActivityProps = {
  /** SF Symbol für das Manöver, zum Beispiel arrow.turn.up.right */
  symbol: string;
  /** Distanz zum Manöver, fertig formatiert, zum Beispiel 350 */
  dist: string;
  /** Einheit, m oder km */
  unit: string;
  /** Anweisung, zum Beispiel Rechts abbiegen */
  text: string;
  /** Straße nach dem Manöver */
  street: string;
  /** Ankunft, zum Beispiel 14:32 */
  eta: string;
  /** Restweg, zum Beispiel 86 km */
  rest: string;
  /** Manöver steht kurz bevor */
  soon: boolean;
  /** Tourname */
  tour: string;
};

const NavActivity = (p: NavActivityProps, env: LiveActivityEnvironment) => {
  'widget';
  const signal = '#E2461C';
  const arrowColor = env.isLuminanceReduced ? '#FFFFFF' : signal;
  const arrow = p.symbol as never;
  return {
    banner: (
      <HStack spacing={14} modifiers={[padding({ all: 16 }), activityBackgroundTint('#0B0B0C')]}>
        <Image systemName={arrow} size={40} color={arrowColor} />
        <VStack alignment="leading" spacing={2}>
          <HStack alignment="firstTextBaseline" spacing={4}>
            <Text modifiers={[font({ weight: 'black', size: 30 }), monospacedDigit(), foregroundStyle('#FFFFFF')]}>{p.dist}</Text>
            <Text modifiers={[font({ weight: 'bold', size: 16 }), foregroundStyle('#9A9AA0')]}>{p.unit}</Text>
          </HStack>
          <Text modifiers={[font({ weight: 'semibold', size: 15 }), foregroundStyle('#FFFFFF'), lineLimit(1)]}>{p.text}</Text>
          {p.street ? <Text modifiers={[font({ size: 13 }), foregroundStyle('#9A9AA0'), lineLimit(1)]}>{p.street}</Text> : null}
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={2}>
          <Text modifiers={[font({ weight: 'bold', size: 17 }), monospacedDigit(), foregroundStyle('#FFFFFF')]}>{p.eta}</Text>
          <Text modifiers={[font({ size: 13 }), foregroundStyle('#9A9AA0')]}>{p.rest}</Text>
        </VStack>
      </HStack>
    ),
    bannerSmall: (
      <HStack spacing={8} modifiers={[padding({ all: 8 })]}>
        <Image systemName={arrow} size={22} color={arrowColor} />
        <Text modifiers={[font({ weight: 'bold', size: 15 }), monospacedDigit()]}>{`${p.dist} ${p.unit}`}</Text>
        <Text modifiers={[font({ size: 13 }), lineLimit(1)]}>{p.text}</Text>
      </HStack>
    ),
    compactLeading: <Image systemName={arrow} color={arrowColor} />,
    compactTrailing: <Text modifiers={[font({ weight: 'bold' }), monospacedDigit()]}>{`${p.dist} ${p.unit}`}</Text>,
    minimal: <Image systemName={arrow} color={arrowColor} />,
    expandedLeading: <Image systemName={arrow} size={36} color={arrowColor} />,
    expandedCenter: (
      <VStack alignment="leading" spacing={2}>
        <HStack alignment="firstTextBaseline" spacing={4}>
          <Text modifiers={[font({ weight: 'black', size: 26 }), monospacedDigit()]}>{p.dist}</Text>
          <Text modifiers={[font({ weight: 'bold', size: 15 }), foregroundStyle('#9A9AA0')]}>{p.unit}</Text>
        </HStack>
        <Text modifiers={[font({ weight: 'semibold', size: 14 }), lineLimit(1)]}>{p.text}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={2}>
        <Text modifiers={[font({ weight: 'bold', size: 15 }), monospacedDigit()]}>{p.eta}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle('#9A9AA0')]}>{p.rest}</Text>
      </VStack>
    ),
    expandedBottom: p.street ? <Text modifiers={[font({ size: 13 }), foregroundStyle('#9A9AA0'), lineLimit(1)]}>{`${p.street}  ·  ${p.tour}`}</Text> : <Text modifiers={[font({ size: 13 }), foregroundStyle('#9A9AA0')]}>{p.tour}</Text>,
  };
};

export default createLiveActivity('NavActivity', NavActivity);
