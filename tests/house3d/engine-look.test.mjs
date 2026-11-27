// Engine tests on the synthetic fixture: a model's look (geometry.look) and the neutral default
// without one, and the look baseline. The geometry baseline pins where the meshes stand; the look
// baseline pins what they are drawn in, in the real style with every layer on: per mesh in
// traversal order, each material's colour, emissive, roughness, metalness, opacity, transparency,
// side and a hash of every texture it carries.
// UPDATE_BASELINE=1 node --test tests/house3d/engine-look.test.mjs rewrites it instead of
// comparing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { THREE, createKit, buildAll, options, model, hexOf, partsOf, checkBaseline, rootsOf } from './engine-harness.mjs';

const BASELINE = new URL('./look-baseline.json', import.meta.url);

// a texture as its kind, repeat, offset and a hash of its pixels (a canvas has none in Node)
function textureOf(t) {
  const data = t.image && t.image.data;
  const h = data ? createHash('sha1').update(Buffer.from(data.buffer, data.byteOffset, data.byteLength)).digest('hex').slice(0, 16) : '-';
  return `${t.type} ${t.repeat.x},${t.repeat.y} ${t.offset.x},${t.offset.y} ${h}`;
}

// one material as a line: what it is drawn in, and its textures by slot
function materialOf(mt) {
  const r = v => (typeof v === 'number' ? Number(v.toFixed(4)) : '-');
  const hex = c => (c ? `#${c.getHexString()}` : '-');
  const maps = Object.entries(mt).filter(([, v]) => v && v.isTexture).map(([k, v]) => `${k}=${textureOf(v)}`).sort();
  return [mt.type, hex(mt.color), hex(mt.emissive), r(mt.roughness), r(mt.metalness), r(mt.opacity), `transparent=${mt.transparent}`, `side=${mt.side}`, ...maps].join(' ');
}

// each mesh of a layer, in traversal order (group, then lift), as "type part: material | ..."
function looksOf(L) {
  const out = [];
  rootsOf(L).forEach(root => root.traverse(o => {
    if (!o.material) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    out.push(`${o.type} ${o.userData.part || ''}: ${ms.map(materialOf).join(' | ')}`);
  }));
  return out;
}

function looks() {
  const { built } = buildAll({ ...options, style: 'real', layers: { winter: true } });
  return Object.fromEntries(built.map(({ L }) => [L.id, looksOf(L)]));
}

test('every layer is drawn in the materials the baseline has, in the real style', () => {
  checkBaseline(BASELINE, looks());
});

// the fixture without its look: the neutral default
const bare = (() => { const m = { ...model }; delete m.look; return m; })();
const real = (m, look) => buildAll({ ...options, style: 'real' }, look === undefined ? m : { ...m, look });

test('look: the surface names are the validator\'s SURFACES', () => {
  const py = fileURLToPath(new URL('../../scripts/house3d_model.py', import.meta.url));
  const names = JSON.parse(execFileSync('python3', ['-I', '-c',
    'import importlib.util, json, sys; s = importlib.util.spec_from_file_location("m", sys.argv[1]); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.SURFACES))', py], { encoding: 'utf-8' }));
  assert.deepEqual(names, Object.keys(createKit(THREE, 'real').REAL));
});

test('look: the base strip\'s height range is the validator\'s BASE_HEIGHT', () => {
  const py = fileURLToPath(new URL('../../scripts/house3d_model.py', import.meta.url));
  const [lo, hi] = JSON.parse(execFileSync('python3', ['-I', '-c',
    'import importlib.util, json, sys; s = importlib.util.spec_from_file_location("m", sys.argv[1]); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.BASE_HEIGHT))', py], { encoding: 'utf-8' }));
  const at = height => createKit(THREE, 'real', { trims: { base: { height } } });
  for (const h of [lo, hi]) assert.deepEqual([at(h).look.trims.base, at(h).base.height], [true, h], `${h}`);
  for (const h of [lo - 0.001, hi + 0.001]) assert.equal(at(h).look.trims.base, false, `${h}`);
  assert.deepEqual(createKit(THREE, 'real', { trims: { base: true } }).base, { height: 0.12, surface: 'frame' });
  assert.equal(createKit(THREE, 'real', { surfaces: { base: '#4a4c4e' }, trims: { base: true } }).base.surface, 'base');
});

