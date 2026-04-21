// ║  MODULE: GameLoop  (Orchestrator)                            ║
// ║  Ticks all modules in correct order. Central update/render.  ║
// ╚══════════════════════════════════════════════════════════════╝
class GameLoop {
  constructor(){
    this._canvas    = document.getElementById('gameCanvas');
    this._ctx       = this._canvas.getContext('2d');
    this._mmCanvas  = document.getElementById('minimap');
    this._particles = new ParticleSystem();
    this._input     = new InputManager();
    this._audio     = new AudioManager();
    this._network   = new NetworkManager();
    this._camera    = new Camera(this._canvas.width, this._canvas.height);
    this._ui        = new UIManager(this._canvas, this._mmCanvas);
    this._hud       = new HUDAnimator();
    this._platforms = CONFIG.platforms;

    this._players = CONFIG.players.map(cfg=>{
      const p=new Player(cfg,this._particles);
      p.isLocal=true; p.setPlatforms(this._platforms); return p;
    });

    // Pass camera ref to player for jetpack shake (via bus — already wired)

    // New systems
    this._ammoCrates  = new AmmoCrateSystem(this._particles, this._hud);
    this._grenades    = new GrenadeSystem(this._particles, this._camera);
    this._landmines   = new LandmineSystem(this._particles, this._camera);
    this._ammoCrates.setPlatforms(this._platforms);

    this._running=false; this._lastTime=null;
    this._frameCount=0; this._fpsAccum=0; this._fps=0;
    this._roundActive=false; this._time=0;
    this._clouds=this._genClouds(14);

    // Coin system
    this._coins=[]; this._coinsCollected=0;
    this._coinCountEl=document.getElementById('coinCount');
    this._coinTotalEl=document.getElementById('coinTotal');
    this._initCoins();

    // Fall damage HUD
    this._fallDmgHudTimer=0;
    this._healthBarWrap=document.getElementById('healthBarWrap');
    this._healthBarInner=document.getElementById('healthBarInner');
    this._fallDmgLabel=document.getElementById('fallDmgLabel');

    // Expose globals for HTML onclick
    window.resetGame   = ()=>this.resetRound();
    window.setCameraMode=(m)=>this._camera.setMode(m);

    this._bindGameEvents();
  }

  _bindGameEvents(){
    bus.on('player:death',({id,killedBy})=>{
      const killer=this._players.find(p=>p.id===killedBy);
      if(killer) killer.kills++;
    });
    bus.on('player:falldamage',({id,damage})=>{
      this._fallDmgHudTimer=2.0; this._updateHealthBarHUD();
      if(this._fallDmgLabel) this._fallDmgLabel.style.display='block';
    });
    bus.on('coin:collected',({total})=>{
      if(this._coinCountEl) this._coinCountEl.textContent=total;
      this._hud.flashCoin();
    });
    bus.on('weapon:trySwitch',({slot,playerId})=>{
      const p=this._players.find(pl=>pl.id===playerId);
      if(p) p.weaponSystem.trySwitch(slot);
    });
  }

  // ── MODULE_3: Coins ──────────────────────────────────────────
  _initCoins(){
    const spawnXY=[
      [300,820],[550,560],[180,460],[430,345],[80,240],
      [700,730],[850,415],[1150,650],[1100,490],[1350,330],
      [1400,135],[1720,590],[1780,420],[2110,730],[2310,650],
      [2530,550],[2660,450],[2750,340],[2800,240],[2460,175],
    ];
    this._coins=spawnXY.map(([x,y])=>({x,y:y-20,r:10,angle:Math.random()*Math.PI*2,collected:false}));
    if(this._coinTotalEl) this._coinTotalEl.textContent=this._coins.length;
  }

  _resetCoins(){
    this._coinsCollected=0;
    this._coins.forEach(c=>{c.collected=false;});
    if(this._coinCountEl) this._coinCountEl.textContent='0';
  }

  _updateHealthBarHUD(){
    if(!this._healthBarInner||!this._healthBarWrap) return;
    const p=this._players[0], pct=Math.max(0,p.health/p.maxHealth)*100;
    this._healthBarInner.style.width=`${pct}%`;
    this._healthBarInner.style.background=pct>50?'linear-gradient(90deg,#33cc33,#66ff66)':pct>25?'linear-gradient(90deg,#ffaa00,#ffdd33)':'linear-gradient(90deg,#ff3333,#ff6666)';
    this._healthBarWrap.style.display='block';
  }

