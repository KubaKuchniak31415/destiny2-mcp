import { ensureManifest} from './manifest.ts';
import { DatabaseSync } from "node:sqlite";
import type { Weapon, Perk } from "./types.ts";

const openIndex = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  
  const weaponByHash = db.prepare(`SELECT hash, name, type, tierType FROM weapons WHERE hash = ?;`);
  const perkRows = db.prepare(`
    SELECT perk_hash, perk_name, column_index FROM weapon_perks
    WHERE weapon_hash = ?
    AND is_enhanced = 0
    ORDER BY column_index, perk_name;
  `)

  return {
    getWeapon: (hash: number): Weapon | null => {
      const row = weaponByHash.get(hash);
      return row ? {
        hash: row.hash as number,
        name: row.name as string,
        type: row.type as string,
        tierType: row.tierType as number | null
      } : null;
    },
    getWeaponPerks: (hash: number): Map<number, Perk[]> => {
      const perkMap = new Map<number, Perk[]>();
      
      for (const row of perkRows.iterate(hash)) {
        const columnIndex = row.column_index as number;


        const perk: Perk = {
          hash: row.perk_hash as number,
          name: row.perk_name as string,
          isEnhanced: false
        }

        const perks = perkMap.get(columnIndex);
        if (perks) perks.push(perk);
        else perkMap.set(columnIndex, [perk]);
      }

      return perkMap;
    },
    close: () => db.close()
  }
}

export type Index = ReturnType<typeof openIndex>;

let indexPromise: Promise<Index> | undefined;

const getIndex = (): Promise<Index> => {
  indexPromise ??= ensureManifest()
    .then(({ index }) => openIndex(index as string))
    .catch(err => {
      indexPromise = undefined;
      throw err;
    });
  return indexPromise;
}

export { openIndex, getIndex }