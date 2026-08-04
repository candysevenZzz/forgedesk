import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Blocks, Crosshair, Expand, Gamepad2, RotateCcw, Sparkles, Spline } from "lucide-react";
import { SnakeGame, StarWeaverGame, TankBattleGame, TetrisGame } from "../games";
import type { PluginContext, PluginDefinition } from "../types";

type GameId = "snake" | "star-weaver" | "tank-battle" | "tetris";
type GameComponent = typeof SnakeGame;

const games: Array<{
  id: GameId;
  title: string;
  subtitle: string;
  description: string;
  controls: string;
  icon: typeof Gamepad2;
  accent: "mint" | "starlight" | "ember" | "neon";
  component: GameComponent;
}> = [
  {
    id: "snake",
    title: "贪吃蛇",
    subtitle: "Snake",
    description: "在不断加速的网格里寻找下一颗食物。",
    controls: "方向键 / WASD",
    icon: Spline,
    accent: "mint",
    component: SnakeGame,
  },
  {
    id: "star-weaver",
    title: "星轨织梦",
    subtitle: "Star Weaver",
    description: "放置引力星，让彗星穿过漂浮的宝石。",
    controls: "点击放置 / 右键移除",
    icon: Sparkles,
    accent: "starlight",
    component: StarWeaverGame,
  },
  {
    id: "tank-battle",
    title: "坦克大战",
    subtitle: "Tank Battle",
    description: "守住基地，在砖墙与钢墙间消灭敌军。",
    controls: "方向键 / WASD / 空格",
    icon: Crosshair,
    accent: "ember",
    component: TankBattleGame,
  },
  {
    id: "tetris",
    title: "俄罗斯方块",
    subtitle: "Tetris",
    description: "利用墙踢与幽灵方块，稳住不断加速的棋盘。",
    controls: "方向键 / 空格 / P",
    icon: Blocks,
    accent: "neon",
    component: TetrisGame,
  },
];

function requestedGameId(): GameId | null {
  const candidate = new URLSearchParams(window.location.search).get("game");
  return games.some((game) => game.id === candidate) ? (candidate as GameId) : null;
}

function GameDirectory({ onOpen }: { onOpen: (gameId: GameId) => void }) {
  return (
    <section className="game-directory">
      <div className="game-directory-head">
        <div>
          <span>本地游乐场</span>
          <h2>从一局游戏里暂时抽离。</h2>
        </div>
        <p>四个游戏均在当前设备运行，不请求服务也不上传游戏过程。</p>
      </div>
      <div className="game-card-grid">
        {games.map((game) => {
          const Icon = game.icon;
          return (
            <button
              className={`game-launcher-card ${game.accent}`}
              key={game.id}
              type="button"
              onClick={() => onOpen(game.id)}
            >
              <span className="game-launcher-icon">
                <Icon size={22} aria-hidden="true" />
              </span>
              <span className="game-launcher-copy">
                <strong>{game.title}</strong>
                <small>{game.subtitle}</small>
                <em>{game.description}</em>
              </span>
              <span className="game-control-chip">{game.controls}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function GameArcadePlugin(_: { context: PluginContext }) {
  const [activeGameId, setActiveGameId] = useState<GameId | null>(requestedGameId);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const selectedGame = games.find((game) => game.id === activeGameId) ?? games[0];

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === stageRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  function openGame(gameId: GameId) {
    setActiveGameId(gameId);
    setReloadVersion(0);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await stageRef.current?.requestFullscreen();
      }
    } catch {
      setIsFullscreen(false);
    }
  }

  if (!activeGameId) {
    return <GameDirectory onOpen={openGame} />;
  }

  const GameIcon = selectedGame.icon;
  const SelectedGame = selectedGame.component;

  return (
    <section className="game-arcade-shell">
      <header className="game-arcade-nav">
        <button type="button" onClick={() => setActiveGameId(null)}>
          <ArrowLeft size={16} aria-hidden="true" />
          <span>全部游戏</span>
        </button>
        <div>
          <span className={`game-nav-icon ${selectedGame.accent}`}>
            <GameIcon size={15} aria-hidden="true" />
          </span>
          <strong>{selectedGame.title}</strong>
          <small>{selectedGame.controls}</small>
        </div>
        <div className="game-arcade-actions">
          <button type="button" onClick={() => setReloadVersion((version) => version + 1)} aria-label="重新开始">
            <RotateCcw size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-label={isFullscreen ? "退出全屏" : "进入全屏"}
          >
            <Expand size={16} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className={`game-stage ${selectedGame.accent}`} ref={stageRef}>
        <SelectedGame key={`${activeGameId}-${reloadVersion}`} />
      </div>
    </section>
  );
}

export const gameArcadePlugin: PluginDefinition = {
  id: "game-arcade",
  name: "小游戏",
  description: "四款本地小游戏，支持全屏与独立重开。",
  icon: Gamepad2,
  category: "休息",
  shortcuts: ["game", "arcade", "snake", "tetris"],
  accent: "teal",
  serviceRequirement: "local",
  component: GameArcadePlugin,
};
