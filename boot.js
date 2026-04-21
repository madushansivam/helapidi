// BOOT
// ════════════════════════════════════════════════════════════════
const WS_URL  = '';
const ROOM_ID = window.location.hash.slice(1)||null;
const game    = new GameLoop();
game.init(WS_URL, ROOM_ID);
window.__game = game;

console.log('%c🎮 Hēlapidi — Full Weapons & Animation Engine Ready','color:#4CAF50;font-size:15px;font-weight:bold;');
console.log('P1: A/D/W/Space/F/R  |  1-5: Switch weapon  |  G: Throw grenade  |  M: Plant mine');
console.log('P2: ←/→/↑/Shift/L/P  |  K: Throw grenade  |  ;: Plant mine');
console.log('Camera: buttons top-right');
