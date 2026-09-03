import type { NextConfig } from "next";

const config: NextConfig = {
  // @tender/shared ships TypeScript source rather than a build step.
  transpilePackages: ["@tender/shared"],
};

export default config;
