/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination:
          "https://shjoo.synology.me:7881/api/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
