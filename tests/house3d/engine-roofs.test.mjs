// Engine tests on the two-storey fixture (tests/house3d/fixture-twostorey.md): the wing roofs'
// heights and faces, the walls under them, the upper storey in the lift, the chimneys and the
// plinth. The set-up is in
// engine-harness.mjs; scripts/house3d-test.sh runs every engine-*.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THREE, E, buildAll, loadModel, modelFrame, homeBox, createKit, hexOf } from './engine-harness.mjs';

const { roofFaces, roofPeak, chimneysOf, houseTop } = await import(new URL('house3d.js', E));
const { crossings } = await import(new URL('scene/layers/building.js', E));

const two = loadModel('fixture-twostorey.md');
const S22 = Math.tan((22 * Math.PI) / 180), S30 = Math.tan((30 * Math.PI) / 180);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`);

function buildTwo(style) {
  const { built } = buildAll({ style, layers: { winter: true } }, two);
  return { layers: Object.fromEntries(built.map(({ want, L }) => [want, L])) };
}
const area = poly => Math.abs(poly.reduce((a, [x, z], i) => { const [u, v] = poly[(i + 1) % poly.length]; return a + x * v - u * z; }, 0)) / 2;
const inPoly = (poly, [x, z]) => {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], c = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    if (Math.abs(c) < 1e-9) continue;
    if (sign && Math.sign(c) !== sign) return false;
    sign = Math.sign(c);
  }
  return true;
};

test('modelFrame: each roof kind has its height at (x, z), the L valley both wings', () => {
  const { fns } = modelFrame(two).roof;
  near(fns.main(-0.5, 4), 5.4, 'hip eave');
  near(fns.main(6, 4), 5.4 + 4.5 * S22, 'hip ridge');
  near(fns.main(12, 4), 5.4 + 0.5 * S22, 'hipped end');
  near(fns.garage(18, 0.6), 2.5 + 3.3 * S30, 'gable end at the ridge');
  near(fns.garage(15, 5), 2.5 + 0.3 * S30, 'gable side');
  near(fns.porch(13, 4), 3.3, 'flat');
  near(fns.main(-3, 4), 5.4, 'outside: the nearest wing');
  // on the inner corner's diagonal both wings stand as high
  const [a, b] = two.roofs.main.rects;
  const wing = (q, x, z) => 5.4 + S22 * Math.min(x - q[0], q[2] - x, z - q[1], q[3] - z);
  for (const t of [0.5, 1.5, 3]) {
    near(wing(a, 6.5 - t, 8.5 - t), wing(b, 6.5 - t, 8.5 - t), `valley ${t}`);
    near(fns.main(6.5 - t, 8.5 - t), wing(a, 6.5 - t, 8.5 - t), `valley height ${t}`);
  }
});

test('roofFaces: every point of the wings lies in one face, on its plane at the roof height', () => {
  const fns = modelFrame(two).roof.fns;
  for (const id of ['main', 'garage', 'porch']) {
    const r = two.roofs[id], { faces, edges } = roofFaces(r);
    // the faces' areas add up to the wings' union, so none overlaps another
    const xs = [...new Set(r.rects.flatMap(q => [q[0], q[2]]))].sort((p, q) => p - q), zs = [...new Set(r.rects.flatMap(q => [q[1], q[3]]))].sort((p, q) => p - q);
    let union = 0;
    for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      if (r.rects.some(q => cx > q[0] && cx < q[2] && cz > q[1] && cz < q[3])) union += (xs[i + 1] - xs[i]) * (zs[j + 1] - zs[j]);
    }
    near(faces.reduce((s, f) => s + area(f.poly), 0), union, `${id} area`);
    // sampled on a grid off the face lines: in exactly one face, whose plane is the roof there
    const [bx0, bz0, bx1, bz1] = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    for (let x = bx0 + 0.0137; x < bx1; x += 0.29) for (let z = bz0 + 0.0193; z < bz1; z += 0.31) {
      const inside = r.rects.some(q => x > q[0] && x < q[2] && z > q[1] && z < q[3]);
      const hit = faces.filter(f => inPoly(f.poly, [x, z]));
      if (!inside) { assert.equal(hit.length, 0, `${id} (${x}, ${z}) is off the roof`); continue; }
      assert.equal(hit.length, 1, `${id} (${x}, ${z}) in ${hit.length} faces`);
      const [pa, pb, pc] = hit[0].plane;
      near(pa * x + pb * z + pc, fns[id](x, z), `${id} plane at (${x}, ${z})`);
    }
    // the outer edges run round the wings' outline: their length is its perimeter
    const len = edges.reduce((s, [p, q]) => s + Math.hypot(q[0] - p[0], q[1] - p[1]), 0);
    const perim = { main: 2 * (13 + 15), garage: 2 * (6.6 + 7.8), porch: 2 * (3.4 + 8.8) }[id];
    near(len, perim, `${id} perimeter`);
  }
  near(roofPeak(two.roofs.main), 5.4 + 4.5 * S22, 'the hip roof peaks at its ridge');
  near(roofPeak(two.roofs.garage), 2.5 + 3.3 * S30, 'the gable roof at its ridge');
  near(homeBox({ ...two, chimneys: [] })[4], 5.4 + 4.5 * S22 + two.roofs.main.thick, 'homeBox frames the highest roof');
});

test('a gable end wall reaches the ridge, a wall under a hipped end follows its slope', () => {
  const gap = modelFrame(two).roof.gap;
  const { layers } = buildTwo('simple');
  const lift = layers.building.lift;
  lift.updateMatrixWorld(true);
  // the highest point of the lift's walls over a plan point, from their vertices
  const topAt = (x, z) => {
    let best = -Infinity;
    const v = new THREE.Vector3();
    lift.traverse(o => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        if (Math.abs(v.x - x) < 0.01 && Math.abs(v.z - z) < 0.25) best = Math.max(best, v.y);
      }
    });
    return best;
  };
  near(crossings([15, 1], [21, 1], [[[18, 0.6], [18, 8.4]]])[0], 3, 'the ridge crosses the gable wall at its middle');
  assert.ok(Math.abs(topAt(18, 1.2) - (2.5 + 3.3 * S30 - gap)) < 1e-3, `gable peak ${topAt(18, 1.2)}`);
  // the upper storey's east wall (x = 12) under the long wing's hipped end
  assert.ok(Math.abs(topAt(12.2, 4) - (5.4 + 0.5 * S22 - gap)) < 1e-3, `hipped end ${topAt(12.2, 4)}`);
});

test('an upper storey wall stands in the lift on its level, its panes on a glass of their own', () => {
  for (const style of ['simple', 'real']) {
    const { layers } = buildTwo(style);
    const b = layers.building;
    const lift = b.lift, group = b.group;
    group.updateMatrixWorld(true);
    lift.updateMatrixWorld(true);
    // the upper storey's wall groups sit at y = levels[1]
    const at3 = [];
    lift.traverse(o => { if (o.isGroup && Math.abs(o.position.y - 3) < 1e-9) at3.push(o); });
    assert.ok(at3.length >= 7, `${style}: ${at3.length} upper storey walls in the lift`);
    // nothing in the group stands above the ceiling
    let top = -Infinity;
    const box = new THREE.Box3();
    group.traverse(o => { if (o.isMesh && !o.userData.room) { box.setFromObject(o); top = Math.max(top, box.max.y); } });
    assert.ok(top <= two.ceiling + 1e-6, `${style}: the ground floor's top ${top}`);
    // the floors are the ground floor's rooms only
    const floors = new Set();
    group.traverse(o => { if (o.userData.room) floors.add(o.userData.room); });
    assert.deepEqual([...floors].sort(), ['garage', 'living', 'porch']);
    if (style !== 'real') continue;
    const glassIn = g => { const s = new Set(); g.traverse(o => { if (o.userData.pane !== undefined) s.add(o.material); }); return s; };
    const shared = [...glassIn(lift)].filter(m => glassIn(group).has(m));
    assert.equal(shared.length, 0, 'the lift shares no glass with the ground floor');
    assert.ok(glassIn(lift).size >= 1, 'the upper storey has panes');
  }
});

