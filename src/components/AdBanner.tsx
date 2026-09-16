import React, { useState } from 'react';
import { View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { bannerUnitId } from '../services/ads';
import { useAdsStore } from '../store/adsStore';
import { useIsPro } from '../hooks/useIsPro';
import { useTheme } from '../theme/useTheme';
import { t } from '../i18n';

export const BANNER_HEIGHT = 60;

/**
 * The banner slot reserves its height for as long as ads are enabled, so a late fill cannot
 * shove the buttons above it downwards while someone is reaching for one.
 *
 * Three conditions remove the slot entirely rather than leaving dead space: the upgrade is
 * owned, consent does not permit an ad request, or the unit failed to fill.
 */
export function AdBanner() {
  const theme = useTheme();
  const isPro = useIsPro();
  const canServeAds = useAdsStore((state) => state.consent.canServeAds);
  const [failed, setFailed] = useState(false);

  // Capture mode: no ad, at all, while a store screenshot is being taken.
  //
  // A live banner in a listing is someone else's artwork in our shelf space, and
  // a Debug build serves Google's test creative with a literal "Test mode" badge
  // on it. Dismissing the consent sheet to make the app visible to the capture
  // tool is precisely what lets the ad load, so the ad-free state and the
  // capturable state were mutually exclusive without this.
  //
  // __DEV__ means it cannot exist in a release build, and check-release-config
  // refuses EXPO_PUBLIC_CAPTURE_MODE outright, so it cannot ship by accident.
  if (__DEV__ && process.env.EXPO_PUBLIC_CAPTURE_MODE === '1') return null;

  if (isPro || !canServeAds || failed) return null;

  return (
    <View
      accessibilityLabel={t('adLabel')}
      style={{
        // flexShrink: 0 so the banner can never be squeezed by a sibling that
        // sizes itself to its content. Ata saw this on an iPad: "some of the ui
        // elements are hidden behind the admob".
        flexShrink: 0,
        height: BANNER_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.background,
      }}
    >
      <BannerAd
        unitId={bannerUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
