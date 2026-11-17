import { readStore, writeStore } from "./identity";

const key = (cardId: string) => `board:seen:${cardId}`;

export const lastSeen = (cardId: string) => Number(readStore(key(cardId)) ?? 0);
export const markSeen = (cardId: string, at = Date.now()) => writeStore(key(cardId), String(at));
