import app from "./app";
import { logger } from "./lib/logger";
import { existsSync } from "fs";
import { connectWhatsApp } from "./services/whatsapp.js";
import { startSignalMonitor } from "./services/signal-monitor.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Start signal result monitor — always running, auto-marks signals won/lost
  startSignalMonitor();

  // Auto-reconnect WhatsApp if saved credentials exist
  const credsPath = "/tmp/wa-auth/creds.json";
  if (existsSync(credsPath)) {
    logger.info("Saved WhatsApp credentials found — auto-reconnecting…");
    try {
      await connectWhatsApp();
    } catch (e) {
      logger.warn({ e }, "WhatsApp auto-reconnect failed — scan QR to reconnect");
    }
  }
});
