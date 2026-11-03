# ShadowStrike Web

An original third-person battle-royale-style browser game: you vs 49 bots on a big multi-town map.

- Original art, names, and map only. Not Free Fire, COD, or any commercial game, and not affiliated with any publisher.
- Browser WebGL2 (Three.js r160) pushed as far as this build safely allows: PBR materials with procedural roughness/bump maps, detailed building facades (brick/concrete, windows, baked door, rooftop AC/water-tank props), grass/dirt ground with blade detail, asphalt roads with markings, textured bark/foliage/rocks, fuller trees, gradient sky + sun + clouds, hemisphere + sun soft shadows, fog matched to sky, ACES tone mapping, contact shadows under characters, muzzle flash, hit sparks and impact dust, detailed characters (helmet, visor, backpack, shoulder pads, arms/legs/boots, detailed gun).
- Quality selector actually changes rendering: Performance = phone-safe (no shadows, no bloom, no contact shadows/clouds), Balanced = recommended phone (512 textures, 1024 shadows, clouds + contact shadows, no bloom), High = desktop (2048 shadows, bloom-style glow + vignette), Ultra = max browser quality (4096 shadows, stronger bloom, may be slow on phones).
- Post-processing: bloom-style bright-pass glow + vignette on High/Ultra only, implemented with render targets in WebGL2. No SSAO pass: a depth-based SSAO pass was not added because it risks blotchy artefacts without a live visual test and would hurt phone performance; contact shadows and baked shading are used instead.
- WebGPU: investigated and NOT bundled. The vendored Three.js is r160, whose WebGPU renderer is a separate node-material API, not the classic materials/lights/shadows this game uses — porting to it would require rewriting all materials and would still fall back to WebGL2 on most Android phone browsers, including Surya's. WebGL2 is therefore the supported path in this build; no WebGPU feature is claimed.
- Landscape mode on phones: a full-screen "Rotate your phone" overlay blocks play in portrait on touch devices, and Full screen / Drop In attempt screen.orientation.lock('landscape') with a silent fallback.
- No proprietary upscaling and no ray tracing — those do not exist in browser WebGL. This is upgraded WebGL, not AAA COD-level graphics: models are still original low-poly models, and phone GPUs limit texture/shadow detail.
- No real multiplayer in this version: the other 49 players are bots. Real human multiplayer needs a live server, matchmaking, and accounts, which static GitHub Pages cannot provide.

## Controls

- Desktop: WASD move, mouse aim, click/hold shoot, Space jump, Shift sprint, C crouch, R reload, Q weapon switch, F medkit, right-mouse hold to aim.
- Mobile: left joystick, drag right side to aim, FIRE, JUMP, CROUCH, RELOAD, WEAPON, AIM, MEDKIT buttons, plus Full screen.

## Performance notes

Geometries and materials are reused, trees/rocks use instanced meshes, bot AI is staggered (12 bots per frame), and bots/pickups beyond draw distance are hidden while simulation continues. Graphics quality caps pixel ratio.
