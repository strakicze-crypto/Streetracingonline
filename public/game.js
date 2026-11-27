import * as THREE from "three";

const root = document.getElementById("game");
const speedEl = document.getElementById("speed");
const connectionEl = document.getElementById("connection");
const playersEl = document.getElementById("players");
const overtakesEl = document.getElementById("overtakes");
const distanceEl = document.getElementById("distance");
const bestDistanceEl = document.getElementById("best-distance");
const hintEl = document.getElementById("hint");
const difficultyScreen = document.getElementById("difficulty-screen");
const pauseScreen = document.getElementById("pause-screen");
const pauseButton = document.getElementById("pause-button");
const nicknameInput = document.getElementById("nickname-input");
const nicknameStep = document.getElementById("nickname-step");
const difficultyStep = document.getElementById("difficulty-step");
const nicknameSave = document.getElementById("nickname-save");
const resumeButton = document.getElementById("resume-button");
const changeDifficultyButton = document.getElementById("change-difficulty-button");
const leaderboardList = document.getElementById("leaderboard-list");
const currentScoreEl = document.getElementById("current-score");
const driveScoreEl = document.getElementById("drive-score");
const nicknameKey = "sro_player_nickname";
let nickname = "";
try { nickname = localStorage.getItem(nicknameKey) || ""; } catch {}
let gamePaused = false;
let gameStarted = false;
let activeTrafficCount = 0;

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

