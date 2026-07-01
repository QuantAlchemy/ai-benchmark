import Phaser from "phaser";
import { clamp, HEROES, once } from "../state.js";

export class Hero extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, heroKey) {
    const config = HEROES[heroKey];
    super(scene, x, y, config.key, config.stillFrame);
    this.heroKey = heroKey;
    this.config = config;
    this.weapon = null;
    this.baseTint = 0xffffff;
    this.maxHealth = 100;
    this.health = 100;
    this.maxFuel = 100;
    this.fuel = 100;
    this.speed = 100;
    this.fuelCost = { idle: 0.01, move: 0.05 };
    this.isDying = false;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(50);
    this.setOrigin(0.5);
    this.setScale(config.scale);
    this.body.setMaxVelocity(200, 200);
    this.body.setDrag(200, 200);
    this.body.setCollideWorldBounds(true);
    this.body.setAllowGravity(false);
    this.body.setSize(this.width, this.height, true);

    this.createAnimations();
    this.createShadow();
    this.sound = {
      thrust: scene.sound.add("thrust2", { volume: 1, loop: true }),
      fall: scene.sound.add("fall0", { volume: 1 }),
      alarm: scene.sound.add("alarm", { volume: 1 }),
      die: scene.sound.add("die", { volume: 1 }),
    };
    this.sound.thrust.play();

    this.fallOnce = once(this.fall, this);
    this.killOnce = once(() => {
      if (this.fuel <= 0) {
        this.fallOnce(this.finalKill);
      } else {
        this.finalKill();
      }
      return this;
    }, this);
  }

  createAnimations() {
    const { key, leftFrames, rightFrames, noFuelLeftFrames, noFuelRightFrames } = this.config;
    this.createAnimation(`${key}-left`, key, leftFrames);
    this.createAnimation(`${key}-right`, key, rightFrames);
    if (noFuelLeftFrames && !this.scene.anims.exists(`${key}-no-fuel-left`)) {
      this.anims.create({
        key: `${key}-no-fuel-left`,
        frames: noFuelLeftFrames.map((frame) => ({ key, frame })),
        frameRate: 3,
        repeat: 0,
      });
      this.anims.create({
        key: `${key}-no-fuel-right`,
        frames: noFuelRightFrames.map((frame) => ({ key, frame })),
        frameRate: 3,
        repeat: 0,
      });
    }
  }

  createAnimation(animationKey, textureKey, frames) {
    if (this.scene.anims.exists(animationKey)) {
      return;
    }
    this.anims.create({
      key: animationKey,
      frames: frames.map((frame) => ({ key: textureKey, frame })),
      frameRate: 3,
      repeat: 0,
    });
  }

  createShadow() {
    if (this.config.shadowKey) {
      this.shadow = this.scene.add.image(this.x, this.y, this.config.shadowKey);
      this.shadow.setOrigin(0.5);
    } else {
      this.shadow = this.scene.add.sprite(this.x, this.y, this.config.key, this.config.stillFrame);
      this.shadow.setOrigin(0.5);
      this.shadow.setTint(0x000000);
      this.shadow.setAlpha(0.3);
      this.shadow.setScale(this.config.scale * 0.75);
    }
    this.shadow.setDepth(45);
  }

  setWeapon(generator) {
    this.weapon = generator;
  }

  addFuel(amount) {
    this.fuel = clamp(this.fuel + amount, 0, this.maxFuel);
  }

  addHealth(amount) {
    this.health = clamp(this.health + amount, 0, this.maxHealth);
  }

  flash() {
    this.setTint(0xff0000);
    this.scene.time.delayedCall(100, () => {
      if (this.active) {
        this.setTint(this.baseTint);
      }
    });
  }

  collide() {
    this.flash();
  }

  kill() {
    return this.killOnce();
  }

  fall(callback) {
    const step = 0.1 * this.scaleX;
    this.sound.alarm.play();
    this.sound.fall.play();
    this.flash();
    const timer = this.scene.time.addEvent({
      delay: 250,
      loop: true,
      callback: () => {
        if (this.scaleY <= step) {
          timer.remove(false);
          this.sound.alarm.stop();
          callback.call(this);
          return;
        }
        this.setScale(this.scaleX - step, this.scaleY - step);
        this.shadow.setScale(this.shadow.scaleX - step, this.shadow.scaleY - step);
        this.flash();
      },
    });
  }

  finalKill() {
    if (this.isDying) {
      return;
    }
    this.isDying = true;
    this.setVisible(false);
    this.body.enable = false;
    this.shadow.setVisible(false);
    this.sound.thrust.stop();
    this.sound.die.play();
    const explosion = this.scene.spawnExplosion(this.x, this.y);
    explosion.once("animationcomplete", () => {
      this.setActive(false);
      this.shadow.setActive(false);
      this.emit("dead");
    });
  }

  playTurnAnimation(direction) {
    const suffix =
      this.fuel <= 0 && this.config.noFuelLeftFrames ? `no-fuel-${direction}` : direction;
    this.play(`${this.config.key}-${suffix}`, true);
  }

  update(delta) {
    if (!this.active || this.isDying) {
      return;
    }

    const input = this.scene.controls;
    const factor = delta / 16.6667;
    let moving = false;

    if (input.left.isDown) {
      this.body.velocity.x += -this.speed;
      this.playTurnAnimation("left");
      moving = true;
    } else if (input.right.isDown) {
      this.body.velocity.x += this.speed;
      this.playTurnAnimation("right");
      moving = true;
    }

    if (input.up.isDown) {
      this.body.velocity.y += -this.speed;
      moving = true;
    } else if (input.down.isDown) {
      this.body.velocity.y += this.speed;
      moving = true;
    }

    if (!input.left.isDown && !input.right.isDown) {
      if ((input.up.isDown || input.down.isDown) && this.fuel > 0) {
        this.setFrame(this.config.defaultFrame);
      } else {
        this.setFrame(this.config.stillFrame);
      }
      this.anims.stop();
    }

    this.updateShadow();

    if (this.weapon && this.fuel > 0 && this.health > 0 && input.fire.isDown) {
      this.weapon.attack(this.x, this.y - 32);
    }

    this.fuel -= (moving ? this.fuelCost.move : this.fuelCost.idle) * factor;
  }

  updateShadow() {
    if (this.config.shadowKey) {
      this.shadow.setPosition(this.x, this.y);
    } else {
      this.shadow.setPosition(this.body.x, this.body.y);
    }
  }

  destroy(fromScene) {
    Object.values(this.sound || {}).forEach((sound) => sound.destroy());
    this.shadow?.destroy();
    super.destroy(fromScene);
  }
}
