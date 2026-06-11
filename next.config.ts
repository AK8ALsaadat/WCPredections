import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["iron-session", "iron-webcrypto"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
