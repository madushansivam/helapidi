// ║  MODULE: Player                                              ║
// ║  Extended with WeaponSystem, per-weapon shooting, grenade    ║
// ║  throw, landmine plant, jetpack flame frames, recoil anim.   ║
// ╚══════════════════════════════════════════════════════════════╝
class Player {
  constructor(cfg, particles){
    this.id=cfg.id; this.label=cfg.label;
    this.color=cfg.color; this.accentColor=cfg.accentColor;
    this.particles=particles;
    this._spawnX=cfg.spawnX; this._spawnY=cfg.spawnY;
    this.width=30; this.height=40;
    this._aFrame=0; this._aTimer=0; this._aState='idle';
    this._blinkTimer=0; this._isBlinking=false;
    this._inputBuffer=[]; this._seq=0;
    this._platforms=[];
    this.wins=0; this.kills=0; this.deaths=0;
    this.isLocal=true;
    this.bullets=[];

    // ── Weapon system (one per player)
    this.weaponSystem = new WeaponSystem(cfg.id);

    // ── Jetpack flame frames (independent of movement anim)
    this._flameFrame=0;
    this._flameTimer=0;
    this._flameFPS=12;

    // ── Jetpack sputter state
    this._wasJetpacking=false;
    this._sputterActive=false;

    this.reset();
  }

  reset(){
    this.x=this._spawnX; this.y=this._spawnY;
    this.vx=0; this.vy=0;
    this.health=CONFIG.gameplay.maxHealth; this.maxHealth=CONFIG.gameplay.maxHealth;
    this.ammo=this.weaponSystem.getMag();
    this.maxAmmo=this.ammo;
    this.jetpack=CONFIG.gameplay.maxJetpack; this.maxJetpack=CONFIG.gameplay.maxJetpack;
    this.onGround=false; this.facing=1;
    this.shootCooldown=0; this.reloading=false; this.reloadTimer=0;
    this.dead=false; this.respawnTimer=0; this.bullets.length=0;
    this._inputBuffer.length=0;
    this._fallVelocity=0;
    this._wasJetpacking=false;
    this._sputterActive=false;
  }

  setPlatforms(p){ this._platforms=p; }

  update(dt, inputManager, grenadeSystem, landmineSystem){
    if(this.dead){
      this.respawnTimer-=dt;
      if(this.respawnTimer<=0) this._doRespawn();
      return;
    }
    const inp={
      left:   inputManager.isPressed(this.id,'left'),
      right:  inputManager.isPressed(this.id,'right'),
      jump:   inputManager.isPressed(this.id,'jump'),
      jetpack:inputManager.isPressed(this.id,'jetpack'),
      shoot:  inputManager.isPressed(this.id,'shoot'),
      reload: inputManager.isPressed(this.id,'reload'),
      throw:  inputManager.isPressed(this.id,'throw'),
      mine:   inputManager.wasJustPressed(this.id,'mine'),
      seq:this._seq++, dt,
    };
    this._inputBuffer.push({...inp});
    if(this._inputBuffer.length>120) this._inputBuffer.shift();
    this.applyInput(inp,dt,grenadeSystem,landmineSystem);
    this._updateAnim(dt);
    this.weaponSystem.update(dt);

    // Grenade cook
    const ws=this.weaponSystem;
    if(inp.throw && ws.activeWeapon==='grenade' && ws.getMag()>0){
      ws.startCook();
      bus.emit('grenade:cookStart',{id:this.id});
    } else if(!inp.throw && ws._isCooking){
      // Release → throw
      if(grenadeSystem){
        ws.consumeShot();
        grenadeSystem.throw(this, ws.cookProgress());
        bus.emit('grenade:thrown',{id:this.id});
      }
      ws.stopCook();
      bus.emit('grenade:cookStop',{id:this.id});
    }

    // Flame frame update
    this._flameTimer+=dt;
    if(this._flameTimer>=1/this._flameFPS){
      this._flameTimer=0;
      this._flameFrame=(this._flameFrame+1)%3;
    }
  }

