// Dock debug log storage rules (see prisma/schema.prisma DockLog).
import { z } from "zod";

/**
 * Kept rows' real size (text + measured per-row overhead) stays under this.
 * Default 35 MB: room for deleted rows waiting for VACUUM, so the table on
 * disk stays under 50 MB.
 */
export function capBytes(env: Record<string, string | undefined> = process.env): number {
  const v = Number(env.DOCK_LOG_CAP_BYTES);
  return Number.isFinite(v) && v > 0 ? v : 35 * 1024 * 1024;
}

/** Measured on Postgres 16 (2026-11-10): row header, id/seq/at/bytes, and the three index entries. */
export const ROW_OVERHEAD = 270;

/** When over the cap, trim to this share of it, so trimming isn't needed on every upload. */
export const TRIM_TO = 0.9;

export const MAX_LINES = 1000;
export const MAX_MSG = 4000;

export const uploadSchema = z.object({
  device: z.string().min(1).max(200),
  lines: z
    .array(
      z.object({
        seq: z.number().int().nonnegative(),
        at: z.number().int().positive(), // epoch ms on the head unit
        tag: z.string().min(1).max(20),
        msg: z.string().max(100_000),
      }),
    )
    .max(MAX_LINES),
});

/** Stored size of one row: its text plus the measured overhead of the row and its index entries. */
export function rowBytes(device: string, tag: string, msg: string): number {
  return Buffer.byteLength(device) + Buffer.byteLength(tag) + Buffer.byteLength(msg) + ROW_OVERHEAD;
}

/** How many bytes to delete (oldest first) so `total` ends at TRIM_TO × cap; 0 while under the cap. */
export function excessBytes(total: number, cap: number): number {
  return total <= cap ? 0 : Math.ceil(total - cap * TRIM_TO);
}

export function rowsFor(device: string, lines: z.infer<typeof uploadSchema>["lines"]) {
  return lines.map((l) => {
    const msg = l.msg.length > MAX_MSG ? l.msg.slice(0, MAX_MSG) + "…" : l.msg;
    return { device, seq: BigInt(l.seq), at: new Date(l.at), tag: l.tag, msg, bytes: rowBytes(device, l.tag, msg) };
  });
}
