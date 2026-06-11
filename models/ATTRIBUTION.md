# Model Attribution — REQUIRED

The bundled models —
`z-anatomy-skeleton.glb`, `z-anatomy-muscular.glb`, `z-anatomy-cardiovascular.glb`,
`z-anatomy-nervous.glb`, and `z-anatomy-visceral.glb` — are derived from
**Z‑Anatomy**, exported by system collection from the Z‑Anatomy Blender template to
glTF/GLB.

You must keep this attribution wherever the model — or a build that includes it —
is distributed:

> 3D skeletal model derived from **Z‑Anatomy** (The libre 3D atlas of anatomy) —
> licensed **CC‑BY‑SA 4.0** — itself derived from **BodyParts3D** © The Database
> Center for Life Science (DBCLS) — **CC‑BY‑SA 2.1 Japan**.
> Z‑Anatomy: https://github.com/Z-Anatomy/Models-of-human-anatomy

## License obligations (CC‑BY‑SA 4.0)

- **Attribution** — credit as above.
- **ShareAlike** — anything you distribute that includes this model must be
  released under the same CC‑BY‑SA 4.0 license.

## ⚠️ Non‑commercial caveat — applies to the bundled organs/nerves

Z‑Anatomy includes a few parts under stricter **non‑commercial** licenses — the
**kidney** (CC‑BY‑NC) and the **inner‑ear** detail (CC‑BY‑NC‑SA). These are NOT in
the skeleton/muscular/cardiovascular exports, but they MAY be present in
`z-anatomy-visceral.glb` (kidney) and `z-anatomy-nervous.glb` (inner ear).

So: the full bundle is fine for **personal / educational** use, but it is **not
fully commercial‑safe** as‑is. Before any commercial use, remove the kidney and
inner‑ear meshes (or re‑export those systems without them).

## How this GLB was produced (reproducible)

Headless Blender export of the `1: Skeletal system` collection, with clean
display name / region / side baked into each mesh as glTF `extras`:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  "Z-Anatomy/Startup.blend" --python export_skeleton.py
```

The export script selects the collection's mesh objects, writes
`displayName` / `anatKey` / `anatRegion` / `anatSide` custom properties on each,
and exports `export_format='GLB', use_selection=True, export_yup=True,
export_apply=True, export_extras=True`. To add another system (muscular,
cardiovascular, nervous…), point the script at that collection name and export a
separate GLB.
