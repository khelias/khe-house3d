// Foto's models (house3d/assets/*.glb, made by scripts/house3d-models.sh): each within the budget
// of triangles and materials, geometry only (khe.ee's CSP refuses the blob: URLs embedded images
// become) with no extras, quantised for three.js's GLTFLoader without a decoder, listed in
// sources.json, and the models and the assets within their sizes; and what start() does with
// them: each in its item's place, fitted without stretching, its shapes hidden, a model that fails
// leaving them, done() after the models, nothing after a dispose, an indoor plant in its storey's band.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { THREE, E, options, buildAll, loadModel, partsOf, storeysOf } from './engine-harness.mjs';

const { GLTFLoader } = await import(new URL('vendor/three-0.187.0/examples/jsm/loaders/GLTFLoader.js', E));

const ASSETS = new URL('assets/', E);
const BUDGET = { triangles: 6000, materials: 2, models: 2.5e6, assets: 10e6 };
const files = readdirSync(ASSETS);
const glbs = files.filter(f => f.endsWith('.glb'));
const sources = JSON.parse(readFileSync(new URL('sources.json', ASSETS), 'utf-8')).files;
const size = f => statSync(new URL(f, ASSETS)).size;

// a binary glTF's JSON chunk
function gltf(name) {
  const raw = readFileSync(new URL(name, ASSETS));
  assert.equal(raw.toString('latin1', 0, 4), 'glTF', name);
  const length = raw.readUInt32LE(12);
  assert.equal(raw.readUInt32LE(16), 0x4e4f534a, `${name}: JSON chunk first`);
  return JSON.parse(raw.toString('utf-8', 20, 20 + length));
}

test('there are models', () => assert.ok(glbs.length >= 9, glbs.join()));

for (const name of glbs) {
  test(`${name}: within the budget, geometry only, quantised and listed`, () => {
    const doc = gltf(name);
    const prims = doc.meshes.flatMap(m => m.primitives);
    const triangles = prims.reduce((s, p) => s + doc.accessors[p.indices].count / 3, 0);
    assert.ok(triangles <= BUDGET.triangles, `${triangles} triangles`);
    assert.ok((doc.materials || []).length <= BUDGET.materials, `${doc.materials.length} materials`);
    assert.ok(prims.every(p => p.material !== undefined), 'every primitive has a material');
    assert.equal(doc.images, undefined, 'no images');
    assert.equal(doc.textures, undefined, 'no textures');
    assert.ok(!JSON.stringify(doc).includes('"extras"'), 'no extras');
    assert.ok((doc.extensionsRequired || []).includes('KHR_mesh_quantization'));
    assert.ok(prims.every(p => doc.accessors[p.attributes.POSITION].componentType === 5122), 'int16 positions');
    assert.ok(sources[name], 'in sources.json');
    assert.equal(sources[name].licence, 'CC0-1.0');
    assert.equal(sources[name].bytes, size(name));
  });
}

test('the models and the assets within their sizes', () => {
  const stems = glbs.map(g => g.slice(0, -4));
  const models = files.filter(f => stems.some(s => f === `${s}.glb` || (f.startsWith(`${s}-`) && f.endsWith('.ktx2'))));
  const bytes = models.reduce((s, f) => s + size(f), 0);
  assert.ok(bytes <= BUDGET.models, `${bytes} bytes of models`);
  const all = files.reduce((s, f) => s + size(f), 0);
  assert.ok(all <= BUDGET.assets, `${all} bytes of assets`);
});

// what start() would load: plain textures, and the committed models parsed as the card would
const load = () => Promise.resolve(new THREE.Texture());
const glb = f => {
  const raw = readFileSync(new URL(f, ASSETS));
  return new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
};
const photo = (m, o = {}) => buildAll({ ...options, style: 'photo', ...o }, m);
const modelsUnder = root => { const out = []; root.traverse(o => { if (o.userData.part === 'model') out.push(o); }); return out; };
const meshesOf = (item, keep) => item.children.filter(o => o.isMesh && !keep.includes(o));
const sizeOf = o => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());

