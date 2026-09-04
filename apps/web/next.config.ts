import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  // @tender/shared ships TypeScript source rather than a build step.
  transpilePackages: ["@tender/shared"],
  // Without this Next walks up and picks a stray lockfile in $HOME as the
  // workspace root, which breaks build traces.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
};

export default config;
