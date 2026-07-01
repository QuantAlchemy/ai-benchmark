import Phaser from "phaser";
import { loadBootAssets } from "../assets.js";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    loadBootAssets(this);
  }

  create() {
    this.input.maxPointers = 2;
    this.scale.refresh();
    this.scene.start("Preloader");
  }
}