  async init(wsUrl,roomId){
    this._input.init(this._canvas);
    this._audio.init();
    if(wsUrl){
      this._network.connect(wsUrl,roomId,'Player');
      bus.once('network:playerId',id=>{this._players.forEach(p=>{p.isLocal=(p.id===id);});});
    }
    bus.emit('game:roundStart');
    this._roundActive=true;
    this._start();
  }

  _start(){ this._running=true; this._lastTime=null; requestAnimationFrame(ts=>this._frame(ts)); }
  stop(){ this._running=false; }

  _frame(ts){
    if(!this._running) return;
    if(this._lastTime===null) this._lastTime=ts;
    const dt=Math.min((ts-this._lastTime)/1000,0.05);
    this._lastTime=ts; this._time+=dt;

    this._fpsAccum+=dt; this._frameCount++;
    if(this._fpsAccum>=0.5){
      this._fps=Math.round(this._frameCount/this._fpsAccum);
      this._frameCount=0; this._fpsAccum=0;
      this._ui.updateDebug(this._fps,this._network.ping);
    }

    this._update(dt);
    this._render();
    this._input.flush();
    requestAnimationFrame(ts=>this._frame(ts));
  }

  _update(dt){
    if(!this._roundActive) return;

    for(const p of this._players){
      if(p.isLocal){
        p.update(dt, this._input, this._grenades, this._landmines);
        if(this._network.isOnline) this._network.sendInput({seq:p._seq,dt,...(p._inputBuffer.at(-1)||{})});
      }
    }

    const ticks=this._network.drainStateBuffer();
    for(const tick of ticks){
      for(const state of(tick.states||[])){
        const p=this._players.find(pl=>pl.id===state.id); if(!p) continue;
        if(p.isLocal) p.reconcile(state); else p.applyRemoteState(state,0.15);
      }
    }

    this._checkBullets();
    this._particles.update(dt);

    // ── Coin spin + collect ──────────────────────────────────
    const COLLECT_R=28;
    for(const coin of this._coins){
      if(coin.collected) continue;
      coin.angle+=dt*Math.PI*2; // exactly 1s full X-flip cycle (2π per second)
      for(const p of this._players){
        if(p.dead) continue;
        const px=p.x+p.width/2,py=p.y+p.height/2;
        const dx=px-coin.x,dy=py-coin.y;
        if(dx*dx+dy*dy<COLLECT_R*COLLECT_R){
          coin.collected=true; this._coinsCollected++;
          // HUD coin counter is at top-right — estimate world-space target
          const cam=this._camera;
          const hudWorldX=cam.x+this._canvas.width-50;
          const hudWorldY=cam.y+20;
          this._particles.emitCoinBurst(coin.x, coin.y, hudWorldX, hudWorldY);
          bus.emit('coin:collected',{total:this._coinsCollected});
          break;
        }
      }
    }

    // ── New systems ──────────────────────────────────────────
    this._ammoCrates.update(dt, this._players);
    this._grenades.update(dt, this._players);
    this._landmines.update(dt, this._players);
    this._hud.update(dt);
    this._hud.updateFuelBars(this._players);

    // ── Camera ───────────────────────────────────────────────
    const active=this._players.filter(p=>!p.dead);
    this._camera.update(active.length?active:this._players);
    this._ui.updateTimers(dt);
    this._checkRoundOver();

    // ── Fall damage HUD auto-hide ────────────────────────────
    if(this._fallDmgHudTimer>0){
      this._fallDmgHudTimer-=dt; this._updateHealthBarHUD();
      if(this._fallDmgHudTimer<=0){
        if(this._healthBarWrap) this._healthBarWrap.style.display='none';
        if(this._fallDmgLabel)  this._fallDmgLabel.style.display='none';
      }
    }
  }

