// ║  MODULE: WeaponSystem                                        ║
// ║  Manages per-player weapon state, slot switching,            ║
// ║  slide animation, recoil, empty-click shake, LOCKED flash.   ║
// ╚══════════════════════════════════════════════════════════════╝
class WeaponSystem {
  constructor(playerId) {
    this.playerId     = playerId;
    this.activeWeapon = 'pistol';

    // Runtime ammo tracking (separate from CONFIG defs)
    this._ammo = {};
    const defs = CONFIG.weapons;
    for(const [key,def] of Object.entries(defs)){
      if('mag' in def)    this._ammo[key] = { mag:def.mag, reserve:def.reserve };
      else if('count' in def) this._ammo[key] = { count:def.count };
    }

    // Switching state
    this._switchLock     = 0;   // seconds remaining — blocks new switch
    this._slideOffset    = 0;   // y-offset for slide-in animation (px)
    this._slideDuration  = 0.28;

    // Recoil state (x-offset in weapon HUD)
    this._recoilOffset   = 0;
    this._recoilTimer    = 0;
    this._recoilMax      = 0;

    // Empty click shake
    this._emptyShakeTimer = 0;
    this._emptyShakeAmp   = 0;

    // LOCKED slot feedback
    this._lockedSlot  = -1;
    this._lockedTimer = 0;

    // Grenade cook state (while throw key held)
    this._cookTimer   = 0;
    this._isCooking   = false;

    // Slot scale targets (1.0 → 1.15 for active)
    this._slotScales = [1,1,1,1,1];
    this._slotScaleTargets = [1,1,1,1,1];

    // Per-slot flash feedback (on ammo pickup / grenade refill)
    this._slotFlashTimers = [0,0,0,0,0];
  }

  // Called from InputManager when key 1-5 pressed
  trySwitch(slot){
    const keys = ['pistol','shotgun','smg','grenade','landmine'];
    const next = keys[slot-1];
    if(!next || next === this.activeWeapon) return;
    if(this._switchLock > 0) return;

    const def = CONFIG.weapons[next];
    if(!def.unlocked){
      this._lockedSlot  = slot;
      this._lockedTimer = 0.5;
      bus.emit('weapon:locked', { slot, playerId:this.playerId });
      return;
    }

    const prev = this.activeWeapon;
    this.activeWeapon  = next;
    this._switchLock   = this._slideDuration;
    this._slideOffset  = 55; // start below, animate up
    bus.emit('weapon:switch', { prev, next, playerId:this.playerId });
  }

  // Current mag ammo
  getMag(){
    const a = this._ammo[this.activeWeapon];
    return a?.mag ?? a?.count ?? 0;
  }
  getReserve(){
    const a = this._ammo[this.activeWeapon];
    return a?.reserve ?? 0;
  }

  consumeShot(){
    const a = this._ammo[this.activeWeapon];
    if(!a) return false;
    if('mag' in a){ if(a.mag <= 0) return false; a.mag--; return true; }
    if('count' in a){ if(a.count <= 0) return false; a.count--; return true; }
    return false;
  }

  canReload(){
    const a = this._ammo[this.activeWeapon];
    if(!a || !('mag' in a)) return false;
    const def = CONFIG.weapons[this.activeWeapon];
    return a.mag < def.mag && a.reserve > 0;
  }

  doReload(){
    const a   = this._ammo[this.activeWeapon];
    const def = CONFIG.weapons[this.activeWeapon];
    if(!a || !('mag' in a)) return;
    const needed = def.mag - a.mag;
    const take   = Math.min(needed, a.reserve);
    a.mag    += take;
    a.reserve -= take;
  }

  refillAmmo(amount){
    const a = this._ammo[this.activeWeapon];
    if(a && 'reserve' in a){
      const def = CONFIG.weapons[this.activeWeapon];
      a.reserve = Math.min((def.reserve||0), a.reserve + amount);
      this.flashSlot(def.slot);
    }
  }

  flashSlot(slot){
    if(slot>=1 && slot<=5) this._slotFlashTimers[slot-1] = 0.45;
  }

  getSlotFlash(slotIdx){
    return this._slotFlashTimers[slotIdx];
  }

  applyRecoil(){
    const def = CONFIG.weapons[this.activeWeapon];
    this._recoilMax   = def.recoil || 4;
    this._recoilOffset = this._recoilMax;
    this._recoilTimer  = 0.08;
  }

  applyEmptyClick(){
    this._emptyShakeTimer = 0.3;
    this._emptyShakeAmp   = 3;
  }

  startCook(){ if(!this._isCooking){ this._isCooking=true; this._cookTimer=0; } }
  stopCook() { this._isCooking=false; this._cookTimer=0; }
  cookProgress(){ return this._isCooking ? Math.min(this._cookTimer/CONFIG.weapons.grenade.cookTime,1) : 0; }

  update(dt){
    // Switch lock timer
    if(this._switchLock > 0) this._switchLock -= dt;

    // Slide animation
    if(this._slideOffset > 0){
      this._slideOffset = Math.max(0, this._slideOffset - (55/this._slideDuration)*dt);
    }

    // Recoil return
    if(this._recoilTimer > 0){
      this._recoilTimer -= dt;
      this._recoilOffset = (this._recoilTimer/0.08)*this._recoilMax;
      if(this._recoilTimer <= 0) this._recoilOffset=0;
    }

    // Empty click shake
    if(this._emptyShakeTimer > 0) this._emptyShakeTimer -= dt;

    // LOCKED flash timer
    if(this._lockedTimer > 0) this._lockedTimer -= dt;

    // Slot flash decay
    for(let i=0;i<5;i++) if(this._slotFlashTimers[i]>0) this._slotFlashTimers[i]-=dt;

    // Cook timer
    if(this._isCooking) this._cookTimer += dt;

    // Slot scale lerp
    const slots = ['pistol','shotgun','smg','grenade','landmine'];
    slots.forEach((w,i)=>{
      this._slotScaleTargets[i] = w===this.activeWeapon ? 1.15 : 1.0;
      this._slotScales[i] += (this._slotScaleTargets[i]-this._slotScales[i])*0.2;
    });
  }

  // Returns current x offset for weapon HUD shake/recoil
  getRecoilX(){
    if(this._emptyShakeTimer > 0){
      return Math.sin(this._emptyShakeTimer*80)*3*(this._emptyShakeTimer/0.3);
    }
    return -this._recoilOffset;
  }

  // Returns y offset for slide-in animation
  getSlideY(){ return this._slideOffset; }

  isLockedSlot(slot){ return this._lockedSlot===slot && this._lockedTimer>0; }
  isLockedFlashOn(){ return this._lockedTimer>0 && Math.floor(this._lockedTimer*16)%2===0; }
}

// ╔══════════════════════════════════════════════════════════════╗
