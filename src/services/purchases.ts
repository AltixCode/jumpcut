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
      Purchases.setLogLevel(LOG_LEVEL.WARN);
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
export const getLifetimePackage =
  async (): Promise<PurchasesPackage | null> => {
    if (!(await initPurchases())) return null;
    try {
      const offerings = await Purchases.getOfferings();
      return (
        offerings.current?.lifetime ??
        offerings.current?.availablePackages?.[0] ??
        null
      );
    } catch (error) {
      console.warn("[Purchases] Could not load offerings:", error);
      return null;
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