  _render(){
    const ctx=this._ctx,cam=this._camera;
    const W=this._canvas.width,H=this._canvas.height;
    ctx.clearRect(0,0,W,H);

    if(cam.mode==='split'&&this._players.length>=2){
      this._renderSplit(ctx,W,H);
    }else{
      ctx.save();
      ctx.scale(cam.zoom,cam.zoom);
      this._renderScene(ctx,cam.x+cam.shakeX,cam.y+cam.shakeY);
      ctx.restore();
    }

    this._ui.drawCanvasUI(ctx,this._players,this._platforms,cam,this._hud);
    this._ui.drawMinimap(this._players,this._platforms,cam);
    this._ui.updateHUD(this._players);
  }

  _renderSplit(ctx,W,H){
    const[p1,p2]=this._players,hw=W/2;
    ctx.save(); ctx.beginPath(); ctx.rect(0,0,hw,H); ctx.clip();
    const v1=this._camera.getVpForPlayer(p1,hw,H);
    this._renderScene(ctx,v1.x,v1.y); ctx.restore();
    ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(hw,0); ctx.lineTo(hw,H); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.rect(hw,0,hw,H); ctx.clip();
    ctx.translate(hw,0);
    const v2=this._camera.getVpForPlayer(p2,hw,H);
    this._renderScene(ctx,v2.x,v2.y); ctx.restore();
  }

  _renderScene(ctx,cx,cy){
    this._drawBg(ctx,cx);
    this._drawPlatforms(ctx,cx,cy);
    this._drawCoins(ctx,cx,cy);
    this._ammoCrates.draw(ctx,cx,cy);
    this._grenades.draw(ctx,cx,cy,this._time);
    this._landmines.draw(ctx,cx,cy,this._time);
    this._particles.draw(ctx,cx,cy);
    this._hud.drawWorldTexts(ctx,cx,cy);
    for(const p of this._players) p.draw(ctx,cx,cy);
  }

  // ── Background ───────────────────────────────────────────────
  _drawBg(ctx,cx){
    const W=this._canvas.width,H=this._canvas.height;
    const gr=ctx.createLinearGradient(0,0,0,H);
    gr.addColorStop(0,'#4A90C8');gr.addColorStop(0.5,'#87CEEB');gr.addColorStop(1,'#B0E0F0');
    ctx.fillStyle=gr; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(80,100,140,0.25)';
    const mx=-(cx*0.05)%W;
    for(let i=-1;i<2;i++){
      ctx.beginPath(); ctx.moveTo(mx+i*W,H);
      for(let x=0;x<=W;x+=40){
        const h=60+Math.sin((x+i*W+cx*0.02)*0.02)*40+Math.sin((x+i*W)*0.05)*20;
        ctx.lineTo(mx+i*W+x,H-h);
      }
      ctx.lineTo(mx+i*W+W,H); ctx.fill();
    }
    const off=-(cx*0.2)%(W+300);
    ctx.fillStyle='rgba(255,255,255,0.8)';
    ctx.shadowColor='rgba(180,210,255,0.5)'; ctx.shadowBlur=14;
    for(const c of this._clouds){
      const px=((c.x+off)%(W+300)+W+300)%(W+300)-150;
      ctx.save(); ctx.globalAlpha=0.65+c.a*0.25;
      ctx.beginPath();
      ctx.arc(px,c.y,c.r,0,Math.PI*2);
      ctx.arc(px+c.r,c.y,c.r*.7,0,Math.PI*2);
      ctx.arc(px-c.r*.7,c.y,c.r*.55,0,Math.PI*2);
      ctx.fill(); ctx.restore();
    }
    ctx.shadowBlur=0;
  }

