import { NextResponse } from "next/server";
import { deepseekBalance, deepseekModel } from "@/lib/ai/deepseek";
import { prisma } from "@/lib/db";
import { describeDbError } from "@/lib/dbErrors";
import { capFor, today } from "@/lib/sources/usage";

// GET /api/ai/usage — DeepSeek balance (from DeepSeek), this month's calls and
// tokens (counted by the app), caps, and a low-balance warning.
export async function GET() {
  try {
    const month = today().slice(0, 7);
    const rows = await prisma.sourceUsage.groupBy({
      by: ["sku"],
      where: { source: "deepseek", day: { startsWith: month } },
      _sum: { count: true },
    });
    const sum = (sku: string) => rows.find((r) => r.sku === sku)?._sum.count ?? 0;
    const balance = await deepseekBalance();
    return NextResponse.json({
      model: deepseekModel(),
      month,
      calls: { agent: sum("agent"), explain: sum("chat") },
      tokens: { in: sum("tokens-in"), out: sum("tokens-out") },
      caps: { agent: capFor("deepseek", "agent"), explain: capFor("deepseek", "chat") },
      balance,
      warning: balance.low
        ? `DeepSeek balance is low (${balance.total ?? "?"} ${balance.currency ?? ""}, warning below ${balance.threshold}). Top up at platform.deepseek.com.`
        : null,
    });
  } catch (err) {
    return NextResponse.json({ error: describeDbError(err) }, { status: 500 });
  }
}
