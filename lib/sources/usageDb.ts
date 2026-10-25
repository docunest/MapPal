import { prisma } from "../db";
import type { UsageStore } from "./usage";

export const dbUsageStore: UsageStore = {
  async add(source, sku, day, delta) {
    const row = await prisma.sourceUsage.upsert({
      where: { source_sku_day: { source, sku, day } },
      create: { source, sku, day, count: Math.max(0, delta) },
      update: { count: { increment: delta } },
    });
    return row.count;
  },
  async monthTotal(source, sku, monthPrefix) {
    const agg = await prisma.sourceUsage.aggregate({
      where: { source, sku, day: { startsWith: monthPrefix } },
      _sum: { count: true },
    });
    return agg._sum.count ?? 0;
  },
};
