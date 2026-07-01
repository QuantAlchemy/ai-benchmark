import Phaser from "phaser";
import { BOOST_TYPES } from "../state.js";

export class BoostGenerator {
  constructor(scene, type) {
    this.scene = scene;
    this.type = type;
    this.config = BOOST_TYPES[type];
    this.group = scene.physics.add.group();
  }

  spawn(x, y) {
    if (Phaser.Math.Between(0, 99) >= this.config.chance) {
      return null;
    }

    const boost = this.group.get(x, y, this.config.key);
    if (!boost) {
      return null;
    }

    boost.setActive(true);
    boost.setVisible(true);
    boost.setTexture(this.config.key);
    boost.setPosition(x, y);
    boost.setDepth(30);
    boost.setScale(this.config.scale || 1);
    boost.setData("boost", this.config.boost);
    boost.setData("type", this.type);
    boost.body.enable = true;
    boost.body.reset(x, y);
    boost.body.setAllowGravity(false);
    boost.body.setVelocity(Phaser.Math.Between(-50, 50), Phaser.Math.Between(20, 100));
    boost.body.setSize(boost.width, boost.height, true);
    return boost;
  }

  collect(boost) {
    this.scene.sound.play("boost", { volume: 1 });
    this.kill(boost);
  }

  update() {
    this.group.children.each((boost) => {
      if (boost.active && boost.y > this.scene.scale.height + boost.displayHeight) {
        this.kill(boost);
      }
    });
  }

  kill(boost) {
    boost.body.stop();
    boost.body.enable = false;
    boost.setActive(false);
    boost.setVisible(false);
  }

  destroy() {
    this.group.destroy(true);
  }
}
