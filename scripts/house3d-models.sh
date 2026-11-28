#!/usr/bin/env bash
# Builds Foto's models into house3d/assets (ADR-001 point 3): downloads the CC0 sources from Poly
# Haven into a fresh scratch directory, runs Blender over them (house3d_models.py reduces and
# fits the downloads, house3d_make_models.py builds the ones no CC0 model exists for) and encodes
# the maps with basisu. A laptop step like the bake: Blender is not in CI.
#   bash scripts/house3d-models.sh SCRATCH [ASSETS]
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 SCRATCH [ASSETS]" >&2
  exit 2
fi
here=$(cd "$(dirname "$0")" && pwd)
scratch=$1
assets=${2:-$here/../house3d/assets}
blender=${BLENDER:-$(command -v blender || echo /Applications/Blender.app/Contents/MacOS/Blender)}
if [ -e "$scratch" ]; then
  echo "$scratch exists: give a fresh directory" >&2
  exit 1
fi
mkdir -p "$scratch/src" "$scratch/out"

# the Poly Haven models at 1k, and the maps their 1k glTF leaves out (a cut-out's alpha: its
# colour map there is a JPEG) or a made model takes (asset:map)
MODELS="outdoor_table_chair_set_01 potted_plant_01 potted_plant_02 fern_02 ceramic_vase_02 periwinkle_plant"
MAPS="fir_tree_01:twig_diff fir_tree_01:twig_alpha fern_02:Alpha potted_plant_01:leaves_alpha potted_plant_02:leaves_alpha periwinkle_plant:opacity"
api=https://api.polyhaven.com/files
ua="khe-house3d-models"

for a in $MODELS; do
  dir="$scratch/src/$a"
  mkdir -p "$dir"
  curl -fsS -A "$ua" "$api/$a" -o "$dir/files.json"
  # the glTF and every file it includes, at their relative paths
  python3 -I - "$dir/files.json" <<'EOF' | while read -r url rel; do mkdir -p "$(dirname "$dir/$rel")"; curl -fsS -A "$ua" "$url" -o "$dir/$rel"; done
import json, posixpath, sys
g = json.load(open(sys.argv[1]))["gltf"]["1k"]["gltf"]
print(g["url"], g["url"].rsplit("/", 1)[1])
for rel, f in sorted((g.get("include") or {}).items()):
    # a path from the API stays inside the asset's directory
    if posixpath.isabs(rel) or posixpath.normpath(rel).startswith(".."):
        sys.exit(f"refused include path {rel}")
    print(f["url"], rel)
EOF
done
for m in $MAPS; do
  a=${m%%:*} map=${m#*:}
  dir="$scratch/src/$a"
  mkdir -p "$dir"
  [ -f "$dir/files.json" ] || curl -fsS -A "$ua" "$api/$a" -o "$dir/files.json"
  url=$(python3 -I -c 'import json,sys; d=json.load(open(sys.argv[1]))[sys.argv[2]]["1k"]; print((d.get("png") or d["jpg"])["url"])' "$dir/files.json" "$map")
  curl -fsS -A "$ua" "$url" -o "$dir/$map.${url##*.}"
done

"$blender" -b --factory-startup --python-exit-code 1 -P "$here/house3d_models.py" -- "$scratch/src" "$scratch/out"
"$blender" -b --factory-startup --python-exit-code 1 -P "$here/house3d_make_models.py" -- "$scratch/src" "$scratch/out"

# colour maps ETC1S (with their alpha), normal maps UASTC, as the textures (AGENTS.md)
for png in "$scratch"/out/*.png; do
  name=$(basename "$png" .png)
  case $name in
    *-normal) basisu -ktx2 -uastc -linear -normal_map -mipmap -file "$png" -output_file "$scratch/out/$name.ktx2" >/dev/null ;;
    *) basisu -ktx2 -mipmap -file "$png" -output_file "$scratch/out/$name.ktx2" >/dev/null ;;
  esac
done
cp "$scratch"/out/*.glb "$scratch"/out/*.ktx2 "$assets/"
ls -l "$scratch"/out/*.glb "$scratch"/out/*.ktx2