test('the winter layer lays one snow slab on every wing roof, over its faces', () => {
  const { layers } = buildTwo('real');
  const snow = [];
  layers.winter.lift.traverse(o => { if (o.userData.part === 'roof-snow') snow.push(o); });
  assert.deepEqual(snow.map(m => m.userData.roof).sort(), ['garage', 'main', 'porch']);
  // each slab lies on the roof's top, its faces' corners included
  const roofs = modelFrame(two).roof;
  for (const m of snow) {
    const top = roofs.top(m.userData.roof), p = m.geometry.attributes.position;
    let low = Infinity;
    for (let i = 0; i < p.count; i++) {
      const over = p.getY(i) - top(p.getX(i), p.getZ(i));
      assert.ok(over >= -1e-6, `snow on ${m.userData.roof} under the roof`);
      low = Math.min(low, over);
    }
    assert.ok(low < 0.01, `snow on ${m.userData.roof} lies on the roof`);
  }
  // a hip roof's slab holds a piece per face
  assert.ok(snow.find(m => m.userData.roof === 'main').geometry.attributes.position.count >= roofFaces(two.roofs.main).faces.length * 12);
});

// each chimney's meshes as { id: [[parent, y0, y1, mesh], ...] }, from their world boxes
function chimneyParts(L) {
  const out = {}, box = new THREE.Box3();
  [['group', L.group], ['lift', L.lift]].forEach(([name, root]) => {
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (o.userData.part !== 'chimney') return;
      box.setFromObject(o);
      const r = v => Number(v.toFixed(6)) + 0;
      (out[o.userData.chimney] ||= []).push([name, r(box.min.y), r(box.max.y), o]);
    });
  });
  return out;
}

