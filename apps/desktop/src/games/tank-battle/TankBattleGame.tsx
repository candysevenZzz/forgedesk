import { useCallback, useEffect, useRef, useState } from "react";

type Tank = { x: number; y: number; dx: number; dy: number; cooldown: number };
type Bullet = { x: number; y: number; dx: number; dy: number; friendly: boolean };
const WIDTH = 720;
const HEIGHT = 520;

export function TankBattleGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pressedRef = useRef(new Set<string>());
  const gameRef = useRef({
    player: { x: WIDTH / 2, y: HEIGHT - 75, dx: 0, dy: -1, cooldown: 0 },
    enemies: [] as Tank[],
    bullets: [] as Bullet[],
    score: 0,
    lives: 3,
    status: "ready",
    last: 0,
    spawn: 0,
  });
  const [snapshot, setSnapshot] = useState({ score: 0, lives: 3, status: "ready" });
  const reset = useCallback(() => {
    gameRef.current = {
      player: { x: WIDTH / 2, y: HEIGHT - 75, dx: 0, dy: -1, cooldown: 0 },
      enemies: [],
      bullets: [],
      score: 0,
      lives: 3,
      status: "playing",
      last: performance.now(),
      spawn: 0,
    };
    setSnapshot({ score: 0, lives: 3, status: "playing" });
  }, []);
  useEffect(() => {
    let frameId = 0;
    const frame = (time: number) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      const game = gameRef.current;
      const delta = Math.min(35, time - game.last || 16);
      game.last = time;
      if (game.status === "playing") {
        const player = game.player;
        const keys = pressedRef.current;
        const speed = (2.5 * delta) / 16;
        if (keys.has("ArrowLeft") || keys.has("a")) {
          player.x -= speed;
          player.dx = -1;
          player.dy = 0;
        }
        if (keys.has("ArrowRight") || keys.has("d")) {
          player.x += speed;
          player.dx = 1;
          player.dy = 0;
        }
        if (keys.has("ArrowUp") || keys.has("w")) {
          player.y -= speed;
          player.dx = 0;
          player.dy = -1;
        }
        if (keys.has("ArrowDown") || keys.has("s")) {
          player.y += speed;
          player.dx = 0;
          player.dy = 1;
        }
        player.x = Math.max(20, Math.min(WIDTH - 20, player.x));
        player.y = Math.max(20, Math.min(HEIGHT - 20, player.y));
        player.cooldown -= delta;
        if ((keys.has(" ") || keys.has("Space")) && player.cooldown <= 0) {
          game.bullets.push({
            x: player.x + player.dx * 19,
            y: player.y + player.dy * 19,
            dx: player.dx * 5,
            dy: player.dy * 5,
            friendly: true,
          });
          player.cooldown = 300;
        }
        game.spawn += delta;
        if (game.spawn > 1550) {
          game.spawn = 0;
          game.enemies.push({
            x: 35 + Math.random() * (WIDTH - 70),
            y: 35,
            dx: 0,
            dy: 1,
            cooldown: 900 + Math.random() * 850,
          });
        }
        game.enemies.forEach((enemy) => {
          enemy.y += (0.55 * delta) / 16;
          enemy.cooldown -= delta;
          if (enemy.cooldown <= 0) {
            game.bullets.push({ x: enemy.x, y: enemy.y + 20, dx: 0, dy: 3, friendly: false });
            enemy.cooldown = 1050 + Math.random() * 1150;
          }
        });
        game.bullets.forEach((bullet) => {
          bullet.x += (bullet.dx * delta) / 16;
          bullet.y += (bullet.dy * delta) / 16;
        });
        game.bullets = game.bullets.filter((bullet) => {
          if (bullet.friendly) {
            const hit = game.enemies.findIndex((enemy) => Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y) < 22);
            if (hit >= 0) {
              game.enemies.splice(hit, 1);
              game.score += 50;
              setSnapshot({ score: game.score, lives: game.lives, status: game.status });
              return false;
            }
          } else if (Math.hypot(player.x - bullet.x, player.y - bullet.y) < 20) {
            game.lives -= 1;
            if (game.lives <= 0) {
              game.status = "over";
            }
            setSnapshot({ score: game.score, lives: game.lives, status: game.status });
            return false;
          }
          return bullet.x > -10 && bullet.x < WIDTH + 10 && bullet.y > -10 && bullet.y < HEIGHT + 10;
        });
        game.enemies = game.enemies.filter((enemy) => enemy.y < HEIGHT + 20);
      }
      if (context) {
        context.fillStyle = "#161814";
        context.fillRect(0, 0, WIDTH, HEIGHT);
        context.strokeStyle = "#2b3429";
        for (let x = 0; x < WIDTH; x += 40) {
          context.beginPath();
          context.moveTo(x, 0);
          context.lineTo(x, HEIGHT);
          context.stroke();
        }
        for (let y = 0; y < HEIGHT; y += 40) {
          context.beginPath();
          context.moveTo(0, y);
          context.lineTo(WIDTH, y);
          context.stroke();
        }
        context.fillStyle = "#e9b762";
        context.fillRect(WIDTH / 2 - 24, HEIGHT - 28, 48, 13);
        const drawTank = (tank: Tank, color: string) => {
          context.save();
          context.translate(tank.x, tank.y);
          context.fillStyle = color;
          context.fillRect(-15, -13, 30, 26);
          context.fillStyle = "#253025";
          context.fillRect(-8, -8, 16, 16);
          context.rotate(Math.atan2(tank.dy, tank.dx));
          context.fillStyle = color;
          context.fillRect(0, -3, 26, 6);
          context.restore();
        };
        drawTank(game.player, "#72d19e");
        game.enemies.forEach((enemy) => drawTank(enemy, "#e98c62"));
        game.bullets.forEach((bullet) => {
          context.fillStyle = bullet.friendly ? "#d8f18c" : "#ff7972";
          context.beginPath();
          context.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
          context.fill();
        });
      }
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, []);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Space"].includes(event.key) ||
        event.code === "Space"
      ) {
        event.preventDefault();
      }
      if (gameRef.current.status === "ready" || gameRef.current.status === "over") {
        reset();
      } else if (gameRef.current.status === "paused") {
        gameRef.current.status = "playing";
        gameRef.current.last = performance.now();
        setSnapshot((current) => ({ ...current, status: "playing" }));
      }
      pressedRef.current.add(event.key);
      if (event.code === "Space") {
        pressedRef.current.add("Space");
      }
    };
    const up = (event: KeyboardEvent) => {
      pressedRef.current.delete(event.key);
      if (event.code === "Space") {
        pressedRef.current.delete("Space");
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [reset]);
  useEffect(() => {
    const pauseWhenHidden = () => {
      const game = gameRef.current;
      if (document.hidden && game.status === "playing") {
        game.status = "paused";
        setSnapshot({ score: game.score, lives: game.lives, status: "paused" });
      }
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", pauseWhenHidden);
    };
  }, []);
  return (
    <div className="canvas-game tank-game">
      <aside className="game-hud">
        <div>
          <span>战果</span>
          <strong>{snapshot.score}</strong>
        </div>
        <div>
          <span>耐久</span>
          <strong>{snapshot.lives}</strong>
        </div>
      </aside>
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="game-canvas wide-canvas" />
      <div className="game-overlay">
        <strong>{snapshot.status === "over" ? "基地失守" : "坦克大战"}</strong>
        <span>
          {snapshot.status === "ready"
            ? "WASD 或方向键移动，空格开火"
            : snapshot.status === "over"
              ? "按任意操作重开"
              : snapshot.status === "paused"
                ? "已暂停，按任意操作继续"
                : "守住金色基地"}
        </span>
      </div>
    </div>
  );
}
