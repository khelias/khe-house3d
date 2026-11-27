// Engine tests on the storeys fixture (tests/house3d/fixture-storeys.md): a basement, a ground
// storey and an attic under a gable roof, each storey's contents in the group or the lift band
// under it, walls cut at their storey's cut, the picker's names, the stairs, and a split level.
// The set-up is in engine-harness.mjs; scripts/house3d-test.sh runs every engine-*.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THREE, buildAll, loadModel, modelFrame, storeysOf, storeyOfItem, pitOf, bandTargets, storeyName, model as one } from './engine-harness.mjs';

const house = loadModel('fixture-storeys.md');
const two = loadModel('fixture-twostorey.md');
const layersOf = (style, m = house, o = {}) => {
  const { ctx, built } = buildAll({ style, layers: { winter: true }, ...o }, m);
  return { ctx, L: Object.fromEntries(built.map(({ want, L }) => [want, L])) };
};
const groupsAt = (root, x, y, z) => root.children.filter(o => o.isGroup && Math.abs(o.position.x - x) < 1e-6 && Math.abs(o.position.y - y) < 1e-6 && Math.abs(o.position.z - z) < 1e-6);
const topOf = o => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o).max.y; };

test('storeysOf: the ground at the level of 0, each storey its floor and cut, the picker\'s names', () => {
  const st = storeysOf(house);
  assert.equal(st.ground, 1);
  assert.deepEqual(st.list.map(s => [s.floor, Number(s.cut.toFixed(6))]), [[-2.6, -0.3], [0, 2.6], [2.9, 5.3]]);
  assert.deepEqual(st.list.map(s => storeyName(st, s.index, house.showcase.level_names)), ['Kelder', '1. korrus', 'Katusealune']);
  assert.deepEqual(storeysOf({ ceiling: 2.7 }), { ground: 0, list: [{ index: 0, floor: 0, cut: 2.7 }] });
  // showing a storey lifts its band and every one over it; the roof on lifts none
  assert.deepEqual(bandTargets(null, 3), [1, 1, 1]);
  assert.deepEqual(bandTargets(0, 3), [0, 0, 0]);
  assert.deepEqual(bandTargets(1, 3), [1, 0, 0]);
  assert.deepEqual(bandTargets(2, 3), [1, 1, 0]);
});

test('each storey\'s floors are with its contents, at its floor, in every style', () => {
  for (const style of ['simple', 'real', 'photo']) {
    const b = layersOf(style).L.building, roots = [b.group, ...b.lifts];
    assert.equal(b.lifts.length, 3, `${style}: a band per storey`);
    assert.equal(b.lifts[2], b.lift, `${style}: the top band is the lift`);
    const floors = roots.map(r => { const out = {}; r.traverse(o => { if (o.userData.room) out[o.userData.room] = Number(o.position.y.toFixed(3)); }); return out; });
    assert.deepEqual(floors[0], { utility: -2.58, sauna: -2.58 }, style);
    assert.deepEqual(floors[1], { living: 0.02, hall: 0.02, bath: 0.02 }, style);
    assert.deepEqual(floors[2], { bedroom: 2.92, kids: 2.92 }, style);
    assert.deepEqual(floors[3], {}, `${style}: the roofs' band has no floor`);
  }
});

