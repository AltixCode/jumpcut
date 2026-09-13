const { withMainApplication } = require('expo/config-plugins');

/**
 * Makes device-language RTL actually work on Android.
 *
 * React Native 0.86's I18nUtil decides whether the device language is RTL like
 * this:
 *
 *   TextUtilsCompat.getLayoutDirectionFromLocale(Locale.getAvailableLocales()[0])
 *
 * `getAvailableLocales()[0]` is an arbitrary entry from the JVM's list of every
 * locale it knows -- not the device's language, which would be
 * `Locale.getDefault()`. It is effectively never RTL, so `I18nManager.isRTL`
 * stays false on Android no matter what language the phone is set to, and every
 * `flex-row` keeps its left-to-right order. Arabic and Persian then render
 * translated, right-aligned text inside a mirrored-nothing layout: icons,
 * chevrons and header buttons all on the wrong side.
 *
 * iOS has no equivalent problem once CFBundleLocalizations is declared, which
 * is why this is Android-only.
 *
 * The flag is written before `loadReactNative`, so it applies on the very first
 * launch. Setting it from JS instead would require restarting the app for the
 * change to take effect.
 */
const MARKER = 'AltixCode RTL workaround';

const SNIPPET = `    // ${MARKER}: RN 0.86's I18nUtil reads Locale.getAvailableLocales()[0]
    // rather than Locale.getDefault() when deciding whether the device language
    // is right-to-left, so device-language RTL never activates on Android.
    // Compute it correctly and set the flag before React starts.
    com.facebook.react.modules.i18nmanager.I18nUtil.instance.allowRTL(this, true)
    com.facebook.react.modules.i18nmanager.I18nUtil.instance.forceRTL(
      this,
      androidx.core.text.TextUtilsCompat.getLayoutDirectionFromLocale(java.util.Locale.getDefault()) ==
        android.view.View.LAYOUT_DIRECTION_RTL
    )
`;

const withAndroidRtl = (config) =>
  withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;
    if (cfg.modResults.language !== 'kt') {
      throw new Error('withAndroidRtl: expected a Kotlin MainApplication');
    }
    const anchor = '    loadReactNative(this)';
    if (!src.includes(anchor)) {
      throw new Error('withAndroidRtl: could not find loadReactNative(this) in MainApplication');
    }
    src = src.replace(anchor, SNIPPET + anchor);
    cfg.modResults.contents = src;
    return cfg;
  });

module.exports = withAndroidRtl;
