/**
 * useDoraDash — Game loop hook for the Dora Dash mini-game.
 *
 * All mutable game state lives in refs to avoid React re-renders during gameplay.
 * Physics are deltaTime-based for frame-rate independence.
 * Obstacles use an object pool to avoid GC pressure.
 */

import { useRef, useCallback, useState, useEffect } from 'react';

// ── Constants ───────────────────────────────────────────────────
const CANVAS_W = 360;
const CANVAS_H = 480;

const PLAYER_W = 36;
const PLAYER_H = 36;
const PLAYER_SPEED = 320; // px/s
// Y bounds: player can move in the bottom 55% of the canvas
const PLAYER_Y_MIN = Math.floor(CANVAS_H * 0.45);
const PLAYER_Y_MAX = CANVAS_H - PLAYER_H - 10;
const PLAYER_Y_START = CANVAS_H - 60;

const BUG_W = 32;
const BUG_H = 32;
const BASE_FALL_SPEED = 170; // px/s (harder start)
const INITIAL_SPAWN_INTERVAL = 950; // ms (more frequent spawns)
const MIN_SPAWN_INTERVAL = 220; // ms
const SPAWN_INTERVAL_DECAY = 40; // ms — faster ramp
const SPEED_INCREMENT = 0.12; // multiplier bump every 2s (faster ramp)
const DIFFICULTY_TICK = 2000; // ms between difficulty bumps

const HITBOX_SHRINK = 0.18; // tighter hitboxes = harder
const POOL_SIZE = 50;
const SURVIVAL_BONUS_INTERVAL = 10_000; // +10 pts every 10 seconds
const DODGED_SCORE = 1;
const SURVIVAL_BONUS_SCORE = 10;

// Bug visual types
const BUG_TYPES = ['bug', '500', 'ERR', '💥', '00', '404'] as const;

// Movement patterns
type MovePattern = 'straight' | 'wave' | 'cross' | 'oval';
const PATTERNS: MovePattern[] = ['straight', 'straight', 'wave', 'cross', 'oval'];

export type GameState = 'idle' | 'playing' | 'gameOver';

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  type: string;
  active: boolean;
  // Movement pattern
  pattern: MovePattern;
  originX: number;    // X at spawn (wave/oval reference)
  waveAmp: number;    // wave/oval horizontal amplitude
  waveFreq: number;   // wave cycles per canvas height
  dx: number;         // cross: constant horizontal velocity
  age: number;        // time alive in seconds (for wave phase)
}

interface Keys {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface DoraDashAPI {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  gameState: GameState;
  score: number;
  elapsed: number;
  speedMultiplier: number;
  start: () => void;
  restart: () => void;
}

// ── Offscreen player sprite renderer ────────────────────────────
function createPlayerSprite(): OffscreenCanvas | HTMLCanvasElement {
  const size = 64;
  let oc: OffscreenCanvas | HTMLCanvasElement;
  try {
    oc = new OffscreenCanvas(size, size);
  } catch {
    oc = document.createElement('canvas');
    oc.width = size;
    oc.height = size;
  }
  const ctx = oc.getContext('2d')!;

  // Paper-plane body
  ctx.save();
  ctx.translate(size / 2, size / 2);

  // Fuselage
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(18, 16);
  ctx.lineTo(0, 8);
  ctx.lineTo(-18, 16);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, -26, 0, 16);
  grad.addColorStop(0, '#60a5fa');
  grad.addColorStop(1, '#3b82f6');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Center stripe
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(0, 10);
  ctx.strokeStyle = '#93c5fd';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Wings
  ctx.beginPath();
  ctx.moveTo(-4, 2);
  ctx.lineTo(-26, 12);
  ctx.lineTo(-12, 6);
  ctx.closePath();
  ctx.fillStyle = '#2563eb';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(4, 2);
  ctx.lineTo(26, 12);
  ctx.lineTo(12, 6);
  ctx.closePath();
  ctx.fillStyle = '#2563eb';
  ctx.fill();

