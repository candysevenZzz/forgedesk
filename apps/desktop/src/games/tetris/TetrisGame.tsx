import { useCallback, useEffect, useRef, useState } from "react";

const WIDTH = 10;
const HEIGHT = 20;
const CELL = 26;
const SHAPES = [
  [[1, 1, 1, 1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
];
const COLORS = ["#4fd6ff", "#ffd166", "#b28dff", "#ff916b", "#5e9eff", "#5ed6a7", "#fa6fa7"];
type Piece = { matrix: number[][]; color: string; x: number; y: number };
function makePiece(): Piece {
  const index = Math.floor(Math.random() * SHAPES.length);
  return { matrix: SHAPES[index].map((row) => [...row]), color: COLORS[index], x: 3, y: -1 };
}
function rotate(matrix: number[][]): number[][] {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]).reverse());
}

export function TetrisGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef({
    board: Array.from({ length: HEIGHT }, () => Array<string | null>(WIDTH).fill(null)),
    piece: makePiece(),
    status: "ready",
    score: 0,
    lines: 0,
    last: 0,
    fall: 0,
  });
  const [snapshot, setSnapshot] = useState({ score: 0, lines: 0, status: "ready" });
  const collides = useCallback(
    (piece: Piece, board = gameRef.current.board) =>
      piece.matrix.some((row, y) =>
        row.some(
          (filled, x) =>
            filled &&
            (piece.x + x < 0 ||
              piece.x + x >= WIDTH ||
              piece.y + y >= HEIGHT ||
              (piece.y + y >= 0 && board[piece.y + y][piece.x + x])),
        ),
      ),
    [],
  );
  const reset = useCallback(() => {
    gameRef.current = {
      board: Array.from({ length: HEIGHT }, () => Array<string | null>(WIDTH).fill(null)),
      piece: makePiece(),
      status: "playing",
      score: 0,
      lines: 0,
      last: performance.now(),
      fall: 0,
    };
    setSnapshot({ score: 0, lines: 0, status: "playing" });
  }, []);
  const lock = useCallback(() => {
    const game = gameRef.current;
    game.piece.matrix.forEach((row, y) =>
      row.forEach((filled, x) => {
        if (filled && game.piece.y + y >= 0) {
          game.board[game.piece.y + y][game.piece.x + x] = game.piece.color;
        }
      }),
    );
    const remaining = game.board.filter((row) => !row.every(Boolean));
    const cleared = HEIGHT - remaining.length;
    game.board = [...Array.from({ length: cleared }, () => Array<string | null>(WIDTH).fill(null)), ...remaining];
    game.score += [0, 100, 300, 500, 800][cleared] * (Math.floor(game.lines / 10) + 1);
    game.lines += cleared;
    game.piece = makePiece();
    if (collides(game.piece)) {
      game.status = "over";
    }
    setSnapshot({ score: game.score, lines: game.lines, status: game.status });
  }, [collides]);
  const move = useCallback(
    (dx: number, dy: number) => {
      const game = gameRef.current;
      if (game.status !== "playing") {
        return;
      }
      const candidate = { ...game.piece, x: game.piece.x + dx, y: game.piece.y + dy };
      if (!collides(candidate)) {
        game.piece = candidate;
      } else if (dy > 0) {
        lock();
      }
    },
    [collides, lock],
  );
  const turn = useCallback(() => {
    const game = gameRef.current;
    if (game.status !== "playing") {
      return;
    }
    const matrix = rotate(game.piece.matrix);
    for (const offset of [0, -1, 1, -2, 2]) {
      const candidate = { ...game.piece, matrix, x: game.piece.x + offset };
      if (!collides(candidate)) {
        game.piece = candidate;
        return;
      }
    }
  }, [collides]);
  const hardDrop = useCallback(() => {
    const game = gameRef.current;
    if (game.status !== "playing") {
      return;
    }
    while (!collides({ ...game.piece, y: game.piece.y + 1 })) {
      game.piece = { ...game.piece, y: game.piece.y + 1 };
    }
    lock();
  }, [collides, lock]);
  useEffect(() => {
    let frameId = 0;
    const frame = (time: number) => {
      const game = gameRef.current;
      const context = canvasRef.current?.getContext("2d");
      if (game.status === "playing") {
        game.fall += Math.min(40, time - game.last);
        game.last = time;
        const interval = Math.max(170, 680 - Math.floor(game.lines / 10) * 55);
        if (game.fall >= interval) {
          game.fall = 0;
          move(0, 1);
        }
      }
      if (context) {
        context.fillStyle = "#111322";
        context.fillRect(0, 0, WIDTH * CELL, HEIGHT * CELL);
        context.strokeStyle = "#252b46";
        for (let y = 0; y < HEIGHT; y += 1) {
          for (let x = 0; x < WIDTH; x += 1) {
            const color = game.board[y][x];
            if (color) {
              context.fillStyle = color;
              context.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
            } else {
              context.strokeRect(x * CELL + 0.5, y * CELL + 0.5, CELL, CELL);
            }
          }
        }
        game.piece.matrix.forEach((row, y) =>
          row.forEach((filled, x) => {
            if (filled && game.piece.y + y >= 0) {
              context.fillStyle = game.piece.color;
              context.fillRect((game.piece.x + x) * CELL + 2, (game.piece.y + y) * CELL + 2, CELL - 4, CELL - 4);
            }
          }),
        );
      }
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [move]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space", "p", "P"].includes(event.key)) {
        event.preventDefault();
      }
      if (gameRef.current.status === "ready" || gameRef.current.status === "over") {
        reset();
        return;
      }
      if (event.key === "ArrowLeft") {
        move(-1, 0);
      }
      if (event.key === "ArrowRight") {
        move(1, 0);
      }
      if (event.key === "ArrowDown") {
        move(0, 1);
      }
      if (event.key === "ArrowUp") {
        turn();
      }
      if (event.code === "Space") {
        hardDrop();
      }
      if (event.key === "p" || event.key === "P") {
        gameRef.current.status = gameRef.current.status === "playing" ? "paused" : "playing";
        gameRef.current.last = performance.now();
        setSnapshot((current) => ({ ...current, status: gameRef.current.status }));
      }
    };
    const hidden = () => {
      if (document.hidden && gameRef.current.status === "playing") {
        gameRef.current.status = "paused";
        setSnapshot((current) => ({ ...current, status: "paused" }));
      }
    };
    window.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [hardDrop, move, reset, turn]);
  return (
    <div className="canvas-game tetris-game">
      <aside className="game-hud">
        <div>
          <span>得分</span>
          <strong>{snapshot.score}</strong>
        </div>
        <div>
          <span>消行</span>
          <strong>{snapshot.lines}</strong>
        </div>
      </aside>
      <canvas ref={canvasRef} width={WIDTH * CELL} height={HEIGHT * CELL} className="game-canvas tetris-canvas" />
      <div className="game-overlay">
        <strong>
          {snapshot.status === "over" ? "堆叠到底" : snapshot.status === "paused" ? "已暂停" : "俄罗斯方块"}
        </strong>
        <span>
          {snapshot.status === "ready"
            ? "方向键移动，空格直落"
            : snapshot.status === "over"
              ? "按任意操作重开"
              : "P 暂停"}
        </span>
      </div>
    </div>
  );
}
