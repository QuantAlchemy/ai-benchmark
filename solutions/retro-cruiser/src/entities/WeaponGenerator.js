import Phaser from "phaser";
import { WEAPONS } from "../state.js";

export class WeaponGenerator {
  constructor(scene, type) {
    this.scene = scene;
    this.type = type;
    this.config = WEAPONS[type];
    this.fireRate = this.config.fireRate;
    this.fireTime = 0;
    this.group = scene.physics.add.group();
  }

  attack(x, y) {
    const now = this.scene.time.now;
    if (now <= this.fireTime + this.fireRate) {
      return null;
    }

    this.fireTime = now + this.fireRate;
    const shot = this.group.get(x, y, this.config.key);
    if (!shot) {
      return null;
    }

    shot.setActive(true);
    shot.setVisible(true);
    shot.setPosition(x, y);
    shot.setTexture(this.config.key);
    shot.setData("damage", this.config.damage);
    shot.setDepth(40);
    shot.setAngle(0);
    shot.setScale(1);
    shot.body.enable = true;
    shot.body.reset(x, y);
    shot.body.setVelocity(0, this.config.velocityY);
    shot.body.setAllowGravity(false);
    shot.body.setCollideWorldBounds(false);
    shot.body.setSize(shot.width, shot.height, true);
    shot.setData("expiresAt", now + this.config.lifespan);

    this.scene.sound.play("weapon5", { volume: 1 });
    return shot;
  }

  update() {
    const now = this.scene.time.now;
    this.group.children.each((shot) => {
      if (!shot.active) {
        return;
      }
      if (shot.y < -shot.displayHeight || now > shot.getData("expiresAt")) {
        this.kill(shot);
      }
    });
  }

  kill(shot) {
    shot.body.stop();
    shot.body.enable = false;
    shot.setActive(false);
    shot.setVisible(false);
  }

  destroy() {
    this.group.destroy(true);
  }
}
