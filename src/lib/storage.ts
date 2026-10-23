import fs from "fs";
import path from "path";

export interface LeaderboardEntry {
  rank?: number;
  player: string;
  name?: string;
  score: number;
  hats: number;
  mode: "free" | "daily";
  timestamp: number;
  txHash?: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "leaderboard.json");

// Default initial high scores for empty leaderboard
const INITIAL_ENTRIES: LeaderboardEntry[] = [
  { player: "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7", name: "doge_king", score: 680, hats: 9, mode: "daily", timestamp: Date.now() - 3600000 },
  { player: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", name: "flat_earther", score: 540, hats: 7, mode: "daily", timestamp: Date.now() - 7200000 },
  { player: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", name: "wif_hat_god", score: 490, hats: 6, mode: "daily", timestamp: Date.now() - 14400000 },
  { player: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", name: "gravity_hater", score: 380, hats: 4, mode: "free", timestamp: Date.now() - 18000000 },
  { player: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4df", name: "robinhoodie", score: 290, hats: 3, mode: "free", timestamp: Date.now() - 25000000 },
];

let memoryLeaderboard: LeaderboardEntry[] = [...INITIAL_ENTRIES];

function ensureStorage(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_ENTRIES, null, 2), "utf8");
    }
  } catch {
    // Read-only filesystem fallback (e.g. serverless Vercel edge)
  }
}

export function getLeaderboard(): LeaderboardEntry[] {
  try {
    ensureStorage();
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, "utf8");
      const list = JSON.parse(data) as LeaderboardEntry[];
      return list.sort((a, b) => b.score - a.score);
    }
  } catch {
    // fallback to memory
  }
  return memoryLeaderboard.sort((a, b) => b.score - a.score);
}

export function saveLeaderboardEntry(entry: LeaderboardEntry): LeaderboardEntry[] {
  let list = getLeaderboard();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  // Keep top 100
  list = list.slice(0, 100);
  memoryLeaderboard = list;

  try {
    ensureStorage();
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), "utf8");
  } catch {
    // Vercel serverless environment fallback
  }

  return list;
}
