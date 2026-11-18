/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Trigger paths use exact matching, including a configured trailing slash.
  skipTrailingSlashRedirect: true,
  devIndicators: false,
};
export default config;