function makeCar(color = 0xe83d4d, modelType = 0, isPlayer = false) {
  const car = new THREE.Group();
  const models = [
    { name: "sedan", width: 1.78, length: 3.65, cabinW: 1.42, cabinH: 0.62, cabinL: 1.85, cabinZ: -0.12, roofY: 1.15, wheelZ: 1.12, wheelX: 0.96 },
    { name: "hatchback", width: 1.72, length: 3.25, cabinW: 1.42, cabinH: 0.68, cabinL: 1.78, cabinZ: -0.30, roofY: 1.17, wheelZ: 0.98, wheelX: 0.93 },
    { name: "suv", width: 1.92, length: 3.75, cabinW: 1.58, cabinH: 0.82, cabinL: 1.95, cabinZ: -0.10, roofY: 1.32, wheelZ: 1.12, wheelX: 1.03 },
    { name: "coupe", width: 1.82, length: 3.55, cabinW: 1.38, cabinH: 0.48, cabinL: 1.72, cabinZ: -0.18, roofY: 1.08, wheelZ: 1.08, wheelX: 0.98 },
    { name: "van", width: 1.9, length: 3.6, cabinW: 1.62, cabinH: 0.92, cabinL: 2.25, cabinZ: -0.02, roofY: 1.38, wheelZ: 1.05, wheelX: 1.02 }
  ];
  const spec = isPlayer ? {
    name: "fiat-stilo-5door", width: 1.78, length: 3.75,
    cabinW: 1.48, cabinH: 0.72, cabinL: 2.15, cabinZ: -0.22,
    roofY: 1.2, wheelZ: 1.13, wheelX: 0.98
  } : models[Math.abs(modelType) % models.length];
  const bodyPaint = new THREE.MeshStandardMaterial({ color, roughness: 0.27, metalness: isPlayer ? 0.62 : 0.12 });
  if (isPlayer) {
    // Rounded five-door Stilo silhouette, extruded from its side profile.
    // Local profile X is the car's length; the body is then turned across its width.
    const profile = new THREE.Shape();
    const points = [
      [-1.88, 0.52], [-1.84, 0.78], [-1.68, 0.94], [-1.35, 1.02],
      [-0.92, 1.04], [-0.55, 1.52], [-0.31, 1.76], [0.66, 1.76],
      [0.91, 1.62], [1.16, 1.08], [1.58, 1.04], [1.82, 0.88],
      [1.88, 0.65], [1.82, 0.52], [-1.88, 0.52]
    ];
    profile.moveTo(-points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) profile.lineTo(-points[i][0], points[i][1]);
    const shellGeometry = new THREE.ExtrudeGeometry(profile, {
      depth: spec.width, bevelEnabled: true, bevelSegments: 2,
      steps: 1, bevelSize: 0.035, bevelThickness: 0.035, curveSegments: 8
    });
    shellGeometry.translate(0, 0, -spec.width / 2);
    shellGeometry.rotateY(Math.PI / 2);
    const shell = new THREE.Mesh(shellGeometry, bodyPaint);
    shell.castShadow = true;
    shell.receiveShadow = true;
    car.add(shell);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(spec.width, 0.58, spec.length), bodyPaint);
    body.position.y = 0.63;
    body.castShadow = true;
    body.receiveShadow = true;
    car.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.cabinW, spec.cabinH, spec.cabinL), mat(0x182635, 0.24));
    cabin.position.set(0, spec.roofY, spec.cabinZ);
    cabin.castShadow = true;
    car.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(spec.cabinW * 0.94, 0.075, spec.cabinL * 0.66), bodyPaint);
    roof.position.set(0, spec.roofY + spec.cabinH * 0.48, spec.cabinZ - 0.02);
    car.add(roof);
  }

  // Windscreen, rear glass and side windows give each body a recognisable car silhouette.
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8bb4c9, roughness: 0.18, metalness: 0.18 });
  const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(spec.cabinW * 0.88, spec.cabinH * 0.38, 0.055), glassMat);
  frontGlass.position.set(0, isPlayer ? 1.39 : spec.roofY + 0.015, isPlayer ? -0.82 : spec.cabinZ - spec.cabinL * 0.49);
  frontGlass.rotation.x = isPlayer ? -0.48 : -0.16;
  car.add(frontGlass);
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(spec.cabinW * 0.84, spec.cabinH * 0.34, 0.05), glassMat);
  rearGlass.position.set(0, isPlayer ? 1.39 : spec.roofY, isPlayer ? 1.02 : spec.cabinZ + spec.cabinL * 0.49);
  rearGlass.rotation.x = isPlayer ? 0.48 : 0.18;
  car.add(rearGlass);
  for (const side of [-1, 1]) {
    if (isPlayer) {
      // Stilo's five-door greenhouse: front, rear-door and rear-quarter glass.
      const windowParts = [
        { z: -0.77, length: 0.58, height: 0.48 },
        { z: -0.08, length: 0.62, height: 0.48 },
        { z: 0.65, length: 0.34, height: 0.42 }
      ];
      windowParts.forEach(part => {
        const pane = new THREE.Mesh(new THREE.BoxGeometry(0.045, part.height, part.length), glassMat);
        pane.position.set(side * (spec.cabinW / 2 + 0.014), spec.roofY + 0.02, part.z);
        car.add(pane);
      });
      const seamMat = mat(0x737b82, 0.55);
      for (const z of [-0.38, 0.43]) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.48, 0.025), seamMat);
        seam.position.set(side * (spec.width / 2 + 0.012), 0.68, z);
        car.add(seam);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.055, 0.19), mat(0xdce0e3, 0.3));
        handle.position.set(side * (spec.width / 2 + 0.035), 0.83, z - 0.12);
        car.add(handle);
      }
    } else {
      const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.045, spec.cabinH * 0.52, spec.cabinL * 0.72), glassMat);
      sideWindow.position.set(side * (spec.cabinW / 2 + 0.012), spec.roofY + 0.015, spec.cabinZ);
      car.add(sideWindow);
    }
  }

  const wheelMat = mat(0x101216, 0.95);
  const rimMat = mat(0x9ba4aa, 0.35);
  for (const x of [-spec.wheelX, spec.wheelX]) for (const z of [-spec.wheelZ, spec.wheelZ]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.22, 16), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.39, z);
    wheel.castShadow = true;
    car.add(wheel);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.235, 12), rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x * 1.005, 0.39, z);
    car.add(rim);
  }

  // Front bumper, grille and bright headlamps (the car faces toward -Z).
  const bumperMat = mat(0x252a30, 0.45);
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.96, 0.17, 0.16), bumperMat);
  frontBumper.position.set(0, 0.43, -spec.length / 2 - 0.015);
  car.add(frontBumper);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.34, 0.16, 0.035), mat(0x10151a, 0.5));
  grille.position.set(0, 0.62, -spec.length / 2 - 0.025);
  car.add(grille);

  const headHousing = mat(0x303943, 0.35);
  const headLens = new THREE.MeshStandardMaterial({ color: 0xfff2cf, emissive: 0xffd77a, emissiveIntensity: 1.25, roughness: 0.18 });
  const tailLens = new THREE.MeshStandardMaterial({ color: 0xff2638, emissive: 0xc90018, emissiveIntensity: 0.9, roughness: 0.2 });
  for (const x of [-spec.width * 0.34, spec.width * 0.34]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.19, 0.075), headHousing);
    housing.position.set(x, 0.72, -spec.length / 2 - 0.035);
    car.add(housing);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.115, 0.045), headLens);
    lamp.position.set(x, 0.73, -spec.length / 2 - 0.08);
    car.add(lamp);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.06), tailLens);
    tail.position.set(x, 0.72, spec.length / 2 + 0.045);
    car.add(tail);
  }
  // Amber front and rear turn signals.
  const indicatorMaterials = { left: [], right: [] };
  for (const side of [-1, 1]) {
    for (const z of [-spec.length / 2 - 0.09, spec.length / 2 + 0.09]) {
      const lensMat = new THREE.MeshStandardMaterial({ color: 0xffa21a, emissive: 0xff8500, emissiveIntensity: 0, roughness: 0.22 });
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.105, 0.055), lensMat);
      lens.position.set(side * spec.width * 0.39, 0.77, z);
      car.add(lens);
      indicatorMaterials[side < 0 ? "left" : "right"].push(lensMat);
    }
  }
  car.userData.indicators = indicatorMaterials;

  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.96, 0.16, 0.15), bumperMat);
  rearBumper.position.set(0, 0.43, spec.length / 2 + 0.015);
  car.add(rearBumper);
  if (isPlayer) {
    // Fiat Stilo 5-door details: tall rear lamps, rounded wheel arches,
    // two visible door cuts, front Fiat badge and the wide lower intake.
    const archMat = mat(0x8b949b, 0.55);
    for (const x of [-spec.wheelX, spec.wheelX]) {
      for (const z of [-spec.wheelZ, spec.wheelZ]) {
        const arch = new THREE.Mesh(new THREE.TorusGeometry(0.435, 0.045, 8, 28), archMat);
        arch.rotation.y = Math.PI / 2;
        arch.position.set(x * 0.93, 0.48, z);
        car.add(arch);
      }
    }

    // Side rub strips and door outlines make the five-door layout legible.
    const trimMat = mat(0x777f86, 0.5);
    for (const side of [-1, 1]) {
      const rubbingStrip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.095, 2.55), trimMat);
      rubbingStrip.position.set(side * 0.895, 0.68, 0.02);
      car.add(rubbingStrip);
      for (const z of [-0.34, 0.52]) {
        const doorCut = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.53, 0.018), mat(0x59636b, 0.6));
        doorCut.position.set(side * 0.905, 0.91, z);
        car.add(doorCut);
      }
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.065, 0.22), mat(0xdce1e5, 0.28));
      handle.position.set(side * 0.925, 1.02, 0.34);
      car.add(handle);
      const rearHandle = handle.clone();
      rearHandle.position.z = 1.12;
      car.add(rearHandle);
      const mirrorBase = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.19), mat(0x343b42, 0.4));
      mirrorBase.position.set(side * 0.94, 1.28, -0.94);
      car.add(mirrorBase);
    }

    // Stilo's tall, swept headlamp units and lower bumper fog lamps.
    const headShape = new THREE.Shape();
    headShape.moveTo(-0.28, -0.10);
    headShape.lineTo(0.22, -0.07);
    headShape.lineTo(0.34, 0.04);
    headShape.lineTo(0.25, 0.18);
    headShape.lineTo(-0.20, 0.16);
    headShape.lineTo(-0.34, 0.05);
    headShape.closePath();
    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.ShapeGeometry(headShape), new THREE.MeshStandardMaterial({
        color: 0xf6f2df, emissive: 0x6e6850, emissiveIntensity: 0.32,
        roughness: 0.18, side: THREE.DoubleSide
      }));
      head.position.set(side * 0.55, 0.86, -1.91);
      car.add(head);
      const fog = new THREE.Mesh(new THREE.CircleGeometry(0.085, 16), new THREE.MeshStandardMaterial({
        color: 0xfff0c4, emissive: 0x66552c, emissiveIntensity: 0.35
      }));
      fog.position.set(side * 0.62, 0.48, -1.965);
      car.add(fog);

      // Tall red rear light clusters at the outer edges of the hatch.
      const rearLight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.075), new THREE.MeshStandardMaterial({
        color: 0xe62935, emissive: 0x79000b, emissiveIntensity: 0.55, roughness: 0.22
      }));
      rearLight.position.set(side * 0.72, 0.99, 1.91);
      car.add(rearLight);
      const reverse = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.025), mat(0xe8e8df, 0.25));
      reverse.position.set(side * 0.72, 0.78, 1.96);
      car.add(reverse);
    }

    const lowerIntake = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.16, 0.045), mat(0x171c20, 0.6));
    lowerIntake.position.set(0, 0.49, -1.965);
    car.add(lowerIntake);
    const badgeRing = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.035, 24), mat(0x9d1824, 0.3));
    badgeRing.rotation.x = Math.PI / 2;
    badgeRing.position.set(0, 0.73, -1.98);
    car.add(badgeRing);
    const badgeCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 24), mat(0xd9dce0, 0.25));
    badgeCenter.rotation.x = Math.PI / 2;
    badgeCenter.position.set(0, 0.73, -2.005);
    car.add(badgeCenter);

    // Rear hatch handle and number plate.
    const hatchHandle = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.055, 0.035), mat(0x343b42, 0.45));
    hatchHandle.position.set(0, 0.88, 1.965);
    car.add(hatchHandle);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.025), mat(0xe6e8e8, 0.45));
    plate.position.set(0, 0.58, 1.98);
    car.add(plate);
  }

  // Small mirrors break up the plain box shape.
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.22), mat(color, 0.35));
    mirror.position.set(side * (spec.width / 2 + 0.08), 1.0, -0.48);
    car.add(mirror);
  }
  return car;
}

