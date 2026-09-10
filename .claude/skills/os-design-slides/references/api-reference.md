# API — complete reference

You have a budget per turn — keep calls efficient. This list is exhaustive: don't read route files, these are the only endpoints. Replace `{ID}` with the content item id, `{SLIDE_ID}` / `{ELEMENT_ID}` / `{ASSET_ID}` / `{IMAGE_ID}` / `{COMPONENT_ID}` as needed.

**Token-efficiency rule** — for edits to existing slides, prefer GRANULAR endpoints (patch/add/delete one element, replace just the background). Only use PUT on a whole slide when you're rewriting most of it. Every granular call snapshots the slide so `/undo` still works.

## Read state

```bash
# Full content item with all slides — your only way to read slide JSON
curl -s http://localhost:3000/api/content/{ID}
```

## Create a slide (POST appends a new slide)

```bash
curl -s -X POST http://localhost:3000/api/content/{ID}/slides \
  -H "Content-Type: application/json" \
  -d '{
    "background": { "kind": "gradient", "angle": 135, "stops": [{ "offset": 0, "color": "#2fd9b0" }, { "offset": 1, "color": "#00c4ee" }] },
    "elements": [
      { "id": "hook", "kind": "container", "position": { "x": 90, "y": 240 }, "size": { "w": 900, "h": 320 },
        "htmlContent": "<h1>Hook que detiene el scroll</h1>",
        "scssStyles": "display: flex; align-items: center; & h1 { font-family: Inter, sans-serif; font-size: 84px; font-weight: 800; color: #fff; line-height: 1; margin: 0; }" }
    ],
    "notes": "Slide 1 - hook"
  }'
```

## Granular edits — PREFERRED for small changes

**Patch one element** (only the fields you want to change — common: position, size, scssStyles, htmlContent, src, opacity, hidden, rotation). For container elements that came from a component you can also patch `parameters` and `parameterTypes` to change interpolated values. `htmlContent` only valid for kind=container; `src` only for kind=image.

```bash
curl -s -X PATCH http://localhost:3000/api/content/{ID}/slides/{SLIDE_ID}/elements/{ELEMENT_ID} \
  -H "Content-Type: application/json" \
  -d '{ "scssStyles": "& h1 { font-size: 96px; }" }'
```

**Add one element** to a slide (id is auto-generated if you omit it):

```bash
curl -s -X POST http://localhost:3000/api/content/{ID}/slides/{SLIDE_ID}/elements \
  -H "Content-Type: application/json" \
  -d '{ "kind": "container", "position": { "x": 80, "y": 600 }, "size": { "w": 920, "h": 120 },
        "htmlContent": "<span class=\"ico\">school</span>",
        "scssStyles": "& .ico { font-family: Material Symbols Rounded; font-size: 64px; }" }'
```

**Delete one element**:

```bash
curl -s -X DELETE http://localhost:3000/api/content/{ID}/slides/{SLIDE_ID}/elements/{ELEMENT_ID}
```

**Replace just the background** (slide elements untouched):

```bash
curl -s -X PUT http://localhost:3000/api/content/{ID}/slides/{SLIDE_ID}/background \
  -H "Content-Type: application/json" \
  -d '{ "kind": "solid", "color": "#0a0a0a" }'
```

## Replace an entire slide (use when rewriting most of it)

PUT replaces the slide. Send the full `{ background, elements, notes? }` payload — partial fields will overwrite to undefined.

```bash
curl -s -X PUT http://localhost:3000/api/content/{ID}/slides/{SLIDE_ID} \
  -H "Content-Type: application/json" \
  -d '{ "background": {...}, "elements": [...] }'
```

## Bulk edits across many slides (single python3 process)

When the same change applies to many elements/slides, batch the granular calls in one python3 invocation to avoid per-curl subprocess cost:

```bash
python3 <<'PY'
import json, urllib.request
ID = "{ID}"
BASE = f"http://localhost:3000/api/content/{ID}"

item = json.loads(urllib.request.urlopen(BASE).read())

def patch_element(slide_id, element_id, patch):
    req = urllib.request.Request(
        f"{BASE}/slides/{slide_id}/elements/{element_id}",
        data=json.dumps(patch).encode(),
        headers={"Content-Type": "application/json"},
        method="PATCH",
    )
    urllib.request.urlopen(req).read()

# Example: bump every body-text scssStyles font-size by inspecting current value
for slide in item["slides"]:
    for el in slide["elements"]:
        if el["kind"] == "container" and "font-size: 24px" in el.get("scssStyles", ""):
            patch_element(slide["id"], el["id"], {
                "scssStyles": el["scssStyles"].replace("font-size: 24px", "font-size: 32px")
            })
PY
```

