// ║  MODULE: HUDAnimator                                         ║
// ║  Screen-space float texts, coin counter flash,               ║
// ║  fuel critical DOM updates, LOCKED flash.                    ║
// ╚══════════════════════════════════════════════════════════════╝
class HUDAnimator {
  constructor(){
    this._floatTexts = []; // { x,y,text,color,alpha,vy,life,maxLife }
    this._coinEl     = document.getElementById('coinHUD');
    this._jtBar1     = document.getElementById('jetpackBar1');
    this._jtBar2     = document.getElementById('jetpackBar2');
    this._ammoMag    = document.getElementById('wAmmoMag');
    this._ammoRes    = document.getElementById('wAmmoRes');
  }

  flashCoin(){
    if(!this._coinEl) return;
    this._coinEl.classList.remove('flash');
    void this._coinEl.offsetWidth; // reflow to restart
    this._coinEl.classList.add('flash');
    setTimeout(()=>this._coinEl.classList.remove('flash'),400);
  }

  addFloatText(worldX, worldY, text, color='#ffffff'){
    this._floatTexts.push({
      x:worldX, y:worldY,
      text, color,
      alpha:1, vy:-55,
      life:0, maxLife:1.2,
    });
  }

  // worldToScreen: call from gameloop after computing camera
  updateWeaponAmmoHUD(weaponSystem){
    const mag = weaponSystem.getMag();
    const res = weaponSystem.getReserve();
    if(this._ammoMag) this._ammoMag.textContent = mag;
    if(this._ammoRes) this._ammoRes.textContent = res > 0 ? res : '—';
  }

  updateFuelBars(players){
    const p1 = players[0], p2 = players[1];
    if(this._jtBar1){
      const crit = p1 && (p1.jetpack/p1.maxJetpack)<0.15;
      this._jtBar1.classList.toggle('critical', crit);
    }
    if(this._jtBar2 && p2){
      const crit = (p2.jetpack/p2.maxJetpack)<0.15;
      this._jtBar2.classList.toggle('critical', crit);
    }
  }

  update(dt){
    for(let i=this._floatTexts.length-1;i>=0;i--){
      const t=this._floatTexts[i];
      t.life += dt;
      t.y    += t.vy*dt;
      t.vy   *= 0.96;
      t.alpha  = Math.max(0,1-t.life/t.maxLife);
      if(t.life>=t.maxLife) this._floatTexts.splice(i,1);
    }
  }

  // Draw float texts in world space (called inside renderScene)
  drawWorldTexts(ctx, cx, cy){
    ctx.save();
    for(const t of this._floatTexts){
      const sx=t.x-cx, sy=t.y-cy;
      if(sy<-40||sy>ctx.canvas.height+20) continue;
      ctx.globalAlpha=t.alpha;
      ctx.font='bold 13px "Orbitron",monospace';
      ctx.textAlign='center';
      ctx.fillStyle=t.color;
      ctx.shadowColor=t.color;
      ctx.shadowBlur=6;
      ctx.fillText(t.text, sx, sy);
    }
    ctx.globalAlpha=1; ctx.shadowBlur=0; ctx.restore();
  }
}

// ╔══════════════════════════════════════════════════════════════╗
