/** Im Web Planer ohne Apple Karten: ruhige Fläche mit Symbol statt Luftbild */
import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Colors } from '@/constants/theme';
import type { LatLon } from '@/lib/tour';

export function AerialThumb({ height }: { p: LatLon; height: number }) {
  return (
    <View style={[styles.box, { height }]}>
      <SymbolView name="bed.double.fill" size={22} tintColor={Colors.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface2 },
});
