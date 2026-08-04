import { useEffect, useRef, useState } from "react";

type Star = { x: number; y: number; power: number };
type Comet = { x: number; y: number; vx: number; vy: number; hue: number; age: number };
const WIDTH = 900;
const HEIGHT = 520;

export function StarWeaverGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ stars: [] as Star[], comets: [] as Comet[], score: 0, status: "ready", last: 0, spawn: 0 });
  const [snapshot, setSnapshot] = useState({ score: 0, stars: 0, status: "ready" });

  useEffect(() => {
    const pauseWhenHidden = () => {
      const game = stateRef.current;
      if (document.hidden && game.status === "playing") {
        game.status = "paused";
        setSnapshot({ score: game.score, stars: game.stars.length, status: "paused" });
      }
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", pauseWhenHidden);
    };
  }, []);

  useEffect(() => {
    let frameId = 0;
    const draw = (time: number) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      const game = stateRef.current;
      if (!context || !canvas) {
        return;
      }
      const delta = Math.min(34, time - game.last || 16);
      game.last = time;
      if (game.status === "playing") {
        game.spawn += delta;
        if (game.spawn > 1250) {
          game.spawn = 0;
          game.comets.push({
            x: -20,
            y: 80 + Math.random() * 360,
            vx: 1.2 + Math.random() * 0.6,
            vy: (Math.random() - 0.5) * 0.35,
            hue: 190 + Math.random() * 110,
            age: 0,
          });
        }
        game.comets.forEach((comet) => {
          game.stars.forEach((star) => {
            const dx = star.x - comet.x;
            const dy = star.y - comet.y;
            const distance = Math.max(45, Math.hypot(dx, dy));
            const force = (star.power / (distance * distance)) * delta * 120;
            comet.vx += (dx / distance) * force;
            comet.vy += (dy / distance) * force;
            if (distance < 28) {
              comet.age = 9999;
              game.score += 15;
            }
          });
          comet.x += (comet.vx * delta) / 16;
          comet.y += (comet.vy * delta) / 16;
          comet.age += delta;
        });
        const before = game.comets.length;
        game.comets = game.comets.filter(
          (comet) => comet.age < 9999 && comet.x < WIDTH + 50 && comet.y > -50 && comet.y < HEIGHT + 50,
        );
        if (before !== game.comets.length || game.score !== snapshot.score) {
          setSnapshot({ score: game.score, stars: game.stars.length, status: game.status });
        }
      }
      const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
      gradient.addColorStop(0, "#10132b");
      gradient.addColorStop(1, "#241633");
      context.fillStyle = gradient;
      context.fillRect(0, 0, WIDTH, HEIGHT);
      context.fillStyle = "rgba(230, 235, 255, .55)";
      for (let i = 0; i < 80; i += 1) {
        const x = (i * 97) % WIDTH;
        const y = (i * 167) % HEIGHT;
        context.fillRect(x, y, 1, 1);
      }
      game.stars.forEach((star) => {
        const glow = context.createRadialGradient(star.x, star.y, 2, star.x, star.y, star.power * 1.8);
        glow.addColorStop(0, "rgba(255, 221, 137, .9)");
        glow.addColorStop(1, "rgba(255, 184, 112, 0)");
        context.fillStyle = glow;
        context.beginPath();
        context.arc(star.x, star.y, star.power * 1.8, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#fff5c0";
        context.beginPath();
        context.arc(star.x, star.y, 4, 0, Math.PI * 2);
        context.fill();
      });
      game.comets.forEach((comet) => {
        const tail = context.createLinearGradient(comet.x - comet.vx * 35, comet.y - comet.vy * 35, comet.x, comet.y);
        tail.addColorStop(0, "transparent");
        tail.addColorStop(1, `hsla(${comet.hue}, 90%, 75%, .9)`);
        context.strokeStyle = tail;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(comet.x - comet.vx * 35, comet.y - comet.vy * 35);
        context.lineTo(comet.x, comet.y);
        context.stroke();
        context.fillStyle = `hsl(${comet.hue}, 95%, 82%)`;
        context.beginPath();
        context.arc(comet.x, comet.y, 4, 0, Math.PI * 2);
        context.fill();
      });
      frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [snapshot.score]);

  const interact = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    const game = stateRef.current;
    if (event.type === "contextmenu") {
      event.preventDefault();
      game.stars = game.stars.filter((star) => Math.hypot(star.x - x, star.y - y) > 40);
    } else {
      if (game.status !== "playing") {
        game.status = "playing";
      }
      if (game.stars.length < 7) {
        game.stars.push({ x, y, power: 42 + Math.random() * 20 });
      }
    }
    setSnapshot({ score: game.score, stars: game.stars.length, status: game.status });
  };
  return (
    <div className="canvas-game star-game">
      <aside className="game-hud">
        <div>
          <span>星尘</span>
          <strong>{snapshot.score}</strong>
        </div>
        <div>
          <span>引力星</span>
          <strong>{snapshot.stars}/7</strong>
        </div>
      </aside>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="game-canvas wide-canvas"
        onClick={interact}
        onContextMenu={interact}
      />
      <div className="game-overlay">
        <strong>星轨织梦</strong>
        <span>
          {snapshot.status === "ready"
            ? "点击放置引力星，右键移除"
            : snapshot.status === "paused"
              ? "已暂停，点击画面继续"
              : "用引力星捕获掠过的彗星"}
        </span>
      </div>
    </div>
  );
}
