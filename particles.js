// ║  MODULE: ParticleSystem  (extended with burst / explosion)   ║
// ╚══════════════════════════════════════════════════════════════╝
class ParticleSystem {
  constructor() {
    const max=CONFIG.particles.maxPoolSize, F=11;
    this._F=F; this._data=new Float32Array(max*F); this._act=new Uint8Array(max); this._cnt=max;
    this.X=0;this.Y=1;this.VX=2;this.VY=3;this.L=4;this.ML=5;this.R=6;this.G=7;this.B=8;this.SZ=9;this.ROT=10;
  }
  emit(x,y,vx,vy,hex,life,size=3){
    const i=this._free(); if(i<0)return;
    const n=parseInt(hex.replace('#',''),16);
    const d=this._data,b0=i*this._F;
    d[b0]=x;d[b0+1]=y;d[b0+2]=vx;d[b0+3]=vy;d[b0+4]=life;
    d[b0+5]=life;d[b0+6]=(n>>16)&255;d[b0+7]=(n>>8)&255;d[b0+8]=n&255;d[b0+9]=size;d[b0+10]=Math.random()*Math.PI*2;
    this._act[i]=1;
  }
  emitMuzzleFlash(x,y,dir){
    for(let i=0;i<CONFIG.particles.muzzleCount;i++)
      this.emit(x+dir*25,y,dir*(Math.random()*240+120),(Math.random()-.5)*180,'#FFEE44',0.13,2+Math.random()*2);
  }
  emitJetpack(x,y){
    for(let i=0;i<CONFIG.particles.jetpackCount;i++)
      this.emit(x,y,(Math.random()-.5)*180,Math.random()*140+100,i%2?'#FFA500':'#FF4400',0.28,3+Math.random()*2);
  }
  emitJetpackSputter(x,y){ // sparse sputter when almost empty
    if(Math.random()>0.4) return;
    this.emit(x,y,(Math.random()-.5)*80,Math.random()*60+40,'#FF2200',0.15,2+Math.random()*2);
  }
  emitImpact(x,y){
    for(let i=0;i<CONFIG.particles.impactCount;i++)
      this.emit(x,y,(Math.random()-.5)*380,(Math.random()-.5)*380,Math.random()>.5?'#FF3333':'#FF9944',0.38,2+Math.random()*3);
  }
  emitDeath(x,y,color){
    const n=CONFIG.particles.deathCount;
    for(let i=0;i<n;i++){const a=(Math.PI*2*i)/n,sp=160+Math.random()*200;
      this.emit(x,y,Math.cos(a)*sp,Math.sin(a)*sp,color,0.9+Math.random()*0.4,3+Math.random()*4);}
  }
  // Coin burst — 6-8 gold particles fly toward HUD coin counter
  emitCoinBurst(wx, wy, hudX, hudY){
    const n=6+Math.floor(Math.random()*3);
    // Direction toward HUD counter (screen-space target)
    const dx=(hudX||wx+200)-wx, dy=(hudY||wy-300)-wy;
    const baseAngle=Math.atan2(dy,dx);
    for(let i=0;i<n;i++){
      const spread=(Math.random()-.5)*1.0; // scatter around target direction
      const a=baseAngle+spread;
      const sp=160+Math.random()*120;
      this.emit(wx,wy,Math.cos(a)*sp,Math.sin(a)*sp,'#FFD700',0.55+Math.random()*0.3,4+Math.random()*3);
    }
    // Extra sparkle ring (instant pop)
    for(let i=0;i<5;i++){
      const a=(Math.PI*2*i)/5;
      this.emit(wx,wy,Math.cos(a)*60,Math.sin(a)*60,'#FFF8A0',0.25,2);
    }
  }
  // Grenade / landmine explosion debris
  emitExplosionDebris(x,y,count=8,color='#FF6600'){
    for(let i=0;i<count;i++){
      const a=(Math.PI*2*i)/count+(Math.random()-.5)*0.5;
      const sp=100+Math.random()*200;
      this.emit(x,y,Math.cos(a)*sp,Math.sin(a)*sp-60,color,0.8+Math.random()*0.4,4+Math.random()*4);
    }
  }
  emitDirt(x,y,count=12){
    for(let i=0;i<count;i++){
      const a=-Math.PI+(Math.random()-.5)*Math.PI*0.8;
      const sp=50+Math.random()*120;
      this.emit(x,y,Math.cos(a)*sp,Math.sin(a)*sp-30,'#8B5E3C',0.6+Math.random()*0.5,5+Math.random()*5);
    }
  }
  emitPickupFlash(x,y){
    for(let i=0;i<8;i++){
      const a=(Math.PI*2*i)/8;
      this.emit(x,y,Math.cos(a)*80,Math.sin(a)*80-40,'#ffffff',0.35,3+Math.random()*3);
    }
  }
  update(dt){
    const d=this._data,g=CONFIG.physics.particleGravity;
    for(let i=0;i<this._cnt;i++){
      if(!this._act[i])continue;
      const b0=i*this._F;
      d[b0]+=d[b0+2]*dt;d[b0+1]+=d[b0+3]*dt;
      d[b0+3]+=g*dt;d[b0+4]-=dt;
      if(d[b0+4]<=0)this._act[i]=0;
    }
  }
  draw(ctx,cx,cy){
    const d=this._data; ctx.save();
    for(let i=0;i<this._cnt;i++){
      if(!this._act[i])continue;
      const b0=i*this._F, al=Math.max(0,d[b0+4]/d[b0+5]);
      const px=d[b0]-cx, py=d[b0+1]-cy, sz=d[b0+9];
      ctx.globalAlpha=al;
      ctx.fillStyle=`rgb(${d[b0+6]|0},${d[b0+7]|0},${d[b0+8]|0})`;
      ctx.fillRect(px-sz/2,py-sz/2,sz,sz);
    }
    ctx.globalAlpha=1; ctx.restore();
  }
  clear(){ this._act.fill(0); }
  _free(){ for(let i=0;i<this._cnt;i++)if(!this._act[i])return i; return -1; }
  // _rgb removed — inlined into emit() to avoid per-call array allocation
}

// ╔══════════════════════════════════════════════════════════════╗
