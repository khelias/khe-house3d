// The Foto style (scene/photo.js) on the synthetic fixture: every layer builds, its leaf cards,
// the bare winter crowns with their branches and twigs, the winter hedges, sky and light, the
// meadow past the lot, the pavers, the light tier, what start() applies once its textures are in, and
// the house's detail photographs over Päris's surfaces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THREE, LAYERS, E, options, buildAll, partsOf, autoQuality, rootsOf, loadModel } from './engine-harness.mjs';

const { DETAILS } = await import(new URL('scene/photo.js', E));

const photo = (o = {}) => buildAll({ ...options, style: 'photo', ...o });
const cardsOf = L => partsOf(L, 'cards');
const twigsOf = L => partsOf(L, 'twigs');
const total = L => cardsOf(L).reduce((s, m) => s + m.count, 0);
// what start() would load, as plain textures
const load = () => Promise.resolve(new THREE.Texture());
// what sky() is given: a scene with fog and a PMREM stand-in
const skyScene = () => {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0, 1, 2);
  return { scene, pmrem: { fromEquirectangular: t => ({ texture: t, dispose() {} }) } };
};

test('Foto builds every layer Päris builds, interior, lights and winter included', () => {
  const real = buildAll({ ...options, style: 'real' }).built.map(b => b.want);
  const { ctx, built } = photo();
  assert.equal(ctx.look.id, 'photo');
  assert.equal(ctx.look.lit, true);
  assert.deepEqual(built.map(b => b.want), real);
  ['interior', 'lights', 'winter'].forEach(id => assert.ok(real.includes(id), id));
  assert.ok(LAYERS.every(id => real.includes(id) || !photo().byId[id]));
});

test('Foto: leaf cards on every crown and hedge, hidden until the textures are in', () => {
  const { byId, ctx } = photo();
  const crowns = partsOf(byId.trees, 'crown'), cards = cardsOf(byId.trees);
  assert.ok(crowns.length > 0);
  assert.equal(cards.length, crowns.length, 'one set of cards per crown');
  assert.ok(cards.every(m => m.count > 0 && m.isInstancedMesh && m.castShadow && m.material.alphaTest > 0));
  assert.ok(cardsOf(byId.site).length > 0, 'the hedges have cards');
  assert.ok([...cards, ...cardsOf(byId.site)].every(m => !m.visible), 'hidden before start()');
  assert.equal(ctx.look.sky({ alt: 30, dir: [0, 1, 0], scene: new THREE.Scene(), pmrem: null }), false, 'the core sky until loaded');
});

test('Päris has no cards and no look of its own', () => {
  const { byId, ctx } = buildAll({ ...options, style: 'real' });
  assert.equal(cardsOf(byId.trees).length + cardsOf(byId.site).length, 0);
  ['crown', 'bareCrown', 'hedge', 'sky', 'start', 'bare', 'outsideScale'].forEach(k => assert.equal(ctx.look[k], undefined, k));
  assert.equal(twigsOf(byId.trees).length, 0);
});

test('Foto in winter: the crowns go bare onto their branches and twigs, and no caps', async () => {
  const { byId, ctx } = photo({ layers: { winter: true } });
  byId.winter.setOn(true);
  const crowns = partsOf(byId.trees, 'crown'), twigs = twigsOf(byId.trees);
  assert.equal(twigs.length, crowns.length, 'one set of twig cards per crown');
  assert.ok(twigs.every(m => m.count > 0 && !m.visible), 'hidden until the textures are in');
  const branches = partsOf(byId.trees, 'branch');
  assert.ok(branches.length >= crowns.length && branches.every(m => m.visible && m.geometry.attributes.position.count > 0), 'every tree has its branches');
  await ctx.look.start({ load, done() {} });
  assert.ok(crowns.every(m => !m.visible));
  assert.ok(cardsOf(byId.trees).every(m => !m.visible), 'no leaves on bare crowns');
  assert.ok(twigs.every(m => m.visible), 'the twigs show once in');
  assert.ok(partsOf(byId.trees, 'trunk').every(m => m.visible));
  assert.equal(partsOf(byId.trees, 'cap').length, 0);
  byId.winter.setOn(false);
  assert.ok(crowns.every(m => m.visible));
  assert.ok(cardsOf(byId.trees).every(m => m.visible), 'the leaves are back in summer');
  assert.ok(twigs.every(m => !m.visible), 'and the twigs gone');
  assert.ok(branches.every(m => m.visible), 'the branches stay inside the crowns');
});