  // Goggle / cockpit
  ctx.beginPath();
  ctx.ellipse(0, -8, 5, 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fbbf24';
  ctx.fill();
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Engine glow
  ctx.beginPath();
  ctx.ellipse(0, 14, 4, 3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(251,191,36,0.6)';
  ctx.fill();

  ctx.restore();
  return oc;
}

// Pattern color palette
const PATTERN_COLORS: Record<string, [string, string, string]> = {
  straight: ['#ef4444', '#b91c1c', '#991b1b'],  // red
  wave:     ['#8b5cf6', '#6d28d9', '#4c1d95'],  // purple (wave)
  oval:     ['#f59e0b', '#d97706', '#b45309'],  // amber (oval)
  cross:    ['#06b6d4', '#0891b2', '#0e7490'],  // cyan (cross)
};

// ── Bug sprite renderer ─────────────────────────────────────────
function drawBug(ctx: CanvasRenderingContext2D, ob: Obstacle) {
  const cx = ob.x + ob.w / 2;
  const cy = ob.y + ob.h / 2;

  const [c0, c1, stroke] = PATTERN_COLORS[ob.pattern] ?? PATTERN_COLORS.straight;

  // Draw motion trail for wave/oval
  if (ob.pattern === 'wave' || ob.pattern === 'oval') {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = c0;
    ctx.beginPath();
    ctx.ellipse(cx, cy + ob.h * 0.5, ob.w * 0.4, ob.h * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw motion arrow for cross
  if (ob.pattern === 'cross') {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = c0;
    ctx.lineWidth = 2;
    const dir = ob.dx > 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(cx - dir * ob.w * 0.7, cy);
    ctx.lineTo(cx + dir * ob.w * 0.7, cy);
    ctx.stroke();
    ctx.restore();
  }

  // Body
  ctx.beginPath();
  const rr = 4;
  ctx.moveTo(ob.x + rr, ob.y);
  ctx.arcTo(ob.x + ob.w, ob.y, ob.x + ob.w, ob.y + ob.h, rr);
  ctx.arcTo(ob.x + ob.w, ob.y + ob.h, ob.x, ob.y + ob.h, rr);
  ctx.arcTo(ob.x, ob.y + ob.h, ob.x, ob.y, rr);
  ctx.arcTo(ob.x, ob.y, ob.x + ob.w, ob.y, rr);
  ctx.closePath();

  const bgGrad = ctx.createLinearGradient(ob.x, ob.y, ob.x, ob.y + ob.h);
  bgGrad.addColorStop(0, c0);
  bgGrad.addColorStop(1, c1);
  ctx.fillStyle = bgGrad;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Label
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ob.type, cx, cy);

  // Antennae for bug type
  if (ob.type === 'bug') {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 4, ob.y);
    ctx.lineTo(cx - 8, ob.y - 6);
    ctx.moveTo(cx + 4, ob.y);
    ctx.lineTo(cx + 8, ob.y - 6);
    ctx.stroke();
  }
}

// ── Hook ────────────────────────────────────────────────────────
export function useDoraDash(): DoraDashAPI {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [displayScore, setDisplayScore] = useState(0);
  const [displayElapsed, setDisplayElapsed] = useState(0);
  const [displaySpeed, setDisplaySpeed] = useState(1);

  // Mutable refs for game state (avoid re-renders during gameplay)
  const playerRef = useRef({ x: CANVAS_W / 2 - PLAYER_W / 2, y: PLAYER_Y_START });
  const obstaclesRef = useRef<Obstacle[]>([]);
  const keysRef = useRef<Keys>({ left: false, right: false, up: false, down: false });
  const scoreRef = useRef(0);
  const elapsedRef = useRef(0);
  const speedMultiplierRef = useRef(1);
  const spawnIntervalRef = useRef(INITIAL_SPAWN_INTERVAL);
  const spawnAccRef = useRef(0);
  const difficultyAccRef = useRef(0);
  const lastSurvivalBonusRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef(0);
  const spriteRef = useRef<OffscreenCanvas | HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>('idle');
  const displayTickRef = useRef(0);

  // Sync stateRef with React state for use inside the loop
  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  // Pre-allocate obstacle pool
  const initPool = useCallback(() => {
    const pool: Obstacle[] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      pool.push({
        x: 0, y: 0, w: BUG_W, h: BUG_H, speed: 0, type: 'bug', active: false,
        pattern: 'straight', originX: 0, waveAmp: 0, waveFreq: 0, dx: 0, age: 0,
      });
    }
    obstaclesRef.current = pool;
  }, []);

  const getInactiveObstacle = useCallback((): Obstacle | null => {
    for (const ob of obstaclesRef.current) {
      if (!ob.active) return ob;
    }
    return null;
  }, []);

  const spawnObstacle = useCallback(() => {
    const ob = getInactiveObstacle();
    if (!ob) return;

    const pattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
    const spd = BASE_FALL_SPEED * speedMultiplierRef.current * (0.85 + Math.random() * 0.5);

    ob.active = true;
    ob.w = BUG_W;
    ob.h = BUG_H;
    ob.y = -BUG_H;
    ob.speed = spd;
    ob.type = BUG_TYPES[Math.floor(Math.random() * BUG_TYPES.length)];
    ob.pattern = pattern;
    ob.age = 0;

    if (pattern === 'cross') {
      // Starts from left or right edge, moves horizontally across + falls slowly
      const fromLeft = Math.random() < 0.5;
      ob.x = fromLeft ? -BUG_W : CANVAS_W;
      ob.y = Math.random() * (CANVAS_H * 0.6) + 40; // random Y in upper 60%
      ob.dx = fromLeft ? spd * 0.9 : -spd * 0.9;
      ob.speed = spd * 0.25; // slower fall for cross
      ob.originX = ob.x;
      ob.waveAmp = 0;
      ob.waveFreq = 0;
    } else if (pattern === 'wave') {
      // Falls straight down but oscillates left/right (sine wave)
      ob.x = Math.random() * (CANVAS_W - BUG_W);
      ob.originX = ob.x;
      ob.waveAmp = 60 + Math.random() * 60; // 60–120px amplitude
      ob.waveFreq = 1.5 + Math.random() * 2; // cycles per second
      ob.dx = 0;
    } else if (pattern === 'oval') {
      // Elliptical — sine on X, cosine drift on Y (teardrop-like path)
      ob.x = CANVAS_W / 2 - BUG_W / 2;
      ob.originX = ob.x;
      ob.waveAmp = 80 + Math.random() * 80;
      ob.waveFreq = 1 + Math.random() * 1.5;
      ob.dx = 0;
    } else {
      // Straight down
      ob.x = Math.random() * (CANVAS_W - BUG_W);
      ob.originX = ob.x;
      ob.waveAmp = 0;
      ob.waveFreq = 0;
      ob.dx = 0;
    }
  }, [getInactiveObstacle]);

  const checkCollision = useCallback((px: number, py: number, ob: Obstacle): boolean => {
    const shrinkX = ob.w * HITBOX_SHRINK;
    const shrinkY = ob.h * HITBOX_SHRINK;
    const shrinkPX = PLAYER_W * HITBOX_SHRINK;
    const shrinkPY = PLAYER_H * HITBOX_SHRINK;

    return (
      px + shrinkPX < ob.x + ob.w - shrinkX &&
      px + PLAYER_W - shrinkPX > ob.x + shrinkX &&
      py + shrinkPY < ob.y + ob.h - shrinkY &&
      py + PLAYER_H - shrinkPY > ob.y + shrinkY
    );
  }, []);

  // ── Main game loop ──────────────────────────────────────────
  const gameLoop = useCallback((timestamp: number) => {
    if (stateRef.current !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dt = Math.min((timestamp - lastFrameRef.current) / 1000, 0.05); // cap at 50ms
    lastFrameRef.current = timestamp;

    const elapsedMs = elapsedRef.current + dt * 1000;
    elapsedRef.current = elapsedMs;

    // ── Difficulty ramp ──
    difficultyAccRef.current += dt * 1000;
    if (difficultyAccRef.current >= DIFFICULTY_TICK) {
      difficultyAccRef.current -= DIFFICULTY_TICK;
      speedMultiplierRef.current += SPEED_INCREMENT;
      spawnIntervalRef.current = Math.max(
        MIN_SPAWN_INTERVAL,
        spawnIntervalRef.current - SPAWN_INTERVAL_DECAY,
      );
    }

    // ── Survival bonus ──
    const bonusTick = Math.floor(elapsedMs / SURVIVAL_BONUS_INTERVAL);
    if (bonusTick > lastSurvivalBonusRef.current) {
      scoreRef.current += SURVIVAL_BONUS_SCORE * (bonusTick - lastSurvivalBonusRef.current);
      lastSurvivalBonusRef.current = bonusTick;
    }

    // ── Spawn ──
    spawnAccRef.current += dt * 1000;
    if (spawnAccRef.current >= spawnIntervalRef.current) {
      spawnAccRef.current -= spawnIntervalRef.current;
      spawnObstacle();
    }

    // ── Player movement ──
    const keys = keysRef.current;
    if (keys.left) {
      playerRef.current.x = Math.max(0, playerRef.current.x - PLAYER_SPEED * dt);
    }
    if (keys.right) {
      playerRef.current.x = Math.min(
        CANVAS_W - PLAYER_W,
        playerRef.current.x + PLAYER_SPEED * dt,
      );
    }
    if (keys.up) {
      playerRef.current.y = Math.max(PLAYER_Y_MIN, playerRef.current.y - PLAYER_SPEED * dt);
    }
    if (keys.down) {
      playerRef.current.y = Math.min(PLAYER_Y_MAX, playerRef.current.y + PLAYER_SPEED * dt);
    }

    // ── Update obstacles ──
    const px = playerRef.current.x;
    const py = playerRef.current.y;

    for (const ob of obstaclesRef.current) {
      if (!ob.active) continue;
      ob.age += dt;
      ob.y += ob.speed * dt;

      // Apply pattern movement
      if (ob.pattern === 'wave') {
        ob.x = ob.originX + Math.sin(ob.age * ob.waveFreq * Math.PI * 2) * ob.waveAmp;
        ob.x = Math.max(0, Math.min(CANVAS_W - ob.w, ob.x));
      } else if (ob.pattern === 'oval') {
        // Oval: X follows full sine cycle, Y has a cosine nudge
        ob.x = ob.originX + Math.sin(ob.age * ob.waveFreq * Math.PI * 2) * ob.waveAmp;
        ob.x = Math.max(0, Math.min(CANVAS_W - ob.w, ob.x));
      } else if (ob.pattern === 'cross') {
        ob.x += ob.dx * dt;
      }

      // Off screen — dodged (cross goes sideways, others fall off bottom)
      const offBottom = ob.y > CANVAS_H;
      const offSides = ob.pattern === 'cross' && (ob.x > CANVAS_W + ob.w || ob.x < -ob.w * 2);
      if (offBottom || offSides) {
        ob.active = false;
        scoreRef.current += DODGED_SCORE;
        continue;
      }

      // Collision
      if (checkCollision(px, py, ob)) {
        stateRef.current = 'gameOver';
        setGameState('gameOver');
        setDisplayScore(scoreRef.current);
        setDisplayElapsed(elapsedRef.current);
        setDisplaySpeed(speedMultiplierRef.current);
        cancelAnimationFrame(rafRef.current);
        drawGameOver(ctx);
        return;
      }
    }

    // ── Draw ──
    draw(ctx, timestamp);

    // Update React display state periodically (every ~200ms) for HUD outside canvas
    displayTickRef.current += dt * 1000;
    if (displayTickRef.current > 200) {
      displayTickRef.current = 0;
      setDisplayScore(scoreRef.current);
      setDisplayElapsed(elapsedRef.current);
      setDisplaySpeed(speedMultiplierRef.current);
    }

    rafRef.current = requestAnimationFrame(gameLoop);
  }, [spawnObstacle, checkCollision]);

  // ── Render helpers ────────────────────────────────────────────
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, _timestamp: number) => {
      // Background gradient that shifts with difficulty
      const intensity = Math.min(speedMultiplierRef.current / 5, 1);
      const r = Math.floor(15 + intensity * 30);
      const g = Math.floor(23 - intensity * 10);
      const b = Math.floor(42 - intensity * 15);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Subtle grid
      ctx.strokeStyle = `rgba(100,140,255,${0.04 + intensity * 0.02})`;
      ctx.lineWidth = 0.5;
      for (let gx = 0; gx < CANVAS_W; gx += 30) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, CANVAS_H);
        ctx.stroke();
      }
      for (let gy = 0; gy < CANVAS_H; gy += 30) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(CANVAS_W, gy);
        ctx.stroke();
      }

      // Edge vignette that tints red with difficulty
      const vigGrad = ctx.createRadialGradient(
        CANVAS_W / 2,
        CANVAS_H / 2,
        CANVAS_W * 0.35,
        CANVAS_W / 2,
        CANVAS_H / 2,
        CANVAS_W * 0.75,
      );
      vigGrad.addColorStop(0, 'transparent');
      vigGrad.addColorStop(1, `rgba(${Math.floor(200 * intensity)},30,30,${0.15 + intensity * 0.2})`);
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Obstacles
      for (const ob of obstaclesRef.current) {
        if (!ob.active) continue;
        drawBug(ctx, ob);
      }

      // Player
      const sprite = spriteRef.current;
      if (sprite) {
        ctx.drawImage(
          sprite as any,
          playerRef.current.x - (64 - PLAYER_W) / 2,
          playerRef.current.y - (64 - PLAYER_H) / 2,
          64,
          64,
        );
      }

      // In-canvas HUD
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, CANVAS_W, 32);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 12px "DM Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Score: ${scoreRef.current}`, 10, 17);

      ctx.textAlign = 'center';
      ctx.fillText(`${(elapsedRef.current / 1000).toFixed(1)}s`, CANVAS_W / 2, 17);

      ctx.textAlign = 'right';
      ctx.fillStyle = intensity > 0.6 ? '#fca5a5' : '#93c5fd';
      ctx.fillText(`${speedMultiplierRef.current.toFixed(1)}×`, CANVAS_W - 10, 17);
    },
    [],
  );

  const drawGameOver = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 28px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 30);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '16px "DM Sans", sans-serif';
    ctx.fillText(`Score: ${scoreRef.current}`, CANVAS_W / 2, CANVAS_H / 2 + 10);
    ctx.fillText(
      `Survived: ${(elapsedRef.current / 1000).toFixed(1)}s`,
      CANVAS_W / 2,
      CANVAS_H / 2 + 36,
    );
    ctx.fillText(
      `Max Speed: ${speedMultiplierRef.current.toFixed(1)}×`,
      CANVAS_W / 2,
      CANVAS_H / 2 + 60,
    );
  }, []);

  // ── Input handlers ────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A':
          keysRef.current.left = true; e.preventDefault(); break;
        case 'ArrowRight': case 'd': case 'D':
          keysRef.current.right = true; e.preventDefault(); break;
        case 'ArrowUp': case 'w': case 'W':
          keysRef.current.up = true; e.preventDefault(); break;
        case 'ArrowDown': case 's': case 'S':
          keysRef.current.down = true; e.preventDefault(); break;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A':
          keysRef.current.left = false; break;
        case 'ArrowRight': case 'd': case 'D':
          keysRef.current.right = false; break;
        case 'ArrowUp': case 'w': case 'W':
          keysRef.current.up = false; break;
        case 'ArrowDown': case 's': case 'S':
          keysRef.current.down = false; break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ── Touch input for mobile ────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let touchStartX = 0;
    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        e.preventDefault();
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (stateRef.current !== 'playing' || e.touches.length === 0) return;
      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;
      keysRef.current.left = dx < -10;
      keysRef.current.right = dx > 10;
      keysRef.current.up = dy < -10;
      keysRef.current.down = dy > 10;
      e.preventDefault();
    };
    const handleTouchEnd = () => {
      keysRef.current.left = false;
      keysRef.current.right = false;
      keysRef.current.up = false;
      keysRef.current.down = false;
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);
    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [gameState]);

  // Cleanup raf on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Start / restart ───────────────────────────────────────────
  const resetState = useCallback(() => {
    playerRef.current = { x: CANVAS_W / 2 - PLAYER_W / 2, y: PLAYER_Y_START };
    scoreRef.current = 0;
    elapsedRef.current = 0;
    speedMultiplierRef.current = 1;
    spawnIntervalRef.current = INITIAL_SPAWN_INTERVAL;
    spawnAccRef.current = 0;
    difficultyAccRef.current = 0;
    lastSurvivalBonusRef.current = 0;
    displayTickRef.current = 0;
    keysRef.current = { left: false, right: false, up: false, down: false };
    initPool();

    if (!spriteRef.current) {
      spriteRef.current = createPlayerSprite();
    }
  }, [initPool]);

  const start = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    resetState();
    setDisplayScore(0);
    setDisplayElapsed(0);
    setDisplaySpeed(1);
    setGameState('playing');
    stateRef.current = 'playing';
    lastFrameRef.current = performance.now();
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [resetState, gameLoop]);

  const restart = useCallback(() => {
    start();
  }, [start]);

  return {
    canvasRef,
    gameState,
    score: displayScore,
    elapsed: displayElapsed,
    speedMultiplier: displaySpeed,
    start,
    restart,
  };
}
