# House 3D test fixture: a basement, a ground storey and an attic storey

A made-up house for the storeys seen from inside (`scripts/house3d_model.py`): nothing here
describes a real place. A 10 x 8 m house under a gable roof with its ridge along the street (x),
a basement under its west part, and an attic storey under the roof: its walls on the street and
garden sides are knee walls of about 1.2 m that stand whole under the roof, and its gable walls
and the wall between its two rooms are cut at the attic's own ceiling. A straight flight climbs
from the basement to the ground storey, and an L stair, two flights and a landing, from the hall
to the attic; the storeys above leave the stairwells out of their rooms. The rooms carry types,
the basement a mirror, the attic a table whose legs stand on its floor, and the picker names the
attic.

```json house3d:geometry
{
 "units": "m",
 "axes": "x along the street, z away from the street, y up",
 "ceiling": 2.6,
 "levels": [-2.6, 0, 2.9],
 "ceilings": [2.3, 2.6, 2.4],
 "roofs": {
  "main": { "kind": "gable", "rects": [[-0.5, -0.5, 10.5, 8.5]], "ridge": "x", "eave_y": 3.7, "pitch_deg": 40, "thick": 0.25 }
 },
 "walls": [
  { "a": [0, 0], "b": [6, 0], "t": 0.4, "top": 0, "level": 0 },
  { "a": [6, 0], "b": [6, 8], "t": 0.4, "top": 0, "level": 0 },
  { "a": [6, 8], "b": [0, 8], "t": 0.4, "top": 0, "level": 0 },
  { "a": [0, 8], "b": [0, 0], "t": 0.4, "top": 0, "level": 0 },
  { "a": [0, 4], "b": [4.6, 4], "t": 0.15, "top": 0, "level": 0, "openings": [
   { "kind": "door", "c": 3.6, "w": 0.8, "h": 2 }
  ] },

  { "a": [0, 0], "b": [10, 0], "t": 0.4, "top": 2.9, "openings": [
   { "kind": "window", "c": 2.2, "w": 1.6, "h": 1.3, "sill": 0.8 },
   { "kind": "door", "c": 7.8, "w": 1, "h": 2.1, "finish": "cladding" }
  ] },
  { "a": [10, 0], "b": [10, 8], "t": 0.4, "top": 2.9, "openings": [
   { "kind": "window", "c": 6, "w": 1, "h": 1.2, "sill": 0.9 }
  ] },
  { "a": [10, 8], "b": [0, 8], "t": 0.4, "top": 2.9, "openings": [
   { "kind": "glassdoor", "c": 7, "w": 1.8, "h": 2.1 },
   { "kind": "window", "c": 2, "w": 1.6, "h": 1.3, "sill": 0.8 }
  ] },
  { "a": [0, 8], "b": [0, 0], "t": 0.4, "top": 2.9, "openings": [
   { "kind": "window", "c": 4, "w": 1.6, "h": 1.3, "sill": 0.8 }
  ] },
  { "a": [6, 0], "b": [6, 8], "t": 0.15, "top": 2.6, "openings": [
   { "kind": "door", "c": 3.5, "w": 0.9, "h": 2.1 }
  ] },
  { "a": [6, 4], "b": [10, 4], "t": 0.15, "top": 2.6, "openings": [
   { "kind": "door", "c": 1, "w": 0.8, "h": 2.1 }
  ] },

  { "a": [0, 0], "b": [10, 0], "t": 0.4, "top": "main", "level": 2 },
  { "a": [10, 0], "b": [10, 8], "t": 0.4, "top": "main", "level": 2, "openings": [
   { "kind": "window", "c": 4, "w": 1.2, "h": 1.2, "sill": 0.9 }
  ] },
  { "a": [10, 8], "b": [0, 8], "t": 0.4, "top": "main", "level": 2 },
  { "a": [0, 8], "b": [0, 0], "t": 0.4, "top": "main", "level": 2, "openings": [
   { "kind": "window", "c": 4, "w": 1.2, "h": 1.2, "sill": 0.9 }
  ] },
  { "a": [5, 0], "b": [5, 8], "t": 0.15, "top": "main", "level": 2, "openings": [
   { "kind": "door", "c": 5.5, "w": 0.8, "h": 2 }
  ] }
 ],
 "furniture": [
  { "kind": "stair", "rect": [4.8, 0.2, 5.8, 3.6], "y": [-2.6, 0], "up": "z1" },
  { "kind": "appliance", "rect": [0.3, 0.3, 0.9, 0.95], "y": [-2.6, -0.85] },
  { "kind": "mirror", "rect": [1.2, 0.22, 2, 0.27], "y": [-1.2, -0.5] },
  { "kind": "bench", "rect": [0.3, 7, 3.2, 7.8], "y": [-2.6, -1.7] },
  { "kind": "stove", "rect": [4.6, 4.4, 5.1, 4.9], "y": [-2.6, -1.65] },

  { "kind": "sofa", "rect": [0.3, 5.2, 2.5, 6.2], "y": [0, 0.8], "back": ["x0"] },
  { "kind": "table", "rect": [1, 1, 2.8, 2], "y": [0, 0.75] },
  { "kind": "bath", "rect": [6.2, 6.2, 7.9, 7.8], "y": [0, 0.55] },
  { "kind": "toilet", "rect": [9.3, 7.2, 9.7, 7.8], "y": [0.2, 1.1] },
  { "kind": "stair", "rect": [8.9, 0.2, 9.9, 2.4], "y": [0, 1.45], "up": "z1" },
  { "kind": "landing", "rect": [8.9, 2.4, 9.9, 3.4], "y": [1.25, 1.45] },
  { "kind": "stair", "rect": [6.6, 2.4, 8.9, 3.4], "y": [1.45, 2.9], "up": "x0" },

  { "kind": "bed", "rect": [1, 2, 2.6, 4], "y": [2.9, 3.4] },
  { "kind": "table", "rect": [2, 6, 3.5, 7], "y": [2.9, 3.65] },
  { "kind": "desk", "rect": [7, 5, 8.4, 5.7], "y": [2.9, 3.65] }
 ],
 "site": {
  "lot": [[-8, -8], [20, -8], [20, 18], [-8, 18]]
 }
}
```

