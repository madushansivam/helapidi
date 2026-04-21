// ║  MODULE: AudioManager                                        ║
// ║  Procedural SFX via Web Audio API. Every game-feel event      ║
// ║  covered: coins, weapons, grenades, mines, jetpack, ammo.     ║
// ║  Web Audio API chosen over Howler — zero dependencies, full   ║
// ║  oscillator control, native noise buffers. Under 200 LOC.     ║
// ╚══════════════════════════════════════════════════════════════╝
class AudioManager {
  constructor(){ this._ctx=null; this._master=null; this._sfx=null; this._music=null;
    this._jetNode=null; this._jetGain=null; this._cookNode=null; this._cookGain=null; }
  init(){
    try{
      this._ctx=new(window.AudioContext||window.webkitAudioContext)();
      this._master=this._g(CONFIG.audio.masterVolume); this._master.connect(this._ctx.destination);
      this._sfx=this._g(CONFIG.audio.sfxVolume); this._sfx.connect(this._master);
      this._music=this._g(CONFIG.audio.musicVolume); this._music.connect(this._master);
      const resume=()=>{if(this._ctx.state==='suspended')this._ctx.resume();window.removeEventListener('click',resume);window.removeEventListener('keydown',resume);};
      window.addEventListener('keydown',resume); window.addEventListener('click',resume);
      this._bind(); this._startDrone();
    }catch(e){console.warn('[Audio] Unavailable');}
  }
  _g(v){ const g=this._ctx.createGain(); g.gain.value=v; return g; }
  _t(){ return this._ctx.currentTime; }

  // ── Core primitives ──────────────────────────────────────────
  _osc(freq,type,start,dur,vol,dest){
    const o=this._ctx.createOscillator(),g=this._g(0),d=dest||this._sfx;
    o.type=type; o.frequency.value=freq;
    g.gain.setValueAtTime(vol,start); g.gain.exponentialRampToValueAtTime(0.001,start+dur);
    o.connect(g).connect(d); o.start(start); o.stop(start+dur+0.02);
    o.onended=()=>{o.disconnect();g.disconnect();};
  }
  _sweep(f0,f1,type,start,dur,vol,dest){
    const o=this._ctx.createOscillator(),g=this._g(0),d=dest||this._sfx;
    o.type=type; o.frequency.setValueAtTime(f0,start); o.frequency.exponentialRampToValueAtTime(f1,start+dur);
    g.gain.setValueAtTime(vol,start); g.gain.exponentialRampToValueAtTime(0.001,start+dur);
    o.connect(g).connect(d); o.start(start); o.stop(start+dur+0.02);
    o.onended=()=>{o.disconnect();g.disconnect();};
  }
  _noise(dur,vol,dest){
    const sr=this._ctx.sampleRate, buf=this._ctx.createBuffer(1,sr*dur,sr);
    const dd=buf.getChannelData(0); for(let i=0;i<dd.length;i++) dd[i]=(Math.random()*2-1)*(1-i/dd.length);
    const s=this._ctx.createBufferSource(),g=this._g(0),d=dest||this._sfx;
    s.buffer=buf; g.gain.setValueAtTime(vol,this._t()); g.gain.exponentialRampToValueAtTime(0.001,this._t()+dur);
    s.connect(g).connect(d); s.start(); s.stop(this._t()+dur+0.02);
    s.onended=()=>{s.disconnect();g.disconnect();};
  }
  _filtNoise(dur,vol,freq,Q,dest){
    const sr=this._ctx.sampleRate, buf=this._ctx.createBuffer(1,sr*dur,sr);
    const dd=buf.getChannelData(0); for(let i=0;i<dd.length;i++) dd[i]=(Math.random()*2-1);
    const s=this._ctx.createBufferSource(),g=this._g(0),fl=this._ctx.createBiquadFilter(),d=dest||this._sfx;
    s.buffer=buf; fl.type='bandpass'; fl.frequency.value=freq; fl.Q.value=Q||1;
    g.gain.setValueAtTime(vol,this._t()); g.gain.exponentialRampToValueAtTime(0.001,this._t()+dur);
    s.connect(fl).connect(g).connect(d); s.start(); s.stop(this._t()+dur+0.02);
    s.onended=()=>{s.disconnect();fl.disconnect();g.disconnect();};
  }

