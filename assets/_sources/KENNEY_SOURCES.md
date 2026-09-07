# LikaGame Space MVP — curated asset sources

Prepared on 2026-09-06. The `curated/` directory is a working selection; the
original archives and complete extracted packs are retained one level above in
`downloads/` and `unpacked/`.

All selected assets are by Kenney and are distributed under Creative Commons
Zero 1.0 (CC0-1.0). Commercial use and modification are permitted; attribution
is appreciated but not required. Copies of each pack's included license are in
`licenses/`.

## Sources

| Pack | Official page | Local archive | SHA-256 |
| --- | --- | --- | --- |
| Space Shooter Remastered | https://kenney.nl/assets/space-shooter-remastered | `../downloads/space-shooter-remastered.zip` | `0edbe0ab5cda6c44901d8c42f150268fdfa0c8d48492098669f37e9c296929b5` |
| Simple Space | https://kenney.nl/assets/simple-space | `../downloads/simple-space.zip` | `a599dc29e9f9718844cc93eb02db34b19553903edb2e79a59d8fc067e6775bac` |
| Planets | https://kenney.nl/assets/planets | `../downloads/planets.zip` | `289386e1cbc4a9a727654795b857c1f3f3447b170c7ba1ceeb9b007d1b84f683` |
| UI Pack — Sci-Fi | https://kenney.nl/assets/ui-pack-sci-fi | `../downloads/ui-pack-sci-fi.zip` | `4ae5a4949b71ba6c08bfb4d4708b3880915782f7deae7bc5872e1d56f0a668af` |
| Sci-Fi Sounds | https://kenney.nl/assets/sci-fi-sounds | `../downloads/sci-fi-sounds.zip` | `119340f351a5098ad814f78719438c0da355a9ce8a4c8a3af6a8d48aa3d49e04` |
| Alien UFO Pack | https://kenney.nl/assets/alien-ufo-pack | `../downloads/alien-ufo-pack.zip` | `4d4df7fbf768487d2cd9772b64a1059a94c9b54e0b3095869560f187bc1acaaa` |
| Physics Assets | https://kenney.nl/assets/physics-assets | `../downloads/physics-assets.zip` | `95949d1d9a733bf4b3f6312dc412013cd59184341c03ac284866499febcb67e8` |

Kenney's general licensing FAQ: https://kenney.nl/support

## Selection notes

- `backgrounds/`: tiled star field plus three 1280 px transparent planets.
- `map/`: route nodes and state markers from Simple Space; route lines should
  be drawn in CSS/SVG rather than baked into images.
- `characters/`: temporary story placeholders. Pik uses the same screen-robot
  silhouette in off, idle, and powered colors. Nima is composed from core,
  aura, and trail layers. These are not final character art.
- `tokens/`: four energy states and 1/2/3-length metal modules for mathematical
  manipulation.
- `ui/`: scalable decorative SVG skins. Keep labels, hit areas, focus states,
  and layout in HTML/CSS.
- `audio/`: selected OGG originals were converted to mono 44.1 kHz PCM WAV.
  Keep the WAV files for prototyping; encode production copies to a browser
  delivery format to reduce transfer size.

## Curated file inventory

```text
audio/action-error.wav
audio/action-success.wav
audio/engine-loop.wav
audio/scene-close.wav
audio/scene-open.wav
audio/token-drop.wav
audio/ui-tap.wav
backgrounds/planet-cloud-blue.png
backgrounds/planet-purple.png
backgrounds/planet-verdant.png
backgrounds/space-dark-purple-tile.png
characters/nima-aura-placeholder.png
characters/nima-core-placeholder.png
characters/nima-trail-placeholder.png
characters/pik-idle-placeholder.png
characters/pik-off-placeholder.png
characters/pik-pod-placeholder.png
characters/pik-powered-placeholder.png
fx/shield.png
fx/sparkle-1.png
fx/sparkle-2.png
fx/sparkle-3.png
licenses/alien-ufo-pack-CC0.txt
licenses/physics-assets-CC0.txt
licenses/planets-CC0.txt
licenses/sci-fi-sounds-CC0.txt
licenses/simple-space-CC0.txt
licenses/space-shooter-remastered-CC0.txt
licenses/ui-pack-sci-fi-CC0.txt
map/marker-alert.png
map/marker-bonus.png
map/marker-current.svg
map/marker-locked.png
map/node-player-ship.png
map/node-satellite.png
map/node-station-branch.png
map/node-station-core.png
tokens/energy-active.png
tokens/energy-blue.png
tokens/energy-correct.png
tokens/energy-error.png
tokens/module-1.png
tokens/module-2.png
tokens/module-3.png
tokens/reward-crystal.png
tokens/reward-star.png
ui/button-danger.svg
ui/button-neutral.svg
ui/button-primary.svg
ui/button-success.svg
ui/panel-glass.svg
ui/panel-solid.svg
ui/progress-fill.svg
ui/progress-track.svg
```
