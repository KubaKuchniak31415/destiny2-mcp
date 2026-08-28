import {McpServer} from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { withAuth } from "../utilities/withAuth.ts"
import { characterNames, filterItems, itemFilterSchema } from "../inventory.ts";
import { getCachedProfile, getResolvedItems } from "../profile.ts";
import { formatItems, formatTransfer, type FormatterContext } from "../format.ts";
import { moveItem, pickEviction, pickReplacement, planRoute, resolveDestination, type Leg } from "../transfer.ts";

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
  );
  server.registerTool(
  'moveItem',
  {
    description: [
      'Moves one specific item to a character or the vault, optionally can equip on arrival. ' +
      `Perform a move when asked do not ask the user to confirm first`,

      `itemInstanceId identifies one copy and comes from searchItems. Names aren't unique, a player might hold ` +
      `six items called Fatebringer, never guess or try to construct an ID. search first.`,

      `Side effects will happen automatically and are always named in the returned text. Moving an equipped item` +
      `equips a replacement item in its slot before the actual movement. A full destination sends an item into the vault to make space. ` +
      `Both are reversible, the report gives the name and itemInstanceId of everything moved, so anything can be moved back. `,

      `Moving an item from one place to another usually takes more than one transfer operation. ` +
      `A log of these transfer operations will be returned in text as well as any errors, one line per operation. ` +
      `On failure it states where the item actually ended up. Read it rather than assuming the move completed` 
    ].join('\n\n'),
    inputSchema: z.object({
      itemInstanceId: z.string().describe('From searchItems. Identifies one specific copy of an item.'),
      destination: z.enum(['Hunter', 'Titan', 'Warlock', 'Vault']).describe('A character, named by class, or the vault.'),
      equip: z.boolean().optional().describe('Equip on arrival. Ignored when destination is vault'),
    }),
  },
  async ({ itemInstanceId, destination, equip = false}) =>
    withAuth(async () => {
      const profile = await getCachedProfile()
      const charNames = characterNames(profile); 
      const resolvedItems = await getResolvedItems();
      const {items: filtered} = filterItems(resolvedItems, {itemInstanceId});
      if (filtered.length > 1) throw new Error('Item filter came back with more than 1 item for instance Id');
      
      const item = filtered[0];
      if (!item) throw new Error('Item not found')
      const destinationId = resolveDestination(profile, destination)

      const legs: Leg[] = []
      const ctx: FormatterContext = {
        item,
        characterNames: charNames,
        replacement: undefined,
        evicted: undefined
      }



      if (item.equipped) {
        let replacement = pickReplacement(resolvedItems, item)
        if (!replacement) {
          replacement = pickReplacement(resolvedItems, item, true)
          if (!replacement) {throw new Error('Couldnt get replacement from vault')}
          if (!item.characterId) throw new Error(`Couldn't get character ID from item`)
          legs.push({
            kind: 'fromVault',
            itemHash: replacement.itemHash,
            itemId: replacement.itemInstanceId,
            to: item.characterId,
            replacement: true
          })
        }
        ctx.replacement = replacement
        legs.push(...planRoute(item, destinationId, {equip, replacement: replacement}))
      } else {
        legs.push(...planRoute(item, destinationId, {equip}))
      }

      if (legs.length === 0) {
        return {content: [{type: 'text', text: `Item already at ${destination}`}]}
      } 

      const res = await moveItem(legs)

      if (res.failed) {
        if (res.failed.error.errorCode === 1642 || res.failed.error.errorCode === 1637) {
          const itemToEvict = pickEviction(resolvedItems, destinationId, item)
          if (!itemToEvict) return {content: [{type: 'text', text: `${formatTransfer(res, ctx)}`}]}
          if (!itemToEvict.characterId) throw new Error(`Couldn't get character ID from item`)
          const evictLeg: Leg = {
            kind: 'toVault',
            itemHash: itemToEvict.itemHash,
            itemId: itemToEvict.itemInstanceId,
            from: itemToEvict.characterId,
            eviction: true
          }
          ctx.evicted = itemToEvict
          const remainingLegs = legs.slice(res.completed.length)
          const retry = await moveItem([evictLeg, ...remainingLegs])
          return{
            content: [{type: 'text', text: `${formatTransfer(res, ctx)}\n${formatTransfer(retry, ctx)}`}]
          }
        }
      }
      return {
        content: [
          {
            type: 'text',
            text: `${formatTransfer(res, ctx)}`,
          },
        ],
      }
    }),
)}