test('look: without one, no trims, corner boards or base strip, and plain cladding', () => {
  const { byId } = real(bare);
  for (const part of ['trim', 'reveal', 'sill']) assert.equal(partsOf(byId.building, part).length, 0, part);
  const boards = [];
  [byId.building.group, byId.building.lift].forEach(r => r.traverse(o => { if (o.userData.part === 'corner' && o.geometry.type === 'BoxGeometry') boards.push(o); }));
  assert.equal(boards.length, 0, 'corner boards');
  const strips = [];
  byId.building.group.traverse(o => { if (o.isMesh && o.geometry.type === 'BoxGeometry' && Math.abs(o.position.y - 0.06) < 1e-6 && Math.abs(o.geometry.parameters.height - 0.12) < 1e-6) strips.push(o); });
  assert.equal(strips.length, 0, 'base strips');
  // the walls' corners are still closed
  assert.ok(partsOf(byId.building, 'corner').length > 0, 'fillers');
  const walls = [];
  byId.building.group.traverse(o => { if (o.isMesh && Array.isArray(o.material)) walls.push(o); });
  assert.ok(walls.length >= 6);
  walls.forEach(w => w.material.forEach(mt => assert.equal(mt.map, null)));
});

test('look: without one, no building material in the fixture\'s cladding, frame or roof colour', () => {
  const ours = ['cladding', 'frame', 'roof'].map(n => new THREE.Color(model.look.surfaces[n].color || model.look.surfaces[n]).getHexString());
  const { byId } = real(bare);
  [byId.building.group, byId.building.lift].forEach(r => r.traverse(o => {
    if (!o.material) return;
    [o.material].flat().forEach(mt => assert.ok(!mt.color || !ours.includes(mt.color.getHexString()), `${o.type} ${o.userData.part || ''} #${mt.color && mt.color.getHexString()}`));
  }));
});

test('look: the fixture\'s look draws its own colours, trims and boards', () => {
  const { ctx, byId } = real(model);
  assert.equal(hexOf(ctx.kit, 'cladding'), 'bebeb8');
  assert.deepEqual(ctx.kit.look, { cladding: { pattern: 'boards', angle_deg: 45 }, roof: { pattern: 'plain' }, trims: { openings: true, corners: true, base: true, fascia: false } });
  assert.ok(partsOf(byId.building, 'trim').length > 0);
});

test('look: a surface takes its own roughness and metalness, the rest keep theirs', () => {
  const kit = createKit(THREE, 'real', { surfaces: { deck: { color: '#123456', roughness: 0.3, metalness: 0.2 }, roof: '#654321' } });
  const deck = kit.surface('deck'), roof = kit.surface('roof'), glass = kit.surface('glass');
  assert.deepEqual([deck.color.getHexString(), deck.roughness, deck.metalness], ['123456', 0.3, 0.2]);
  assert.deepEqual([roof.color.getHexString(), roof.roughness, roof.metalness], ['654321', 0.85, 0]);
  assert.equal(glass.roughness, 0.15);
  // a caller's own options still win
  assert.equal(kit.surface('deck', { roughness: 0.5 }).roughness, 0.5);
});

test('look: an unknown or malformed surface, angle, roof or trim in the look is ignored, not drawn', () => {
  const kit = createKit(THREE, 'real', { surfaces: { brick: '#aa0000', constructor: '#aa0000', roof: null, deck: { roughness: 0.3 } }, cladding: { pattern: 'boards', angle_deg: 30 }, roof: { pattern: 'shingle' }, trims: { gutters: true, base: 'yes' } });
  assert.ok(!Object.hasOwn(kit.REAL, 'brick') && !Object.hasOwn(kit.REAL, 'constructor'));
  assert.deepEqual([kit.REAL.roof, kit.REAL.deck], [createKit(THREE, 'real').REAL.roof, createKit(THREE, 'real').REAL.deck]);
  assert.equal(kit.look.cladding.angle_deg, 45);
  assert.deepEqual(kit.look.roof, { pattern: 'plain' });
  assert.equal(kit.roofMap(), null);
  assert.deepEqual(createKit(THREE, 'real', { roof: 'seam' }).look.roof, { pattern: 'plain' });
  assert.deepEqual(kit.look.trims, { openings: false, corners: false, base: false, fascia: false });
});

