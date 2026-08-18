import {McpServer} from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {getManifestVersion} from "./bungie.ts";
import * as z from "zod/v4";
import { getIndex } from "./db.ts";
import { registerWeaponTools } from "./tools/weapons.ts";
import { registerAccountTools } from "./tools/account.ts";

const createServer = (): McpServer => {

  const server = new McpServer({
    name: "destiny2-mcp",
    version: "0.1.0",
  })

  registerWeaponTools(server);
  registerAccountTools(server);

  server.registerTool("getManifestVersion", {
    description: "Fetches the current Destiny 2 manifest version from Bungie.net",
    inputSchema: z.object({})},
    async () => {
      const manifestVersion = await getManifestVersion();
      return { content: [{ type: 'text', text: manifestVersion }] };
    }
  );

  return server;
}

void getIndex();
serveStdio(createServer);