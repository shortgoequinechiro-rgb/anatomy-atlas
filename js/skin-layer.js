/* =====================================================================
   Human Anatomy Atlas — Skin Layer (self-contained add-on)
   ---------------------------------------------------------------------
   Adds a toggleable, X-ray-fadeable skin shell over the anatomy so the
   figure can read as a real human body. ORIGINAL procedural geometry +
   a procedurally generated pore bump map (no external assets). This file
   is fully independent of app.js: it captures the live scene/camera by
   wrapping THREE.RenderPass (constructed by app.js when it builds the
   post-processing composer), then injects its own "Skin" toolbar toggle
   and ties the shell's opacity to the existing X-ray slider.
   ===================================================================== */
(function () {
  "use strict";
  if (typeof THREE === "undefined" || !THREE.RenderPass) return;

  var captured = { scene: null, camera: null };

  // --- capture the app's scene + camera the moment app.js builds its RenderPass
  var _RenderPass = THREE.RenderPass;
  function RenderPassWrap(scene, camera) {
    captured.scene = scene;
    captured.camera = camera;
    return new _RenderPass(scene, camera);
  }
  RenderPassWrap.prototype = _RenderPass.prototype;
  THREE.RenderPass = RenderPassWrap;

  // ---------------------------------------------------- procedural pore bump
  function makePoreBump() {
    var s = 256;
    var c = document.createElement("canvas");
    c.width = c.height = s;
    var ctx = c.getContext("2d");
    var img = ctx.createImageData(s, s);
    // value-noise field, mildly smoothed, mapped to grey — reads as fine pores
    var grid = 64;
    var rnd = new Float32Array((grid + 1) * (grid + 1));
    for (var i = 0; i < rnd.length; i++) rnd[i] = Math.random();
    function sample(x, y) {
      var gx = (x / s) * grid, gy = (y / s) * grid;
      var x0 = Math.floor(gx), y0 = Math.floor(gy);
      var fx = gx - x0, fy = gy - y0;
      var a = rnd[y0 * (grid + 1) + x0], b = rnd[y0 * (grid + 1) + x0 + 1];
      var cc = rnd[(y0 + 1) * (grid + 1) + x0], d = rnd[(y0 + 1) * (grid + 1) + x0 + 1];
      var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      return (a * (1 - ux) + b * ux) * (1 - uy) + (cc * (1 - ux) + d * ux) * uy;
    }
    for (var y = 0; y < s; y++) {
      for (var x = 0; x < s; x++) {
        // two octaves + a touch of high-freq speckle for skin texture
        var v = 0.6 * sample(x, y) + 0.3 * sample(x * 2 % s, y * 2 % s) + 0.1 * Math.random();
        var g = Math.max(0, Math.min(255, Math.round(150 + (v - 0.5) * 150)));
        var o = (y * s + x) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = g;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 10);
    return tex;
  }

  // ---------------------------------------------------- skin material
  var bump = makePoreBump();
  var skinMat = new THREE.MeshStandardMaterial({
    color: 0xe3ad92,        // warm mid skin tone
    roughness: 0.72,
    metalness: 0.0,
    bumpMap: bump,
    bumpScale: 0.0016,
    transparent: true,
    opacity: 0.97,
    depthWrite: true,
  });
  skinMat.emissive = new THREE.Color(0x4a1d16); // faint warm interior glow ~ subsurface
  skinMat.emissiveIntensity = 0.14;

  // ---------------------------------------------------- geometry helpers
  var group = new THREE.Group();
  group.visible = false;
  group.renderOrder = 2;

  function addMesh(geo) {
    var m = new THREE.Mesh(geo, skinMat);
    m.userData.isSkin = true;
    group.add(m);
    return m;
  }
  function ball(x, y, z, r, sx, sy, sz) {
    var g = new THREE.SphereGeometry(r, 24, 18);
    g.scale(sx || 1, sy || 1, sz || 1);
    g.translate(x, y, z);
    addMesh(g);
  }
  // tapered limb between two points (rTop at p1, rBot at p0)
  function limb(p0, r0, p1, r1) {
    var a = new THREE.Vector3(p0[0], p0[1], p0[2]);
    var b = new THREE.Vector3(p1[0], p1[1], p1[2]);
    var dir = new THREE.Vector3().subVectors(b, a);
    var len = dir.length();
    var g = new THREE.CylinderGeometry(r1, r0, len, 18, 1, false);
    var q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize()
    );
    g.applyQuaternion(q);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    addMesh(g);
  }

  // ---------------------------------------------------- build the body shell
  // Units match the loaded model (fit to ~1.8 tall, centred at origin; feet
  // near y=-0.9, head near y=+0.88). Proportions are intentionally a touch
  // generous so the shell encloses the anatomy.
  function buildBody() {
    // torso (lathe profile, flattened front-to-back)
    var prof = [
      [0.085, -0.18], [0.15, -0.08], [0.165, 0.04], [0.13, 0.18],
      [0.15, 0.34], [0.175, 0.5], [0.18, 0.6], [0.06, 0.66],
    ].map(function (p) { return new THREE.Vector2(p[0], p[1]); });
    var torso = new THREE.LatheGeometry(prof, 28);
    torso.scale(1.04, 1.0, 0.66); // widen a hair, flatten depth
    addMesh(torso);

    // pelvis / glutes cap (closes lathe bottom)
    ball(0, -0.17, 0, 0.17, 1.04, 0.62, 0.66);
    // chest/shoulder cap (closes lathe top)
    ball(0, 0.58, 0, 0.17, 1.06, 0.55, 0.66);

    // neck + head
    limb([0, 0.6, 0.005], 0.052, [0, 0.7, 0.012], 0.05);
    ball(0, 0.79, 0.015, 0.108, 0.92, 1.12, 1.0);

    // arms (both sides)
    [1, -1].forEach(function (s) {
      ball(s * 0.175, 0.585, 0, 0.062);                          // shoulder
      limb([s * 0.175, 0.585, 0], 0.058, [s * 0.205, 0.285, 0], 0.046); // upper arm
      ball(s * 0.205, 0.285, 0, 0.05);                            // elbow
      limb([s * 0.205, 0.285, 0], 0.046, [s * 0.215, 0.0, 0.01], 0.036); // forearm
      ball(s * 0.218, -0.06, 0.012, 0.055, 1.0, 1.25, 0.5);       // hand
    });

    // legs (both sides)
    [1, -1].forEach(function (s) {
      limb([s * 0.082, -0.05, 0], 0.092, [s * 0.088, -0.46, 0], 0.062); // thigh
      ball(s * 0.088, -0.46, 0, 0.058);                                  // knee
      limb([s * 0.088, -0.46, 0], 0.06, [s * 0.092, -0.85, 0.0], 0.038); // shin
      ball(s * 0.092, -0.88, 0.045, 0.06, 1.0, 0.6, 1.7);                // foot
    });

    group.traverse(function (n) {
      if (n.isMesh && n.geometry.computeVertexNormals) n.geometry.computeVertexNormals();
    });
  }
  buildBody();

  // ---------------------------------------------------- attach + controls
  var STATE = { on: false, xray: 0 };

  function kick() {
    // app uses on-demand rendering; nudge it to redraw (onResize -> requestRender)
    window.dispatchEvent(new Event("resize"));
  }

  function applyOpacity() {
    // skin fades as X-ray increases so the anatomy reads through it
    var fade = 1 - (STATE.xray / 90) * 0.97;
    var op = 0.97 * Math.max(0.04, fade);
    skinMat.opacity = op;
    skinMat.depthWrite = op > 0.9;
    group.visible = STATE.on;
    kick();
  }

  function makeToggle() {
    var actions = document.querySelector("#toolbar-bar .tb-actions");
    if (!actions) return;
    var btn = document.createElement("button");
    btn.id = "btn-skin";
    btn.className = "btn ghost";
    btn.type = "button";
    btn.textContent = "Skin";
    btn.title = "Toggle a skin layer over the body (use X-ray to fade it)";
    btn.style.fontWeight = "600";
    btn.addEventListener("click", function () {
      STATE.on = !STATE.on;
      btn.style.background = STATE.on ? "rgba(227,173,146,0.22)" : "";
      btn.style.borderColor = STATE.on ? "rgba(227,173,146,0.65)" : "";
      btn.style.color = STATE.on ? "#f0cbb8" : "";
      applyOpacity();
    });
    // place it just before "Show all" for discoverability
    var showAll = document.getElementById("btn-show-all");
    if (showAll) actions.insertBefore(btn, showAll);
    else actions.appendChild(btn);

    var xs = document.getElementById("xray-slider");
    if (xs) {
      xs.addEventListener("input", function (e) {
        STATE.xray = +e.target.value || 0;
        if (STATE.on) applyOpacity();
      });
      STATE.xray = +xs.value || 0;
    }
  }

  function attach() {
    if (!captured.scene) return false;
    if (!group.parent) captured.scene.add(group);
    return true;
  }

  // Wait until the app has created its scene + toolbar, then wire everything up.
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    var ok = attach();
    var bar = document.querySelector("#toolbar-bar .tb-actions");
    if (ok && bar && !document.getElementById("btn-skin")) makeToggle();
    if ((ok && document.getElementById("btn-skin")) || tries > 200) {
      clearInterval(iv);
      applyOpacity();
    }
  }, 150);
})();
