import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const SUPPORTED_FORMATS = new Set(['free', 'modded_entity', 'java_block']);
const DEFAULT_FORMAT = 'modded_entity';
const JAVA_BLOCK_AXIS_LIMITS = [-16, 32];
const JAVA_BLOCK_AXIS_CENTER = (JAVA_BLOCK_AXIS_LIMITS[0] + JAVA_BLOCK_AXIS_LIMITS[1]) / 2;

function usage() {
  console.log(
    'Usage: node scripts/html-voxels-to-bbmodel.mjs <input.html> [output.bbmodel] [--max-edge <number>] [--format <modded_entity|java_block|free>]',
  );
}

function extractModuleScript(html) {
  const match = html.match(/<script\s+type=["']module["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) {
    throw new Error('No <script type="module"> block found.');
  }
  return match[1];
}

function instrumentScriptForA(source) {
  const withoutImports = source.replace(/^\s*import\s.+?;\s*$/gm, '');
  const instrumented = withoutImports.replace(
    /\b(?:const|let|var)\s+voxels\s*=\s*\[\s*\]\s*;/,
    'const voxels = globalThis.__capturedVoxels;',
  );

  if (instrumented === withoutImports) {
    throw new Error('Could not find voxels array declaration to instrument.');
  }

  return instrumented;
}

function instrumentScriptForB(source) {
  let instrumented = source.replace(/^\s*import\s.+?;\s*$/gm, '');

  instrumented = instrumented.replace(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+THREE\.Group\s*\(\s*\)\s*;/g,
    'const $1 = globalThis.__nameGroup("$1", new THREE.Group());',
  );

  instrumented = instrumented.replace(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+THREE\.Scene\s*\(\s*\)\s*;/g,
    'const $1 = globalThis.__nameGroup("$1", new THREE.Scene());',
  );

  const createVoxelPattern = /function\s+createVoxel\s*\(([^)]*)\)\s*\{([\s\S]*?)return\s+mesh;\s*\}/m;
  if (!createVoxelPattern.test(instrumented)) {
    throw new Error('Could not find createVoxel(...) for B-route instrumentation.');
  }

  instrumented = instrumented.replace(
    createVoxelPattern,
    `function createVoxel($1) {$2globalThis.__captureCube({
      scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
      geometry: mesh.geometry,
      color: colorHex,
      parent: parent,
      mesh: mesh
    });
    return mesh;
  }`,
  );

  instrumented = instrumented.replace(/\banimate\(\);\s*$/m, '');

  return instrumented;
}

function createSeededMath(seed = 123456789) {
  let state = seed >>> 0;
  const math = Object.create(Math);
  math.random = () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return math;
}

class StubObject3D {
  constructor() {
    this.position = {
      x: 0,
      y: 0,
      z: 0,
      set: (x, y, z) => {
        this.position.x = x;
        this.position.y = y;
        this.position.z = z;
      },
    };
    this.rotation = {
      x: 0,
      y: 0,
      z: 0,
      set: (x, y, z) => {
        this.rotation.x = x;
        this.rotation.y = y;
        this.rotation.z = z;
      },
    };
    this.scale = {
      x: 1,
      y: 1,
      z: 1,
      set: (x, y, z) => {
        this.scale.x = x;
        this.scale.y = y;
        this.scale.z = z;
      },
      setScalar: (value) => {
        this.scale.x = value;
        this.scale.y = value;
        this.scale.z = value;
      },
    };
    this.children = [];
    this.parent = null;
    this.matrix = {};
  }

  add(child) {
    child.parent = this;
    this.children.push(child);
  }

  updateMatrix() {}
}

class StubMesh extends StubObject3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
    this.castShadow = false;
    this.receiveShadow = false;
  }
}

class StubGroup extends StubObject3D {}

class StubInstancedMesh extends StubObject3D {
  constructor(geometry, material, count) {
    super();
    this.geometry = geometry;
    this.material = material;
    this.count = count;
    this.instanceMatrix = { needsUpdate: false };
  }

  setMatrixAt() {}

  setColorAt() {}
}

class StubColor {
  constructor(value = 0xffffff) {
    this.value = value;
  }

  setHex(value) {
    this.value = value;
    return this;
  }
}

class StubRenderer {
  constructor() {
    this.domElement = {};
    this.shadowMap = {};
  }

  setSize() {}

  render() {}
}

