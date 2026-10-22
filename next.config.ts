import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false, // Keep the development toolbar from covering mobile dialog actions.
  poweredByHeader: false, // ZAP: X-Powered-By information disclosure
  images: {
    domains: ["lh3.googleusercontent.com"],
  },
};

export default nextConfig;
