const { withDangerousMod, withAndroidManifest } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Declares the app's supported languages to Android.
 *
 * Without this an Expo app ships only a default `values/` resource folder, so
 * Android resolves the app to its default locale no matter what the system
 * language is. The visible symptom is the same one the iOS side had: Arabic and
 * Persian text renders and right-aligns (the text engine does that on its own)
 * while the layout stays left-to-right, because the resolved resource
 * configuration never becomes RTL and `I18nManager.isRTL` stays false. Icons,
 * chevrons and header buttons then sit on the wrong side.
 *
 * Two things are written:
 *  - `res/values-<lang>/strings.xml` per locale, which is what makes Android
 *    treat the locale as supported during resource resolution.
 *  - `res/xml/locales_config.xml` plus `android:localeConfig`, which on API 33+
 *    also gives the app an entry in Android's per-app language picker.
 *
 * The JS dictionary in `src/i18n` remains the source of the actual copy; these
 * resources exist so the platform knows which languages the app claims.
 */
const withAndroidLocales = (config, { locales } = {}) => {
  if (!locales || !locales.length) throw new Error('withAndroidLocales: locales required');

  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res');
      const appName = cfg.name;

      for (const locale of locales) {
        if (locale === 'en') continue; // the default `values/` folder
        const dir = path.join(res, `values-${locale}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, 'strings.xml'),
          `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="app_name">${appName}</string>\n</resources>\n`
        );
      }

      const xmlDir = path.join(res, 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, 'locales_config.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<locale-config xmlns:android="http://schemas.android.com/apk/res/android">\n` +
          locales.map((l) => `  <locale android:name="${l}"/>`).join('\n') +
          `\n</locale-config>\n`
      );
      return cfg;
    },
  ]);

  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) throw new Error('withAndroidLocales: no <application> in the manifest');
    app.$['android:localeConfig'] = '@xml/locales_config';
    return cfg;
  });
};

module.exports = withAndroidLocales;
