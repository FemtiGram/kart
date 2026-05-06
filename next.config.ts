import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // /energi is now the category landing page; the energy MAP moved to /energikart.
      // For existing deep-links that include map coordinates (Stedsprofil, social
      // shares of pinned locations), redirect to the map. Bare /energi serves the
      // new category page.
      {
        source: "/energi",
        has: [{ type: "query", key: "lat" }],
        destination: "/energikart",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