  applyInput(inp, dt, grenadeSystem, landmineSystem){
    const P=CONFIG.physics, G=CONFIG.gameplay;
    const ws=this.weaponSystem;
    const wDef=CONFIG.weapons[ws.activeWeapon];

    if(inp.left){ this.vx=-P.playerSpeed; this.facing=-1; }
    else if(inp.right){ this.vx=P.playerSpeed; this.facing=1; }

    if(inp.jump&&this.onGround){
      this.vy=-P.jumpPower; this.onGround=false;
      bus.emit('player:jump',{id:this.id});
    }

    // Jetpack
    const jWasActive=this._wasJetpacking;
    if(inp.jetpack&&this.jetpack>0){
      const isSputter=this.jetpack/this.maxJetpack<0.05;
      if(!jWasActive){ this._camera?.addShake?.(2); bus.emit('jetpack:boost',{id:this.id}); }
      if(!isSputter){
        this.vy-=P.jetpackForce*dt;
        this.particles.emitJetpack(this.x+this.width/2,this.y+this.height);
      } else {
        this.particles.emitJetpackSputter(this.x+this.width/2,this.y+this.height);
        bus.emit('jetpack:sputter',{id:this.id});
      }
      this.jetpack=Math.max(0,this.jetpack-P.jetpackDrain*dt);
      this._wasJetpacking=true;
    } else {
      if(this._wasJetpacking) bus.emit('jetpack:stop',{id:this.id});
      if(this.onGround) this.jetpack=Math.min(this.maxJetpack,this.jetpack+P.jetpackRecharge*dt);
      this._wasJetpacking=false;
    }

    // Reload
    if(inp.reload&&!this.reloading&&ws.canReload()){
      this.reloading=true; this.reloadTimer=G.reloadDuration;
      bus.emit('player:reload',{id:this.id});
    }
    if(this.reloading){
      this.reloadTimer-=dt;
      if(this.reloadTimer<=0){ ws.doReload(); this.ammo=ws.getMag(); this.reloading=false; }
    }

    // Shooting (only for gun weapons)
    const isGun=['pistol','shotgun','smg'].includes(ws.activeWeapon);
    if(inp.shoot&&isGun&&this.shootCooldown<=0&&!this.reloading){
      if(ws.getMag()>0){
        // Fire pellets
        const pellets=wDef.pellets||1;
        for(let pi=0;pi<pellets;pi++){
          const spreadAngle=(Math.random()-.5)*wDef.spread;
          const spd=P.bulletSpeedX;
          const bx=this.x+this.width/2+this.facing*20, by=this.y+this.height/2;
          const cos=Math.cos(spreadAngle), sin=Math.sin(spreadAngle);
          this.bullets.push({
            x:bx, y:by,
            vx:this.facing*spd*cos - P.bulletSpeedY*sin,
            vy:P.bulletSpeedY*cos  + this.facing*spd*sin,
            damage:wDef.damage, ownerId:this.id
          });
        }
        ws.consumeShot(); this.ammo=ws.getMag();
        this.shootCooldown=wDef.fireRate||G.shootCooldown;
        this.particles.emitMuzzleFlash(this.x+this.width/2+this.facing*20, this.y+this.height/2, this.facing);
        ws.applyRecoil();
        bus.emit('player:shoot',{id:this.id,weapon:ws.activeWeapon});
      } else {
        ws.applyEmptyClick();
        bus.emit('player:emptyClick',{id:this.id});
      }
    }
    this.shootCooldown=Math.max(0,this.shootCooldown-dt);

    // Landmine plant
    if(inp.mine && ws.activeWeapon==='landmine' && this.onGround && landmineSystem){
      if(ws.getMag()>0) landmineSystem.plant(this);
    }

    // Sync ammo display
    this.ammo=ws.getMag();

    // Physics
    this.vy+=P.gravity*dt;

    this.x+=this.vx*dt;
    for(const p of this._platforms){
      if(this._ov(p)){
        if(this.vx>0)  this.x=p.x-this.width;
        else if(this.vx<0) this.x=p.x+p.w;
        this.vx=0;
      }
    }

    const prevGround=this.onGround; this.onGround=false;
    if(!prevGround) this._fallVelocity=Math.min(this.vy,this._fallVelocity);
    this.y+=this.vy*dt;
    for(const p of this._platforms){
      if(this._ov(p)){
        if(this.vy>=0){this.y=p.y-this.height;this.vy=0;this.onGround=true;}
        else{this.y=p.y+p.h;this.vy=0;}
      }
    }

    if(!prevGround&&this.onGround){
      if(this._fallVelocity<-720){
        const dmg=Math.floor((-this._fallVelocity-720)*0.06);
        if(dmg>0){this._takeDmg(dmg,'fall'); bus.emit('player:falldamage',{id:this.id,damage:dmg});}
      }
      this._fallVelocity=0;
      bus.emit('player:land',{id:this.id});
    }

    this.vx*=Math.pow(P.frictionBase,60*dt);
    const W=CONFIG.world;
    if(this.x<0){this.x=0;this.vx=0;}
    if(this.x>W.width-this.width){this.x=W.width-this.width;this.vx=0;}
    if(this.y>W.height+150) this._takeDmg(999,'void');

    for(let i=this.bullets.length-1;i>=0;i--){
      const b=this.bullets[i];
      b.x+=b.vx*dt; b.y+=b.vy*dt; b.vy+=P.bulletGravity*dt;
      if(b.x<0||b.x>W.width||b.y<0||b.y>W.height+300) this.bullets.splice(i,1);
    }
  }