## Delete / undo / reorder

```bash
curl -s -X DELETE http://localhost:3000/api/content/{ID}/slides/{SLIDE_ID}
curl -s -X POST http://localhost:3000/api/content/{ID}/slides/{SLIDE_ID}/undo
curl -s -X PUT http://localhost:3000/api/content/{ID}/slides \
  -H "Content-Type: application/json" -d '{ "slideIds": ["id1", "id2"] }'
```

## Save caption + hashtags (PATCH on the content item itself)

There is NO /caption endpoint. Use PATCH on the content item:

```bash
curl -s -X PATCH http://localhost:3000/api/content/{ID} \
  -H "Content-Type: application/json" \
  -d '{ "caption": "Your caption text...", "hashtags": ["tag1", "tag2"] }'
```

## Style presets

```bash
curl -s -X POST http://localhost:3000/api/style-presets \
  -H "Content-Type: application/json" \
  -d '{"name": "Style Name", "designRules": "...", "aspectRatio": "4:5"}'
```

## Assets (images attached to this content item)

```bash
curl -s http://localhost:3000/api/content/{ID}/assets
curl -s -X POST http://localhost:3000/api/content/{ID}/assets -H "Content-Type: application/json" -d '{"url": "/uploads/photo.jpg", "name": "Team photo"}'
curl -s -X PATCH http://localhost:3000/api/content/{ID}/assets/{ASSET_ID} -H "Content-Type: application/json" -d '{"name": "New name"}'
curl -s -X DELETE http://localhost:3000/api/content/{ID}/assets/{ASSET_ID}
```

## Reference images (style references the AI studies)

```bash
curl -s http://localhost:3000/api/content/{ID}/references
curl -s -X POST http://localhost:3000/api/content/{ID}/references -H "Content-Type: application/json" -d '{"url": "/uploads/ref.jpg", "name": "Style reference"}'
curl -s -X DELETE "http://localhost:3000/api/content/{ID}/references?imageId={IMAGE_ID}"
```

## Components (reusable container library)

```bash
# List is loaded in Step 0 via GET /api/components

# Save a container element as a component
curl -X POST http://localhost:3000/api/components/from-element \
  -H 'Content-Type: application/json' \
  -d '{"contentItemId":"{ID}","slideId":"{SLIDE_ID}","elementId":"{ELEMENT_ID}","name":"<name>","description":"<optional>","tags":["optional"]}'

# Fetch a single component
curl -s http://localhost:3000/api/components/{COMPONENT_ID}
```

### Inserting a component into a slide

1. Fetch the component (above). From the component JSON, copy: `htmlContent`, `scssStyles`, `size` ({ width, height }), `parameters` (object with one key per `parametersSchema` entry, value = entry.defaultValue or "" ), `parameterTypes` (one key per entry, value = entry.type).
2. POST a container element built from it. Set `position` to where the user asked (e.g. "parte superior" → small `y`, like `{ "x": 80, "y": 80 }`):

```bash
curl -s -X POST http://localhost:3000/api/content/{ID}/slides/{SLIDE_ID}/elements \
  -H "Content-Type: application/json" \
  -d '{"kind":"container","position":{"x":80,"y":80},"size":{...},"htmlContent":"...","scssStyles":"...","parameters":{...},"parameterTypes":{...}}'
```

The POST response includes the new element's auto-generated `id` — keep it; you need it to edit the copy afterward. To place the same component on multiple slides, POST once per slide; each becomes an INDEPENDENT copy with its own element id.

### Editing an inserted component

Once inserted, a component is just a normal container element — edit it with the granular element PATCH. Pick the field that matches the change:
- **A value that IS a parameter** (listed in the component's `parametersSchema`) → PATCH `parameters` with the changed keys, e.g. `{ "parameters": { "title": "Nuevo texto", "textColor": "#ffffff" } }`. Parameter values interpolate as `{{key}}` at render time.
- **Appearance that is NOT a parameter** (e.g. "su texto en blanco" but there's no color parameter) → the color lives in `scssStyles`. PATCH replaces `scssStyles` wholesale (no merge), so first read the current value from `GET /api/content/{ID}`, modify the relevant rule, and PATCH the full updated `scssStyles` string back.
- **Position / size** → PATCH `position` and/or `size`.

When the same component is on several slides and the user asks to restyle "it", apply the same PATCH to EACH copy's element id.

### Notes about components
- Parameter values interpolate as `{{key}}` in `htmlContent` and `scssStyles` at render time.
- If a `{{key}}` has no value in `parameters`, it appears literally in the preview. Resolve all keys to non-empty values before inserting unless intentional.
- The container is a snapshot — editing the master does NOT update inserted copies, and vice versa.
