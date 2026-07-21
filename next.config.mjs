/** @type {import('next').NextConfig} */
const nextConfig = {
  // Automatic memoization via the React Compiler (stable in Next.js 16).
  // Runs through babel-plugin-react-compiler during the webpack build.
  reactCompiler: true,
  serverExternalPackages: ["better-sqlite3", "node-cron", "pino", "pino-pretty", "pino-roll"],
};

export default nextConfig;
