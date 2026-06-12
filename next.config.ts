import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["iron-session", "iron-webcrypto"],
  
  // تحسينات الأداء
  poweredByHeader: false,
  
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
    // تحسينات صور Next.js
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31536000, // 1 سنة — لا تتغير الأعلام
  },
};

export default nextConfig;