test('an attic\'s knee walls stand whole under the roof, its gable walls are cut at its own cut', () => {
  const gap = modelFrame(house).roof.gap;
  for (const style of ['simple', 'real']) {
    const b = layersOf(style).L.building, [, band1, band2] = b.lifts;
    // the street side knee wall from (0, 0) and the east gable from (10, 0), both on the attic floor
    const knee = groupsAt(band1, 0, 2.9, 0), kneeUp = groupsAt(band2, 0, 2.9, 0);
    assert.equal(knee.length, 1, `${style}: the knee wall with the attic's contents`);
    assert.equal(kneeUp.length, 0, `${style}: no part of it over the cut`);
    const eave = modelFrame(house).roof.fns.main(5, 0) - gap;
    assert.ok(topOf(knee[0]) <= eave + 1e-6, `${style}: the knee wall's top ${topOf(knee[0])} stays under the roof ${eave}`);
    const gable = groupsAt(band1, 10, 2.9, 0), gableUp = band2.children.filter(o => o.isGroup && Math.abs(o.position.x - 10) < 1e-6 && Math.abs(o.position.y - 2.9) < 1e-6);
    assert.equal(gable.length, 1);
    assert.equal(gableUp.length, 1, `${style}: the gable's part over the cut is in the roofs' band`);
    // from where the roof rises over the cut, (5.3 + gap - 3.7) / tan 40 - 0.5 in from the eave
    const from = (5.3 + gap - 3.7) / Math.tan((40 * Math.PI) / 180) - 0.5;
    assert.ok(Math.abs(gableUp[0].position.z - from) < 0.01, `${style}: it starts at z ${gableUp[0].position.z}, not ${from}`);
    assert.ok(Math.abs(topOf(gable[0]) - 5.3) < 1e-6, `${style}: the gable cut at 5.3, ${topOf(gable[0])}`);
    // no wall stands through the roof over it: a wall's top follows the roof at its centreline, so
    // its faces may reach into the slab, never above it
    const roofAt = modelFrame(house).roof.fns.main, thick = house.roofs.main.thick, v = new THREE.Vector3();
    [...knee, ...gable, ...gableUp].forEach(g => g.updateMatrixWorld(true) || g.traverse(o => {
      if (!o.isMesh || o.userData.part) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        if (v.x >= -0.5 && v.x <= 10.5 && v.z >= -0.5 && v.z <= 8.5) assert.ok(v.y <= roofAt(v.x, v.z) - gap + thick + 1e-4, `${style}: a wall vertex ${v.toArray()} over the roof`);
      }
    }));
  }
});

test('the basement\'s walls stand on its floor, cut at its own cut', () => {
  const b = layersOf('real').L.building, [band0] = b.lifts;
  const low = groupsAt(b.group, 0, -2.6, 0);
  assert.equal(low.length, 1, 'the basement\'s street wall with its contents');
  assert.ok(Math.abs(topOf(low[0]) + 0.3) < 1e-6, `cut at -0.3, ${topOf(low[0])}`);
  assert.equal(groupsAt(band0, 0, -2.6, 0).length, 1, 'its part over the cut in band 0, with the ground storey');
});

test('an upper storey room\'s panes are its own glass, which glows at night with its light on', () => {
  const { ctx, L } = layersOf('real');
  const b = L.building, panes = [];
  b.lifts[1].traverse(o => { if (o.userData.pane === 'bedroom') panes.push(o); });
  assert.ok(panes.length >= 1, 'the attic bedroom has panes');
  const glass = panes[0].material;
  const others = new Set();
  [b.group, b.lifts[0]].forEach(r => r.traverse(o => { if (o.userData.pane !== undefined) others.add(o.material); }));
  assert.ok(!others.has(glass), 'not shared with a lower storey');
  b.markers([{ id: 'lamp', room: 'bedroom', state: 'on', icon: 'light' }]);
  ctx.state.night = 1;
  for (let i = 0; i < 400 && b.update(0.1, 0.5); i++);
  assert.ok(glass.emissiveIntensity > 0.5, `glows ${glass.emissiveIntensity}`);
});

