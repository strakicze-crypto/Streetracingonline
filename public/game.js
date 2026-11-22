import * as THREE from "three";

const root = document.getElementById("game");
const speedEl = document.getElementById("speed");
const connectionEl = document.getElementById("connection");
const playersEl = document.getElementById("players");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91b6d0);
scene.fog = new THREE.Fog(0x91b6d0, 55, 180);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 260);
camera.position.set(0, 6.2, 11);
camera.lookAt(0, 0, -8);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xe4f3ff, 0x39404c, 2.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(-18, 30, 15);
sun.castShadow = true;
scene.add(sun);

const mat = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
const roadMat = mat(0x252b35), lineMat = mat(0xe9edf0), grassMat = mat(0x506a53), curbMat = mat(0xc4c8ca);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 260), grassMat);
ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.08, -90); ground.receiveShadow = true; scene.add(ground);
const road = new THREE.Mesh(new THREE.PlaneGeometry(18, 260), roadMat);
road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -90); road.receiveShadow = true; scene.add(road);
for (const x of [-9.25, 9.25]) {
  const curb = new THREE.Mesh(new THREE.BoxGeometry(.5, .12, 260), curbMat);
  curb.position.set(x, .02, -90); scene.add(curb);
}
const dashes = [];
for (let z = 18; z > -240; z -= 12) {
  const dash = new THREE.Mesh(new THREE.BoxGeometry(.16, .025, 5), lineMat);
  dash.position.set(0, .025, z); scene.add(dash); dashes.push(dash);
}
function makeCar(color = 0xe83d4d) {
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.75, .55, 3.35), mat(color, .35));
  body.position.y = .62; body.castShadow = true; car.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.35, .62, 1.65), mat(0x182635, .25));
  cabin.position.set(0, 1.12, -.18); cabin.castShadow = true; car.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.22, .38, .08), mat(0x8bb4c9, .2));
  glass.position.set(0, 1.15, .68); car.add(glass);
  for (const x of [-.94, .94]) for (const z of [-1.05, 1.05]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.38, .38, .22, 16), mat(0x101216));
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .38, z); wheel.castShadow = true; car.add(wheel);
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
  for (const x of [-.57, .57]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(.35, .16, .05), lampMat);
    lamp.position.set(x, .66, -1.7); car.add(lamp);
  }
  return car;
}
const player = makeCar(0xe83d4d);
player.position.set(0, 0, 4);
scene.add(player);

