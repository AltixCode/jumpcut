import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
// The root export deprecated the function-style API in SDK 57 and now throws a
// migration error instead of saving; the legacy entry point still works.
import * as MediaLibrary from "expo-media-library/legacy";
import { useVideoPlayer, VideoView } from "expo-video";
import { Check, Minus, Plus, X } from "lucide-react-native";
import { useCutStore } from "../src/store/useCutStore";
import { encodeSegments, cutter } from "../modules/video-cutter";
import { useTheme } from "../src/theme/useTheme";
import { useTabletColumn } from "../src/theme/useTabletColumn";
import { t } from "../src/i18n";
import { useAdsStore } from "../src/store/adsStore";
import { showInterstitial } from "../src/services/ads";
import { shouldShowInterstitial } from "../src/services/adPolicy";

/** Seconds nudged per tap. Small enough that a few taps make a real
 *  difference without turning this into a scrubber the free-hand cases were
 *  never meant to replace. */
const TRIM_STEP = 0.2;

const formatDuration = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return t("secondsShort", { seconds: whole });
  return t("minutesShort", {
    minutes: Math.floor(whole / 60),
    seconds: whole % 60,
  });
};

/**
 * The step between "Cut and Save" and the photo library actually gaining a
 * file. TestFlight feedback asked for exactly this: a chance to watch the
 * result and back out before it lands in the user's library, since the
 * previous flow saved unconditionally the moment the cut finished.
 */