test('Foto: Päris\'s three struts give way to the branches, and they stay inside the crown', () => {
  const real = buildAll({ ...options, style: 'real' }), { byId } = photo();
  assert.ok(partsOf(real.byId.trees, 'branch').every(m => m.geometry.type === 'BoxGeometry'));
  assert.ok(partsOf(byId.trees, 'branch').every(m => m.geometry.type !== 'BoxGeometry'));
  const crowns = byId.trees.api.crowns(), v = new THREE.Vector3();
  // within photo.js's REACH (0.8) of a crown's ellipsoid, with a little room for a branch's thickness
  const inAny = p => Object.values(crowns).some(({ centre: [x, y, z], radii: [a, b, c] }) => ((p.x - x) / a) ** 2 + ((p.y - y) / b) ** 2 + ((p.z - z) / c) ** 2 <= 0.81 + 1e-6);
  partsOf(byId.trees, 'branch').forEach(m => {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // the trunks below the crowns aside
      if (v.y > 0 && !inAny(v)) assert.ok(Object.values(crowns).some(({ centre: [x, y, z], radii: [, b] }) => Math.hypot(v.x - x, v.z - z) < 0.3 && v.y < y), `a branch outside its crown at ${v.toArray()}`);
    }
  });
});

test('Foto in winter: a hedge keeps its sides in frost green and sheds its top, the sky turns overcast', async () => {
  const { byId, ctx } = photo();
  await ctx.look.start({ load, done() {} });
  const hedges = cardsOf(byId.site);
  assert.ok(hedges.length >= 2 && hedges.length % 2 === 0, 'sides and top per hedge');
  const { scene, pmrem } = skyScene();
  ctx.look.sky({ alt: 10, dir: [1, 0.2, 0], scene, pmrem });
  const summer = scene.background, key = ctx.look.light(10).key.intensity;
  byId.winter.setOn(true);
  const shown = hedges.filter(m => m.visible);
  assert.equal(shown.length, hedges.length / 2, 'the sides only');
  assert.notEqual(hedges[0].material.color.getHexString(), new THREE.Color('#738e5c').getHexString(), 'in a winter green');
  ctx.look.sky({ alt: 10, dir: [1, 0.2, 0], scene, pmrem });
  assert.notEqual(scene.background, summer, 'the winter sky');
  assert.ok(ctx.look.light(10).key.intensity < key, 'under a softer sun');
  ctx.look.sky({ alt: -2, dir: [1, -0.03, 0], scene, pmrem });
  const dusk = scene.background;
  assert.notEqual(dusk, summer, 'the dusk sky below the horizon');
  byId.winter.setOn(false);
  assert.ok(hedges.every(m => m.visible), 'the top back in summer');
  ctx.look.sky({ alt: 10, dir: [1, 0.2, 0], scene, pmrem });
  assert.equal(scene.background, summer);
});

test('Foto: start() puts the photographs on the lawn and the street and shows the cards', async () => {
  const { byId, ctx } = photo();
  let done = 0;
  await ctx.look.start({ load, done: () => done++ });
  assert.equal(done, 2, 'the ground, sky and cards, then the house');
  assert.ok([...cardsOf(byId.trees), ...cardsOf(byId.site)].every(m => m.visible && m.material.map));
  const [outside, lawn] = ['PlaneGeometry', 'ShapeGeometry'].map(t => byId.ground.group.children.find(o => o.geometry.type === t).material);
  assert.equal(lawn.map, lawn.userData.photo.map);
  assert.ok(lawn.normalMap);
  assert.ok(outside.map && outside.map === outside.userData.photo.map && !outside.normalMap, 'the meadow past the lot');
  assert.notEqual(outside.map, lawn.map, 'at its own scale');
  byId.ground.update();
  assert.ok(outside.color.equals(outside.userData.look), 'in its own colour once in');
  const meadow = outside.color.clone();
  byId.ground.api.snow(0.3);
  assert.ok(lawn.map && outside.map, 'a dusting keeps the photographs');
  byId.ground.api.snow(1);
  assert.equal(lawn.map, null, 'a snowed lawn drops its photograph');
  assert.equal(outside.map, null, 'and so does the meadow');
  assert.ok(outside.color.r > meadow.r && outside.color.b > meadow.b, 'which whitens under the snow');
  byId.ground.api.snow(0);
  assert.equal(lawn.map, lawn.userData.photo.map);
  assert.ok(outside.color.equals(meadow));
  const { scene, pmrem } = skyScene();
  assert.equal(ctx.look.sky({ alt: 30, dir: [1, 0.5, 0], scene, pmrem }), true);
  assert.ok(scene.background && scene.environment);
  assert.equal(scene.children.filter(o => o.userData.part === 'backdrop').length, 1, 'the backdrop under the horizon');
  // three samples the panorama at transpose(R_y) * direction: towards our sun it finds the day
  // sky's own sun, at u 0.5952 across the image
  ctx.look.sky({ alt: 30, dir: [1, 0.5, 0.4], scene, pmrem });
  const toSun = new THREE.Vector3(1, 0.5, 0.4).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(scene.backgroundRotation).transpose());
  assert.ok(Math.abs(Math.atan2(toSun.z, toSun.x) / (2 * Math.PI) + 0.5 - 0.5952) < 1e-9, 'the panorama turned to the sun');
  assert.deepEqual(scene.environmentRotation.toArray(), scene.backgroundRotation.toArray());
  const day = scene.background;
  ctx.look.sky({ alt: 2, dir: [1, 0.05, 0], scene, pmrem });
  assert.notEqual(scene.background, day, 'the dusk sky below the dusk altitude');
  assert.ok(scene.backgroundIntensity < 0.75 * 0.6, 'and dimmer at dusk');
});