test('Foto: start() puts a model in each yard thing\'s and planter\'s place, unstretched, and hides its shapes', async () => {
  const { ctx, byId } = photo();
  const asked = [];
  await ctx.look.start({ load, model: f => (asked.push(f), glb(f)), done() {} });
  assert.deepEqual(asked.sort(), ['bin.glb', 'fern.glb', 'garden-table.glb', 'lamp-post.glb', 'mailbox.glb', 'pot.glb', 'thuja.glb'], 'each kind once');
  const want = { bin: 'bin', mailbox: 'mailbox', garden_table: 'garden-table', pot: 'pot', lamp_post: 'lamp-post' };
  const items = byId.props.group.children.filter(o => o.userData.prop);
  assert.ok(items.length >= 5);
  items.forEach(item => {
    const ms = item.children.filter(o => o.userData.part === 'model');
    assert.equal(ms.length, 1, item.userData.prop);
    assert.equal(ms[0].userData.model, want[item.userData.part]);
    assert.ok(meshesOf(item, ms).every(m => !m.visible), `${item.userData.prop}: the shapes hidden`);
    const sc = ms[0].scale;
    assert.ok(Math.abs(sc.x - sc.y) < 1e-9 && Math.abs(sc.y - sc.z) < 1e-9, 'one scale');
  });
  // a fitted model fills its box on one side and stays within it on the others (props.js FIT)
  // in the item's own frame: an item may be turned
  const FIT = { bin: [0.58, 1.0, 0.74], garden_table: [0.9, 0.87, 1.68], pot: [0.9, 0.925, 0.9] };
  Object.entries(FIT).forEach(([kind, fit]) => {
    const own = items.find(o => o.userData.part === kind).children.find(o => o.userData.part === 'model').clone();
    own.position.set(0, 0, 0);
    own.rotation.set(0, 0, 0);
    const s = sizeOf(own);
    const r = [s.x / fit[0], s.y / fit[1], s.z / fit[2]];
    assert.ok(r.every(v => v < 1 + 1e-6) && r.some(v => v > 1 - 1e-6), `${kind}: ${r.join()}`);
  });
  // the lamp keeps the lights layer's one head per post under its cap
  const lamps = items.filter(o => o.userData.part === 'lamp_post');
  assert.equal(byId.props.api.lamps().length, lamps.length);
  lamps.forEach(item => assert.ok(sizeOf(item.children.find(o => o.userData.part === 'model')).y > 2.15 + 0.14, 'the cap above the head'));
  // a thuja on its column, ferns along each low planter, the shapes they stand for hidden
  const site = byId.site.group, found = modelsUnder(site);
  const planters = ctx.model.site.planters;
  assert.equal(found.filter(o => o.userData.model === 'thuja').length, planters.filter(p => p.plant === 'thuja').length);
  assert.ok(found.filter(o => o.userData.model === 'fern').length >= planters.filter(p => p.plant === 'low').length);
  assert.ok(site.children.filter(o => o.geometry && o.geometry.type === 'LatheGeometry').every(o => !o.visible), 'the thuja\'s column');
  // the winter layer still dresses the thuja by the outline the column had, which the model's height keeps to
  const tall = byId.site.api.planters();
  assert.ok(tall.length && tall.every(t => t.profile.at(-1)[1] === 1.62));
  assert.ok(Math.abs(sizeOf(found.find(o => o.userData.model === 'thuja')).y - 1.62) < 0.2);
});

