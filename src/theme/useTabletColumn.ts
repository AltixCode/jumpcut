import { useWindowDimensions } from 'react-native';

/** The widest a content column gets on a phone, in points. Never binds: the
 *  widest phone is 440pt. */
const CONTENT_MAX_WIDTH = 640;

/** The widest it gets on a tablet. 1032pt (13" portrait) less two gutters is
 *  984, so this binds only on a landscape 13" and leaves the portrait case
 *  using the screen it is on. */
const TABLET_MAX_WIDTH = 920;

/**
 * Caps and centres a screen's content column.
 *
 * Without it a phone layout stretches edge to edge on a 13" iPad: rows of text
 * run the full 1032pt and the interface reads as one stretched phone app rather
 * than something built for the display. Spread onto a ScrollView's
 * `contentContainerStyle` (or the page's outer View).
 *
 * Deliberately does NOT centre vertically. `justifyContent: 'center'` only has
 * slack when the content is shorter than the viewport -- which on a 13" iPad is
 * most screens -- and that leaves a phone's worth of interface floating in the
 * middle with dead space above and below. Content starts at the top.
 */
export function useTabletColumn() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 700;

  return {
    width: '100%' as const,
    maxWidth: isTablet ? Math.min(width - 48, TABLET_MAX_WIDTH) : CONTENT_MAX_WIDTH,
    alignSelf: 'center' as const,
  };
}
