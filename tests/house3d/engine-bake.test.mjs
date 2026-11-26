// The studio stage's layer choice and the baked contact shadows (house3d/scene/bake.js) on the
// synthetic fixture, with the bake's export (scripts/house3d-bake-export.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { THREE, E, LAYERS, model, options, buildAll } from './engine-harness.mjs';

const { stageLayers } = await import(new URL('house3d.js', E));
const { bakeTargets, bakeKeys, applyBake, bakeCount, materialsOf, BAKE_LAYERS, BAKE_FORMAT } = await import(new URL('scene/bake.js', E));
const { bakeExport } = await import(new URL('../../scripts/house3d-bake-export.mjs', import.meta.url));

const realLayers = () => buildAll({ ...options, style: 'real' }).built.map(b => b.L);
// a bake that fits targets: every vertex at the atlas's centre
const synthetic = targets => ({
  format: BAKE_FORMAT, atlas: 'bake-ao.png',
  meshes: Object.fromEntries(targets.map(({ key, mesh }) => { const n = bakeCount(mesh.geometry); return [key, { count: n, uv: new Array(2 * n).fill(0.5) }]; }))
});
const texture = () => new THREE.Texture();

test('stageLayers: the studio builds only the house, in the real style only', () => {
  assert.deepEqual(stageLayers('real', 'studio'), ['pergola', 'building', 'interior']);
  assert.deepEqual(stageLayers('real', 'garden'), LAYERS);
  assert.deepEqual(stageLayers('real', undefined), LAYERS);
  assert.deepEqual(stageLayers('simple', 'studio'), LAYERS, 'the stage is the real style\'s');
  assert.deepEqual(stageLayers('simple', undefined), LAYERS);
});

test('bakeTargets: opaque meshes of the building and pergola only, keyed per layer in order', () => {
  const targets = bakeTargets(realLayers());
  assert.ok(targets.length > 20, 'the fixture has bakeable meshes');
  for (const id of BAKE_LAYERS) {
    const keys = targets.filter(t => t.key.startsWith(`${id}:`)).map(t => t.key);
    assert.deepEqual(keys, keys.map((_, i) => `${id}:${i}`), id);
  }
  for (const { mesh } of targets) {
    assert.ok(materialsOf(mesh).every(m => m.opacity === 1 && 'aoMap' in m), 'opaque, takes an aoMap');
  }
  assert.ok(targets.some(t => t.mesh.material.transparent), 'the roof\'s fading materials are targets');
});

test('the export: its keys and counts are bakeKeys() of a fresh build', () => {
  const data = bakeExport(model);
  assert.deepEqual(data.targets.map(t => t.key), bakeKeys(realLayers()));
  const counts = Object.fromEntries(bakeTargets(realLayers()).map(t => [t.key, bakeCount(t.mesh.geometry)]));
  for (const t of data.targets) {
    assert.equal(t.count, counts[t.key], t.key);
    assert.equal(t.v.length, 3 * t.count, `${t.key}: three numbers a vertex`);
  }
  assert.ok(Array.isArray(data.occluders));
  assert.equal(data.ground.y, 0);
});

test('applyBake: a fitting bake applies to every target, with uv1 and one clone per material', () => {
  const targets = bakeTargets(realLayers());
  const before = new Set(targets.flatMap(t => materialsOf(t.mesh)));
  const kept = [];
  const r = applyBake({ THREE, targets, bake: synthetic(targets), texture: texture(), keep: x => (kept.push(x), x) });
  assert.equal(r.applied, targets.length);
  const after = new Set();
  for (const { mesh } of targets) {
    assert.ok(!mesh.geometry.index, 'non-indexed');
    assert.equal(mesh.geometry.attributes.uv1.count, mesh.geometry.attributes.position.count);
    materialsOf(mesh).forEach(m => { assert.ok(m.aoMap, 'aoMap set'); after.add(m); });
  }
  assert.equal(after.size, before.size, 'one clone per source material');
  for (const m of before) assert.ok(kept.includes(m), 'the replaced material is kept for dispose');
});

test('applyBake: one count off, a missing key or another format applies nothing', () => {
  for (const spoil of [
    b => { const k = Object.keys(b.meshes)[3]; b.meshes[k].count += 1; },
    b => { delete b.meshes[Object.keys(b.meshes)[0]]; },
    b => { b.format = BAKE_FORMAT + 1; }
  ]) {
    const targets = bakeTargets(realLayers()), bake = synthetic(targets);
    spoil(bake);
    const geometries = targets.map(t => t.mesh.geometry), materials = targets.map(t => t.mesh.material);
    const r = applyBake({ THREE, targets, bake, texture: texture() });
    assert.equal(r.applied, 0);
    assert.ok(r.reason);
    targets.forEach((t, i) => { assert.equal(t.mesh.geometry, geometries[i]); assert.equal(t.mesh.material, materials[i]); });
  }
});

test('applyBake: a non-indexed geometry is cloned, not changed', () => {
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial());
  const targets = [{ key: 'building:0', mesh }];
  assert.equal(applyBake({ THREE, targets, bake: synthetic(targets), texture: texture() }).applied, 1);
  assert.notEqual(mesh.geometry, g);
  assert.equal(g.attributes.uv1, undefined, 'the source geometry has no uv1');
  assert.ok(mesh.geometry.attributes.uv1);
});
