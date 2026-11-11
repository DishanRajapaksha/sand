# Sand

Real-feeling sand on your phone screen. Tilt the phone and it slides, jerk it and it lags behind, drag a finger and it plows a channel, flip the phone face-down and it falls off.

Open it on a phone: **https://av.github.io/safe-sand/**. For true fullscreen, use Share → Add to Home Screen (iOS) or Install app (Android). On iOS, tap "Pour it" and allow motion access.

## How it works

- About 100k–460k individual grains are simulated on the GPU (WebGL2) in real units (millimetres, 9.81 m/s²), so how fast sand moves and how much it lags matches the real thing.
- Each grain has its own size, mineral colour, and friction. Isolated grains roll and skitter, while bulk sand sticks until the tilt passes its angle of repose.
- A height field built from the grains every frame gives piles their slope forces, self-shadowing, and ambient occlusion.
- The light direction follows the phone's tilt, so shadows lengthen and quartz grains glint as you move it.
- Granular audio is synthesised from how much sand is actually moving.

## Develop

No build step. Serve the folder over HTTP:

```sh
python3 -m http.server 8000
```

Desktop controls: drag with the mouse to push sand, use the arrow keys or WASD to tilt, and hold Space to shake.

Query parameters: `sand=river|beach|desert|volcanic|coral`, `screen=light|lock|dark`, `n=<grain cap>`, `density=<grains per mm²>`, `ppi=<css px per inch>`, `seed=<n>`, `test` (manual stepping via `window.sand`).
