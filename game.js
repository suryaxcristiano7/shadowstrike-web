import * as THREE from './js/three.module.js';
// ShadowStrike Web — original game. You vs 49 bots, big map, WebGL realistic-style lighting.
// No commercial assets, no proprietary upscaling or ray-tracing claims. Bots only: no real multiplayer on static hosting.
const $ = (id) => document.getElementById(id);
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const MAP = 220, TOTAL = 50, BOT_COUNT = 49;
const WEAPONS = [
  {name:'Mk I Rifle', dmg:20, cd:0.16, mag:30},
  {name:'Mk II SMG', dmg:14, cd:0.10, mag:40},
  {name:'Mk III DMR', dmg:38, cd:0.48, mag:10},
];
const FIRST = ['Viper','Ghost','Rogue','Falcon','Blaze','Storm','Hunter','Raven','Cobra','Wolf','Hawk','Onyx','Reaper','Jolt','Ash','Dagger','Comet','Iron','Shadow','Fang','Bolt','Zero','Nova','Griff','Sable'];
const TOWNS = [
  {name:'Downtown', x:0, z:-50},
  {name:'Old Port', x:-140, z:90},
  {name:'Factory Row', x:130, z:-100},
  {name:'Hill Town', x:-120, z:-130},
  {name:'Farm Fields', x:140, z:120},
  {name:'Quarry', x:60, z:150},
];
let renderer, scene, camera, clock, sun;
let player, bots = [], pickups = [], colliders = [], tracers = [];
let zone, gameState = 'menu', startTime = 0, shootCd = 0, firing = false, aiming = false;
let keys = {}, joy = {x:0, y:0, active:false, id:null, ox:0, oy:0};
let aimTouch = {id:null, lx:0, ly:0};
let audioCtx = null, aiCursor = 0, mapTimer = 0, zoneTick = 0;
const QUALITY = {
  performance:{pr:1, shadow:0, aa:false},
  balanced:{pr:1.25, shadow:1024, aa:true},
  high:{pr:1.5, shadow:2048, aa:true},
  ultra:{pr:2, shadow:2048, aa:true},
};
function quality(){ return QUALITY[$('quality').value] || QUALITY.balanced; }
function fullscreen(){
  const el = document.documentElement;
  try{ if(document.fullscreenElement) document.exitFullscreen();
    else if(el.requestFullscreen) el.requestFullscreen();
    else if(el.webkitRequestFullscreen) el.webkitRequestFullscreen(); }catch(e){}
}
$('fsBtn').onclick = fullscreen; $('fsStartBtn').onclick = fullscreen;

function groundTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'); g.fillStyle = '#4f5a3c'; g.fillRect(0,0,512,512);
  for(let i=0;i<9000;i++){ g.fillStyle = Math.random()<0.5 ? 'rgba(28,38,24,0.25)' : 'rgba(118,122,88,0.20)'; g.fillRect(Math.random()*512, Math.random()*512, 2, 2); }
  for(let i=0;i<26;i++){ g.fillStyle = 'rgba(92,80,58,0.28)'; g.beginPath(); g.ellipse(Math.random()*512, Math.random()*512, 20+Math.random()*50, 12+Math.random()*30, Math.random()*3, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(36,36); return t;
}
function textSprite(text){
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d'); g.font = '700 28px system-ui, Arial'; g.textAlign = 'center';
  g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 6; g.strokeText(text, 128, 40); g.fillStyle = '#e8e2d2'; g.fillText(text, 128, 40);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:tex, transparent:true, depthWrite:false}));
  sp.scale.set(34, 8.5, 1); return sp;
}
function makeCharacter(color){
  const grp = new THREE.Group();
  const torsoMat = new THREE.MeshStandardMaterial({color, roughness:0.92});
  const darkMat = new THREE.MeshStandardMaterial({color:0x23282a, roughness:0.92});
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72,0.85,0.38), torsoMat); torso.position.y = 1.15; torso.castShadow = true; grp.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.29,14,10), darkMat); head.position.y = 1.78; head.castShadow = true; grp.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.58,0.72,0.32), darkMat); legs.position.y = 0.36; legs.castShadow = true; grp.add(legs);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.11,0.14,0.95), new THREE.MeshStandardMaterial({color:0x17191a, roughness:0.55, metalness:0.35}));
  gun.position.set(0.28,1.25,0.48); grp.add(gun);
  grp.userData.gun = gun; return grp;
}
function addBuilding(x,z,w,d,h,mat){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x,h/2,z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w+0.4,0.3,d+0.4), new THREE.MeshStandardMaterial({color:0x2c2f32, roughness:0.95}));
  roof.position.set(x,h+0.15,z); scene.add(roof);
  colliders.push({x,z,hx:w/2+0.5,hz:d/2+0.5});
}
function blocked(x,z){ for(const c of colliders){ if(Math.abs(x-c.x)<c.hx && Math.abs(z-c.z)<c.hz) return true; } return false; }
function moveWithCollision(ent, dx, dz){
  const p = ent.group.position;
  if(!blocked(p.x+dx, p.z)) p.x = THREE.MathUtils.clamp(p.x+dx,-MAP,MAP);
  if(!blocked(p.x, p.z+dz)) p.z = THREE.MathUtils.clamp(p.z+dz,-MAP,MAP);
}
function randPos(minDistFromPlayer){
  for(let tries=0; tries<40; tries++){
    const x = (Math.random()*2-1)*(MAP-15), z = (Math.random()*2-1)*(MAP-15);
    if(blocked(x,z)) continue;
    if(minDistFromPlayer && player && Math.hypot(x-player.group.position.x, z-player.group.position.z) < minDistFromPlayer) continue;
    return {x,z};
  }
  return {x:0, z:0};
}
function init(){
  if(renderer) return;
  const q = quality();
  renderer = new THREE.WebGLRenderer({antialias:q.aa, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, q.pr));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = q.shadow>0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('app').appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fa3b0);
  scene.fog = new THREE.Fog(0x8fa3b0, 70, 320);
  camera = new THREE.PerspectiveCamera(62, innerWidth/innerHeight, 0.1, 700);
  clock = new THREE.Clock();
  scene.add(new THREE.HemisphereLight(0xbcc8d0, 0x3a4035, 0.95));
  sun = new THREE.DirectionalLight(0xfff0d6, 1.7);
  sun.position.set(60,90,30); sun.castShadow = q.shadow>0;
  if(q.shadow>0){ sun.shadow.mapSize.set(q.shadow,q.shadow); const s=95; sun.shadow.camera.left=-s; sun.shadow.camera.right=s; sun.shadow.camera.top=s; sun.shadow.camera.bottom=-s; sun.shadow.camera.far=400; }
  scene.add(sun); scene.add(sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500,500), new THREE.MeshStandardMaterial({map:groundTexture(), roughness:1}));
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
  // Roads (cross)
  const roadMat = new THREE.MeshStandardMaterial({color:0x30343a, roughness:1});
  const r1 = new THREE.Mesh(new THREE.PlaneGeometry(500,9), roadMat); r1.rotation.x = -Math.PI/2; r1.position.y = 0.04; scene.add(r1);
  const r2 = new THREE.Mesh(new THREE.PlaneGeometry(9,500), roadMat); r2.rotation.x = -Math.PI/2; r2.position.y = 0.04; scene.add(r2);
  // Towns + buildings
  const conc = [0x7a7d78,0x6d6a63,0x83867e,0x746f66].map(c=>new THREE.MeshStandardMaterial({color:c, roughness:0.95}));
  const clusters = [
    {cx:0, cz:-50, n:10, spread:55}, {cx:-140, cz:90, n:8, spread:45}, {cx:130, cz:-100, n:8, spread:48},
    {cx:-120, cz:-130, n:7, spread:42}, {cx:140, cz:120, n:6, spread:48}, {cx:60, cz:150, n:5, spread:40},
  ];
  clusters.forEach((cl,ci)=>{
    for(let i=0;i<cl.n;i++){
      const x = cl.cx + (Math.random()*2-1)*cl.spread, z = cl.cz + (Math.random()*2-1)*cl.spread;
      if(Math.abs(x)<8 || Math.abs(z)<8) continue;
      addBuilding(x, z, 12+Math.random()*10, 10+Math.random()*8, 5+Math.random()*5, conc[(ci+i)%4]);
    }
  });
  for(let i=0;i<12;i++){ const p = randPos(0); if(!blocked(p.x,p.z)) addBuilding(p.x, p.z, 10+Math.random()*8, 9+Math.random()*6, 4+Math.random()*3, conc[i%4]); }
  TOWNS.forEach(t=>{ const sp = textSprite(t.name); sp.position.set(t.x, 26, t.z); scene.add(sp); });
  // Trees + rocks as instanced meshes (2 + 1 draw calls, not hundreds)
  const treePos = [];
  for(let i=0;i<170;i++){ const x=(Math.random()*2-1)*205, z=(Math.random()*2-1)*205; if(blocked(x,z) || Math.abs(x)<7 || Math.abs(z)<7) continue; treePos.push([x,z]); }
  const trunkGeo = new THREE.CylinderGeometry(0.22,0.34,2.4,7);
  const leafGeo = new THREE.ConeGeometry(1.8,3.8,8);
  const trunkIM = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({color:0x4a3826, roughness:1}), treePos.length);
  const leafIM = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({color:0x2f4428, roughness:1}), treePos.length);
  const dummy = new THREE.Object3D();
  treePos.forEach((p,i)=>{ dummy.position.set(p[0],1.2,p[1]); dummy.updateMatrix(); trunkIM.setMatrixAt(i,dummy.matrix); dummy.position.set(p[0],3.9,p[1]); dummy.updateMatrix(); leafIM.setMatrixAt(i,dummy.matrix); });
  trunkIM.castShadow = true; leafIM.castShadow = true; scene.add(trunkIM); scene.add(leafIM);
  const rockPos = [];
  for(let i=0;i<60;i++){ const x=(Math.random()*2-1)*205, z=(Math.random()*2-1)*205; if(blocked(x,z)) continue; rockPos.push([x,z]); }
  const rockIM = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0), new THREE.MeshStandardMaterial({color:0x6b6e6a, roughness:1}), rockPos.length);
  rockPos.forEach((p,i)=>{ const s=0.6+Math.random()*1.5; dummy.position.set(p[0],0.4,p[1]); dummy.scale.set(s,s*0.7,s); dummy.updateMatrix(); rockIM.setMatrixAt(i,dummy.matrix); dummy.scale.set(1,1,1); });
  rockIM.castShadow = true; scene.add(rockIM);
  // Zone visuals
  zone = {center:new THREE.Vector2(0,0), radius:215, target:215, wait:50, shrinking:false, phase:0};
  zone.ring = new THREE.Mesh(new THREE.RingGeometry(0.985,1,64), new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.9, side:THREE.DoubleSide}));
  zone.ring.rotation.x = -Math.PI/2; zone.ring.position.y = 0.15; scene.add(zone.ring);
  zone.wall = new THREE.Mesh(new THREE.CylinderGeometry(1,1,24,48,1,true), new THREE.MeshBasicMaterial({color:0xd43a2a, transparent:true, opacity:0.12, side:THREE.DoubleSide, depthWrite:false}));
  zone.wall.position.y = 12; scene.add(zone.wall);
  window.addEventListener('resize', ()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });
  animate();
}

