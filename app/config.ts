// Production API — always used in release APK/IPA bundles (__DEV__ is false there).
const API_BASE_URL_PRODUCTION = "https://shreyclinic.com/api";

// Local backend — only used in development (Metro / debug builds with __DEV__ true).
const API_BASE_URL_DEVELOPMENT = "http://localhost:8080/api";

/**
 * You do not need to swap comments before a release build: release bundles
 * always resolve to API_BASE_URL_PRODUCTION.
 */
export const API_BASE_URL =
  typeof __DEV__ !== "undefined" && __DEV__
    ? API_BASE_URL_DEVELOPMENT
    : API_BASE_URL_PRODUCTION;