test('Foto: the paving keeps the model\'s colour as its photograph\'s average', async () => {
  const { byId, ctx } = photo();
  const paving = [];
  byId.site.group.traverse(o => { if (o.material && o.material.userData && o.material.userData.photo === undefined && o.material.map) paving.push(o.material); });
  const want = new Map(paving.map(m => [m, m.color.clone()]));
  await ctx.look.start({ load, done() {} });
  const dressed = [...want.keys()].filter(m => m.userData.photo);
  assert.ok(dressed.length > 0, 'the paving has its photograph');
  dressed.forEach(m => {
    assert.ok(m.normalMap, 'and its normal map');
    assert.ok(m.color.equals(want.get(m)), 'in the model\'s colour');
    // the shader divides out photo.js's SURFACES.paving.mean
    const sh = { uniforms: {}, vertexShader: '', fragmentShader: '#include <map_fragment>' };
    m.onBeforeCompile(sh);
    assert.ok(sh.fragmentShader.includes('diffuseColor.rgb *= vec3(3.9573, 3.9448, 4.3422);'), sh.fragmentShader);
  });
});

test('Foto: the light tier has fewer, larger leaves, half the hedge cards and twigs, fewer branches, no normal maps and no contact shadows', async () => {
  const high = photo({ quality: 'high' }), low = photo({ quality: 'low' });
  const h = total(high.byId.site), l = total(low.byId.site), n = cardsOf(low.byId.site).length;
  assert.ok(Math.abs(l - h / 2) <= n, `hedges: ${l} of ${h}`);
  // photo.js's CARDS: 50 per m² in the high tier, 11 in the light one, as it had before
  const leaves = total(low.byId.trees), more = total(high.byId.trees);
  assert.ok(Math.abs(more / leaves - 50 / 11) < 0.05, `leaves: ${leaves} of ${more}`);
  const twigs = t => twigsOf(t.byId.trees).reduce((s, m) => s + m.count, 0);
  assert.ok(Math.abs(twigs(low) - twigs(high) / 2) <= twigsOf(low.byId.trees).length, 'half the twigs');
  const verts = t => partsOf(t.byId.trees, 'branch').reduce((s, m) => s + m.geometry.attributes.position.count, 0);
  assert.ok(verts(low) < verts(high) / 2, 'one level of branches less');
  assert.equal(low.ctx.look.ao, false);
  assert.equal(high.ctx.look.ao, undefined);
  const asked = [];
  await low.ctx.look.start({ load: f => (asked.push(f), load()), done() {} });
  assert.ok(!asked.some(f => f.includes('normal')), asked.join());
});

test('autoQuality: the light tier on few cores or little memory', () => {
  assert.equal(autoQuality({ hardwareConcurrency: 8, deviceMemory: 8 }), 'high');
  assert.equal(autoQuality({ hardwareConcurrency: 4 }), 'low');
  assert.equal(autoQuality({ deviceMemory: 2 }), 'low');
  assert.equal(autoQuality({}), 'high');
});

