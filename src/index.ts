import {McpServer} from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {getManifestVersion} from "./bungie.ts";
import * as z from "zod/v4";
import { getIndex } from "./db.ts";
import { registerWeaponTools } from "./tools/weapons.ts";

const createServer = (): McpServer => {
  //const API_KEY = process.env.BUNGIE_API_KEY;

  const server = new McpServer({
    name: "destiny2-mcp",
    version: "0.1.0",
  })

  registerWeaponTools(server);

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