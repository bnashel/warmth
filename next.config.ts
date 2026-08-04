import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // suncalc@2 ships an "exports" map with only types/import/require and
      // no "default" condition, which Turbopack's dev resolver won't match —
      // `npm run dev` died with "Can't resolve 'suncalc'" (the production
      // build resolves it fine, so this is dev-only). Point at the ESM entry
      // the package's own "import" condition names. Not a new dependency:
      // same package, explicit path.
      suncalc: "./node_modules/suncalc/index.js",
    },
  },
};

export default nextConfig;