function updateIndicators(vehicle, side, now) {
  const indicators = vehicle.userData.indicators;
  if (!indicators) return;
  const flashing = side !== 0 && (Math.floor(now / 420) % 2 === 0);
  for (const key of ["left", "right"]) {
    const intensity = key === (side < 0 ? "left" : "right") && flashing ? 2.8 : 0;
    indicators[key].forEach(material => { material.emissiveIntensity = intensity; });
  }
}

function makeTruck(color = 0xd9d9d9) {
  const truck = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.12 });
  const dark = mat(0x252a30, 0.75);
  const glass = new THREE.MeshStandardMaterial({ color: 0x263b4a, roughness: 0.2, metalness: 0.12 });
  const silver = mat(0x9aa2a8, 0.42);

  // Long box trailer behind the cab (the truck faces toward -Z).
  const trailer = new THREE.Mesh(new THREE.BoxGeometry(2.48, 3.05, 7.25), paint);
  trailer.position.set(0, 2.18, 2.05);
  trailer.castShadow = true;
  trailer.receiveShadow = true;
  truck.add(trailer);
  const trailerRoof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 7.28), silver);
  trailerRoof.position.set(0, 3.76, 2.05);
  truck.add(trailerRoof);
  const rearDoors = new THREE.Mesh(new THREE.BoxGeometry(2.38, 2.9, 0.07), mat(0xb9c0c4, 0.6));
  rearDoors.position.set(0, 2.18, 5.7);
  truck.add(rearDoors);
  for (const x of [-0.58, 0.58]) {
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.045, 2.7, 0.09), dark);
    hinge.position.set(x, 2.18, 5.76);
    truck.add(hinge);
  }
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.32, 9.3), dark);
  chassis.position.set(0, 0.72, 0.45);
  truck.add(chassis);

  // Tractor cab with windshield, side windows, grille and mirrors.
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.42, 2.65, 2.55), paint);
  cab.position.set(0, 1.85, -3.35);
  cab.castShadow = true;
  cab.receiveShadow = true;
  truck.add(cab);
  const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.16, 1.95), paint);
  cabRoof.position.set(0, 3.22, -3.43);
  truck.add(cabRoof);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.95, 0.055), glass);
  windshield.position.set(0, 2.55, -4.64);
  truck.add(windshield);
  for (const side of [-1, 1]) {
    const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.95, 1.25), glass);
    sideWindow.position.set(side * 1.225, 2.55, -3.35);
    truck.add(sideWindow);
    const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.62), dark);
    mirrorArm.position.set(side * 1.36, 2.35, -4.05);
    truck.add(mirrorArm);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.24), dark);
    mirror.position.set(side * 1.42, 2.35, -4.34);
    truck.add(mirror);
    const fuelTank = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 1.1), silver);
    fuelTank.position.set(side * 1.12, 0.78, -1.75);
    truck.add(fuelTank);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.82, 0.08), dark);
  grille.position.set(0, 1.55, -4.66);
  truck.add(grille);
  for (let y = 1.28; y <= 1.82; y += 0.18) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.035, 0.095), silver);
    bar.position.set(0, y, -4.72);
    truck.add(bar);
  }
  for (const x of [-0.88, 0.88]) {
    const headlamp = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.09),
      new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0x9b824c, emissiveIntensity: 0.55 }));
    headlamp.position.set(x, 1.05, -4.68);
    truck.add(headlamp);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.52, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xe32c36, emissive: 0x71000a, emissiveIntensity: 0.45 }));
    tail.position.set(x * 1.18, 1.12, 5.72);
    truck.add(tail);
  }

  // Amber indicators on both front corners and rear trailer corners.
  const indicatorMaterials = { left: [], right: [] };
  for (const side of [-1, 1]) {
    const frontMat = new THREE.MeshStandardMaterial({ color: 0xffa21a, emissive: 0xff8500, emissiveIntensity: 0, roughness: 0.22 });
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.07), frontMat);
    front.position.set(side * 1.05, 1.08, -4.72);
    truck.add(front);
    indicatorMaterials[side < 0 ? "left" : "right"].push(frontMat);
    const rearMat = new THREE.MeshStandardMaterial({ color: 0xffa21a, emissive: 0xff8500, emissiveIntensity: 0, roughness: 0.22 });
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.07), rearMat);
    rear.position.set(side * 1.08, 1.12, 5.78);
    truck.add(rear);
    indicatorMaterials[side < 0 ? "left" : "right"].push(rearMat);
  }
  truck.userData.indicators = indicatorMaterials;

  // Three axles on the tractor/trailer combination.
  for (const z of [-3.75, 2.95, 4.65]) {
    for (const x of [-1.28, 1.28]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.28, 14), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.53, z);
      wheel.castShadow = true;
      truck.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 12), silver);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x * 1.005, 0.53, z);
      truck.add(hub);
    }
  }
  truck.userData.collisionLength = 10.5;
  return truck;
}

