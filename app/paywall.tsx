import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Scissors,
  Check,
  Minus,
  X,
} from "lucide-react-native";
import { usePaywall } from "../src/hooks/usePaywall";
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from "../src/config/legal";
import { t } from "../src/i18n";
import { useTheme } from '../src/theme/useTheme';
import { useTabletColumn } from '../src/theme/useTabletColumn';

export default function PaywallScreen() {
  const theme = useTheme();
  const tabletColumn = useTabletColumn(640);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ctaLabel, loading, errorMsg, handlePurchase, handleRestore } =
    usePaywall(() => router.back());

  // Ad removal is its own always-Pro row up top; the rest of the table lines
  // up one feature per row so the free/pro gap reads at a glance.
  const rows = [
    { label: t("feat1Title"), sub: t("feat1Desc") },
    { label: t("feat2Title"), sub: t("feat2Desc") },
    { label: t("feat3Title"), sub: t("feat3Desc") },
    { label: t("feat4Title"), sub: t("feat4Desc") },
  ];

  return (
    <View className="flex-1 px-5 py-4" style={{ backgroundColor: theme.background }}>
      <TouchableOpacity
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t("cancel")}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        className="self-end rounded-full p-2"
        style={{ backgroundColor: theme.card }}
      >
        <X size={18} color={theme.textMuted} />
      </TouchableOpacity>

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ ...tabletColumn }}>
          <View className="mb-5 items-center">
            <View
              className="mb-3 h-14 w-14 items-center justify-center rounded-2xl"
              style={{ backgroundColor: theme.primaryLight }}
            >
              <Scissors size={26} color={theme.primary} />
            </View>
            <Text className="text-center text-2xl font-extrabold" style={{ color: theme.text }}>
              {t("paywallTitle")}
            </Text>
            <Text className="mt-1.5 text-center text-sm leading-relaxed" style={{ color: theme.textSecondary }}>
              {t("antiSubHeadline")}
            </Text>
          </View>

          <View className="mb-4 flex-row items-center border-b pb-2" style={{ borderColor: theme.cardBorder }}>
            <Text className="flex-1 text-xs font-bold uppercase tracking-wider" style={{ color: theme.textMuted }} />
            <Text className="w-16 text-center text-xs font-bold uppercase tracking-wider" style={{ color: theme.textMuted }}>
              Free
            </Text>
            <Text className="w-16 text-center text-xs font-bold uppercase tracking-wider" style={{ color: theme.primary }}>
              Pro
            </Text>
          </View>

          <View
            className="mb-3 flex-row items-start rounded-xl p-3"
            style={{ backgroundColor: theme.primaryLight }}
          >
            <View className="flex-1 pr-2">
              <Text className="text-sm font-bold" style={{ color: theme.text }}>{t("featAdsTitle")}</Text>
              <Text className="mt-0.5 text-xs leading-relaxed" style={{ color: theme.textSecondary }}>
                {t("featAdsDesc")}
              </Text>
            </View>
            <View className="w-16 items-center justify-center">
              <Minus size={16} color={theme.textMuted} />
            </View>
            <View className="w-16 items-center justify-center">
              <Check size={18} color={theme.primary} strokeWidth={3} />
            </View>
          </View>

          <View className="mb-5">
            {rows.map((r, i) => (
              <View
                key={r.label}
                className="flex-row items-start py-3"
                style={i < rows.length - 1 ? { borderBottomWidth: 1, borderColor: theme.cardBorder } : undefined}
              >
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-bold" style={{ color: theme.text }}>{r.label}</Text>
                  <Text className="mt-0.5 text-xs leading-relaxed" style={{ color: theme.textSecondary }}>
                    {r.sub}
                  </Text>
                </View>
                <View className="w-16 items-center justify-center">
                  <Minus size={16} color={theme.textMuted} />
                </View>
                <View className="w-16 items-center justify-center">
                  <Check size={18} color={theme.primary} strokeWidth={3} />
                </View>
              </View>
            ))}
          </View>

          {errorMsg ? (
            <Text
              accessibilityRole="alert"
              className="mb-3 text-center text-xs" style={{ color: theme.danger }}
            >
              {errorMsg}
            </Text>
          ) : null}
        </ScrollView>

        <View
          className="pt-2"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
        >
          <TouchableOpacity
            onPress={handlePurchase}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
            accessibilityState={{ disabled: loading, busy: loading }}
            className={`min-h-[56px] flex-row items-center justify-center rounded-2xl p-4 ${
              loading ? "bg-blue-900" : "bg-blue-600 active:bg-blue-500"
            }`}
          >
            {loading ? (
              <ActivityIndicator color={theme.onPrimary} />
            ) : (
              <Text className="text-base font-extrabold" style={{ color: theme.onPrimary }}>
                {ctaLabel}
              </Text>
            )}
          </TouchableOpacity>

          <Text className="mt-3 text-center text-xs" style={{ color: theme.textMuted }}>
            {t("oneTimePayment")}
          </Text>

          <View className="mt-3 flex-row items-center justify-center gap-5">
            <TouchableOpacity
              onPress={handleRestore}
              disabled={loading}
              accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            >
              <Text className="text-xs underline" style={{ color: theme.textSecondary }}>
                {t("restorePurchases")}
              </Text>
            </TouchableOpacity>
            <Text className="text-xs" style={{ color: theme.textMuted }}>•</Text>
            <TouchableOpacity
              onPress={() => Linking.openURL(TERMS_OF_USE_URL)}
              accessibilityRole="link"
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            >
              <Text className="text-xs underline" style={{ color: theme.textMuted }}>
                {t("termsOfUse")}
              </Text>
            </TouchableOpacity>
            <Text className="text-xs" style={{ color: theme.textMuted }}>•</Text>
            <TouchableOpacity
              onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
              accessibilityRole="link"
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            >
              <Text className="text-xs underline" style={{ color: theme.textMuted }}>
                {t("privacyPolicy")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}
