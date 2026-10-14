import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@libsql/client", "libsql"],
  images: { unoptimized: true },
  // The DB/secret path is computed from cwd, which makes the tracer pull the whole runtime config dir
  // (database, secret.key) into the standalone output. It's runtime data, never part of the build.
  outputFileTracingExcludes: { "*": ["config/**"] },
};

export default nextConfig;
