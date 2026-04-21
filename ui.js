// ║  MODULE: UIManager                                           ║
// ║  HTML HUD + canvas overlay including weapon slots.           ║
// ╚══════════════════════════════════════════════════════════════╝
class UIManager {
  constructor(canvas,mmCanvas){
    this._canvas=canvas; this._mmCanvas=mmCanvas; this._mmCtx=mmCanvas.getContext('2d');
    this._killFeed=[]; this._announce=[];
    this._D={
      health1:document.getElementById('health1'), ammo1:document.getElementById('ammo1'),
      jetpack1:document.getElementById('jetpack1'),wins1:document.getElementById('wins1'),
      health2:document.getElementById('health2'), ammo2:document.getElementById('ammo2'),
      jetpack2:document.getElementById('jetpack2'),wins2:document.getElementById('wins2'),
      winner:document.getElementById('winner'),   score1:document.getElementById('score1'),
      score2:document.getElementById('score2'),   gameOver:document.getElementById('gameOver'),
      fps:document.getElementById('fpsDisplay'),  ping:document.getElementById('pingDisplay'),
      rw1:document.getElementById('reloadWrap1'), rw2:document.getElementById('reloadWrap2'),
      rb1:document.getElementById('reloadBar1'),  rb2:document.getElementById('reloadBar2'),
      hpB1:document.getElementById('hpBar1'),     hpB2:document.getElementById('hpBar2'),
      amB1:document.getElementById('ammoBar1'),   amB2:document.getElementById('ammoBar2'),
      jtB1:document.getElementById('jetpackBar1'),jtB2:document.getElementById('jetpackBar2'),
    };
    this._initScale();
    this._bindEvents();
  }

  _initScale(){
    const scale=()=>{
      const vw=window.innerWidth,vh=window.innerHeight,ar=CONFIG.viewport.targetAspect;
      let w=vw,h=vw/ar; if(h>vh){h=vh;w=vh*ar;}
      const sc=Math.min(w/CONFIG.viewport.baseWidth,h/CONFIG.viewport.baseHeight);
      const el=document.getElementById('gameContainer'); if(!el)return;
      el.style.transform=`scale(${sc})`;
      el.style.left=`${(vw-w)/2}px`;el.style.top=`${(vh-h)/2}px`;
      el.style.position='absolute';el.style.transformOrigin='top left';
    };
    scale(); window.addEventListener('resize',scale);
    window.addEventListener('orientationchange',()=>setTimeout(scale,100));
  }

  updateHUD(players){
    players.forEach((p,i)=>{
      const n=i+1,d=this._D,G=CONFIG.gameplay;
      if(d[`health${n}`]) d[`health${n}`].textContent=Math.max(0,Math.floor(p.health));
      if(d[`ammo${n}`])   d[`ammo${n}`].textContent=p.ammo;
      if(d[`jetpack${n}`])d[`jetpack${n}`].textContent=Math.floor(p.jetpack);
      if(d[`wins${n}`])   d[`wins${n}`].textContent=p.wins;
      const hpPct=Math.max(0,p.health/G.maxHealth)*100;
      const amPct=(p.ammo/(CONFIG.weapons[p.weaponSystem.activeWeapon]?.mag||10))*100;
      const jtPct=(p.jetpack/G.maxJetpack)*100;
      if(d[`hpB${n}`]){ d[`hpB${n}`].style.width=`${hpPct}%`; d[`hpB${n}`].style.background=`hsl(${hpPct*1.2},80%,45%)`; }
      if(d[`amB${n}`]) d[`amB${n}`].style.width=`${amPct}%`;
      if(d[`jtB${n}`]){ d[`jtB${n}`].style.width=`${jtPct}%`; }
      const rw=d[`rw${n}`],rb=d[`rb${n}`];
      if(rw&&rb){ if(p.reloading){rw.style.display='block';rb.style.width=`${(1-(p.reloadTimer/G.reloadDuration))*100}%`;}else rw.style.display='none';}
      const ps=document.getElementById(`player${n}Stats`);
      if(ps) ps.classList.toggle('low-health',p.health<25&&!p.dead);
    });
  }

  updateDebug(fps,ping){
    if(this._D.fps)  this._D.fps.textContent=`FPS ${fps}`;
    if(this._D.ping) this._D.ping.textContent=ping>0?`· ${ping}ms`:'';
  }