test('the interior: each storey\'s caps, skirting and furniture with its contents, its caps shown while its band is lifted', () => {
  const { ctx, L } = layersOf('real');
  const I = L.interior, roots = [I.group, ...I.lifts.filter(Boolean)];
  assert.equal(roots.length, 3, 'the group and the bands under the attic and the ground storey');
  const capsIn = r => r.children.filter(o => o.userData.part === 'cap');
  roots.forEach((r, s) => {
    assert.equal(capsIn(r).length, 1, `storey ${s}'s caps`);
    assert.equal(capsIn(r)[0].userData.storey, s);
    assert.ok(r.children.some(o => o.userData.part === 'skirting'), `storey ${s}'s skirting`);
  });
  const attic = capsIn(roots[2])[0], ground = capsIn(roots[1])[0];
  ctx.state.fades = { 0: 1, 1: 1, 2: 1 };
  I.update();
  const hidden = attic.count, groundHidden = ground.count;
  assert.ok(groundHidden < ground.userData.walls.length, 'the ground storey\'s cut caps hide under its band');
  ctx.state.fades = { 0: 1, 1: 1, 2: 0 };
  I.update();
  assert.ok(attic.count > hidden, 'the attic\'s cut caps show once its roofs\' band is lifted');
  assert.equal(ground.count, groundHidden, 'the ground storey\'s stay hidden: its band is on');
  ctx.state.fades = { 0: 1, 1: 0, 2: 0 };
  I.update();
  assert.equal(ground.count, ground.userData.walls.length, 'and show once it is lifted');
});

test('a stair\'s steps follow its rise, each an oak tread; a table on the attic floor stands on it', () => {
  const { L } = layersOf('real');
  const I = L.interior, roots = [I.group, ...I.lifts.filter(Boolean)];
  const boxes = idx => {
    const out = [], m = new THREE.Matrix4(), b = new THREE.Box3(), unit = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
    roots.forEach(r => r.traverse(o => {
      if (!o.isInstancedMesh || o.userData.part !== 'furniture') return;
      o.userData.items.forEach((it, k) => { if (it === idx) { o.getMatrixAt(k, m); out.push({ root: r, box: b.copy(unit).applyMatrix4(m).clone() }); } });
    }));
    return out;
  };
  const items = house.furniture;
  const stairs = items.map((f, i) => [f, i]).filter(([f]) => f.kind === 'stair');
  stairs.forEach(([f, i]) => {
    const n = Math.max(1, Math.round((f.y[1] - f.y[0]) / 0.18));
    const parts = boxes(i);
    assert.equal(parts.length, 2 * n, `stair ${i}: a block and a tread per step, ${n} steps`);
    const top = Math.max(...parts.map(p => p.box.max.y));
    assert.ok(Math.abs(top - f.y[1]) < 1e-6, `stair ${i} reaches ${f.y[1]}`);
  });
  // the basement flight is with the basement's contents, the L stair with the ground storey's
  assert.equal(boxes(stairs[0][1])[0].root, roots[0]);
  assert.equal(boxes(stairs[1][1])[0].root, roots[1]);
  assert.equal(boxes(stairs[2][1])[0].root, roots[1], 'a flight from mid-air is on the storey of the room under it');
  const table = items.findIndex(f => f.kind === 'table' && f.y[0] === 2.9);
  const low = Math.min(...boxes(table).map(p => p.box.min.y));
  assert.ok(Math.abs(low - 2.9) < 1e-6, `the attic table's legs end at ${low}`);
  assert.equal(boxes(table)[0].root, roots[2]);
});

test('a split level: three storeys, a mirror at 1.5 over the low floor stays on it', () => {
  const m = structuredClone(two);
  m.levels = [0, 1.4, 3];
  m.walls.forEach(w => { if (w.level) w.level = 2; });
  m.chimneys.forEach(c => { if (c.level) c.level = 2; });
  m.rooms.forEach(r => { if (r.level) r.level = 2; });
  m.rooms.push({ id: 'half', name: 'Kabinet', level: 1, rects: [[30, 30, 33, 33]] });
  const b = layersOf('real', m).L.building, st = storeysOf(m), storeyOf = f => storeyOfItem(m, st, f);
  assert.equal(b.lifts.length, 3);
  assert.equal(storeyOf({ rect: [1, 0.3, 2, 0.35], y: [1.5, 2.2] }), 0, 'over the living room');
  assert.equal(storeyOf({ rect: [31, 31, 32, 32], y: [1.4, 2] }), 1, 'in the half level');
  assert.equal(storeyOf({ rect: [40, 40, 41, 41], y: [1.5, 2] }), 1, 'outside every room: the highest floor under it');
});

