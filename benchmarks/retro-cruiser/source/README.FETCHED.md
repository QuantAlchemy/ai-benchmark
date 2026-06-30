# Original deployed bundle (fetched, do not edit)

Materialized by `bench setup retro-cruiser` from a pinned commit.
Treat as **read-only reference input**.

- `index.html`      — the page that boots the game.
- `index.min.js`    — the ENTIRE game, minified, with Phaser 2.0.7 bundled in (~720KB).
                      This is the only "source" that survives — reverse-engineer it.
- `phaser.map`      — source map for the Phaser portion (helps identify the engine).
- `css/`            — page styling.
- `assets/`         — original images, audio (multiple formats), and fonts. Reuse these.

The modern rebuild goes in `../../../solutions/retro-cruiser/`, not here.