test('look: boards at 45 are the default angle, at 0 and 90 grooves along rows or columns that tile', () => {
  const data = look => createKit(THREE, 'real', { cladding: look }).boards()[0].image.data;
  assert.deepEqual(data({ pattern: 'boards' }), data({ pattern: 'boards', angle_deg: 45 }));
  const S = 512, px = (d, i, j) => d[(j * S + i) * 4];
  for (const [angle, line] of [[0, (d, k) => [px(d, 0, k), px(d, S - 1, k)]], [90, (d, k) => [px(d, k, 0), px(d, k, S - 1)]]]) {
    const d = data({ pattern: 'boards', angle_deg: angle });
    // each row (0) or column (90) is one shade along its length
    for (let k = 0; k < S; k++) { const [a, b] = line(d, k); assert.equal(a, b, `${angle}: ${k}`); }
    // the grooves across: as many as boards, the first at the tile's edge, so the tile's edges meet
    const across = Array.from({ length: S }, (_, k) => (angle === 0 ? px(d, 0, k) : px(d, k, 0)));
    const starts = across.filter((v, k) => v < 255 && across[(k + S - 1) % S] === 255).length;
    assert.equal(starts, 17, `${angle}: boards across the tile`);
    assert.ok(across[0] < 255, `${angle}: a groove at the edge`);
    assert.equal(across[S - 1], 255, `${angle}: a board up to the other edge`);
  }
});

test('look: a board width sets the boards across the tile at 0 and 90, a groove share their groove', () => {
  const S = 512, column = d => Array.from({ length: S }, (_, k) => d[k * 4]);
  const grooves = look => {
    const across = column(createKit(THREE, 'real', { cladding: { pattern: 'boards', angle_deg: 90, ...look } }).boards()[0].image.data);
    return { starts: across.filter((v, k) => v < 255 && across[(k + S - 1) % S] === 255).length, dark: across.filter(v => v < 255).length };
  };
  assert.equal(grooves({ board: 0.2 }).starts, 10);
  assert.equal(grooves({ board: 0.18 }).starts, 11);
  assert.ok(grooves({ board: 0.2, groove: 0.2 }).dark > 3 * grooves({ board: 0.2 }).dark, 'a wider groove');
  // out of range: the defaults
  assert.equal(grooves({ board: 0.01, groove: 0.9 }).starts, 17);
  assert.deepEqual(grooves({ board: 0.01, groove: 0.9 }), grooves({}));
});

test('look: a look naming trim draws an opening\'s casing in it and its frame in frame; without, one colour', () => {
  const surfaces = { ...model.look.surfaces, trim: '#b0b2b4' };
  const colours = m => {
    const { byId } = real(m);
    const trims = new Set(partsOf(byId.building, 'trim').map(o => o.material.color.getHexString()));
    const corners = new Set(partsOf(byId.building, 'corner').filter(o => o.geometry.type === 'BoxGeometry').map(o => o.material.color.getHexString()));
    return { trims: [...trims], corners: [...corners] };
  };
  const frame = new THREE.Color(model.look.surfaces.frame).getHexString();
  assert.deepEqual(colours(model), { trims: [frame], corners: [frame] });
  assert.deepEqual(colours({ ...model, look: { ...model.look, surfaces } }), { trims: ['b0b2b4'], corners: ['b0b2b4'] });
  // the frame proper keeps the frame's colour
  const { byId } = real({ ...model, look: { ...model.look, surfaces } });
  const bars = [];
  byId.building.group.traverse(o => { if (o.isMesh && !o.userData.part && o.geometry.type === 'BoxGeometry' && o.material.color.getHexString() === frame) bars.push(o); });
  assert.ok(bars.length > 0, 'frames in frame');
});

test('look: the pergola\'s frame and slats in trim when the look names it, in frame without', () => {
  const colours = m => {
    const set = new Set();
    real(m).byId.pergola.group.traverse(o => { if (o.isMesh) set.add(o.material.color.getHexString()); });
    return [...set];
  };
  assert.deepEqual(colours(model), [new THREE.Color(model.look.surfaces.frame).getHexString()]);
  assert.deepEqual(colours({ ...model, look: { ...model.look, surfaces: { ...model.look.surfaces, trim: '#b0b2b4' } } }), ['b0b2b4']);
});

