import Phaser from "phaser";
import { GameState } from "../state.js";

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super("GameOver");
  }

  create() {
    const { width, height } = this.scale;
    GameState.music = this.sound.add("game_over1", { volume: 1, loop: true });
    GameState.music.play();

    this.group = this.add.container(0, 0);
    const title = this.add
      .text(width / 2, 50, "Game Over", {
        fontFamily: "retro2",
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0.5, 0);
    this.group.add(title);

    const current = this.add
      .text(width / 2, 100, "", {
        fontFamily: "retro2",
        fontSize: "12px",
        color: "#3AB2F7",
        align: "center",
      })
      .setOrigin(0.5, 0);
    const scores = this.add
      .text(width / 2, 150, "", {
        fontFamily: "retro2",
        fontSize: "12px",
        color: "#ffffff",
        align: "left",
      })
      .setOrigin(0.5, 0);
    this.group.add([current, scores]);
    this.showScores(current, scores);
    this.group.setAlpha(0);
    this.tweens.add({ targets: this.group, alpha: 1, duration: 2000, ease: "Linear" });

    this.particles = this.add.particles(0, 0, "corona", {
      x: { min: 0, max: width },
      y: height,
      speedY: { min: -30, max: -5 },
      lifespan: 5000,
      frequency: 50,
      alpha: { start: 0.8, end: 0.3 },
      scale: { start: 0.5, end: 1 },
      rotate: 0,
      quantity: 1,
    });
    this.group.add(this.particles);

    this.input.once("pointerdown", () => this.startMenu());
    this.input.keyboard.once("keydown", () => this.startMenu());
  }

  showScores(currentText, scoreText) {
    const entry = { date: new Date(), value: GameState.score };
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem("scores") || "[]");
    } catch (_error) {
      saved = [];
    }

    saved = saved.concat(entry).sort((a, b) => b.value - a.value);
    const best = saved.reduce((score, item) => Math.max(score, item.value), 0);
    const isHighScore = entry.value >= best;
    const lines = saved.map((item, index) => {
      const date = new Date(item.date).toLocaleString();
      return `${index + 1}. ${date} -----> ${item.value}`;
    });

    currentText.setText(
      isHighScore ? `NEW HIGH SCORE!!!\nYOUR SCORE: ${entry.value}` : `YOUR SCORE: ${entry.value}`,
    );
    scoreText.setText(lines.join("\n"));

    try {
      localStorage.setItem("scores", JSON.stringify(saved.slice(0, 9)));
    } catch (_error) {
      scoreText.setText("Unable to save scores. Try a newer browser");
    }
  }

  startMenu() {
    if (this.leaving) {
      return;
    }
    this.leaving = true;
    this.tweens.add({
      targets: this.group,
      alpha: 0,
      duration: 2000,
      ease: "Linear",
      onComplete: () => {
        GameState.music?.stop();
        GameState.score = 0;
        GameState.music = this.sound.add("title_sound", { volume: 1, loop: true });
        GameState.music.play();
        this.scene.start("MainMenu");
      },
    });
    this.tweens.add({ targets: GameState.music, volume: 0, duration: 2000, ease: "Linear" });
  }
}