  reconcile(state){
    this.x=state.x;this.y=state.y;this.vx=state.vx;this.vy=state.vy;
    this.health=state.health;this.ammo=state.ammo;this.jetpack=state.jetpack;
    this._inputBuffer=this._inputBuffer.filter(i=>i.seq>state.lastSeq);
    for(const inp of this._inputBuffer) this.applyInput(inp,inp.dt);
  }

  applyRemoteState(state,alpha=0.15){
    this.x+=(state.x-this.x)*alpha;this.y+=(state.y-this.y)*alpha;
    this.vx=state.vx;this.vy=state.vy;this.health=state.health;
    this.ammo=state.ammo;this.jetpack=state.jetpack;this.facing=state.facing;
  }

  takeDamage(amount,src){ this._takeDmg(amount,src); }

  _takeDmg(amount,src){
    if(this.dead) return;
    this.health-=amount; this._isBlinking=true; this._blinkTimer=0.18;
    this.particles.emitImpact(this.x+this.width/2,this.y+this.height/2);
    bus.emit('player:hit',{id:this.id,damage:amount,sourceId:src});
    if(this.health<=0){
      this.health=0;this.dead=true;
      this.respawnTimer=CONFIG.gameplay.respawnDelay;this.deaths++;
      this.particles.emitDeath(this.x+this.width/2,this.y+this.height/2,this.color);
      bus.emit('player:death',{id:this.id,killedBy:src});
    }
  }

  _doRespawn(){
    const pts=CONFIG.spawnPoints, pt=pts[Math.floor(Math.random()*pts.length)];
    this.x=pt.x;this.y=pt.y;this.vx=0;this.vy=0;
    this.health=this.maxHealth;this.ammo=this.weaponSystem.getMag();
    this.jetpack=this.maxJetpack;this.reloading=false;
    this.dead=false;this.bullets.length=0;
    bus.emit('player:respawn',{id:this.id});
  }

  _ov(p){ return this.x<p.x+p.w&&this.x+this.width>p.x&&this.y<p.y+p.h&&this.y+this.height>p.y; }

  _updateAnim(dt){
    const prev=this._aState;
    if(this.dead)                                          this._aState='dead';
    else if(!this.onGround&&this.jetpack<this.maxJetpack*0.98) this._aState='jetpack';
    else if(!this.onGround)                               this._aState='jump';
    else if(Math.abs(this.vx)>15)                         this._aState='run';
    else if(this.reloading)                               this._aState='reload';
    else                                                   this._aState='idle';
    if(this._aState!==prev) this._aFrame=0;
    const speeds={idle:.5,run:.1,jump:.2,jetpack:.07,reload:.18,dead:.3};
    this._aTimer+=dt;
    if(this._aTimer>=(speeds[this._aState]||.2)){this._aTimer=0;this._aFrame=(this._aFrame+1)%4;}
    if(this._isBlinking){this._blinkTimer-=dt;if(this._blinkTimer<=0)this._isBlinking=false;}
  }