test('a chimney is cut at the ceiling, the part above in the lift; one under the ceiling stays, an upper storey\'s lifts whole', () => {
  for (const style of ['simple', 'real']) {
    const parts = chimneyParts(buildTwo(style).layers.building);
    const spans = Object.fromEntries(Object.entries(parts).map(([id, ps]) => [id, ps.map(([p, a, b]) => [p, a, b])]));
    assert.deepEqual(spans, {
      hearth: [['group', 0, 2.6], ['lift', 2.6, 8]],
      outside: [['group', 0, 2.6], ['lift', 2.6, 6]],
      stove: [['group', 0, 2.2]],
      upper: [['lift', 3, 7]]
    }, style);
    // outside the west wall, where it was put
    const b = new THREE.Box3().setFromObject(parts.outside[0][3]);
    assert.deepEqual([b.min.x, b.max.x, b.min.z, b.max.z].map(v => Number(v.toFixed(6))), [-0.8, -0.3, 3, 3.5]);
    if (style === 'simple') parts.hearth.forEach(([, , , m]) => assert.ok(m.children.some(c => c.isLineSegments), 'with edges'));
  }
});

test('a chimney\'s lift part fades and rises with the roof, the lower part stays', () => {
  for (const style of ['simple', 'real']) {
    const { ctx, built } = buildAll({ style }, two);
    const L = built.find(b => b.want === 'building').L, parts = chimneyParts(L);
    const [lower, upper] = parts.hearth.map(p => p[3]);
    assert.notEqual(lower.material, upper.material, `${style}: a material of its own`);
    const before = lower.material.opacity, full = upper.material.opacity;
    ctx.kit.applyFade(L.lift, 0.5);
    assert.equal(upper.material.opacity, full * 0.5, `${style}: the lift part fades`);
    assert.equal(lower.material.opacity, before, `${style}: the lower part does not`);
    // the core moves the lift as a whole: the upper part is under it, the lower one is not
    let o = upper;
    while (o && o !== L.lift) o = o.parent;
    assert.equal(o, L.lift);
    o = lower;
    while (o && o !== L.lift) o = o.parent;
    assert.equal(o, null);
    if (style === 'real') assert.equal(lower.material.color.getHexString(), hexOf(ctx.kit, 'chimney'), 'the chimney surface');
  }
});

test('the interior caps a chimney cut at the ceiling, not one under it or upstairs', () => {
  const { layers } = buildTwo('real');
  const caps = [];
  layers.interior.group.traverse(o => { if (o.userData.part === 'cap') caps.push(o); });
  const ids = caps[0].userData.walls.filter(w => typeof w === 'string').sort();
  assert.deepEqual(ids, ['hearth', 'outside']);
  // the cut caps are counted after the uncut ones, so the roof hides them with the walls'
  const k = caps[0].userData.walls.indexOf('hearth'), m = new THREE.Matrix4(), v = new THREE.Vector3();
  caps[0].getMatrixAt(k, m);
  v.setFromMatrixPosition(m);
  assert.ok(Math.abs(v.x - 3.3) < 1e-6 && Math.abs(v.z - 6.3) < 1e-6 && v.y > two.ceiling && v.y < two.ceiling + 0.02, `cap at ${v.toArray()}`);
});

