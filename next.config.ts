import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@xenova/transformers"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.blocket.se" },
      { protocol: "https", hostname: "**.ebayimg.com" },
      { protocol: "https", hostname: "**.ebay.com" },
      { protocol: "https", hostname: "i.ebayimg.com" },
    ],
  },
};

export default nextConfig;