  drawMinimap(players,platforms,camera){
    const mc=this._mmCtx,mw=this._mmCanvas.width,mh=this._mmCanvas.height;
    const scX=mw/CONFIG.world.width,scY=mh/CONFIG.world.height;
    mc.clearRect(0,0,mw,mh); mc.fillStyle='rgba(5,8,18,0.9)'; mc.fillRect(0,0,mw,mh);
    mc.fillStyle='#5D4037';
    for(const p of platforms) mc.fillRect(p.x*scX,p.y*scY,Math.max(1,p.w*scX),Math.max(1,p.h*scY));
    for(const p of players){ mc.fillStyle=p.dead?'#444':p.color; mc.beginPath(); mc.arc((p.x+p.width/2)*scX,(p.y+p.height/2)*scY,4,0,Math.PI*2); mc.fill(); }
    if(camera.mode!=='split'){ mc.strokeStyle='rgba(0,229,255,0.4)';mc.lineWidth=1;mc.strokeRect(camera.x*scX,camera.y*scY,(camera.viewportW/camera.zoom)*scX,(camera.viewportH/camera.zoom)*scY); }
  }

  drawCanvasUI(ctx, players, platforms, camera, hudAnimator){
    this._drawKillFeed(ctx);
    this._drawAnnounce(ctx);
    // Draw weapon HUD for P1 (primary player)
    if(players[0]) this._drawWeaponHUD(ctx, players[0].weaponSystem, ctx.canvas.width/2, ctx.canvas.height-18);
    if(hudAnimator) hudAnimator.updateWeaponAmmoHUD(players[0]?.weaponSystem);
  }

  // ── Weapon slot HUD (bottom centre) ─────────────────────────
  _drawWeaponHUD(ctx, ws, centreX, baseY){
    const slotKeys=['pistol','shotgun','smg','grenade','landmine'];
    const slotLabels=['PISTOL','SHOTGUN','SMG','NADE','MINE'];
    const slotIcons=['P','SG','SM','G','M'];
    const slotW=46, slotH=54, gap=6;
    const totalW=slotKeys.length*slotW+(slotKeys.length-1)*gap;
    const startX=centreX-totalW/2;

    slotKeys.forEach((key,i)=>{
      const def=CONFIG.weapons[key];
      const isActive=ws.activeWeapon===key;
      const sx=startX+i*(slotW+gap);
      const sy=baseY-slotH;
      const scale=ws._slotScales[i];
      const locked=!def.unlocked;
      const isLockedFlash=ws.isLockedSlot(i+1);
      const slotFlash=ws.getSlotFlash(i);
      // Grey-out depleted grenade/landmine slots
      const isDepleted=!locked && ('count' in (ws._ammo[key]||{})) && (ws._ammo[key].count||0)===0;

      // Recoil / shake offset only on active slot
      let offX=0, offY=0;
      if(isActive){
        offX=ws.getRecoilX();
        offY=ws.getSlideY();
      }
      if(isLockedFlash){
        offX=Math.sin(ws._lockedTimer*80)*4;
      }

      ctx.save();
      ctx.translate(sx+slotW/2+offX, sy+slotH/2+offY);
      ctx.scale(scale,scale);

      const cx2=-slotW/2, cy2=-slotH/2;

      // Slot background
      if(isActive){
        ctx.fillStyle='rgba(0,229,255,0.18)';
        ctx.strokeStyle='rgba(0,229,255,0.85)';
        ctx.lineWidth=2;
        ctx.shadowColor='rgba(0,229,255,0.6)';
        ctx.shadowBlur=10;
      }else if(locked){
        ctx.fillStyle='rgba(40,40,40,0.7)';
        ctx.strokeStyle='rgba(100,100,100,0.4)';
        ctx.lineWidth=1;
      }else{
        ctx.fillStyle='rgba(20,30,50,0.75)';
        ctx.strokeStyle='rgba(255,255,255,0.2)';
        ctx.lineWidth=1;
      }
      ctx.beginPath(); ctx.roundRect(cx2,cy2,slotW,slotH,5); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;

      // Depleted alpha overlay for grenade/landmine
      if(isDepleted && !isActive){
        ctx.globalAlpha=0.35;
      }

      // Slot flash overlay (ammo pickup feedback)
      if(slotFlash>0){
        const fl=Math.min(1,slotFlash/0.25);
        ctx.fillStyle=`rgba(255,255,255,${fl*0.3})`;
        ctx.beginPath(); ctx.roundRect(cx2,cy2,slotW,slotH,5); ctx.fill();
      }

      // Slot number
      ctx.font='8px "Orbitron",monospace';
      ctx.textAlign='center';
      ctx.fillStyle=isActive?'rgba(0,229,255,0.9)':'rgba(255,255,255,0.35)';
      ctx.fillText(i+1, 0, cy2+11);

      // Weapon icon (text symbol)
      ctx.font=`bold ${locked?'13':'16'}px "Share Tech Mono",monospace`;
      ctx.fillStyle=locked?'rgba(80,80,80,0.6)':(isActive?'#fff':'rgba(200,200,200,0.8)');
      ctx.fillText(slotIcons[i], 0, -4);

      // Ammo count / grenade count
      const ammoData=ws._ammo[key];
      if(ammoData&&!locked){
        ctx.font='9px "Share Tech Mono",monospace';
        if('mag' in ammoData){
          ctx.fillStyle=ammoData.mag===0?'#ff4444':'rgba(0,229,255,0.9)';
          ctx.fillText(ammoData.mag, -6, cy2+slotH-5);
          ctx.fillStyle='rgba(255,255,255,0.3)';
          ctx.fillText(`/${ammoData.reserve}`, 10, cy2+slotH-5);
        }else if('count' in ammoData){
          ctx.fillStyle=ammoData.count===0?'#ff4444':'#FFD700';
          ctx.fillText(`×${ammoData.count}`, 0, cy2+slotH-5);
        }
      }

      // LOCKED overlay
      if(locked||isLockedFlash){
        ctx.fillStyle=`rgba(0,0,0,${isLockedFlash?0.3:0.55})`;
        ctx.beginPath(); ctx.roundRect(cx2,cy2,slotW,slotH,5); ctx.fill();
        ctx.font='bold 9px "Orbitron",monospace';
        ctx.fillStyle=isLockedFlash?'#ff4444':'rgba(150,50,50,0.8)';
        ctx.fillText('LOCK',0,2);
      }

      ctx.restore();
    });

    // Active weapon label above slots
    ctx.save();
    ctx.font='bold 11px "Orbitron",monospace';
    ctx.textAlign='center';
    ctx.fillStyle='rgba(0,229,255,0.7)';
    ctx.shadowColor='rgba(0,229,255,0.4)';
    ctx.shadowBlur=6;
    const def=CONFIG.weapons[ws.activeWeapon];
    ctx.fillText(def?.label||ws.activeWeapon.toUpperCase(), centreX, baseY-slotH-8);
    ctx.shadowBlur=0;
    ctx.restore();
  }

