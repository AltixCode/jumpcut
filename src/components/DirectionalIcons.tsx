import React from 'react';
import { I18nManager, View } from 'react-native';
import { ArrowRight, ChevronRight } from 'lucide-react-native';

/**
 * Forward-pointing icons that follow the reading direction.
 *
 * Under RTL the surrounding layout mirrors automatically, so these move to the
 * leading edge on their own -- but the glyph keeps pointing right, leaving it
 * aimed back at the content the user came from. lucide has no RTL-aware
 * variant, so the icon is flipped horizontally.
 *
 * The transform goes on a wrapping View, not on the icon: passing `style` down
 * to lucide's Svg made the glyph disappear entirely rather than mirror.
 */
const flip = I18nManager.isRTL ? ({ transform: [{ scaleX: -1 as const }] }) : undefined;

type Props = { size?: number; color: string };

export function ForwardArrow({ size = 18, color }: Props) {
  return (
    <View style={flip}>
      <ArrowRight size={size} color={color} />
    </View>
  );
}

export function ForwardChevron({ size = 16, color }: Props) {
  return (
    <View style={flip}>
      <ChevronRight size={size} color={color} />
    </View>
  );
}