test('with a basement, a Christmas tree and a planned item in the house stand with the ground storey, one outside stays on the lot', () => {
  const m = structuredClone(house);
  m.site.festive = { christmas_trees: [{ pos: [2, 6.5], height: 1.6, base: 1 }] };
  m.future = { as_of: '2026-01-15', items: [
    { id: 'battery', kind: 'battery', name: 'Aku', pos: [7, 1], rot: 0, facts: [] },
    { id: 'charger', kind: 'charger', name: 'Laadija', pos: [14, 2], rot: 0, facts: [] }
  ] };
  const { L } = layersOf('real', m);
  const under = (o, root) => { while (o && o !== root) o = o.parent; return o === root; };
  const W = L.winter, tree = [];
  [W.group, ...W.lifts].forEach(r => r.traverse(o => { if (o.userData.part === 'tree-leds') tree.push(o); }));
  assert.equal(tree.length, 1);
  assert.ok(under(tree[0], W.lifts[0]), 'the tree with the ground storey, in band 0');
  const F = L.future, at = id => { let g = null; [F.group, ...F.lifts].forEach(r => r.traverse(o => { if (!g && o.userData.feature === id) g = o; })); return g; };
  assert.ok(under(at('battery'), F.lifts[0]), 'the battery in the hall, in band 0');
  assert.ok(under(at('charger'), F.group), 'the charger outside, with the lot');
});

test('the ground leaves the basement open: the lawn, the land round it, the glow and the grid', () => {
  assert.deepEqual(pitOf(one), [], 'a house without a basement has no pit');
  assert.equal(pitOf(house).length, 1);
  // does a mesh's surface cover (x, z), seen from above
  const covers = (mesh, [x, z]) => {
    mesh.updateMatrixWorld(true);
    const g = mesh.geometry, p = g.attributes.position, idx = g.index ? g.index.array : [...Array(p.count).keys()];
    const v = i => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [v(idx[t]), v(idx[t + 1]), v(idx[t + 2])];
      const s = (p1, p2) => (p2.x - p1.x) * (z - p1.z) - (p2.z - p1.z) * (x - p1.x);
      const d = [s(a, b), s(b, c), s(c, a)];
      if (d.every(k => k >= 0) || d.every(k => k <= 0)) return true;
    }
    return false;
  };
  const inPit = [3, 6], beside = [8, -3];
  for (const m of [house, one]) {
    const meshes = layersOf('real', m).L.ground.group.children.filter(o => o.isMesh);
    assert.equal(meshes.length, 2);
    meshes.forEach(o => {
      assert.equal(covers(o, inPit), m === one, `${m === one ? 'no' : 'a'} hole in ${o.material.name || 'a ground mesh'}`);
      assert.ok(covers(o, beside));
    });
  }
  const g = layersOf('simple').L.ground.group, glow = g.children.find(o => o.isMesh), grid = g.children.find(o => o.isLineSegments);
  assert.ok(!covers(glow, inPit) && covers(glow, beside), 'the glow');
  grid.updateMatrixWorld(true);
  const p = grid.geometry.attributes.position, at = i => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(grid.matrixWorld);
  const through = ([x, z]) => { for (let i = 0; i < p.count; i += 2) { const a = at(i), b = at(i + 1); if (Math.abs(a.x - x) < 1e-6 && Math.abs(b.x - x) < 1e-6 && Math.min(a.z, b.z) <= z && z <= Math.max(a.z, b.z)) return true; } return false; };
  assert.ok(!through(inPit), 'no grid line in the pit');
  assert.ok(through(beside), 'the grid runs on beside it');
  assert.equal(grid.geometry.attributes.color.count, p.count);
});
