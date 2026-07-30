
export type DbId  = number & { readonly __dbId: unique symbol };

export const toDbId = (hash: number): DbId => {
  return (hash > 0x7FFFFFFF ? hash - 0x100000000 : hash) as DbId;
}

export const toHash = (id: DbId): number => {
  return (id < 0 ? id + 0x100000000 : id);
}