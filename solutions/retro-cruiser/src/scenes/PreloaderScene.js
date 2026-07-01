import Phaser from "phaser";
import { loadGameAssets } from "../assets.js";
import { GameState } from "../state.js";

export class PreloaderScene extends Phaser.Scene {
  constructor() {
    super("Preloader");
  }

  preload() {
    const { width, height } = this.scale;
    this.background = this.add.image(0, 0, "title").setOrigin(0).setDisplaySize(width, height);
    const bar = this.add.image(width / 2 - 200, height - 100, "loading").setOrigin(0, 0.5);
    const crop = new Phaser.Geom.Rectangle(0, 0, 0, bar.height);
    bar.setCrop(crop);

    this.load.on("progress", (value) => {
      crop.width = 400 * value;
      bar.setCrop(crop);
    });

    loadGameAssets(this);
  }

  create() {
    if (!this.anims.exists("explosion")) {
      this.anims.create({
        key: "explosion",
        frames: this.anims.generateFrameNumbers("explode", { start: 0, end: 15 }),
        frameRate: 8,
        repeat: 0,
        hideOnComplete: true,
      });
    }

    GameState.music = this.sound.add("title_sound", { volume: 1, loop: true });
    GameState.music.play();
    this.tweens.add({
      targets: this.background,
      alpha: 0,
      duration: 2000,
      ease: "Linear",
      onComplete: () => this.scene.start("MainMenu"),
    });
  }
}
