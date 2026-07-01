# Retro Cruiser

Modern rebuild of the lost Phaser 2.0.7 game from the surviving minified deployment bundle.

## Stack

- Phaser 3
- Vite
- Plain JavaScript ES modules
- Static build output in `dist/`

## Run

```sh
npm install
npm run dev
```

Build and preview the static site:

```sh
npm run build
npm run preview
```

## Reverse-engineering notes

The useful game code starts near the end of `benchmarks/retro-cruiser/source/index.min.js`; most of the bundle is Phaser 2.0.7. The source map only covers `phaser.js`, so gameplay was recovered by locating `BasicGame.*` definitions and asset keys in the minified tail.

Recovered behavior implemented here:

- Boot/title preload flow with `title.gif`, `preloader_bar.png`, and `Pulsing_Sweep`.
- Hero select screen with the three original ships: Hornet, W-Wing, and B-Wing.
- Endless single stage with scrolling `bkg0.bmp`, bush scenery, side energy/fuel bars, and `OverdriveSexMachine` music.
- Arrow-key movement, spacebar fire, acceleration/drag/max-speed style movement, continuous fuel drain, and fuel-out falling death.
- Original weapon values: weak/medium/strong projectile art, fire-rate timings, 1500ms projectile lifespan, and one-shot rock destruction.
- Rock spawning every 500ms, random rock type, vertical speed 50-200, and mass-based collision damage.
- Original pickup chances on destroyed rocks: fuel 20%, health 10%, medium weapon 7%, strong weapon 3%.
- Score increments by 1 every 0.1 seconds while the player has health and fuel.
- Game-over screen, high-score storage in `localStorage`, restart on input, and original game-over music.
- Original art, font, and audio files are reused from the surviving asset set.

## Known approximations

- Phaser 3 Arcade Physics is not numerically identical to Phaser 2 Arcade Physics, but the recovered constants and update logic are kept close to the original.
- Mobile touch controls are not drawn as the original virtual gamepad; desktop keyboard play is the primary target for this rebuild.
- Browser autoplay policies may delay music until the first user gesture, which differs from old-browser behavior.
- The original bundle included unused assets and classes are not visible beyond the minified output. This rebuild implements the mechanics that the deployed game code actually wires into the active scenes.