  draw(ctx,cx,cy){
    if(this.dead&&this.respawnTimer<CONFIG.gameplay.respawnDelay-0.08) return;
    if(this._isBlinking&&Math.floor(this._blinkTimer*18)%2===0) return;

    const sx=this.x-cx, sy=this.y-cy;
    ctx.save();
    if(this.dead) ctx.globalAlpha=1-(this.respawnTimer/CONFIG.gameplay.respawnDelay);

    const fr=this._aFrame, st=this._aState, dir=this.facing;
    const ws=this.weaponSystem;
    const bob=st==='run'?Math.sin(fr*Math.PI)*2:0;
    const lY=this.height-16;

    ctx.translate(sx+this.width/2, sy+bob);
    if(dir===-1) ctx.scale(-1,1);

    // Legs
    ctx.fillStyle='#2a2a3a';
    if(st==='run'){
      ctx.fillRect(-9,lY-22,7,22+Math.sin(fr*Math.PI)*5);
      ctx.fillRect(2, lY-22,7,22-Math.sin(fr*Math.PI)*5);
    }else if(st==='jump'||st==='jetpack'){
      ctx.fillRect(-9,lY-16,7,14); ctx.fillRect(2,lY-16,7,14);
    }else{
      ctx.fillRect(-9,lY-22,7,22); ctx.fillRect(2,lY-22,7,22);
    }
    // Boots
    ctx.fillStyle='#1a1a2a';
    if(st!=='jump'&&st!=='jetpack'){ ctx.fillRect(-10,lY-3,9,5); ctx.fillRect(1,lY-3,9,5); }

    // Body
    ctx.fillStyle=this.color;
    ctx.beginPath(); ctx.roundRect(-15,2,30,lY-2,5); ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.roundRect(-15,lY/2,30,lY/2,5); ctx.fill();
    ctx.fillStyle=this.accentColor||this.color;
    ctx.fillRect(-15,6,30,3);

    // ── Jetpack with 3-frame flame flicker ────────────────────
    if(this.jetpack<this.maxJetpack*0.98||st==='jetpack'){
      ctx.fillStyle='#333';
      ctx.beginPath(); ctx.roundRect(-20,5,7,18,2); ctx.fill();

      if(st==='jetpack'){
        const ff=this._flameFrame; // 0,1,2
        const fuelPct=this.jetpack/this.maxJetpack;
        const isSputter=fuelPct<0.05;

        // Frame 0: tall flame  Frame 1: medium  Frame 2: wide+short
        const flameH =[14,10,8][ff];
        const flameW =[5, 7, 9][ff];
        const flameOX=[-1,0, -2][ff];
        const hue    =isSputter ? 0 : [20,35,15][ff];
        const lit    =isSputter ? [40,55,50][ff] : [55,65,60][ff];

        // Outer flame
        ctx.fillStyle=`hsl(${hue},100%,${lit}%)`;
        ctx.shadowColor=`hsl(${hue},100%,70%)`;
        ctx.shadowBlur=8;
        ctx.beginPath();
        ctx.moveTo(-20+flameOX, 23);
        ctx.lineTo(-20+flameOX-flameW/2, 23+flameH);
        ctx.lineTo(-20+flameOX+flameW, 23+flameH*0.7);
        ctx.lineTo(-20+flameOX+flameW/2, 23+flameH);
        ctx.lineTo(-20+flameOX+flameW*1.2, 23);
        ctx.fill();

        // Inner hot core
        ctx.fillStyle=`rgba(255,255,200,0.7)`;
        ctx.shadowBlur=0;
        ctx.beginPath();
        ctx.moveTo(-18+flameOX, 23);
        ctx.lineTo(-18+flameOX, 23+flameH*0.45);
        ctx.lineTo(-14+flameOX, 23);
        ctx.fill();

        ctx.shadowBlur=0;
      }
    }

    // Arms
    ctx.fillStyle=this.color;
    const armSwing=st==='run'?Math.sin(fr*Math.PI)*0.5:0;
    ctx.save(); ctx.translate(-15,10); ctx.rotate(-armSwing-0.15);
    ctx.beginPath(); ctx.roundRect(-3,0,6,16,3); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(15,8);  ctx.rotate(armSwing+0.2);
    ctx.beginPath(); ctx.roundRect(-3,0,6,16,3); ctx.fill(); ctx.restore();

    // ── Weapon sprite with recoil offset ──────────────────────
    const recoilX = ws.getRecoilX();
    const activeW = ws.activeWeapon;

    ctx.save();
    ctx.translate(recoilX, ws.getSlideY()*0.25); // subtle body slide

    if(activeW==='pistol'||activeW==='smg'){
      ctx.fillStyle='#1a1a1a';
      const barrelW=activeW==='smg'?18:24;
      ctx.beginPath(); ctx.roundRect(9,7,barrelW,6,2); ctx.fill();
      ctx.fillStyle='#333'; ctx.fillRect(9+barrelW,8,4,3);
      ctx.fillStyle='rgba(255,200,0,0.6)'; ctx.fillRect(10,8,5,4);
      if(activeW==='smg'){
        ctx.fillStyle='#444'; ctx.fillRect(15,12,6,4); // mag
      }
    }else if(activeW==='shotgun'){
      ctx.fillStyle='#3d2b1f';
      ctx.beginPath(); ctx.roundRect(5,6,28,8,3); ctx.fill();
      // Double barrel
      ctx.fillStyle='#222';
      ctx.fillRect(30,7,6,3); ctx.fillRect(30,11,6,3);
      ctx.fillStyle='#5d4037'; ctx.fillRect(5,7,12,6); // stock
    }else if(activeW==='grenade'){
      // Show grenade in hand
      ctx.fillStyle='#3a3a3a';
      ctx.beginPath(); ctx.ellipse(18,9,6,8,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#888'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(18,1,3,0,Math.PI*2); ctx.stroke();
      // Cook pulse
      if(ws._isCooking){
        const cpct=ws.cookProgress();
        ctx.fillStyle=`rgba(255,${80-cpct*80},0,${0.4+cpct*0.5})`;
        ctx.beginPath(); ctx.ellipse(18,9,6,8,0,0,Math.PI*2); ctx.fill();
      }
    }else if(activeW==='landmine'){
      ctx.fillStyle='#555';
      ctx.beginPath(); ctx.ellipse(16,12,10,5,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#FF4444';
      ctx.beginPath(); ctx.arc(16,8,2,0,Math.PI*2); ctx.fill();
    }else{ // fallback
      ctx.fillStyle='#1a1a1a';
      ctx.beginPath(); ctx.roundRect(9,7,24,6,2); ctx.fill();
    }
    ctx.restore();

    // Head
    ctx.fillStyle='#F5C6A0';
    ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=this.accentColor||this.color;
    ctx.beginPath(); ctx.arc(0,-2,12,Math.PI,0); ctx.fill();
    ctx.fillStyle='rgba(100,200,255,0.7)'; ctx.fillRect(-8,0,10,5);
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(5.5,2.5,3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(6.5,2.5,2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(7,1.5,0.8,0,Math.PI*2); ctx.fill();

    ctx.restore();

    this._drawHpBar(ctx,sx,sy);
    this._drawBullets(ctx,cx,cy);

    ctx.save();
    ctx.font='bold 10px monospace'; ctx.textAlign='center';
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(sx+this.width/2-22,sy-30,44,14);
    ctx.fillStyle=this.color; ctx.fillText(this.label,sx+this.width/2,sy-19);
    ctx.restore();
  }

  _drawHpBar(ctx,sx,sy){
    const bw=44,bh=5,bx=sx-7,by=sy-16;
    const pct=Math.max(0,this.health/this.maxHealth);
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle=`hsl(${pct*120},85%,42%)`; ctx.fillRect(bx,by,bw*pct,bh);
    ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1; ctx.strokeRect(bx,by,bw,bh);
    // Ammo pips (show current mag)
    const maxPips=CONFIG.weapons[this.weaponSystem.activeWeapon]?.mag||10;
    const pipW=(bw-2)/maxPips;
    for(let i=0;i<this.ammo&&i<maxPips;i++){
      ctx.fillStyle='rgba(0,229,255,0.8)';
      ctx.fillRect(bx+1+i*pipW,by+bh+1,pipW-0.5,2);
    }
  }

  _drawBullets(ctx,cx,cy){
    ctx.save(); ctx.fillStyle='#FFD700'; ctx.shadowColor='rgba(255,220,0,0.8)'; ctx.shadowBlur=6;
    for(const b of this.bullets){ ctx.beginPath(); ctx.arc(b.x-cx,b.y-cy,4,0,Math.PI*2); ctx.fill(); }
    ctx.shadowBlur=0; ctx.restore();
  }

  getState(){
    return{id:this.id,x:this.x,y:this.y,vx:this.vx,vy:this.vy,
      health:this.health,ammo:this.ammo,jetpack:this.jetpack,facing:this.facing};
  }
}

// ╔══════════════════════════════════════════════════════════════╗
