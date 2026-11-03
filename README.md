# ShadowStrike Web

An original third-person battle-royale-style browser game: you vs 49 bots on a big multi-town map.

- Original art, names, and map only. Not Free Fire, COD, or any commercial game, and not affiliated with any publisher.
- Browser WebGL (Three.js) with upgraded realistic-style graphics: procedural building facades (brick/concrete, windows), grass/dirt ground variation, asphalt roads with markings, textured bark/foliage/rocks, gradient sky, hemisphere + sun shadows, fog matched to sky, ACES tone mapping, muzzle flash and hit sparks, detailed characters (helmet, vest, arms/legs, detailed gun).
- Landscape mode on phones: a full-screen "Rotate your phone" overlay blocks play in portrait on touch devices, and Full screen / Drop In attempt screen.orientation.lock('landscape') with a silent fallback.
- No proprietary upscaling and no ray tracing — those do not exist in browser WebGL. This is upgraded WebGL, not AAA COD-level graphics: models are still low-poly originals, and phone GPUs limit texture/shadow detail.
- No real multiplayer in this version: the other 49 players are bots. Real human multiplayer needs a live server, matchmaking, and accounts, which static GitHub Pages cannot provide.

## Controls

- Desktop: WASD move, mouse aim, click/hold shoot, Space jump, Shift sprint, C crouch, R reload, Q weapon switch, F medkit, right-mouse hold to aim.
- Mobile: left joystick, drag right side to aim, FIRE, JUMP, CROUCH, RELOAD, WEAPON, AIM, MEDKIT buttons, plus Full screen.

## Performance notes

Geometries and materials are reused, trees/rocks use instanced meshes, bot AI is staggered (12 bots per frame), and bots/pickups beyond draw distance are hidden while simulation continues. Graphics quality caps pixel ratio.