```json house3d:rooms
{
 "rooms": [
  { "id": "utility", "name": "Tehnoruum", "type": "utility", "level": 0, "rects": [[0, 0, 4.6, 4]] },
  { "id": "sauna", "name": "Saun", "type": "sauna", "level": 0, "rects": [[0, 4, 6, 8]], "floor": "tile" },
  { "id": "living", "name": "Köök-elutuba", "type": "kitchen_living", "rects": [[0, 0, 4.6, 8], [4.6, 4, 6, 8]] },
  { "id": "hall", "name": "Esik", "type": "hall", "rects": [[6, 0, 8.9, 2.4], [6, 3.4, 10, 4]] },
  { "id": "bath", "name": "Vannituba", "type": "bathroom", "rects": [[6, 4, 10, 8]], "floor": "tile" },
  { "id": "bedroom", "name": "Magamistuba", "type": "bedroom", "level": 2, "rects": [[0, 0, 5, 8]] },
  { "id": "kids", "name": "Lastetuba", "type": "kids", "level": 2, "rects": [[5, 3.4, 10, 8], [5, 0, 6.6, 3.4]], "furnish": false }
 ]
}
```

```json house3d:private
{
 "devices": []
}
```

```json house3d:showcase
{
 "showcase": {
  "title": "Keldri ja katusealusega testmaja",
  "intro": "Väljamõeldud maja korruste testimiseks.",
  "rooms": {},
  "features": [],
  "level_names": { "2": "Katusealune" }
 }
}
```