// Simple roadside skyline and repeating streetlights.
const roadside = [];
for (let i = 0; i < 34; i++) {
  const z = -i * 9 - 8;
  for (const side of [-1, 1]) {
    const w = 3 + Math.random() * 5, h = 5 + Math.random() * 18;
    const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, 5 + Math.random() * 4), mat([0x78818c,0x9a9b98,0x687987,0xb0a79c][i % 4]));
    building.position.set(side * (15 + Math.random() * 12), h / 2 - .05, z);
    building.castShadow = true; building.receiveShadow = true; scene.add(building); roadside.push(building);
    const pole = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,5,8), mat(0x333a43));
    stem.position.y = 2.5; pole.add(stem);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4,.08,.08), mat(0x333a43));
    arm.position.set(-side*.6,4.85,0); pole.add(arm);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(.5,.12,.3), new THREE.MeshBasicMaterial({color:0xffe3a3}));
    bulb.position.set(-side*1.2,4.8,0); pole.add(bulb);
    pole.position.set(side*10,0,z); scene.add(pole); roadside.push(pole);
  }
}
const keys = new Set();
const touch = { left:false, right:false, gas:false, brake:false };
function bindHold(id, key) {
  const el = document.getElementById(id);
  const on = e => { e.preventDefault(); touch[key] = true; el.classList.add("active"); };
  const off = e => { e.preventDefault(); touch[key] = false; el.classList.remove("active"); };
  el.addEventListener("pointerdown", on);
  ["pointerup","pointercancel","pointerleave"].forEach(type => el.addEventListener(type, off));
}
bindHold("left","left"); bindHold("right","right"); bindHold("gas","gas"); bindHold("brake","brake");
addEventListener("keydown", e => { keys.add(e.key.toLowerCase()); if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(e.key.toLowerCase())) e.preventDefault(); });
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
let x = 0, z = 0, velocity = 0, steering = 0, lastSend = 0, myId = null;
const remoteCars = new Map();
const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
let socket;
function connect() {
  try {
    socket = new WebSocket(wsProto + "//" + location.host);
    socket.onopen = () => { connectionEl.textContent = "ONLINE"; connectionEl.style.color = "#72e5a5"; };
    socket.onclose = () => { connectionEl.textContent = "OFFLINE · SOLO"; connectionEl.style.color = "#ffb45b"; setTimeout(connect, 3500); };
    socket.onerror = () => { connectionEl.textContent = "SOLO MODE"; };
    socket.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.type === "welcome") {
        myId = msg.id;
        msg.players.forEach(p => { if (p.id !== myId) addRemote(p); });
        updateCount(msg.players.length);
      }
      if (msg.type === "join") { addRemote(msg.player); updateCount(remoteCars.size + 1); }
      if (msg.type === "move") {
        const p = msg.player, obj = remoteCars.get(p.id);
        if (obj) { obj.userData.targetX = p.x; obj.userData.targetZ = p.z; obj.rotation.y = p.rotation || 0; }
      }
      if (msg.type === "leave") { const obj = remoteCars.get(msg.id); if (obj) scene.remove(obj); remoteCars.delete(msg.id); updateCount(remoteCars.size + 1); }
      if (msg.type === "count") updateCount(msg.count);
      if (msg.type === "full") connectionEl.textContent = "ROOM FULL";
    };
  } catch { connectionEl.textContent = "SOLO MODE"; }
}
function updateCount(n) { playersEl.textContent = Math.max(1,n) + " / 10 RIDERS"; }
function addRemote(p) {
  if (p.id === myId || remoteCars.has(p.id)) return;
  const car = makeCar(p.color || 0x36c7ff);
  car.position.set(p.x || 0, 0, p.z || -12);
  car.userData.targetX = car.position.x; car.userData.targetZ = car.position.z;
  scene.add(car); remoteCars.set(p.id, car);
}
connect();

let previous = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - previous) / 1000, .04); previous = now;
  const left = keys.has("arrowleft") || keys.has("a") || touch.left;
  const right = keys.has("arrowright") || keys.has("d") || touch.right;
  const gas = keys.has("arrowup") || keys.has("w") || touch.gas;
  const brake = keys.has("arrowdown") || keys.has("s") || touch.brake;
  if (gas) velocity += 22 * dt;
  else velocity -= 7 * dt;
  if (brake) velocity -= 35 * dt;
  velocity = THREE.MathUtils.clamp(velocity, 0, 54);
  const steerInput = (right ? 1 : 0) - (left ? 1 : 0);
  steering = THREE.MathUtils.damp(steering, steerInput, 7, dt);
  x += steering * (2.3 + velocity * .075) * dt;
  x = THREE.MathUtils.clamp(x, -7.4, 7.4);
  z -= velocity * dt * 1.25;
  player.position.x = THREE.MathUtils.damp(player.position.x, x, 12, dt);
  player.rotation.z = -steering * .12;
  player.rotation.y = -steering * .07;
  camera.position.x = THREE.MathUtils.damp(camera.position.x, x * .32, 2, dt);
  camera.lookAt(x * .22, .5, -8);
  dashes.forEach(d => { d.position.z += velocity * dt * 1.25; if (d.position.z > 24) d.position.z -= 264; });
  roadside.forEach(p => { p.position.z += velocity * dt * 1.25; if (p.position.z > 25) p.position.z -= 306; });
  remoteCars.forEach(car => {
    car.position.x = THREE.MathUtils.damp(car.position.x, car.userData.targetX, 8, dt);
    car.position.z = THREE.MathUtils.damp(car.position.z, car.userData.targetZ, 8, dt);
  });
  speedEl.textContent = String(Math.round(velocity * 2.6)).padStart(3,"0");
  if (socket && socket.readyState === WebSocket.OPEN && now - lastSend > 70) {
    socket.send(JSON.stringify({type:"move",x,z,rotation:player.rotation.y,speed:velocity/54}));
    lastSend = now;
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
document.addEventListener("visibilitychange", () => { if (document.hidden) velocity = 0; });