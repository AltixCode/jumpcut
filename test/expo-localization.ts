/**
 * Stands in for expo-localization under Jest.
 *
 * The real module is ESM and reaches for native state that does not exist in
 * Node. The tests that need a language set it explicitly with setLanguage(), so
 * what the device would have reported is not what is under test here.
 */
export const getLocales = () => [{ languageCode: 'en' }];
