import { Platform } from "react-native";
import Purchases, { PurchasesPackage, LOG_LEVEL } from "react-native-purchases";

/**
 * The RevenueCat entitlement one purchase grants.
 *
 * The lookup key says "remove ads" because that is what the store product is named, but the
 * entitlement carries the whole upgrade: no ads *and* no free-tier limits. Keeping the key as
 * RevenueCat has it matters more than the name reading perfectly here -- renaming an
 * entitlement means recreating it, and the SDK keys die with it.
 */
const ENTITLEMENT_ID = "remove_ads";

const RC_API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_RC_IOS_KEY || "appl_DPSsxDIBGfQLwjvCtyGcPWYnjjB",
  android:
    process.env.EXPO_PUBLIC_RC_ANDROID_KEY ||
    "goog_NGdIrUUVKqEfTxHtpmqvAWYYmBP",
});

/**
 * Why the outcome is a tagged union rather than a boolean: a boolean cannot
 * distinguish "the store said no" from "we never reached the store", and the
 * previous implementation resolved that ambiguity by granting Pro. Callers must
 * be able to tell a cancellation (say nothing) from an outage (say "try again")
 * from a genuine absence of entitlement (say "nothing to restore").
 */
export type PurchaseOutcome =
  | { status: "unlocked" }
  | { status: "cancelled" }
  | { status: "no_entitlement" }
  | { status: "store_unavailable" }
  | { status: "failed"; message?: string };

let isInitialized = false;
let initPromise: Promise<boolean> | null = null;

const hasProEntitlement = (info: {
  entitlements: { active: Record<string, unknown> };
}): boolean => info.entitlements.active[ENTITLEMENT_ID] !== undefined;

/**
 * Configures the RevenueCat SDK exactly once. Safe to call from several screens;
 * concurrent callers await the same in-flight attempt.
 */
export const initPurchases = async (): Promise<boolean> => {
  if (isInitialized) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (!RC_API_KEY) return false;
      // Silence the SDK's own logs while capturing store screenshots.
      //
      // RevenueCat logs at WARN with a distinctive prefix, and in a DEBUG build
      // -- which every capture is -- each one becomes a LogBox toast docked at
      // the bottom of the screen. Four apps shipped IAP review screenshots with
      // that toast covering the buy button, and one (scanlit) with a toast at
      // almost exactly the app's own luminance, which no pixel check can see.
      //
      // The warnings are useful in ordinary development, so this silences them
      // only under the capture flag, and __DEV__ keeps it inert in anything
      // that ships.
      const capturing = __DEV__ && process.env.EXPO_PUBLIC_CAPTURE_MODE === '1';
      Purchases.setLogLevel(capturing ? LOG_LEVEL.ERROR : LOG_LEVEL.WARN);
      await Purchases.configure({ apiKey: RC_API_KEY });
      isInitialized = true;
      return true;
    } catch (error) {
      console.warn("[Purchases] Configuration failed:", error);
      return false;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
};

/**
 * The lifetime package from the current offering, or null when the catalogue is
 * unreachable. Used to render the real, store-localized price on the paywall —
 * App Review rejects paywalls whose displayed price is baked into the bundle.
 */
/**
 * The package a store screenshot shows when the simulator has no store.
 *
 * A StoreKit configuration cannot reach this pipeline. Xcode applies one by
 * syncing it to the device as part of running a scheme --
 * `-[DVTDevice handleStoreKitConfigurationSyncForBundleID:configurationFilePath:]`
 * -- and `xcrun simctl` has no equivalent, so an `expo run:ios` plus
 * `simctl launch` build never receives a product catalogue however correct its
 * .storekit file is. The paywall then renders its unavailable state, and the
 * IAP review screenshot Apple sees says "The store is not reachable right now"
 * where the buy button belongs. Several live ones do.
 *
 * So capture mode supplies the price from the build instead. The figure comes
 * from `scripts/iap.json`, read out of the App Store Connect price schedule, so
 * the screenshot states this product's real cost -- it simply learns it from
 * the bundle rather than from StoreKit.
 *
 * `__DEV__` is what makes this safe: it is false in every release build, so
 * this is inert in anything that ships no matter how the environment is set.
 */
const capturePriceFallback = (): PurchasesPackage | null => {
  const price = process.env.EXPO_PUBLIC_CAPTURE_PRICE;
  const capturing = __DEV__ && process.env.EXPO_PUBLIC_CAPTURE_MODE === '1';
  if (!capturing || !price) return null;
  const amount = Number(price.replace(/[^0-9.]/g, '')) || 0;
  // Shaped like a package for display only. Nothing purchases it: a capture
  // route is forbidden from tapping a purchase button, and a release build
  // never reaches this line.
  return {
    identifier: 'lifetime',
    packageType: 'LIFETIME',
    offeringIdentifier: 'capture',
    product: {
      identifier: 'capture.lifetime',
      priceString: price.startsWith('$') ? price : `$${price}`,
      price: amount,
      currencyCode: 'USD',
    },
  } as unknown as PurchasesPackage;
};

export const getLifetimePackage =
  async (): Promise<PurchasesPackage | null> => {
    if (!(await initPurchases())) return capturePriceFallback();
    try {
      const offerings = await Purchases.getOfferings();
      return (
        offerings.current?.lifetime ??
        offerings.current?.availablePackages?.[0] ??
        null
      );
    } catch (error) {
      console.warn("[Purchases] Could not load offerings:", error);
      return capturePriceFallback();
    }
  };

export const purchaseLifetime = async (): Promise<PurchaseOutcome> => {
  if (!(await initPurchases())) return { status: "store_unavailable" };

  let pkg: PurchasesPackage | null;
  try {
    pkg = await getLifetimePackage();
  } catch {
    return { status: "store_unavailable" };
  }
  if (!pkg) return { status: "store_unavailable" };

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return hasProEntitlement(customerInfo)
      ? { status: "unlocked" }
      : { status: "no_entitlement" };
  } catch (error) {
    const err = error as { userCancelled?: boolean; message?: string };
    if (err.userCancelled) return { status: "cancelled" };
    console.warn("[Purchases] Purchase failed:", error);
    return { status: "failed", message: err.message };
  }
};

export const restorePurchases = async (): Promise<PurchaseOutcome> => {
  if (!(await initPurchases())) return { status: "store_unavailable" };
  try {
    const customerInfo = await Purchases.restorePurchases();
    return hasProEntitlement(customerInfo)
      ? { status: "unlocked" }
      : { status: "no_entitlement" };
  } catch (error) {
    console.warn("[Purchases] Restore failed:", error);
    return {
      status: "failed",
      message: (error as { message?: string }).message,
    };
  }
};

/**
 * Resolves false whenever entitlement cannot be confirmed, including when the
 * store is unreachable. RevenueCat serves a cached CustomerInfo offline, so a
 * paying user who has launched the app once before stays unlocked on a flight.
 */
export const checkIsPro = async (): Promise<boolean> => {
  if (!(await initPurchases())) return false;
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return hasProEntitlement(customerInfo);
  } catch {
    return false;
  }
};
