/**
 * Luftbild eines Orts als Kartenbild (Apple Karten, Satellit mit 3D wo vorhanden). Platzhalter, bis
 * wir echte Fotos mit geklärten Rechten haben; nicht bedienbar, nur zum Anschauen.
 */
import { StyleSheet, View } from 'react-native';
import MapView from 'react-native-maps';

import { Colors } from '@/constants/theme';
import type { LatLon } from '@/lib/tour';

export function AerialThumb({ p, height }: { p: LatLon; height: number }) {
  return (
    <View style={[styles.box, { height }]} pointerEvents="none" accessible={false}>
      <MapView
        style={StyleSheet.absoluteFill}
        mapType="satelliteFlyover"
        initialCamera={{ center: { latitude: p[0], longitude: p[1] }, pitch: 45, heading: 0, altitude: 420, zoom: 17 }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        showsCompass={false}
        showsScale={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        liteMode
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: Colors.surface2 },
});