  updateTimers(dt){
    for(let i=this._killFeed.length-1;i>=0;i--){this._killFeed[i].t-=dt;if(this._killFeed[i].t<=0)this._killFeed.splice(i,1);}
    for(let i=this._announce.length-1;i>=0;i--){this._announce[i].t-=dt;if(this._announce[i].t<=0)this._announce.splice(i,1);}
  }

  _drawKillFeed(ctx){
    if(!this._killFeed.length) return;
    const W=ctx.canvas.width; ctx.save();
    this._killFeed.slice(0,5).forEach((e,i)=>{
      const al=Math.min(1,e.t); ctx.globalAlpha=al;
      ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(W-220,12+i*20,210,17);
      ctx.font='bold 10px "Share Tech Mono",monospace'; ctx.textAlign='left';
      ctx.fillStyle=e.kc; ctx.fillText(e.killer,W-214,25+i*20);
      ctx.fillStyle='rgba(255,255,255,0.45)'; ctx.fillText(' ✕ ',W-214+e.kl,25+i*20);
      ctx.fillStyle='rgba(255,80,80,0.85)'; ctx.fillText(e.victim,W-214+e.kl+22,25+i*20);
    });
    ctx.globalAlpha=1; ctx.restore();
  }

  _drawAnnounce(ctx){
    if(!this._announce.length) return;
    const e=this._announce[0]; const al=Math.min(1,e.t); ctx.save(); ctx.globalAlpha=al;
    ctx.font='bold 22px "Orbitron",monospace'; ctx.textAlign='center';
    ctx.fillStyle=`rgba(255,215,0,${al})`; ctx.shadowColor='rgba(255,215,0,0.5)'; ctx.shadowBlur=16;
    ctx.fillText(e.msg,ctx.canvas.width/2,120); ctx.shadowBlur=0; ctx.restore();
  }

  addKill(killer,victim,killerColor){
    this._killFeed.unshift({killer,victim,kc:killerColor,kl:killer.length*7,t:4});
    if(this._killFeed.length>5) this._killFeed.pop();
  }

  announce(msg,dur=2){ this._announce.unshift({msg,t:dur}); if(this._announce.length>2) this._announce.pop(); }

  showRoundOver(winner,s1,s2){
    const d=this._D;
    if(d.winner) d.winner.textContent=winner;
    if(d.score1) d.score1.textContent=s1;
    if(d.score2) d.score2.textContent=s2;
    if(d.gameOver) d.gameOver.style.display='block';
  }
  hideRoundOver(){ if(this._D.gameOver) this._D.gameOver.style.display='none'; }

  _bindEvents(){
    bus.on('player:death',({id,killedBy})=>{
      const pcs=CONFIG.players,victim=pcs.find(p=>p.id===id),killer=pcs.find(p=>p.id===killedBy);
      if(victim&&killer) this.addKill(killer.label,victim.label,killer.color);
    });
    bus.on('game:roundEnd',({winner})=>this.announce(`${winner} wins the round!`,3));
  }
}

// ╔══════════════════════════════════════════════════════════════╗
