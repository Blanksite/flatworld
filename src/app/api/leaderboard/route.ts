import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/storage";

export async function GET() {
  try {
    const list = getLeaderboard();

    // Compute stats
    const totalRuns = list.length;
    const dailyRuns = list.filter((x) => x.mode === "daily").length;
    // Each daily cup run burns 40 WIF, 55 WIF to prize pool
    const totalWifBurned = dailyRuns * 40;
    const prizePool = dailyRuns * 55;

    return NextResponse.json({
      leaderboard: list.map((item, index) => ({
        rank: index + 1,
        player: item.player,
        name: item.name || `${item.player.slice(0, 6)}...${item.player.slice(-4)}`,
        score: item.score,
        hats: item.hats,
        mode: item.mode,
        timestamp: item.timestamp,
      })),
      stats: {
        totalRuns,
        dailyRuns,
        totalWifBurned,
        prizePool,
      },
    });
  } catch (err: unknown) {
    console.error("Leaderboard fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
