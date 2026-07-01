import Phaser from "phaser";

export function loadBootAssets(scene) {
  scene.load.image("title", "/assets/images/boot/title.gif");
  scene.load.image("loading", "/assets/images/boot/preloader_bar.png");
}

export function loadGameAssets(scene) {
  scene.load.audio("title_sound", [
    "/assets/audio/title/Pulsing_Sweep.ogg",
    "/assets/audio/title/Pulsing_Sweep.mp3",
  ]);
  scene.load.audio("game_over1", [
    "/assets/audio/title/SyntheticDesign.ogg",
    "/assets/audio/title/SyntheticDesign.mp3",
  ]);
  scene.load.audio("stage0", [
    "/assets/audio/stage/OverdriveSexMachine.ogg",
    "/assets/audio/stage/OverdriveSexMachine.mp3",
  ]);
  scene.load.audio("explosion2", [
    "/assets/audio/fx/dark_explosion.ogg",
    "/assets/audio/fx/dark_explosion.mp3",
  ]);
  scene.load.audio("boost", [
    "/assets/audio/fx/boost.ogg",
    "/assets/audio/fx/boost.mp3",
  ]);
  scene.load.audio("weapon5", [
    "/assets/audio/weapon/SynthZapImpact.ogg",
    "/assets/audio/weapon/SynthZapImpact.mp3",
  ]);
  scene.load.audio("thrust2", [
    "/assets/audio/ship/space-ship-engine-inside.ogg",
    "/assets/audio/ship/space-ship-engine-inside.mp3",
  ]);
  scene.load.audio("die", [
    "/assets/audio/ship/player_death.ogg",
    "/assets/audio/ship/player_death.mp3",
  ]);
  scene.load.audio("alarm", [
    "/assets/audio/ship/Alarm.ogg",
    "/assets/audio/ship/Alarm.mp3",
  ]);
  scene.load.audio("fall0", [
    "/assets/audio/ship/falling0-short.ogg",
    "/assets/audio/ship/falling0-short.mp3",
  ]);

  scene.load.image("energy", "/assets/images/ship/Energy.bmp");
  scene.load.image("fuel", "/assets/images/ship/Fuel.bmp");
  scene.load.image("ground", "/assets/images/ground/bkg0.bmp");
  scene.load.image("bush", "/assets/images/environment/bush.png");
  scene.load.spritesheet("w-wing", "/assets/images/ship/tyrian_ship_0.png", {
    frameWidth: 23.8,
    frameHeight: 25,
  });
  scene.load.spritesheet("b-wing", "/assets/images/ship/tyrian_ship_1.png", {
    frameWidth: 23.8,
    frameHeight: 25,
  });
  scene.load.spritesheet("hornet", "/assets/images/ship/plane-sheet.png", {
    frameWidth: 64,
    frameHeight: 64,
  });
  scene.load.image("hornet-shadow", "/assets/images/ship/plane-shadow.png");
  scene.load.image("fuel-boost", "/assets/images/boosts/Juice.bmp");
  scene.load.image("health-boost", "/assets/images/boosts/firstaid.png");
  scene.load.spritesheet("explode", "/assets/images/fx/explode1.png", {
    frameWidth: 128,
    frameHeight: 128,
  });
  scene.load.image("corona", "/assets/images/particles/blue.png");
  scene.load.image("white", "/assets/images/particles/white.png");
  scene.load.image("rock0", "/assets/images/baddies/Rock0.bmp");
  scene.load.image("rock1", "/assets/images/baddies/Rock1.bmp");
  scene.load.image("rock2", "/assets/images/baddies/Rock2.bmp");
  scene.load.image("rock3", "/assets/images/baddies/Rock3.bmp");
  scene.load.image("rock4", "/assets/images/baddies/Rock4.bmp");
  scene.load.image("weak-weapon", "/assets/images/weapons/weakweapon.png");
  scene.load.image("medium-weapon", "/assets/images/weapons/mediumweapon.png");
  scene.load.image("strong-weapon", "/assets/images/weapons/strongweapon.png");
  scene.load.spritesheet(
    "buttondiagonal",
    "/assets/images/buttons/big-button-diagonal.png",
    { frameWidth: 64, frameHeight: 64 },
  );
  scene.load.spritesheet(
    "buttonfire",
    "/assets/images/buttons/big-button-round.png",
    { frameWidth: 96, frameHeight: 96 },
  );
  scene.load.spritesheet("horizontal", "/assets/images/buttons/horizontal.png", {
    frameWidth: 96,
    frameHeight: 48,
  });
  scene.load.spritesheet("vertical", "/assets/images/buttons/vertical.png", {
    frameWidth: 48,
    frameHeight: 96,
  });
  scene.load.spritesheet("strife", "/assets/images/buttons/strife.png", {
    frameWidth: 96,
    frameHeight: 96,
  });
  scene.load.spritesheet("left-arrow", "/assets/images/buttons/left-arrow.png", {
    frameWidth: 48,
    frameHeight: 48,
  });
  scene.load.spritesheet(
    "right-arrow",
    "/assets/images/buttons/right-arrow.png",
    { frameWidth: 48, frameHeight: 48 },
  );
}