// every material under the built layers, as the core's scene holds them
const sceneOf = built => {
  const scene = new THREE.Scene();
  built.forEach(({ L }) => rootsOf(L).forEach(r => scene.add(r)));
  return scene;
};
// the materials of a role under a root
const roleMaterials = (root, role) => {
  const out = new Set();
  root.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { if (m.userData.role === role) out.add(m); }); });
  return [...out];
};
// a material's shader once Foto has patched it, from three's chunks as placeholders
const compiled = m => {
  const sh = { uniforms: {}, vertexShader: '#include <project_vertex>', fragmentShader: '#include <map_fragment>\n#include <normal_fragment_maps>' };
  m.onBeforeCompile(sh, null);
  return sh;
};

test('Foto: start() dresses the house\'s cladding, roof, chimney, deck and timber with a detail photograph over Päris\'s own map', async () => {
  const two = loadModel('fixture-twostorey.md');
  const { built, ctx } = buildAll({ ...options, style: 'photo' }, two);
  const scene = sceneOf(built), real = buildAll({ ...options, style: 'real' }, two);
  const before = new Map(['cladding', 'roof', 'base', 'chimney'].flatMap(r => roleMaterials(scene, r)).map(m => [m, [m.map, m.color.clone()]]));
  const asked = [];
  await ctx.look.start({ load: f => (asked.push(f), load()), done() {}, scene });
  const want = { cladding: 'cladding-plain', base: 'base', chimney: 'chimney' };
  Object.entries(want).forEach(([role, key]) => {
    const ms = roleMaterials(scene, role);
    assert.ok(ms.length > 0, role);
    ms.forEach(m => assert.equal(m.userData.detail && m.userData.detail.key, key, role));
  });
  // the seam pattern on the pitched roofs, plain on the flat one
  const roofs = roleMaterials(scene, 'roof').map(m => m.userData.detail.key);
  assert.ok(roofs.includes('roof-seam') && roofs.includes('roof-plain'), roofs.join());
  before.forEach(([map, colour], m) => {
    assert.equal(m.map, map, 'Päris\'s map stays');
    assert.ok(m.color.equals(colour), 'and the model\'s colour');
  });
  // a pitched roof keeps its seams and multiplies the metal over them, normals in the high tier
  const seam = roleMaterials(scene, 'roof').find(m => m.userData.detail.key === 'roof-seam');
  const sh = compiled(seam);
  assert.ok(seam.map && sh.fragmentShader.indexOf('#include <map_fragment>') < sh.fragmentShader.indexOf('texture2D(uDetail'), sh.fragmentShader);
  assert.ok(sh.fragmentShader.includes('#define DETAIL_NORMAL') && sh.uniforms.uDetailNormal.value, 'its normal map');
  assert.ok(sh.vertexShader.includes('vDetail = vec2('), "the face's lines per vertex");
  assert.ok(['metal.ktx2', 'concrete.ktx2'].every(f => asked.includes(f)), asked.join());
  // the same model in Päris has no detail
  assert.ok(roleMaterials(sceneOf(real.built), 'roof').every(m => !m.userData.detail));
});

test('Foto: on two storeys every band\'s cladding and chimney is dressed, the bands\' own copies included', async () => {
  const two = loadModel('fixture-twostorey.md');
  const { built, ctx, byId } = buildAll({ ...options, style: 'photo' }, two);
  const scene = sceneOf(built);
  await ctx.look.start({ load, done() {}, scene });
  const bands = rootsOf(byId.building);
  assert.ok(bands.length >= 3, 'the group and two bands');
  bands.forEach((r, i) => {
    const ms = ['cladding', 'chimney'].flatMap(role => roleMaterials(r, role));
    assert.ok(ms.length > 0, `band ${i}`);
    ms.forEach(m => assert.ok(m.userData.detail, `band ${i} ${m.userData.role}`));
  });
});

test('Foto: the boarded cladding, the deck and the timber in wood, its grain along the boards, the colour the model\'s on average', async () => {
  const { built, ctx } = photo();
  const scene = sceneOf(built);
  await ctx.look.start({ load, done() {}, scene });
  const photoOf = m => DETAILS[m.userData.detail.key].map;
  ['deck', 'timber'].forEach(role => assert.ok(roleMaterials(scene, role).every(m => photoOf(m) === 'wood.ktx2'), role));
  const clad = roleMaterials(scene, 'cladding');
  assert.ok(clad.every(m => m.userData.detail.key === 'cladding-boards' && photoOf(m) === 'wood.ktx2'));
  const { uniforms, fragmentShader } = compiled(clad[0]);
  // at the fixture's 45 degrees the grain runs up the boards
  assert.ok(Math.abs(uniforms.uDetailAxis.value.x - Math.SQRT1_2) < 1e-9 && Math.abs(uniforms.uDetailAxis.value.y - Math.SQRT1_2) < 1e-9);
  // the shader divides out the photograph's mean: times its gain, the mean comes back to one
  const gain = uniforms.uDetailGain.value.toArray();
  DETAILS['cladding-boards'].mean.forEach((mean, i) => assert.ok(Math.abs(mean * gain[i] - 1) < 1e-9, `${mean} ${gain[i]}`));
  assert.ok(fragmentShader.includes('texture2D(uDetail, dUv).rgb * uDetailGain'));
  // one program for every dressed surface of a variant: the role is in the uniforms
  assert.equal(clad[0].customProgramCacheKey(), roleMaterials(scene, 'deck')[0].customProgramCacheKey());
});

