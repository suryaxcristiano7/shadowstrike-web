# ShadowStrike Web

An original third-person battle-royale-style browser game: you vs 49 bots on a big multi-town map.

- Original art, names, and map only. Not Free Fire, COD, or any commercial game, and not affiliated with any publisher.
- Browser WebGL (Three.js) with realistic-style lighting: sun + shadows, fog, ACES tone mapping, muted palette, procedural textures.
- No proprietary upscaling and no ray tracing — those do not exist in browser WebGL.
- No real multiplayer in this version: the other 49 players are bots. Real human multiplayer needs a live server, matchmaking, and accounts, which static GitHub Pages cannot provide.

## Controls

- Desktop: WASD move, mouse aim, click/hold shoot, Space jump, Shift sprint, C crouch, R reload, Q weapon switch, F medkit, right-mouse hold to aim.
- Mobile: left joystick, drag right side to aim, FIRE, JUMP, CROUCH, RELOAD, WEAPON, AIM, MEDKIT buttons, plus Full screen.

## Performance notes

Geometries and materials are reused, trees/rocks use instanced meshes, bot AI is staggered (12 bots per frame), and bots/pickups beyond draw distance are hidden while simulation continues. Graphics quality caps pixel ratio.
