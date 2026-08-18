import {McpServer} from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { getMembershipData } from "../bungie.ts";
import { withAuth } from "../utilities/withAuth.ts"

const typeToPlatform = (type: number): string => {
  switch (type) {
    case 1: return 'Xbox'
    case 2: return 'Playstation'
    case 3: return 'Steam'
    case 4: return 'Blizzard'
    case 5: return 'Stadia'
    case 6: return 'Epic'
    case 254: return 'BungieNext'
    default: return 'Unknown'  
  }
}

export const registerAccountTools = (server: McpServer) => {
  server.registerTool('whoami', {
    description: 'Returns the signed-in Destiny 2 account (platform and membership ID). Also the tool to call to authorize access to Destiny 2',
    inputSchema: z.object({})
  },
  async () => withAuth(async () => {
    const {membershipId, membershipType } = await getMembershipData();
    return {content: [{ type: 'text', text: `ID: ${membershipId}\nMembership Type: ${membershipType} (${typeToPlatform(membershipType)})`}]}
  })
  
  );
  
}