test('Foto: a model or a colour map of it that fails to load leaves its item\'s shapes; Päris asks for none', async () => {
  const { ctx, byId } = photo();
  await ctx.look.start({ load, model: f => (f === 'bin.glb' ? Promise.reject(new Error('404')) : glb(f)), done() {} });
  const items = byId.props.group.children.filter(o => o.userData.prop);
  items.filter(o => o.userData.part === 'bin').forEach(item => {
    assert.equal(modelsUnder(item).length, 0);
    assert.ok(meshesOf(item, []).every(m => m.visible));
  });
  assert.ok(items.filter(o => o.userData.part === 'mailbox').every(item => modelsUnder(item).length === 1));
  // a model whose colour map fails stays out too: no white cut-out
  const noMap = photo();
  await noMap.ctx.look.start({ load: f => (f === 'fern-fronds.ktx2' ? Promise.reject(new Error('404')) : load()), model: glb, done() {} });
  assert.ok(!modelsUnder(noMap.byId.site.group).some(o => o.userData.model === 'fern'));
  assert.ok(modelsUnder(noMap.byId.site.group).some(o => o.userData.model === 'thuja'));
  assert.equal(buildAll({ ...options, style: 'real' }).ctx.look.model, undefined);
});

test('Foto: done() waits for the models, a scene without their items loads none, and a dispose mid-load adds nothing', async () => {
  const { ctx, byId } = photo();
  let release, done = 0;
  const held = new Promise(r => { release = r; });
  const started = ctx.look.start({ load, model: f => held.then(() => glb(f)), done: () => done++ });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(modelsUnder(byId.props.group).length, 0);
  const before = done;
  release();
  await started;
  assert.equal(done, before + 1, 'once more, after the models');
  assert.ok(modelsUnder(byId.props.group).length > 0);

  const bare = photo(loadModel('fixture-twostorey.md'));
  let asked = 0;
  await bare.ctx.look.start({ load, model: f => (asked++, glb(f)), done() {} });
  assert.equal(asked, 0);

  const gone = photo();
  let go;
  const wait = new Promise(r => { go = r; });
  const run = gone.ctx.look.start({ load, model: f => wait.then(() => glb(f)), done() {} });
  gone.ctx.look.dispose();
  go();
  await run;
  assert.equal(modelsUnder(gone.byId.props.group).length, 0);
});

test('Foto: an indoor plant\'s model stands in its storey\'s band in the plant\'s place, the plant\'s instances gone', async () => {
  const m = loadModel('fixture-storeys.md'), floor = storeysOf(m).list[1].floor;
  const plants = [
    { kind: 'plant', rect: [1, 1, 1.5, 1.5], y: [floor, floor + 1.2], level: 1 },
    { kind: 'plant', circle: [2.5, 1.25, 0.2], y: [floor, floor + 0.8], level: 1, bloom: true }
  ];
  const first = (m.furniture || []).length;
  const withPlants = { ...m, furniture: [...(m.furniture || []), ...plants] };
  const { ctx, byId } = photo(withPlants, { layers: { interior: true } });
  await ctx.look.start({ load, model: glb, done() {} });
  const I = byId.interior, band = I.lifts[0];
  const found = modelsUnder(I.group).concat(...I.lifts.filter(Boolean).map(modelsUnder));
  assert.deepEqual(found.map(o => o.userData.model).sort(), ['plant', 'plant-bloom']);
  found.forEach(o => assert.equal(o.parent, band, 'in the band of storey 1'));
  const [rect] = found.filter(o => o.userData.model === 'plant');
  assert.deepEqual([rect.position.x, rect.position.y, rect.position.z], [1.25, floor, 1.25]);
  // every instance of the two plants is scaled to nothing, every other instance stays
  const mt = new THREE.Matrix4(), sc = new THREE.Vector3();
  let gone = 0, kept = 0;
  band.traverse(o => {
    if (!o.isInstancedMesh || !o.userData.items) return;
    o.userData.items.forEach((k, n) => {
      o.getMatrixAt(n, mt);
      sc.setFromMatrixScale(mt);
      if (k >= first) { assert.equal(sc.lengthSq(), 0); gone++; } else if (sc.lengthSq() > 0) kept++;
    });
  });
  assert.ok(gone > 0 && kept > 0);
  // the band's fade hides the model with the rest of it
  ctx.kit.applyFade(band, 0);
  assert.equal(band.visible, false);
});
