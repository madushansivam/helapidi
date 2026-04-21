// ║  MODULE: EventEmitter                                        ║
// ╚══════════════════════════════════════════════════════════════╝
class EventEmitter {
  constructor() { this._l = new Map(); }
  on(ev,fn){ if(!this._l.has(ev))this._l.set(ev,new Set()); this._l.get(ev).add(fn); return ()=>this.off(ev,fn); }
  once(ev,fn){ const w=(...a)=>{fn(...a);this.off(ev,w)}; return this.on(ev,w); }
  off(ev,fn){ this._l.get(ev)?.delete(fn); }
  emit(ev,...a){ this._l.get(ev)?.forEach(fn=>{try{fn(...a)}catch(e){console.error(e)}}); }
  removeAll(ev){ if(ev)this._l.delete(ev);else this._l.clear(); }
}
const bus = new EventEmitter();

// ╔══════════════════════════════════════════════════════════════╗
