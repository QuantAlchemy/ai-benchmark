export const GameState = {
  score: 0,
  music: null,
  selectedHero: "hornet",
};

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function once(fn, context) {
  let result;
  return (...args) => {
    if (fn) {
      result = fn.apply(context, args);
      fn = null;
    }
    return result;
  };
}

export const HEROES = {
  hornet: {
    key: "hornet",
    label: "HORNET",
    scale: 1,
    defaultFrame: 5,
    stillFrame: 4,
    leftFrames: [3, 1],
    rightFrames: [7, 9],
    noFuelLeftFrames: [2, 0],
    noFuelRightFrames: [6, 8],
    shadowKey: "hornet-shadow",
  },
  "w-wing": {
    key: "w-wing",
    label: "W-WING",
    scale: 2,
    defaultFrame: 2,
    stillFrame: 2,
    leftFrames: [1, 0],
    rightFrames: [3, 4],
  },
  "b-wing": {
    key: "b-wing",
    label: "B-WING",
    scale: 2,
    defaultFrame: 2,
    stillFrame: 2,
    leftFrames: [1, 0],
    rightFrames: [3, 4],
  },
};

export const WEAPONS = {
  weak: {
    key: "weak-weapon",
    damage: 5,
    fireRate: 50,
    velocityY: -400,
    lifespan: 1500,
  },
  medium: {
    key: "medium-weapon",
    damage: 10,
    fireRate: 100,
    velocityY: -400,
    lifespan: 1500,
  },
  strong: {
    key: "strong-weapon",
    damage: 20,
    fireRate: 125,
    velocityY: -400,
    lifespan: 1500,
  },
};

export const ROCK_TYPES = [
  { key: "rock4", mass: 2 },
  { key: "rock3", mass: 2 },
  { key: "rock2", mass: 3 },
  { key: "rock1", mass: 3 },
  { key: "rock0", mass: 5 },
];

export const BOOST_TYPES = {
  fuel: {
    key: "fuel-boost",
    boost: 5,
    chance: 20,
  },
  health: {
    key: "health-boost",
    boost: 10,
    chance: 10,
  },
  medium: {
    key: "medium-weapon",
    boost: "medium",
    chance: 7,
    scale: 0.5,
  },
  strong: {
    key: "strong-weapon",
    boost: "strong",
    chance: 3,
    scale: 0.4,
  },
};