test('Foto: the light tier dresses the house without normal maps', async () => {
  const { built, ctx } = photo({ quality: 'low' });
  const scene = sceneOf(built), asked = [];
  await ctx.look.start({ load: f => (asked.push(f), load()), done() {}, scene });
  assert.ok(asked.includes('wood.ktx2') && !asked.some(f => f.includes('normal')), asked.join());
  const clad = roleMaterials(scene, 'cladding');
  assert.ok(clad.length && clad.every(m => m.userData.detail && !m.userData.detail.normal));
  assert.ok(!compiled(clad[0]).fragmentShader.includes('#define DETAIL_NORMAL'));
});

test('Foto: the lawn and the sky do not wait for the house\'s photographs', async () => {
  const { built, ctx, byId } = photo();
  const scene = sceneOf(built);
  let release, done = 0, first;
  const held = new Promise(r => { release = r; }), firstDone = new Promise(r => { first = r; });
  const detail = new Set(Object.values(DETAILS).flatMap(d => [d.map, d.normal]));
  const started = ctx.look.start({ load: f => (detail.has(f) ? held.then(load) : load()), done: () => { done++; first(); }, scene });
  await firstDone;
  const lawn = byId.ground.group.children.find(o => o.geometry.type === 'ShapeGeometry').material;
  assert.equal(done, 1);
  assert.equal(lawn.map, lawn.userData.photo.map, 'the lawn is dressed');
  assert.ok(roleMaterials(scene, 'cladding').every(m => !m.userData.detail), 'the house not yet');
  release();
  await started;
  assert.equal(done, 2);
  assert.ok(roleMaterials(scene, 'cladding').every(m => m.userData.detail));
});

test('Foto: a photograph that fails leaves its surfaces as Päris draws them', async () => {
  const { built, ctx } = photo();
  const scene = sceneOf(built);
  await ctx.look.start({ load: f => (f === 'wood.ktx2' ? Promise.reject(new Error('404')) : load()), done() {}, scene });
  assert.ok(roleMaterials(scene, 'cladding').every(m => !m.userData.detail));
  assert.ok(roleMaterials(scene, 'roof').every(m => m.userData.detail));
});

test('Foto: the car in a clearcoated lacquer and reflective glass, faded like Päris\'s; Päris\'s car as it was', () => {
  const car = L => {
    const meshes = [];
    L.group.traverse(o => { if (o.isMesh) meshes.push(o); });
    return { body: meshes.find(o => o.renderOrder === 2), panes: meshes.filter(o => o.renderOrder === 3), tyres: meshes.filter(o => o.geometry.type === 'CylinderGeometry') };
  };
  const real = car(buildAll({ ...options, style: 'real' }).byId.car), { byId, ctx } = photo();
  const foto = car(byId.car);
  assert.ok(foto.body.material.isMeshPhysicalMaterial && foto.body.material.clearcoat > 0, 'the lacquer');
  assert.ok(foto.panes.every(m => m.material.roughness < 0.1 && m.material.color.getHSL({}).l < real.panes[0].material.color.getHSL({}).l), 'the glass a darker polished tint');
  assert.ok(!real.body.material.isMeshPhysicalMaterial && real.body.material.color.equals(foto.body.material.color), 'Päris keeps its paint, in the same colour');
  // the tyres are their own material in every lit style, in the car's colour
  [real, foto].forEach(c => assert.ok(c.tyres.length === 4 && c.tyres.every(t => t.material !== c.body.material && t.material.color.equals(c.body.material.color))));
  ctx.kit.applyFade(byId.car.group, 0.4);
  assert.ok(Math.abs(foto.body.material.opacity - 0.4) < 1e-9 && foto.body.material.transparent, 'the body fades');
  assert.ok(foto.panes.every(p => Math.abs(p.material.opacity - 0.6 * 0.4) < 1e-9), 'and the glass');
});
