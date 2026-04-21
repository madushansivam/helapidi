// ║  MODULE: Camera                                              ║
// ╚══════════════════════════════════════════════════════════════╝
class Camera {
  constructor(vw,vh){
    this.viewportW=vw; this.viewportH=vh;
    this.x=0; this.y=0; this.zoom=1;
    this._tz=1; this._tx=0; this._ty=0;
    this.shakeX=0; this.shakeY=0; this._shake=0;
    this.mode=CONFIG.camera.defaultMode;
    bus.on('camera:setMode',m=>this.setMode(m));
    bus.on('player:shoot',()=>this.addShake(4));
    bus.on('player:hit',()=>this.addShake(9));
    bus.on('player:death',()=>this.addShake(15));
    bus.on('jetpack:boost',()=>this.addShake(2));
  }
  setMode(m){ this.mode=m; }
  addShake(s){ this._shake=Math.max(this._shake,s); }

  update(players){
    const cfg=CONFIG.camera, W=CONFIG.world;
    if(this._shake>cfg.shakeThreshold){
      this.shakeX=(Math.random()-.5)*this._shake*2;
      this.shakeY=(Math.random()-.5)*this._shake*2;
      this._shake*=cfg.shakeDecay;
    }else{this._shake=0;this.shakeX=0;this.shakeY=0;}

    switch(this.mode){
      case 'static': this._tx=(W.width-this.viewportW)/2;this._ty=(W.height-this.viewportH)/2;this._tz=1;break;
      case 'follow1':case 'follow2':{
        const p=players.find(p=>p.id===(this.mode==='follow1'?'p1':'p2'))||players[0];
        if(p){this._tx=p.x+p.width/2-this.viewportW/2;this._ty=p.y+p.height/2-this.viewportH/2;this._tz=1.3;}
        break;
      }
      case 'dynamic':{
        if(!players.length) break;
        let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
        for(const p of players){mnX=Math.min(mnX,p.x);mnY=Math.min(mnY,p.y);mxX=Math.max(mxX,p.x+p.width);mxY=Math.max(mxY,p.y+p.height);}
        const cx=(mnX+mxX)/2,cy=(mnY+mxY)/2;
        const spanX=mxX-mnX+240,spanY=mxY-mnY+240;
        const zx=this.viewportW/spanX,zy=this.viewportH/spanY;
        this._tz=Math.max(cfg.minZoom,Math.min(cfg.maxZoom,Math.min(zx,zy)));
        this._tx=cx-(this.viewportW/2)/this._tz; this._ty=cy-(this.viewportH/2)/this._tz;
        break;
      }
      case 'split': this._tz=1; break;
    }

    const lp=0.11,lz=cfg.zoomLerpSpeed;
    this.x+=(this._tx-this.x)*lp; this.y+=(this._ty-this.y)*lp;
    this.zoom+=(this._tz-this.zoom)*lz;
    const vw=this.viewportW/this.zoom,vh=this.viewportH/this.zoom;
    this.x=Math.max(0,Math.min(W.width-vw,this.x));
    this.y=Math.max(0,Math.min(W.height-vh,this.y));
  }

  getVpForPlayer(player,vpW,vpH){
    const W=CONFIG.world;
    const cx=player.x+player.width/2-vpW/2, cy=player.y+player.height/2-vpH/2;
    return{x:Math.max(0,Math.min(W.width-vpW,cx)),y:Math.max(0,Math.min(W.height-vpH,cy))};
  }
}

// ╔══════════════════════════════════════════════════════════════╗
