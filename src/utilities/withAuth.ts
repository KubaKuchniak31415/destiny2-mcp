import type { CallToolResult } from "@modelcontextprotocol/server";
import { completeReauth, ReauthRequired, beginReauth, } from "../auth/session.ts";

export const withAuth = async (
  work: () => Promise<CallToolResult>
): Promise<CallToolResult> => {
  try {
    return await work();
  } catch (err) {
    if (!(err instanceof ReauthRequired)) throw err;
  }

  try {
    const result = await completeReauth();
    if (result === 'pending') return stillWaiting();
    return await work();
  } catch (err) {
    if (!(err instanceof ReauthRequired)) throw err;
  }

  return handoff(beginReauth());
}

const stillWaiting = (): CallToolResult => ({
  content: [{
    type: 'text',
    text: 
      `Still waiting for you to approve access in the browser. \n\n` +
      `If you have already approved it, call this tool again in a few seconds\n` +
      `The authorization code is captured automatically\n`
  }]
});

const handoff = (url:string): CallToolResult => ({
  content: [{
    type: 'text',
    text: `Destiny 2 access needs authorizing\n\n` +
    `1. Open ${url}\n` +
    `2. Approve access on bungie.net You will likely get a browser warning\n` +
    `3. Call this tool again with the same arguments\n`
  }]
})