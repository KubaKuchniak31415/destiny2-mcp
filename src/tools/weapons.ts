import {McpServer} from "@modelcontextprotocol/server";
import { getIndex } from "../db.ts";
import * as formatter from "../format.ts";
import * as z from "zod/v4";



export const registerWeaponTools = (server: McpServer): void => {
  server.registerTool("getWeaponDetails", {
    description: `Fetches a weapon by its hash from the local manifest database 
    along with all of the perks it could possibly roll sorted by columns.`,
    inputSchema: z.object({ hash: z.number() })},
    async ({ hash }) => {
      const index = await getIndex();
      const weapon = index.getWeapon(hash);
      if (!weapon) {
        return { content: [{ type: 'text', text: `Weapon not found with hash ${hash}.` }], isError: true };
      }

      const perkColumns = index.getWeaponPerks(hash);


      return { content: [{ type: 'text', text: formatter.formatWeaponDescription(weapon, perkColumns) }] }
    }
  );
};