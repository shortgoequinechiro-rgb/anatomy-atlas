/* =====================================================================
   Human Anatomy Atlas — Placeholder Body Model Builder
   ---------------------------------------------------------------------
   ORIGINAL geometry generated procedurally from the build specs in
   js/data.js. Gives the app a fully interactive, anatomically-arranged
   body that runs the instant you open it — before the large open-licensed
   GLB models are dropped in.

   Returns { group, meshesByStructure, allMeshes }. Every mesh carries
   userData.structureId + base color/opacity so the app can highlight,
   isolate, and restore it.

   Shapes (driven by js/data.js):
     box, sphere, cylinder, ellipsoid   — primitives
     fusiform                            — tapered muscle spindle (lathe)
     spine, ribcage, hand, foot          — multi-part custom builders
     eyeball                             — sclera + iris + pupil (per-part color)
   ===================================================================== */

window.AnatomyBodyModel = (function () {
  function buildGeometry(spec) {
    const a = spec.args || [];
    switch (spec.shape) {
      case "box":
        return new THREE.BoxGeometry(a[0], a[1], a[2]);
      case "sphere":
        return new THREE.SphereGeometry(a[0], 32, 24);
      case "cylinder":
        return new THREE.CylinderGeometry(a[0], a[1], a[2], 28);
      case "ellipsoid": {
        const g = new THREE.SphereGeometry(1, 32, 24);
        g.scale(a[0], a[1], a[2]);
        return g;
      }
      case "fusiform": {
        // A tapered muscle belly: bulges in the middle, tapers to tendons
        // at both ends. Lathed around Y, so it stands vertical by default
        // and is positioned / rotated like any other limb structure.
        const radius = a[0];
        const length = a[1];
        const bias = a[2] != null ? a[2] : 0.5; // where the fullest part sits
        const seg = 18;
        const pts = [];
        for (let i = 0; i <= seg; i++) {
          const t = i / seg;
          const skew = Math.pow(Math.sin(Math.PI * t), 0.7);
          const lean = 1 - Math.abs(t - bias) * 0.35;
          const r = Math.max(radius * skew * lean, 0.0009);
          pts.push(new THREE.Vector2(r, (t - 0.5) * length));
        }
        return new THREE.LatheGeometry(pts, 24);
      }
      default:
        return null; // custom shapes handled separately
    }
  }

  // ---- custom multi-part builders: array of {geometry, offset, rot, color, opacity} ----
  function buildSpine(a) {
    const [yTop, yBottom, count, radius] = a;
    const parts = [];
    const span = yTop - yBottom;
    const step = span / (count - 1 || 1);
    const h = step * 0.7;
    for (let i = 0; i < count; i++) {
      const g = new THREE.CylinderGeometry(radius, radius, h, 12);
      parts.push({ geometry: g, offset: [0, yBottom + i * step, 0] });
    }
    return parts;
  }

  function buildRibcage(a) {
    const [yTop, yBottom, pairs, halfWidth, depth] = a;
    const parts = [];
    const span = yTop - yBottom;
    const step = span / (pairs - 1 || 1);
    for (let i = 0; i < pairs; i++) {
      const y = yBottom + i * step;
      const t = i / (pairs - 1 || 1);
      const widthFactor = 0.55 + Math.sin(Math.PI * t) * 0.55;
      const rx = halfWidth * widthFactor;
      const rz = depth * (0.6 + 0.4 * Math.sin(Math.PI * t));
      for (const side of [1, -1]) {
        const g = new THREE.TorusGeometry(Math.max(rx, rz) * 0.9, 0.007, 8, 24, Math.PI);
        g.scale(rx / (Math.max(rx, rz) * 0.9), rz / (Math.max(rx, rz) * 0.9), 1);
        parts.push({
          geometry: g,
          offset: [0, y, 0],
          rot: [Math.PI / 2, 0, side > 0 ? 0 : Math.PI],
        });
      }
    }
    return parts;
  }

  function buildHand(a) {
    const parts = [];
    parts.push({ geometry: new THREE.BoxGeometry(0.05, 0.07, 0.018), offset: [0, 0.0, 0] });
    for (let f = 0; f < 4; f++) {
      const g = new THREE.BoxGeometry(0.009, 0.05, 0.012);
      parts.push({ geometry: g, offset: [-0.018 + f * 0.012, -0.058, 0] });
    }
    parts.push({ geometry: new THREE.BoxGeometry(0.012, 0.035, 0.012), offset: [0.03, -0.01, 0] });
    return parts;
  }

  function buildFoot(a) {
    const parts = [];
    parts.push({ geometry: new THREE.BoxGeometry(0.05, 0.03, 0.14), offset: [0, 0, 0.03] });
    parts.push({ geometry: new THREE.BoxGeometry(0.055, 0.035, 0.03), offset: [0, 0.01, -0.05] });
    return parts;
  }

  // Eyeball: white sclera, colored iris, dark pupil. Each part carries its
  // own color so the head reads like a real eye. Built facing +Z (anterior);
  // applyTransform mirrors it to the other orbit.
  function buildEyeball(a) {
    const r = (a && a[0]) || 0.015;
    const irisColor = a && a[1] != null ? a[1] : 0x4a6b86; // blue-grey default
    return [
      { geometry: new THREE.SphereGeometry(r, 28, 20), color: 0xf3f0e9, offset: [0, 0, 0] },
      { geometry: new THREE.CircleGeometry(r * 0.5, 28), color: irisColor, offset: [0, 0, r * 0.92] },
      { geometry: new THREE.CircleGeometry(r * 0.22, 22), color: 0x0a0a0a, offset: [0, 0, r * 0.95] },
    ];
  }

  function customParts(spec) {
    switch (spec.shape) {
      case "spine":
        return buildSpine(spec.args);
      case "ribcage":
        return buildRibcage(spec.args);
      case "hand":
        return buildHand(spec.args);
      case "foot":
        return buildFoot(spec.args);
      case "eyeball":
        return buildEyeball(spec.args);
      default:
        return null;
    }
  }

  function makeMaterial(color, opacity) {
    const transparent = opacity < 1;
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.6,
      metalness: 0.05,
      transparent: transparent,
      opacity: opacity,
      depthWrite: !transparent || opacity > 0.85,
      side: THREE.DoubleSide,
    });
  }

  function applyTransform(obj, spec, mirror) {
    const p = spec.pos || [0, 0, 0];
    const r = spec.rot || [0, 0, 0];
    const sgn = mirror ? -1 : 1;
    obj.position.set(p[0] * sgn, p[1], p[2]);
    obj.rotation.set(r[0], mirror ? -r[1] : r[1], mirror ? -r[2] : r[2]);
  }

  function build(THREE_unused) {
    const group = new THREE.Group();
    const meshesByStructure = {};
    const allMeshes = [];

    window.ANATOMY.systems.forEach((sys) => {
      const sysColor = sys.color;
      const sysOpacity = sys.opacity || 1;

      sys.regions.forEach((reg) => {
        reg.structures.forEach((st) => {
          if (!st.build) return;
          const baseColor = st.build.color != null ? st.build.color : sysColor;
          const baseOpacity = st.build.opacity != null ? st.build.opacity : sysOpacity;
          const instances = st.build.mirror ? [false, true] : [false];

          instances.forEach((isMirror) => {
            let node;

            const parts = customParts(st.build);
            if (parts) {
              node = new THREE.Group();
              parts.forEach((pt) => {
                const pColor = pt.color != null ? pt.color : baseColor;
                const pOpacity = pt.opacity != null ? pt.opacity : baseOpacity;
                const mat = makeMaterial(pColor, pOpacity);
                const m = new THREE.Mesh(pt.geometry, mat);
                if (pt.offset) m.position.set(pt.offset[0], pt.offset[1], pt.offset[2]);
                if (pt.rot) m.rotation.set(pt.rot[0], pt.rot[1], pt.rot[2]);
                m.userData.structureId = st.id;
                m.userData.systemId = sys.id;
                m.userData.baseColor = pColor;
                m.userData.baseOpacity = pOpacity;
                m.userData.material = mat;
                node.add(m);
                allMeshes.push(m);
              });
              applyTransform(node, st.build, isMirror);
              node.userData.material = node.children[0] && node.children[0].userData.material;
            } else {
              const material = makeMaterial(baseColor, baseOpacity);
              const geom = buildGeometry(st.build);
              node = new THREE.Mesh(geom, material);
              applyTransform(node, st.build, isMirror);
              node.userData.material = material;
              allMeshes.push(node);
            }

            node.userData.structureId = st.id;
            node.userData.systemId = sys.id;
            node.userData.baseColor = baseColor;
            node.userData.baseOpacity = baseOpacity;

            group.add(node);
            (meshesByStructure[st.id] = meshesByStructure[st.id] || []).push(node);
          });
        });
      });
    });

    // Center the figure: authored feet≈0..crown≈1.78, so shift down
    group.position.y = -0.9;

    return { group, meshesByStructure, allMeshes };
  }

  return { build };
})();