export default function PreviewScreen() {
  const theme = useTheme();
  const tabletColumn = useTabletColumn();
  const router = useRouter();
  const {
    source,
    silences,
    outputUri,
    outputDuration,
    outputSegments,
    discardPreview,
    nudgeTrim,
    setResult,
  } = useCutStore();
  const [busy, setBusy] = useState(false);

  const player = useVideoPlayer(outputUri ?? null, (instance) => {
    instance.loop = true;
    instance.play();
  });

  const maybeShowInterstitial = useCallback(async () => {
    const { completions, lastInterstitialAt, markInterstitialShown } =
      useAdsStore.getState();
    const decision = shouldShowInterstitial({
      completions,
      lastInterstitialAt,
      now: Date.now(),
      isPro: useCutStore.getState().isPro,
    });
    if (!decision) return;
    if (await showInterstitial()) await markInterstitialShown();
  }, []);

  const handleBack = useCallback(() => {
    discardPreview();
    router.back();
  }, [discardPreview, router]);

  const handleSave = useCallback(async () => {
    if (!outputUri) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      Alert.alert(t("saveDenied"), t("saveDeniedDesc"));
      return;
    }

    setBusy(true);
    try {
      await MediaLibrary.saveToLibraryAsync(outputUri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await useAdsStore.getState().recordCompletion();
      Alert.alert(
        t("saved"),
        t("savedDesc", { duration: formatDuration(outputDuration ?? 0) }),
        [
          {
            text: t("ok"),
            onPress: () => {
              discardPreview();
              void maybeShowInterstitial();
              router.back();
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        t("cutFailed"),
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
    }
  }, [
    discardPreview,
    maybeShowInterstitial,
    outputDuration,
    outputUri,
    router,
  ]);

  // Re-encodes only the one edge that moved. The rest of the file the user
  // already watched is untouched, so this stays a small nudge and not a
  // second full export.
  const handleNudge = useCallback(
    async (edge: "start" | "end", deltaSeconds: number) => {
      if (!source || busy) return;
      nudgeTrim(edge, deltaSeconds);
      const segments = useCutStore.getState().outputSegments;
      if (!segments || !segments.length) return;
      setBusy(true);
      try {
        const result = await cutter.cut(source.uri, encodeSegments(segments));
        setResult(result.uri, result.duration, segments);
      } catch (error) {
        Alert.alert(
          t("cutFailed"),
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, nudgeTrim, setResult, source],
  );

  return (
    <SafeAreaView
      edges={["bottom"]}
      className="flex-1 px-5"
      style={{ backgroundColor: theme.background }}
    >
      <View className="flex-row items-center justify-between mt-4 mb-3">
        <Text
          className="text-2xl font-extrabold tracking-tight"
          style={{ color: theme.text }}
        >
          {t("previewTitle")}
        </Text>
        <TouchableOpacity
          onPress={handleBack}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t("back")}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="rounded-full p-2"
          style={{ backgroundColor: theme.card, opacity: busy ? 0.5 : 1 }}
        >
          <X size={18} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24, ...tabletColumn }}
      >
        <Text
          className="text-sm mb-3 leading-relaxed"
          style={{ color: theme.textSecondary }}
        >
          {t("previewDesc")}
        </Text>

        <View
          className="rounded-3xl overflow-hidden border mb-4"
          style={{
            borderColor: theme.cardBorder,
            backgroundColor: "#000",
            aspectRatio: 9 / 16,
            maxHeight: 420,
          }}
        >
          <VideoView
            player={player}
            style={{ flex: 1 }}
            contentFit="contain"
            nativeControls
          />
          {busy ? (
            <View
              className="absolute inset-0 items-center justify-center"
              style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            >
              <ActivityIndicator size="large" color="#FFFFFF" />
              <Text
                className="text-xs font-semibold mt-2"
                style={{ color: "#FFFFFF" }}
              >
                {t("previewUpdating")}
              </Text>
            </View>
          ) : null}
        </View>

        <View
          className="border rounded-3xl p-4 mb-4"
          style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
        >
          {[
            { label: t("silenceCount", { count: silences.length }), value: "" },
            {
              label: t("newLength"),
              value: formatDuration(outputDuration ?? 0),
            },
          ].map((row) => (
            <View key={row.label} className="flex-row justify-between py-1.5">
              <Text className="text-sm" style={{ color: theme.textSecondary }}>
                {row.label}
              </Text>
              <Text
                className="text-sm font-mono font-bold"
                style={{ color: theme.text }}
              >
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        {outputSegments && outputSegments.length ? (
          <View
            className="border rounded-3xl p-4 mb-4"
            style={{
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
            }}
          >
            <Text
              className="text-xs font-semibold tracking-widest mb-3"
              style={{ color: theme.textMuted }}
            >
              {t("fineTuneTrim")}
            </Text>
            {[
              { edge: "start" as const, label: t("trimStartLabel") },
              { edge: "end" as const, label: t("trimEndLabel") },
            ].map((row) => (
              <View
                key={row.edge}
                className="flex-row items-center justify-between py-1.5"
              >
                <Text
                  className="text-sm font-bold"
                  style={{ color: theme.text }}
                >
                  {row.label}
                </Text>
                <View className="flex-row items-center gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync();
                      // Moving the start later / the end earlier both trim
                      // more off the clip, so they share the "-" gesture.
                      void handleNudge(
                        row.edge,
                        row.edge === "start" ? TRIM_STEP : -TRIM_STEP,
                      );
                    }}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`${row.label} -${TRIM_STEP}s`}
                    className="items-center justify-center rounded-xl border"
                    style={{
                      width: 44,
                      height: 44,
                      borderColor: theme.cardBorder,
                      backgroundColor: theme.controlSurface,
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    <Minus size={16} color={theme.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync();
                      void handleNudge(
                        row.edge,
                        row.edge === "start" ? -TRIM_STEP : TRIM_STEP,
                      );
                    }}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`${row.label} +${TRIM_STEP}s`}
                    className="items-center justify-center rounded-xl border"
                    style={{
                      width: 44,
                      height: 44,
                      borderColor: theme.cardBorder,
                      backgroundColor: theme.controlSurface,
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    <Plus size={16} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <TouchableOpacity
          onPress={handleSave}
          disabled={busy || !outputUri}
          accessibilityRole="button"
          className="px-4 py-3 rounded-2xl flex-row items-center justify-center"
          style={{
            backgroundColor: busy ? theme.controlSurface : theme.success,
            minHeight: 44,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={theme.textSecondary} />
          ) : (
            <Check size={16} color={theme.onPrimary} />
          )}
          <Text
            className="text-sm font-bold ml-2"
            style={{ color: busy ? theme.textSecondary : theme.onPrimary }}
          >
            {t("previewSaveButton")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