// ---------- match, feed, audio ----------
function addFeed(text){
  const f = $('killfeed'); const d = document.createElement('div'); d.textContent = text; f.prepend(d);
  while(f.children.length > 5) f.lastChild.remove();
  setTimeout(()=>d.remove(), 5000);
}
function playShot(){
  try{
    if(!audioCtx) return;
    const t = audioCtx.currentTime, buf = audioCtx.createBuffer(1, audioCtx.sampleRate*0.09, audioCtx.sampleRate);
    const ch = buf.getChannelData(0); for(let i=0;i<ch.length;i++) ch[i] = (Math.random()*2-1) * (1-i/ch.length);
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const g = audioCtx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.01, t+0.09);
    src.connect(g); g.connect(audioCtx.destination); src.start();
  }catch(e){}
}
function spawnPickupAt(x,z){
  const types = ['health','ammo','medkit','weapon'];
  const type = types[Math.floor(Math.random()*types.length)];
  spawnPickup(type, x, z);
}
function spawnPickup(type, x, z){
  const colors = {health:0x4a9e57, ammo:0xc8a24a, medkit:0xe8e8e8, weapon:0x8a6a3a};
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.8,0.8,0.8), new THREE.MeshStandardMaterial({color:colors[type], roughness:0.8}));
  m.position.set(x, 0.9, z); scene.add(m);
  pickups.push({group:m, type, baseY:0.9});
}
function clearMatch(){
  for(const b of bots) scene.remove(b.group);
  for(const p of pickups) scene.remove(p.group);
  for(const t of tracers) scene.remove(t.line);
  bots = []; pickups = []; tracers = []; $('killfeed').innerHTML = '';
}
function spawnMatch(){
  init(); clearMatch();
  if(!player){
    player = {group:makeCharacter(0x5a6248), health:100, yaw:0, pitch:0.1, vy:0, onGround:true, kills:0, crouched:false, reloading:0, medkitCd:0, weapon:0, unlocked:[0], mags:[30,40,10], reserve:120, medkits:1, alive:true};
    scene.add(player.group);
  }
  const pp = randPos(0);
  player.group.position.set(pp.x, 0, pp.z); player.group.scale.set(1,1,1);
  player.health = 100; player.yaw = Math.random()*Math.PI*2; player.pitch = 0.1; player.vy = 0; player.kills = 0;
  player.crouched = false; player.reloading = 0; player.medkitCd = 0; player.weapon = 0; player.unlocked = [0];
  player.mags = [30,40,10]; player.reserve = 120; player.medkits = 1; player.alive = true;
  const palette = [0x6b5a48,0x4a5560,0x635a6a,0x745a4a,0x3f4a3a,0x5a4a52,0x6a6a5a,0x4a5a5a];
  for(let i=0;i<BOT_COUNT;i++){
    const name = FIRST[i % FIRST.length] + (i >= FIRST.length ? ' ' + (Math.floor(i/FIRST.length)+1) : '');
    const grp = makeCharacter(palette[i % palette.length]);
    const p = randPos(35);
    grp.position.set(p.x, 0, p.z); scene.add(grp);
    bots.push({id:i, name, group:grp, health:100, alive:true, target:null, targetIsPlayer:false, moveX:0, moveZ:0, waypoint:p, shootCd:Math.random(), speed:4.5+Math.random()*1.5, strafe:(i%2?1:-1)});
  }
  for(let i=0;i<80;i++){ const p = randPos(12); const types=['health','ammo','medkit','weapon']; spawnPickup(types[Math.floor(Math.random()*types.length)], p.x, p.z); }
  zone.center.set(0,0); zone.radius = 215; zone.target = 215; zone.wait = 50; zone.shrinking = false; zone.phase = 0;
  startTime = Date.now(); gameState = 'playing'; shootCd = 0; firing = false; aiming = false;
  $('startScreen').style.display = 'none'; $('endScreen').style.display = 'none'; $('hud').classList.add('on');
  if(isTouch) $('touchUI').classList.add('on');
  updateHUD();
}
function botsAlive(){ let n = 0; for(const b of bots) if(b.alive) n++; return n; }
function killBot(bot, killer){
  if(!bot.alive) return; bot.alive = false; bot.group.visible = false;
  if(killer) addFeed(killer + ' eliminated ' + bot.name); else addFeed(bot.name + ' died outside the zone');
  if(Math.random() < 0.45) spawnPickupAt(bot.group.position.x, bot.group.position.z);
  if(player.alive && botsAlive() === 0) endGame(true, 1);
}
function damageBot(bot, dmg, killer){
  if(!bot.alive) return; bot.health -= dmg;
  if(bot.health <= 0){ if(killer === 'You') player.kills++; killBot(bot, killer); }
}
function damagePlayer(dmg, attacker){
  if(!player.alive) return; player.health -= dmg;
  const d = $('damage'); d.style.opacity = '0.85'; setTimeout(()=>{ d.style.opacity = '0'; }, 180);
  if(player.health <= 0){ player.health = 0; player.alive = false; endGame(false, botsAlive() + 1); }
}
function addTracer(from, to){
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({color:0xffe9a0, transparent:true, opacity:0.9}));
  scene.add(line); tracers.push({line, life:0.09});
}
function playerShoot(){
  if(gameState !== 'playing' || !player.alive || player.reloading > 0 || shootCd > 0) return;
  const w = WEAPONS[player.weapon];
  if(player.mags[player.weapon] <= 0){ addFeed('Out of ammo — press Reload / find ammo'); shootCd = 0.3; return; }
  player.mags[player.weapon]--; shootCd = w.cd;
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const origin = camera.position.clone();
  let best = null, bestProj = 1e9;
  for(const b of bots){
    if(!b.alive) continue;
    const chest = b.group.position.clone(); chest.y += 1.3;
    const v = chest.clone().sub(origin); const proj = v.dot(dir);
    if(proj <= 0 || proj > 75) continue;
    const perp = v.clone().addScaledVector(dir, -proj).length();
    if(perp < (aiming ? 1.15 : 1.7) && proj < bestProj){ best = b; bestProj = proj; }
  }
  const gunPos = player.group.position.clone(); gunPos.y += 1.3; gunPos.add(new THREE.Vector3(Math.sin(player.yaw),0,Math.cos(player.yaw)).multiplyScalar(0.6));
  if(best){ const chest = best.group.position.clone(); chest.y += 1.3; addTracer(gunPos, chest); damageBot(best, w.dmg, 'You'); }
  else addTracer(gunPos, origin.clone().addScaledVector(dir, 70));
  playShot(); updateHUD();
}
function botShoot(bot, targetPos, isPlayerTarget, targetBot){
  const from = bot.group.position.clone(); from.y += 1.3;
  const dist = from.distanceTo(targetPos);
  let chance = dist < 15 ? 0.55 : dist < 30 ? 0.40 : 0.27;
  if(isPlayerTarget && player.crouched) chance *= 0.75;
  if(Math.random() < chance){
    const dmg = 7 + Math.random()*6;
    if(isPlayerTarget) damagePlayer(dmg, bot.name); else if(targetBot) damageBot(targetBot, dmg, bot.name);
    addTracer(from, targetPos.clone());
  } else {
    const miss = targetPos.clone(); miss.x += (Math.random()-0.5)*3; miss.y += (Math.random()-0.5)*2; miss.z += (Math.random()-0.5)*3;
    addTracer(from, miss);
  }
}
function doJump(){ if(player && player.alive && player.onGround){ player.vy = 8.5; player.onGround = false; } }
function toggleCrouch(){
  if(!player) return; player.crouched = !player.crouched;
  player.group.scale.y = player.crouched ? 0.78 : 1;
  $('crouchBtn').classList.toggle('active', player.crouched);
}
function doReload(){
  if(!player || player.reloading > 0) return;
  const w = WEAPONS[player.weapon];
  if(player.mags[player.weapon] >= w.mag || player.reserve <= 0) return;
  player.reloading = 1.15; updateHUD();
}
function switchWeapon(){
  if(!player || player.unlocked.length < 2) return;
  const idx = player.unlocked.indexOf(player.weapon);
  player.weapon = player.unlocked[(idx+1) % player.unlocked.length];
  updateHUD();
}
function useMedkit(){
  if(!player || player.medkits <= 0 || player.health >= 100 || player.medkitCd > 0) return;
  player.medkits--; player.health = Math.min(100, player.health + 50); player.medkitCd = 1; addFeed('You used a medkit (+50)'); updateHUD();
}
function endGame(win, placement){
  gameState = 'over'; document.exitFullscreen && document.fullscreenElement && document.exitFullscreen();
  if(document.pointerLockElement) document.exitPointerLock();
  const secs = Math.floor((Date.now() - startTime)/1000);
  $('endTitle').textContent = win ? '#1 — VICTORY!' : ('#' + placement + ' — ELIMINATED');
  $('endStats').textContent = 'Kills: ' + player.kills + ' · Survived: ' + Math.floor(secs/60) + ':' + String(secs%60).padStart(2,'0') + ' · Players left: ' + (botsAlive() + (player.alive?1:0)) + (win ? ' — You are the last one standing!' : '');
  $('endScreen').style.display = 'flex'; $('hud').classList.remove('on'); $('touchUI').classList.remove('on');
}

