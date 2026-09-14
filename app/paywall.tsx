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
  Sparkles,
  Layers,
  ShoppingBag,
  Tag,
  ShieldCheck,
  Check,
  X,
} from "lucide-react-native";
import { usePaywall } from "../src/hooks/usePaywall";
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from "../src/config/legal";
import { t } from "../src/i18n";
import { useTheme } from '../src/theme/useTheme';

export default function PaywallScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ctaLabel, loading, errorMsg, handlePurchase, handleRestore } =
    usePaywall(() => router.back());

  const features = [
    {
      icon: <Layers size={20} color={theme.accent} />,
      title: t("feat1Title"),
      desc: t("feat1Desc"),
    },
    {
      icon: <ShoppingBag size={20} color={theme.purple} />,
      title: t("feat2Title"),
      desc: t("feat2Desc"),
    },
    {
      icon: <Tag size={20} color={theme.warning} />,
      title: t("feat3Title"),
      desc: t("feat3Desc"),
    },
    {
      icon: <ShieldCheck size={20} color={theme.success} />,
      title: t("feat4Title"),
      desc: t("feat4Desc"),
    },
  ];

  return (
    <View className="flex-1 px-6 py-4" style={{ backgroundColor: theme.background }}>
      <View className="mt-2 mb-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="mr-2.5 rounded-xl bg-blue-500/20 p-2">
            <Sparkles size={20} color={theme.primary} />
          </View>
          <Text className="text-xl font-extrabold" style={{ color: theme.text }}>
            {t("paywallTitle")}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("cancel")}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="rounded-full p-2" style={{ backgroundColor: theme.card }}
        >
          <X size={18} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        <View className="mb-6 rounded-2xl border p-5" style={{ borderColor: theme.primaryBorder, backgroundColor: theme.primaryLight }}>
          <Text className="mb-1 text-xs font-bold uppercase tracking-wider" style={{ color: theme.primary }}>
            {t("antiSubTitle")}
          </Text>
          <Text className="text-base font-bold leading-snug" style={{ color: theme.text }}>
            {t("antiSubHeadline")}
          </Text>
          <Text className="mt-2 text-xs leading-relaxed" style={{ color: theme.textSecondary }}>
            {t("antiSubDesc")}
          </Text>
        </View>

        <View className="mb-6 gap-4">
          {features.map((f) => (
            <View key={f.title} className="flex-row items-start">
              <View className="mr-3.5 rounded-xl border p-2.5" style={{ borderColor: theme.cardBorder, backgroundColor: theme.card }}>
                {f.icon}
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold" style={{ color: theme.text }}>{f.title}</Text>
                <Text className="mt-0.5 text-xs leading-relaxed" style={{ color: theme.textSecondary }}>
                  {f.desc}
                </Text>
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
            <>
              <Text className="mr-2 text-base font-extrabold" style={{ color: theme.onPrimary }}>
                {ctaLabel}
              </Text>
              <Check size={18} color={theme.onPrimary} strokeWidth={3} />
            </>
          )}
        </TouchableOpacity>

        <View className="mt-4 flex-row items-center justify-center gap-5">
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
          <Text className="text-xs" style={{ color: theme.textMuted }}>{t("oneTimePayment")}</Text>
        </View>

        <View className="mt-3 flex-row items-center justify-center gap-5">
          <TouchableOpacity
            onPress={() => Linking.openURL(TERMS_OF_USE_URL)}
            accessibilityRole="link"
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          >
            <Text className="text-xs underline" style={{ color: theme.textMuted }}>
              {t("termsOfUse")}
            </Text>
          </TouchableOpacity>
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
  );
}
