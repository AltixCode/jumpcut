/** Unit tests for pure logic only; rendering is exercised on device. */
module.exports = {
  // React Native's __DEV__ global does not exist in Node. It is set false so the suite
  // exercises the release branch of ad-unit selection rather than the developer one.
  globals: { __DEV__: false },
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  // expo-localization is ESM and reads native state Node does not have. The
  // language is set explicitly in the tests that care.
  moduleNameMapper: {
    '^react-native$': '<rootDir>/test/react-native.ts',
    '^react-native-google-mobile-ads$': '<rootDir>/test/google-mobile-ads.ts',
    '^expo-tracking-transparency$': '<rootDir>/test/expo-tracking-transparency.ts',
    '^expo-file-system/legacy$': '<rootDir>/test/expo-file-system-legacy.ts',
    '^expo-localization$': '<rootDir>/test/expo-localization.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
};
