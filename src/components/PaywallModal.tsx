import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  useWindowDimensions,
} from "react-native";
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
import { usePaywall } from "../hooks/usePaywall";
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from "../config/legal";
import { t } from "../i18n";
import { useTheme } from '../theme/useTheme';

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
}

export const PaywallModal: React.FC<PaywallModalProps> = ({
  visible,
  onClose,
}) => {
  const theme = useTheme();
  // On a tablet this stops being a bottom sheet and becomes a centred card.
  //
  // A sheet anchored to the bottom of a 13" iPad leaves more than half the
  // display as dimmed backdrop above it, and the purchase -- the whole reason
  // the sheet exists -- sits in the last third of the screen. The bottom
  // anchor is a phone idiom: it puts the content within reach of a thumb.
  // There is no thumb at this size.
  const { width: screenWidth } = useWindowDimensions();
  const isTablet = screenWidth >= 700;
  const asCard = isTablet
    ? { maxWidth: 640, width: '100%' as const, borderRadius: 24, borderTopWidth: 1 }
    : null;

  const insets = useSafeAreaInsets();
  const { ctaLabel, loading, errorMsg, handlePurchase, handleRestore } =
    usePaywall(onClose);

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
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View className={`flex-1 bg-black/80 ${isTablet ? "justify-center items-center" : "justify-end"}`}>
        <View
          className="max-h-[90%] rounded-t-3xl border-t px-6 pt-6" style={[{ borderColor: theme.cardBorder, backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 16) + 8 }, asCard]}
        >
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="rounded-xl bg-blue-500/20 p-2">
                <Sparkles size={20} color={theme.primary} />
              </View>
              <Text className="text-xl font-extrabold" style={{ color: theme.text }}>
                {t("paywallTitle")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("cancel")}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              className="rounded-full p-2" style={{ backgroundColor: theme.card }}
            >
              <X size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <View className="mb-5 rounded-2xl border p-4" style={{ borderColor: theme.primaryBorder, backgroundColor: theme.primaryLight }}>
            <Text className="mb-1 text-xs font-bold uppercase tracking-wider" style={{ color: theme.primary }}>
              {t("antiSubTitle")}
            </Text>
            <Text className="text-sm font-semibold leading-snug text-slate-100">
              {t("antiSubHeadline")}
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} className="mb-5">
            <View className="gap-3.5">
              {features.map((f) => (
                <View key={f.title} className="flex-row items-start">
                  <View className="mr-3 rounded-xl border p-2" style={{ borderColor: theme.cardBorder, backgroundColor: theme.card }}>
                    {f.icon}
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold" style={{ color: theme.text }}>
                      {f.title}
                    </Text>
                    <Text className="mt-0.5 text-xs leading-relaxed" style={{ color: theme.textSecondary }}>
                      {f.desc}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          {errorMsg ? (
            <Text
              accessibilityRole="alert"
              className="mb-3 text-center text-xs" style={{ color: theme.danger }}
            >
              {errorMsg}
            </Text>
          ) : null}

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
            <Text className="text-xs" style={{ color: theme.textMuted }}>
              {t("oneTimePayment")}
            </Text>
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
    </Modal>
  );
};