class StubClock {
  getElapsedTime() {
    return 0;
  }

  getDelta() {
    return 0;
  }
}

class StubSimplexNoise {
  noise(x, y) {
    const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1;
  }
}

class StubOrbitControls {
  constructor(camera) {
    this.camera = camera;
    this.target = {
      set() {},
    };
  }

  update() {}
}

function createThreeStub() {
  return {
    Scene: class extends StubGroup {
      constructor() {
        super();
        this.background = null;
        this.fog = null;
      }
    },
    Color: StubColor,
    Fog: class {
      constructor(...args) {
        this.args = args;
      }
    },
    FogExp2: class {
      constructor(...args) {
        this.args = args;
      }
    },
    PerspectiveCamera: class extends StubObject3D {
      constructor() {
        super();
        this.aspect = 1;
      }

      updateProjectionMatrix() {}
    },
    WebGLRenderer: StubRenderer,
    AmbientLight: class extends StubObject3D {},
    DirectionalLight: class extends StubObject3D {
      constructor(...args) {
        super();
        this.args = args;
        this.shadow = {
          mapSize: {},
          camera: {},
        };
      }
    },
    SoftShadowMap: 'SoftShadowMap',
    PCFSoftShadowMap: 'PCFSoftShadowMap',
    BoxGeometry: class {
      constructor(...args) {
        this.args = args;
      }
    },
    MeshStandardMaterial: class {
      constructor(options = {}) {
        Object.assign(this, options);
      }

      clone() {
        return new this.constructor({ ...this });
      }
    },
    MeshLambertMaterial: class {
      constructor(options = {}) {
        Object.assign(this, options);
      }

      clone() {
        return new this.constructor({ ...this });
      }
    },
    MeshBasicMaterial: class {
      constructor(options = {}) {
        Object.assign(this, options);
      }

      clone() {
        return new this.constructor({ ...this });
      }
    },
    Mesh: StubMesh,
    Group: StubGroup,
    Object3D: StubObject3D,
    InstancedMesh: StubInstancedMesh,
    Clock: StubClock,
  };
}

function createExecutionContext() {
  const THREE = createThreeStub();
  const loadingElement = { style: {} };
  const body = {
    appendChild() {},
    removeChild() {},
  };

  const context = {
    console,
    Math: createSeededMath(),
    THREE,
    OrbitControls: StubOrbitControls,
    SimplexNoise: StubSimplexNoise,
    window: {
      innerWidth: 1024,
      innerHeight: 1024,
      addEventListener() {},
    },
    document: {
      body,
      appendChild() {},
      removeChild() {},
      getElementById() {
        return loadingElement;
      },
      createElement() {
        return {
          style: {},
          click() {},
        };
      },
    },
    requestAnimationFrame() {},
    performance: {
      now: () => 0,
    },
    __capturedVoxels: [],
    __capturedCubes: [],
  };

  context.__nameGroup = (name, object) => {
    object.__bbName = name;
    return object;
  };

  context.__captureCube = (cube) => {
    context.__capturedCubes.push(cube);
  };

  context.globalThis = context;
  return vm.createContext(context);
}

function normalizeVoxels(voxels) {
  const map = new Map();

  for (const voxel of voxels) {
    if (!voxel || typeof voxel !== 'object') continue;
    const x = Number(voxel.x);
    const y = Number(voxel.y);
    const z = Number(voxel.z);
    const color = Number(voxel.color);

    if (![x, y, z, color].every(Number.isFinite)) continue;

    const nx = Math.round(x * 1000) / 1000;
    const ny = Math.round(y * 1000) / 1000;
    const nz = Math.round(z * 1000) / 1000;
    const key = `${nx},${ny},${nz}`;
    map.set(key, { x: nx, y: ny, z: nz, color });
  }

  return [...map.values()].sort((a, b) => (
    a.y - b.y || a.z - b.z || a.x - b.x || a.color - b.color
  ));
}

