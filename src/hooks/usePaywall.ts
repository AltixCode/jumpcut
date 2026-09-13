import { useCallback, useEffect, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  getLifetimePackage,
  purchaseLifetime,
  restorePurchases,
  PurchaseOutcome,
} from "../services/purchases";
import { useScriptStore } from "../store/useScriptStore";
import { t } from "../i18n";

/**
 * Shared paywall behaviour for the full-screen route and the inline modal, so
 * the two surfaces cannot drift in how they price, unlock, or report failure.
 */
export function usePaywall(onUnlocked: () => void) {
  const { setIsPro } = useScriptStore();
  const [priceString, setPriceString] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLifetimePackage().then((pkg) => {
      if (!cancelled && pkg) setPriceString(pkg.product.priceString);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyOutcome = useCallback(
    (outcome: PurchaseOutcome, emptyMessage: string) => {
      switch (outcome.status) {
        case "unlocked":
          setIsPro(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onUnlocked();
          return;
        case "cancelled":
          // The user dismissed the sheet deliberately; an error here reads as a fault.
          return;
        case "no_entitlement":
          setErrorMsg(emptyMessage);
          return;
        case "store_unavailable":
          setErrorMsg(t("storeUnavailable"));
          return;
        default:
          setErrorMsg(t("purchaseFailed"));
      }
    },
    [onUnlocked, setIsPro],
  );

  const run = useCallback(
    async (
      action: () => Promise<PurchaseOutcome>,
      emptyMessage: string,
      feedback: Haptics.ImpactFeedbackStyle,
    ) => {
      Haptics.impactAsync(feedback);
      setLoading(true);
      setErrorMsg(null);
      try {
        applyOutcome(await action(), emptyMessage);
      } finally {
        setLoading(false);
      }
    },
    [applyOutcome],
  );

  const handlePurchase = useCallback(
    () =>
      run(
        purchaseLifetime,
        t("purchaseFailed"),
        Haptics.ImpactFeedbackStyle.Medium,
      ),
    [run],
  );

  const handleRestore = useCallback(
    () =>
      run(
        restorePurchases,
        t("noPriorPurchases"),
        Haptics.ImpactFeedbackStyle.Light,
      ),
    [run],
  );

  // Falls back to an unpriced label rather than inventing a figure when the
  // catalogue has not loaded yet.
  const ctaLabel = priceString
    ? t("lifetimeAccess", { price: priceString })
    : t("lifetimeAccessPlain");

  return {
    ctaLabel,
    priceString,
    loading,
    errorMsg,
    handlePurchase,
    handleRestore,
  };
}
