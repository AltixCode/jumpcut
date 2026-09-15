import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Native configuration that has to come from the environment.
 *
 * Everything static stays in `app.json`; this file only layers on the pieces that differ
 * between a developer build and a store build. AdMob *app* ids are baked into the native
 * manifests, so they cannot be read from JS at runtime -- they must be resolved here.
 *
 * They are public identifiers rather than secrets, but they still come from the environment so
 * a developer build can never ship with production ad units. With nothing configured the
 * Google sample app ids are used, which only ever serve test ads. `npm run check:release`
 * is what stops that fallback from reaching the stores.
 */

const IOS_ADMOB_APP_ID =
  process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || 'ca-app-pub-3940256099942544~1458002511';
const ANDROID_ADMOB_APP_ID =
  process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713';

/**
 * Why the app asks for tracking at all, in the user's words. Apple rejects a prompt whose
 * purpose string is vague, and the honest version is also the one most likely to be accepted:
 * it changes which ads are shown and nothing else about the app.
 */
const TRACKING_PURPOSE =
  'This lets JumpCut show ads that are more relevant to you. Your videos are never uploaded, your data is never sold, and the app works exactly the same either way.';

/**
 * SKAdNetwork identifiers for the ad networks AdMob mediates on iOS. Without these, iOS
 * install attribution silently fails. Sourced from the Google Mobile Ads SDK docs; refresh
 * from https://developers.google.com/admob/ios/3p-skadnetworks when the SDK is updated.
 */
const SK_AD_NETWORK_ITEMS = [
  'cstr6suwn9.skadnetwork',
  '4fzdc2evr5.skadnetwork',
  '2fnua5tdw4.skadnetwork',
  'ydx93a7ass.skadnetwork',
  'p78axxw29g.skadnetwork',
  'v72qych5uu.skadnetwork',
  'ludvb6z3bs.skadnetwork',
  'cp8zw746q7.skadnetwork',
  '3sh42y64q3.skadnetwork',
  'c6k4g5qg8m.skadnetwork',
  's39g8k73mm.skadnetwork',
  'wg4vff78zm.skadnetwork',
  '3qy4746246.skadnetwork',
  'f38h382jlk.skadnetwork',
  'hs6bdukanm.skadnetwork',
  'mlmmfzh3r3.skadnetwork',
  'v4nxqhlyqp.skadnetwork',
  'wzmmz9fp6w.skadnetwork',
  'su67r6k2v3.skadnetwork',
  'yclnxrl5pm.skadnetwork',
  't38b2kh725.skadnetwork',
  '7ug5zh24hu.skadnetwork',
  'gta9lk7p23.skadnetwork',
  'vutu7akeur.skadnetwork',
  'y5ghdn5j9k.skadnetwork',
  'v9wttpbfk9.skadnetwork',
  'n38lu8286q.skadnetwork',
  '47vhws6wlr.skadnetwork',
  'kbd757ywx3.skadnetwork',
  '9t245vhmpl.skadnetwork',
  'a2p9lx4jpn.skadnetwork',
  '22mmun2rn5.skadnetwork',
  '44jx6755aq.skadnetwork',
  'k674qkevps.skadnetwork',
  '4468km3ulz.skadnetwork',
  '2u9pt9hc89.skadnetwork',
  '8s468mfl3y.skadnetwork',
  'klf5c3l5u5.skadnetwork',
  'ppxm28t8ap.skadnetwork',
  'kbmxgpxpgc.skadnetwork',
  'uw77j35x4d.skadnetwork',
  '578prtvx9j.skadnetwork',
  '4dzt52r2t5.skadnetwork',
  'tl55sbb4fm.skadnetwork',
  'c3frkrj4fj.skadnetwork',
  'e5fvkxwrpn.skadnetwork',
  '8c4e2ghe7u.skadnetwork',
  '3rd42ekr43.skadnetwork',
  '97r2b46745.skadnetwork',
  '3qcr597p9d.skadnetwork',
];

export default ({ config }: ConfigContext): ExpoConfig => {
  // The static config already lists expo-tracking-transparency without a purpose string.
  // Replacing the entry rather than appending avoids a duplicate plugin, which Expo resolves
  // by last-one-wins -- silently, and in whichever order the array happens to be in.
  const basePlugins = (config.plugins ?? []).filter(
    (plugin) =>
      !(typeof plugin === 'string'
        ? plugin === 'expo-tracking-transparency'
        : plugin?.[0] === 'expo-tracking-transparency'),
  );

  return {
    ...config,
    name: config.name ?? 'JumpCut',
    slug: config.slug ?? 'jumpcut',
    plugins: [
      ...basePlugins,
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: ANDROID_ADMOB_APP_ID,
          iosAppId: IOS_ADMOB_APP_ID,
          userTrackingUsageDescription: TRACKING_PURPOSE,
          skAdNetworkItems: SK_AD_NETWORK_ITEMS,
        },
      ],
      ['expo-tracking-transparency', { userTrackingPermission: TRACKING_PURPOSE }],
    ],
  };
};
