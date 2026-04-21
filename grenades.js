// ║  MODULE: GrenadeSystem                                       ║
// ║  Thrown grenades: parabolic arc, rotation, cook pulse,       ║
// ║  explosion ring + debris + screen shake.                     ║
// ╚══════════════════════════════════════════════════════════════╝
class GrenadeSystem {
  constructor(particles, camera){
    this._particles = particles;
    this._camera    = camera;
    this._grenades  = []; // live projectiles
    this._explosions= []; // expanding rings
  }

  throw(player, cookProgress){
    const dir = player.facing;
    const g = {
      x:   player.x + player.width/2 + dir*14,
      y:   player.y + 12,
      vx:  dir*(360+cookProgress*80),
      vy:  -520 + cookProgress*180, // cooked = lower arc
      rot: 0,
      rotSpeed: dir*8,
      cooked: cookProgress,
      timer: 0,
      fuseTime: CONFIG.weapons.grenade.cookTime*(1-cookProgress) + 0.5,
      ownerId: player.id,
      exploding: false,
    };
    this._grenades.push(g);
  }

  update(dt, players){
    for(let i=this._grenades.length-1;i>=0;i--){
      const g = this._grenades[i];
      if(g.exploding){ this._grenades.splice(i,1); continue; }

      g.x   += g.vx*dt;
      g.y   += g.vy*dt;
      g.vy  += CONFIG.physics.gravity*dt;
      g.rot += g.rotSpeed*dt;
      g.timer += dt;

      // Bounce off ground
      if(g.y > CONFIG.world.height - 70){ g.y=CONFIG.world.height-70; g.vy*=-0.4; g.vx*=0.7; }

      // Fuse expired → explode
      if(g.timer >= g.fuseTime){
        this._explode(g, players);
        g.exploding=true;
      }
    }

    // Update explosion rings
    for(let i=this._explosions.length-1;i>=0;i--){
      const e=this._explosions[i];
      e.timer += dt;
      e.radius += 240*dt;
      e.alpha   = Math.max(0,1-(e.timer/e.duration));
      if(e.timer >= e.duration) this._explosions.splice(i,1);
    }
  }

  _explode(g, players){
    const {x,y} = g;
    // Debris + shockwave
    this._particles.emitExplosionDebris(x,y,8,'#FF4400');
    this._particles.emitExplosionDebris(x,y,6,'#FF8800');
    this._particles.emitImpact(x,y);
    this._explosions.push({ x,y,radius:0,alpha:1,timer:0,duration:0.5, type:'grenade' });
    this._camera.addShake(6);

    // Damage players in radius
    const R = CONFIG.weapons.grenade.radius;
    for(const p of players){
      if(p.dead) continue;
      const px=p.x+p.width/2, py=p.y+p.height/2;
      const dist=Math.sqrt((px-x)**2+(py-y)**2);
      if(dist<R){
        const dmg = Math.floor(CONFIG.weapons.grenade.damage*(1-dist/R));
        if(dmg>0) p.takeDamage(dmg, g.ownerId);
      }
    }
    bus.emit('grenade:explode',{x,y});
  }

  draw(ctx, cx, cy, time){
    ctx.save();

    // Draw live grenades
    for(const g of this._grenades){
      const sx=g.x-cx, sy=g.y-cy;
      if(sx<-60||sx>ctx.canvas.width+60) continue;
      ctx.save();
      ctx.translate(sx,sy);
      ctx.rotate(g.rot);

      // Cook pulse: red glow when cooked > cookTime * 0.5
      const cookPct = g.timer/g.fuseTime;
      if(cookPct > 0.5){
        const pulse = Math.sin(time*20*(1+cookPct))*0.5+0.5;
        ctx.shadowColor=`rgba(255,50,0,${pulse*0.9})`;
        ctx.shadowBlur =12*pulse;
      }

      // Grenade body
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath(); ctx.ellipse(0,0,7,9,0,0,Math.PI*2); ctx.fill();

      // Pin ring
      ctx.strokeStyle='#888'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(0,-9,3,0,Math.PI*2); ctx.stroke();

      // Segmentation lines
      ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(-7,0); ctx.lineTo(7,0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-9); ctx.lineTo(0,9); ctx.stroke();

      // Fuse dot (blinks faster near explosion)
      const blinkRate = 8+cookPct*20;
      if(Math.sin(time*blinkRate)>0){
        ctx.fillStyle = cookPct>0.7 ? '#ff2200' : '#ff8800';
        ctx.beginPath(); ctx.arc(0,-9,2.5,0,Math.PI*2); ctx.fill();
      }

      ctx.shadowBlur=0;
      ctx.restore();
    }

    // Draw explosion rings
    for(const e of this._explosions){
      const sx=e.x-cx, sy=e.y-cy;
      ctx.save();
      // Outer shockwave ring
      ctx.strokeStyle=`rgba(255,140,0,${e.alpha*0.8})`;
      ctx.lineWidth  = 4*(1-e.timer/e.duration)+1;
      ctx.beginPath(); ctx.arc(sx,sy,e.radius,0,Math.PI*2); ctx.stroke();
      // Inner heat ring
      ctx.strokeStyle=`rgba(255,240,100,${e.alpha*0.6})`;
      ctx.lineWidth  = 2;
      ctx.beginPath(); ctx.arc(sx,sy,e.radius*0.55,0,Math.PI*2); ctx.stroke();
      // Hot centre
      if(e.timer < 0.12){
        const cAlpha=(1-e.timer/0.12)*0.8;
        const grad=ctx.createRadialGradient(sx,sy,0,sx,sy,e.radius*0.4);
        grad.addColorStop(0,`rgba(255,255,200,${cAlpha})`);
        grad.addColorStop(1,`rgba(255,100,0,0)`);
        ctx.fillStyle=grad;
        ctx.beginPath(); ctx.arc(sx,sy,e.radius*0.4,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }
}

// ╔══════════════════════════════════════════════════════════════╗
