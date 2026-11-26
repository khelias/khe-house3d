// The bake's input, written for scripts/house3d_bake.py (scripts/house3d-bake.sh runs both): the
// meshes the engine bakes (house3d/scene/bake.js bakeTargets() over the real style's building and
// pergola, built through the engine tests' harness, so the keys are the ones the tests pin) as
// world-space triangles under their key, the other opaque meshes of the two layers as occluders,
// and a ground plane at the house's floor. Nothing outside the house occludes, so the same bake is
// right in the garden and in the studio.
//
// Usage: node scripts/house3d-bake-export.mjs MODEL_JSON OUT_JSON  (MODEL_JSON a viewer build's)
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { THREE, E, buildAll, homeBox } from '../tests/house3d/engine-harness.mjs';

const { BAKE_LAYERS, BAKE_FORMAT, bakeTargets, bakeCount, bakeRoots, materialsOf, opaque } = await import(new URL('scene/bake.js', E));

// the ground plane reaches this far past the house's box, in metres
const GROUND_MARGIN = 20;
const r4 = v => Math.round(v * 1e4) / 1e4;

// a mesh's triangles in world space as [x, y, z, ...], three vertices each, in non-indexed order
function triangles(mesh, matrix = mesh.matrixWorld) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry, p = g.attributes.position, v = new THREE.Vector3(), out = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(matrix);
    out.push(r4(v.x), r4(v.y), r4(v.z));
  }
  return out;
}

/** bakeExport(model) -> { format, targets: [{ key, count, v }], occluders: [{ v }], ground: { y, rect } } */
export function bakeExport(model) {
  const { built } = buildAll({ style: 'real' }, model);
  const layers = built.map(b => b.L);
  const targets = bakeTargets(layers);
  const isTarget = new Set(targets.map(t => t.mesh));
  const occluders = [];
  layers.filter(L => BAKE_LAYERS.includes(L.id)).forEach(L => bakeRoots(L).forEach(root => {
    root.updateMatrixWorld(true);
    root.traverseVisible(o => {
      if (!o.isMesh || isTarget.has(o) || !o.geometry || !o.geometry.attributes.position) return;
      if (!materialsOf(o).every(opaque)) return;
      if (!o.isInstancedMesh) return occluders.push({ v: triangles(o) });
      const m = new THREE.Matrix4();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        occluders.push({ v: triangles(o, m.premultiply(o.matrixWorld)) });
      }
    });
  }));
  const [x0, z0, x1, z1] = homeBox(model);
  return {
    format: BAKE_FORMAT,
    targets: targets.map(({ key, mesh }) => ({ key, count: bakeCount(mesh.geometry), v: triangles(mesh) })),
    occluders,
    ground: { y: (model.levels || [0])[0] || 0, rect: [x0 - GROUND_MARGIN, z0 - GROUND_MARGIN, x1 + GROUND_MARGIN, z1 + GROUND_MARGIN] }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) {
    console.error('usage: node scripts/house3d-bake-export.mjs MODEL_JSON OUT_JSON');
    process.exit(2);
  }
  const data = bakeExport(JSON.parse(readFileSync(src, 'utf-8')));
  writeFileSync(out, JSON.stringify(data));
  console.log(`bake export: ${data.targets.length} targets, ${data.occluders.length} occluders`);
}