const player = new THREE.Group();
const fallbackPlayer = makeCar(0xe83d4d, 0, true);
player.add(fallbackPlayer);
player.userData.indicators = fallbackPlayer.userData.indicators;
player.userData.collisionLength = 3.75;
player.position.set(0, 0, 4);
scene.add(player);

// Load the supplied Fiat Stilo COLLADA model. Keep the red car as a fallback until loading succeeds.
async function loadPlayerModel() {
  try {
    const { ColladaLoader } = await import('https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/loaders/ColladaLoader.js');
    const loader = new ColladaLoader();
    const collada = await new Promise((resolve, reject) => loader.load('./assets/model.dae', resolve, undefined, reject));
    const model = collada.scene;

    // SketchUp exports contain separate line geometry for visible edges.
    // Remove these line objects to eliminate the white triangulation overlay.
    const edgeObjects = [];
    model.traverse(object => {
      if (object.isLine || object.isLineSegments || object.isLineLoop) edgeObjects.push(object);
    });
    edgeObjects.forEach(object => {
      if (object.parent) object.parent.remove(object);
    });

    // Remove oversized construction/floor geometry before measuring the car.
    model.updateMatrixWorld(true);
    const oversized = [];
    model.traverse(object => {
      if (!object.isMesh || !object.geometry) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      const box = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
      const dimensions = box.getSize(new THREE.Vector3());
      if (Math.max(dimensions.x, dimensions.y, dimensions.z) > 12) oversized.push(object);
    });
    oversized.forEach(object => {
      if (object.parent) object.parent.remove(object);
    });

    model.updateMatrixWorld(true);
    let bounds = new THREE.Box3().setFromObject(model);
    let size = bounds.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.x + size.y + size.z) || Math.max(size.x, size.y, size.z) < 0.01) {
      throw new Error('The COLLADA model has no usable vehicle geometry.');
    }

    // The longest horizontal axis is the car's length; the game uses Z for length.
    if (size.x > size.z) {
      model.rotation.y = Math.PI / 2;
      model.updateMatrixWorld(true);
      bounds = new THREE.Box3().setFromObject(model);
      size = bounds.getSize(new THREE.Vector3());
    }

    const scale = Math.min(1.78 / Math.max(size.x, 0.001), 3.75 / Math.max(size.z, 0.001), 1.65 / Math.max(size.y, 0.001));
    // Reverse only the car's length axis. This keeps the roof upright while
    // changing front/rear orientation to match the direction of traffic.
    const finalScale = scale * 0.04; // 20% smaller than the currently tested model
    // Flip the vertical and length axes together: this is a 180-degree roll,
    // which puts the wheels below the roof and restores the front/rear direction.
    model.scale.set(-finalScale, -finalScale, finalScale);
    model.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= bounds.min.y;

    model.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      if (!object.material) return;

      // The COLLADA file uses four separate neutral materials across the
      // body shell. Match those finishes to one silver paint, but never touch
      // wheel/tire parts: material_5 is also reused on the tire geometry.
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      let parent = object;
      let hierarchyName = '';
      while (parent) {
        hierarchyName += ' ' + (parent.name || '');
        parent = parent.parent;
      }
      const isWheelPart = /wheel|tire|tyre|rim/i.test(hierarchyName);
      const materials = sourceMaterials.map(source => {
        const material = source.clone();
        const name = (source.name || '').toLowerCase();
        const isBodyPaint = /^(_1|_2|material_1|material_5)$/.test(name);
        const isEmissive = material.emissive && material.emissive.getHex() !== 0;
        const isTransparent = material.transparent || material.opacity < 0.98;

        // Preserve the original red lamps, blue glass, black trim and wheels.
        // Only the four neutral shell materials are unified to silver.
        if (isBodyPaint && !isWheelPart && !isEmissive && !isTransparent && material.color) {
          material.color.set(0xbfc7cf);
          if ('metalness' in material) material.metalness = 0.72;
          if ('roughness' in material) material.roughness = 0.32;
        }
        if ('wireframe' in material) material.wireframe = false;
        material.needsUpdate = true;
        return material;
      });
      object.material = Array.isArray(object.material) ? materials : materials[0];
    });
    player.remove(fallbackPlayer);
    player.add(model);

    const indicatorMaterials = { left: [], right: [] };
    for (const side of [-1, 1]) {
      for (const z of [-0.086, 0.086]) {
        const material = new THREE.MeshStandardMaterial({ color: 0xffa21a, emissive: 0xff8500, emissiveIntensity: 0, roughness: 0.25, metalness: 0.05 });
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.00425, 10, 8), material);
        lamp.position.set(side * 0.039, 0.031, z);
        player.add(lamp);
        indicatorMaterials[side < 0 ? 'left' : 'right'].push(material);
      }
    }
    player.userData.indicators = indicatorMaterials;
    console.info('Fiat Stilo model loaded; removed oversized meshes:', oversized.length, 'vehicle size:', size);
  } catch (error) {
    console.warn('Fiat Stilo model could not be loaded; using the red fallback car.', error);
  }
}
loadPlayerModel();

