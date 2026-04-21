// ║  MODULE: InputManager                                        ║
// ║  Keys 1-5 now control weapon slots. Camera via UI buttons.   ║
// ╚══════════════════════════════════════════════════════════════╝
class InputManager {
  constructor(){
    this._held    = new Set();
    this._justDown= new Set();
    this._bindings= new Map();
    this._touchState={};
    this._gpDeadzone=0.25;
  }
  init(canvas){
    window.addEventListener('keydown',e=>{
      const k=e.key.toLowerCase();
      if(!this._held.has(k)) this._justDown.add(k);
      this._held.add(k);
      if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) e.preventDefault();
      // 1-5 → weapon switch (P1 only — P2 could use numpad in future)
      if(k>='1'&&k<='5') bus.emit('weapon:trySwitch',{slot:parseInt(k),playerId:'p1'});
    });
    window.addEventListener('keyup',e=>{ this._held.delete(e.key.toLowerCase()); });
    CONFIG.players.forEach(pc=>{ this._bindings.set(pc.id,pc.controls.keyboard); this._touchState[pc.id]={}; });
    this._initTouch(canvas);
  }
  isPressed(playerId,action){
    const kb=this._bindings.get(playerId)?.[action];
    if(kb&&this._held.has(kb)) return true;
    const pc=CONFIG.players.find(p=>p.id===playerId);
    if(pc?.controls?.gamepad!=null&&this._gpPressed(pc.controls.gamepad,action)) return true;
    return this._touchState[playerId]?.[action]??false;
  }
  wasJustPressed(playerId,action){
    const kb=this._bindings.get(playerId)?.[action];
    return !!(kb&&this._justDown.has(kb));
  }
  flush(){ this._justDown.clear(); }

  _gpPressed(idx,action){
    const gp=navigator.getGamepads?.()[idx]; if(!gp) return false;
    const dz=this._gpDeadzone;
    switch(action){
      case 'left':    return gp.axes[0]<-dz||gp.buttons[14]?.pressed;
      case 'right':   return gp.axes[0]>dz ||gp.buttons[15]?.pressed;
      case 'jump':    return gp.buttons[0]?.pressed||gp.buttons[12]?.pressed;
      case 'jetpack': return gp.buttons[7]?.value>0.5;
      case 'shoot':   return gp.buttons[5]?.pressed;
      case 'reload':  return gp.buttons[2]?.pressed;
      default: return false;
    }
  }
  _initTouch(canvas){
    if(!('ontouchstart' in window)) return;
    CONFIG.players.forEach((pc,idx)=>this._buildTouchOverlay(pc.id,idx,canvas));
    canvas.addEventListener('touchstart',e=>{e.preventDefault();},{ passive:false });
    canvas.addEventListener('touchend',  e=>{e.preventDefault();},{ passive:false });
  }
  _buildTouchOverlay(pid,side,canvas){
    const div=document.createElement('div');
    div.style.cssText=`position:fixed;bottom:0;${side===0?'left:0':'right:0'};width:50%;height:160px;pointer-events:auto;z-index:200;`;
    const btns=[
      {r:'jump',  l:'↑', pos:side===0?'right:80px':'left:80px',   bot:'80px',bg:'rgba(76,175,80,.65)'},
      {r:'shoot', l:'🔫',pos:side===0?'right:20px':'left:20px',   bot:'40px',bg:'rgba(255,99,71,.65)'},
      {r:'jetpack',l:'⚡',pos:side===0?'right:140px':'left:140px',bot:'40px',bg:'rgba(255,165,0,.65)'},
      {r:'reload', l:'R', pos:side===0?'right:80px':'left:80px',  bot:'10px',bg:'rgba(100,149,237,.65)'},
    ];
    btns.forEach(b=>{
      const btn=document.createElement('button');
      btn.textContent=b.l;
      btn.style.cssText=`position:absolute;${b.pos};bottom:${b.bot};width:52px;height:52px;border-radius:50%;background:${b.bg};border:2px solid rgba(255,255,255,.3);color:white;font-size:18px;touch-action:none;user-select:none;`;
      btn.addEventListener('touchstart',e=>{e.stopPropagation();this._touchState[pid][b.r]=true;});
      btn.addEventListener('touchend',  e=>{e.stopPropagation();this._touchState[pid][b.r]=false;});
      div.appendChild(btn);
    });
    document.body.appendChild(div);
  }
}

// ╔══════════════════════════════════════════════════════════════╗
