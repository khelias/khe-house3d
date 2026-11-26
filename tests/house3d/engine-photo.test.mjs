// The Foto style (scene/photo.js) on the synthetic fixture: every layer builds, its leaf cards,
// the bare winter crowns, the light tier and what start() applies once its textures are in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THREE, LAYERS, options, buildAll, partsOf, autoQuality } from './engine-harness.mjs';

const photo = (o = {}) => buildAll({ ...options, style: 'photo', ...o });
const cardsOf = L => partsOf(L, 'cards');
const total = L => cardsOf(L).reduce((s, m) => s + m.count, 0);
// what start() would load, as plain textures
const load = () => Promise.resolve(new THREE.Texture());

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
  ['crown', 'hedge', 'sky', 'start', 'bare'].forEach(k => assert.equal(ctx.look[k], undefined, k));
});

test('Foto in winter: the crowns go bare, trunks and branches stay, and no caps', async () => {
  const { byId, ctx } = photo({ layers: { winter: true } });
  await ctx.look.start({ load, done() {} });
  byId.winter.setOn(true);
  assert.ok(partsOf(byId.trees, 'crown').every(m => !m.visible));
  assert.ok(cardsOf(byId.trees).every(m => !m.visible), 'no cards on bare crowns');
  assert.ok(partsOf(byId.trees, 'trunk').every(m => m.visible));
  assert.equal(partsOf(byId.trees, 'cap').length, 0);
  assert.ok(cardsOf(byId.site).every(m => !m.visible), 'the hedges shed their cards, so the snow shows');
  byId.winter.setOn(false);
  assert.ok(partsOf(byId.trees, 'crown').every(m => m.visible));
  assert.ok(cardsOf(byId.trees).every(m => m.visible), 'the cards are back in summer');
  assert.ok(cardsOf(byId.site).every(m => m.visible), 'and on the hedges');
});

test('Foto: start() puts the photographs on the lawn and the street and shows the cards', async () => {
  const { byId, ctx } = photo();
  let done = 0;
  await ctx.look.start({ load, done: () => done++ });
  assert.equal(done, 1);
  assert.ok([...cardsOf(byId.trees), ...cardsOf(byId.site)].every(m => m.visible && m.material.map));
  const lawn = byId.ground.group.children.find(o => o.material && o.material.userData.photo).material;
  assert.equal(lawn.map, lawn.userData.photo.map);
  assert.ok(lawn.normalMap);
  byId.ground.api.snow(1);
  assert.equal(lawn.map, null, 'a snowed lawn drops its photograph');
  byId.ground.api.snow(0);
  assert.equal(lawn.map, lawn.userData.photo.map);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0, 1, 2);
  const pmrem = { fromEquirectangular: t => ({ texture: t, dispose() {} }) };
  assert.equal(ctx.look.sky({ alt: 30, dir: [1, 0.5, 0], scene, pmrem }), true);
  assert.ok(scene.background && scene.environment);
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

test('Foto: the light tier has half the cards, no normal maps and no contact shadows', async () => {
  const high = photo({ quality: 'high' }), low = photo({ quality: 'low' });
  for (const id of ['trees', 'site']) {
    const h = total(high.byId[id]), l = total(low.byId[id]), n = cardsOf(low.byId[id]).length;
    assert.ok(Math.abs(l - h / 2) <= n, `${id}: ${l} of ${h}`);
  }
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
