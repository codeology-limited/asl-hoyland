import React, { useEffect, useRef } from 'react';
import { isDev } from '../util/mode';

const MatrixRain: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const fontSize = 16;
    const columns = Math.floor(width / fontSize);
    const drops = new Array<number>(columns).fill(1);

    const color = isDev ? 'rgba(255, 0, 0, 0.9)' : 'rgba(0, 255, 0, 0.9)';
    const trail = 'rgba(0, 0, 0, 0.06)';
    const charset = '01';

    // Frame throttle to slow down the rain
    let frameCount = 0;
    const frameSkip = 3; // Only update every 4th frame (slow down by 4x)

    const draw = () => {
      frameCount++;

      // Only update every frameSkip frames
      if (frameCount % frameSkip === 0) {
        // Faintly cover the canvas to create the trail effect
        ctx.fillStyle = trail;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = color;
        ctx.font = `${fontSize}px monospace`;

        for (let i = 0; i < drops.length; i++) {
          const text = charset.charAt(Math.floor(Math.random() * charset.length));
          ctx.fillText(text, i * fontSize, drops[i] * fontSize);

          // reset drop
          if (drops[i] * fontSize > height && Math.random() > 0.975) {
            drops[i] = 0;
          }
          drops[i]++;
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', onResize);
    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        background: 'black',
      }}
    />
  );
};

export default MatrixRain;

