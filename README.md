# STARWING — Rail Strike

A rail shooter in vanilla JS + Three.js (WebGL). Pilot a fighter along a
generated rail through enemy territory: weave traffic, boost, somersault, and
fire lasers, smart bombs, and lock-on homing charge orbs at waves of enemies
and a boss. Two levels ship in the box: **CORALLIA** and **SHATTERBELT**.

## Running

The game is plain ES modules — it must be served over `http(s)`. Opening
`index.html` via `file://` will fail: browsers treat each `file:` URL as a
unique origin and block cross-origin module loads.

```sh
python3 -m http.server 8123
# → open http://localhost:8123
```

There is no build step and nothing to install: Three.js r160 is vendored in
`vendor/three/` and the importmap in `index.html` maps `three` /
`three/addons/` to those local files, so the game runs fully offline.

## Controls

| Action | Default |
| --- | --- |
| Move | `W A S D` |
| Fire (tap) / Charge (hold) | `Space` |
| Boost | `Left Shift` |
| Brake | `Left Ctrl` |
| Somersault (invulnerable barrel roll) | `Q` |
| Bomb (smart) | `E` |
| Pause | `Esc` |
| Menus | Arrows + `Enter` / `Esc` |

Hold `Space` to charge: the ship locks onto the nearest targetable enemy and
releasing at full charge fires a homing charge orb (early release fires a
laser). Bindings are rebindable in the pause menu. Gamepad (standard
mapping) and touch controls are supported; quality setting and bindings
persist in `localStorage`.

## Project layout

```
index.html            page shell, importmap (local three), error hook
src/
  main.js             boot, world object, fixed-timestep loop (60 Hz sim)
  engine/             renderer (post chain), input, audio, fx, collision, pool
  game/               player, rail, terrain, sky, hud, boss, wingmen,
                      pickups, projectiles, enemies/, levels/
  ui/screens.js       title / briefing / results / game-over / pause screens
vendor/three/         vendored Three.js r160 (core + postprocessing addons)
test-headless.sh      headless Chrome smoke test
.probe-rt.html        probe: logs state / game time / fps every second
.laser-check.html     probe: regression check for pooled-mesh rendering
```

Rendering chain: RenderPass → UnrealBloom → chromatic aberration → FXAA →
OutputPass (ACES + sRGB), with adaptive quality that steps down bloom,
shadows, pixel ratio, and particles when the frame-time average exceeds
budget.

## Testing

Headless smoke test (needs Google Chrome and the server on `:8123`):

```sh
./test-headless.sh            # 30 s run, exits 0 on PASS / 1 on FAIL
DURATION=60 ./test-headless.sh
URL="http://localhost:8123/.probe-rt.html" ./test-headless.sh
```

The script launches the game with `?autostart=1`, then checks the console
log for `UNCAUGHT_ERR` and verifies the game actually started (audio init
marker). It deliberately kills the browser after the run instead of waiting
for a clean exit — see the notes in the script header: `--virtual-time-budget`
freezes this rAF-driven game loop (rAF timestamps stop tracking virtual
time), and the browser's own shutdown can stall on background network
activity.

The probe pages are useful for deeper checks: `.probe-rt.html` reports
`state` / game time / fps every second (game time should advance ~0.7× real
time under SwiftShader), and `.laser-check.html` verifies that pooled meshes
(lasers, orbs, rings) are parented to the scene and produce rendered pixels
while firing.
