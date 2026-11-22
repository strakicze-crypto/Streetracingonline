import * as THREE from "three";

const root = document.getElementById("game");
const speedEl = document.getElementById("speed");
const connectionEl = document.getElementById("connection");
const playersEl = document.getElementById("players");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91b6d0);
scene.fog = new THREE.Fog(0x91b6d0, 65, 230);

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 320);
camera.position.set(0, 5.8, 12);
camera.lookAt(0, 0.7, -12);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
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
const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), grassMat);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, -0.16, -100);
ground.receiveShadow = true;
scene.add(ground);

// Short road sections follow one continuous, gently winding road.
function roadCenter(station) {
  return 17 * Math.sin(station / 245) + 7 * Math.sin(station / 108 + 0.8);
}
const roadSections = [];
const curbSections = [];
for (let i = 0; i < 32; i++) {
  const z = 18 - i * 10;
  const section = new THREE.Mesh(new THREE.BoxGeometry(18, 0.12, 10.15), roadMat);
  section.position.set(roadCenter(-z), -0.02, z);
  section.receiveShadow = true;
  scene.add(section);
  roadSections.push(section);
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 10.15), curbMat);
    curb.position.set(roadCenter(-z) + side * 9.25, 0.03, z);
    scene.add(curb);
    curbSections.push({ mesh: curb, side });
  }
}

const dashes = [];
for (let z = 18; z > -290; z -= 12) {
  for (const lane of [-3, 3]) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.035, 4.2), lineMat);
    dash.position.set(roadCenter(-z) + lane, 0.065, z);
    scene.add(dash);
    dashes.push({ mesh: dash, lane });
  }
}

function makeCar(color = 0xe83d4d) {
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.55, 3.35), mat(color, 0.35));
  body.position.y = 0.62;
  body.castShadow = true;
  car.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.62, 1.65), mat(0x182635, 0.25));
  cabin.position.set(0, 1.12, -0.18);
  cabin.castShadow = true;
  car.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.38, 0.08), mat(0x8bb4c9, 0.2));
  glass.position.set(0, 1.15, 0.68);
  car.add(glass);
  for (const x of [-0.94, 0.94]) for (const z of [-1.05, 1.05]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.22, 16), mat(0x101216));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.38, z);
    wheel.castShadow = true;
    car.add(wheel);
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
  for (const x of [-0.57, 0.57]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.05), lampMat);
    lamp.position.set(x, 0.66, -1.7);
    car.add(lamp);
  }
  return car;
}

const player = makeCar(0xe83d4d);
player.position.set(0, 0, 4);
scene.add(player);

// Buildings and streetlights follow the road instead of forming a straight skyline.
const roadside = [];
for (let i = 0; i < 34; i++) {
  const z = -i * 11 - 8;
  for (const side of [-1, 1]) {
    const w = 3 + Math.random() * 5;
    const h = 5 + Math.random() * 18;
    const offset = side * (15 + Math.random() * 12);
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 5 + Math.random() * 4),
      mat([0x78818c, 0x9a9b98, 0x687987, 0xb0a79c][i % 4])
    );
    building.position.set(roadCenter(-z) + offset, h / 2 - 0.05, z);
    building.castShadow = true;
    building.receiveShadow = true;
    building.userData.sideOffset = offset;
    scene.add(building);
    roadside.push(building);

    const pole = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5, 8), mat(0x333a43));
    stem.position.y = 2.5;
    pole.add(stem);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), mat(0x333a43));
    arm.position.set(-side * 0.6, 4.85, 0);
    pole.add(arm);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe3a3 }));
    bulb.position.set(-side * 1.2, 4.8, 0);
    pole.add(bulb);
    pole.position.set(roadCenter(-z) + side * 10, 0, z);
    pole.userData.sideOffset = side * 10;
    scene.add(pole);
    roadside.push(pole);
  }
}

const keys = new Set();
const touch = { left: false, right: false, gas: false, brake: false };
function bindHold(id, key) {
  const el = document.getElementById(id);
  const on = e => { e.preventDefault(); touch[key] = true; el.classList.add("active"); };
  const off = e => { e.preventDefault(); touch[key] = false; el.classList.remove("active"); };
  el.addEventListener("pointerdown", on);
  ["pointerup", "pointercancel", "pointerleave"].forEach(type => el.addEventListener(type, off));
}
bindHold("left", "left");
bindHold("right", "right");
bindHold("gas", "gas");
bindHold("brake", "brake");
addEventListener("keydown", e => {
  keys.add(e.key.toLowerCase());
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) e.preventDefault();
  if (e.key.toLowerCase() === "r") { speedKmh = 0; laneX = 0; }
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));

let laneX = 0;
let speedKmh = 0;
let travel = 0;
let steering = 0;
let lastSend = 0;
let myId = null;
const remoteCars = new Map();
const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
let socket;