  _drawPlatforms(ctx,cx,cy){
    ctx.save();
    for(const p of this._platforms){
      const sx=p.x-cx,sy=p.y-cy,sw=p.w,sh=p.h;
      if(sx+sw<-10||sx>this._canvas.width+10) continue;
      ctx.fillStyle=p.type==='ground'?'#4E342E':'#6D4C41'; ctx.fillRect(sx,sy,sw,sh);
      ctx.fillStyle=p.type==='ground'?'#5D4037':'#795548'; ctx.fillRect(sx,sy,sw,Math.min(5,sh));
      ctx.fillStyle='rgba(0,0,0,0.1)';
      for(let i=0;i<sw;i+=16) ctx.fillRect(sx+i,sy,1.5,sh);
      ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.fillRect(sx,sy+sh-3,sw,3);
      if(p.type==='ground'){
        ctx.fillStyle='#558B2F'; ctx.fillRect(sx,sy,sw,4);
        ctx.fillStyle='#7CB342';
        for(let gx=0;gx<sw;gx+=8){
          ctx.beginPath(); ctx.moveTo(sx+gx,sy); ctx.lineTo(sx+gx+2,sy-4); ctx.lineTo(sx+gx+4,sy); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // ── Coins with bob + 3D spin ─────────────────────────────────
  _drawCoins(ctx,cx,cy){
    ctx.save();
    for(const coin of this._coins){
      if(coin.collected) continue;
      const sx=coin.x-cx;
      if(sx<-30||sx>this._canvas.width+30) continue;

      // 2s Y bob cycle: π rad/s → full cycle = 2s
      const bobY=Math.sin(coin.angle*0.5)*5;
      // 1s X spin: coin.angle already ticks at 2π/s → cos(angle) = 1s cycle
      const spinScale=Math.abs(Math.cos(coin.angle));

      const sy=coin.y+bobY-cy;

      ctx.save();
      ctx.translate(sx,sy);
      ctx.scale(Math.max(0.1,spinScale),1);

      ctx.shadowColor='rgba(255,215,0,0.7)'; ctx.shadowBlur=10;
      ctx.fillStyle='#FFD700';
      ctx.beginPath(); ctx.arc(0,0,coin.r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#FFA500';
      ctx.beginPath(); ctx.arc(2,2,coin.r*0.65,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,180,0.7)';
      ctx.beginPath(); ctx.arc(-3,-3,coin.r*0.35,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
      ctx.restore();

      ctx.strokeStyle='rgba(255,215,0,0.2)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(sx,sy,coin.r+5,0,Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }

  _checkBullets(){
    for(let si=0;si<this._players.length;si++){
      const sh=this._players[si];
      for(let bi=sh.bullets.length-1;bi>=0;bi--){
        const b=sh.bullets[bi]; let hit=false;
        for(let ti=0;ti<this._players.length;ti++){
          if(ti===si) continue;
          const tg=this._players[ti]; if(tg.dead) continue;
          if(b.x>tg.x&&b.x<tg.x+tg.width&&b.y>tg.y&&b.y<tg.y+tg.height){
            tg.takeDamage(b.damage,sh.id); hit=true; break;
          }
        }
        if(!hit){
          for(const p of this._platforms){
            if(b.x>p.x&&b.x<p.x+p.w&&b.y>p.y&&b.y<p.y+p.h){
              this._particles.emitImpact(b.x,b.y); hit=true; break;
            }
          }
        }
        if(hit) sh.bullets.splice(bi,1);
      }
    }
  }

  _checkRoundOver(){
    if(!this._roundActive) return;
    const anyDied=this._players.some(p=>p.deaths>0); if(!anyDied) return;
    const alive=this._players.filter(p=>!p.dead); if(alive.length>1) return;
    this._roundActive=false;
    let winnerLabel='Draw';
    if(alive.length===1){ const w=alive[0]; w.wins++; winnerLabel=w.label; }
    bus.emit('game:roundEnd',{winner:winnerLabel});
    const[s1,s2]=this._players.map(p=>p.wins);
    this._ui.showRoundOver(winnerLabel,s1,s2);
  }

  resetRound(){
    for(const p of this._players) p.reset();
    this._particles.clear();
    this._camera._shake=0; this._lastTime=null;
    this._roundActive=true;
    this._ui.hideRoundOver();
    this._resetCoins();
    // Reset grenade/mine arrays
    this._grenades._grenades.length=0; this._grenades._explosions.length=0;
    this._landmines._mines.length=0;   this._landmines._explosions.length=0;
    bus.emit('game:roundStart');
  }

  _genClouds(n){
    return Array.from({length:n},()=>({
      x:Math.random()*(this._canvas.width+300), y:25+Math.random()*110,
      r:22+Math.random()*38, a:Math.random(),
    }));
  }
}

// ════════════════════════════════════════════════════════════════
