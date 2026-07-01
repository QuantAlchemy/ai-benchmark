import Phaser from "phaser";
import { GameState, HEROES } from "../state.js";

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super("MainMenu");
  }

  create() {
    const { width, height } = this.scale;
    this.menu = this.add.container(0, 0).setAlpha(0);
    this.ground = this.add.tileSprite(0, 0, width, height, "ground").setOrigin(0);
    this.menu.add(this.ground);

    this.text = this.add
      .text(width / 2, height / 2, "SELECT YOUR HERO", {
        fontFamily: "retro2",
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.heroes = this.add.container(width / 2 - 61, height - 100);
    this.menu.add(this.heroes);
    this.createHeroChoice("hornet", 0, 4, 1);
    this.createHeroChoice("w-wing", 64, 2, 2);
    this.createHeroChoice("b-wing", 128, 2, 2);

    this.tweens.add({ targets: this.menu, alpha: 1, duration: 2000, ease: "Linear" });
    this.tweens.add({ targets: this.text, alpha: 1, duration: 2000, ease: "Linear" });

    this.cursorKeys = this.input.keyboard.createCursorKeys();
    this.enter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.space = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.selectedIndex = 1;
    this.applySelection();
  }

  createHeroChoice(key, x, frame, scale) {
    const sprite = this.add.sprite(x, 0, key, frame).setOrigin(0.5).setScale(scale);
    sprite.setInteractive({ useHandCursor: true });
    sprite.on("pointerdown", () => this.startGame(key));
    sprite.setData("hero", key);
    this.heroes.add(sprite);
  }

  applySelection() {
    this.heroes.each((sprite, index) => {
      sprite.setAlpha(index === this.selectedIndex ? 1 : 0.5);
    });
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.cursorKeys.left)) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.applySelection();
    } else if (Phaser.Input.Keyboard.JustDown(this.cursorKeys.right)) {
      this.selectedIndex = Math.min(2, this.selectedIndex + 1);
      this.applySelection();
    }

    if (Phaser.Input.Keyboard.JustDown(this.enter) || Phaser.Input.Keyboard.JustDown(this.space)) {
      const sprite = this.heroes.getAt(this.selectedIndex);
      this.startGame(sprite.getData("hero"));
    }
  }

  startGame(heroKey) {
    if (this.starting) {
      return;
    }
    this.starting = true;
    GameState.selectedHero = heroKey || HEROES.hornet.key;

    this.tweens.add({
      targets: this.menu,
      alpha: 0,
      duration: 2000,
      ease: "Linear",
      onComplete: () => {
        GameState.music?.stop();
        this.scene.start("Game");
      },
    });
    this.tweens.add({ targets: this.text, alpha: 0, duration: 2000, ease: "Linear" });
    if (GameState.music) {
      this.tweens.add({ targets: GameState.music, volume: 0, duration: 2000, ease: "Linear" });
    }
  }
}