// Traffic cars create an actual overtaking challenge on the road.
const trafficCars = [];
const trafficLanes = [-5, 0, 5];
let overtakes = 0;
let collectedPoints = 0;
let collisionPenalties = 0;
let collisionCooldown = 0;
const bestDistanceKey = "sro_best_distance_km";
let bestDistanceKm = 0;
try { bestDistanceKm = Number(localStorage.getItem(bestDistanceKey)) || 0; } catch {}
let savedBestDistanceKm = bestDistanceKm;
if (bestDistanceEl) bestDistanceEl.textContent = "REKORD " + bestDistanceKm.toFixed(2) + " KM";
let lastRecordSave = 0;
for (let i = 0; i < 10; i++) {
  const lane = trafficLanes[i % trafficLanes.length];
  const isTruck = i === 3 || i === 8;
  const car = isTruck
    ? makeTruck([0xd9d9d9, 0xe2d4b8][i === 3 ? 0 : 1])
    : makeCar([0x36a2ff, 0xf2b544, 0x9bd06a, 0xb7a2ff, 0xe7e7e7, 0xff884d][i], i);
  car.scale.setScalar(0.84);
  car.position.set(roadCenter(48 + i * 25) + lane, 0, -48 - i * 25);
  scene.add(car);
  car.visible = false;
  trafficCars.push({
    mesh: car,
    lane,
    fixedLane: lane,
    speed: 76 + Math.random() * 62,
    z: -48 - i * 25,
    targetLane: lane,
    laneTimer: 3 + Math.random() * 7,
    collisionLength: (car.userData.collisionLength || 3.65) * 0.84
  });
}

