/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3", "node-cron", "pino", "pino-pretty", "pino-roll"],
};

export default nextConfig;
