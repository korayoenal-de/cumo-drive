/**
 * CarPlay für CUMO DRIVE (Freigabe von Apple am 6.11.2026, CarPlay Navigation App):
 * Entitlement com.apple.developer.carplay-maps und eine zweite Szene für das Autodisplay.
 * Die Szene selbst (CarPlaySceneDelegate) liegt in carplay/CarPlayBridge.swift.
 */
const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

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
    manifest.UISceneConfigurations = configs;
    c.modResults.UIApplicationSceneManifest = manifest;
    return c;
  });
  return config;
};
