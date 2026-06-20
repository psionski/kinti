import pino from "pino";

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

function resolveLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && LOG_LEVELS.includes(envLevel as LogLevel)) {
    return envLevel as LogLevel;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const logLevel = resolveLogLevel();
const logDir = process.env.LOG_DIR ?? "./logs";
const isDev = process.env.NODE_ENV !== "production";
const isTest = !!process.env.VITEST;

// In tests, skip transports (no worker threads, no file I/O) — logs are
// silent by default to avoid noise from intentional error-path tests.
// Set LOG_LEVEL=debug (or any level) to see logs when debugging a test.
const testLevel = !process.env.LOG_LEVEL ? "silent" : logLevel;

// Singleton on globalThis so the logger (and its transports) survive
// Next.js dev-mode re-bundling — prevents stacking EventEmitter listeners.
const g = globalThis as unknown as { __kintiLogger?: pino.Logger };

function createLogger(): pino.Logger {
  if (isTest) return pino({ level: testLevel });
  return pino(
    { level: logLevel },
    pino.transport({
      targets: [
        isDev
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
                translateTime: "SYS:HH:MM:ss",
                ignore: "pid,hostname",
              },
              level: logLevel,
            }
          : {
              target: "pino/file",
              options: { destination: 1 },
              level: logLevel,
            },
        {
          target: "pino-roll",
          options: {
            file: `${logDir}/kinti`,
            frequency: "daily",
            size: "10m",
            mkdir: true,
            dateFormat: "yyyy-MM-dd",
            limit: { count: 14 },
          },
          level: logLevel,
        },
      ],
    })
  );
}

const logger = g.__kintiLogger ?? (g.__kintiLogger = createLogger());

export { logger };
export const cronLogger = logger.child({ module: "cron" });
export const apiLogger = logger.child({ module: "api" });
export const mcpLogger = logger.child({ module: "mcp" });
export const financialLogger = logger.child({ module: "financial" });
export const dbLogger = logger.child({ module: "db" });
export const seedLogger = logger.child({ module: "seed" });
