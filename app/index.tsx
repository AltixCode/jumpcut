import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
// The root export deprecated the function-style API in SDK 57 and now throws a
// migration error instead of saving; the legacy entry point still works.
import * as MediaLibrary from 'expo-media-library/legacy';
import { Film, Scissors, ShieldCheck, Sparkles, Wind, Timer } from 'lucide-react-native';
import { useCutStore, FREE_SECONDS, SENSITIVITY, WINDOW_SECONDS } from '../src/store/useCutStore';
import { rmsProfile, toMono } from '../src/engine/rmsProfile';
import { cutter, encodeSegments, onCutProgress } from '../modules/video-cutter';
import { useTheme } from '../src/theme/useTheme';
import { useTabletColumn } from '../src/theme/useTabletColumn';
import { t } from '../src/i18n';
import { ForwardArrow } from '../src/components/DirectionalIcons';
import { AdBanner } from '../src/components/AdBanner';
import { useAdsStore } from '../src/store/adsStore';
import { showInterstitial, showPrivacyOptionsForm } from '../src/services/ads';
import { shouldShowInterstitial } from '../src/services/adPolicy';

const formatDuration = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return t('secondsShort', { seconds: whole });
  return t('minutesShort', { minutes: Math.floor(whole / 60), seconds: whole % 60 });
};

