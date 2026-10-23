import { NextRequest, NextResponse } from "next/server";
import { replay, InputEvent } from "@/lib/engine";
import { saveLeaderboardEntry } from "@/lib/storage";
import { privateKeyToAccount } from "viem/accounts";

// Verifier wallet private key (used for EIP-712 score attestations)
// Can be customized via env variable or fallback to dev key
const VERIFIER_PRIVATE_KEY = (process.env.VERIFIER_PRIVATE_KEY ||
  "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d") as `0x${string}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { player, seed, inputs, claimedScore, claimedHats, mode } = body;

    if (!seed || typeof seed !== "number") {
      return NextResponse.json({ error: "Missing or invalid seed" }, { status: 400 });
    }

    if (!Array.isArray(inputs)) {
      return NextResponse.json({ error: "Inputs must be an array of recorded ticks" }, { status: 400 });
    }

    // Anti-Spam / Sanity limit: max 36,000 input changes (10 min run)
    if (inputs.length > 36000) {
      return NextResponse.json({ error: "Input log too large" }, { status: 400 });
    }

    // 1. Run deterministic headless simulation replay
    const replayed = replay(seed, inputs as InputEvent[]);

    // 2. Anti-cheat check: simulation score & hats must match client claim
    if (replayed.score !== claimedScore || (typeof claimedHats === "number" && replayed.hats !== claimedHats)) {
      return NextResponse.json(
        {
          valid: false,
          error: `Anti-cheat triggered: Replayed score (${replayed.score}) or hats (${replayed.hats}) does not match claimed (${claimedScore} / ${claimedHats}).`,
          replayed,
        },
        { status: 400 }
      );
    }

    // 3. EIP-712 Attestation signature (for Daily Cup on Robinhood Chain)
    let signature: string | null = null;
    const currentDay = Math.floor(Date.now() / 86400000);

    if (mode === "daily" && player) {
      try {
        const account = privateKeyToAccount(VERIFIER_PRIVATE_KEY);
        signature = await account.signTypedData({
          domain: {
            name: "FlatWorld",
            version: "1",
            chainId: 4663, // Robinhood Chain Mainnet
          },
          types: {
            ScoreAttestation: [
              { name: "player", type: "address" },
              { name: "score", type: "uint256" },
              { name: "hats", type: "uint256" },
              { name: "seed", type: "uint256" },
              { name: "dayId", type: "uint256" },
            ],
          },
          primaryType: "ScoreAttestation",
          message: {
            player: player as `0x${string}`,
            score: BigInt(replayed.score),
            hats: BigInt(replayed.hats),
            seed: BigInt(seed),
            dayId: BigInt(currentDay),
          },
        });
      } catch (err) {
        console.error("Signature attestation failed:", err);
      }
    }

    // 4. Save to leaderboard
    const entry = {
      player: player || "0xAnonymous",
      score: replayed.score,
      hats: replayed.hats,
      mode: (mode as "free" | "daily") || "free",
      timestamp: Date.now(),
    };
    saveLeaderboardEntry(entry);

    return NextResponse.json({
      valid: true,
      score: replayed.score,
      hats: replayed.hats,
      ticks: replayed.ticks,
      signature,
      dayId: currentDay,
      message: "Score verified successfully by FlatWorld simulation engine!",
    });
  } catch (err: unknown) {
    console.error("Score verification error:", err);
    return NextResponse.json({ error: "Internal server verification error" }, { status: 500 });
  }
}
