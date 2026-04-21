// ║  MODULE: CONFIG                                              ║
// ╚══════════════════════════════════════════════════════════════╝
const CONFIG = {
  world:    { width:3000, height:900 },
  viewport: { baseWidth:1000, baseHeight:600, targetAspect:1000/600 },
  physics: {
    gravity:1800, playerSpeed:320, jumpPower:760,
    jetpackForce:2880, jetpackDrain:55, jetpackRecharge:32,
    frictionBase:0.78, bulletSpeedX:720, bulletSpeedY:-120,
    bulletGravity:720, particleGravity:360,
  },
  gameplay: {
    maxHealth:100, maxAmmo:10, maxJetpack:100,
    bulletDamage:20, shootCooldown:8/60,
    reloadDuration:1.0, respawnDelay:2.0,
  },
  camera: { defaultMode:'dynamic', zoomLerpSpeed:0.08, shakeDecay:0.85, shakeThreshold:0.1, minZoom:0.45, maxZoom:1.6 },
  network: { tickRate:20, reconnectAttempts:5, reconnectDelay:2000 },
  audio:   { masterVolume:0.7, sfxVolume:0.9, musicVolume:0.25, voiceVolume:1.0 },
  particles:{ maxPoolSize:600, muzzleCount:5, jetpackCount:3, impactCount:10, deathCount:20 },

  // ── Weapon definitions ────────────────────────────────────────
  weapons: {
    pistol:   { label:'PISTOL',   slot:1, mag:10,  reserve:40,  fireRate:8/60,  damage:20, spread:0,    recoil:4, pellets:1, unlocked:true  },
    shotgun:  { label:'SHOTGUN',  slot:2, mag:2,   reserve:16,  fireRate:0.8,   damage:15, spread:0.28, recoil:8, pellets:6, unlocked:true  },
    smg:      { label:'SMG',      slot:3, mag:25,  reserve:100, fireRate:3/60,  damage:8,  spread:0.07, recoil:2, pellets:1, unlocked:true  },
    grenade:  { label:'GRENADE',  slot:4, count:3, cookTime:1.5, damage:60, radius:80, unlocked:true  },
    landmine: { label:'LANDMINE', slot:5, count:2, damage:80, radius:90, unlocked:true  },
  },

  // ── Ammo crate ────────────────────────────────────────────────
  ammoCrate: { spawnInterval:18, ammoRefill:15, maxCrates:4 },

  players: [
    { id:'p1', label:'Player 1', color:'#4CAF50', accentColor:'#81C784', spawnX:400, spawnY:700,
      controls:{ keyboard:{ left:'a', right:'d', jump:'w', jetpack:' ', shoot:'f', reload:'r', throw:'g', mine:'m' } } },
    { id:'p2', label:'Player 2', color:'#FF6347', accentColor:'#FF8A71', spawnX:2600, spawnY:700,
      controls:{ keyboard:{ left:'arrowleft', right:'arrowright', jump:'arrowup', jetpack:'shift', shoot:'l', reload:'p', throw:'k', mine:';' } } },
  ],
  platforms: [
    {x:0,y:850,w:3000,h:50,type:'ground'},
    {x:100,y:700,w:220,h:20,type:'wood'},{x:350,y:580,w:200,h:20,type:'wood'},{x:80,y:480,w:150,h:20,type:'wood'},
    {x:280,y:370,w:200,h:20,type:'wood'},{x:50,y:260,w:120,h:20,type:'wood'},{x:420,y:200,w:160,h:20,type:'wood'},
    {x:650,y:760,w:300,h:20,type:'wood'},{x:580,y:620,w:220,h:20,type:'wood'},{x:730,y:450,w:200,h:20,type:'wood'},
    {x:630,y:280,w:200,h:20,type:'wood'},{x:1100,y:680,w:200,h:20,type:'wood'},{x:1050,y:520,w:200,h:20,type:'wood'},
    {x:1200,y:350,w:200,h:20,type:'wood'},{x:1350,y:160,w:300,h:20,type:'wood'},{x:1700,y:620,w:220,h:20,type:'wood'},
    {x:1750,y:450,w:200,h:20,type:'wood'},{x:1820,y:280,w:200,h:20,type:'wood'},{x:2100,y:760,w:300,h:20,type:'wood'},
    {x:2280,y:680,w:220,h:20,type:'wood'},{x:2500,y:580,w:200,h:20,type:'wood'},{x:2620,y:480,w:150,h:20,type:'wood'},
    {x:2720,y:370,w:200,h:20,type:'wood'},{x:2780,y:260,w:120,h:20,type:'wood'},{x:2420,y:200,w:160,h:20,type:'wood'},
    {x:0,y:200,w:100,h:20,type:'wood'},{x:2900,y:200,w:100,h:20,type:'wood'},
  ],
  spawnPoints:[{x:200,y:800},{x:2750,y:800},{x:750,y:400},{x:2200,y:400},{x:1400,y:300}],
  debug:{ showHitboxes:false, showFPS:true, showPing:true },
};

// ╔══════════════════════════════════════════════════════════════╗
