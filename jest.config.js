/** Unit tests for pure logic only; rendering is exercised on device. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  // expo-localization is ESM and reads native state Node does not have. The
  // language is set explicitly in the tests that care.
  moduleNameMapper: {
    '^expo-localization$': '<rootDir>/test/expo-localization.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
};
