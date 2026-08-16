import {McpServer, inputRequired, inputResponse} from "@modelcontextprotocol/server";
import { waitForCode } from "../auth/callback.ts";
import { buildAuthorizeUrl } from "../auth/oauth.ts";
import * as z from "zod/v4";
import { randomUUID } from "node:crypto";


export const registerAuthTools = (server: McpServer): void => {
  server.registerTool("bungieLogin", {
    description: `Reauthenticates the user with Bungie.net and updates the local token cache.`,
    inputSchema: z.object({})
  },
  async (_args, ctx) => {
    const prior = inputResponse(ctx.mcpReq.inputResponses, 'authorize');

    if (!prior) {
      const state = randomUUID();
      return inputRequired({
        inputRequests: {
          authorize: inputRequired.elicitUrl({
            message: "Sign in to bungie.net",
            url: buildAuthorizeUrl(state)
          }),
        },
        requestState: state,
      });
    }

    
  }
};