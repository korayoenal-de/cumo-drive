# CUMO DRIVE

Navigations App für Sportwagenfahrer: kurvige Strecken, die zum Auto passen, mit Gruppenfahrt und Funk.

## Aufbau

* `app/` Expo App (React Native, Expo Router, TypeScript) für iOS und Android
* `routing/` Routing Prototyp mit Sportwagen Profil auf OpenStreetMap Daten

Projektkontext, Entscheidungen und ToDos liegen im claude.ai Projekt "CUMO DRIVE".

## App starten

```
cd app
npm install
npx expo start
```

Dann den QR Code mit der Kamera des iPhones scannen. Dafür muss die App "Expo Go" installiert sein. Für den iOS Simulator im Terminal `i` drücken (braucht Xcode).

## Prüfen

```
cd app
npx tsc --noEmit
npx expo lint
npx expo-doctor
```
