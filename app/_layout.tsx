import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TouchableOpacity, Text } from 'react-native';
import { Crown } from 'lucide-react-native';
import { initPurchases, checkIsPro } from '../src/services/purchases';
import { useCutStore } from '../src/store/useCutStore';
import { useTheme } from '../src/theme/useTheme';
import { t } from '../src/i18n';
import '../global.css';

export default function RootLayout() {
  const theme = useTheme();
  const router = useRouter();
  const { isPro, setIsPro } = useCutStore();

  useEffect(() => {
    initPurchases();
    checkIsPro().then(setIsPro);
  }, []);

  return (
    <>
      <StatusBar style={theme.statusBarStyle} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.headerBackground },
          headerTintColor: theme.headerTintColor,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: theme.background },
          headerRight: () =>
            // No background or border of our own: iOS 26+ already draws a
            // container behind header bar items, and adding one produces a
            // visible double border.
            !isPro ? (
              <TouchableOpacity
                onPress={() => router.push('/paywall')}
                accessibilityRole="button"
                accessibilityLabel={t('paywallTitle')}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                className="flex-row items-center px-1 py-1"
              >
                <Crown size={15} color={theme.warning} />
                <Text style={{ color: theme.warning }} className="ml-1.5 text-xs font-bold">
                  {t('proBadge')}
                </Text>
              </TouchableOpacity>
            ) : null,
        }}
      >
        <Stack.Screen name="index" options={{ title: t('appName'), headerTitleAlign: 'left' }} />
        <Stack.Screen
          name="paywall"
          options={{
            title: t('paywallTitle'),
            presentation: 'modal',
            // Inherited from screenOptions otherwise, which lets the paywall
            // push another copy of itself without limit.
            headerRight: () => null,
          }}
        />
      </Stack>
    </>
  );
}
