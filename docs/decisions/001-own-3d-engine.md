# ADR-001: The 3D view is our own three.js engine over the measured house model

- **Status:** Accepted (2026-11-27)
- **Related:** [estate ADR-001](https://github.com/khelias/khe-architecture/blob/main/decisions/001-repo-per-product.md), [estate ADR-012](https://github.com/khelias/khe-architecture/blob/main/decisions/012-estate-architecture-is-public.md), [estate ADR-043](https://github.com/khelias/khe-architecture/blob/main/decisions/043-household-parts-are-public-source-built-into-khe-sites.md), [estate ADR-052](https://github.com/khelias/khe-architecture/blob/main/decisions/052-the-3d-house-engine-has-a-repo-of-its-own.md)

## Context

A model of the house, the outbuilding and the lot existed before any 3D view:
walls, openings, roofs, furniture and site read off the measured drawings,
georeferenced, kept as parametric JSON in the private house documentation
(estate ADR-012). A browser prototype drew it with three.js and the HA devices
as markers.

Two uses were wanted from it:

1. **In Home Assistant:** the house with live device states, a tap opening
   HA's own more-info dialog.
2. **Without Home Assistant:** the house and lot with no devices at all, for
   example to present the house when it is sold.

The device layer is the sensitive part: cameras with their view directions,
motion sensors, door contacts and alarm panels form a map of what is watched
and what is not. Whatever reaches a public repo or a public page must carry
none of it.

No ready-made card was weighed when this was decided. floor3d-card, the HACS
card that does 3D in HA, was compared on 2026-10-17, after the engine was
built; its assessment below is written afterwards and was not tried in
practice.

## Decision

We render the house with our own engine on three.js, built from the model's
JSON:

1. **One engine, two shells.** The engine builds the scene from model JSON
   and draws generic markers. The HA card feeds it live states and answers a
   tap with its own sheets, a camera's picture or more-info; the standalone
   viewer feeds it nothing from HA.
2. **The model is split into layers:** geometry and rooms (shareable),
   private (family room names and every device, HA only) and showcase
   (standalone only). A build reads only the layers its shell may carry and
   fails on any private string in its output.
3. **three.js is vendored**, versioned by directory, with no CDN (the view
   must work with the internet down) and no bundler (the code is served as
   static ES modules from HA's `/local`) (amended 2026-11-26). The Foto
   style's photographed surfaces and skies travel with the engine too, as
   CC0 textures in KTX2 with their sources listed beside them, decoded by
   three.js's own Basis transcoder; a consumer that does not want them
   leaves them out of its copy.
4. **The model format holds other houses too** (amended 2026-11-27). Besides
   the shed roofs of this house, a roof can be hip, gable or flat, made of
   wings: plan rectangles with one eave height and one pitch, each running
   into the next, the surface being the highest wing, which gives an L or T
   house its valleys. The viewer clips each wing's faces to where that wing
   is highest, so a fading roof shows no hidden faces; wings that only touch
   are refused, and a non-rectangular outline stays a shed roof. Storeys are
   walls, rooms, chimneys and furniture on a `level` of an ascending `levels`
   list of floor heights that holds 0: the ground storey is the index of 0, a
   negative floor is a basement inside the ground storey's rooms' box, and
   floors between make a split level. Each storey has its own cut, `ceiling`
   for the ground and an optional `ceilings` entry above its floor for the
   rest. A wall is split at its storey's cut: below, its top is the lower of
   its roof and the cut; above, it stands only where the roof is higher, so
   an attic's knee walls stand whole and its gable walls are cut. Each
   layer's lift is a stack of bands, one per storey: band i holds what is
   above storey i's cut up to storey i+1's contents, the last the top
   storey's upper part and the roofs, and showing storey k lifts the bands
   from k up; a house of one storey has its one lift as before. A piece of
   furniture's storey is its `level`, else that of the room under its
   centre with the highest floor at or below its foot. Stairs are furniture,
   `stair` (a flight climbing to its `up` edge) and `landing`, and the
   storey above leaves the stairwell out of its rooms. A room may carry a
   neutral `type` and `furnish: false`, and `showcase.level_names` names a
   storey in the picker. The ground surfaces leave the basement's pit open.
   Chimneys are blocks of their own from a level's floor to their top, cut
   into a piece per band they rise through, so a chimney is never furniture
   left standing in the air. A future
   PV item lies on a shed roof or on one face of a hip or gable roof (amended
   2026-11-26): inside one wing, on one side of its ridge, where that wing is
   the surface; its panels are laid edge to edge up the face's true slope and
   its normal for the PV figure is that face's. A flat roof takes none.
   The surroundings are stand-ins (amended 2026-11-26): ETAK gives a
   neighbour's footprint and height but no roof, so the real style gives a
   house-sized one (9 m high at most) whose footprint fills 95 % of its
   smallest enclosing rectangle a gable along that rectangle's long side,
   its ridge at the height, and leaves any other a block. LOD2 3D buildings
   (point 6) remain the source should a neighbour's real roof matter.
5. **The engine has a repo of its own** (amended 2026-11-24). It moved here
   from khe-home-assistant with the format, the validator, the viewer build
   and the made-up test houses. khe-home-assistant keeps the HA card, and it
   and khe-makett each carry a pinned, checked copy of the engine, written
   by this repo's copy script, which travels in the copy
   ([estate ADR-052](https://github.com/khelias/khe-architecture/blob/main/decisions/052-the-3d-house-engine-has-a-repo-of-its-own.md)).
6. **A house's look is model data** (amended 2026-11-27). Each style has a
   look of its own that gives its materials by role, its sky and its light:
   the simple wireframe, Päris (`real`) and Foto (`photo`), which is Päris
   with a photographed lawn, meadow past the lot, street, paving and sky
   (the paving in the model's own colour), leaf cards on the crowns and
   hedges, in winter bare branches with twig cards under an overcast sky,
   and a light tier for weaker devices. A look may dress a tree's crown and
   its bare crown, a hedge and the ground past the lot (`look.js` lists the
   hooks). A layer asks its look and
   branches only on whether the style is lit, so a new style is a new look,
   not a branch in every layer; the studio stage is Päris's in every lit
   style. The lit styles' finishes are the model's `look` in its geometry layer: colours and
   finishes of the engine's named surfaces, the cladding's pattern (plain,
   or boards at 0, 45 or 90 degrees, with a board width and groove of their
   own), the pitched roofs' profile (`roof.pattern`:
   `plain`, `seam` standing-seam metal, or `tile` roof tiles; flat roofs stay
   plain) and which trims are drawn (opening trims, corner boards, the base
   strip, a fascia under a lip of roof). The base strip is the plinth: it
   may have a height of its own above floor 0, and is drawn in the frame's
   surface unless the look names a base surface, so a look written before
   the plinth had a surface draws as it did. The casings (opening trims,
   corner boards, fascias, posts and the pergola) are likewise in the frame's surface
   unless the look names a trim surface, which lets light casings sit round
   dark frames. Without one the engine draws a
   light, matt architectural model with plain walls and no trims, so a
   house never wears another house's look. The geometry layer, not a layer
   of its own: the look is as shareable as the geometry and both shells
   need it. It follows estate ADR-043 point 2: the public engine carries a
   neutral default and a house's own values come from its model. A real
   house's finishes come from its drawings' finish list (the explanatory
   note and the facade sheets) and from Maa- ja Ruumiamet open data (the
   former Maa-amet: LOD2 3D buildings for the roof shapes, orthophotos for
   the roof colour), cited as its open-data licence asks, by the source, the
   dataset and its date. Never from Google Maps, Earth or Street View: the
   Maps Platform terms forbid building 3D models from their content.
7. **A second stage and baked contact shadows** (amended 2026-11-26). The
   real style has two stages, a mount option apart from the style: the
   garden, the lot under the sun's clock, and the studio, the house alone on
   a white base before a backdrop of one colour in soft, fixed studio light,
   like a photographed makett. Layers never see the stage; the studio builds
   only the building, the pergola and the interior, and its colours are the
   engine's, not a house's. A house's contact shadows (under the eaves, in
   window reveals, where wall meets ground) can be baked offline in Blender
   Cycles from its viewer build, per house and from the house alone, so the
   same bake is right in both stages, into a `bake.json` and a grey atlas
   the consumer keeps beside its model. The engine applies a bake only when
   every baked mesh matches the model it draws, else none with a warning; a
   bake is a laptop step, never CI or run time, and the interior keeps the
   screen-space contact shadows.

## Alternatives considered

- **floor3d-card** (`adizanni/floor3d-card`, MIT, three.js). The house is
  drawn in Sweet Home 3D and exported as OBJ or GLB; entities bind to model
  objects by `object_id` (light, hide, colour, text, door, rotate), a tap can
  open more-info, and an optional sky places the sun from `sun.sun`. Not
  chosen, judged afterwards:
  - The house would be drawn a second time in another tool, a second source
    of geometry that drifts from the measured model.
  - Removing objects and re-exporting reassigns object ids, so the bindings
    have to be redone after a model edit (its README). Our devices carry
    their own positions.
  - An exported mesh carries whatever was drawn into it; the layer split
    and the build's privacy check need the model as data.
  - It is a Lovelace card only, so use 2 would be separate work.
  - Its last release was v.1.5.3 on 2023-04-10 and its last push on
    2024-04-06, as checked on 2026-10-17.

  What it has that we lack: a graphical modelling tool, so a house without
  measured drawings can still get a model.
- **A static render or a floor-plan image card:** no live states in place,
  and no way to lift the roofs off.

## Consequences

- We maintain a few thousand lines of engine and card, and every three.js or
  HA frontend change that breaks them is ours to fix.
- The view exists only where a parametric model exists. Offering it to other
  houses, for example as a HACS card, first needs a way to author that model
  without measured drawings, translations and the Estonia-specific parts
  made optional.
- The public demo can be built from a made-up house in the same model
  format, so the engine is shown without any of the real house.
