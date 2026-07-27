import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 ships a native binary; keep it out of the serverless
  // bundle graph unless a route actually imports it (DATA_SOURCE=sqlite,
  // local dev only — see migration.md §8).
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
