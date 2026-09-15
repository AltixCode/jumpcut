/// <reference types="jest" />
/** Stands in for expo-tracking-transparency under Jest; ATT itself is exercised on device. */
export const requestTrackingPermissionsAsync = jest.fn(() =>
  Promise.resolve({ status: 'granted' }),
);
export const getTrackingPermissionsAsync = jest.fn(() => Promise.resolve({ status: 'granted' }));
