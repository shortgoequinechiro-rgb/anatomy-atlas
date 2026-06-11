/* =====================================================================
   Human Anatomy Atlas — Placeholder Body Model Builder
   ---------------------------------------------------------------------
   ORIGINAL geometry generated procedurally from the build specs in
   js/data.js. This gives the app a fully interactive, anatomically-
   arranged body that runs the instant you open it — before the large
   open-licensed GLB models are dropped in.

   Returns:
     {
       group:               THREE.Group added to the scene,
       meshesByStructure:   { structureId: [THREE.Mesh, ...] },
       allMeshes:           [THREE.Mesh, ...]   (for raycasting)
     }
   Every mesh carries mesh.userData.structureId and its base material
   color/opacity so the app can highlight, isolate, and restore it.
   ===================================================================== */

window.AnatomyBodyModel = (function () {
  function buildGeometry(spec) {
    const a = spec.args || [];
    switch (spec.shape) {
      case "box":
        return new THREE.BoxGeometry(a[0], a[1], a[2]);
      case "sphere":
        return new THREE.SphereGeometry(a[0], 24, 18);
      case "cylinder":
        return new THREE.CylinderGeometry(a[0], a[1], a[2], 20);
      case "ellipsoid": {
        const g = new THREE.SphereGeometry(1, 24, 18);
        g.scale(a[0], a[1], a[2]);
        return g;
      }
      default:
        return null; // custom shapes handled separately
    }
  }

  // ---- custom multi-part builders return an array of {geometry, offset, rot} ----
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
      // taper the cage: narrower at top and bottom
      const t = i / (pairs - 1 || 1);
      const widthFactor = 0.55 + Math.sin(Math.PI * t) * 0.55; // fuller in the middle
      const rx = halfWidth * widthFactor;
      const rz = depth * (0.6 + 0.4 * Math.sin(Math.PI * t));
      for (const side of [1, -1]) {
        // a half-torus arc sweeping from the sternum around to the spine
        const g = new THREE.TorusGeometry(Math.max(rx, rz) * 0.9, 0.007, 8, 24, Math.PI);
        // scale into an ellipse and orient as a hoop in the horizontal plane
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
    parts.push({ geometry: new THREE.BoxGeometry(0.05, 0.07, 0.018), offset: [0, 0.0, 0] }); // palm
    for (let f = 0; f < 4; f++) {
      const g = new THREE.BoxGeometry(0.009, 0.05, 0.012);
      parts.push({ geometry: g, offset: [-0.018 + f * 0.012, -0.058, 0] }); // fingers
    }
    parts.push({ geometry: new THREE.BoxGeometry(0.012, 0.035, 0.012), offset: [0.03, -0.01, 0] }); // thumb
    return parts;
  }

  function buildFoot(a) {
    const parts = [];
    parts.push({ geometry: new THREE.BoxGeometry(0.05, 0.03, 0.14), offset: [0, 0, 0.03] }); // sole
    parts.push({ geometry: new THREE.BoxGeometry(0.055, 0.035, 0.03), offset: [0, 0.01, -0.05] }); // heel
    return parts;
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
      default:
        return null;
    }
  }

  function makeMaterial(color, opacity) {
    const transparent = opacity < 1;
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.65,
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
    obj.rotation.set(r[0], r[1], mirror ? -r[2] : r[2]);
  }

  function build(THREE_unused) {
    const group = new THREE.Group();
    const meshesByStructure = {};
    const allMeshes = [];

    window.ANATOMY.systems.forEach((sys) => {
      const color = sys.color;
      const opacity = sys.opacity || 1;

      sys.regions.forEach((reg) => {
        reg.structures.forEach((st) => {
          if (!st.build) return;
          const instances = st.build.mirror ? [false, true] : [false];

          instances.forEach((isMirror) => {
            const material = makeMaterial(color, opacity);
            let node;

            const parts = customParts(st.build);
            if (parts) {
              node = new THREE.Group();
              parts.forEach((pt) => {
                const m = new THREE.Mesh(pt.geometry, material);
                if (pt.offset) m.position.set(pt.offset[0], pt.offset[1], pt.offset[2]);
                if (pt.rot) m.rotation.set(pt.rot[0], pt.rot[1], pt.rot[2]);
                m.userData.structureId = st.id;
                node.add(m);
                allMeshes.push(m);
              });
              applyTransform(node, st.build, isMirror);
            } else {
              const geom = buildGeometry(st.build);
              node = new THREE.Mesh(geom, material);
              applyTransform(node, st.build, isMirror);
              node.userData.structureId = st.id;
              allMeshes.push(node);
            }

            node.userData.structureId = st.id;
            node.userData.systemId = sys.id;
            node.userData.baseColor = color;
            node.userData.baseOpacity = opacity;
            node.userData.material = material;

            group.add(node);
            (meshesByStructure[st.id] = meshesByStructure[st.id] || []).push(node);
          });
        });
      });
    });

    // Center the figure: model is authored feet≈0..crown≈1.78, so shift down
    group.position.y = -0.9;

    return { group, meshesByStructure, allMeshes };
  }

  return { build };
})();
