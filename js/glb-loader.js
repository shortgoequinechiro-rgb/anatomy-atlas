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
    // Connective tissue first: fasciae, septa, retinacula, tendon sheaths,
    // aponeuroses, bursae, ligaments, tracts — grouped together so the muscle
    // lists stay clean (the muscle TENSOR FASCIAE LATAE is excluded in regionFor).
    ["Connective tissue", /(\bfascia\b|fasciae|aponeuros|retinacul|bursae?|\btendon\b|tendinous ring|intermuscular septum|\bseptum\b|linea alba|iliotibial|\btract\b|\braphe\b|\bsheath\b|fibrous sheath|cruciform part|suspensory ligament|\bligament\b|iliopectineal arch|tendinous inscription)/i],
    ["Head & Neck", /(crani|skull|frontal bone|parietal|temporal bone|occipital|sphenoid|ethmoid|maxilla|mandib|nasal|zygomat|palatine|vomer|lacrimal|hyoid|concha|tooth|teeth|incisor|canine|molar|premolar|orbit|petrous|mastoid|sella|cribriform|ossicle|incus|malleus|stapes|cochle|tympan|auditory|eyelid|eyeball|ocul|optic|retina|cornea|sclera|\biris\b|conjunctiv|lens|\btarsus\b|tongue|lingu|laryn|pharyn|epiglott|cricoid|cricothyroid|arytenoid|thyroid cartilage|trachea|parotid|submandibular|sublingual|salivary|masseter|temporalis|pterygoid|buccinator|bucinator|orbicularis|zygomaticus|risorius|mentalis|platysma|frontalis|occipitofrontalis|epicrani|procerus|corrugator|nasalis|depressor|levator labii|levator anguli|levator nasolabialis|levator palpebrae|auricular|sternocleidomastoid|scalen|digastric|mylohyoid|geniohyoid|omohyoid|sternohyoid|sternothyroid|thyrohyoid|\bcapitis\b|longus colli|splenius|genioglossus|hyoglossus|styloglossus|palatoglossus|constrictor|stylo|salpingo|tensor veli|levator veli|uvula|superior rectus muscle|inferior rectus muscle|medial rectus muscle|lateral rectus muscle|superior oblique muscle|inferior oblique muscle|\bneck\b|facial|olfactory|trochlear|trigeminal|abducens|vestibulocochlear|glossopharyngeal|\bvagus|accessory nerve|hypoglossal|cranial nerve|brain|cerebr|cerebell|\bpons\b|medulla oblong|thalam|hypothalam|pituit|pineal|fornix|corpus callosum|meninge|dura mater|pia mater|arachnoid|carotid|jugular|basilar)/i],
    ["Spine & Back", /(vertebra|atlas|axis|intervertebral|sacrum|sacral|coccy|spinal cord|spinal nerve|spinal|erector|iliocostalis|longissimus|spinalis|multifidus|rotatores|interspinal|intertransvers|semispinalis|latissimus|trapezius|rhomboid|levator scapulae|serratus posterior|quadratus lumborum|\bdorsal)/i],
    ["Thorax", /(\brib\b|costal|sternum|manubri|xiphoid|thoracic cage|intercostal|pectoral|subclavius|diaphragm|serratus anterior|levatores.*costarum|levator costae|sternalis|transversus thoracis|heart|cardiac|atri|ventricl|aorta|aortic|pulmon|vena cava|coronary|myocard|pericard|lung|bronch|pleura|mediastin|azygos|thoracic duct|esophagus|oesophagus|mammary|subclavian|brachiocephalic)/i],
    ["Abdomen & Pelvis", /(abdom|rectus abdominis|external oblique|internal oblique|transvers abdomin|pyramidalis|cremaster|inguinal|stomach|gastr|hepat|liver|gallbladder|\bbile|cystic|intestin|duoden|jejun|ileum|colon|caec|cecum|rectum|anal sphincter|sphincter ani|pubo-?analis|append|kidney|renal|ureter|bladder|urethra|spleen|splenic|pancrea|adrenal|suprarenal|portal|mesenter|omentum|peritone|psoas|iliacus|iliac|gluteus|glute|piriformis|obturator|levator ani|coccygeus|gemellus|quadratus femoris|bulbospongiosus|ischiocavernosus|perineum|perineal|pelvi|ilium|ischium|pubis|pubic|hip bone|acetabul|sacro|prostate|uter|ovar|testis|testicular|deferens|seminal|vagina|pudendal)/i],
    ["Upper Limb", /(clavicl|scapul|humerus|radius|ulna|carp|metacarp|scaphoid|lunate|triquetr|pisiform|trapezium|trapezoid|capitate|hamate|finger of hand|phalanx.*hand|\bhand\b|wrist|deltoid|biceps brachii|triceps brachii|brachialis|brachioradialis|coracobrachialis|anconeus|supraspinatus|infraspinatus|teres (major|minor)|subscapularis|pronator|supinator|flexor (carpi|digitorum|pollicis|digiti minimi.*hand)|extensor (carpi|digitorum|pollicis|indicis|digiti)|abductor pollicis|adductor pollicis|abductor digiti minimi.*hand|opponens|lumbrical.*hand|interosse.*hand|palmaris|thenar|hypothenar|palmar|axillary|brachial|cephalic|basilic|radial|ulnar|median nerve|musculocutaneous)/i],
    ["Lower Limb", /(femur|patella|tibia|fibula|tarsal|metatars|calcaneus|talus|cuboid|navicular|cuneiform|sesamoid|finger of foot|phalanx.*foot|\bfoot\b|ankle|\bknee|thigh|\bleg\b|quadricep|rectus femoris|vastus|sartorius|gracilis|pectineus|adductor (longus|brevis|magnus|minimus|hallucis)|hamstring|biceps femoris|semitendinosus|semimembranosus|tensor fasciae|gastrocnem|soleus|plantaris|popliteus|tibialis|peroneus|fibular|flexor (hallucis|digitorum|digiti minimi.*foot)|extensor (hallucis|digitorum)|abductor hallucis|abductor digiti minimi.*foot|quadratus plantae|lumbrical.*foot|interosse.*foot|femoral|saphenous|popliteal|sciatic|tibial nerve|peroneal|sural|plantar|genicular|dorsalis pedis)/i],
  ];
  function regionFor(display) {
    if (/tensor fasciae latae/i.test(display)) return "Lower Limb"; // a muscle, not fascia
    for (const [name, re] of REGION_RULES) if (re.test(display)) return name;
    return "Other Structures";
  }

  // ---- realistic per-structure tinting ---------------------------------
  // Z-Anatomy ships ONE flat material per system, which makes the body read
  // like a uniform clay mannequin. We instead give every structure a stable,
  // slightly individual tone derived deterministically from its name, plus
  // material-class overrides (deep-red muscle belly vs. pale glistening
  // tendon/aponeurosis, warm bone with subtle variation, cartilage, enamel,
  // arterial-red vs. venous-blue). This is what makes the model read with real
  // anatomical depth and definition instead of a single smeared color.
  function hash01(str, salt) {
    let h = (2166136261 ^ (salt || 0)) >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return ((h >>> 0) % 100000) / 100000;
  }
  const j = (key, salt, amt) => (hash01(key, salt) - 0.5) * 2 * amt; // signed jitter
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // pale connective tissue (tendon / aponeurosis / fascia / ligament …)
  const PALE_RE = /tendon|aponeuros|fascia|sheath|retinacul|raphe|galea|ligament|membrane|septum|\blinea\b|\bband\b|trochlea|interosseous membrane/i;
  const CART_RE = /cartilage|\bdisc\b|meniscus|labrum|symphysis|costal cartilage/i;
  const TEETH_RE = /tooth|teeth|incisor|canine|molar|premolar|enamel|dentin/i;
  const VEIN_RE = /\bvein|venous|vena|venae|jugular|azygos|\bportal\b|cava|\bsinus\b/i;
  const CNS_RE = /brain|cerebr|cerebell|medulla|\bpons\b|spinal cord|thalam|callosum|gyrus|cortex/i;

  // Returns { color, roughness, metalness, env, opacity } for a structure.
  // opacity null => use the system default; set it for clear parts (cornea).
  function tintFor(systemId, key, name, fallbackHex) {
    const tag = (name || key || "").toLowerCase();
    const c = new THREE.Color();
    let roughness = 0.62, metalness = 0.0, env = 1.0, opacity = null;

    if (systemId === "eyes") {
      // Build a believable eyeball: white wet sclera, colored iris, a near-black
      // lens read as the pupil through the iris opening, and a clear glossy cornea.
      if (/cornea|anterior chamber/.test(tag)) { c.setHSL(0.55, 0.05, 0.9); roughness = 0.04; env = 1.6; opacity = 0.12; }
      else if (/iris/.test(tag)) { c.setHSL(0.57, 0.55, 0.34); roughness = 0.3; env = 1.3; }          // blue-grey iris
      else if (/lens/.test(tag)) { c.setHSL(0.0, 0.0, 0.02); roughness = 0.18; env = 1.2; }            // dark -> pupil
      else { c.setHSL(0.07, 0.18, 0.93); roughness = 0.28; env = 1.35; }                               // sclera (white, wet)
      return { color: c, roughness, metalness, env, opacity };
    }

    if (systemId === "muscular") {
      if (PALE_RE.test(tag)) {
        // tendon / aponeurosis / fascia — pale, slightly glossy ivory-tan
        c.setHSL(0.095, 0.28, clamp(0.74 + j(key, 11, 0.04), 0.66, 0.82));
        roughness = 0.5; env = 1.05;
      } else {
        // muscle belly — deep red, individually varied per muscle
        const h = clamp(0.013 + j(key, 21, 0.012), 0.0, 0.045);   // red ↔ slight crimson/orange
        const s = clamp(0.6 + j(key, 22, 0.1), 0.42, 0.78);
        const l = clamp(0.34 + j(key, 23, 0.06), 0.24, 0.43);
        c.setHSL(h, s, l);
        roughness = 0.45; env = 1.18;                              // wet, glistening sheen
      }
    } else if (systemId === "skeletal") {
      if (CART_RE.test(tag)) { c.setHSL(0.55, 0.12, 0.8); roughness = 0.5; env = 1.1; }      // bluish translucent cartilage
      else if (TEETH_RE.test(tag)) { c.setHSL(0.12, 0.05, 0.93); roughness = 0.32; env = 1.2; } // glossy enamel
      else { c.setHSL(0.097, 0.2, clamp(0.8 + j(key, 31, 0.045), 0.72, 0.86)); roughness = 0.6; } // warm ivory bone, varied
    } else if (systemId === "cardiovascular") {
      if (VEIN_RE.test(tag)) c.setHSL(0.62, 0.42, clamp(0.42 + j(key, 41, 0.05), 0.34, 0.5)); // venous blue
      else c.setHSL(clamp(0.004 + j(key, 42, 0.006), 0, 0.03), 0.64, clamp(0.42 + j(key, 43, 0.05), 0.34, 0.5)); // arterial red
      roughness = 0.4; env = 1.15;
    } else if (systemId === "nervous") {
      if (CNS_RE.test(tag)) c.setHSL(0.09, 0.16, 0.78);                                       // CNS pale beige
      else c.setHSL(0.13, 0.5, clamp(0.6 + j(key, 51, 0.05), 0.52, 0.68));                    // peripheral nerve yellow
      roughness = 0.55;
    } else if (systemId === "visceral") {
      c.setHSL(clamp(0.04 + j(key, 61, 0.02), 0.0, 0.08), 0.45, clamp(0.45 + j(key, 62, 0.08), 0.34, 0.56)); // organ brown-reds
      roughness = 0.48; env = 1.12;
    } else {
      c.setHex(fallbackHex != null ? fallbackHex : 0xeae2d0); // user-loaded GLB → keep its system color
    }
    return { color: c, roughness, metalness, env, opacity };
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

            // Clone the material so each mesh can be highlighted/tinted
            // independently (Z-Anatomy shares one material across many parts),
            // then apply a realistic per-structure tone + PBR class so the body
            // reads with anatomical depth instead of one flat system color.
            if (Array.isArray(node.material)) node.material = node.material.map((m) => (m ? m.clone() : m));
            else if (node.material) node.material = node.material.clone();
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            const tint = tintFor(systemId, key, display, systemColor);
            // per-mesh base opacity: a clear part (e.g. cornea) overrides the
            // system default so it stays see-through under X-ray too.
            const baseOpacity = tint.opacity != null ? tint.opacity : systemOpacity;
            mats.forEach((mat) => {
              if (!mat) return;
              if (mat.color) mat.color.copy(tint.color);
              if ("roughness" in mat) mat.roughness = tint.roughness;
              if ("metalness" in mat) mat.metalness = tint.metalness;
              if ("envMapIntensity" in mat) mat.envMapIntensity = tint.env;
              if (mat.emissive) mat.emissive.setHex(0x000000);
              if (baseOpacity < 1) {
                mat.transparent = true;
                mat.opacity = baseOpacity;
                mat.depthWrite = baseOpacity > 0.9;
              }
            });

            node.userData.structureId = sid;
            node.userData.systemId = systemId;
            node.userData.modelName = rawName;
            node.userData.material = node.material;
            node.userData.baseOpacity = baseOpacity; // for X-ray
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

            // Investing fascia sheets (fascia lata, brachial/crural/pectoral/
            // thoracolumbar fascia, etc.) drape whole body segments and hide the
            // muscle bellies. Hide them by default so the muscles read like a
            // real anatomical model; they stay fully selectable/searchable and
            // "Show all" (or the info-panel Show button) brings them back.
            if (systemId === "muscular" && /\bfascia\b|fasciae|aponeuros/i.test(st.name) && !/tensor fasciae latae/i.test(st.name)) {
              st.defaultHidden = true;
            }
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
