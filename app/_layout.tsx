import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LogBox, TouchableOpacity, Text } from "react-native";
import { Crown } from "lucide-react-native";
import { initPurchases, checkIsPro } from "../src/services/purchases";
import { initializeAds } from "../src/services/ads";
import { useAdsStore } from "../src/store/adsStore";
import { useCutStore } from "../src/store/useCutStore";
import { useTheme } from "../src/theme/useTheme";
import { t } from "../src/i18n";
import "../global.css";

/**
 * No LogBox toast in a capture build.
 *
 * Setting the RevenueCat log level down to ERROR silences its chatter but not
 * its errors -- and in a simulator the errors are unavoidable, because there is
 * no StoreKit for it to reach, so the SDK correctly reports that it cannot load
 * a catalogue. React Native draws that as a toast docked at the bottom of the
 * screen, and it was photographed on a 13" iPad sitting across the purchase
 * button. A store screenshot with a dev warning on it is not shippable, and no
 * log level can prevent this one because the error is real.
 *
 * Gated on `__DEV__` and the capture flag together, so an ordinary debug build
 * keeps every warning it should have, and a release build never reaches it.
 */
if (__DEV__ && process.env.EXPO_PUBLIC_CAPTURE_MODE === "1") {
  LogBox.ignoreAllLogs(true);
}

export default function RootLayout() {
  const theme = useTheme();
  const router = useRouter();
  const { isPro, setIsPro } = useCutStore();

  useEffect(() => {
    void useAdsStore.getState().hydrate();
    initPurchases();
    // Ads start only once entitlement is known, and only for users who have not bought the
    // upgrade. Running the consent flow first would put a GDPR form -- and on iOS an ATT
    // prompt -- in front of someone who has already paid never to see an ad.
    void checkIsPro().then((pro) => {
      setIsPro(pro);
      if (!pro) void initializeAds();
    });
  }, []);

  return (
    <>
      <StatusBar style={theme.statusBarStyle} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.headerBackground },
          headerTintColor: theme.headerTintColor,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: theme.background },
          headerRight: () =>
            // No background or border of our own: iOS 26+ already draws a
            // container behind header bar items, and adding one produces a
            // visible double border.
            !isPro ? (
              <TouchableOpacity
                onPress={() => router.push("/paywall")}
                accessibilityRole="button"
                accessibilityLabel={t("paywallTitle")}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                className="flex-row items-center px-1 py-1"
              >
                <Crown size={15} color={theme.warning} />
                <Text
                  style={{ color: theme.warning }}
                  className="ml-1.5 text-xs font-bold"
                >
                  {t("proBadge")}
                </Text>
              </TouchableOpacity>
            ) : null,
        }}
      >
        <Stack.Screen
          name="index"
          options={{ title: t("appName"), headerTitleAlign: "left" }}
        />
        <Stack.Screen
          name="paywall"
          options={{
            // No navigation header: the paywall draws its own title row, with
            // the icon and the close button, immediately beneath it. Both were
            // showing, so every one of these apps rendered its paywall title
            // twice about 60pt apart -- visible in any paywall screenshot the
            // app ever ships. The sheet keeps drag-to-dismiss, and the in-sheet
            // close button calls `router.back()`, so nothing is lost with the
            // header gone.
            headerShown: false,
            presentation: "modal",
            // Inherited from screenOptions otherwise, which lets the paywall
            // push another copy of itself without limit.
            headerRight: () => null,
          }}
        />
        <Stack.Screen
          name="preview"
          options={{
            // Same reasoning as the paywall: the screen draws its own title
            // row, and a navigation header on top of it doubles up.
            headerShown: false,
            presentation: "modal",
            headerRight: () => null,
            gestureEnabled: false,
          }}
        />
      </Stack>
    </>
  );
}
