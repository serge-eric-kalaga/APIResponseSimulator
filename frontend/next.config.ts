import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Trigger paths use exact matching, including a configured trailing slash.
  skipTrailingSlashRedirect: true,
  devIndicators: false,
};
export default config;
