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

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = Array(columns)
      .fill(0)
      .map(() => Math.random() * -100);
    const speeds: number[] = Array(columns)
      .fill(0)
      .map(() => 0.5 + Math.random() * 1.5);
    const brightness: number[] = Array(columns)
      .fill(0)
      .map(() => 0.3 + Math.random() * 0.7);

    const draw = () => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${fontSize}px "JetBrains Mono", "Courier New", monospace`;

      for (let i = 0; i < drops.length; i++) {
        const char = matrixChars[Math.floor(Math.random() * matrixChars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        const alpha = brightness[i];

        ctx.fillStyle = `rgba(59, 130, 246, ${alpha + 0.3})`;
        ctx.fillText(char, x, y);

        for (let j = 1; j < 20; j++) {
          const trailY = y - j * fontSize;
          const trailAlpha = (alpha - j * 0.05) * 0.8;
          if (trailAlpha > 0) {
            const trailChar = matrixChars[Math.floor(Math.random() * matrixChars.length)];
            const hue = 210 + Math.random() * 20;
            const lightness = 50 + j * 2;
            ctx.fillStyle = `hsla(${hue}, 90%, ${lightness}%, ${trailAlpha})`;
            ctx.fillText(trailChar, x, trailY);
          }
        }

        drops[i] += speeds[i];

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.98) {
          drops[i] = 0;
          brightness[i] = 0.3 + Math.random() * 0.7;
          speeds[i] = 0.5 + Math.random() * 1.5;
        }
      }
    };

    intervalRef.current = setInterval(draw, 33);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, opacity: 0.85 }}
      aria-hidden
    />
  );
}
