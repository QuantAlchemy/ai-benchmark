import Phaser from "phaser";
import { ROCK_TYPES } from "../state.js";

export class RockGenerator {
  constructor(scene) {
    this.scene = scene;
    this.group = scene.physics.add.group();
    this.timer = null;
  }

  start() {
    this.timer = this.scene.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => this.spawn(),
    });
    return this;
  }

  spawn() {
    const type = Phaser.Utils.Array.GetRandom(ROCK_TYPES);
    const x = Phaser.Math.Between(0, this.scene.scale.width);
    const rock = this.group.get(x, 0, type.key);
    if (!rock) {
      return null;
    }

    rock.setActive(true);
    rock.setVisible(true);
    rock.setTexture(type.key);
    rock.setPosition(x, 0);
    rock.setDepth(25);
    rock.setData("mass", type.mass);
    rock.setTint(0xffffff);
    rock.body.enable = true;
    rock.body.reset(x, 0);
    rock.body.setAllowGravity(false);
    rock.body.setBounce(0);
    rock.body.setVelocity(0, Phaser.Math.Between(50, 200));
    rock.body.setSize(rock.width, rock.height, true);
    return rock;
  }

  kill(rock) {
    this.scene.spawnExplosion(rock.x, rock.y);
    this.scene.sound.play("explosion2", { volume: 1 });
    rock.body.stop();
    rock.body.enable = false;
    rock.setActive(false);
    rock.setVisible(false);
  }

  update() {
    this.group.children.each((rock) => {
      if (rock.active && rock.y > this.scene.scale.height + rock.displayHeight) {
        rock.body.stop();
        rock.body.enable = false;
        rock.setActive(false);
        rock.setVisible(false);
      }
    });
  }

  destroy() {
    if (this.timer) {
      this.timer.remove(false);
    }
    this.group.destroy(true);
  }
}