export default function HomeScreen() {
  const theme = useTheme();
  const tabletColumn = useTabletColumn();
  const {
    source, silences, keep, savedSeconds, options, stage, progress, isPro,
    setSource, analyse, setOptions, setResult, setStage, setProgress, overFreeLimit, exportableKeep,
  } = useCutStore();
  const [busy, setBusy] = useState(false);

  // Google requires a persistent entry back into the consent form wherever UMP reports that
  // privacy options are available, which in practice means the EEA and the regulated US
  // states. It is absent everywhere else rather than shown as a dead control.
  const offerPrivacyOptions = useAdsStore((state) => state.consent.offerPrivacyOptions);

  const maybeShowInterstitial = useCallback(async () => {
    const { completions, lastInterstitialAt, markInterstitialShown } = useAdsStore.getState();
    const decision = shouldShowInterstitial({
      completions,
      lastInterstitialAt,
      now: Date.now(),
      // Read at call time rather than captured: the user may have bought the upgrade from the
      // paywall between opening this screen and finishing the cut.
      isPro: useCutStore.getState().isPro,
    });
    if (!decision) return;
    // Only a shown-and-dismissed ad resets the clock. Counting an unfilled request would
    // suppress the next several cuts' ads for nothing.
    if (await showInterstitial()) await markInterstitialShown();
  }, []);

  const handlePick = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('libraryDenied'), t('libraryDeniedDesc'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (result.canceled || !result.assets?.length) return;

    try {
      // The picker's own width/height ignore the camera's rotation, so a
      // portrait clip reports as landscape.
      const info = await cutter.getInfo(result.assets[0].uri);
      setSource({
        uri: result.assets[0].uri,
        width: info.width,
        height: info.height,
        duration: info.duration,
        hasAudio: info.hasAudio,
      });
      if (!info.hasAudio) Alert.alert(t('noAudioTitle'), t('noAudioDesc'));
    } catch {
      Alert.alert(t('videoUnreadable'), t('videoUnreadableDesc'));
    }
  }, [setSource]);

  const handleAnalyse = useCallback(async () => {
    if (!source) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    setStage('analysing');
    try {
      const decoded = await cutter.decodeAudio(source.uri);
      const profile = rmsProfile(
        toMono(decoded.samples, decoded.channels),
        decoded.sampleRate,
        WINDOW_SECONDS,
      );
      analyse(profile);
      if (!useCutStore.getState().silences.length) {
        Alert.alert(t('noSilenceTitle'), t('noSilenceDesc'));
      }
    } catch (error) {
      setStage('idle');
      Alert.alert(t('analyseFailed'), error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [analyse, setStage, source]);

  const handleCut = useCallback(async () => {
    const segments = exportableKeep();
    if (!source || !segments.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      Alert.alert(t('saveDenied'), t('saveDeniedDesc'));
      return;
    }

    setBusy(true);
    setStage('cutting', 0);
    const subscription = onCutProgress(setProgress);
    try {
      const result = await cutter.cut(source.uri, encodeSegments(segments));
      await MediaLibrary.saveToLibraryAsync(result.uri);
      setResult(result.uri, result.duration);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await useAdsStore.getState().recordCompletion();
      // The duration the file actually has, not the one that was planned: a
      // claim that does not match the export is worse than no claim.
      //
      // The ad waits behind this confirmation. Interrupting the moment the export lands -- or
      // worse, while it runs -- is the version of this that gets one-star reviews; once the
      // user has read "saved" and tapped through, the work is done.
      Alert.alert(t('saved'), t('savedDesc', { duration: formatDuration(result.duration) }), [
        { text: t('ok'), onPress: () => void maybeShowInterstitial() },
      ]);
    } catch (error) {
      Alert.alert(t('cutFailed'), error instanceof Error ? error.message : String(error));
    } finally {
      subscription.remove();
      setBusy(false);
      setStage('idle');
    }
  }, [exportableKeep, setProgress, setResult, setStage, source, maybeShowInterstitial]);

  const analysed = keep.length > 0;
  const newLength = source ? source.duration - savedSeconds : 0;

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 px-5" style={{ backgroundColor: theme.background }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 , ...tabletColumn,
          // A fixed block, not a list that grows, so it is centred when there
          // is slack. On a 13" iPad these screens sat at the top with a third
          // or more of the display empty beneath them. Deliberately not applied
          // to packpixel or gridhabit, whose home screens hold a list the user
          // adds to -- centring a growing list leaves it floating with dead
          // space above and below.
          flexGrow: 1,
          justifyContent: 'center',
        }}>
        <View className="mt-4 mb-5">
          <View
            className="self-start border px-3 py-1 rounded-full mb-3 flex-row items-center"
            style={{ backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder }}
          >
            <Sparkles size={12} color={theme.primary} />
            <Text className="text-xs font-semibold ml-1.5" style={{ color: theme.primary }}>
              {t('heroBadge')}
            </Text>
          </View>
          <Text className="text-3xl font-extrabold tracking-tight" style={{ color: theme.text }}>
            {t('heroTitle')}
          </Text>
          <Text className="text-sm mt-1.5 leading-relaxed" style={{ color: theme.textSecondary }}>
            {t('heroSubtitle')}
          </Text>
        </View>

        <View
          className="border rounded-3xl p-4 mb-4"
          style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
        >
          <View className="flex-row items-center mb-3">
            <View className="p-2 rounded-xl mr-3" style={{ backgroundColor: theme.primaryLight }}>
              <Film size={18} color={theme.primary} />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-base" style={{ color: theme.text }}>
                {source
                  ? t('videoReady', {
                      width: source.width,
                      height: source.height,
                      duration: formatDuration(source.duration),
                    })
                  : t('noVideoTitle')}
              </Text>
              {!source ? (
                <Text className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                  {t('noVideoDesc')}
                </Text>
              ) : null}
            </View>
          </View>
          <TouchableOpacity
            onPress={handlePick}
            disabled={busy}
            accessibilityRole="button"
            className="px-4 py-3 rounded-2xl flex-row items-center justify-center"
            style={{ backgroundColor: theme.controlSurface, opacity: busy ? 0.5 : 1, minHeight: 44 }}
          >
            <Film size={16} color={theme.textSecondary} />
            <Text className="text-sm font-bold ml-2" style={{ color: theme.textSecondary }}>
              {source ? t('replaceVideo') : t('chooseVideo')}
            </Text>
          </TouchableOpacity>
        </View>

        {source && overFreeLimit() ? (
          <View
            className="border rounded-2xl p-3 mb-4"
            style={{ backgroundColor: theme.primaryLight, borderColor: theme.primaryBorder }}
          >
            <Text className="text-xs leading-relaxed" style={{ color: theme.primary }}>
              {t('freeLimitNotice', { seconds: FREE_SECONDS })}
            </Text>
          </View>
        ) : null}

        {!analysed ? (
          <TouchableOpacity
            onPress={handleAnalyse}
            disabled={!source || busy}
            accessibilityRole="button"
            className="p-4 rounded-2xl flex-row items-center justify-center mb-4"
            style={{ backgroundColor: source && !busy ? theme.primary : theme.controlSurface, minHeight: 44 }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={theme.onPrimary} />
            ) : (
              <Wind size={18} color={source ? theme.onPrimary : theme.textMuted} />
            )}
            <Text
              className="font-bold text-base ml-2 mr-2"
              style={{ color: source || busy ? theme.onPrimary : theme.textMuted }}
            >
              {stage === 'analysing' ? t('analysing') : t('analyse')}
            </Text>
            {!busy ? <ForwardArrow size={18} color={source ? theme.onPrimary : theme.textMuted} /> : null}
          </TouchableOpacity>
        ) : null}

        {analysed ? (
          <View
            className="border rounded-3xl p-4 mb-4"
            style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
          >
            <View className="flex-row items-center mb-3">
              <Scissors size={16} color={theme.success} />
              <Text className="font-bold text-base ml-2" style={{ color: theme.text }}>
                {t('resultTitle')}
              </Text>
            </View>
            {[
              { label: t('silenceCount', { count: silences.length }), value: '' },
              { label: t('timeSaved'), value: formatDuration(savedSeconds) },
              { label: t('newLength'), value: formatDuration(newLength) },
            ].map((row) => (
              <View key={row.label} className="flex-row justify-between py-1.5">
                <Text className="text-sm" style={{ color: theme.textSecondary }}>{row.label}</Text>
                <Text className="text-sm font-mono font-bold" style={{ color: theme.text }}>{row.value}</Text>
              </View>
            ))}

            <Text className="text-xs font-semibold tracking-widest mt-3 mb-2" style={{ color: theme.textMuted }}>
              {t('sensitivity')}
            </Text>
            <View className="flex-row gap-2">
              {SENSITIVITY.map((preset) => {
                const selected = options.thresholdDb === preset.thresholdDb;
                return (
                  <TouchableOpacity
                    key={preset.label}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setOptions({
                        thresholdDb: preset.thresholdDb,
                        minSilenceSeconds: preset.minSilenceSeconds,
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={preset.label}
                    accessibilityState={{ selected }}
                    className="flex-1 py-3 rounded-xl border items-center"
                    style={{
                      minHeight: 44,
                      backgroundColor: selected ? theme.primaryLight : theme.controlSurface,
                      borderColor: selected ? theme.primary : theme.cardBorder,
                    }}
                  >
                    <Text className="text-sm font-bold" style={{ color: selected ? theme.primary : theme.textSecondary }}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View className="flex-row justify-between mt-1.5">
              <Text className="text-[11px]" style={{ color: theme.textMuted }}>{t('sensitivityLow')}</Text>
              <Text className="text-[11px]" style={{ color: theme.textMuted }}>{t('sensitivityHigh')}</Text>
            </View>

            <TouchableOpacity
              onPress={handleCut}
              disabled={busy}
              accessibilityRole="button"
              className="mt-4 px-4 py-3 rounded-2xl flex-row items-center justify-center"
              style={{ backgroundColor: busy ? theme.controlSurface : theme.success, minHeight: 44 }}
            >
              {busy ? (
                <ActivityIndicator size="small" color={theme.textSecondary} />
              ) : (
                <Scissors size={16} color={theme.onPrimary} />
              )}
              <Text
                className="text-sm font-bold ml-2"
                style={{ color: busy ? theme.textSecondary : theme.onPrimary }}
              >
                {stage === 'cutting' ? t('cutting', { percent: Math.round(progress * 100) }) : t('cut')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text className="text-xs font-semibold tracking-widest mb-3" style={{ color: theme.textMuted }}>
          {t('archGuarantees')}
        </Text>
        {[
          { icon: <Wind size={18} color={theme.primary} />, bg: theme.primaryLight, title: t('paddingTitle'), desc: t('paddingDesc') },
          { icon: <Timer size={18} color={theme.accent} />, bg: theme.accentLight, title: t('preciseTitle'), desc: t('preciseDesc') },
          { icon: <ShieldCheck size={18} color={theme.success} />, bg: theme.successLight, title: t('onDeviceTitle'), desc: t('onDeviceDesc') },
        ].map((item) => (
          <View
            key={item.title}
            className="border p-4 rounded-2xl flex-row items-start mb-3"
            style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
          >
            <View className="p-2 rounded-xl mr-3" style={{ backgroundColor: item.bg }}>{item.icon}</View>
            <View className="flex-1">
              <Text className="font-bold text-sm mb-1" style={{ color: theme.text }}>{item.title}</Text>
              <Text className="text-xs leading-relaxed" style={{ color: theme.textSecondary }}>{item.desc}</Text>
            </View>
          </View>
        ))}

        {offerPrivacyOptions ? (
          <TouchableOpacity
            onPress={() => {
              void showPrivacyOptionsForm();
            }}
            accessibilityRole="button"
            className="mt-2 py-3 items-center"
            style={{ minHeight: 44 }}
          >
            <Text className="text-xs font-semibold underline" style={{ color: theme.textSecondary }}>
              {t('adPrivacySettings')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
      {/* Anchored below the scroll area rather than inside it: a banner that scrolls with the
          content can sit under a finger reaching for the cut button. */}
      <AdBanner />
    </SafeAreaView>
  );
}
