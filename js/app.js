/* =====================================================================
   Human Anatomy Atlas — Application
   ---------------------------------------------------------------------
   Wires together the 3D scene, the placeholder body model (or a loaded
   GLB), the browsable system tree, fast search, the info panel, layer
   toggles, and the isolate / hide / focus / reset interactions.
   ORIGINAL code.
   ===================================================================== */

(function () {
  "use strict";

  // ---------------------------------------------------------------- state
  const State = {
    model: null, // { group, meshesByStructure, allMeshes }
    selected: null, // structureId
    isolateId: null, // structureId or null
    hidden: new Set(), // structureIds hidden by the user
    systemEnabled: new Set(), // systemIds currently shown
    showLabels: true,
    labelTarget: null, // THREE.Vector3 of current selection center
    loadedItems: [], // [{loaded, cfg}] systems loaded so far
    loadedSystems: new Set(), // systemIds loaded
    loading: new Set(), // systemIds currently loading
    customSystems: [], // user-loaded GLBs (Load GLB…)
    fit: null, // { scale, center } derived from skeleton, reused for alignment
    xray: 1, // 1 = off; <1 fades non-selected structures
    ready: false, // true once the real model is loaded (gates persistence)
    treeMode: "system", // "system" | "region" sidebar grouping
  };

  // The active catalog drives the tree, search, info, and layers. It is the
  // built-in placeholder catalog by default, and is replaced by a model-
  // derived catalog when a real GLB is loaded.
  let ACTIVE = window.ANATOMY;

  // Real anatomical definitions extracted from Z-Anatomy (key -> text). Loaded
  // once; selection looks up a definition and falls back to the generic note.
  let DEFS = {};
  fetch("models/definitions.json")
    .then((r) => (r.ok ? r.json() : {}))
    .then((d) => { DEFS = d || {}; if (State.selected) renderInfo(State.selected); })
    .catch(() => {});
  function normKey(s) {
    return (s || "").toLowerCase().replace(/[()\[\]]/g, "").replace(/\s+/g, " ").trim();
  }
  function descFor(st) {
    if (!st) return "";
    let t = DEFS[normKey(st.key || st.name)] || st.description || "";
    return t
      .replace(/^!.*$/gm, "") // drop editorial "!" notes
      .replace(/={2,}\s*(.*?)\s*={2,}/g, "$1") // == Heading == -> Heading
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  function esc(s) {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function announce(msg) {
    const el = document.getElementById("live");
    if (el) el.textContent = msg;
  }

  // Latin / TA2 terms (key -> Latin), from Z-Anatomy's TA2.csv.
  let LATIN = {};
  fetch("models/latin.json")
    .then((r) => (r.ok ? r.json() : {}))
    .then((d) => {
      LATIN = d || {};
      buildSearchIndex();
      if (State.selected) renderInfo(State.selected);
    })
    .catch(() => {});
  function latinFor(st) {
    return st ? LATIN[normKey(st.key || st.name)] || "" : "";
  }

  // Fuzzy search index (Fuse.js) over name + Latin + region + system.
  let FUSE = null;
  function buildSearchIndex() {
    if (typeof Fuse === "undefined" || !ACTIVE || !ACTIVE.index) return;
    const docs = Object.values(ACTIVE.index).map((st) => ({
      id: st.id,
      name: st.name,
      latin: latinFor(st),
      region: st.regionName,
      system: st.systemName,
    }));
    FUSE = new Fuse(docs, {
      keys: [
        { name: "name", weight: 0.62 },
        { name: "latin", weight: 0.26 },
        { name: "region", weight: 0.08 },
        { name: "system", weight: 0.04 },
      ],
      threshold: 0.32,
      distance: 60,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }

  // ------------------------------------------------------------- three.js
  let scene, camera, renderer, controls, raycaster, pointer, composer, outlinePass, hoverPass, fxaaPass;
  let dirty = true; // on-demand rendering: only draw when something changed
  function requestRender() { dirty = true; }
  const canvasWrap = document.getElementById("viewport");
  const labelEl = document.getElementById("floating-label");
  const reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Soft radial contact shadow under the model (replaces the engine-y grid).
  function makeContactShadow() {
    const s = 256;
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(0.45, "rgba(0,0,0,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.92;
    mesh.renderOrder = -1;
    return mesh;
  }

  function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0e13);

    const w = canvasWrap.clientWidth;
    const h = canvasWrap.clientHeight;
    camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
    camera.position.set(0, 0.15, 3.1);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    canvasWrap.appendChild(renderer.domElement);

    // Image-based lighting (studio feel) — the biggest "premium" lever.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(renderer), 0.04).texture;
    pmrem.dispose();

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.35;
    controls.maxDistance = 8;
    controls.zoomSpeed = 0.9;
    controls.target.set(0, 0, 0);
    controls.addEventListener("change", requestRender);

    // gentle key + cool rim; the env map provides the ambient fill
    const key = new THREE.DirectionalLight(0xffffff, 0.55);
    key.position.set(2.5, 3.5, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd2ff, 0.25);
    rim.position.set(-3, 1.5, -3);
    scene.add(rim);

    scene.add(makeContactShadow());

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    // Post-processing: scene + crisp outline selection + FXAA.
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    outlinePass = new THREE.OutlinePass(new THREE.Vector2(w, h), scene, camera);
    outlinePass.edgeStrength = 4.5;
    outlinePass.edgeGlow = 0.5;
    outlinePass.edgeThickness = 1.0;
    outlinePass.visibleEdgeColor.set("#46e0ff");
    outlinePass.hiddenEdgeColor.set("#1a6275");
    composer.addPass(outlinePass);
    // subtle white hover outline
    hoverPass = new THREE.OutlinePass(new THREE.Vector2(w, h), scene, camera);
    hoverPass.edgeStrength = 2.2;
    hoverPass.edgeGlow = 0;
    hoverPass.edgeThickness = 1.0;
    hoverPass.visibleEdgeColor.set("#ffffff");
    hoverPass.hiddenEdgeColor.set("#000000");
    composer.addPass(hoverPass);
    fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
    const pr = renderer.getPixelRatio();
    fxaaPass.material.uniforms["resolution"].value.set(1 / (w * pr), 1 / (h * pr));
    composer.addPass(fxaaPass);

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    window.addEventListener("resize", onResize);

    // keyboard orbit (accessibility) — focus the canvas with Tab, then arrows/+/-
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-label", "3D anatomy viewport — arrow keys orbit, plus and minus zoom");
    renderer.domElement.addEventListener("keydown", (e) => {
      const s = 0.13;
      let ok = true;
      if (e.key === "ArrowLeft") orbitBy(-s, 0);
      else if (e.key === "ArrowRight") orbitBy(s, 0);
      else if (e.key === "ArrowUp") orbitBy(0, -s);
      else if (e.key === "ArrowDown") orbitBy(0, s);
      else if (e.key === "+" || e.key === "=") dollyBy(0.9);
      else if (e.key === "-" || e.key === "_") dollyBy(1.1);
      else ok = false;
      if (ok) { e.preventDefault(); controls.update(); requestRender(); }
    });
  }

  function orbitBy(dTheta, dPhi) {
    const off = camera.position.clone().sub(controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta += dTheta;
    sph.phi = Math.max(0.1, Math.min(Math.PI - 0.1, sph.phi + dPhi));
    off.setFromSpherical(sph);
    camera.position.copy(controls.target).add(off);
  }
  function dollyBy(f) {
    const off = camera.position.clone().sub(controls.target).multiplyScalar(f);
    const d = off.length();
    if (d > controls.minDistance && d < controls.maxDistance) camera.position.copy(controls.target).add(off);
  }

  function onResize() {
    const w = canvasWrap.clientWidth;
    const h = canvasWrap.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
    if (outlinePass) outlinePass.setSize(w, h);
    if (hoverPass) hoverPass.setSize(w, h);
    if (fxaaPass) {
      const pr = renderer.getPixelRatio();
      fxaaPass.material.uniforms["resolution"].value.set(1 / (w * pr), 1 / (h * pr));
    }
    requestRender();
  }

  // ------------------------------------------------------------- helpers
  function eachMat(node, fn) {
    const m = node.userData.material || node.material;
    if (Array.isArray(m)) m.forEach((mm) => mm && fn(mm));
    else if (m) fn(m);
  }

  // Selection = a crisp post-processed outline (keeps the material photoreal).
  function setOutline(structureId) {
    if (!outlinePass) return;
    outlinePass.selectedObjects = structureId
      ? State.model.meshesByStructure[structureId] || []
      : [];
  }

  // Visibility is applied per-mesh so it works for both the procedural
  // placeholder (parts nested in groups) and a loaded GLB (deeply nested
  // scene graph). System is resolved from the active catalog.
  function applyVisibility() {
    if (!State.model) return;
    const visible = [];
    State.model.allMeshes.forEach((m) => {
      const sid = m.userData.structureId;
      const st = ACTIVE.index[sid];
      const sys = st ? st.systemId : m.userData.systemId;
      let vis = (!sys || State.systemEnabled.has(sys)) && !State.hidden.has(sid);
      if (State.isolateId) vis = vis && sid === State.isolateId;
      m.visible = vis;
      if (vis) visible.push(m);
    });
    State.visibleMeshes = visible; // raycast only against what's shown (perf)
    refreshMaterials();
  }

  // X-ray: fade non-selected structures to baseOpacity*xray; the selected one
  // stays fully opaque so it reads through other layers.
  function refreshMaterials() {
    if (!State.model) return;
    const sel = State.selected;
    State.model.allMeshes.forEach((m) => {
      const base = m.userData.baseOpacity != null ? m.userData.baseOpacity : 1;
      const isSel = sel && m.userData.structureId === sel;
      const op = Math.min(1, isSel ? 1 : base * State.xray);
      eachMat(m, (mat) => {
        if (op < 0.999) {
          mat.transparent = true;
          mat.opacity = op;
          mat.depthWrite = op > 0.9;
        } else {
          mat.transparent = false;
          mat.opacity = 1;
          mat.depthWrite = true;
        }
      });
    });
    requestRender();
  }

  function structureCenter(structureId) {
    const nodes = State.model.meshesByStructure[structureId] || [];
    const box = new THREE.Box3();
    nodes.forEach((n) => box.expandByObject(n));
    if (box.isEmpty()) return null;
    const c = new THREE.Vector3();
    box.getCenter(c);
    return { center: c, box };
  }

  // ----------------------------------------------------------- selection
  function selectStructure(structureId, opts = {}) {
    if (!structureId || structureId.startsWith("__unmatched__")) {
      if (structureId && structureId.startsWith("__unmatched__")) {
        showUnmatchedInfo(structureId.split(":").slice(1).join(":"));
      }
      return;
    }
    State.selected = structureId;
    setOutline(structureId);
    refreshMaterials(); // keep the selected structure fully opaque under X-ray

    const sc = structureCenter(structureId);
    State.labelTarget = sc ? sc.center.clone() : null;

    renderInfo(structureId);
    highlightTreeRow(structureId);
    pushRecent(structureId);
    const st = ACTIVE.index[structureId];
    if (st) announce(st.name + ", " + st.systemName + ", " + st.regionName);
    document.body.classList.add("has-selection");
    document.body.classList.remove("nav-open"); // close mobile drawer on select
    if (opts.focus) focusStructure(structureId);
    persistState();
  }

  // Clear the current selection (e.g. clicking empty space).
  function deselect() {
    State.selected = null;
    State.labelTarget = null;
    setOutline(null);
    refreshMaterials();
    Object.values(rowsByStructure).forEach((r) => r.classList.remove("active"));
    infoEl.innerHTML = '<div class="info-empty"><p>Click or search any structure to see it.</p></div>';
    document.body.classList.remove("has-selection");
    persistState();
  }

  function focusStructure(structureId) {
    const sc = structureCenter(structureId);
    if (!sc) return;
    const size = new THREE.Vector3();
    sc.box.getSize(size);
    const radius = Math.max(size.x, size.y, size.z, 0.08);
    const dist = radius * 4.5 + 0.4;
    controls.target.copy(sc.center);
    const dir = new THREE.Vector3(0.2, 0.1, 1).normalize();
    const newPos = sc.center.clone().add(dir.multiplyScalar(dist));
    animateCamera(newPos, sc.center);
  }

  let camAnim = null;
  let orbitAnim = null; // spherical arc tween for the anatomical view presets
  function animateCamera(toPos, toTarget) {
    orbitAnim = null; // a fly-to cancels any in-flight orbit arc
    if (reduceMotion) {
      camera.position.copy(toPos);
      controls.target.copy(toTarget);
      camAnim = null;
      return;
    }
    camAnim = {
      fromPos: camera.position.clone(),
      toPos: toPos.clone(),
      fromTarget: controls.target.clone(),
      toTarget: toTarget.clone(),
      t: 0,
    };
  }

  // -------------------------------------------------------------- picking
  function pickAt(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const targets = State.visibleMeshes || State.model.allMeshes;
    const hits = raycaster.intersectObjects(targets, false);
    for (const hit of hits) {
      if (hit.object.visible) return hit.object;
    }
    return null;
  }

  let downXY = null;
  function onPointerDown(e) {
    downXY = { x: e.clientX, y: e.clientY };
  }

  let lastHover = 0;
  function onPointerMove(e) {
    if (!State.model) return;
    const now = performance.now();
    if (now - lastHover < 60) return; // throttle hover raycast (~16/s)
    lastHover = now;
    const obj = pickAt(e);
    renderer.domElement.style.cursor = obj ? "pointer" : "grab";
    const sid = obj && obj.userData.structureId;
    if (hoverPass) {
      const next = sid && sid !== State.selected ? State.model.meshesByStructure[sid] || [] : [];
      if (next.length || hoverPass.selectedObjects.length) {
        hoverPass.selectedObjects = next;
        requestRender();
      }
    }
  }

  // treat as click only if pointer didn't drag far (so orbiting doesn't select)
  function attachClick() {
    renderer.domElement.addEventListener("pointerup", (e) => {
      if (!downXY) return;
      const moved = Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y);
      downXY = null;
      if (moved > 6) return; // it was a drag
      const obj = pickAt(e);
      if (obj) selectStructure(obj.userData.structureId, { focus: false });
      else if (State.selected) deselect(); // click empty space → deselect
    });
    // double-click a structure → frame it (and pivot orbit around it)
    renderer.domElement.addEventListener("dblclick", (e) => {
      const obj = pickAt(e);
      if (obj) {
        const id = obj.userData.structureId;
        if (id !== State.selected) selectStructure(id, { focus: false });
        focusStructure(id);
      }
    });
  }

  // ----------------------------------------------- findability (local)
  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k) || d); } catch (e) { return JSON.parse(d); } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function getFavs() { return lsGet("atlas.favs", "[]"); }
  function isFav(id) { return getFavs().indexOf(id) >= 0; }
  function toggleFav(id) {
    const f = getFavs();
    const i = f.indexOf(id);
    if (i >= 0) f.splice(i, 1); else f.unshift(id);
    lsSet("atlas.favs", f.slice(0, 100));
    renderQuickLists();
    if (State.selected === id) renderInfo(id);
  }
  function getRecents() { return lsGet("atlas.recents", "[]"); }
  function pushRecent(id) {
    let r = getRecents().filter((x) => x !== id);
    r.unshift(id);
    lsSet("atlas.recents", r.slice(0, 12));
    renderQuickLists();
  }
  const STOP = new Set(["bone", "left", "right", "muscle", "nerve", "part", "the", "and", "of", "cartilage", "process", "surface", "head", "neck", "body", "lateral", "medial", "anterior", "posterior", "superior", "inferior"]);
  function relatedFor(st) {
    const all = Object.values(ACTIVE.index);
    const seen = new Set([st.id]);
    const out = [];
    all.forEach((o) => {
      if (!seen.has(o.id) && o.systemId === st.systemId && o.regionName === st.regionName) { out.push(o); seen.add(o.id); }
    });
    if (out.length < 10) {
      const toks = (st.name.toLowerCase().match(/[a-z]{4,}/g) || []).filter((t) => !STOP.has(t));
      all.forEach((o) => {
        if (seen.has(o.id)) return;
        const on = o.name.toLowerCase();
        if (toks.some((t) => on.includes(t))) { out.push(o); seen.add(o.id); }
      });
    }
    return out.slice(0, 10);
  }

  // -------------------------------------------- quick lists (sidebar)
  const quickEl = document.getElementById("quicklists");
  function renderQuickLists() {
    if (!quickEl) return;
    const sections = [];
    const favs = getFavs().filter((id) => ACTIVE.index[id]);
    const recents = getRecents().filter((id) => ACTIVE.index[id] && id !== State.selected).slice(0, 6);
    function rows(ids) {
      return ids
        .map((id) => `<div class="ql-row" data-id="${id}">${esc(ACTIVE.index[id].name)}</div>`)
        .join("");
    }
    if (favs.length) sections.push(`<div class="ql-section"><div class="ql-head">★ Favorites</div>${rows(favs)}</div>`);
    if (recents.length) sections.push(`<div class="ql-section"><div class="ql-head">Recent</div>${rows(recents)}</div>`);
    quickEl.innerHTML = sections.join("");
    quickEl.querySelectorAll(".ql-row").forEach((r) =>
      r.addEventListener("click", () => selectStructure(r.dataset.id, { focus: true }))
    );
  }

  // ------------------------------------------------------------- info UI
  const infoEl = document.getElementById("info-content");
  function renderInfo(structureId) {
    const st = ACTIVE.index[structureId];
    if (!st) return;
    const hidden = State.hidden.has(structureId);
    const latin = latinFor(st);
    const fav = isFav(structureId);
    const related = relatedFor(st);
    const sysHex = "#" + st.systemColor.toString(16).padStart(6, "0");
    infoEl.innerHTML = `
      <div class="info-system" style="--syscol:${sysHex}">
        <span class="crumb" data-crumb="system">${st.systemName}</span>
        <span class="crumb-sep">·</span>
        <span class="crumb" data-crumb="region">${st.regionName}</span>
      </div>
      <div class="info-titlerow">
        <h2 class="info-title">${esc(st.name)}</h2>
        <button class="fav-btn ${fav ? "on" : ""}" title="${fav ? "Remove favorite" : "Add favorite"}">${fav ? "★" : "☆"}</button>
      </div>
      ${latin ? `<div class="info-latin">${esc(latin)}</div>` : ""}
      <p class="info-desc">${esc(descFor(st))}</p>
      <div class="info-actions">
        <button class="btn" data-act="focus">Focus</button>
        <button class="btn" data-act="isolate">${State.isolateId === structureId ? "Exit isolate" : "Isolate"}</button>
        <button class="btn" data-act="hide">${hidden ? "Show" : "Hide"}</button>
      </div>
      ${
        related.length
          ? `<div class="see-also"><div class="see-also-head">See also</div><div class="chips">${related
              .map((o) => `<button class="chip" data-id="${o.id}">${esc(o.name)}</button>`)
              .join("")}</div></div>`
          : ""
      }`;
    infoEl.querySelectorAll("button[data-act]").forEach((b) => {
      b.addEventListener("click", () => onInfoAction(b.dataset.act, structureId));
    });
    infoEl.querySelector(".fav-btn").addEventListener("click", () => toggleFav(structureId));
    infoEl.querySelectorAll(".crumb").forEach((c) =>
      c.addEventListener("click", () => selectGroup(c.dataset.crumb, st))
    );
    infoEl.querySelectorAll(".chip").forEach((c) =>
      c.addEventListener("click", () => selectStructure(c.dataset.id, { focus: true }))
    );
  }

  // Select+frame a whole system or region (clickable breadcrumb).
  function selectGroup(kind, st) {
    const ids = Object.values(ACTIVE.index)
      .filter((o) => (kind === "system" ? o.systemId === st.systemId : o.systemId === st.systemId && o.regionName === st.regionName))
      .map((o) => o.id);
    if (!ids.length) return;
    // outline + frame the group
    const meshes = [];
    ids.forEach((id) => (State.model.meshesByStructure[id] || []).forEach((m) => meshes.push(m)));
    if (outlinePass) outlinePass.selectedObjects = meshes;
    const box = new THREE.Box3();
    meshes.forEach((m) => box.expandByObject(m));
    if (!box.isEmpty()) {
      const c = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(c);
      box.getSize(size);
      const r = Math.max(size.x, size.y, size.z, 0.1);
      animateCamera(c.clone().add(new THREE.Vector3(0.2, 0.1, 1).normalize().multiplyScalar(r * 2.4 + 0.5)), c);
    }
  }

  function showUnmatchedInfo(modelName) {
    infoEl.innerHTML = `
      <div class="info-system" style="--syscol:#888">Unmapped model mesh</div>
      <h2 class="info-title">${modelName || "(unnamed)"}</h2>
      <p class="info-desc">This mesh from the loaded GLB isn't mapped to a catalog
      structure yet. Add <code>"${modelName}": "&lt;structureId&gt;"</code> to your
      model name-map JSON to label it. See the README.</p>`;
  }

  function onInfoAction(act, structureId) {
    if (act === "focus") focusStructure(structureId);
    if (act === "hide") {
      if (State.hidden.has(structureId)) State.hidden.delete(structureId);
      else State.hidden.add(structureId);
      applyVisibility();
      renderInfo(structureId);
    }
    if (act === "isolate") {
      State.isolateId = State.isolateId === structureId ? null : structureId;
      applyVisibility();
      renderInfo(structureId);
      updateIsolateBanner();
      if (State.isolateId) focusStructure(structureId);
    }
  }

  // --------------------------------------------------------------- tree
  const treeEl = document.getElementById("tree");
  const rowsByStructure = {};
  function makeRow(st, sysName, regName, dotHex) {
    const row = document.createElement("div");
    row.className = "tree-row";
    row.setAttribute("role", "treeitem");
    row.dataset.structureId = st.id;
    row.dataset.search = (st.name + " " + (latinFor(st) || "") + " " + sysName + " " + regName).toLowerCase();
    row.innerHTML =
      (dotHex ? `<span class="sysdot" style="background:${dotHex}"></span>` : "") +
      `<span class="tree-row-name">${esc(st.name)}</span>`;
    row.addEventListener("click", () => selectStructure(st.id, { focus: true }));
    rowsByStructure[st.id] = row;
    return row;
  }

  function buildTree() {
    treeEl.innerHTML = "";
    Object.keys(rowsByStructure).forEach((k) => delete rowsByStructure[k]);
    if (State.treeMode === "region") buildTreeByRegion();
    else buildTreeBySystem();
  }

  function buildTreeBySystem() {
    ACTIVE.systems.forEach((sys) => {
      const sysEl = document.createElement("div");
      sysEl.className = "tree-system";
      const hex = "#" + sys.color.toString(16).padStart(6, "0");
      const head = document.createElement("div");
      head.className = "tree-system-head";
      head.innerHTML = `
        <span class="dot" style="background:${hex}"></span>
        <span class="tree-system-name">${sys.name}</span>
        <span class="tree-count">${countStructures(sys)}</span>
        <span class="caret">▾</span>`;
      sysEl.appendChild(head);
      const body = document.createElement("div");
      body.className = "tree-system-body";
      sys.regions.forEach((reg) => {
        const group = document.createElement("div");
        group.className = "tree-region-group collapsed";
        const regHead = document.createElement("div");
        regHead.className = "tree-region";
        regHead.innerHTML = `
          <span class="rcaret">▾</span>
          <span class="tree-region-name">${reg.name}</span>
          <span class="tree-region-count">${reg.structures.length}</span>`;
        regHead.addEventListener("click", () => group.classList.toggle("collapsed"));
        group.appendChild(regHead);
        const regBody = document.createElement("div");
        regBody.className = "tree-region-body";
        reg.structures.forEach((st) => regBody.appendChild(makeRow(st, sys.name, reg.name)));
        group.appendChild(regBody);
        body.appendChild(group);
      });
      head.addEventListener("click", () => sysEl.classList.toggle("collapsed"));
      sysEl.appendChild(body);
      treeEl.appendChild(sysEl);
    });
  }

  const REGION_ORDER = ["Head & Neck", "Spine & Back", "Thorax", "Abdomen & Pelvis", "Upper Limb", "Lower Limb", "Skull & Head", "Vertebral Column", "Pelvis", "Back & Spine", "Other Structures"];
  function buildTreeByRegion() {
    const byRegion = {};
    const sysColor = {};
    ACTIVE.systems.forEach((s) => (sysColor[s.id] = s.color));
    Object.values(ACTIVE.index).forEach((st) => {
      (byRegion[st.regionName] = byRegion[st.regionName] || []).push(st);
    });
    const regions = REGION_ORDER.filter((r) => byRegion[r]).concat(
      Object.keys(byRegion).filter((r) => !REGION_ORDER.includes(r))
    );
    regions.forEach((rn) => {
      const list = byRegion[rn].slice().sort((a, b) => a.name.localeCompare(b.name));
      const sysEl = document.createElement("div");
      sysEl.className = "tree-system collapsed";
      const head = document.createElement("div");
      head.className = "tree-system-head";
      head.innerHTML = `
        <span class="tree-system-name">${rn === "Other Structures" ? "Other" : rn}</span>
        <span class="tree-count">${list.length}</span>
        <span class="caret">▾</span>`;
      head.addEventListener("click", () => sysEl.classList.toggle("collapsed"));
      sysEl.appendChild(head);
      const body = document.createElement("div");
      body.className = "tree-system-body";
      list.forEach((st) => {
        const hex = "#" + (sysColor[st.systemId] || 0x888888).toString(16).padStart(6, "0");
        body.appendChild(makeRow(st, st.systemName, rn, hex));
      });
      sysEl.appendChild(body);
      treeEl.appendChild(sysEl);
    });
  }

  function countStructures(sys) {
    return sys.regions.reduce((n, r) => n + r.structures.length, 0);
  }

  function highlightTreeRow(structureId) {
    Object.values(rowsByStructure).forEach((r) => r.classList.remove("active"));
    const row = rowsByStructure[structureId];
    if (row) {
      row.classList.add("active");
      const sysEl = row.closest(".tree-system");
      if (sysEl) sysEl.classList.remove("collapsed");
      const grp = row.closest(".tree-region-group");
      if (grp) grp.classList.remove("collapsed"); // expand its region
      row.scrollIntoView({ block: "nearest" });
    }
  }

  // -------------------------------------------------------------- search
  const searchEl = document.getElementById("search");
  const searchClear = document.getElementById("search-clear");
  function initSearch() {
    searchEl.addEventListener("input", () => {
      const q = searchEl.value.trim().toLowerCase();
      searchClear.style.display = q ? "block" : "none";
      let firstMatch = null;

      // Fuzzy ranking (Fuse) when available, else substring; Latin included.
      let matchIds = null, ordered = null;
      if (q && FUSE) {
        ordered = FUSE.search(q, { limit: 40 }).map((r) => r.item.id);
        matchIds = new Set(ordered);
        firstMatch = ordered[0] || null;
      }
      Object.entries(rowsByStructure).forEach(([id, row]) => {
        const hit = !q || (matchIds ? matchIds.has(id) : row.dataset.search.includes(q));
        row.style.display = hit ? "" : "none";
        if (hit && !matchIds && !firstMatch) firstMatch = id;
        row.classList.remove("kbd");
      });
      State._kbd = -1;

      // Region groups: while searching, expand + show only groups with matches.
      // With no query, re-collapse every group (the accordion default).
      document.querySelectorAll(".tree-region-group").forEach((grp) => {
        const anyRow = grp.querySelector('.tree-row:not([style*="display: none"])');
        if (q) {
          grp.style.display = anyRow ? "" : "none";
          grp.classList.toggle("collapsed", !anyRow);
        } else {
          grp.style.display = "";
          grp.classList.add("collapsed");
        }
      });

      // Systems: show only those containing matches; keep them expanded.
      document.querySelectorAll(".tree-system").forEach((sysEl) => {
        const anyRow = sysEl.querySelector('.tree-row:not([style*="display: none"])');
        sysEl.style.display = anyRow || !q ? "" : "none";
        if (q) sysEl.classList.remove("collapsed");
        else if (State.treeMode === "region") sysEl.classList.add("collapsed");
      });

      searchEl.dataset.first = firstMatch || "";
    });

    searchEl.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const vis = Object.values(rowsByStructure).filter((r) => r.style.display !== "none");
        if (!vis.length) return;
        State._kbd = e.key === "ArrowDown"
          ? Math.min((State._kbd ?? -1) + 1, vis.length - 1)
          : Math.max((State._kbd ?? 0) - 1, 0);
        vis.forEach((r) => r.classList.remove("kbd"));
        const row = vis[State._kbd];
        row.classList.add("kbd");
        row.closest(".tree-region-group") && row.closest(".tree-region-group").classList.remove("collapsed");
        row.scrollIntoView({ block: "nearest" });
        searchEl.dataset.first = row.dataset.structureId;
        return;
      }
      if (e.key === "Enter" && searchEl.dataset.first) {
        selectStructure(searchEl.dataset.first, { focus: true });
      }
      if (e.key === "Escape") clearSearch();
    });

    searchClear.addEventListener("click", clearSearch);
  }
  function clearSearch() {
    searchEl.value = "";
    searchEl.dispatchEvent(new Event("input"));
  }

  function initTreeMode() {
    document.querySelectorAll("#tree-mode button").forEach((b) => {
      b.addEventListener("click", () => {
        if (State.treeMode === b.dataset.mode) return;
        State.treeMode = b.dataset.mode;
        document.querySelectorAll("#tree-mode button").forEach((x) => {
          const on = x.dataset.mode === State.treeMode;
          x.classList.toggle("on", on);
          x.setAttribute("aria-selected", on ? "true" : "false");
        });
        buildTree();
        clearSearch();
        if (State.selected) highlightTreeRow(State.selected);
      });
    });
  }

  // --------------------------------------------------------- layer panel
  const layersEl = document.getElementById("layers");
  function layerDefs() {
    return MODEL_SET.concat(State.customSystems);
  }
  function buildLayers() {
    layersEl.innerHTML = "";
    layerDefs().forEach((cfg) => {
      const hex = "#" + cfg.color.toString(16).padStart(6, "0");
      const on = State.systemEnabled.has(cfg.id);
      const loading = State.loading.has(cfg.id);
      const sys = ACTIVE.index && ACTIVE.systems.find((s) => s.id === cfg.id);
      const count = sys ? sys.regions.reduce((n, r) => n + r.structures.length, 0) : null;
      const shortName = cfg.name.replace(/ (system|organs).*$/i, "");
      const pill = document.createElement("button");
      pill.className = "layer-pill" + (on ? " on" : "");
      pill.title = cfg.name + (count != null ? " — " + count + " structures" : "");
      pill.innerHTML = `
        <span class="dot" style="background:${hex}"></span>
        <span class="lp-name">${shortName}</span>
        ${loading ? '<span class="layer-spinner"></span>' : count != null && on ? `<span class="lp-count">${count}</span>` : ""}`;
      pill.addEventListener("click", () => toggleSystem(cfg, !State.systemEnabled.has(cfg.id)));
      layersEl.appendChild(pill);
    });
  }

  function updateXraySlider() {
    const xs = document.getElementById("xray-slider");
    if (xs) xs.value = Math.round((1 - State.xray) * 100);
  }

  function toggleSystem(cfg, on) {
    if (on) {
      State.systemEnabled.add(cfg.id);
      persistState();
      ensureSystem(cfg).then(() => {
        applyVisibility();
      });
    } else {
      State.systemEnabled.delete(cfg.id);
      persistState();
      applyVisibility();
    }
  }

  function setXray(v) {
    State.xray = Math.max(0.08, Math.min(1, v));
    updateXraySlider();
    refreshMaterials();
    persistState();
  }

  // --------------------------------------------------------- control bar
  function initToolbar() {
    const xs = document.getElementById("xray-slider");
    if (xs) xs.addEventListener("input", (e) => setXray(1 - e.target.value / 100));
    document.getElementById("btn-reset").addEventListener("click", resetView);
    document.getElementById("btn-show-all").addEventListener("click", () => {
      State.hidden.clear();
      // Keep the investing fascia sheets (fascia lata, brachial/abdominal
      // fascia, aponeuroses…) hidden — otherwise they drape over and visually
      // "whiten" the muscle bellies. "Show all" still reveals every system and
      // any muscle you'd hidden; the fascia stay out of the way and remain
      // individually selectable (use a fascia's "Show" button to reveal it).
      State.autoHidden = State.autoHidden || new Set();
      Object.values(ACTIVE.index).forEach((st) => {
        if (st.defaultHidden) { State.hidden.add(st.id); State.autoHidden.add(st.id); }
      });
      State.isolateId = null;
      State.xray = 1;
      updateXraySlider();
      layerDefs().forEach((cfg) => {
        State.systemEnabled.add(cfg.id);
        ensureSystem(cfg).then(applyVisibility);
      });
      persistState();
      buildLayers();
      applyVisibility();
      updateIsolateBanner();
      if (State.selected) renderInfo(State.selected);
    });
    const lbl = document.getElementById("toggle-labels");
    lbl.addEventListener("change", (e) => {
      State.showLabels = e.target.checked;
      if (!State.showLabels) labelEl.style.display = "none";
    });
    document.getElementById("isolate-exit").addEventListener("click", () => {
      State.isolateId = null;
      applyVisibility();
      updateIsolateBanner();
      if (State.selected) renderInfo(State.selected);
    });

    // anatomical view cube (ANT / POS / LAT / MED / SUP / INF + recenter)
    document.querySelectorAll("#view-cube [data-view]").forEach((b) => {
      b.addEventListener("click", () => (b.dataset.view === "reset" ? resetView() : setView(b.dataset.view)));
    });

    // GLB drop-in
    const fileInput = document.getElementById("glb-file");
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) loadGLB(URL.createObjectURL(file), file.name);
    });

    // mobile drawers
    const navToggle = document.getElementById("nav-toggle");
    if (navToggle) navToggle.addEventListener("click", () => document.body.classList.toggle("nav-open"));
    const infoClose = document.getElementById("info-close");
    if (infoClose) infoClose.addEventListener("click", () => document.body.classList.remove("has-selection"));
    const scrim = document.getElementById("scrim");
    if (scrim)
      scrim.addEventListener("click", () => {
        document.body.classList.remove("nav-open");
        document.body.classList.remove("has-selection");
      });
  }

  function resetView() {
    animateCamera(new THREE.Vector3(0, 0.15, 3.1), new THREE.Vector3(0, 0, 0));
  }

  // Snap to a standard anatomical view around the current pivot (the selected
  // structure if focused, else the body centre), keeping the distance.
  // Front = +Z (anterior), up = +Y, the model's right = +X. The camera ARCS
  // around the pivot on a sphere — it never lerps through the centre (which
  // would break OrbitControls), so the distance stays constant.
  function setView(which) {
    if (!State.model) return;
    const dirs = {
      ant: [0, 0, 1], pos: [0, 0, -1],
      lat: [1, 0, 0], med: [-1, 0, 0],
      sup: [0, 1, 0.04], inf: [0, -1, 0.04], // slight tilt off the vertical pole
    };
    const v = dirs[which];
    if (!v) return;
    const t = controls.target.clone();
    const r = camera.position.distanceTo(t) || 3.1;
    const cur = new THREE.Spherical().setFromVector3(camera.position.clone().sub(t));
    const dst = new THREE.Spherical().setFromVector3(new THREE.Vector3(v[0], v[1], v[2]).normalize().multiplyScalar(r));
    let dTheta = dst.theta - cur.theta; // take the short way around
    while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
    while (dTheta < -Math.PI) dTheta += 2 * Math.PI;
    camAnim = null; // cancel any in-flight fly-to
    orbitAnim = { tgt: t, r0: cur.radius, r1: r, p0: cur.phi, p1: dst.phi, t0: cur.theta, t1: cur.theta + dTheta, t: 0 };
    if (reduceMotion) { applyOrbit(1); orbitAnim = null; }
  }
  function applyOrbit(e) {
    const a = orbitAnim;
    const sph = new THREE.Spherical(
      a.r0 + (a.r1 - a.r0) * e,
      Math.max(0.04, Math.min(Math.PI - 0.04, a.p0 + (a.p1 - a.p0) * e)),
      a.t0 + (a.t1 - a.t0) * e
    );
    camera.position.copy(a.tgt).add(new THREE.Vector3().setFromSpherical(sph));
    controls.target.copy(a.tgt);
  }

  function updateIsolateBanner() {
    const banner = document.getElementById("isolate-banner");
    if (State.isolateId) {
      const st = ACTIVE.index[State.isolateId];
      document.getElementById("isolate-name").textContent = st ? st.name : "";
      banner.style.display = "flex";
    } else {
      banner.style.display = "none";
    }
  }

  // ------------------------------------------------------------ Load GLB
  // Additive: a user-loaded GLB becomes a new system/layer alongside the rest.
  function loadGLB(url, label) {
    const base = (label || "model").replace(/\.(glb|gltf)$/i, "");
    const id = "custom-" + base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + (State.customSystems.length + 1);
    const cfg = { file: url, id, name: base || "Loaded model", color: 0x8ec5ff, opacity: 1, on: true };
    State.customSystems.push(cfg);
    State.systemEnabled.add(id);
    const status = document.getElementById("glb-status");
    status.textContent = "Loading " + base + "…";
    return ensureSystem(cfg).then(() => {
      applyVisibility();
      status.textContent = "Added “" + cfg.name + "” as a new layer.";
    });
  }

  // ------------------------------------------------------------- labels
  function updateLabel() {
    if (!State.showLabels || !State.labelTarget || !State.selected) {
      labelEl.style.display = "none";
      return;
    }
    // hide label if the structure is currently not visible
    const nodes = State.model.meshesByStructure[State.selected] || [];
    if (!nodes.some((n) => n.visible)) {
      labelEl.style.display = "none";
      return;
    }
    const v = State.labelTarget.clone().project(camera);
    if (v.z > 1) {
      labelEl.style.display = "none";
      return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (v.x * 0.5 + 0.5) * rect.width;
    const y = Math.max(46, (-v.y * 0.5 + 0.5) * rect.height); // keep clear of top bar
    const st = ACTIVE.index[State.selected];
    labelEl.textContent = st ? st.name : "";
    labelEl.style.display = "block";
    labelEl.style.left = x + "px";
    labelEl.style.top = y + "px";
  }

  // --------------------------------------------------------------- loop
  function animate() {
    requestAnimationFrame(animate);
    let changed = false;
    if (camAnim) {
      camAnim.t = Math.min(1, camAnim.t + 0.06);
      const e = easeInOut(camAnim.t);
      camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, e);
      controls.target.lerpVectors(camAnim.fromTarget, camAnim.toTarget, e);
      if (camAnim.t >= 1) camAnim = null;
      changed = true;
    }
    if (orbitAnim) {
      orbitAnim.t = Math.min(1, orbitAnim.t + 0.07);
      applyOrbit(easeInOut(orbitAnim.t));
      if (orbitAnim.t >= 1) orbitAnim = null;
      changed = true;
    }
    if (controls.update()) changed = true; // true while damping/moving
    if (dirty || changed) {
      dirty = false;
      updateLabel();
      if (composer) composer.render();
      else renderer.render(scene, camera);
    }
  }
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    // default layers: everything on except muscular (reduces clutter)
    ACTIVE.systems.forEach((s) => State.systemEnabled.add(s.id));
    State.systemEnabled.delete("muscular");

    initThree();
    State.model = window.AnatomyBodyModel.build(THREE);
    scene.add(State.model.group);

    buildTree();
    buildLayers();
    initSearch();
    initTreeMode();
    initToolbar();
    attachClick();
    applyVisibility();
    animate();

    // helpful first selection (placeholder)
    selectStructure("heart", { focus: false });

    document.getElementById("structure-total").textContent =
      Object.keys(ACTIVE.index).length + " structures";

    maybeAutoLoadModel();
  }

  // The bundled Z-Anatomy systems. Each is its own GLB; loaded together they
  // form the full body. Soft tissue is semi-transparent so layers read well.
  const MODEL_SET = [
    { file: "models/z-anatomy-skeleton.glb", id: "skeletal", name: "Skeletal system", color: 0xece4d2, opacity: 1, on: true },
    { file: "models/z-anatomy-muscular.glb", id: "muscular", name: "Muscular system", color: 0xb14a3f, opacity: 1, on: false },
    { file: "models/z-anatomy-cardiovascular.glb", id: "cardiovascular", name: "Cardiovascular system", color: 0xc0392b, opacity: 0.95, on: false },
    { file: "models/z-anatomy-nervous.glb", id: "nervous", name: "Nervous system & senses", color: 0xe6c84d, opacity: 0.9, on: false },
    { file: "models/z-anatomy-visceral.glb", id: "visceral", name: "Visceral organs", color: 0xc98a55, opacity: 0.92, on: false },
    { file: "models/skin.glb?v=2", id: "skin", name: "Skin", color: 0xe3ad92, opacity: 1, on: false },
  ];

  // Eyes: a tiny always-on overlay (sclera/cornea/iris/lens) so the figure has
  // real eyeballs seated in the orbits in every view. Not a toggle pill — it
  // loads on boot and stays on; its parts are still selectable/searchable.
  const EYES_CFG = { file: "models/eyes.glb", id: "eyes", name: "Eyes", color: 0xffffff, opacity: 1, on: true };

  // Merge the loaded systems into one model. The fit (scale + center) is derived
  // ONCE from the skeleton and reused, so systems stay aligned and adding a
  // system later doesn't make the body jump/resize.
  function mergeModels(items) {
    const inner = new THREE.Group();
    const meshesByStructure = {};
    const allMeshes = [];
    const systems = [];
    const index = {};
    items.forEach(({ loaded }) => {
      inner.add(loaded.group);
      Object.assign(meshesByStructure, loaded.meshesByStructure);
      loaded.allMeshes.forEach((m) => allMeshes.push(m));
      loaded.catalog.systems.forEach((s) => systems.push(s));
      Object.assign(index, loaded.catalog.index);
    });

    // The fit (scale + centre) MUST come from the skeleton so the whole body is
    // sized correctly. A small overlay (e.g. eyes) can finish loading first, so
    // only LOCK the fit once the skeleton is present; until then use a temporary
    // fit for this frame and recompute when the skeleton arrives.
    let fit = State.fit;
    if (!fit) {
      const skel = items.find((it) => it.cfg.id === "skeletal");
      const ref = (skel || items[0]).loaded.group;
      ref.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(ref);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      fit = { scale: size.y > 0 ? 1.8 / size.y : 1, center: center };
      if (skel) State.fit = fit; // lock only to the skeleton
    }
    inner.position.sub(fit.center);
    const group = new THREE.Group();
    group.add(inner);
    group.scale.setScalar(fit.scale);
    group.updateMatrixWorld(true);
    return {
      group,
      meshesByStructure,
      allMeshes,
      catalog: { systems, index },
      stats: { structures: Object.keys(index).length, systems: systems.length, nodes: allMeshes.length },
    };
  }

  // Rebuild the combined model + catalog from whatever systems are loaded.
  function rebuildModel() {
    if (State.model && State.model.group && State.model.group.parent) {
      scene.remove(State.model.group);
    }
    const merged = mergeModels(State.loadedItems);
    State.model = merged;
    scene.add(merged.group);
    ACTIVE = merged.catalog;
    // Auto-hide structures flagged hidden-by-default (investing fascia sheets)
    // ONCE each, so the muscle bellies show; if the user later reveals one it
    // won't be re-hidden on a subsequent system load.
    State.autoHidden = State.autoHidden || new Set();
    Object.values(ACTIVE.index).forEach((st) => {
      if (st.defaultHidden && !State.autoHidden.has(st.id)) {
        State.hidden.add(st.id);
        State.autoHidden.add(st.id);
      }
    });
    buildTree();
    buildLayers();
    buildSearchIndex();
    renderQuickLists();
    applyVisibility();
    document.getElementById("structure-total").textContent = merged.stats.structures + " structures";
  }

  // Load one system's GLB if not already loaded (returns a Promise).
  function ensureSystem(cfg) {
    if (State.loadedSystems.has(cfg.id)) return Promise.resolve();
    if (State._pending && State._pending[cfg.id]) return State._pending[cfg.id];
    State._pending = State._pending || {};
    State.loading.add(cfg.id);
    buildLayers();
    const p = AnatomyGLB.load(cfg.file, {
      systemId: cfg.id,
      systemName: cfg.name,
      systemColor: cfg.color,
      systemOpacity: cfg.opacity,
      fit: false,
    })
      .then((loaded) => {
        State.loadedItems.push({ loaded, cfg });
        State.loadedSystems.add(cfg.id);
        rebuildModel();
      })
      .catch((e) => {
        console.warn("Failed to load " + cfg.file, e);
        document.getElementById("glb-status").textContent = "Couldn't load " + cfg.name + ".";
      })
      .finally(() => {
        State.loading.delete(cfg.id);
        delete State._pending[cfg.id];
        buildLayers();
      });
    State._pending[cfg.id] = p;
    return p;
  }

  function showLoading(on, text) {
    const el = document.getElementById("loading");
    if (!el) return;
    el.classList.toggle("hidden", !on);
    const t = el.querySelector(".loading-text");
    if (t && text) t.textContent = text;
  }

  // Boot the real model: load the skeleton first (fast), then apply any saved
  // layers (which lazy-load their systems) and an optional ?structure= deep link.
  function maybeAutoLoadModel() {
    const status = document.getElementById("glb-status");
    if (location.protocol === "file:") {
      status.innerHTML =
        'Tip: launch <code>serve.command</code> to load the full Z-Anatomy body — or use “Load GLB…”.';
      return;
    }
    const saved = loadPersisted();
    showLoading(true, "Loading skeleton…");
    State.systemEnabled = new Set(["skeletal", "eyes"]);
    ensureSystem(MODEL_SET[0]).then(() => {
      ensureSystem(EYES_CFG).then(applyVisibility); // eyeballs AFTER the skeleton fixes the fit/scale
      State.ready = true; // real model is in; persistence is now meaningful
      State.selected = null;
      State.labelTarget = null;
      document.body.classList.remove("has-selection"); // clear placeholder selection
      State.hidden.clear();
      State.isolateId = null;
      clearSearch();
      updateIsolateBanner();
      infoEl.innerHTML =
        '<div class="info-empty"><p>Z-Anatomy loaded. Toggle systems in the <strong>bottom bar</strong>, drag <strong>X-ray</strong> to see through them, and click or search any structure.</p></div>';
      resetView();
      showLoading(false);
      status.textContent = "Skeleton loaded — add systems from the bottom bar.";

      // restore saved view (xray + extra layers), then deep link
      if (saved) {
        // mark all saved systems enabled FIRST so persistence doesn't clobber them
        (saved.enabled || []).forEach((id) => State.systemEnabled.add(id));
        if (typeof saved.xray === "number") State.xray = Math.max(0.08, Math.min(1, saved.xray));
        buildLayers();
        updateXraySlider();
        refreshMaterials();
        persistState();
        // then lazy-load the extra systems
        (saved.enabled || []).forEach((id) => {
          if (id === "skeletal") return;
          const cfg = MODEL_SET.find((c) => c.id === id);
          if (cfg) ensureSystem(cfg).then(applyVisibility);
        });
      }
      const deep = new URLSearchParams(location.search).get("structure");
      if (deep) {
        const d = deep.toLowerCase();
        const id = ACTIVE.index[deep]
          ? deep
          : Object.keys(ACTIVE.index).find(
              (k) => ACTIVE.index[k].key === d || ACTIVE.index[k].name.toLowerCase() === d
            );
        if (id) selectStructure(id, { focus: true });
      }
    });
  }

  // ----------------------------------------------------- persistence
  function persistState() {
    if (!State.ready) return; // don't save the transient placeholder phase
    try {
      localStorage.setItem(
        "atlas.state",
        JSON.stringify({ enabled: [...State.systemEnabled], xray: State.xray, selected: State.selected })
      );
    } catch (e) {}
  }
  function loadPersisted() {
    try {
      return JSON.parse(localStorage.getItem("atlas.state") || "null");
    } catch (e) {
      return null;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
