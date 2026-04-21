// ║  MODULE: AmmoCrateSystem                                     ║
// ║  World-space ammo crates: bob, glow, pickup flash.           ║
// ╚══════════════════════════════════════════════════════════════╝
class AmmoCrateSystem {
  constructor(particles, hudAnimator){
    this._particles   = particles;
    this._hud         = hudAnimator;
    this._crates      = [];
    this._timer       = 8; // first spawn sooner
    this._platforms   = [];
    this._time        = 0;
    this._pickupFlash = []; // { x,y,alpha,timer }
  }
  setPlatforms(p){ this._platforms=p; }

  _spawn(){
    const woodPlats = this._platforms.filter(p=>p.type==='wood');
    if(!woodPlats.length) return;
    const p = woodPlats[Math.floor(Math.random()*woodPlats.length)];
    const x = p.x + p.w*0.2 + Math.random()*p.w*0.6;
    const y = p.y - 20;
    // Avoid duplicate crates too close
    if(this._crates.some(c=>!c.collected&&Math.abs(c.x-x)<80)) return;
    this._crates.push({
      x, y,
      phase: Math.random()*Math.PI*2, // bob phase offset
      glowPhase: Math.random()*Math.PI*2,
      collected: false,
      flashAlpha: 0,
    });
  }

  update(dt, players){
    this._time += dt;

    // Spawn timer
    this._timer -= dt;
    const activeCrates = this._crates.filter(c=>!c.collected).length;
    if(this._timer<=0 && activeCrates<CONFIG.ammoCrate.maxCrates){
      this._spawn();
      this._timer = CONFIG.ammoCrate.spawnInterval;
    }

    // Pickup flash decay
    for(let i=this._pickupFlash.length-1;i>=0;i--){
      const f=this._pickupFlash[i];
      f.timer -= dt;
      if(f.timer<=0) this._pickupFlash.splice(i,1);
    }

    // Collect check
    for(const crate of this._crates){
      if(crate.collected) continue;
      const bobY = Math.sin(this._time*Math.PI+crate.phase)*5;
      for(const p of players){
        if(p.dead) continue;
        const px=p.x+p.width/2, py=p.y+p.height/2;
        const dx=px-crate.x, dy=py-(crate.y+bobY);
        if(dx*dx+dy*dy < 32*32){
          crate.collected = true;
          // Refill active weapon's reserve
          p.weaponSystem.refillAmmo(CONFIG.ammoCrate.ammoRefill);
          this._particles.emitPickupFlash(crate.x, crate.y+bobY);
          this._hud.addFloatText(crate.x, crate.y, `+${CONFIG.ammoCrate.ammoRefill} AMMO`, '#00e5ff');
          bus.emit('ammocrate:collected', { playerId:p.id });
        }
      }
    }
  }

  draw(ctx, cx, cy){
    const t = this._time;
    ctx.save();
    for(const crate of this._crates){
      if(crate.collected) continue;
      const sx = crate.x - cx;
      const bobY = Math.sin(t*Math.PI+crate.phase)*5;
      const sy = crate.y + bobY - cy;
      if(sx<-60||sx>ctx.canvas.width+60) continue;

      const glowAlpha = 0.4+Math.sin(t*((Math.PI*2)/1.5)+crate.glowPhase)*0.35;

      ctx.save();
      ctx.translate(sx, sy);

      // Glow ring
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur  = 14*glowAlpha*2;
      ctx.strokeStyle = `rgba(0,255,136,${glowAlpha})`;
      ctx.lineWidth   = 2;
      ctx.strokeRect(-12,-12,24,24);
      ctx.shadowBlur = 0;

      // Crate body
      ctx.fillStyle = '#2a5c2a';
      ctx.fillRect(-12,-12,24,24);

      // Cross stripes
      ctx.fillStyle = '#1a3d1a';
      ctx.fillRect(-12,-2,24,4);
      ctx.fillRect(-2,-12,4,24);

      // Bolt corners
      ctx.fillStyle = '#5c9c5c';
      for(const [bx,by] of [[-9,-9],[7,-9],[-9,7],[7,7]]){
        ctx.fillRect(bx,by,2,2);
      }

      // Bullet icon
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(-2,-5,4,10);
      ctx.beginPath(); ctx.arc(0,-5,2,0,Math.PI*2); ctx.fill();

      ctx.restore();
    }
    ctx.restore();
  }
}

// ╔══════════════════════════════════════════════════════════════╗
