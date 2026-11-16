// Metro Einstellungen (Koray 16.11.): livekit-client nur einmal im Paket.
// Unser Funk Code lädt das Paket mit require (UMD Fassung), @livekit/react-native mit import (ESM Fassung).
// So lagen zwei getrennte Kopien im App Paket, mit getrenntem Zustand; vermutlich ein Grund für Abbrüche.
// Jetzt zeigt jeder Aufruf auf die ESM Fassung.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const LIVEKIT_ESM = path.resolve(__dirname, 'node_modules/livekit-client/dist/livekit-client.esm.mjs');
const previous = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  if (name === 'livekit-client') return { type: 'sourceFile', filePath: LIVEKIT_ESM };
  return (previous ?? context.resolveRequest)(context, name, platform);
};

module.exports = config;
