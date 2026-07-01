import Phaser from "phaser";
import { BoostGenerator } from "../entities/Boosts.js";
import { Hero } from "../entities/Hero.js";
import { RockGenerator } from "../entities/Rocks.js";
import { WeaponGenerator } from "../entities/WeaponGenerator.js";
import { GameState } from "../state.js";

export class GameScene extends Phaser.Scene {
  constructor() {
    super("Game");
  }

  create() {
    const { width, height } = this.scale;
    GameState.score = 0;
    this.gameEnding = false;

    GameState.music = this.sound.add("stage0", { volume: 0, loop: true });
    GameState.music.play();
    this.tweens.add({ targets: GameState.music, volume: 1, duration: 500, ease: "Linear" });

    this.ground = this.add.tileSprite(0, 0, width, height, "ground").setOrigin(0);
    this.environment = this.physics.add.group();
    this.time.addEvent({ delay: 2000, loop: true, callback: () => this.spawnBush() });

    this.energyBar = this.add.image(0, height, "energy").setOrigin(0, 1).setDepth(80);
    this.energyBar.setDisplaySize(this.energyBar.width, height);
    this.fuelBar = this.add.image(width, height, "fuel").setOrigin(1, 1).setDepth(80);
    this.fuelBar.setDisplaySize(this.fuelBar.width, height);
    this.scoreText = this.add
      .text(16, 16, "Score: 0", {
        fontFamily: "retro2",
        fontSize: "16px",
        color: "#ffffff",
      })
      .setShadow(5, 5, "rgba(0,0,0,0.5)", 7)
      .setDepth(90);

    this.controls = this.createControls();
    this.weakWeapon = new WeaponGenerator(this, "weak");
    this.mediumWeapon = new WeaponGenerator(this, "medium");
    this.strongWeapon = new WeaponGenerator(this, "strong");

    this.player = new Hero(this, width / 2, height / 2 + 200, GameState.selectedHero);
    this.player.setWeapon(this.weakWeapon);
    this.player.once("dead", () => this.gameOver());

    this.fuelBoosts = new BoostGenerator(this, "fuel");
    this.healthBoosts = new BoostGenerator(this, "health");
    this.mediumWeaponBoosts = new BoostGenerator(this, "medium");
    this.strongWeaponBoosts = new BoostGenerator(this, "strong");
    this.rocks = new RockGenerator(this).start();

    this.physics.add.collider(this.player, this.rocks.group, this.rockCollision, null, this);
    this.physics.add.overlap(this.player, this.fuelBoosts.group, this.collectFuel, null, this);
    this.physics.add.overlap(this.player, this.healthBoosts.group, this.collectHealth, null, this);
    this.physics.add.overlap(this.player, this.mediumWeaponBoosts.group, this.collectWeapon, null, this);
    this.physics.add.overlap(this.player, this.strongWeaponBoosts.group, this.collectWeapon, null, this);
    this.physics.add.overlap(this.weakWeapon.group, this.rocks.group, this.weaponRockCollision, null, this);
    this.physics.add.overlap(this.mediumWeapon.group, this.rocks.group, this.weaponRockCollision, null, this);
    this.physics.add.overlap(this.strongWeapon.group, this.rocks.group, this.weaponRockCollision, null, this);

    this.scoreTimer = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        if (this.player.health > 0 && this.player.fuel > 0) {
          GameState.score += 1;
          this.scoreText.setText(`Score: ${GameState.score}`);
        }
      },
    });
  }

  createControls() {
    const cursors = this.input.keyboard.createCursorKeys();
    const wasd = this.input.keyboard.addKeys("W,A,S,D");
    this.virtualControls = {
      left: false,
      right: false,
      up: false,
      down: false,
      fire: false,
    };
    this.createTouchControls();
    return {
      left: this.makeCompositeKey(cursors.left, wasd.A, this.virtualKey("left")),
      right: this.makeCompositeKey(cursors.right, wasd.D, this.virtualKey("right")),
      up: this.makeCompositeKey(cursors.up, wasd.W, this.virtualKey("up")),
      down: this.makeCompositeKey(cursors.down, wasd.S, this.virtualKey("down")),
      fire: this.makeCompositeKey(cursors.space, this.virtualKey("fire")),
    };
  }

  virtualKey(name) {
    return {
      get isDown() {
        return this.source[name];
      },
      source: this.virtualControls,
    };
  }

  makeCompositeKey(...keys) {
    return {
      get isDown() {
        return keys.some((key) => key?.isDown);
      },
    };
  }

  createTouchControls() {
    if (this.sys.game.device.os.desktop) {
      return;
    }

    const { width, height } = this.scale;
    const leftGroup = this.add.container(10, height / 2 - 10).setDepth(100).setScale(0.5);
    const rightGroup = this.add.container(width / 2 - 42, height / 2 - 10).setDepth(100).setScale(0.5);
    const o = 48;
    const p = o;
    const q = height - 2 * o;
    const r = 2 * o;
    const s = q - o;

    leftGroup.add(this.makeTouchButton(p, q, "horizontal", ["left"], 1));
    leftGroup.add(this.makeTouchButton(p + 96, q, "horizontal", ["right"], 1));
    leftGroup.add(this.makeTouchButton(r, s, "vertical", ["up"], 1));
    leftGroup.add(this.makeTouchButton(r, s + 96, "vertical", ["down"], 1));
    leftGroup.add(this.makeTouchButton(0.75 * o, q - 1.25 * o, "buttondiagonal", ["left", "up"], 2));
    leftGroup.add(this.makeTouchButton(3.25 * o, q - 1.25 * o, "buttondiagonal", ["right", "up"], 3));
    leftGroup.add(this.makeTouchButton(0.75 * o, q + 1.25 * o, "buttondiagonal", ["left", "down"], 6));
    leftGroup.add(this.makeTouchButton(3.25 * o, q + 1.25 * o, "buttondiagonal", ["right", "down"], 7));
    leftGroup.add(this.makeTouchButton(p + o / 2, q - o / 2, "buttonfire", [], 0).setOrigin(0.25));
    rightGroup.add(this.makeTouchButton(width, q, "buttonfire", ["fire"], 1));
  }

  makeTouchButton(x, y, key, flags, frame) {
    const button = this.add.sprite(x, y, key, frame).setOrigin(0.5).setInteractive();
    const press = () => flags.forEach((flag) => (this.virtualControls[flag] = true));
    const release = () => flags.forEach((flag) => (this.virtualControls[flag] = false));
    button.on("pointerdown", press);
    button.on("pointerover", press);
    button.on("pointerup", release);
    button.on("pointerout", release);
    return button;
  }

  spawnBush() {
    const x = Phaser.Math.Between(0, this.scale.width);
    const bush = this.environment.get(x, -50, "bush");
    bush.setActive(true);
    bush.setVisible(true);
    bush.setPosition(x, -50);
    bush.setDepth(10);
    bush.body.enable = true;
    bush.body.reset(x, -50);
    bush.body.setAllowGravity(false);
    bush.body.setVelocity(0, 50);
  }

  spawnExplosion(x, y) {
    const explosion = this.add.sprite(x, y, "explode").setOrigin(0.5).setDepth(70);
    explosion.play("explosion");
    explosion.once("animationcomplete", () => explosion.destroy());
    return explosion;
  }

  collectFuel(player, boost) {
    player.addFuel(boost.getData("boost"));
    this.fuelBoosts.collect(boost);
  }

  collectHealth(player, boost) {
    player.addHealth(boost.getData("boost"));
    this.healthBoosts.collect(boost);
  }

  collectWeapon(player, boost) {
    const type = boost.getData("boost");
    if (type === "strong") {
      player.setWeapon(this.strongWeapon);
      this.strongWeaponBoosts.collect(boost);
    } else if (type === "medium") {
      player.setWeapon(this.mediumWeapon);
      this.mediumWeaponBoosts.collect(boost);
    }
  }

  rockCollision(player, rock) {
    player.health -= 2 * rock.getData("mass");
    this.rocks.kill(rock);
    player.collide();
  }

  weaponRockCollision(shot, rock) {
    this.rocks.kill(rock);
    this.weakWeapon.kill(shot);
    this.mediumWeapon.kill(shot);
    this.strongWeapon.kill(shot);
    this.fuelBoosts.spawn(rock.x, rock.y);
    this.healthBoosts.spawn(rock.x, rock.y);
    this.mediumWeaponBoosts.spawn(rock.x, rock.y);
    this.strongWeaponBoosts.spawn(rock.x, rock.y);
  }

  update(_time, delta) {
    this.ground.tilePositionY -= (50 * delta) / 1000;
    this.player.update(delta);
    this.weakWeapon.update();
    this.mediumWeapon.update();
    this.strongWeapon.update();
    this.rocks.update();
    this.fuelBoosts.update();
    this.healthBoosts.update();
    this.mediumWeaponBoosts.update();
    this.strongWeaponBoosts.update();
    this.cleanupEnvironment();
    this.updateBars();

    if ((this.player.fuel <= 0 || this.player.health <= 0) && this.player.active) {
      this.player.kill();
    }
  }

  cleanupEnvironment() {
    this.environment.children.each((bush) => {
      if (bush.active && bush.y > this.scale.height + bush.displayHeight) {
        bush.body.stop();
        bush.body.enable = false;
        bush.setActive(false);
        bush.setVisible(false);
      }
    });
  }

  updateBars() {
    const height = this.scale.height;
    this.energyBar.setDisplaySize(
      this.energyBar.width,
      height * Math.max(0, this.player.health / this.player.maxHealth),
    );
    this.fuelBar.setDisplaySize(
      this.fuelBar.width,
      height * Math.max(0, this.player.fuel / this.player.maxFuel),
    );
  }

  gameOver() {
    if (this.gameEnding) {
      return;
    }
    this.gameEnding = true;
    this.tweens.add({
      targets: GameState.music,
      volume: 0,
      duration: 2000,
      ease: "Linear",
      onComplete: () => {
        GameState.music?.stop();
        this.scene.start("GameOver");
      },
    });
  }

  shutdown() {
    GameState.music?.stop();
  }
}
