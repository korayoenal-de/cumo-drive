/**
 * CarPlay für CUMO DRIVE (Freigabe von Apple am 6.11.2026, CarPlay Navigation App):
 * Entitlement com.apple.developer.carplay-maps und eine zweite Szene für das Autodisplay.
 * Die Szene selbst (CarPlaySceneDelegate) liegt in carplay/CarPlayBridge.swift.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

const ROLE = 'CPTemplateApplicationSceneSessionRoleApplication';

module.exports = function withCarPlay(config) {
  config = withEntitlementsPlist(config, (c) => {
    c.modResults['com.apple.developer.carplay-maps'] = true;
    // Wetter an den Pässen (Apple WeatherKit, freigeschaltet am 6.11.2026)
    c.modResults['com.apple.developer.weatherkit'] = true;
    return c;
  });
  config = withInfoPlist(config, (c) => {
    const manifest = c.modResults.UIApplicationSceneManifest ?? {};
    const configs = manifest.UISceneConfigurations ?? {};
    configs[ROLE] = [
      {
        UISceneClassName: 'CPTemplateApplicationScene',
        UISceneConfigurationName: 'CarPlay',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).CarPlaySceneDelegate',
      },
    ];
    // Build 14: Karte im Dashboard (geteilter Bildschirm) und im Kombiinstrument
    configs.CPTemplateApplicationDashboardSceneSessionRoleApplication = [
      {
        UISceneClassName: 'CPTemplateApplicationDashboardScene',
        UISceneConfigurationName: 'CarPlay Dashboard',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).CarPlayDashboardDelegate',
      },
    ];
    configs.CPTemplateApplicationInstrumentClusterSceneSessionRoleApplication = [
      {
        UISceneClassName: 'CPTemplateApplicationInstrumentClusterScene',
        UISceneConfigurationName: 'CarPlay Kombiinstrument',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).CarPlayClusterDelegate',
      },
    ];
    manifest.UISceneConfigurations = configs;
    c.modResults.UIApplicationSceneManifest = manifest;
    c.modResults.CPSupportsDashboardNavigationScene = true;
    c.modResults.CPSupportsInstrumentClusterNavigationScene = true;
    return c;
  });
  // Eigene Navigationssymbole fürs Autodisplay (assets/carplay-icons, erzeugt von scripts/carplay-icons.sh)
  config = withDangerousMod(config, [
    'ios',
    (c) => {
      const src = path.join(c.modRequest.projectRoot, 'assets', 'carplay-icons');
      const xcassets = path.join(c.modRequest.platformProjectRoot, c.modRequest.projectName, 'Images.xcassets');
      if (!fs.existsSync(src) || !fs.existsSync(xcassets)) return c;
      const names = new Set(fs.readdirSync(src).filter((f) => f.endsWith('.png')).map((f) => f.replace(/@[23]x\.png$/, '')));
      for (const n of names) {
        const dir = path.join(xcassets, `${n}.imageset`);
        fs.mkdirSync(dir, { recursive: true });
        const images = [];
        for (const scale of ['2x', '3x']) {
          const file = `${n}@${scale}.png`;
          if (!fs.existsSync(path.join(src, file))) continue;
          fs.copyFileSync(path.join(src, file), path.join(dir, file));
          images.push({ idiom: 'universal', filename: file, scale });
        }
        fs.writeFileSync(path.join(dir, 'Contents.json'), JSON.stringify({ images, info: { version: 1, author: 'cumo' } }, null, 2));
      }
      return c;
    },
  ]);
  return config;
};
