import { createServer } from "node:http";
import path from "node:path";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { TeleprotoGateway } from "./gateway.js";
import { Vault } from "./vault.js";

const config = loadConfig();
const vault = new Vault(path.join(config.dataDir, "vault.enc"), config.encryptionKey);
const gateway = new TeleprotoGateway(
  { apiId: config.apiId, apiHash: config.apiHash },
  config.sharedSecret,
);

const server = createServer(createApp({ config, gateway, vault }));

server.listen(config.port, "0.0.0.0", () => {
  console.log(
    `nexpool-telegram-service listening on :${config.port} (telegram configured: ${gateway.configured})`,
  );
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
