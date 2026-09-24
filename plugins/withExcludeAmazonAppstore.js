const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Excludes the Amazon Appstore SDK that RevenueCat's Android SDK pulls in unconditionally.
 *
 * `react-native-purchases` depends on `purchases-hybrid-common`, which depends on
 * `com.revenuecat.purchases:purchases-store-amazon`, which depends on
 * `com.amazon.device:amazon-appstore-sdk:3.0.5` — regardless of whether the app ever
 * configures an Amazon store. RevenueCat only activates that code path when
 * `Purchases.configure(..., useAmazon: true)` is called (see
 * `RNPurchasesModule.java`, `configureAmazon`); this app never does (grep the whole
 * `src/` tree for "amazon" — nothing), so the classes are dead weight on every build.
 *
 * That dead weight is not free. `amazon-appstore-sdk` predates the modern Java
 * bytecode verifier and ships class files with no stack map table, so R8 emits one
 * "Expected stack map table for method with non-linear control flow" warning per
 * affected method — thousands of them — while minifying. Building and holding that
 * many diagnostic messages in memory is what exhausts the JVM's Metaspace and crashes
 * `minifyReleaseWithR8` with `java.lang.OutOfMemoryError: Metaspace`, discovered
 * 2026-09-24 and patched fleet-wide by raising `-XX:MaxMetaspaceSize` 512m -> 1536m.
 * That bump papers over the crash; it does not remove its cause, and this app hit the
 * warning storm disproportionately often against the same shared Metaspace ceiling
 * every other app in the portfolio uses.
 *
 * The real fix is to never hand the dependency to R8 at all: exclude it from every
 * configuration before resolution. Traced with
 * `./gradlew :app:dependencies --configuration releaseRuntimeClasspath | grep -B20 amazon`
 * on 2026-09-24 — the exact (and only) path is
 * react-native-purchases -> purchases-hybrid-common:18.37.0 ->
 * purchases-store-amazon:10.20.0 -> amazon-appstore-sdk:3.0.5.
 */
module.exports = function withExcludeAmazonAppstore(config) {
  return withAppBuildGradle(config, (cfg) => {
    const marker = "apply plugin: 'com.facebook.react'";
    const exclusion = `
// Added by plugins/withExcludeAmazonAppstore.js — see that file for why. RevenueCat's
// SDK pulls in Amazon Appstore support unconditionally; this app never uses it
// (Purchases.configure is never called with useAmazon: true), and R8's handling of
// that dependency's stack-map-less class files is what was crashing release builds
// with OutOfMemoryError: Metaspace.
configurations.all {
    exclude group: 'com.amazon.device', module: 'amazon-appstore-sdk'
}
`;

    if (!cfg.modResults.contents.includes('com.amazon.device')) {
      if (cfg.modResults.contents.includes(marker)) {
        cfg.modResults.contents = cfg.modResults.contents.replace(
          marker,
          `${marker}\n${exclusion}`,
        );
      } else {
        // Fall back to appending if the react plugin marker ever moves.
        cfg.modResults.contents += `\n${exclusion}`;
      }
    }

    return cfg;
  });
};
