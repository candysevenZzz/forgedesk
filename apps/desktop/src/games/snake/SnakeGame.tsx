import { useCallback, useEffect, useRef, useState } from "react";

const GRID = 20;
const CELL = 22;
const SIZE = GRID * CELL;

type Point = { x: number; y: number };
type Status = "ready" | "playing" | "paused" | "over";

function randomFood(snake: Point[]): Point {
  const used = new Set(snake.map((point) => `${point.x}:${point.y}`));
  const available: Point[] = [];
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (!used.has(`${x}:${y}`)) {
        available.push({ x, y });
      }
    }
  }
  return available[Math.floor(Math.random() * available.length)] ?? { x: 0, y: 0 };
}

export function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    snake: [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ],
    direction: { x: 1, y: 0 },
    next: { x: 1, y: 0 },
    food: { x: 14, y: 10 },
    score: 0,
    level: 1,
    status: "ready" as Status,
    accumulator: 0,
    lastTime: 0,
  });
  const animationRef = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState({ score: 0, level: 1, status: "ready" as Status });

  const reset = useCallback(() => {
    const snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    stateRef.current = {
      snake,
      direction: { x: 1, y: 0 },
      next: { x: 1, y: 0 },
      food: randomFood(snake),
      score: 0,
      level: 1,
      status: "playing",
      accumulator: 0,
      lastTime: performance.now(),
    };
    setSnapshot({ score: 0, level: 1, status: "playing" });
  }, []);

  const setDirection = useCallback(
    (x: number, y: number) => {
      const game = stateRef.current;
      if (game.status === "ready" || game.status === "over") {
        reset();
      }
      if (x !== -game.direction.x || y !== -game.direction.y) {
        game.next = { x, y };
      }
    },
    [reset],
  );

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      const game = stateRef.current;
      context.fillStyle = "#101716";
      context.fillRect(0, 0, SIZE, SIZE);
      context.strokeStyle = "#21332d";
      context.lineWidth = 1;
      for (let index = 0; index <= GRID; index += 1) {
        context.beginPath();
        context.moveTo(index * CELL, 0);
        context.lineTo(index * CELL, SIZE);
        context.moveTo(0, index * CELL);
        context.lineTo(SIZE, index * CELL);
        context.stroke();
      }
      const pulse = 0.88 + Math.sin(performance.now() / 180) * 0.12;
      context.fillStyle = "rgba(255, 117, 105, .2)";
      context.beginPath();
      context.arc((game.food.x + 0.5) * CELL, (game.food.y + 0.5) * CELL, CELL * pulse * 0.7, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#ff766d";
      context.beginPath();
      context.arc((game.food.x + 0.5) * CELL, (game.food.y + 0.5) * CELL, CELL * 0.28 * pulse, 0, Math.PI * 2);
      context.fill();
      game.snake
        .slice()
        .reverse()
        .forEach((part, reversedIndex) => {
          const isHead = reversedIndex === game.snake.length - 1;
          context.fillStyle = isHead ? "#72dc9f" : reversedIndex % 2 === 0 ? "#48aa76" : "#398c61";
          context.roundRect(part.x * CELL + 2, part.y * CELL + 2, CELL - 4, CELL - 4, 5);
          context.fill();
        });
      const head = game.snake[0];
      context.fillStyle = "#0d1512";
      const eyes =
        game.direction.x !== 0
          ? [
              [0.72, 0.3],
              [0.72, 0.7],
            ]
          : [
              [0.3, 0.28],
              [0.7, 0.28],
            ];
      eyes.forEach(([x, y]) => {
        const eyeX = head.x * CELL + (game.direction.x < 0 ? (1 - x) * CELL : x * CELL);
        const eyeY = head.y * CELL + (game.direction.y > 0 ? (1 - y) * CELL : y * CELL);
        context.beginPath();
        context.arc(eyeX, eyeY, 2, 0, Math.PI * 2);
        context.fill();
      });
    };

    const frame = (time: number) => {
      const game = stateRef.current;
      if (game.status === "playing") {
        game.accumulator += Math.min(40, time - game.lastTime);
        game.lastTime = time;
        const delay = Math.max(95, 210 - (game.level - 1) * 10);
        if (game.accumulator >= delay) {
          game.accumulator = 0;
          game.direction = game.next;
          const head = game.snake[0];
          const next = { x: head.x + game.direction.x, y: head.y + game.direction.y };
          const eats = next.x === game.food.x && next.y === game.food.y;
          const collision = game.snake
            .slice(0, eats ? game.snake.length : -1)
            .some((part) => part.x === next.x && part.y === next.y);
          if (next.x < 0 || next.y < 0 || next.x >= GRID || next.y >= GRID || collision) {
            game.status = "over";
            setSnapshot({ score: game.score, level: game.level, status: "over" });
          } else {
            game.snake.unshift(next);
            if (eats) {
              game.score += game.level * 10;
              game.level = Math.floor(game.score / 50) + 1;
              game.food = randomFood(game.snake);
              setSnapshot({ score: game.score, level: game.level, status: "playing" });
            } else {
              game.snake.pop();
            }
          }
        }
      }
      draw();
      animationRef.current = requestAnimationFrame(frame);
    };
    animationRef.current = requestAnimationFrame(frame);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const directions: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        w: [0, -1],
        ArrowDown: [0, 1],
        s: [0, 1],
        ArrowLeft: [-1, 0],
        a: [-1, 0],
        ArrowRight: [1, 0],
        d: [1, 0],
      };
      const direction = directions[event.key];
      if (direction) {
        event.preventDefault();
        setDirection(...direction);
      }
      if (event.code === "Space") {
        event.preventDefault();
        const game = stateRef.current;
        if (game.status === "playing") {
          game.status = "paused";
          setSnapshot((current) => ({ ...current, status: "paused" }));
        } else if (game.status === "paused") {
          game.status = "playing";
          game.lastTime = performance.now();
          setSnapshot((current) => ({ ...current, status: "playing" }));
        } else {
          reset();
        }
      }
    };
    const pauseWhenHidden = () => {
      if (document.hidden && stateRef.current.status === "playing") {
        stateRef.current.status = "paused";
        setSnapshot((current) => ({ ...current, status: "paused" }));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", pauseWhenHidden);
    };
  }, [reset, setDirection]);

  return (
    <div className="canvas-game mint-game">
      <aside className="game-hud">
        <div>
          <span>得分</span>
          <strong>{snapshot.score}</strong>
        </div>
        <div>
          <span>等级</span>
          <strong>{snapshot.level}</strong>
        </div>
      </aside>
      <canvas ref={canvasRef} width={SIZE} height={SIZE} className="game-canvas square-canvas" />
      <div className="game-overlay">
        <strong>{snapshot.status === "over" ? "本局结束" : snapshot.status === "paused" ? "已暂停" : "贪吃蛇"}</strong>
        <span>
          {snapshot.status === "ready"
            ? "按方向键或 WASD 开始"
            : snapshot.status === "over"
              ? `得分 ${snapshot.score}，按空格重开`
              : "空格暂停"}
        </span>
      </div>
      <div className="game-pad">
        <button type="button" onClick={() => setDirection(0, -1)}>
          上
        </button>
        <button type="button" onClick={() => setDirection(-1, 0)}>
          左
        </button>
        <button type="button" onClick={() => setDirection(0, 1)}>
          下
        </button>
        <button type="button" onClick={() => setDirection(1, 0)}>
          右
        </button>
      </div>
    </div>
  );
}
