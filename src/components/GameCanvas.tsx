"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  createGame,
  step,
  scoreOf,
  stageOf,
  GameState,
  InputEvent,
  TICK_RATE,
} from "@/lib/engine";
import { soundFX } from "@/lib/audio";
import confetti from "canvas-confetti";
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Trophy,
  Zap,
} from "lucide-react";

interface GameCanvasProps {
  onGameOver?: (finalScore: number, hats: number, ticks: number, inputs: InputEvent[], seed: number) => void;
  activeHatSkin?: "pink" | "gold" | "astro" | "fedora";
  mode?: "free" | "daily";
}

export default function GameCanvas({
  onGameOver,
  activeHatSkin = "pink",
  mode = "free",
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentScore, setCurrentScore] = useState<number>(0);
  const [currentHats, setCurrentHats] = useState<number>(0);
  const [currentStage, setCurrentStage] = useState<number>(0);
  const [gameOverState, setGameOverState] = useState<{
    score: number;
    hats: number;
    cause: string;
  } | null>(null);

  // Engine refs
  const stateRef = useRef<GameState | null>(null);
  const inputsRef = useRef<InputEvent[]>([]);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const lastInputRef = useRef<{ dx: -1 | 0 | 1; dy: -1 | 0 | 1 }>({ dx: 0, dy: 0 });
  const animFrameRef = useRef<number | null>(null);
  const seedRef = useRef<number>(Date.now());
  const lastStageRef = useRef<number>(0);

  const startNewGame = useCallback(() => {
    const seed = Math.floor(Math.random() * 10000000);
    seedRef.current = seed;
    stateRef.current = createGame(seed);
    inputsRef.current = [{ tick: 0, dx: 0, dy: 0 }];
    lastInputRef.current = { dx: 0, dy: 0 };
    lastStageRef.current = 0;
    setGameOverState(null);
    setIsPlaying(true);
    setCurrentScore(0);
    setCurrentHats(0);
    setCurrentStage(0);
  }, []);

  // Keyboard handlers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", " "].includes(
          e.key.toLowerCase()
        )
      ) {
        // Prevent scrolling with arrows/space
        if (["ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
        keysRef.current[e.key.toLowerCase()] = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const renderCanvasRef = useRef<() => void>(() => {});

  // Main game loop (Fixed simulation tick + smooth interpolation render)
  useEffect(() => {
    let lastTime = performance.now();
    let accumulator = 0;
    const timeStep = 1000 / TICK_RATE;

    const loop = (now: number) => {
      const delta = Math.min(now - lastTime, 100);
      lastTime = now;

      if (isPlaying && stateRef.current && stateRef.current.alive) {
        accumulator += delta;

        while (accumulator >= timeStep) {
          const s = stateRef.current;
          if (!s || !s.alive) break;

          // Compute input from keyboard
          let dx: -1 | 0 | 1 = 0;
          let dy: -1 | 0 | 1 = 0;
          const k = keysRef.current;

          if (k["arrowleft"] || k["a"]) dx = -1;
          if (k["arrowright"] || k["d"]) dx = 1;
          if (k["arrowup"] || k["w"]) dy = -1;
          if (k["arrowdown"] || k["s"]) dy = 1;

          if (dx !== lastInputRef.current.dx || dy !== lastInputRef.current.dy) {
            lastInputRef.current = { dx, dy };
            inputsRef.current.push({ tick: s.tick, dx, dy });
          }

          s.input = { dx, dy };
          const prevHats = s.hats;
          const prevShield = s.shield;
          const prevGrip = s.gripTicks;

          step(s);

          // Audio triggers
          if (s.hats > prevHats) soundFX.playHatPickup();
          if (s.shield && !prevShield) soundFX.playPowerup();
          if (s.gripTicks > 0 && prevGrip === 0) soundFX.playPowerup();

          const stage = stageOf(s.tick);
          if (stage > lastStageRef.current) {
            lastStageRef.current = stage;
            soundFX.playStageAlert();
          }

          if (!s.alive) {
            if (s.deathCause === "fell") soundFX.playFallOff();
            else soundFX.playImpact();

            const finalScore = scoreOf(s);
            setGameOverState({
              score: finalScore,
              hats: s.hats,
              cause: s.deathCause === "fell" ? "Fell off the Edge of the Flat Earth!" : "Hit by Cosmic Meteorite!",
            });
            setIsPlaying(false);

            if (finalScore > 200) {
              confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
            }

            if (onGameOver) {
              onGameOver(finalScore, s.hats, s.tick, inputsRef.current, seedRef.current);
            }
          }

          accumulator -= timeStep;
        }

        if (stateRef.current) {
          setCurrentScore(scoreOf(stateRef.current));
          setCurrentHats(stateRef.current.hats);
          setCurrentStage(stageOf(stateRef.current.tick));
        }
      }

      // Render frame
      renderCanvasRef.current();
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, onGameOver]);

  // Canvas drawing function
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = Math.min(width, height) * 0.42;

    ctx.clearRect(0, 0, width, height);

    // 1. Deep Space Cosmic Background
    const bgGrad = ctx.createRadialGradient(centerX, centerY, 50, centerX, centerY, width * 0.75);
    bgGrad.addColorStop(0, "#0E111E");
    bgGrad.addColorStop(0.6, "#07080F");
    bgGrad.addColorStop(1, "#020306");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Floating background nebula stars
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    for (let i = 0; i < 40; i++) {
      const sx = (Math.sin(i * 123.4 + performance.now() * 0.0002) * 0.5 + 0.5) * width;
      const sy = (Math.cos(i * 456.7 + performance.now() * 0.00015) * 0.5 + 0.5) * height;
      const size = (i % 3) + 1;
      ctx.fillRect(sx, sy, size, size);
    }

    const state = stateRef.current;
    const arenaRadius = (state ? state.radius : 1) * baseRadius;
    const tilt = state ? state.tilt : { x: 0, y: 0 };

    // 2. Flat Earth Disc (Isometric 3D Tilt Shadow)
    const tiltOffsetX = tilt.x * 24;
    const tiltOffsetY = tilt.y * 24;

    // Disc Under-Platform Shadow
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX + tiltOffsetX * 0.5, centerY + tiltOffsetY * 0.5 + 14, arenaRadius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fill();
    ctx.restore();

    // Disc Cosmic Waterfall Rim (Glowing Water Falling off the Flat Edge into Space)
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, arenaRadius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
    ctx.lineWidth = 8;
    ctx.stroke();

    // Disc Waterfall Droplets
    const nowSec = performance.now() * 0.003;
    ctx.strokeStyle = "rgba(147, 197, 253, 0.6)";
    ctx.lineWidth = 2;
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const dropRadius = arenaRadius + 4 + Math.sin(a * 4 + nowSec) * 6;
      const px = centerX + Math.cos(a) * dropRadius;
      const py = centerY + Math.sin(a) * dropRadius;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(a) * 4, py + Math.sin(a) * 4);
      ctx.stroke();
    }

    // Flat Earth Surface Texture (Verdant Continents on Blue Oceans)
    const discGrad = ctx.createRadialGradient(
      centerX - tiltOffsetX * 0.8,
      centerY - tiltOffsetY * 0.8,
      arenaRadius * 0.1,
      centerX,
      centerY,
      arenaRadius
    );
    discGrad.addColorStop(0, "#1E3A8A"); // Center deep ocean
    discGrad.addColorStop(0.5, "#0284C7"); // Mid sea
    discGrad.addColorStop(0.85, "#10B981"); // Rim coastlines
    discGrad.addColorStop(1, "#38BDF8"); // Ice wall waterfall edge

    ctx.beginPath();
    ctx.arc(centerX, centerY, arenaRadius, 0, Math.PI * 2);
    ctx.fillStyle = discGrad;
    ctx.fill();

    // Disc Compass/Grid Lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, arenaRadius * 0.6, 0, Math.PI * 2);
    ctx.arc(centerX, centerY, arenaRadius * 0.3, 0, Math.PI * 2);
    ctx.moveTo(centerX - arenaRadius, centerY);
    ctx.lineTo(centerX + arenaRadius, centerY);
    ctx.moveTo(centerX, centerY - arenaRadius);
    ctx.lineTo(centerX, centerY + arenaRadius);
    ctx.stroke();

    // 3. Render Pickups (Hats, Grips, Shields)
    if (state) {
      state.pickups.forEach((p) => {
        const px = centerX + p.pos.x * baseRadius;
        const py = centerY + p.pos.y * baseRadius;

        ctx.save();
        ctx.translate(px, py);
        const bob = Math.sin(performance.now() * 0.006 + p.id) * 3;
        ctx.translate(0, bob);

        if (p.kind === "hat") {
          // Glow halo
          ctx.beginPath();
          ctx.arc(0, 0, 16, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(244, 114, 182, 0.3)";
          ctx.fill();

          // Pink WIF Beanie Icon
          ctx.fillStyle = "#EC4899"; // Pink WIF hat
          ctx.beginPath();
          ctx.arc(0, -2, 10, Math.PI, 0);
          ctx.lineTo(12, 3);
          ctx.lineTo(-12, 3);
          ctx.closePath();
          ctx.fill();
          // Hat fold
          ctx.fillStyle = "#F472B6";
          ctx.fillRect(-12, 1, 24, 4);
          // Pom pom
          ctx.beginPath();
          ctx.arc(0, -12, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = "#FFFFFF";
          ctx.fill();
        } else if (p.kind === "grip") {
          // Golden Boots Grip
          ctx.beginPath();
          ctx.arc(0, 0, 15, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(234, 179, 8, 0.35)";
          ctx.fill();

          ctx.fillStyle = "#FACC15";
          ctx.font = "bold 16px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("🧲", 0, 0);
        } else if (p.kind === "shield") {
          // Cosmic Shield
          ctx.beginPath();
          ctx.arc(0, 0, 15, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(59, 130, 246, 0.35)";
          ctx.fill();

          ctx.fillStyle = "#60A5FA";
          ctx.font = "bold 16px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("🛡️", 0, 0);
        }
        ctx.restore();
      });

      // 4. Render Meteors
      state.meteors.forEach((m) => {
        const mx = centerX + m.pos.x * baseRadius;
        const my = centerY + m.pos.y * baseRadius;
        const mr = m.r * baseRadius;

        if (m.warn > 0) {
          // Warning reticle on ground
          const warnProgress = 1 - m.warn / TICK_RATE;
          ctx.save();
          ctx.beginPath();
          ctx.arc(mx, my, mr * (1.8 - warnProgress * 0.8), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 + warnProgress * 0.6})`;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Pulsing warning red fill
          ctx.beginPath();
          ctx.arc(mx, my, mr * warnProgress, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(239, 68, 68, ${warnProgress * 0.3})`;
          ctx.fill();
          ctx.restore();
        } else {
          // Active falling rock
          ctx.save();
          ctx.beginPath();
          ctx.arc(mx, my, mr, 0, Math.PI * 2);
          ctx.fillStyle = "#DC2626";
          ctx.fill();

          // Glowing fire tail
          ctx.beginPath();
          ctx.arc(mx - m.vel.x * 12, my - m.vel.y * 12, mr * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = "#F97316";
          ctx.fill();
          ctx.restore();
        }
      });

      // 5. Render WIF Doge Mascot (Player)
      const px = centerX + state.player.x * baseRadius;
      const py = centerY + state.player.y * baseRadius;
      const pr = 0.045 * baseRadius;

      ctx.save();
      ctx.translate(px, py);

      // Shield Aura
      if (state.shield) {
        ctx.beginPath();
        ctx.arc(0, 0, pr * 1.55, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(59, 130, 246, 0.25)";
        ctx.fill();
        ctx.strokeStyle = "#38BDF8";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Golden Grip Shoes Glow
      if (state.gripTicks > 0) {
        ctx.beginPath();
        ctx.arc(0, pr * 0.9, pr * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(250, 204, 21, 0.35)";
        ctx.fill();
      }

      // Doge Body / Face (Tan Shibe)
      ctx.beginPath();
      ctx.arc(0, 0, pr, 0, Math.PI * 2);
      ctx.fillStyle = "#E0A96D"; // Shibe Tan
      ctx.fill();
      ctx.strokeStyle = "#B87A40";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Doge Muzzle
      ctx.beginPath();
      ctx.ellipse(0, pr * 0.2, pr * 0.55, pr * 0.45, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#FDF4E7";
      ctx.fill();

      // Doge Nose
      ctx.beginPath();
      ctx.arc(0, pr * 0.05, pr * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = "#1E293B";
      ctx.fill();

      // Doge Eyes (looking toward movement)
      const eyeOffsetX = state.input.dx * 2.5;
      const eyeOffsetY = state.input.dy * 2.5;

      ctx.fillStyle = "#0F172A";
      ctx.beginPath();
      ctx.arc(-pr * 0.4 + eyeOffsetX, -pr * 0.2 + eyeOffsetY, pr * 0.14, 0, Math.PI * 2);
      ctx.arc(pr * 0.4 + eyeOffsetX, -pr * 0.2 + eyeOffsetY, pr * 0.14, 0, Math.PI * 2);
      ctx.fill();

      // Doge Ears
      ctx.fillStyle = "#C98A4D";
      ctx.beginPath();
      ctx.moveTo(-pr * 0.85, -pr * 0.3);
      ctx.lineTo(-pr * 0.5, -pr * 0.95);
      ctx.lineTo(-pr * 0.2, -pr * 0.5);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(pr * 0.85, -pr * 0.3);
      ctx.lineTo(pr * 0.5, -pr * 0.95);
      ctx.lineTo(pr * 0.2, -pr * 0.5);
      ctx.fill();

      // THE SIGNATURE WIF HAT (CUSTOMIZABLE)
      if (activeHatSkin === "pink") {
        // Iconic Pink Knit Beanie
        ctx.fillStyle = "#EC4899";
        ctx.beginPath();
        ctx.arc(0, -pr * 0.45, pr * 0.75, Math.PI, 0);
        ctx.lineTo(pr * 0.85, -pr * 0.1);
        ctx.lineTo(-pr * 0.85, -pr * 0.1);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#F472B6";
        ctx.fillRect(-pr * 0.85, -pr * 0.2, pr * 1.7, pr * 0.25);
      } else if (activeHatSkin === "gold") {
        // Golden Crown
        ctx.fillStyle = "#EAB308";
        ctx.beginPath();
        ctx.moveTo(-pr * 0.7, -pr * 0.3);
        ctx.lineTo(-pr * 0.7, -pr * 0.9);
        ctx.lineTo(-pr * 0.35, -pr * 0.5);
        ctx.lineTo(0, -pr * 1.0);
        ctx.lineTo(pr * 0.35, -pr * 0.5);
        ctx.lineTo(pr * 0.7, -pr * 0.9);
        ctx.lineTo(pr * 0.7, -pr * 0.3);
        ctx.closePath();
        ctx.fill();
      } else if (activeHatSkin === "astro") {
        // Astro Bubble Helmet
        ctx.beginPath();
        ctx.arc(0, 0, pr * 1.25, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.7)";
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      ctx.restore();
    }
  };
  renderCanvasRef.current = renderCanvas;

  // Mobile virtual touch pad buttons
  const handleTouchDirection = (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => {
    keysRef.current["arrowleft"] = dx === -1;
    keysRef.current["arrowright"] = dx === 1;
    keysRef.current["arrowup"] = dy === -1;
    keysRef.current["arrowdown"] = dy === 1;
  };

  const handleTouchRelease = () => {
    keysRef.current["arrowleft"] = false;
    keysRef.current["arrowright"] = false;
    keysRef.current["arrowup"] = false;
    keysRef.current["arrowdown"] = false;
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto flex flex-col items-center select-none">
      {/* Top HUD Bar */}
      <div className="w-full flex items-center justify-between px-4 py-2 bg-neutral-900/90 border border-white/10 rounded-t-2xl backdrop-blur-md text-white font-mono text-sm">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-pink-400 font-bold">
            🎩 {currentHats} <span className="hidden sm:inline text-xs text-white/50">HATS</span>
          </span>
          <span className="text-emerald-400 font-bold flex items-center gap-1">
            <Trophy className="w-4 h-4" /> {currentScore}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
            STAGE 0{currentStage + 1}
          </span>
          <button
            onClick={() => {
              const nextMute = !isMuted;
              setIsMuted(nextMute);
              soundFX.setEnabled(!nextMute);
            }}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Game Canvas Container */}
      <div className="relative w-full aspect-square bg-black border-x border-b border-white/10 rounded-b-2xl overflow-hidden shadow-2xl flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={640}
          height={640}
          className="w-full h-full object-contain block"
        />

        {/* Start / Intro Overlay */}
        {!isPlaying && !gameOverState && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white">
            <div className="w-16 h-16 rounded-full bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-3xl mb-4 animate-bounce">
              🎩
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
              FLATWORLD
            </h2>
            <p className="text-xs sm:text-sm text-neutral-300 max-w-sm mb-6 leading-relaxed">
              The world is flat and tilting into the cosmic void! Use <kbd className="px-1.5 py-0.5 bg-white/20 rounded font-mono text-xs">WASD</kbd> or <kbd className="px-1.5 py-0.5 bg-white/20 rounded font-mono text-xs">Arrow Keys</kbd> to balance your WIF doge, collect hats, and don&apos;t fall off the edge!
            </p>

            <button
              onClick={startNewGame}
              className="px-8 py-3.5 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-bold rounded-xl shadow-lg shadow-pink-500/25 active:scale-95 transition-all flex items-center gap-2"
            >
              <Zap className="w-5 h-5 fill-current" />
              {mode === "daily" ? "ENTER DAILY CUP (100 $WIF)" : "PLAY FREE RUN"}
            </button>
          </div>
        )}

        {/* Game Over Screen */}
        {gameOverState && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-lg flex flex-col items-center justify-center p-6 text-center text-white animate-fade-in">
            <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-2xl mb-3">
              💥
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-red-400 mb-1">
              YOU FELL OFF!
            </h3>
            <p className="text-xs text-neutral-400 mb-5">{gameOverState.cause}</p>

            <div className="grid grid-cols-2 gap-4 w-full max-w-xs bg-neutral-900/90 border border-white/10 rounded-xl p-4 mb-6 text-center font-mono">
              <div>
                <span className="text-xs text-neutral-400 block">FINAL SCORE</span>
                <span className="text-2xl font-bold text-emerald-400">
                  {gameOverState.score}
                </span>
              </div>
              <div>
                <span className="text-xs text-neutral-400 block">HATS COLLECTED</span>
                <span className="text-2xl font-bold text-pink-400">
                  +{gameOverState.hats}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={startNewGame}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl border border-white/20 transition-all flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> PLAY AGAIN
              </button>
            </div>
          </div>
        )}
      </div>

      {/* On-Screen Touch Controls for Mobile */}
      <div className="sm:hidden grid grid-cols-3 gap-2 w-48 mt-4">
        <div />
        <button
          onTouchStart={() => handleTouchDirection(0, -1)}
          onTouchEnd={handleTouchRelease}
          className="h-12 bg-white/10 rounded-lg flex items-center justify-center active:bg-white/25 text-white font-bold"
        >
          ▲
        </button>
        <div />
        <button
          onTouchStart={() => handleTouchDirection(-1, 0)}
          onTouchEnd={handleTouchRelease}
          className="h-12 bg-white/10 rounded-lg flex items-center justify-center active:bg-white/25 text-white font-bold"
        >
          ◀
        </button>
        <button
          onTouchStart={() => handleTouchDirection(0, 1)}
          onTouchEnd={handleTouchRelease}
          className="h-12 bg-white/10 rounded-lg flex items-center justify-center active:bg-white/25 text-white font-bold"
        >
          ▼
        </button>
        <button
          onTouchStart={() => handleTouchDirection(1, 0)}
          onTouchEnd={handleTouchRelease}
          className="h-12 bg-white/10 rounded-lg flex items-center justify-center active:bg-white/25 text-white font-bold"
        >
          ▶
        </button>
      </div>
    </div>
  );
}
