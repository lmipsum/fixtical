import { mlsz } from "./mlsz.ts";
import { mrsz } from "./mrsz.ts";
import { mvlsz } from "./mvlsz.ts";
import type { Source } from "./types.ts";

/** Every source, by the name a calendar's `source` setting uses. */
export const SOURCES: ReadonlyMap<string, Source> = new Map([
  [mlsz.name, mlsz],
  [mvlsz.name, mvlsz],
  [mrsz.name, mrsz],
]);
