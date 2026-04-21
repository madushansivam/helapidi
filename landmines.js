// ║  MODULE: LandmineSystem                                      ║
// ║  Plant → arm → proximity trigger → delayed explosion.        ║
// ╚══════════════════════════════════════════════════════════════╝
class LandmineSystem {
  constructor(particles, camera){
    this._particles = particles;
    this._camera    = camera;
    this._mines     = [];
    this._explosions= [];
  }

  plant(player){
    // Consume one mine from weapon system
    const ws = player.weaponSystem;
    if(!ws.consumeShot()) return;

    this._mines.push({
      x: player.x + player.width/2,
      y: player.y + player.height - 4,
      ownerId: player.id,
      state: 'planting', // planting → armed → triggered → exploding
      plantTimer: 0,
      plantDuration: 0.3,
      pulseTimer: 0,
      triggerTimer: -1,  // countdown before explosion
      triggered: false,
    });
    bus.emit('mine:planted',{playerId:player.id});
  }

  update(dt, players){
    const TRIGGER_R = 45; // proximity radius

    for(let i=this._mines.length-1;i>=0;i--){
      const m=this._mines[i];

      if(m.state==='planting'){
        m.plantTimer += dt;
        if(m.plantTimer>=m.plantDuration) m.state='armed';
      }

      if(m.state==='armed'){
        m.pulseTimer += dt;
        // Check proximity for enemy players
        for(const p of players){
          if(p.dead || p.id===m.ownerId) continue;
          const px=p.x+p.width/2, py=p.y+p.height/2;
          if((px-m.x)**2+(py-m.y)**2 < TRIGGER_R**2){
            m.state='triggered';
            m.triggerTimer=0.5;
            bus.emit('mine:triggered',{x:m.x,y:m.y});
            break;
          }
        }
      }

      if(m.state==='triggered'){
        m.triggerTimer -= dt;
        if(m.triggerTimer<=0){
          this._explode(m, players);
          m.state='exploding';
          this._mines.splice(i,1);
        }
      }
    }

    // Update explosion rings
    for(let i=this._explosions.length-1;i>=0;i--){
      const e=this._explosions[i];
      e.timer  += dt;
      e.radius += 280*dt;
      e.alpha   = Math.max(0,1-(e.timer/e.duration));
      if(e.timer>=e.duration) this._explosions.splice(i,1);
    }
  }

  _explode(m, players){
    const {x,y} = m;
    this._particles.emitExplosionDebris(x,y,8,'#FF4400');
    this._particles.emitDirt(x,y,14);
    this._particles.emitImpact(x,y);
    this._explosions.push({x,y,radius:0,alpha:1,timer:0,duration:0.6,type:'mine'});
    this._camera.addShake(8);

    const R=CONFIG.weapons.landmine.radius;
    for(const p of players){
      if(p.dead) continue;
      const px=p.x+p.width/2, py=p.y+p.height/2;
      const dist=Math.sqrt((px-x)**2+(py-y)**2);
      if(dist<R){
        const dmg=Math.floor(CONFIG.weapons.landmine.damage*(1-dist/R));
        if(dmg>0) p.takeDamage(dmg,m.ownerId);
      }
    }
    bus.emit('mine:explode',{x,y});
  }

  draw(ctx, cx, cy, time){
    ctx.save();

    for(const m of this._mines){
      const sx=m.x-cx;
      const baseSY=m.y-cy;
      if(sx<-40||sx>ctx.canvas.width+40) continue;

      const plantPct = m.state==='planting' ? (m.plantTimer/m.plantDuration) : 1;
      const mineH=10*plantPct;
      const sy = baseSY - mineH*0.5; // lowers into ground

      ctx.save();
      ctx.translate(sx, sy);

      if(m.state==='triggered'){
        // Proximity glow — yellow
        const pulse=Math.sin(time*25)*0.5+0.5;
        ctx.shadowColor=`rgba(255,220,0,${0.6+pulse*0.4})`;
        ctx.shadowBlur =16+pulse*8;
      } else if(m.state==='armed'){
        // Armed pulse — slow red every 2s
        const pulse=Math.pow(Math.max(0,Math.sin(time*Math.PI)),3);
        ctx.shadowColor=`rgba(255,30,30,${pulse*0.8})`;
        ctx.shadowBlur =8*pulse;
      }

      // Mine disc body
      ctx.fillStyle = m.state==='triggered' ? '#ffcc00' : (m.state==='planting' ? '#555' : '#444');
      ctx.beginPath();
      ctx.ellipse(0,0,14,mineH*0.5+1,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=1;
      ctx.stroke();

      // Top prongs (armed state)
      if(m.state==='armed'||m.state==='triggered'){
        ctx.fillStyle='#888';
        for(let j=-1;j<=1;j+=2){
          ctx.fillRect(j*5-1,-mineH*0.5-3,2,3);
        }
        // Centre LED
        const led=m.state==='triggered'
          ? `rgba(255,220,0,${Math.sin(time*25)*0.5+0.5})`
          : `rgba(255,50,50,${Math.pow(Math.max(0,Math.sin(time*Math.PI)),3)*0.9+0.1})`;
        ctx.fillStyle=led;
        ctx.beginPath(); ctx.arc(0,-mineH*0.5,2,0,Math.PI*2); ctx.fill();
      }

      ctx.shadowBlur=0;
      ctx.restore();
    }

    // Explosion rings (same style as grenade)
    for(const e of this._explosions){
      const sx=e.x-cx, sy=e.y-cy;
      ctx.save();
      ctx.strokeStyle=`rgba(255,160,0,${e.alpha*0.8})`;
      ctx.lineWidth=5*(1-e.timer/e.duration)+1;
      ctx.beginPath(); ctx.arc(sx,sy,e.radius,0,Math.PI*2); ctx.stroke();
      ctx.strokeStyle=`rgba(180,80,0,${e.alpha*0.5})`;
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(sx,sy,e.radius*0.6,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}

// ╔══════════════════════════════════════════════════════════════╗