function applyDifficulty(trafficCount, resetRun = false) {
  activeTrafficCount = trafficCount;
  trafficCars.forEach((traffic, index) => {
    if (activeTrafficCount === 5 && index < 5) {
      traffic.lane = traffic.fixedLane;
      traffic.targetLane = traffic.fixedLane;
    }
    traffic.mesh.visible = index < activeTrafficCount;
    traffic.z = -48 - index * (activeTrafficCount === 10 ? 25 : 42);
    traffic.mesh.position.z = traffic.z;
  });
  if (resetRun) resetRace();
  gameStarted = true;
  gamePaused = false;
  difficultyScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  if (hintEl) hintEl.textContent = activeTrafficCount === 0 ? "VOLNÁ JÍZDA · BEZ PROVOZU" : "VYHÝBEJ SE PROVOZU A PŘEDJÍŽDĚJ";
}
function showDifficulty() {
  gamePaused = true;
  speedKmh = 0;
  pauseScreen.classList.add("hidden");
  difficultyScreen.classList.remove("hidden");
  difficultyStep.hidden = false;
  nicknameStep.hidden = true;
  gameStarted = false;
}
function scoreNow() { return Math.max(0, collectedPoints - collisionPenalties); }
async function saveScore() {
  if (!nickname || !gameStarted || scoreNow() <= 0) return;
  try {
    await fetch("/api/scores", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nickname, score: scoreNow(), distance: Number((travel / 1000).toFixed(2)), overtakes }) });
  } catch {}
}
async function loadLeaderboard() {
  leaderboardList.innerHTML = "<li>Načítám výsledky…</li>";
  try {
    const response = await fetch("/api/scores");
    const data = await response.json();
    leaderboardList.innerHTML = "";
    if (!data.scores?.length) { leaderboardList.innerHTML = "<li>Zatím tu nejsou žádné výsledky.</li>"; return; }
    data.scores.slice(0, 10).forEach((entry, index) => {
      const li = document.createElement("li");
      const name = document.createElement("span"); name.textContent = (index + 1) + ". " + entry.name;
      const score = document.createElement("strong"); score.textContent = Number(entry.score).toLocaleString("cs-CZ");
      li.append(name, score); leaderboardList.append(li);
    });
  } catch { leaderboardList.innerHTML = "<li>Žebříček se nepodařilo načíst.</li>"; }
}
function openPause() {
  if (!gameStarted || gamePaused) return;
  gamePaused = true; speedKmh = 0;
  document.getElementById("pause-player").textContent = nickname;
  currentScoreEl.textContent = scoreNow().toLocaleString("cs-CZ");
  pauseScreen.classList.remove("hidden");
  saveScore().then(loadLeaderboard);
}
function closePause() { gamePaused = false; pauseScreen.classList.add("hidden"); }
function resetRace() {
  speedKmh = 0; laneX = 0; lateralVelocity = 0; travel = 0; overtakes = 0; collectedPoints = 0; collisionPenalties = 0; collisionCooldown = 0;
  if (driveScoreEl) driveScoreEl.textContent = "BODY 0";
  if (overtakesEl) overtakesEl.textContent = "PŘEDJETÍ 0";
  if (distanceEl) distanceEl.textContent = "JÍZDA 0.00 KM";
  trafficCars.forEach((traffic, i) => {
    traffic.z = -48 - i * (activeTrafficCount === 10 ? 25 : 42);
    traffic.lane = activeTrafficCount === 5 && i < 5 ? traffic.fixedLane : trafficLanes[i % trafficLanes.length];
    traffic.targetLane = traffic.lane;
    traffic.laneTimer = 4 + Math.random() * 5;
    traffic.mesh.visible = i < activeTrafficCount;
  });
}
nicknameSave.addEventListener("click", () => {
  nicknameInput.setCustomValidity("");
  const value = nicknameInput.value.trim().replace(/[^\p{L}\p{N}_ -]/gu, "").slice(0, 16);
  if (value.length < 2) { nicknameInput.focus(); nicknameInput.setCustomValidity("Zadej alespoň 2 znaky."); nicknameInput.reportValidity(); return; }
  nickname = value;
  try { localStorage.setItem(nicknameKey, nickname); } catch {}
  nicknameStep.hidden = true; difficultyStep.hidden = false;
});
nicknameInput.addEventListener("keydown", e => { if (e.key === "Enter") nicknameSave.click(); });
if (nickname) { nicknameInput.value = nickname; nicknameStep.hidden = true; difficultyStep.hidden = false; }
difficultyScreen.querySelectorAll("[data-traffic]").forEach(button => button.addEventListener("click", () => applyDifficulty(Number(button.dataset.traffic))));
pauseButton.addEventListener("click", openPause);
resumeButton.addEventListener("click", closePause);
changeDifficultyButton.addEventListener("click", showDifficulty);
document.getElementById("refresh-leaderboard").addEventListener("click", loadLeaderboard);

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
    // Street trees add a green buffer and break up repeated building facades.
    if (i % 2 === 0) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 2.15, 7), mat(0x66503a));
      trunk.position.y = 1.05;
      tree.add(trunk);
      const crownMat = mat([0x426448, 0x55764d, 0x647d50, 0x3d5c48][i % 4]);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25 + (i % 3) * 0.12, 1), crownMat);
      crown.position.y = 2.65;
      crown.scale.set(1, 1.18, 0.95);
      tree.add(crown);
      const crownTop = new THREE.Mesh(new THREE.IcosahedronGeometry(0.82, 1), crownMat);
      crownTop.position.set(0.32, 3.35, 0.08);
      tree.add(crownTop);
      tree.position.set(roadCenter(-z) + side * 36, 0, z + (side > 0 ? 2.2 : -2.2));
      tree.userData.sideOffset = side * 36;
      tree.traverse(part => { if (part.isMesh) part.castShadow = true; });
      scene.add(tree);
      roadside.push(tree);
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
      const walkDirection = Math.random() > 0.5 ? 1 : -1;
      person.rotation.y = walkDirection > 0 ? Math.PI : 0;
      person.traverse(part => { if (part.isMesh) { part.castShadow = true; part.receiveShadow = true; } });
      pathGroup.add(person);
      pedestrians.push({ person, leftLeg, rightLeg, leftArm, rightArm, phase: Math.random() * Math.PI * 2, pace: 0.75 + Math.random() * 0.45, direction: walkDirection, minZ: -4.2, maxZ: 4.2 });
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
  const key = e.key.toLowerCase();
  if (key === "escape" || key === "p") { e.preventDefault(); if (gamePaused) closePause(); else openPause(); return; }
  keys.add(key);
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) e.preventDefault();
  if (key === "r" && gameStarted && !gamePaused) { saveScore(); resetRace(); }
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));

