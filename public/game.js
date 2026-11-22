import * as THREE from "three";

const root = document.getElementById("game");
const speedEl = document.getElementById("speed");
const connectionEl = document.getElementById("connection");
const playersEl = document.getElementById("players");
const overtakesEl = document.getElementById("overtakes");
const distanceEl = document.getElementById("distance");
const bestDistanceEl = document.getElementById("best-distance");
const hintEl = document.getElementById("hint");

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
  return 24 * Math.sin(station / 230) + 10 * Math.sin(station / 105 + 0.8);
}
function roadHeading(station) {
  return Math.atan2(roadCenter(station + 1) - roadCenter(station - 1), 2);
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

// Traffic cars create an actual overtaking challenge on the road.
const trafficCars = [];
const trafficLanes = [-5, 0, 5];
let overtakes = 0;
let collisionCooldown = 0;
const bestDistanceKey = "sro_best_distance_km";
let bestDistanceKm = 0;
try { bestDistanceKm = Number(localStorage.getItem(bestDistanceKey)) || 0; } catch {}
let savedBestDistanceKm = bestDistanceKm;
if (bestDistanceEl) bestDistanceEl.textContent = "REKORD " + bestDistanceKm.toFixed(2) + " KM";
let lastRecordSave = 0;
for (let i = 0; i < 6; i++) {
  const lane = trafficLanes[i % trafficLanes.length];
  const car = makeCar([0x36a2ff, 0xf2b544, 0x9bd06a, 0xb7a2ff, 0xe7e7e7, 0xff884d][i]);
  car.scale.setScalar(0.84);
  car.position.set(roadCenter(55 + i * 34) + lane, 0, -55 - i * 34);
  scene.add(car);
  trafficCars.push({
    mesh: car,
    lane,
    speed: 82 + Math.random() * 58,
    z: -55 - i * 34
  });
}

// Detailed roadside buildings with road-facing windows, frames and entrance doors.
const roadside = [];
const pedestrians = [];
const facadeMaterials = {
  frame: mat(0xd2c9b8),
  glass: new THREE.MeshStandardMaterial({ color: 0x426477, roughness: 0.22, metalness: 0.25 }),
  litGlass: new THREE.MeshStandardMaterial({ color: 0xd8bd83, emissive: 0x6b4c20, emissiveIntensity: 0.28, roughness: 0.35 }),
  door: mat(0x46382f),
  trim: mat(0xeee4d1)
};
for (let i = 0; i < 34; i++) {
  const z = -i * 11 - 8;
  for (const side of [-1, 1]) {
    const w = 4 + Math.random() * 4;
    const h = 6 + Math.random() * 15;
    const depth = 6 + Math.random() * 4;
    const offset = side * (16 + Math.random() * 12);
    const buildingGroup = new THREE.Group();
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, depth),
      mat([0x85827b, 0xa99b88, 0x687987, 0xb8b1a5, 0x777b80][i % 5])
    );
    building.position.y = h / 2 - 0.05;
    building.castShadow = true;
    building.receiveShadow = true;
    buildingGroup.add(building);

    // The facade faces the road: windows are inset into visible frames.
    const facadeX = side === -1 ? w / 2 + 0.035 : -w / 2 - 0.035;
    const doorZ = depth * 0.22;
    const floors = Math.max(1, Math.floor((h - 2.2) / 3.1));
    const columns = Math.max(2, Math.floor(depth / 2.25));
    for (let floor = 0; floor < floors; floor++) {
      const y = 1.65 + floor * 3.05;
      for (let col = 0; col < columns; col++) {
        const windowZ = -depth / 2 + (col + 0.5) * depth / columns;
        if (floor === 0 && Math.abs(windowZ - doorZ) < 0.9) continue;
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.35, 1.12), facadeMaterials.frame);
        frame.position.set(facadeX, y, windowZ);
        buildingGroup.add(frame);
        const pane = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.08, 0.84), Math.random() > 0.72 ? facadeMaterials.litGlass : facadeMaterials.glass);
        pane.position.set(facadeX + (side === -1 ? 0.075 : -0.075), y + 0.015, windowZ);
        buildingGroup.add(pane);
        const sill = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 1.2), facadeMaterials.trim);
        sill.position.set(facadeX + (side === -1 ? 0.08 : -0.08), y - 0.7, windowZ);
        buildingGroup.add(sill);
      }
    }
    // A street-level entrance with a small canopy.
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.05, 1.05), facadeMaterials.door);
    door.position.set(facadeX + (side === -1 ? 0.09 : -0.09), 1.0, doorZ);
    buildingGroup.add(door);
    const doorTop = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 1.25), facadeMaterials.trim);
    doorTop.position.set(facadeX + (side === -1 ? 0.1 : -0.1), 2.12, doorZ);
    buildingGroup.add(doorTop);

    buildingGroup.position.set(roadCenter(-z) + offset, 0, z);
    buildingGroup.userData.sideOffset = offset;
    buildingGroup.traverse(object => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    scene.add(buildingGroup);
    roadside.push(buildingGroup);
  }

  // Raised sidewalks and continuous metal crash barriers make the road edge unmistakable.
  for (const side of [-1, 1]) {
    const pathGroup = new THREE.Group();
    const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.16, 11.25), mat(0xaaa9a1));
    sidewalk.position.y = -0.025;
    sidewalk.receiveShadow = true;
    pathGroup.add(sidewalk);

    const railMetal = mat(0x747d83, 0.48);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 11.35), railMetal);
    rail.position.set(-side * 2.42, 0.88, 0);
    rail.castShadow = true;
    pathGroup.add(rail);
    for (const postZ of [-5.35, 0, 5.35]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.92, 0.18), railMetal);
      post.position.set(-side * 2.42, 0.48, postZ);
      post.castShadow = true;
      pathGroup.add(post);
    }

    // Occasional pedestrians, with animated arms and legs, walk along the pavement.
    if (i % 4 === 1) {
      const person = new THREE.Group();
      const clothing = mat([0x344f70, 0x765044, 0x49664b, 0x594d70, 0x9a7047][(i + (side > 0 ? 1 : 0)) % 5]);
      const skin = mat(0xc99570);
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 0.28), clothing);
      torso.position.y = 1.12;
      person.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), skin);
      head.position.y = 1.62;
      person.add(head);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.195, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.48), mat(0x30251f));
      hair.position.set(0, 1.69, 0);
      person.add(hair);
      const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.18), mat(0x9b6840));
      backpack.position.set(0, 1.2, -0.2);
      person.add(backpack);
      const leftLeg = new THREE.Group();
      leftLeg.position.set(-0.12, 0.78, 0);
      const legA = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.16), mat(0x30343b));
      legA.position.y = -0.31;
      leftLeg.add(legA);
      person.add(leftLeg);
      const rightLeg = new THREE.Group();
      rightLeg.position.set(0.12, 0.78, 0);
      const legB = legA.clone();
      rightLeg.add(legB);
      person.add(rightLeg);
      const leftArm = new THREE.Group();
      leftArm.position.set(-0.27, 1.38, 0);
      const armA = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58, 0.14), clothing);
      armA.position.y = -0.27;
      leftArm.add(armA);
      person.add(leftArm);
      const rightArm = new THREE.Group();
      rightArm.position.set(0.27, 1.38, 0);
      const armB = armA.clone();
      rightArm.add(armB);
      person.add(rightArm);
      person.position.set(side * 1.25, 0.1, (Math.random() - 0.5) * 5.5);
      person.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
      person.traverse(part => { if (part.isMesh) { part.castShadow = true; part.receiveShadow = true; } });
      pathGroup.add(person);
      pedestrians.push({ leftLeg, rightLeg, leftArm, rightArm, phase: Math.random() * Math.PI * 2, pace: 2.8 + Math.random() * 0.7 });
    }

    // Small street furniture makes the sidewalks feel like part of a town.
    if (i % 7 === 2) {
      const bench = new THREE.Group();
      const wood = mat(0x79583c);
      const darkMetal = mat(0x343a40);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.12, 0.42), wood);
      seat.position.y = 0.62;
      bench.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.58, 0.1), wood);
      back.position.set(0, 0.94, 0.2);
      bench.add(back);
      for (const x of [-0.52, 0.52]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.58, 0.34), darkMetal);
        leg.position.set(x, 0.3, 0);
        bench.add(leg);
      }
      bench.position.set(side * 1.0, 0.08, (i % 2 ? -2.6 : 2.6));
      bench.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
      pathGroup.add(bench);
    }

    if (i % 5 === 0) {
      const bin = new THREE.Group();
      const binBody = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.72, 10), mat(0x52645c));
      binBody.position.y = 0.43;
      bin.add(binBody);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.09, 10), mat(0x303b37));
      lid.position.y = 0.82;
      bin.add(lid);
      bin.position.set(side * 1.65, 0.08, (i % 2 ? 3.2 : -3.2));
      pathGroup.add(bin);
    }

    const pathOffset = side * 12.55;
    pathGroup.position.set(roadCenter(-z) + pathOffset, 0, z);
    pathGroup.userData.sideOffset = pathOffset;
    pathGroup.rotation.y = -roadHeading(-z);
    scene.add(pathGroup);
    roadside.push(pathGroup);
  }

  // Much sparser street lighting: one lamp roughly every 33 m, alternating sides.
  if (i % 3 === 0) {
    const side = (Math.floor(i / 3) % 2 === 0) ? -1 : 1;
    const pole = new THREE.Group();
    const metal = mat(0x343b43);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 5.2, 10), metal);
    stem.position.y = 2.6;
    pole.add(stem);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.075, 0.075), metal);
    arm.position.set(-side * 0.48, 5.05, 0);
    pole.add(arm);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.28), new THREE.MeshStandardMaterial({ color: 0xffe5ad, emissive: 0x80602c, emissiveIntensity: 0.35 }));
    bulb.position.set(-side * 1.0, 5.0, 0);
    pole.add(bulb);
    const shade = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.4), metal);
    shade.position.set(-side * 1.0, 5.12, 0);
    pole.add(shade);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.58, 0.025, 16), new THREE.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 0.22 }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(-side * 1.0, 0.075, 0);
    pole.add(glow);
    pole.position.set(roadCenter(-z) + side * 11, 0, z);
    pole.userData.sideOffset = side * 11;
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
  if (e.key.toLowerCase() === "r") {
    speedKmh = 0;
    laneX = 0;
    travel = 0;
    overtakes = 0;
    collisionCooldown = 0;
    if (overtakesEl) overtakesEl.textContent = "PŘEDJETÍ 0";
    trafficCars.forEach((traffic, i) => {
      traffic.z = -55 - i * 34;
      traffic.lane = trafficLanes[i % trafficLanes.length];
    });
  }
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
function remoteRelativeZ(p) {
  return Number.isFinite(Number(p.progress)) ? 4 + travel - Number(p.progress) : (p.z || -16);
}
function addRemote(p) {
  if (p.id === myId || remoteCars.has(p.id)) return;
  const car = makeCar(0x36c7ff);
  const relativeZ = remoteRelativeZ(p);
  car.position.set(roadCenter(travel - relativeZ) + (p.x || 0), 0, relativeZ);
  car.userData.targetX = p.x || 0;
  car.userData.targetProgress = Number(p.progress) || 0;
  car.userData.legacyZ = p.z || -16;
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
          obj.userData.targetProgress = Number(p.progress) || 0;
          obj.userData.legacyZ = p.z || -16;
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
    const station = travel - section.position.z;
    section.position.x = roadCenter(station);
    section.rotation.y = -roadHeading(station);
  });
  curbSections.forEach(({ mesh, side }) => {
    mesh.position.z += metres;
    if (mesh.position.z > 24) mesh.position.z -= 320;
    const station = travel - mesh.position.z;
    mesh.position.x = roadCenter(station) + side * 9.25;
    mesh.rotation.y = -roadHeading(station);
  });
  dashes.forEach(({ mesh, lane }) => {
    mesh.position.z += metres;
    if (mesh.position.z > 24) mesh.position.z -= 312;
    const station = travel - mesh.position.z;
    mesh.position.x = roadCenter(station) + lane;
    mesh.rotation.y = -roadHeading(station);
  });
  roadside.forEach(object => {
    object.position.z += metres;
    if (object.position.z > 28) object.position.z -= 374;
    const station = travel - object.position.z;
    object.position.x = roadCenter(station) + object.userData.sideOffset;
    object.rotation.y = -roadHeading(station);
  });

  pedestrians.forEach(person => {
    const stride = Math.sin(now * 0.001 * person.pace + person.phase) * 0.48;
    person.leftLeg.rotation.x = stride;
    person.rightLeg.rotation.x = -stride;
    person.leftArm.rotation.x = -stride * 0.65;
    person.rightArm.rotation.x = stride * 0.65;
  });

  // Traffic moves at its own speed. Faster driving closes the gap and allows overtaking.
  collisionCooldown = Math.max(0, collisionCooldown - dt);
  trafficCars.forEach(traffic => {
    traffic.z += ((speedKmh - traffic.speed) / 3.6) * dt;
    if (traffic.z > 12) {
      overtakes += 1;
      if (overtakesEl) overtakesEl.textContent = "PŘEDJETÍ " + overtakes;
      traffic.z = -210 - Math.random() * 90;
      const choices = trafficLanes.filter(lane => lane !== traffic.lane);
      traffic.lane = choices[Math.floor(Math.random() * choices.length)];
      traffic.speed = 82 + Math.random() * 58;
    } else if (traffic.z < -300) {
      traffic.z = -75 - Math.random() * 150;
      traffic.lane = trafficLanes[Math.floor(Math.random() * trafficLanes.length)];
    }
    traffic.mesh.position.z = traffic.z;
    traffic.mesh.position.x = roadCenter(travel - traffic.z) + traffic.lane;
    traffic.mesh.rotation.y = -roadHeading(travel - traffic.z);

    if (collisionCooldown <= 0 && Math.abs(traffic.z - 4) < 2.6 && Math.abs(laneX - traffic.lane) < 1.65) {
      speedKmh = Math.max(20, speedKmh * 0.42);
      laneX = THREE.MathUtils.clamp(laneX + (laneX <= traffic.lane ? -1.8 : 1.8), -7.1, 7.1);
      collisionCooldown = 1.25;
      if (hintEl) {
        hintEl.textContent = "KOLIZE! ZPOMALIL JSI";
        hintEl.style.color = "#ff6875";
        setTimeout(() => {
          if (hintEl) {
            hintEl.textContent = "VYHÝBEJ SE PROVOZU A PŘEDJÍŽDĚJ";
            hintEl.style.color = "";
          }
        }, 1100);
      }
    }
  });

  const playerCenter = roadCenter(travel - 4);
  player.position.x = playerCenter + laneX;
  player.rotation.z = -steering * 0.12 * speedFactor;
  player.rotation.y = -roadHeading(travel - 4) - steering * 0.08;
  // Keep the camera centered behind the player's actual lane, including at road edges.
  camera.position.x = THREE.MathUtils.damp(camera.position.x, player.position.x, 5.5, dt);
  camera.lookAt(roadCenter(travel + 12) + laneX * 0.78, 0.65, -12);

  remoteCars.forEach(car => {
    const targetZ = 4 + travel - car.userData.targetProgress;
    const tx = roadCenter(travel - targetZ) + car.userData.targetX;
    car.position.x = THREE.MathUtils.damp(car.position.x, tx, 8, dt);
    car.position.z = THREE.MathUtils.damp(car.position.z, targetZ, 8, dt);
  });

  speedEl.textContent = String(Math.round(speedKmh)).padStart(3, "0");
  const distanceKm = travel / 1000;
  if (distanceEl) distanceEl.textContent = "JÍZDA " + distanceKm.toFixed(2) + " KM";
  if (distanceKm > bestDistanceKm) {
    bestDistanceKm = distanceKm;
    if (bestDistanceEl) bestDistanceEl.textContent = "REKORD " + bestDistanceKm.toFixed(2) + " KM";
  }
  if (bestDistanceKm > savedBestDistanceKm && now - lastRecordSave > 1000) {
    try { localStorage.setItem(bestDistanceKey, String(bestDistanceKm)); } catch {}
    savedBestDistanceKm = bestDistanceKm;
    lastRecordSave = now;
  }
  if (socket && socket.readyState === WebSocket.OPEN && now - lastSend > 70) {
    socket.send(JSON.stringify({ type: "move", x: laneX, z: -16, progress: travel, rotation: player.rotation.y, speed: speedKmh / 220 }));
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
