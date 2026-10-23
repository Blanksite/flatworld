# 🎩 FlatWorld: Don't Fall Off!

> **Built for the [$WIF Hackathon](https://worldisflat.fun/build/rules) on Robinhood Chain (Chain ID: 4663)**  
> *Deflationary on-chain survival arena putting $WIF to work with real token burns.*

---

## 🚀 Overview

**FlatWorld** is an addictive, fast-paced 60 FPS flat-earth physics arcade game built natively for **Robinhood Chain (Chain ID: 4663)** and the **$WIF token ecosystem**.

The earth is flat, floating in cosmic deep space, and constantly tilting into the cosmic void! Players control the iconic **WIF mascot**, balancing against gravitational shifts, dodging falling meteorites, collecting scattered beanies, and competing in the daily tournament cup.

---

## 🪙 $WIF Token Flywheel & Deflationary Mechanics

Unlike passive staking or simple trading bots, **FlatWorld turns gaming adrenaline into continuous $WIF burns**:

1. **Daily Cup Entry Fee (100 $WIF per run):**
   - 🔥 **40% (40 $WIF)** is burned permanently via the `$WIF` contract's native `burn(uint256)` method (selector `0x42966c68`) on Robinhood Chain (with fallback to `0x000...dEaD`).
   - 🏆 **55% (55 $WIF)** is pooled into today's tournament jackpot, paid to the top 3 survivors daily (50% / 30% / 20%).
   - ⚡ **5% (5 $WIF)** covers automated gas relayer fees.
2. **Cosmetic Hat Wardrobe:**
   - Players unlock on-chain cosmetic skins (e.g., *Gold Doge Crown*, *Cosmic Astro Helmet*).
   - 🔥 **50% of all hat purchases are burned forever.**
   - 🏆 **50% feeds directly into the tournament jackpot.**
3. **Frictionless Free Play Mode:**
   - 100% free unlimited practice mode with zero wallet popups or friction, allowing anyone to play instantly and get hooked before entering the Daily Cup.

---

## 🛡️ Deterministic Anti-Cheat Simulation & EIP-712 Attestation

Web3 browser games usually suffer from either easy client-side score forgery or expensive on-chain gas costs for every action. FlatWorld solves both with a **hybrid deterministic simulation**:

1. **Bit-Identical Simulation Engine (`src/lib/engine.ts`):**
   - Runs at a fixed 60 ticks/second.
   - Built with pure IEEE-754 arithmetic (`+`, `-`, `*`, `/`, `Math.sqrt`) and a 32-bit integer PRNG (`mulberry32`).
   - Rejection sampling with pre-computed trigonometric constants ensures identical behavior across all JS engines (V8, JavaScriptCore, SpiderMonkey).
2. **Deterministic Replay Verification (`/api/score`):**
   - When a run finishes, the client sends only the initial seed and timestamped input tick array (`{ tick, dx, dy }`).
   - The server replays the entire run headlessly in milliseconds. If the replayed score doesn't match the client's claim, anti-cheat triggers immediately.
3. **EIP-712 Cryptographic Attestation:**
   - Verified scores are signed by the tournament verifier using EIP-712 typed structured data (`ScoreAttestation`) bound to Robinhood Chain (`4663`).
   - Prevents score spoofing, replay attacks, and unauthorized contract payouts.

---

## ⛓️ Robinhood Chain Deployment & Parameters

| Parameter | Specification |
|---|---|
| **Network Name** | Robinhood Chain |
| **Chain ID** | `4663` (`0x1237`) |
| **RPC Endpoint** | `https://rpc.mainnet.chain.robinhood.com` |
| **Block Explorer** | [https://robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com) |
| **$WIF Token Contract** | [`0x5173b8ea6923c2d40267890d45c46a3480954773`](https://robinhoodchain.blockscout.com/token/0x5173b8ea6923c2d40267890d45c46a3480954773) |
| **$WIF Decimals** | 18 |
| **$WIF Burn Selector** | `0x42966c68` (`burn(uint256)`) |
| **Tournament Contract** | [`contracts/FlatCup.sol`](./contracts/FlatCup.sol) |

---

## 🛠️ Tech Stack & Architecture

- **Frontend & App Framework:** Next.js 15 (App Router), React 19, TypeScript
- **Styling & UI:** Tailwind CSS v4, Lucide Icons, Canvas Confetti
- **Rendering & Physics:** Custom HTML5 Canvas renderer with 60 FPS interpolated loop, dynamic isometric tilt projection, and procedural nebula stars
- **Audio:** Web Audio API procedural chiptune sound synthesizer (`src/lib/audio.ts`) — zero external MP3 assets, zero latency, 100% in-browser audio
- **Web3 Integration:** `viem` with EIP-1193 provider and EIP-712 signing
- **Smart Contracts:** Solidity `^0.8.20` tournament escrow and deflationary burner

---

## 🕹️ Controls

- **Desktop:** `WASD` or `Arrow Keys` to move and counter disc tilting.
- **Mobile:** Touch virtual directional pad buttons.
- **Objective:** Stay on the flat disc as long as possible, dodge falling meteors, collect beanies (`+50 PTS`), power up with sticky grip and protective cosmic shields.

---

## 📦 Getting Started Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Blanksite/flatworld.git
   cd flatworld
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run unit tests:**
   ```bash
   node test/engine.test.mjs
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

5. **Build for production:**
   ```bash
   npm run build
   ```

---

## 📜 License

MIT License. Built with ❤️ for the $WIF Community and the World is Flat Hackathon on Robinhood Chain.
