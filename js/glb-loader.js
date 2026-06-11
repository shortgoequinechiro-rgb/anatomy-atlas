/* =====================================================================
   Human Anatomy Atlas — GLB Drop-in Loader  (model-driven catalog)
   ---------------------------------------------------------------------
   Loads a real, open-licensed anatomy GLB (e.g. a system exported from
   Z-Anatomy) and builds a catalog FROM THE MODEL'S OWN node names, so
   every part becomes a first-class, selectable, searchable structure —
   labeled with its real anatomical name and grouped into regions.

   Returns the same shape the rest of the app consumes, PLUS a
   model-derived catalog that mirrors window.ANATOMY:

     {
       group, meshesByStructure, allMeshes,
       catalog: { systems:[...], index:{...} },   // model-driven
       stats:   { nodes, structures, regions }
     }

   Z-Anatomy naming convention handled here:
     "Femur.l" / "Femur.r"      -> Femur (left / right)   [paired -> 1 entry, 2 meshes]
     "(Adductor minimus).l"     -> Adductor minimus       [strips wrapping parens]
     "...of foot.j"             -> joint suffix stripped
   Left/right pairs collapse into ONE structure carrying both meshes.
   ===================================================================== */

window.AnatomyGLB = (function () {
  // ---- name parsing ----------------------------------------------------
  // three.js GLTFLoader sanitizes names: dots/spaces become underscores and
  // duplicate names get a numeric "_1", "_2" suffix. So "Femur.l"/"Femur.r"
  // arrive as "Femur"/"Femur_1", and "Fifth metatarsal bone.l" as
  // "Fifth_metatarsal_bone". We undo that to recover a clean display name and
  // collapse left/right + multi-primitive duplicates into one structure.
  function parseName(raw) {
    let s = (raw || "").trim();
    s = s.replace(/_(\d+)$/, ""); // drop GLTF duplicate index (also merges L/R)
    s = s.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim(); // _ / . -> space
    s = s.replace(/^\(+/, "").replace(/\)+$/, "").trim(); // strip wrapping parens
    let side = "";
    const m = s.match(/\s(l|r)$/i); // any surviving trailing side token
    if (m) {
      side = m[1].toLowerCase() === "l" ? "left" : "right";
      s = s.slice(0, m.index).trim();
    }
    if (!s) s = (raw || "").trim();
    const display = s.charAt(0).toUpperCase() + s.slice(1);
    return { display, side, key: display.toLowerCase() };
  }

  // ---- region inference (keyword based; works well for the skeleton) ---
  // One unified region classifier covering bones, muscles, nerves, vessels and
  // organs, so every system groups consistently and few items fall into "Other".
  // Ordered — first match wins.
  const REGION_RULES = [
    ["Head & Neck", /(crani|skull|frontal bone|parietal|temporal bone|occipital|sphenoid|ethmoid|maxilla|mandib|nasal|zygomat|palatine|vomer|lacrimal|hyoid|concha|tooth|teeth|incisor|canine|molar|premolar|orbit|petrous|mastoid|sella|cribriform|ossicle|incus|malleus|stapes|cochle|tympan|auditory|eyelid|eyeball|ocul|optic|retina|cornea|sclera|conjunctiv|lens of|tongue|lingu|laryn|pharyn|epiglott|cricoid|arytenoid|thyroid cartilage|trachea|parotid|submandibular|sublingual|salivary|masseter|temporalis|pterygoid|buccinator|orbicularis|zygomaticus|risorius|mentalis|platysma|sternocleidomastoid|scalene|digastric|mylohyoid|geniohyoid|omohyoid|sternohyoid|sternothyroid|thyrohyoid|longus capitis|longus colli|splenius|\bneck\b|facial|olfactory|trochlear|trigeminal|abducens|vestibulocochlear|glossopharyngeal|\bvagus|accessory nerve|hypoglossal|cranial nerve|brain|cerebr|cerebell|\bpons\b|medulla oblong|thalam|hypothalam|pituit|pineal|fornix|corpus callosum|meninge|dura mater|pia mater|arachnoid|carotid|jugular|basilar)/i],
    ["Spine & Back", /(vertebra|atlas|axis|intervertebral|sacrum|sacral|coccy|spinal cord|spinal nerve|spinal|erector|iliocostalis|longissimus|spinalis|multifidus|rotatores|interspinal|intertransvers|semispinalis|latissimus|trapezius|rhomboid|levator scapulae|serratus posterior|quadratus lumborum|\bdorsal)/i],
    ["Thorax", /(\brib\b|costal|sternum|manubri|xiphoid|thoracic cage|intercostal|pectoral|subclavius|diaphragm|heart|cardiac|atri|ventricl|aorta|aortic|pulmon|vena cava|coronary|myocard|pericard|lung|bronch|pleura|mediastin|azygos|thoracic duct|esophagus|oesophagus|mammary|subclavian|brachiocephalic)/i],
    ["Abdomen & Pelvis", /(abdom|rectus abdominis|external oblique|internal oblique|transvers abdomin|pyramidalis|inguinal|stomach|gastr|hepat|liver|gallbladder|\bbile|cystic|intestin|duoden|jejun|ileum|colon|caec|cecum|rectum|anal|append|kidney|renal|ureter|bladder|urethra|spleen|splenic|pancrea|adrenal|suprarenal|portal|mesenter|omentum|peritone|psoas|iliacus|iliac|gluteus|glute|piriformis|obturator|levator ani|coccygeus|pelvi|ilium|ischium|pubis|pubic|hip bone|acetabul|sacro|prostate|uter|ovar|testis|testicular|deferens|seminal|vagina|perineum|pudendal)/i],
    ["Upper Limb", /(clavicl|scapul|humerus|radius|ulna|carp|metacarp|scaphoid|lunate|triquetr|pisiform|trapezium|trapezoid|capitate|hamate|finger of hand|phalanx.*hand|\bhand\b|wrist|deltoid|biceps brachii|triceps brachii|brachialis|brachioradialis|coracobrachialis|supraspinatus|infraspinatus|teres (major|minor)|subscapularis|pronator|supinator|flexor (carpi|digitorum|pollicis)|extensor (carpi|digitorum|pollicis|indicis)|abductor pollicis|adductor pollicis|opponens|lumbrical.*hand|interosse.*hand|thenar|hypothenar|palmar|axillary|brachial|cephalic|basilic|radial|ulnar|median nerve|musculocutaneous)/i],
    ["Lower Limb", /(femur|patella|tibia|fibula|tarsal|metatars|calcaneus|talus|cuboid|navicular|cuneiform|sesamoid|finger of foot|phalanx.*foot|\bfoot\b|ankle|\bknee|thigh|\bleg\b|quadricep|rectus femoris|vastus|sartorius|gracilis|pectineus|adductor (longus|brevis|magnus|minimus)|hamstring|biceps femoris|semitendinosus|semimembranosus|tensor fasciae|gastrocnem|soleus|plantaris|popliteus|tibialis|peroneus|fibular|flexor (hallucis|digitorum)|extensor (hallucis|digitorum)|abductor hallucis|femoral|saphenous|popliteal|sciatic|tibial nerve|peroneal|sural|plantar|genicular|dorsalis pedis)/i],
  ];
  function regionFor(display) {
    for (const [name, re] of REGION_RULES) if (re.test(display)) return name;
    return "Other Structures";
  }

  // ---- catalog assembly ------------------------------------------------
  function buildCatalog(structMap, systemId, systemName, systemColor) {
    // group structures by region
    const regionsMap = {};
    Object.values(structMap).forEach((st) => {
      (regionsMap[st.regionName] = regionsMap[st.regionName] || []).push(st);
    });
    // stable region order: follow REGION_RULES order, then Other
    const order = REGION_RULES.map((r) => r[0]).concat(["Other Structures"]);
    const regions = order
      .filter((rn) => regionsMap[rn])
      .map((rn) => ({
        id: "reg-" + rn.toLowerCase().replace(/[^a-z]+/g, "-"),
        name: rn,
        structures: regionsMap[rn].sort((a, b) => a.name.localeCompare(b.name)),
      }));

    const systems = [
      { id: systemId, name: systemName, color: systemColor, regions },
    ];
    const index = {};
    Object.values(structMap).forEach((st) => (index[st.id] = st));
    return { systems, index };
  }

  /**
   * @param {string} url   path/URL to the .glb
   * @param {object} opts  { systemName, systemColor, onProgress }
   */
  function load(url, opts = {}) {
    const systemId = opts.systemId || "model-sys";
    const systemName = opts.systemName || "Loaded Model";
    const systemColor = opts.systemColor != null ? opts.systemColor : 0xeae2d0;
    const systemOpacity = opts.systemOpacity != null ? opts.systemOpacity : 1;

    return new Promise((resolve, reject) => {
      if (typeof THREE.GLTFLoader !== "function") {
        reject(new Error("GLTFLoader not available — check the script include."));
        return;
      }
      const loader = new THREE.GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          const root = gltf.scene || gltf.scenes[0];
          const meshesByStructure = {};
          const allMeshes = [];
          const structMap = {}; // structureId -> structure entry

          root.traverse((node) => {
            if (!node.isMesh) return;
            const rawName = node.name || (node.parent && node.parent.name) || "mesh";

            // Prefer clean metadata baked into the GLB (displayName/anatKey/
            // anatRegion/anatSide live on the node's extras → userData). For
            // multi-primitive nodes the extras sit on the parent group.
            const ud = node.userData || {};
            const pud = (node.parent && node.parent.userData) || {};
            const meta = ud.anatKey ? ud : pud.anatKey ? pud : null;
            let display, key, side, regionName;
            if (meta) {
              display = meta.displayName || String(meta.anatKey);
              key = String(meta.anatKey).toLowerCase();
              side = meta.anatSide || "";
            } else {
              const p = parseName(rawName);
              display = p.display; key = p.key; side = p.side;
            }
            // Always classify with the unified rules (consistent across systems).
            regionName = regionFor(display);
            const sid = "m:" + systemId + ":" + key; // namespaced so systems never collide

            if (!structMap[sid]) {
              structMap[sid] = {
                id: sid,
                key: key,
                name: display,
                latin: "",
                description:
                  "From the loaded model (" + systemName + "). Region: " + regionName + ".",
                sides: new Set(),
                systemId: systemId,
                systemName: systemName,
                systemColor: systemColor,
                systemOpacity: systemOpacity,
                regionId: regionName,
                regionName: regionName,
              };
            }
            if (side) structMap[sid].sides.add(side);

            // Clone the material so each mesh can be highlighted independently
            // (Z-Anatomy often shares one material across many bones), then give
            // the bones a consistent ivory tone with real shading depth.
            if (Array.isArray(node.material)) node.material = node.material.map((m) => (m ? m.clone() : m));
            else if (node.material) node.material = node.material.clone();
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach((mat) => {
              if (!mat) return;
              if (mat.color) mat.color.setHex(systemColor);
              if ("roughness" in mat) mat.roughness = 0.72;
              if ("metalness" in mat) mat.metalness = 0.0;
              if (mat.emissive) mat.emissive.setHex(0x000000);
              if (systemOpacity < 1) {
                mat.transparent = true;
                mat.opacity = systemOpacity;
                mat.depthWrite = false;
              }
            });

            node.userData.structureId = sid;
            node.userData.systemId = systemId;
            node.userData.modelName = rawName;
            node.userData.material = node.material;
            node.userData.baseOpacity = systemOpacity; // for X-ray
            allMeshes.push(node);
            (meshesByStructure[sid] = meshesByStructure[sid] || []).push(node);
          });

          // finalize side info into description / name suffix
          Object.values(structMap).forEach((st) => {
            const sides = Array.from(st.sides);
            if (sides.length === 2) st.description += " Present bilaterally (left & right).";
            else if (sides.length === 1)
              st.description += " (" + sides[0] + " side present in this view).";
            delete st.sides;
          });

          // Fit a single model to ~1.8 units tall, centered. For multi-system
          // overlays pass opts.fit === false and let the caller fit the COMBINED
          // group once, so every system stays in its shared native alignment.
          const group = new THREE.Group();
          if (opts.fit === false) {
            group.add(root); // native coordinates — caller aligns the whole set
          } else {
            const box = new THREE.Box3().setFromObject(root);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);
            const scale = size.y > 0 ? 1.8 / size.y : 1;
            root.position.sub(center);
            root.updateMatrixWorld(true);
            group.add(root);
            group.scale.setScalar(scale);
          }

          const catalog = buildCatalog(structMap, systemId, systemName, systemColor);
          resolve({
            group,
            meshesByStructure,
            allMeshes,
            catalog,
            stats: {
              nodes: allMeshes.length,
              structures: Object.keys(structMap).length,
              regions: catalog.systems[0].regions.length,
            },
          });
        },
        (xhr) => {
          if (opts.onProgress && xhr.total) opts.onProgress(xhr.loaded / xhr.total);
        },
        (err) => reject(err)
      );
    });
  }

  return { load, parseName, regionFor };
})();