// ---------- updates ----------
function updateHUD(){
  if(!player) return;
  const w = WEAPONS[player.weapon];
  $('alive').textContent = 'Alive: ' + (botsAlive() + (player.alive ? 1 : 0)) + ' / 50';
  $('kills').textContent = 'Kills: ' + player.kills;
  const secs = Math.floor((Date.now() - startTime)/1000);
  $('timer').textContent = Math.floor(secs/60) + ':' + String(secs%60).padStart(2,'0');
  $('healthBar').style.width = Math.max(0, player.health) + '%';
  $('healthText').textContent = 'Health ' + Math.max(0, Math.ceil(player.health)) + (player.crouched ? ' · Crouched' : '') + (aiming ? ' · Aiming' : '') + (player.reloading > 0 ? ' · Reloading…' : '');
  $('ammo').textContent = 'Ammo ' + player.mags[player.weapon] + ' / ' + player.reserve;
  $('weapon').textContent = w.name; $('medkits').textContent = 'Medkits: ' + player.medkits;
  $('zonePill').textContent = zone.shrinking ? 'Zone: SHRINKING → ' + Math.round(zone.radius) + 'm' : 'Zone: ' + Math.round(zone.radius) + 'm · next in ' + Math.max(0, Math.ceil(zone.wait)) + 's';
}
function drawMinimap(){
  const cv = $('minimap'), g = cv.getContext('2d'); const S = cv.width / (MAP*2 + 40);
  g.fillStyle = '#16211a'; g.fillRect(0,0,cv.width,cv.height);
  g.strokeStyle = '#3a4a40'; g.strokeRect(1,1,cv.width-2,cv.height-2);
  const px = (x)=> (x + MAP + 20) * S, pz = (z)=> (z + MAP + 20) * S;
  g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.beginPath(); g.arc(px(zone.center.x), pz(zone.center.y), zone.radius*S, 0, 7); g.stroke();
  g.fillStyle = '#c8c8c8'; g.font = '7px Arial'; TOWNS.forEach(t=>{ g.fillRect(px(t.x)-1, pz(t.z)-1, 2, 2); });
  for(const b of bots){ if(!b.alive) continue; g.fillStyle = '#d43a2a'; g.fillRect(px(b.group.position.x)-1.5, pz(b.group.position.z)-1.5, 3, 3); }
  if(player){ g.fillStyle = '#7fb069'; g.beginPath(); g.arc(px(player.group.position.x), pz(player.group.position.z), 4, 0, 7); g.fill(); }
}
function updateZone(dt){
  if(zone.shrinking){
    zoneTick += dt; const p = Math.min(1, zoneTick / 28);
    zone.radius = zone.startR + (zone.target - zone.startR) * p;
    $('zoneMsg').style.display = 'block';
    if(p >= 1){ zone.shrinking = false; zone.phase++; zone.wait = 45; $('zoneMsg').style.display = 'none'; }
  } else {
    zone.wait -= dt;
    if(zone.wait <= 0){
      zone.shrinking = true; zoneTick = 0; zone.startR = zone.radius; zone.target = Math.max(14, zone.radius * 0.62);
      const nx = THREE.MathUtils.clamp(zone.center.x + (Math.random()-0.5)*50, -(MAP-zone.target), MAP-zone.target);
      const nz = THREE.MathUtils.clamp(zone.center.y + (Math.random()-0.5)*50, -(MAP-zone.target), MAP-zone.target);
      zone.center.set(nx, nz);
    }
  }
  const s = zone.radius;
  zone.ring.position.set(zone.center.x, 0.15, zone.center.y); zone.ring.scale.set(s, s, 1);
  zone.wall.position.set(zone.center.x, 12, zone.center.y); zone.wall.scale.set(s, 1, s);
  // damage outside
  const rate = 5 + zone.phase * 2;
  if(player.alive){
    const d = Math.hypot(player.group.position.x - zone.center.x, player.group.position.z - zone.center.z);
    if(d > zone.radius){ player.health -= rate * dt; if(player.health <= 0){ player.health = 0; player.alive = false; endGame(false, botsAlive() + 1); } }
  }
  for(const b of bots){
    if(!b.alive) continue;
    const d = Math.hypot(b.group.position.x - zone.center.x, b.group.position.z - zone.center.y);
    if(d > zone.radius){ b.health -= rate * dt; if(b.health <= 0) killBot(b, null); }
  }
}
function updateBotsAI(){
  // Staggered tick: 12 bots per frame, so 49 bots do not all re-path every frame.
  for(let k=0;k<12;k++){
    const bot = bots[(aiCursor + k) % bots.length]; if(!bot || !bot.alive) continue;
    bot.shootCd = Math.max(0, bot.shootCd - 0.12);
    const bp = bot.group.position;
    let target = null, targetIsPlayer = false, bestD = 1e9;
    if(player.alive){ const d = Math.hypot(player.group.position.x-bp.x, player.group.position.z-bp.z); if(d < bestD){ bestD = d; target = player; targetIsPlayer = true; } }
    for(const o of bots){ if(!o.alive || o === bot) continue; const d = Math.hypot(o.group.position.x-bp.x, o.group.position.z-bp.z); if(d < bestD){ bestD = d; target = o; targetIsPlayer = false; } }
    bot.target = target; bot.targetIsPlayer = targetIsPlayer;
    const zd = Math.hypot(bp.x - zone.center.x, bp.z - zone.center.y);
    let mx = 0, mz = 0;
    if(zd > zone.radius){
      mx = (zone.center.x - bp.x) / zd; mz = (zone.center.y - bp.z) / zd;
    } else if(target && bestD < 42){
      const tp = targetIsPlayer ? player.group.position : target.group.position;
      const dx = tp.x - bp.x, dz = tp.z - bp.z, d = Math.max(1, Math.hypot(dx,dz));
      if(bestD > 28){ mx = dx/d; mz = dz/d; }
      else if(bestD < 12){ mx = -dx/d; mz = -dz/d; }
      else { mx = -dz/d * bot.strafe; mz = dx/d * bot.strafe; }
      if(bestD < 38 && bot.shootCd <= 0){
        const chest = tp.clone(); chest.y += 1.3;
        botShoot(bot, chest, targetIsPlayer, targetIsPlayer ? null : target);
        bot.shootCd = 0.9 + Math.random()*0.9;
      }
      bot.group.rotation.y = Math.atan2(dx, dz);
    } else {
      if(!bot.waypoint || Math.hypot(bot.waypoint.x-bp.x, bot.waypoint.z-bp.z) < 6) bot.waypoint = randPos(0);
      const dx = bot.waypoint.x - bp.x, dz = bot.waypoint.z - bp.z, d = Math.max(1, Math.hypot(dx,dz));
      mx = dx/d; mz = dz/d; bot.group.rotation.y = Math.atan2(dx, dz);
    }
    bot.moveX = mx; bot.moveZ = mz;
  }
  aiCursor = (aiCursor + 12) % Math.max(1, bots.length);
}
function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock ? clock.getDelta() : 0.016, 0.05);
  if(!renderer || !scene) return;
  if(gameState === 'playing' && player && player.alive){
    // timers
    shootCd = Math.max(0, shootCd - dt); player.medkitCd = Math.max(0, player.medkitCd - dt);
    if(player.reloading > 0){ player.reloading -= dt; if(player.reloading <= 0){ const w = WEAPONS[player.weapon]; const need = w.mag - player.mags[player.weapon]; const take = Math.min(need, player.reserve); player.mags[player.weapon] += take; player.reserve -= take; } }
    if(firing && shootCd <= 0) playerShoot();
    // movement
    let fwd = (keys['KeyW']?1:0) - (keys['KeyS']?1:0) - joy.y;
    let str = (keys['KeyD']?1:0) - (keys['KeyA']?1:0) + joy.x;
    const len = Math.hypot(fwd, str); if(len > 1){ fwd /= len; str /= len; }
    let speed = player.crouched ? 5 : aiming ? 6.5 : (keys['ShiftLeft']||keys['ShiftRight'] ? 13 : 9);
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    const rx = -Math.cos(player.yaw), rz = Math.sin(player.yaw);
    const mx = fx*fwd + rx*str, mz = fz*fwd + rz*str;
    moveWithCollision(player, mx*speed*dt, mz*speed*dt);
    player.group.rotation.y = player.yaw;
    if(!player.onGround){ player.vy -= 22*dt; player.group.position.y += player.vy*dt; if(player.group.position.y <= 0){ player.group.position.y = 0; player.vy = 0; player.onGround = true; } }
    // pickups
    for(let i=pickups.length-1;i>=0;i--){
      const p = pickups[i]; p.group.rotation.y += dt*1.5; p.group.position.y = p.baseY + Math.sin(Date.now()*0.003 + i)*0.15;
      const d = Math.hypot(p.group.position.x-player.group.position.x, p.group.position.z-player.group.position.z);
      if(d < 2.4){
        if(p.type==='health') player.health = Math.min(100, player.health+35);
        if(p.type==='ammo') player.reserve += 60;
        if(p.type==='medkit') player.medkits++;
        if(p.type==='weapon'){ const next = Math.max(...player.unlocked)+1; if(next < WEAPONS.length){ player.unlocked.push(next); addFeed('Weapon unlocked: '+WEAPONS[next].name); } else player.reserve += 60; }
        addFeed('Picked up ' + p.type); scene.remove(p.group); pickups.splice(i,1);
      }
    }
    updateBotsAI(); updateZone(dt);
    // camera (third person)
    const targetFov = aiming ? 42 : 62;
    if(Math.abs(camera.fov - targetFov) > 0.2){ camera.fov += (targetFov - camera.fov)*0.18; camera.updateProjectionMatrix(); }
    const camDist = aiming ? 3.4 : 5.8;
    const pp = player.group.position;
    const camH = (player.crouched ? 2.0 : 2.9) + player.pitch*1.2;
    camera.position.set(pp.x - fx*camDist, pp.y + camH, pp.z - fz*camDist);
    if(camera.position.y < 0.6) camera.position.y = 0.6;
    camera.lookAt(pp.x + fx*10, pp.y + 1.5 + player.pitch*5, pp.z + fz*10);
    // sun shadow follows player
    sun.position.set(pp.x+60, 90, pp.z+30); sun.target.position.set(pp.x, 0, pp.z); sun.target.updateMatrixWorld();
  } else if(gameState === 'playing'){
    // player dead but bots keep fighting for a moment — keep rendering
    updateBotsAI();
  }
  // bot movement + visibility culling (draw-distance trade-off, simulation continues)
  for(const b of bots){
    if(!b.alive) continue;
    moveWithCollision(b, b.moveX*b.speed*dt, b.moveZ*b.speed*dt);
    if(player){ const d = Math.hypot(b.group.position.x-player.group.position.x, b.group.position.z-player.group.position.z); b.group.visible = d < 150; }
  }
  for(let i=tracers.length-1;i>=0;i--){ tracers[i].life -= dt; tracers[i].line.material.opacity = Math.max(0, tracers[i].life*10); if(tracers[i].life <= 0){ scene.remove(tracers[i].line); tracers.splice(i,1); } }
  mapTimer += dt; if(mapTimer > 0.15){ mapTimer = 0; if(gameState==='playing') drawMinimap(); }
  if(gameState === 'playing') updateHUD();
  renderer.render(scene, camera);
}
// ---------- input ----------
document.addEventListener('keydown', (e)=>{
  keys[e.code] = true;
  if(gameState !== 'playing') return;
  if(e.code === 'Space'){ e.preventDefault(); doJump(); }
  if(e.code === 'KeyC') toggleCrouch();
  if(e.code === 'KeyR') doReload();
  if(e.code === 'KeyQ') switchWeapon();
  if(e.code === 'KeyF') useMedkit();
});
document.addEventListener('keyup', (e)=>{ keys[e.code] = false; });
document.addEventListener('mousemove', (e)=>{
  if(document.pointerLockElement && gameState === 'playing'){
    player.yaw -= e.movementX * 0.0024;
    player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * 0.0022, -0.45, 0.65);
  }
});
document.addEventListener('mousedown', (e)=>{
  if(gameState !== 'playing' || isTouch) return;
  if(e.button === 0) firing = true;
  if(e.button === 2) aiming = true;
});
document.addEventListener('mouseup', (e)=>{ if(e.button === 0) firing = false; if(e.button === 2) aiming = false; });
document.addEventListener('contextmenu', (e)=>{ if(gameState === 'playing') e.preventDefault(); });
document.addEventListener('pointerlockchange', ()=>{
  const pau = $('pauseOverlay');
  if(!document.pointerLockElement && gameState === 'playing' && !isTouch) pau.style.display = 'flex'; else pau.style.display = 'none';
});
$('resumeBtn').onclick = ()=>{ if(renderer) renderer.domElement.requestPointerLock(); };
// touch: joystick
const joyBase = $('joyBase'), joyKnob = $('joyKnob');
joyBase.addEventListener('touchstart', (e)=>{ e.preventDefault(); const t = e.changedTouches[0]; joy.id = t.identifier; const r = joyBase.getBoundingClientRect(); joy.ox = r.left + r.width/2; joy.oy = r.top + r.height/2; joy.active = true; }, {passive:false});
joyBase.addEventListener('touchmove', (e)=>{ e.preventDefault(); for(const t of e.changedTouches){ if(t.identifier !== joy.id) continue; let dx = (t.clientX - joy.ox)/48, dy = (t.clientY - joy.oy)/48; const l = Math.hypot(dx,dy); if(l > 1){ dx/=l; dy/=l; } joy.x = dx; joy.y = dy; joyKnob.style.transform = 'translate(' + (dx*34) + 'px,' + (dy*34) + 'px)'; } }, {passive:false});
function joyEnd(e){ for(const t of e.changedTouches){ if(t.identifier === joy.id){ joy.id = null; joy.x = 0; joy.y = 0; joy.active = false; joyKnob.style.transform = ''; } } }
joyBase.addEventListener('touchend', joyEnd); joyBase.addEventListener('touchcancel', joyEnd);
// touch: aim drag anywhere else
document.addEventListener('touchstart', (e)=>{
  if(gameState !== 'playing') return;
  if(e.target.closest && (e.target.closest('.tbtn') || e.target.closest('#joyBase'))) return;
  const t = e.changedTouches[0]; aimTouch.id = t.identifier; aimTouch.lx = t.clientX; aimTouch.ly = t.clientY;
}, {passive:true});
document.addEventListener('touchmove', (e)=>{
  if(aimTouch.id === null || !player) return;
  for(const t of e.changedTouches){ if(t.identifier === aimTouch.id){ player.yaw -= (t.clientX - aimTouch.lx) * 0.005; player.pitch = THREE.MathUtils.clamp(player.pitch - (t.clientY - aimTouch.ly) * 0.005, -0.45, 0.65); aimTouch.lx = t.clientX; aimTouch.ly = t.clientY; } }
}, {passive:true});
document.addEventListener('touchend', (e)=>{ for(const t of e.changedTouches){ if(t.identifier === aimTouch.id) aimTouch.id = null; } });
function bindBtn(id, fn){
  const el = $(id); if(!el) return;
  el.addEventListener('touchstart', (e)=>{ e.preventDefault(); fn(); }, {passive:false});
  el.addEventListener('click', (e)=>{ if(!isTouch) fn(); });
}
const fireEl = $('fireBtn');
fireEl.addEventListener('touchstart', (e)=>{ e.preventDefault(); firing = true; }, {passive:false});
fireEl.addEventListener('touchend', ()=>{ firing = false; });
fireEl.addEventListener('touchcancel', ()=>{ firing = false; });
fireEl.addEventListener('mousedown', ()=>{ firing = true; });
fireEl.addEventListener('mouseup', ()=>{ firing = false; });
bindBtn('jumpBtn', doJump);
bindBtn('crouchBtn', toggleCrouch);
bindBtn('reloadBtn', doReload);
bindBtn('weaponBtn', switchWeapon);
bindBtn('medkitBtn', useMedkit);
bindBtn('aimBtn', ()=>{ aiming = !aiming; $('aimBtn').classList.toggle('active', aiming); });
// ---------- start / restart ----------
$('startBtn').onclick = ()=>{
  try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){}
  spawnMatch();
  if(!isTouch && renderer) renderer.domElement.requestPointerLock();
};
$('restartBtn').onclick = ()=>{
  spawnMatch();
  if(!isTouch && renderer) renderer.domElement.requestPointerLock();
};
