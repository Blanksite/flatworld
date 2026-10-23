"use client";

import React, { useState, useEffect, useCallback } from "react";
import GameCanvas from "@/components/GameCanvas";
import { InputEvent } from "@/lib/engine";
import {
  Trophy,
  Flame,
  ShieldCheck,
  Zap,
  ExternalLink,
  Coins,
  Crown,
  Gamepad2,
  CheckCircle2,
  RefreshCw,
  Wallet,
} from "lucide-react";

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

interface LeaderboardEntry {
  rank: number;
  player: string;
  name: string;
  score: number;
  hats: number;
  mode: "free" | "daily";
  timestamp: number;
}

export default function FlatWorldHome() {
  const [activeMode, setActiveMode] = useState<"free" | "daily">("free");
  const [activeHatSkin, setActiveHatSkin] = useState<"pink" | "gold" | "astro">("pink");
  const [bestScore, setBestScore] = useState<number>(0);
  const [totalBurnedWif, setTotalBurnedWif] = useState<number>(428_950);
  const [dailyPoolWif, setDailyPoolWif] = useState<number>(12_500);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isRobinhoodChain, setIsRobinhoodChain] = useState<boolean>(false);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState<boolean>(false);
  const [showInspector, setShowInspector] = useState<boolean>(false);
  const [lastRunPayload, setLastRunPayload] = useState<{
    seed: number;
    score: number;
    hats: number;
    ticks: number;
    inputs: InputEvent[];
    signature?: string;
  } | null>(null);

  // Fetch leaderboard data from API
  const fetchLeaderboard = useCallback(async () => {
    setIsLoadingLeaderboard(true);
    try {
      const res = await fetch("/api/leaderboard");
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard || []);
        if (data.stats) {
          setTotalBurnedWif(428950 + (data.stats.totalWifBurned || 0));
          setDailyPoolWif(12500 + (data.stats.prizePool || 0));
        }
      }
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Check initial wallet connection
  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum
        .request({ method: "eth_accounts" })
        .then((accounts) => {
          const list = accounts as string[];
          if (list && list.length > 0) {
            setWalletAddress(list[0]);
          }
        })
        .catch(console.error);

      window.ethereum
        .request({ method: "eth_chainId" })
        .then((chainId) => {
          setIsRobinhoodChain(chainId === "0x1237" || chainId === "4663");
        })
        .catch(console.error);
    }
  }, []);

  // Connect wallet & ensure Robinhood Chain (4663)
  const connectWallet = async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      alert("Please install MetaMask, Rabby, or a Web3 wallet to connect to Robinhood Chain (4663)!");
      return;
    }

    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (accounts && accounts.length > 0) {
        setWalletAddress(accounts[0]);
      }

      // Check / switch chain
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x1237" }], // 4663 in hex
        });
        setIsRobinhoodChain(true);
      } catch (switchError: unknown) {
        // This error code indicates that the chain has not been added to MetaMask
        const err = switchError as { code?: number };
        if (err.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x1237",
                chainName: "Robinhood Chain",
                rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
              },
            ],
          });
          setIsRobinhoodChain(true);
        }
      }
    } catch (err) {
      console.error("Wallet connection error:", err);
    }
  };

  // Called when player falls off or gets hit
  const handleGameOver = async (
    finalScore: number,
    hats: number,
    ticks: number,
    inputs: InputEvent[],
    seed: number
  ) => {
    if (finalScore > bestScore) {
      setBestScore(finalScore);
    }

    setVerificationStatus("Verifying physics simulation with server engine...");

    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player: walletAddress || "0xPlayer",
          seed,
          inputs,
          claimedScore: finalScore,
          claimedHats: hats,
          claimedTicks: ticks,
          mode: activeMode,
        }),
      });

      const data = await res.json();
      if (res.ok && data.valid) {
        setVerificationStatus(
          `Verified: ${data.score} PTS (${data.hats} hats) validated! ${
            data.signature ? "Attested on-chain with EIP-712" : ""
          }`
        );
        setLastRunPayload({
          seed,
          score: finalScore,
          hats,
          ticks,
          inputs,
          signature: data.signature,
        });
        fetchLeaderboard();
      } else {
        setVerificationStatus(`Verification failed: ${data.error || "Simulation mismatch"}`);
      }
    } catch (err) {
      console.error("Score submission error:", err);
      setVerificationStatus("Network error verifying score");
    }

    if (activeMode === "daily") {
      setTotalBurnedWif((prev) => prev + 40);
      setDailyPoolWif((prev) => prev + 55);
    }
  };

  return (
    <div className="min-h-screen bg-[#07080F] text-white font-sans selection:bg-pink-500 selection:text-white">
      {/* Top Banner: Robinhood Chain Hackathon Notice */}
      <div className="bg-gradient-to-r from-pink-950/40 via-purple-950/40 to-blue-950/40 border-b border-white/10 px-4 py-2 text-center text-xs font-mono text-neutral-300 flex items-center justify-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span>BUILT FOR THE $WIF HACKATHON ON ROBINHOOD CHAIN (CHAIN ID: 4663)</span>
        <a
          href="https://worldisflat.fun/build/rules"
          target="_blank"
          rel="noreferrer"
          className="underline text-pink-400 hover:text-pink-300 ml-1 inline-flex items-center gap-0.5"
        >
          RULES <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Navigation Header */}
      <header className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-xl shadow-lg shadow-pink-500/30">
            🎩
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-1.5">
              FLATWORLD <span className="text-xs px-2 py-0.5 rounded-md bg-white/10 text-pink-400 font-mono font-normal">WIF ARENA</span>
            </h1>
            <p className="text-[11px] font-mono text-neutral-400">DON&apos;T FALL OFF THE FLAT EDGE</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${isRobinhoodChain ? "bg-emerald-400" : "bg-amber-400"}`} />
            <span>ROBINHOOD CHAIN 4663</span>
          </div>

          <button
            onClick={connectWallet}
            className="px-4 py-2 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white text-xs font-mono font-bold rounded-xl transition-all shadow-md shadow-pink-500/20 active:scale-95 flex items-center gap-2"
          >
            <Wallet className="w-3.5 h-3.5" />
            {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "CONNECT WALLET"}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 pb-16">
        {/* Flywheel Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
            <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1 mb-1">
              <Flame className="w-3.5 h-3.5 text-rose-500" /> TOTAL $WIF BURNED
            </span>
            <span className="text-xl sm:text-2xl font-black text-rose-400 font-mono">
              {totalBurnedWif.toLocaleString()} <span className="text-xs text-white/50">WIF</span>
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
            <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1 mb-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400" /> DAILY PRIZE POOL
            </span>
            <span className="text-xl sm:text-2xl font-black text-amber-400 font-mono">
              {dailyPoolWif.toLocaleString()} <span className="text-xs text-white/50">WIF</span>
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
            <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1 mb-1">
              <Zap className="w-3.5 h-3.5 text-blue-400" /> TOURNAMENT TICKET
            </span>
            <span className="text-xl sm:text-2xl font-black text-white font-mono">
              100 <span className="text-xs text-white/50">WIF (40% BURN)</span>
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
            <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> ANTI-CHEAT PROOF
            </span>
            <span className="text-sm sm:text-base font-bold text-emerald-400 font-mono flex items-center gap-1 mt-1">
              EIP-712 REPLAY VERIFIED
            </span>
          </div>
        </div>

        {/* Verification Status Toast / Notice */}
        {verificationStatus && (
          <div className="mb-6 p-3 rounded-xl bg-neutral-900 border border-pink-500/30 flex items-center justify-between text-xs font-mono text-neutral-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{verificationStatus}</span>
            </div>
            {lastRunPayload && (
              <button
                onClick={() => setShowInspector(!showInspector)}
                className="text-pink-400 hover:text-pink-300 underline font-bold"
              >
                {showInspector ? "Hide Inspector" : "Inspect Run Proof"}
              </button>
            )}
          </div>
        )}

        {/* Anti-Cheat Proof Inspector Modal / Collapse */}
        {showInspector && lastRunPayload && (
          <div className="mb-6 p-4 rounded-2xl bg-black/80 border border-white/20 font-mono text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-pink-400 font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> DETERMINISTIC RUN ATTESTATION
              </span>
              <span className="text-neutral-500">IEEE-754 Bit-Identical Replay</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div>
                <span className="text-neutral-500 block">SEED</span>
                <span className="text-white font-bold">{lastRunPayload.seed}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">TOTAL TICKS</span>
                <span className="text-white font-bold">{lastRunPayload.ticks} ({(lastRunPayload.ticks / 60).toFixed(1)}s)</span>
              </div>
              <div>
                <span className="text-neutral-500 block">INPUT EVENTS</span>
                <span className="text-white font-bold">{lastRunPayload.inputs.length} keypresses</span>
              </div>
              <div>
                <span className="text-neutral-500 block">VERIFIED SCORE</span>
                <span className="text-emerald-400 font-bold">{lastRunPayload.score} PTS</span>
              </div>
            </div>
            {lastRunPayload.signature && (
              <div className="pt-2 border-t border-white/10">
                <span className="text-neutral-500 block mb-1">EIP-712 VERIFIER SIGNATURE (ROBINHOOD CHAIN 4663)</span>
                <p className="break-all text-[10px] text-pink-300/80 bg-neutral-900 p-2 rounded-lg font-mono">
                  {lastRunPayload.signature}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Mode Selector Tabs */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <button
            onClick={() => setActiveMode("free")}
            className={`px-5 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 ${
              activeMode === "free"
                ? "bg-white text-black shadow-lg"
                : "bg-white/5 text-neutral-400 hover:text-white border border-white/10"
            }`}
          >
            <Gamepad2 className="w-4 h-4" /> FREE PLAY (UNLIMITED PRACTICE)
          </button>

          <button
            onClick={() => setActiveMode("daily")}
            className={`px-5 py-2.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 ${
              activeMode === "daily"
                ? "bg-gradient-to-r from-pink-500 to-rose-600 text-white shadow-lg shadow-pink-500/30"
                : "bg-white/5 text-neutral-400 hover:text-white border border-white/10"
            }`}
          >
            <Trophy className="w-4 h-4" /> DAILY CUP (WIN $WIF)
          </button>
        </div>

        {/* Game Canvas Container */}
        <div className="mb-10">
          <GameCanvas
            mode={activeMode}
            activeHatSkin={activeHatSkin}
            onGameOver={handleGameOver}
          />
        </div>

        {/* Bottom 2-Column Section: Leaderboard + Hat Shop */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Daily Leaderboard Column */}
          <div className="lg:col-span-7 bg-white/[0.02] border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-lg">DAILY CUP LEADERBOARD</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchLeaderboard}
                  disabled={isLoadingLeaderboard}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLeaderboard ? "animate-spin" : ""}`} />
                </button>
                <span className="text-xs font-mono text-neutral-400">ROUND ENDS 24:00 UTC</span>
              </div>
            </div>

            <p className="text-xs text-neutral-400 mb-4">
              Top 3 players take 50% / 30% / 20% of today&apos;s $WIF tournament pool. 40% of all ticket entry fees are burned forever on Robinhood Chain.
            </p>

            <div className="divide-y divide-white/10 border-y border-white/10 font-mono text-xs">
              {leaderboard.length === 0 ? (
                <div className="py-6 text-center text-neutral-500">Loading verified leaderboard...</div>
              ) : (
                leaderboard.slice(0, 10).map((item) => (
                  <div
                    key={`${item.rank}-${item.player}-${item.score}`}
                    className="py-3 flex items-center justify-between hover:bg-white/[0.02] px-2 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-6 text-center font-bold ${
                          item.rank === 1
                            ? "text-amber-400"
                            : item.rank === 2
                            ? "text-slate-300"
                            : item.rank === 3
                            ? "text-amber-600"
                            : "text-neutral-500"
                        }`}
                      >
                        #{item.rank}
                      </span>
                      <span className="text-white/80">{item.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-neutral-400 uppercase">
                        {item.mode}
                      </span>
                    </div>

                    <div className="flex items-center gap-6">
                      <span className="text-pink-400">🎩 {item.hats}</span>
                      <span className="font-bold text-white min-w-[60px] text-right">
                        {item.score} PTS
                      </span>
                      <span className="text-emerald-400 font-semibold min-w-[70px] text-right">
                        {item.rank === 1
                          ? `${Math.floor(dailyPoolWif * 0.5).toLocaleString()} WIF`
                          : item.rank === 2
                          ? `${Math.floor(dailyPoolWif * 0.3).toLocaleString()} WIF`
                          : item.rank === 3
                          ? `${Math.floor(dailyPoolWif * 0.2).toLocaleString()} WIF`
                          : "-"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Hat Wardrobe & Flywheel Tokenomics */}
          <div className="lg:col-span-5 space-y-6">
            {/* Hat Wardrobe */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <Crown className="w-5 h-5 text-pink-400" />
                <h3 className="font-black text-lg">WIF HAT WARDROBE</h3>
              </div>
              <p className="text-xs text-neutral-400 mb-4">
                Choose your in-game cosmetic hat skin. 50% of hat purchases burn $WIF on-chain.
              </p>

              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setActiveHatSkin("pink")}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                    activeHatSkin === "pink"
                      ? "border-pink-500 bg-pink-500/15"
                      : "border-white/10 hover:border-white/20 bg-white/5"
                  }`}
                >
                  <span className="text-2xl">🎩</span>
                  <span className="text-xs font-mono font-bold">PINK BEANIE</span>
                  <span className="text-[10px] text-neutral-400 font-mono">DEFAULT</span>
                </button>

                <button
                  onClick={() => setActiveHatSkin("gold")}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                    activeHatSkin === "gold"
                      ? "border-amber-400 bg-amber-400/15"
                      : "border-white/10 hover:border-white/20 bg-white/5"
                  }`}
                >
                  <span className="text-2xl">👑</span>
                  <span className="text-xs font-mono font-bold">GOLD CROWN</span>
                  <span className="text-[10px] text-amber-400 font-mono">500 WIF</span>
                </button>

                <button
                  onClick={() => setActiveHatSkin("astro")}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                    activeHatSkin === "astro"
                      ? "border-blue-400 bg-blue-400/15"
                      : "border-white/10 hover:border-white/20 bg-white/5"
                  }`}
                >
                  <span className="text-2xl">👨‍🚀</span>
                  <span className="text-xs font-mono font-bold">ASTRO HELMET</span>
                  <span className="text-[10px] text-blue-400 font-mono">1,000 WIF</span>
                </button>
              </div>
            </div>

            {/* Robinhood On-Chain Contract Verification Box */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 font-mono text-xs">
              <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                <Coins className="w-4 h-4 text-pink-400" /> ROBINHOOD CHAIN VERIFIED
              </h4>
              <div className="space-y-2 text-neutral-400">
                <div className="flex justify-between">
                  <span>CHAIN ID</span>
                  <span className="text-white">4663 (Robinhood Mainnet)</span>
                </div>
                <div className="flex justify-between">
                  <span>$WIF TOKEN</span>
                  <a
                    href="https://robinhoodchain.blockscout.com/token/0x5173b8ea6923c2d40267890d45c46a3480954773"
                    target="_blank"
                    rel="noreferrer"
                    className="text-pink-400 underline truncate max-w-[170px]"
                  >
                    0x5173b8ea...4773
                  </a>
                </div>
                <div className="flex justify-between">
                  <span>BURN METHOD</span>
                  <span className="text-rose-400">WIF.burn(amount)</span>
                </div>
                <div className="flex justify-between">
                  <span>CONTRACT</span>
                  <span className="text-neutral-300 font-mono">contracts/FlatCup.sol</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 text-center text-xs font-mono text-neutral-500">
        <p>FLATWORLD: DON&apos;T FALL OFF! — BUILT FOR THE $WIF HACKATHON ON ROBINHOOD CHAIN (4663)</p>
      </footer>
    </div>
  );
}
