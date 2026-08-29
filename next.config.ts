import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false, // ZAP: X-Powered-By information disclosure
  images: {
    domains: ["lh3.googleusercontent.com"],
  },
};

export default nextConfig;