function updateCount(n) {
  playersEl.textContent = Math.max(1, n) + " / 10 RIDERS";
}
function addRemote(p) {
  if (p.id === myId || remoteCars.has(p.id)) return;
  const car = makeCar(0x36c7ff);
  car.position.set(roadCenter(travel - (p.z || -16)) + (p.x || 0), 0, p.z || -16);
  car.userData.targetX = p.x || 0;
  car.userData.targetZ = p.z || -16;
  scene.add(car);
  remoteCars.set(p.id, car);
}
function connect() {
  try {
    socket = new WebSocket(wsProto + "//" + location.host);
    socket.onopen = () => { connectionEl.textContent = "ONLINE"; connectionEl.style.color = "#72e5a5"; };
    socket.onclose = () => {
      connectionEl.textContent = "OFFLINE · SOLO";
      connectionEl.style.color = "#ffb45b";
      setTimeout(connect, 3500);
    };
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
        const p = msg.player;
        const obj = remoteCars.get(p.id);
        if (obj) {
          obj.userData.targetX = p.x;
          obj.userData.targetZ = p.z;
          obj.rotation.y = p.rotation || 0;
        }
      }
      if (msg.type === "leave") {
        const obj = remoteCars.get(msg.id);
        if (obj) scene.remove(obj);
        remoteCars.delete(msg.id);
        updateCount(remoteCars.size + 1);
      }
      if (msg.type === "count") updateCount(msg.count);
      if (msg.type === "full") connectionEl.textContent = "ROOM FULL";
    };
  } catch {
    connectionEl.textContent = "SOLO MODE";
  }
}
connect();

let previous = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - previous) / 1000, 0.04);
  previous = now;

  const left = keys.has("arrowleft") || keys.has("a") || touch.left;
  const right = keys.has("arrowright") || keys.has("d") || touch.right;
  const gas = keys.has("arrowup") || keys.has("w") || touch.gas;
  const brake = keys.has("arrowdown") || keys.has("s") || touch.brake;

  // The speedometer and scenery now use the same real km/h conversion.
  if (gas) speedKmh += 10.5 * dt;
  else speedKmh -= 4.5 * dt;
  if (brake) speedKmh -= 24 * dt;
  speedKmh = THREE.MathUtils.clamp(speedKmh, 0, 220);

  const steerInput = (right ? 1 : 0) - (left ? 1 : 0);
  steering = THREE.MathUtils.damp(steering, steerInput, 6.5, dt);
  const speedFactor = 0.35 + Math.min(speedKmh / 150, 1) * 0.65;
  laneX += steering * (2.7 + speedKmh * 0.018) * dt;
  laneX = THREE.MathUtils.clamp(laneX, -7.1, 7.1);

  const metres = (speedKmh / 3.6) * dt;
  travel += metres;

  roadSections.forEach(section => {
    section.position.z += metres;
    if (section.position.z > 24) section.position.z -= 320;
    section.position.x = roadCenter(travel - section.position.z);
  });
  curbSections.forEach(({ mesh, side }) => {
    mesh.position.z += metres;
    if (mesh.position.z > 24) mesh.position.z -= 320;
    mesh.position.x = roadCenter(travel - mesh.position.z) + side * 9.25;
  });
  dashes.forEach(({ mesh, lane }) => {
    mesh.position.z += metres;
    if (mesh.position.z > 24) mesh.position.z -= 312;
    mesh.position.x = roadCenter(travel - mesh.position.z) + lane;
  });
  roadside.forEach(object => {
    object.position.z += metres;
    if (object.position.z > 28) object.position.z -= 374;
    object.position.x = roadCenter(travel - object.position.z) + object.userData.sideOffset;
  });

  const playerCenter = roadCenter(travel - 4);
  player.position.x = playerCenter + laneX;
  player.rotation.z = -steering * 0.12 * speedFactor;
  player.rotation.y = -steering * 0.08;
  const cameraCenter = roadCenter(travel - 12);
  camera.position.x = THREE.MathUtils.damp(camera.position.x, cameraCenter + laneX * 0.28, 3.5, dt);
  camera.lookAt(roadCenter(travel + 12) + laneX * 0.15, 0.65, -12);

  remoteCars.forEach(car => {
    const tx = roadCenter(travel - car.userData.targetZ) + car.userData.targetX;
    car.position.x = THREE.MathUtils.damp(car.position.x, tx, 8, dt);
    car.position.z = THREE.MathUtils.damp(car.position.z, car.userData.targetZ, 8, dt);
  });

  speedEl.textContent = String(Math.round(speedKmh)).padStart(3, "0");
  if (socket && socket.readyState === WebSocket.OPEN && now - lastSend > 70) {
    socket.send(JSON.stringify({ type: "move", x: laneX, z: -16, rotation: player.rotation.y, speed: speedKmh / 220 }));
    lastSend = now;
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) speedKmh = 0;
});
