import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, GameScene } from "./scenes/GameScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#10131a",
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [GameScene],
});

// Depuração/QA: acesso ao jogo pelo console do navegador (só em dev).
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
