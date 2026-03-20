import { useEffect, useRef } from 'react';

const matrixChars = [
  ...'MESSIGN'.split(''),
  ...'SMS'.split(''),
  ...'EMAIL'.split(''),
  ...'RCS'.split(''),
  ...'WHATSAPP'.split(''),
  ...'VOICE'.split(''),
  ...'API'.split(''),
  ...'WEBHOOK'.split(''),
  ...'CLOUD'.split(''),
  '0', '1', '0', '1', '0', '1',
  '<', '>', '/', '{', '}', '[', ']',
  '@', '#', '$', '%', '&', '*',
  'A', 'B', 'C', 'D', 'E', 'F',
  'ア', 'イ', 'ウ', 'エ', 'オ',
  'カ', 'キ', 'ク', 'ケ', 'コ',
];

const HEAD_REFRESH_MS = 200;
const TRAIL_REFRESH_MS = 320;
const BG = '18, 18, 18';

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fontSize = 14;
    let drops: number[] = [];
    let speeds: number[] = [];
    let brightness: number[] = [];
    let headChar: string[] = [];
    let lastHeadAt: number[] = [];
    let trailChar: string[][] = [];
    let lastTrailAt: number[] = [];

    const randomChar = () => matrixChars[Math.floor(Math.random() * matrixChars.length)];

    const syncColumnArrays = () => {
      const columns = Math.max(1, Math.floor(canvas.width / fontSize));
      const pickSpeed = () => 0.12 + Math.random() * 0.23;

      while (drops.length < columns) {
        drops.push(Math.random() * -100);
        speeds.push(pickSpeed());
        brightness.push(0.25 + Math.random() * 0.45);
        headChar.push(randomChar());
        lastHeadAt.push(0);
        trailChar.push(Array.from({ length: 20 }, randomChar));
        lastTrailAt.push(0);
      }
      if (drops.length > columns) {
        drops = drops.slice(0, columns);
        speeds = speeds.slice(0, columns);
        brightness = brightness.slice(0, columns);
        headChar = headChar.slice(0, columns);
        lastHeadAt = lastHeadAt.slice(0, columns);
        trailChar = trailChar.slice(0, columns);
        lastTrailAt = lastTrailAt.slice(0, columns);
      }
    };

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      syncColumnArrays();
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const draw = () => {
      const now = performance.now();

      ctx.fillStyle = `rgba(${BG}, 0.08)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${fontSize}px "JetBrains Mono", "Courier New", monospace`;

      for (let i = 0; i < drops.length; i++) {
        if (now - lastHeadAt[i] > HEAD_REFRESH_MS) {
          headChar[i] = randomChar();
          lastHeadAt[i] = now;
        }

        if (now - lastTrailAt[i] > TRAIL_REFRESH_MS) {
          for (let t = 0; t < trailChar[i].length; t++) {
            trailChar[i][t] = randomChar();
          }
          lastTrailAt[i] = now;
        }

        const x = i * fontSize;
        const y = drops[i] * fontSize;
        const alpha = brightness[i];

        ctx.fillStyle = `rgba(74, 222, 128, ${Math.min(0.95, alpha + 0.35)})`;
        ctx.fillText(headChar[i], x, y);

        for (let j = 1; j < 20; j++) {
          const trailY = y - j * fontSize;
          const trailAlpha = (alpha - j * 0.045) * 0.55;
          if (trailAlpha > 0) {
            const g = 34 + j * 4;
            ctx.fillStyle = `rgba(${g}, 197, 94, ${trailAlpha})`;
            ctx.fillText(trailChar[i][j - 1] ?? randomChar(), x, trailY);
          }
        }

        drops[i] += speeds[i];

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.985) {
          drops[i] = 0;
          brightness[i] = 0.25 + Math.random() * 0.45;
          speeds[i] = 0.12 + Math.random() * 0.23;
        }
      }
    };

    intervalRef.current = setInterval(draw, 70);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, opacity: 0.42 }}
      aria-hidden
    />
  );
}
