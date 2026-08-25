import {McpServer} from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { withAuth } from "../utilities/withAuth.ts"
import { filterItems, itemFilterSchema } from "../inventory.ts";
import { getResolvedItems } from "../profile.ts";
import { formatItems } from "../format.ts";

export const registerInventoryTools = (server: McpServer) => {
  server.registerTool('searchItems', {
    description: ["Searches the signed-in player's Destiny 2 inventory. Every weapon and " +
"armour piece across the vault and all three characters, with power, stats and rolled perks. " +
"For what a weapon can roll in general instead of what this player's copy has use getWeaponDetails.",

"Returns one item per line, led by a legend naming the columns and followed by a total match count. " +
"Results are truncated (30 item default). When the total is much larger than what came back, " +
"add filters and search again rather than paging through with offset. The user almost always wants a narrower answer.",

"Every line ends with an itemInstanceId identifying one specific copy of an item. Names are not unique, " +
"a player may hold six items called Fatebringer so that id is the only way to refer to one.",

"Perk rolls are included automatically when few enough items match, or when filtering by perk"
    ].join('\n\n'),
    inputSchema: z.object({
      filterOptions: itemFilterSchema.optional(),
      sortingOptions: z.enum(['Power', 'Name', 'Rarity']).optional(),
      showPerks: z.boolean().optional(),
    }),
  },
  async ({filterOptions = {}, sortingOptions = 'Power', showPerks}) =>
     withAuth(async () => {
    const resolvedItems = await getResolvedItems()
    const {count, items} = filterItems(resolvedItems, filterOptions, sortingOptions)

    const LONG_THRESHOLD = 10

    if (showPerks === undefined) {
      if (filterOptions.perks !== undefined || (filterOptions.limit ?? LONG_THRESHOLD+1) <= LONG_THRESHOLD || count <= LONG_THRESHOLD) {
        showPerks = true
      } else {
        showPerks = false
      }
    }
    
    const formatted = formatItems(count, items, showPerks)
    return {content: [{ type: 'text', text: `${formatted}`}]}
  })
)}

