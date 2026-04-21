// ║  MODULE: NetworkManager                                      ║
// ╚══════════════════════════════════════════════════════════════╝
class NetworkManager {
  constructor(){
    this._ws=null;this._connected=false;this._roomId=null;this._localPlayerId=null;
    this._ping=0;this._pingTs=0;this._reconnTries=0;
    this._sendBuf=[];this._stateBuf=[];this._tickIv=null;this.isOnline=false;
    this._pcs=new Map();this._localStream=null;this._audioMgr=null;
  }
  connect(url,roomId,name){
    if(!url){console.log('[Network] Offline mode.');return;}
    this._lastUrl=url;this._roomId=roomId||this._genId();
    try{
      this._ws=new WebSocket(url);
      this._ws.onopen=()=>this._onOpen(name);
      this._ws.onmessage=e=>this._onMsg(JSON.parse(e.data));
      this._ws.onclose=()=>this._onClose();
      this._ws.onerror=e=>console.warn('[Network] WS error:',e);
    }catch(e){console.warn('[Network] Connect failed:',e.message);}
  }
  sendInput(inp){ if(this._connected) this._sendBuf.push({type:'input',...inp}); }
  drainStateBuffer(){ const b=this._stateBuf.slice();this._stateBuf.length=0;return b; }
  async initVoice(audioMgr){
    this._audioMgr=audioMgr;
    try{
      this._localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      bus.emit('voice:ready');document.getElementById('voiceIndicator').style.display='block';
    }catch(e){console.warn('[Network] Mic unavailable:',e.message);}
  }
  toggleMute(){ const m=this._localStream?.getAudioTracks()[0]?.enabled; this._localStream?.getAudioTracks().forEach(t=>t.enabled=!m); return !m; }
  _onOpen(name){ this._connected=true;this.isOnline=true;this._reconnTries=0; this._send({type:'join',roomId:this._roomId,name});this._startTick();this._ping2();bus.emit('network:connected',{roomId:this._roomId}); }
  _onMsg(m){
    if(m.type==='state'){this._stateBuf.push(m);if(this._stateBuf.length>30)this._stateBuf.shift();}
    else if(m.type==='event')bus.emit(`game:${m.event}`,m.data);
    else if(m.type==='pong'){this._ping=Date.now()-this._pingTs;bus.emit('network:ping',this._ping);}
    else if(m.type==='playerId'){this._localPlayerId=m.id;bus.emit('network:playerId',m.id);}
    else if(m.type==='rtcOffer')this._handleOffer(m.from,m.offer);
    else if(m.type==='rtcAnswer')this._pcs.get(m.from)?.setRemoteDescription(m.answer);
    else if(m.type==='rtcIce')this._pcs.get(m.from)?.addIceCandidate(m.candidate).catch(()=>{});
  }
  _onClose(){
    this._connected=false;this.isOnline=false;this._stopTick();bus.emit('network:disconnected');
    const cfg=CONFIG.network;
    if(this._reconnTries<cfg.reconnectAttempts){
      const d=cfg.reconnectDelay*Math.pow(2,this._reconnTries++);
      setTimeout(()=>this.connect(this._lastUrl,this._roomId),d);
    }
  }
  _startTick(){ this._tickIv=setInterval(()=>{ if(!this._connected)return; if(this._sendBuf.length)this._send({type:'inputBatch',inputs:this._sendBuf.splice(0)});this._ping2(); },1000/CONFIG.network.tickRate); }
  _stopTick(){ clearInterval(this._tickIv); }
  _ping2(){ this._pingTs=Date.now();this._send({type:'ping',ts:this._pingTs}); }
  _send(o){ if(this._ws?.readyState===1)this._ws.send(JSON.stringify(o)); }
  _genId(){ return Math.random().toString(36).slice(2,8).toUpperCase(); }
  async _mkPc(peerId){
    const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    this._pcs.set(peerId,pc);
    this._localStream?.getTracks().forEach(t=>pc.addTrack(t,this._localStream));
    pc.ontrack=e=>{if(this._audioMgr&&e.streams[0])this._audioMgr.connectVoiceStream(e.streams[0]);};
    pc.onicecandidate=e=>{if(e.candidate)this._send({type:'rtcIce',to:peerId,candidate:e.candidate});};
    return pc;
  }
  async _handleOffer(peerId,offer){ const pc=await this._mkPc(peerId);await pc.setRemoteDescription(offer);const ans=await pc.createAnswer();await pc.setLocalDescription(ans);this._send({type:'rtcAnswer',to:peerId,answer:ans}); }
  async callPeer(peerId){ const pc=await this._mkPc(peerId);const o=await pc.createOffer();await pc.setLocalDescription(o);this._send({type:'rtcOffer',to:peerId,offer:o}); }
  get ping(){ return this._ping; }
}

// ╔══════════════════════════════════════════════════════════════╗