test('a chimney above the ridge is in the home view\'s box and under the shadow camera\'s top', () => {
  near(houseTop(two), 8, 'the hearth chimney');
  near(houseTop({ ...two, chimneys: [] }), 5.4 + 4.5 * S22 + two.roofs.main.thick, 'without it, the ridge');
  const [x0, , , , top] = homeBox(two);
  assert.equal(top, 8);
  assert.equal(x0, -0.8, 'the chimney outside the overhang');
});

test('a malformed chimney is left out, the scene still builds', () => {
  const chimneys = [null, { rect: [1, 2] }, { rect: [0, 0, 1, 1], top: '5' }, { rect: [1, 1, 0, 0], top: 5 }, { rect: [0, 0, 1, 1], top: 5, level: 7 },
    { rect: [0, 0, 1, 1], top: 2, level: 1 }, { rect: [0, 0, 1, 1], top: 5, level: 0.5 }, { rect: [0, 0, 1, 1], top: 5 }, { id: 'ok', rect: [1, 1, 1.5, 1.5], top: 5 }];
  assert.deepEqual(chimneysOf({ ...two, chimneys }).map(c => c.id), ['ok']);
  assert.deepEqual(chimneysOf({ ...two, chimneys: 'none' }), []);
  for (const style of ['simple', 'real']) {
    const { built } = buildAll({ style }, { ...two, chimneys });
    assert.deepEqual(Object.keys(chimneyParts(built.find(b => b.want === 'building').L)), ['ok'], style);
  }
});

// the building's base strips on the street wall (x 0..12, its outer face at z -0.2) as world
// boxes: the boxes on the ground in front of the face
function streetStrips(look) {
  const { built } = buildAll({ style: 'real' }, { ...two, look });
  const L = built.find(b => b.want === 'building').L, out = [], box = new THREE.Box3();
  L.group.updateMatrixWorld(true);
  L.group.traverse(o => {
    if (!o.isMesh || o.geometry.type !== 'BoxGeometry' || o.userData.part || o.userData.leaf) return;
    box.setFromObject(o);
    if (box.min.y > 1e-6 || box.max.z > -0.199 || box.min.z < -0.23 || box.max.x > 12.01) return;
    out.push({ x0: box.min.x, x1: box.max.x, h: Number(box.max.y.toFixed(6)), hex: o.material.color.getHexString() });
  });
  return out;
}

test('the plinth: the base surface and height a look names, else the frame\'s 0.12', () => {
  const kit = createKit(THREE, 'real');
  const named = streetStrips(two.look);
  assert.ok(named.length >= 1);
  named.forEach(s => assert.deepEqual([s.h, s.hex], [0.4, '4a4c4e']));
  const plain = streetStrips({ trims: { base: true } });
  assert.ok(plain.length >= 1);
  plain.forEach(s => assert.deepEqual([s.h, s.hex], [0.12, hexOf(kit, 'frame')]));
  // the surface alone, without the trim, draws no strip
  assert.equal(streetStrips({ surfaces: { base: '#4a4c4e' } }).length, 0);
  assert.equal(streetStrips({ surfaces: { base: '#4a4c4e' }, trims: { base: false } }).length, 0);
  // out of range: left out
  assert.equal(streetStrips({ trims: { base: { height: 2 } } }).length, 0);
});

test('the plinth breaks under a sill lower than its height', () => {
  // the street wall's windows: c 2.5 w 1.6 and c 8 w 2.4, both at sill 0.8
  const under = strips => strips.filter(s => s.x0 < 3.3 && s.x1 > 1.7).length;
  assert.equal(under(streetStrips({ trims: { base: { height: 0.4 } } })), 1, 'under the sill: one strip on');
  assert.equal(under(streetStrips({ trims: { base: { height: 1 } } })), 0, 'over the sill: broken');
});
