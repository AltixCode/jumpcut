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

  if (isPro || !canServeAds || failed) return null;

  return (
    <View
      accessibilityLabel={t('adLabel')}
      style={{
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
