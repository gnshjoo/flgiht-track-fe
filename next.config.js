/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination:
          "https://flight-track-production-5075.up.railway.app/api/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
