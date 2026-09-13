import { useColorScheme } from 'react-native';

export interface ThemeColors {
  isDark: boolean;
  background: string;
  surface: string;
  card: string;
  cardBorder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  primaryLight: string;
  primaryBorder: string;
  accent: string;
  accentLight: string;
  accentBorder: string;
  warning: string;
  warningLight: string;
  success: string;
  successLight: string;
  danger: string;
  controlSurface: string;
  purple: string;
  headerBackground: string;
  headerTintColor: string;
  statusBarStyle: 'light' | 'dark';
}

export const useTheme = (): ThemeColors => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return {
    isDark,
    background: isDark ? '#090D16' : '#F8FAFC',
    surface: isDark ? '#111827' : '#FFFFFF',
    card: isDark ? '#111827' : '#FFFFFF',
    cardBorder: isDark ? '#1E293B' : '#E2E8F0',
    text: isDark ? '#F8FAFC' : '#0F172A',
    textSecondary: isDark ? '#94A3B8' : '#475569',
    textMuted: isDark ? '#64748B' : '#94A3B8',
    primary: '#2563EB',
    onPrimary: '#FFFFFF',
    primaryLight: isDark ? 'rgba(37, 99, 235, 0.15)' : 'rgba(37, 99, 235, 0.10)',
    primaryBorder: isDark ? 'rgba(37, 99, 235, 0.35)' : 'rgba(37, 99, 235, 0.25)',
    accent: isDark ? '#38BDF8' : '#0284C7',
    accentLight: isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(56, 189, 248, 0.10)',
    accentBorder: isDark ? 'rgba(56, 189, 248, 0.35)' : 'rgba(56, 189, 248, 0.25)',
    warning: isDark ? '#F59E0B' : '#B45309',
    warningLight: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.10)',
    success: isDark ? '#10B981' : '#047857',
    successLight: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.10)',
    danger: isDark ? '#EF4444' : '#DC2626',
    controlSurface: isDark ? '#1E293B' : '#F1F5F9',
    purple: isDark ? '#A855F7' : '#7E22CE',
    headerBackground: isDark ? '#090D16' : '#FFFFFF',
    headerTintColor: isDark ? '#F8FAFC' : '#0F172A',
    statusBarStyle: isDark ? 'light' : 'dark',
  };
};
