// Production API
const API_BASE_URL_PRODUCTION = "https://shreyclinic.com/api";

// Local backend - only used in development
// const API_BASE_URL_DEVELOPMENT = "http://localhost:8080/api";
const API_BASE_URL_DEVELOPMENT = "https://shreyclinic.com/api";

/**
 * You do not need to swap comments before a release build: release bundles
 * always resolve to API_BASE_URL_PRODUCTION.
 */
export const API_BASE_URL =
  process.env.NODE_ENV === "development"
    ? API_BASE_URL_DEVELOPMENT
    : API_BASE_URL_PRODUCTION;