  // ── Event bindings ───────────────────────────────────────────
  _bind(){
    bus.on('player:shoot',    ({weapon})=>this._shoot(weapon));
    bus.on('player:hit',      ({damage})=>this._hit(damage/100));
    bus.on('player:death',    ()=>this._death());
    bus.on('player:jump',     ()=>this._jump());
    bus.on('player:land',     ()=>this._land());
    bus.on('player:reload',   ()=>this._reload());
    bus.on('player:emptyClick',()=>this._emptyClick());
    bus.on('game:roundEnd',   ()=>this._fanfare());
    bus.on('game:roundStart', ()=>this._bell());
    bus.on('coin:collected',  ()=>this._coin());
    bus.on('player:falldamage',({damage})=>this._fallThud(damage));
    bus.on('weapon:switch',   ({next})=>this._weaponSwitch(next));
    bus.on('weapon:locked',   ()=>this._lockedClick());
    bus.on('grenade:explode', ()=>this._grenadeExplode());
    bus.on('mine:explode',    ()=>this._mineExplode());
    bus.on('mine:planted',    ()=>this._minePlant());
    bus.on('mine:triggered',  ()=>this._mineTrigger());
    bus.on('ammocrate:collected',()=>this._ammoPickup());
    bus.on('jetpack:boost',   ()=>this._jetStart());
    bus.on('jetpack:stop',    ()=>this._jetStop());
    bus.on('jetpack:sputter', ()=>this._jetSputter());
    bus.on('grenade:cookStart',()=>this._cookStart());
    bus.on('grenade:cookStop', ()=>this._cookStop());
    bus.on('grenade:thrown',   ()=>this._throwSwoosh());
  }

  // ── 1. COIN — bright chime, pitch-randomized ±15% ───────────
  // Waveform: sine, two notes (C6→E6). Attack 5ms, decay 120ms.
  _coin(){ if(!this._ctx)return; const t=this._t();
    const pitch=1+(Math.random()-.5)*0.3; // ±15%
    this._osc(1047*pitch,'sine',t,0.12,0.22);
    this._osc(1319*pitch,'sine',t+0.06,0.16,0.18);
  }

  // ── 2. WEAPON SWITCH — mechanical click, per-type ────────────
  // Guns: sharp hi-freq click (triangle 480→600). Throwables: lower clunk (200→150).
  _weaponSwitch(next='pistol'){ if(!this._ctx)return; const t=this._t();
    const isThrowable=next==='grenade'||next==='landmine';
    if(isThrowable){
      this._osc(200,'square',t,0.04,0.12); this._osc(150,'triangle',t+0.03,0.06,0.08);
    }else{
      this._osc(480,'triangle',t,0.03,0.12); this._osc(600,'triangle',t+0.025,0.035,0.09);
      this._filtNoise(0.04,0.06,3000,2);
    }
  }

  // ── 3. GRENADE COOK + THROW ──────────────────────────────────
  // Cook: low sine hum 80Hz, volume ramps up. Throw: 300→800Hz swoosh.
  _cookStart(){ if(!this._ctx||this._cookNode)return;
    this._cookNode=this._ctx.createOscillator(); this._cookGain=this._g(0);
    this._cookNode.type='sine'; this._cookNode.frequency.value=80;
    this._cookGain.gain.setValueAtTime(0.01,this._t());
    this._cookGain.gain.linearRampToValueAtTime(0.25,this._t()+1.5);
    this._cookNode.connect(this._cookGain).connect(this._sfx); this._cookNode.start();
  }
  _cookStop(){ if(this._cookNode){try{this._cookNode.stop();}catch(e){} this._cookNode=null;this._cookGain=null;} }
  _throwSwoosh(){ if(!this._ctx)return; this._cookStop();
    this._sweep(300,800,'sine',this._t(),0.15,0.2);
    this._filtNoise(0.12,0.1,1200,3);
  }

  // ── 4. GRENADE EXPLOSION — concussion thud + debris rattle ───
  // Layer 1: 80→12Hz sine sweep 400ms (concussion). Layer 2: filtered noise 2kHz (debris).
  _grenadeExplode(){ if(!this._ctx)return; const t=this._t();
    this._sweep(80,12,'sine',t,0.4,0.7);
    this._noise(0.2,0.5);
    this._filtNoise(0.35,0.25,2000,1.5); // debris rattle
    this._osc(40,'sawtooth',t,0.15,0.3);  // sub thud
  }

  // ── 5. LANDMINE ARM — plant click + trigger beep cadence ─────
  // Plant: sharp 220Hz saw 0.12s. Trigger: rising beeps 440→880Hz at 8Hz rate.
  _minePlant(){ if(!this._ctx)return; const t=this._t();
    this._osc(220,'sawtooth',t,0.08,0.12); this._osc(150,'sine',t+0.06,0.06,0.08);
    this._filtNoise(0.05,0.08,4000,3);
  }
  _mineTrigger(){ if(!this._ctx)return; const t=this._t();
    for(let i=0;i<4;i++) this._osc(440+i*110,'square',t+i*0.12,0.06,0.12+i*0.04);
  }

  // ── 6. LANDMINE EXPLOSION — grenade layers + dirt rumble ─────
  // Same concussion as grenade, extra low-freq rumble at 30Hz and filtered dirt noise.
  _mineExplode(){ if(!this._ctx)return; const t=this._t();
    this._sweep(80,12,'sine',t,0.45,0.8);
    this._noise(0.25,0.55);
    this._filtNoise(0.4,0.3,2000,1.5);
    this._osc(40,'sawtooth',t,0.18,0.35);
    // Dirt rumble layer — extra low sub
    this._sweep(50,18,'sine',t+0.05,0.5,0.4);
    this._filtNoise(0.45,0.2,400,0.8); // low-mid dirt character
  }

