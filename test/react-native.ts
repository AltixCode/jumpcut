/**
 * Stands in for react-native under Jest.
 *
 * The suite runs in a plain Node environment -- the app's logic is pure and its rendering is
 * verified on device -- so importing the real package, which loads native bindings at import
 * time, is not possible. Only the surface the services under test touch is provided; anything
 * else should fail loudly as undefined rather than be quietly stubbed.
 */
export const Platform = {
  OS: 'ios' as 'ios' | 'android',
  select: <T,>(spec: { ios?: T; android?: T; default?: T }): T | undefined =>
    Platform.OS === 'ios' ? (spec.ios ?? spec.default) : (spec.android ?? spec.default),
};
