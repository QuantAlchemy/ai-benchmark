import Phaser from "phaser";
import "./styles.css";
import { BootScene } from "./scenes/BootScene.js";
import { GameOverScene } from "./scenes/GameOverScene.js";
import { GameScene } from "./scenes/GameScene.js";
import { MainMenuScene } from "./scenes/MainMenuScene.js";
import { PreloaderScene } from "./scenes/PreloaderScene.js";

const SAFE_ZONE_WIDTH = 320;
const SAFE_ZONE_HEIGHT = Math.min(window.innerHeight, 480);

function gameSize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const longSide = Math.max(w, h);
  const shortSide = Math.min(w, h);
  const aspectRatioDevice = longSide / shortSide;
  const aspectRatioSafeZone = SAFE_ZONE_WIDTH / SAFE_ZONE_HEIGHT;
  let extraWidth = 0;
  let extraHeight = 0;

  if (aspectRatioDevice > aspectRatioSafeZone) {
    extraWidth = aspectRatioDevice * SAFE_ZONE_HEIGHT - SAFE_ZONE_WIDTH;
  } else {
    extraHeight = SAFE_ZONE_WIDTH / aspectRatioDevice - SAFE_ZONE_HEIGHT;
  }

  return {
    width: SAFE_ZONE_WIDTH + extraWidth,
    height: SAFE_ZONE_HEIGHT + extraHeight,
  };
}

const size = gameSize();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: size.width,
  height: size.height,
  backgroundColor: "#000000",
  pixelArt: true,
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
    arcade: {
      debug: false,
      gravity: { y: 0 },
    },
  },
  scene: [BootScene, PreloaderScene, MainMenuScene, GameScene, GameOverScene],
});