let laneX = 0;
let lateralVelocity = 0;
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
  const car = makeCar(0x36c7ff, remoteCars.size + 1);
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
  const gas = !gamePaused && (keys.has("arrowup") || keys.has("w") || touch.gas);
  const brake = !gamePaused && (keys.has("arrowdown") || keys.has("s") || touch.brake);

  if (!gameStarted || gamePaused) {
    renderer.render(scene, camera);
    return;
  }

  // Progressive acceleration, engine drag and stronger braking.
  const acceleration = 23 * (1 - speedKmh / 255);
  speedKmh += (gas ? acceleration : -(1.15 + speedKmh * 0.014)) * dt;
  if (brake) speedKmh -= (34 + speedKmh * 0.035) * dt;
  speedKmh = THREE.MathUtils.clamp(speedKmh, 0, 220);

  const steerInput = (right ? 1 : 0) - (left ? 1 : 0);
  steering = THREE.MathUtils.damp(steering, steerInput, 8.5, dt);
  const speedFactor = 0.3 + Math.min(speedKmh / 150, 1) * 0.7;
  const desiredLateralVelocity = steering * (0.9 + speedKmh / 220 * 3.5);
  lateralVelocity = THREE.MathUtils.damp(lateralVelocity, desiredLateralVelocity, 7.5, dt);
  laneX += lateralVelocity * dt;
  if (laneX < -7.1 || laneX > 7.1) {
    laneX = THREE.MathUtils.clamp(laneX, -7.1, 7.1);
    lateralVelocity *= -0.18;
  }

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

  pedestrians.forEach(walker => {
    // Walk along the sidewalk, turn around at the ends, and keep the leg cycle in step.
    walker.person.position.z += walker.direction * walker.pace * dt;
    if (walker.person.position.z > walker.maxZ) {
      walker.person.position.z = walker.maxZ;
      walker.direction = -1;
      walker.person.rotation.y = 0;
    } else if (walker.person.position.z < walker.minZ) {
      walker.person.position.z = walker.minZ;
      walker.direction = 1;
      walker.person.rotation.y = Math.PI;
    }
    const stride = Math.sin(now * 0.001 * walker.pace * 2.2 + walker.phase) * 0.48;
    walker.leftLeg.rotation.x = stride;
    walker.rightLeg.rotation.x = -stride;
    walker.leftArm.rotation.x = -stride * 0.65;
    walker.rightArm.rotation.x = stride * 0.65;
  });

  // Traffic moves at its own speed. Faster driving closes the gap and allows overtaking.
  collisionCooldown = Math.max(0, collisionCooldown - dt);
  trafficCars.slice(0, activeTrafficCount).forEach(traffic => {
    traffic.z += ((speedKmh - traffic.speed) / 3.6) * dt;
    if (traffic.z > 12) {
      overtakes += 1;
      collectedPoints += traffic.collisionLength > 8 ? 100 : 50;
      if (overtakesEl) overtakesEl.textContent = "PŘEDJETÍ " + overtakes;
      traffic.z = -220 - Math.random() * 80;
      if (activeTrafficCount === 5) {
        traffic.lane = traffic.fixedLane;
        traffic.targetLane = traffic.fixedLane;
      } else {
        traffic.lane = traffic.targetLane;
        traffic.targetLane = trafficLanes[Math.floor(Math.random() * trafficLanes.length)];
      }
      traffic.laneTimer = 4 + Math.random() * 7;
      traffic.speed = 76 + Math.random() * 62;
    } else if (traffic.z < -300) {
      traffic.z = -75 - Math.random() * 150;
      if (activeTrafficCount === 5) {
        traffic.lane = traffic.fixedLane;
        traffic.targetLane = traffic.fixedLane;
      } else {
        traffic.lane = trafficLanes[Math.floor(Math.random() * trafficLanes.length)];
        traffic.targetLane = traffic.lane;
      }
      traffic.laneTimer = 4 + Math.random() * 7;
    }
    if (activeTrafficCount !== 5) {
      traffic.laneTimer -= dt;
      if (traffic.laneTimer <= 0) {
        const possibleLanes = trafficLanes.filter(lane => lane !== traffic.lane);
        traffic.targetLane = possibleLanes[Math.floor(Math.random() * possibleLanes.length)];
        traffic.laneTimer = 5 + Math.random() * 8;
      }
      traffic.lane = THREE.MathUtils.damp(traffic.lane, traffic.targetLane, 0.8, dt);
    } else {
      traffic.lane = traffic.fixedLane;
      traffic.targetLane = traffic.fixedLane;
    }
    const laneChangeDirection = traffic.targetLane - traffic.lane;
    updateIndicators(traffic.mesh, Math.abs(laneChangeDirection) > 0.22 ? Math.sign(laneChangeDirection) : 0, now);
    traffic.mesh.position.z = traffic.z;
    traffic.mesh.position.x = roadCenter(travel - traffic.z) + traffic.lane;
    traffic.mesh.rotation.y = -roadHeading(travel - traffic.z);

    if (collisionCooldown <= 0 && Math.abs(traffic.z - 4) < traffic.collisionLength / 2 + 1.8 && Math.abs(laneX - traffic.lane) < 2.35) {
      speedKmh = Math.max(20, speedKmh * 0.42);
      laneX = THREE.MathUtils.clamp(laneX + (laneX <= traffic.lane ? -1.8 : 1.8), -7.1, 7.1);
      collisionCooldown = 1.25;
      collisionPenalties += 100;
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

  // NPC cars must keep a safe following distance and never overlap.
  // In this coordinate system, the car with the larger Z value is behind.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < activeTrafficCount; i++) {
      for (let j = i + 1; j < activeTrafficCount; j++) {
        const a = trafficCars[i];
        const b = trafficCars[j];
        if (Math.abs(a.lane - b.lane) >= 1.9) continue;
        const front = a.z < b.z ? a : b;
        const rear = a.z < b.z ? b : a;
        const safeGap = (front.collisionLength + rear.collisionLength) / 2 + 1.5;
        if (rear.z - front.z < safeGap) {
          rear.z = front.z + safeGap;
          rear.mesh.position.z = rear.z;
          rear.mesh.position.x = roadCenter(travel - rear.z) + rear.lane;
        }
      }
    }
  }

  const playerCenter = roadCenter(travel - 4);
  player.position.x = playerCenter + laneX;
  player.rotation.z = -steering * 0.105 * speedFactor - lateralVelocity * 0.012;
  player.rotation.y = -roadHeading(travel - 4) - steering * 0.075;
  updateIndicators(player, Math.abs(steering) > 0.18 ? Math.sign(steering) : 0, now);
  player.position.y = Math.sin(now * 0.012) * (speedKmh / 220) * 0.012;
  // Dynamic chase camera and wider field of view sell acceleration and speed.
  camera.position.x = THREE.MathUtils.damp(camera.position.x, player.position.x - steering * 0.35, 4.2, dt);
  camera.position.y = 5.8 + Math.min(speedKmh / 220, 1) * 0.35 + Math.sin(now * 0.018) * (speedKmh / 220) * 0.025;
  camera.position.z = THREE.MathUtils.damp(camera.position.z, 12 + speedKmh / 220 * 1.2, 2.5, dt);
  camera.fov = THREE.MathUtils.damp(camera.fov, 66 + speedKmh / 220 * 12, 2.8, dt);
  camera.updateProjectionMatrix();
  camera.lookAt(roadCenter(travel + 18) + laneX * 0.72, 0.72, -15);

  remoteCars.forEach(car => {
    const targetZ = 4 + travel - car.userData.targetProgress;
    const tx = roadCenter(travel - targetZ) + car.userData.targetX;
    car.position.x = THREE.MathUtils.damp(car.position.x, tx, 8, dt);
    car.position.z = THREE.MathUtils.damp(car.position.z, targetZ, 8, dt);
  });

  speedEl.textContent = String(Math.round(speedKmh)).padStart(3, "0");
  if (driveScoreEl) driveScoreEl.textContent = "BODY " + scoreNow().toLocaleString("cs-CZ");
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
    socket.send(JSON.stringify({ type: "move", name: nickname, x: laneX, z: -16, progress: travel, rotation: player.rotation.y, speed: speedKmh / 220 }));
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
  if (document.hidden && gameStarted && !gamePaused) openPause();
});