test('look: trims.fascia splits each roof\'s edge band into a fascia under a lip of roof', () => {
  const surfaces = { ...model.look.surfaces, trim: '#b0b2b4' };
  const bands = look => {
    const { byId } = real({ ...model, look });
    return byId.building.lift.children.filter(o => o.userData.roof).map(o => [o.geometry.groups.length, ...[o.material].flat().map(m => m.color.getHexString())]);
  };
  const frame = new THREE.Color(model.look.surfaces.frame).getHexString(), roofHex = new THREE.Color(model.look.surfaces.roof.color).getHexString();
  bands({ ...model.look, surfaces }).forEach(b => assert.deepEqual(b.slice(1), [roofHex, frame]));
  const on = bands({ ...model.look, surfaces, trims: { ...model.look.trims, fascia: true } });
  const fasciaOf = [roofHex, 'b0b2b4', roofHex], lipOf = [roofHex, roofHex, roofHex];
  // a wing roof is one mesh of three groups, a shed roof two slabs: the fascia's and the lip's
  const wings = on.filter(b => b[0] === 3), sheds = on.filter(b => b[0] === 2);
  assert.equal(wings.length + sheds.length, on.length);
  wings.forEach(b => assert.deepEqual(b.slice(1), fasciaOf));
  assert.equal(sheds.filter(b => b[2] === 'b0b2b4').length, sheds.filter(b => b[2] === roofHex).length, 'a lip slab per fascia slab');
  sheds.forEach(b => assert.deepEqual(b.slice(1), b[2] === 'b0b2b4' ? fasciaOf : lipOf));
});

test('look: roofMap() is null for plain, periodic seams along u for seam, and staggered courses for tile', () => {
  assert.equal(createKit(THREE, 'real').roofMap(), null);
  assert.equal(createKit(THREE, 'real', { roof: { pattern: 'plain' } }).roofMap(), null);

  const seamKit = createKit(THREE, 'real', { roof: { pattern: 'seam' } });
  const seam = seamKit.roofMap();
  assert.equal(seam, seamKit.roofMap(), 'cached per mount');
  assert.equal(seam.wrapS, THREE.RepeatWrapping);
  assert.equal(seam.wrapT, THREE.RepeatWrapping);
  assert.deepEqual([seam.repeat.x, seam.repeat.y], [0.5, 0.5]);
  const S = seam.image.width, sd = seam.image.data, spx = (i, j) => sd[(j * S + i) * 4];
  // constant along v (every row matches row 0) and 4 standing seams along u (dark shadow + bright highlight)
  for (let i = 0; i < S; i++) assert.equal(spx(i, S - 1), spx(i, 0), `seam constant along v at i=${i}`);
  const row0 = Array.from({ length: S }, (_, i) => spx(i, 0));
  const shadows = row0.filter((v, i) => v < 150 && row0[(i + S - 1) % S] >= 150).length;
  const highlights = row0.filter((v, i) => v === 255 && row0[(i + S - 1) % S] < 255).length;
  assert.equal(shadows, 4, '4 standing seam shadows per 2 m tile');
  assert.equal(highlights, 4, '4 standing seam highlights per 2 m tile');

  const tileKit = createKit(THREE, 'real', { roof: { pattern: 'tile' } });
  const tile = tileKit.roofMap();
  assert.equal(tile, tileKit.roofMap(), 'cached per mount');
  assert.equal(tile.wrapS, THREE.RepeatWrapping);
  assert.equal(tile.wrapT, THREE.RepeatWrapping);
  assert.ok(Math.abs(tile.repeat.x - 1 / 1.8) < 1e-9 && Math.abs(tile.repeat.y - 1 / 1.8) < 1e-9);
  assert.notDeepEqual(tile.image.data, seam.image.data);
  const td = tile.image.data, tpx = (i, j) => td[(j * S + i) * 4];
  // 6 horizontal course lip shadows along v (dark at low v of each course, brighter near top of each course)
  const colAvg = j => { let sum = 0; for (let i = 0; i < S; i++) sum += tpx(i, j); return sum / S; };
  const avgs = Array.from({ length: S }, (_, j) => colAvg(j));
  assert.ok(avgs[0] < avgs[S - 1] - 40, 'course lip shadow sits at low v (down-slope) and wraps to high v');
  const courses = avgs.filter((v, j) => v < 170 && avgs[(j + S - 1) % S] >= 170).length;
  assert.equal(courses, 6, '6 staggered courses per 1.8 m tile (even count for clean wrapping)');
  // odd vs even course stagger: row 0 (j=40) and row 1 (j=125) are shifted horizontally, row 0 and row 2 (j=210) align
  const r0 = Array.from({ length: S }, (_, i) => tpx(i, 40));
  const r1 = Array.from({ length: S }, (_, i) => tpx(i, 125));
  const sideSeams = arr => arr.filter((v, i) => v < 175 && arr[(i + S - 1) % S] >= 175).length;
  assert.equal(sideSeams(r0), 6, '6 vertical tile ribs along u');
  assert.equal(sideSeams(r1), 6, '6 vertical tile ribs on staggered row');
  // the first side seam of row 0 is at i=0, whereas row 1 is shifted by half a tile (~43 px)
  assert.ok(r0[0] < 175 && r1[0] > 180, 'adjacent courses stagger by half a tile');
});