function coordKey(x, y, z) {
  return `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
}

function mergeVoxels(voxels) {
  if (!voxels.length) return [];

  const voxelMap = new Map(voxels.map((voxel) => [coordKey(voxel.x, voxel.y, voxel.z), voxel]));
  const visited = new Set();
  const merged = [];

  for (const voxel of voxels) {
    const startKey = coordKey(voxel.x, voxel.y, voxel.z);
    if (visited.has(startKey)) continue;

    const { x, y, z, color, group = null } = voxel;

    let width = 1;
    while (true) {
      const nextKey = coordKey(x + width, y, z);
      const nextVoxel = voxelMap.get(nextKey);
      if (!nextVoxel || nextVoxel.color !== color || nextVoxel.group !== group || visited.has(nextKey)) break;
      width += 1;
    }

    let height = 1;
    heightLoop:
    while (true) {
      for (let dx = 0; dx < width; dx += 1) {
        const nextKey = coordKey(x + dx, y + height, z);
        const nextVoxel = voxelMap.get(nextKey);
        if (!nextVoxel || nextVoxel.color !== color || nextVoxel.group !== group || visited.has(nextKey)) {
          break heightLoop;
        }
      }
      height += 1;
    }

    let depth = 1;
    depthLoop:
    while (true) {
      for (let dy = 0; dy < height; dy += 1) {
        for (let dx = 0; dx < width; dx += 1) {
          const nextKey = coordKey(x + dx, y + dy, z + depth);
          const nextVoxel = voxelMap.get(nextKey);
          if (!nextVoxel || nextVoxel.color !== color || nextVoxel.group !== group || visited.has(nextKey)) {
            break depthLoop;
          }
        }
      }
      depth += 1;
    }

    for (let dz = 0; dz < depth; dz += 1) {
      for (let dy = 0; dy < height; dy += 1) {
        for (let dx = 0; dx < width; dx += 1) {
          visited.add(coordKey(x + dx, y + dy, z + dz));
        }
      }
    }

    merged.push({
      from: [x, y, z],
      to: [x + width, y + height, z + depth],
      color,
      group,
    });
  }

  return merged;
}

function intToRgba(hex) {
  return [
    (hex >> 16) & 0xff,
    (hex >> 8) & 0xff,
    hex & 0xff,
    0xff,
  ];
}

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = createCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createPalettePng(colors) {
  const width = Math.min(colors.length, 256);
  const height = Math.ceil(colors.length / width);
  const raw = Buffer.alloc(height * (1 + width * 4));

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const [r, g, b, a] = colors[index] ? intToRgba(colors[index]) : [0, 0, 0, 0];
      const offset = rowStart + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    createChunk('IHDR', ihdr),
    createChunk('IDAT', zlib.deflateSync(raw)),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildFaceUv(index, width, height) {
  const x = index % width;
  const y = Math.floor(index / width);
  return [x, y, x + 1, y + 1];
}

function getCuboidBounds(cuboids) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (const cuboid of cuboids) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], cuboid.from[axis], cuboid.to[axis]);
      max[axis] = Math.max(max[axis], cuboid.from[axis], cuboid.to[axis]);
    }
  }

  return {
    min,
    max,
    size: [
      max[0] - min[0],
      max[1] - min[1],
      max[2] - min[2],
    ],
  };
}

function inferAxisOffset(cuboids, axis) {
  const counts = new Map();

  for (const cuboid of cuboids) {
    const value = cuboid.from[axis];
    const normalized = (((value % 1) + 1) % 1);
    const key = Math.round(normalized * 1000) / 1000;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  let bestKey = 0;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }

  return bestKey;
}

function cuboidsToUnitVoxels(cuboids) {
  const offsets = [
    inferAxisOffset(cuboids, 0),
    inferAxisOffset(cuboids, 1),
    inferAxisOffset(cuboids, 2),
  ];
  const voxels = [];

  for (const cuboid of cuboids) {
    const [fromX, fromY, fromZ] = cuboid.from;
    const [toX, toY, toZ] = cuboid.to;

    const startX = Math.round((fromX - offsets[0]) * 1000) / 1000;
    const startY = Math.round((fromY - offsets[1]) * 1000) / 1000;
    const startZ = Math.round((fromZ - offsets[2]) * 1000) / 1000;
    const width = Math.round((toX - fromX) * 1000) / 1000;
    const height = Math.round((toY - fromY) * 1000) / 1000;
    const depth = Math.round((toZ - fromZ) * 1000) / 1000;

    const countX = Math.max(1, Math.round(width));
    const countY = Math.max(1, Math.round(height));
    const countZ = Math.max(1, Math.round(depth));

    for (let ix = 0; ix < countX; ix += 1) {
      for (let iy = 0; iy < countY; iy += 1) {
        for (let iz = 0; iz < countZ; iz += 1) {
          voxels.push({
            x: Math.round((offsets[0] + startX + ix) * 1000) / 1000,
            y: Math.round((offsets[1] + startY + iy) * 1000) / 1000,
            z: Math.round((offsets[2] + startZ + iz) * 1000) / 1000,
            color: cuboid.color,
            group: cuboid.group || null,
          });
        }
      }
    }
  }

  return voxels;
}

function downsampleVoxelsToMaxEdge(voxels, maxEdge) {
  if (!voxels.length || !Number.isFinite(maxEdge) || maxEdge <= 0) {
    return {
      voxels,
      sourceBounds: null,
      targetBounds: null,
      downsampleFactor: 1,
    };
  }

  const sourceCuboids = voxels.map((voxel) => ({
    from: [voxel.x, voxel.y, voxel.z],
    to: [voxel.x + 1, voxel.y + 1, voxel.z + 1],
  }));
  const sourceBounds = getCuboidBounds(sourceCuboids);
  const longestEdge = Math.max(...sourceBounds.size);

  if (!Number.isFinite(longestEdge) || longestEdge <= maxEdge) {
    return {
      voxels,
      sourceBounds,
      targetBounds: sourceBounds,
      downsampleFactor: 1,
    };
  }

  const factor = longestEdge / maxEdge;
  const buckets = new Map();

  for (const voxel of voxels) {
    const ix = Math.floor((voxel.x - sourceBounds.min[0]) / factor);
    const iy = Math.floor((voxel.y - sourceBounds.min[1]) / factor);
    const iz = Math.floor((voxel.z - sourceBounds.min[2]) / factor);
    const bucketKey = `${ix},${iy},${iz}`;

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, {
        x: ix,
        y: iy,
        z: iz,
        colorCounts: new Map(),
        groupCounts: new Map(),
      });
    }

    const bucket = buckets.get(bucketKey);
    bucket.colorCounts.set(voxel.color, (bucket.colorCounts.get(voxel.color) || 0) + 1);
    if (voxel.group) {
      bucket.groupCounts.set(voxel.group, (bucket.groupCounts.get(voxel.group) || 0) + 1);
    }
  }

  const chooseMaxCount = (map) => {
    let bestKey = null;
    let bestCount = -1;
    for (const [key, count] of map) {
      if (count > bestCount) {
        bestKey = key;
        bestCount = count;
      }
    }
    return bestKey;
  };

  const downsampled = [...buckets.values()].map((bucket) => ({
    x: bucket.x,
    y: bucket.y,
    z: bucket.z,
    color: chooseMaxCount(bucket.colorCounts),
    group: chooseMaxCount(bucket.groupCounts),
  }));

  const targetCuboids = downsampled.map((voxel) => ({
    from: [voxel.x, voxel.y, voxel.z],
    to: [voxel.x + 1, voxel.y + 1, voxel.z + 1],
  }));

  return {
    voxels: downsampled,
    sourceBounds,
    targetBounds: getCuboidBounds(targetCuboids),
    downsampleFactor: factor,
  };
}

function normalizeCapturedCubes(cubes) {
  const getWorldPosition = (object) => {
    let current = object;
    let x = 0;
    let y = 0;
    let z = 0;

    while (current) {
      x += Number(current.position?.x ?? 0);
      y += Number(current.position?.y ?? 0);
      z += Number(current.position?.z ?? 0);
      current = current.parent ?? null;
    }

    return { x, y, z };
  };

  return cubes
    .filter((cube) => cube && typeof cube === 'object')
    .map((cube) => {
      const world = getWorldPosition(cube.mesh);
      const x = Number(world.x);
      const y = Number(world.y);
      const z = Number(world.z);
      const sx = Number(cube.scale?.x ?? 1);
      const sy = Number(cube.scale?.y ?? 1);
      const sz = Number(cube.scale?.z ?? 1);
      const gx = Number(cube.geometry?.args?.[0] ?? 1);
      const gy = Number(cube.geometry?.args?.[1] ?? 1);
      const gz = Number(cube.geometry?.args?.[2] ?? 1);
      const color = Number(cube.color);
      if (![x, y, z, sx, sy, sz, gx, gy, gz, color].every(Number.isFinite)) {
        return null;
      }

      const width = gx * sx;
      const height = gy * sy;
      const depth = gz * sz;

      return {
        from: [
          Math.round((x - width / 2) * 1000) / 1000,
          Math.round((y - height / 2) * 1000) / 1000,
          Math.round((z - depth / 2) * 1000) / 1000,
        ],
        to: [
          Math.round((x + width / 2) * 1000) / 1000,
          Math.round((y + height / 2) * 1000) / 1000,
          Math.round((z + depth / 2) * 1000) / 1000,
        ],
        color,
        group: cube.parent?.__bbName || null,
      };
    })
    .filter(Boolean);
}

function translateCuboids(cuboids, offset) {
  return cuboids.map((cuboid) => ({
    ...cuboid,
    from: cuboid.from.map((value, axis) => Math.round((value + offset[axis]) * 1000) / 1000),
    to: cuboid.to.map((value, axis) => Math.round((value + offset[axis]) * 1000) / 1000),
  }));
}

function adaptCuboidsForJavaBlock(cuboids) {
  const bounds = getCuboidBounds(cuboids);
  const center = bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2);
  const offset = center.map((value) => JAVA_BLOCK_AXIS_CENTER - value);
  const translated = translateCuboids(cuboids, offset);
  const translatedBounds = getCuboidBounds(translated);
  const warnings = [];

  translatedBounds.size.forEach((size, axis) => {
    if (size > JAVA_BLOCK_AXIS_LIMITS[1] - JAVA_BLOCK_AXIS_LIMITS[0]) {
      warnings.push(
        `Axis ${'XYZ'[axis]} size ${size.toFixed(3)} exceeds Java Block range ${JAVA_BLOCK_AXIS_LIMITS[0]}..${JAVA_BLOCK_AXIS_LIMITS[1]}.`,
      );
    }
  });

  translatedBounds.min.forEach((value, axis) => {
    if (value < JAVA_BLOCK_AXIS_LIMITS[0] || translatedBounds.max[axis] > JAVA_BLOCK_AXIS_LIMITS[1]) {
      warnings.push(
        `Axis ${'XYZ'[axis]} bounds ${value.toFixed(3)}..${translatedBounds.max[axis].toFixed(3)} exceed Java Block limits.`,
      );
    }
  });

  return {
    cuboids: translated,
    bounds: translatedBounds,
    warnings,
  };
}

function getFormatProfile(format) {
  if (format === 'java_block') {
    return {
      modelFormat: 'java_block',
      boxUv: false,
      textureNameSuffix: 'java_block',
    };
  }

  if (format === 'free') {
    return {
      modelFormat: 'free',
      boxUv: false,
      textureNameSuffix: 'free',
    };
  }

  return {
    modelFormat: 'modded_entity',
    boxUv: false,
    textureNameSuffix: 'modded_entity',
  };
}

function buildBbmodel(cuboids, name, route, format) {
  const formatProfile = getFormatProfile(format);
  const uniqueColors = [...new Set(cuboids.map((cuboid) => cuboid.color))];
  const colorIndex = new Map(uniqueColors.map((color, index) => [color, index]));
  const textureWidth = Math.min(uniqueColors.length, 256);
  const textureHeight = Math.ceil(uniqueColors.length / textureWidth);
  const palettePng = createPalettePng(uniqueColors);

  const elements = cuboids.map((cuboid, index) => {
    const uv = buildFaceUv(colorIndex.get(cuboid.color), textureWidth, textureHeight);
    const uuid = crypto.randomUUID();
    return {
      from: cuboid.from,
      to: cuboid.to,
      faces: {
        north: { uv, texture: 0 },
        east: { uv, texture: 0 },
        south: { uv, texture: 0 },
        west: { uv, texture: 0 },
        up: { uv, texture: 0 },
        down: { uv, texture: 0 },
      },
      uuid,
      __group: cuboid.group || null,
    };
  });

  const grouped = new Map();
  for (const element of elements) {
    const groupName = element.__group;
    delete element.__group;
    if (!groupName) continue;
    if (!grouped.has(groupName)) {
      grouped.set(groupName, {
        name: groupName,
        uuid: crypto.randomUUID(),
        children: [],
      });
    }
    grouped.get(groupName).children.push(element.uuid);
  }

  const groupedUuids = new Set();
  for (const group of grouped.values()) {
    for (const child of group.children) groupedUuids.add(child);
  }

  const outliner = [
    ...grouped.values(),
    ...elements.filter((element) => !groupedUuids.has(element.uuid)).map((element) => element.uuid),
  ];

  return {
    meta: {
      format_version: '3.6',
      model_format: formatProfile.modelFormat,
      box_uv: formatProfile.boxUv,
    },
    name,
    geometry_name: name,
    route,
    resolution: {
      width: textureWidth,
      height: textureHeight,
    },
    elements,
    outliner,
    textures: [
      {
        id: '0',
        name: `${name}_${formatProfile.textureNameSuffix}_palette.png`,
        source: `data:image/png;base64,${palettePng.toString('base64')}`,
      },
    ],
  };
}

function runScriptWithRoute(script, inputPath) {
  const context = createExecutionContext();
  vm.runInContext(script, context, {
    filename: path.basename(inputPath),
    timeout: 10_000,
  });
  return context;
}

async function main() {
  const args = process.argv.slice(2);
  const positional = [];
  let maxEdge = null;
  let format = DEFAULT_FORMAT;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--max-edge') {
      const next = args[i + 1];
      if (!next) {
        throw new Error('Missing value for --max-edge');
      }
      maxEdge = Number(next);
      if (!Number.isFinite(maxEdge) || maxEdge <= 0) {
        throw new Error('--max-edge must be a positive number.');
      }
      i += 1;
      continue;
    }
    if (arg === '--format') {
      const next = args[i + 1];
      if (!next) {
        throw new Error('Missing value for --format');
      }
      if (!SUPPORTED_FORMATS.has(next)) {
        throw new Error(`Unsupported format "${next}". Expected one of: ${[...SUPPORTED_FORMATS].join(', ')}`);
      }
      format = next;
      i += 1;
      continue;
    }
    positional.push(arg);
  }

  const [inputPathArg, outputPathArg] = positional;

  if (!inputPathArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const inputPath = path.resolve(inputPathArg);
  const outputPath = outputPathArg
    ? path.resolve(outputPathArg)
    : inputPath.replace(/\.html?$/i, format === DEFAULT_FORMAT ? '.bbmodel' : `-${format}.bbmodel`);

  const html = await fs.readFile(inputPath, 'utf8');
  const moduleScript = extractModuleScript(html);
  let route = 'A';
  let cuboids = [];
  let sourceCount = 0;

  try {
    const contextA = runScriptWithRoute(instrumentScriptForA(moduleScript), inputPath);
    const voxels = normalizeVoxels(contextA.__capturedVoxels);
    if (voxels.length) {
      cuboids = mergeVoxels(voxels).map((cuboid) => ({ ...cuboid, group: null }));
      sourceCount = voxels.length;
    } else {
      throw new Error('A route captured zero voxels.');
    }
  } catch {
    route = 'B';
    const contextB = runScriptWithRoute(instrumentScriptForB(moduleScript), inputPath);
    const cubes = normalizeCapturedCubes(contextB.__capturedCubes);
    if (!cubes.length) {
      throw new Error('Neither A nor B route could capture model geometry.');
    }
    cuboids = cubes;
    sourceCount = cubes.length;
  }

  let finalCuboids = cuboids;
  let downsampleInfo = null;
  if (maxEdge) {
    const unitVoxels = cuboidsToUnitVoxels(cuboids);
    downsampleInfo = downsampleVoxelsToMaxEdge(unitVoxels, maxEdge);
    finalCuboids = mergeVoxels(downsampleInfo.voxels);
  }

  let formatWarnings = [];
  if (format === 'java_block') {
    const adapted = adaptCuboidsForJavaBlock(finalCuboids);
    finalCuboids = adapted.cuboids;
    formatWarnings = adapted.warnings;
  }

  const bbmodel = buildBbmodel(finalCuboids, path.basename(outputPath, '.bbmodel'), route, format);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(bbmodel), 'utf8');

  console.log(`Format ${format}`);
  console.log(`Route ${route}`);
  console.log(`Captured ${sourceCount} source units`);
  console.log(`Merged to ${bbmodel.elements.length} cuboids`);
  if (maxEdge && downsampleInfo) {
    console.log(`Downsampled longest edge to <= ${maxEdge} (factor ${downsampleInfo.downsampleFactor.toFixed(6)})`);
    console.log(`Final bounds: ${downsampleInfo.targetBounds.size.map((n) => n.toFixed(3)).join(' x ')}`);
  }
  for (const warning of formatWarnings) {
    console.warn(`Warning: ${warning}`);
  }
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
