import { seed } from ".";
import { logger, seedLogger } from "@/lib/logger";

seed().catch((err: unknown) => {
  seedLogger.error({ err }, "Seed failed");
  logger.flush();
  process.exit(1);
});
