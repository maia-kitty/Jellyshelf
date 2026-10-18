import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Resize AniList's oversized originals (covers are often 400-700 KB) once and cache them as WebP; see lib/img.ts.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "s4.anilist.co", pathname: "/file/anilistcdn/**" },
      { protocol: "https", hostname: "image.tmdb.org", pathname: "/t/p/**" },
    ],
    // Every width lib/img.ts asks for (OPT_WIDTHS).
    imageSizes: [48, 96, 160, 240, 320, 480, 640],
    deviceSizes: [960, 1280, 1920],
    formats: ["image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  // The DB/secret path is computed from cwd, which makes the tracer pull the whole runtime config dir
  // (database, secret.key) into the standalone output. It's runtime data, never part of the build.
  outputFileTracingExcludes: { "*": ["config/**"] },
  // No framing (clickjacking a signed-in admin), no MIME sniffing, and no full URLs leaked to other sites.
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
};

export default nextConfig;