  // ── 7. JETPACK — thrust loop + sputter crackle ───────────────
  // Thrust: sawtooth 90Hz loop via continuous oscillator. Sputter: noise burst.
  _jetStart(){ if(!this._ctx||this._jetNode)return;
    this._jetNode=this._ctx.createOscillator(); this._jetGain=this._g(0);
    this._jetNode.type='sawtooth'; this._jetNode.frequency.value=90;
    this._jetGain.gain.setValueAtTime(0.001,this._t());
    this._jetGain.gain.linearRampToValueAtTime(0.18,this._t()+0.08);
    this._jetNode.connect(this._jetGain).connect(this._sfx); this._jetNode.start();
  }
  _jetStop(){ if(!this._jetNode)return;
    const t=this._t(); this._jetGain.gain.linearRampToValueAtTime(0.001,t+0.1);
    const n=this._jetNode; setTimeout(()=>{try{n.stop();}catch(e){}},150);
    this._jetNode=null; this._jetGain=null;
  }
  _jetSputter(){ if(!this._ctx)return;
    this._filtNoise(0.06,0.15,800,2); this._osc(60+Math.random()*40,'square',this._t(),0.04,0.08);
  }

  // ── 8. AMMO PICKUP — reload clunk ────────────────────────────
  // Two-layer: metallic click (triangle 320Hz) + low thud (sine 80Hz). Weight, not chime.
  _ammoPickup(){ if(!this._ctx)return; const t=this._t();
    this._osc(320,'triangle',t,0.06,0.15);
    this._osc(80,'sine',t+0.03,0.1,0.12);
    this._filtNoise(0.05,0.08,3500,4); // metal clatter
  }

  // ── Existing sounds (kept) ───────────────────────────────────
  _shoot(w='pistol'){ if(!this._ctx)return; const t=this._t();
    const freq={pistol:160,shotgun:90,smg:200}; const vol={pistol:0.25,shotgun:0.5,smg:0.12};
    this._noise(w==='shotgun'?0.18:0.12,vol[w]??0.2);
    if(freq[w]) this._osc(freq[w],'sine',t,0.08,0.15);
    if(w==='shotgun') this._osc(60,'sawtooth',t,0.12,0.3);
    if(w==='smg')     this._osc(240,'square',t,0.04,0.08);
  }
  _hit(i=0.5){ if(!this._ctx)return; this._osc(250+i*200,'square',this._t(),0.1,0.35*i); }
  _death(){ if(!this._ctx)return; const t=this._t(); [300,210,140,70].forEach((f,i)=>this._osc(f,'sine',t+i*.07,0.15,0.25)); }
  _jump(){ if(!this._ctx)return; this._sweep(180,400,'sine',this._t(),0.1,0.12); }
  _land(){ if(!this._ctx)return; this._osc(70,'sawtooth',this._t(),0.07,0.18); }
  _reload(){ if(!this._ctx)return; const t=this._t(); [440,550,660].forEach((f,i)=>this._osc(f,'triangle',t+i*.15,0.08,0.08)); }
  _emptyClick(){ if(!this._ctx)return; this._osc(300,'square',this._t(),0.06,0.15); }
  _lockedClick(){ if(!this._ctx)return; this._osc(180,'square',this._t(),0.08,0.2); }
  _fanfare(){ if(!this._ctx)return; const t=this._t(); [261.6,329.6,392,523.3].forEach((f,i)=>this._osc(f,'sine',t+i*.18,0.4,0.25)); }
  _bell(){ if(!this._ctx)return; this._osc(880,'sine',this._t(),0.7,0.35); }
  _fallThud(dmg=20){ if(!this._ctx)return; const i=Math.min(1,dmg/60);
    this._sweep(120,28,'sine',this._t(),0.18,0.5*i); this._noise(0.08,0.35*i); }

  _startDrone(){
    if(!this._ctx)return; const sr=this._ctx.sampleRate;
    const buf=this._ctx.createBuffer(1,sr*2,sr); const d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    const n=this._ctx.createBufferSource(),f=this._ctx.createBiquadFilter();
    n.buffer=buf;n.loop=true;f.type='bandpass';f.frequency.value=150;f.Q.value=0.4;
    n.connect(f).connect(this._music); n.start();
  }
  connectVoiceStream(stream){
    if(!this._ctx)return; const src=this._ctx.createMediaStreamSource(stream),g=this._g(CONFIG.audio.voiceVolume);
    src.connect(g).connect(this._master); return src;
  }
}

// ╔══════════════════════════════════════════════════════════════╗
