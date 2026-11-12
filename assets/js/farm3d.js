/* Narrin Farms — scroll-driven 3D farm tour (three.js r149)
 *
 * The model is built from the farm's real layout (assets/js/farm-layout.js),
 * traced from a satellite view: Narrin Lake and its wooded shoreline, the marsh, the dock, the homes along the drive, the long barn and
 * outbuildings, the two riding arenas and the pastures. Units are metres,
 * x = east, z = south.
 */
(function () {
  "use strict";
  var stage = document.querySelector(".tour-stage");
  if (!stage) return;
  var canvas = stage.querySelector(".tour-canvas");
  var tourRoot = document.querySelector(".tour");
  var L = window.FARM_LAYOUT;

  function hasWebGL() {
    try { var c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); }
    catch (e) { return false; }
  }
  if (!window.THREE || !L || !hasWebGL()) { tourRoot.classList.add("no-webgl"); return; }

  var T = window.THREE;
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var small = window.innerWidth < 760;

  var seed = 11;
  function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function rr(a, b) { return a + rand() * (b - a); }

  /* ---------- layout grid lookups ---------- */
  var G = L.grid, SW = L.size[0], SH = L.size[1];
  function cellAt(x, z) {
    var gx = Math.floor((x + SW / 2) / G.cell), gz = Math.floor((z + SH / 2) / G.cell);
    if (gx < 0 || gz < 0 || gx >= G.w || gz >= G.h) return -1;
    return gz * G.w + gx;
  }
  function cls(x, z) { var i = cellAt(x, z); return i < 0 ? 0 : +G.cls[i]; } // 0 woods, 1 open, 2 marsh, 3 water
  function wat(x, z) { // smoothed water amount 0..1, bilinear
    var fx = (x + SW / 2) / G.cell - 0.5, fz = (z + SH / 2) / G.cell - 0.5;
    var x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
    function v(a, b) { if (a < 0 || b < 0 || a >= G.w || b >= G.h) return 0; return +G.water[b * G.w + a] / 9; }
    return (v(x0, z0) * (1 - tx) + v(x0 + 1, z0) * tx) * (1 - tz) + (v(x0, z0 + 1) * (1 - tx) + v(x0 + 1, z0 + 1) * tx) * tz;
  }
  function height(x, z) {
    var n = 0.9 * Math.sin(x * 0.013) * Math.cos(z * 0.011) + 0.5 * Math.sin((x + z) * 0.021);
    return 1.6 + n - wat(x, z) * 4.6;
  }

  /* ---------- renderer / scene ---------- */
  var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;

  var scene = new T.Scene();
  var DAY_SKY = new T.Color("#bcd2d8"), DUSK_SKY = new T.Color("#e5a57e"), NIGHT_SKY = new T.Color("#3d4058");
  scene.background = DAY_SKY.clone();
  scene.fog = new T.Fog(DAY_SKY.clone(), 700, 1700);
  var camera = new T.PerspectiveCamera(42, 1, 1, 4000);

  var hemi = new T.HemisphereLight("#f4efe0", "#3b4a35", 0.8);
  scene.add(hemi);
  var sun = new T.DirectionalLight("#fff1d6", 1.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  var sc = sun.shadow.camera; sc.left = -480; sc.right = 480; sc.top = 480; sc.bottom = -480; sc.near = 10; sc.far = 1500;
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);

  /* ---------- ground (painted from the satellite trace) ---------- */
  (function () {
    var g = new T.PlaneGeometry(SW, SH, G.w, G.h);
    g.rotateX(-Math.PI / 2);
    var pos = g.attributes.position;
    for (var i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
    g.computeVertexNormals();
    var tex = new T.TextureLoader().load("assets/img/farm-ground.jpg");
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    var m = new T.Mesh(g, new T.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    m.receiveShadow = true; scene.add(m);
    // the woods continue beyond the traced area
    var out = new T.Mesh(new T.RingGeometry(Math.min(SW, SH) * 0.5, 2600, 64, 1), new T.MeshStandardMaterial({ color: "#3d5230", roughness: 1 }));
    out.rotation.x = -Math.PI / 2; out.position.y = 1.3; out.receiveShadow = true; scene.add(out);
    var corners = new T.Mesh(new T.PlaneGeometry(SW + 2, SH + 2), new T.MeshStandardMaterial({ color: "#3d5230", roughness: 1 }));
    corners.rotation.x = -Math.PI / 2; corners.position.y = 0.2; scene.add(corners);
  })();

  /* ---------- Narrin Lake ---------- */
  var lakeMinX = 1e9, lakeMaxX = -1e9, lakeMinZ = 1e9, lakeMaxZ = -1e9, waterCells = [];
  for (var gz = 0; gz < G.h; gz++) for (var gx = 0; gx < G.w; gx++) {
    if (G.cls[gz * G.w + gx] === "3") {
      var wx = -SW / 2 + (gx + 0.5) * G.cell, wz = -SH / 2 + (gz + 0.5) * G.cell;
      waterCells.push([wx, wz]);
      lakeMinX = Math.min(lakeMinX, wx); lakeMaxX = Math.max(lakeMaxX, wx); lakeMinZ = Math.min(lakeMinZ, wz); lakeMaxZ = Math.max(lakeMaxZ, wz);
    }
  }
  var water = new T.Mesh(new T.PlaneGeometry(lakeMaxX - lakeMinX + 60, lakeMaxZ - lakeMinZ + 60),
    new T.MeshStandardMaterial({ color: "#2d4f58", roughness: 0.1, metalness: 0.5 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set((lakeMinX + lakeMaxX) / 2, 0.3, (lakeMinZ + lakeMaxZ) / 2);
  water.receiveShadow = true; scene.add(water);
  var glints;
  (function () {
    var gp = [];
    for (var i = 0; i < 260; i++) { var c = waterCells[Math.floor(rand() * waterCells.length)]; gp.push(c[0] + rr(-2, 2), 0.5, c[1] + rr(-2, 2)); }
    var g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(gp, 3));
    glints = new T.Points(g, new T.PointsMaterial({ color: "#fff6dc", size: 1.4, transparent: true, opacity: 0.5, depthWrite: false }));
    scene.add(glints);
  })();

  /* ---------- helpers ---------- */
  var MAT = {};
  function mat(color, opts) {
    var key = color + JSON.stringify(opts || {});
    if (!MAT[key]) MAT[key] = new T.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.85 }, opts || {}));
    return MAT[key];
  }
  var windowMats = [];
  function winMat() { var m = new T.MeshStandardMaterial({ color: "#2a2a24", emissive: "#ffc77a", emissiveIntensity: 0.1, roughness: 0.3 }); windowMats.push(m); return m; }
  var WIN = winMat();
  function box(w, h, d, m, x, y, z) {
    var b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x || 0, y || 0, z || 0);
    b.castShadow = true; b.receiveShadow = true; return b;
  }
  function prism(w, h, d, m) {
    var s = new T.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
    var g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
    var p = new T.Mesh(g, m); p.castShadow = true; p.receiveShadow = true; return p;
  }
  var stringBulbs = [];
  var reserved = []; // [x, z, r] — keep trees off buildings, docks and roads

  /* ---------- buildings (real footprints) ---------- */
  L.buildings.forEach(function (b) {
    var g = new T.Group();
    var w = b.w, d = b.d;
    if (b.kind === "barn") {
      // white walls, black roof (all of the farm's barns)
      var bh = w > 30 ? 6.5 : w > 14 ? 5.5 : 4;
      g.add(box(w, bh, d, mat("#f1efe9"), 0, bh / 2 - 0.5, 0));
      var r = prism(d + 1, Math.min(4.5, d * 0.32), w + 1, mat("#1d1f21")); r.rotation.y = Math.PI / 2; r.position.y = bh - 0.5; g.add(r);
      if (w > 30) for (var i = -3; i <= 3; i++) g.add(box(2.2, 1.2, 0.2, WIN, i * (w / 8), bh - 2, d / 2 + 0.05));
      if (w > 12) g.add(box(Math.min(4, w * 0.3), Math.min(4.5, bh - 1), 0.3, mat("#2b2d2f"), w > 30 ? w / 2 - 6 : 0, (Math.min(4.5, bh - 1)) / 2 - 0.4, d / 2 + 0.1));
    } else if (b.kind === "lodge") {
      // the Lodge: two storeys, brown siding, steep Tudor-style gables; the gabled front
      // (local +z) is rotated in the layout to face the parking court
      g.add(box(w, 7.5, d, mat("#6b5848"), 0, 3, 0));
      var rl = prism(d + 1.2, 5, w + 1.2, mat("#8e9190")); rl.rotation.y = Math.PI / 2; rl.position.y = 6.75; g.add(rl);
      [-w * 0.3, w * 0.02, w * 0.33].forEach(function (x) {
        g.add(box(6.2, 7.5, 1.4, mat("#7c6a56"), x, 3, d / 2 + 0.5));
        var gb = prism(6.8, 5.5, 2.2, mat("#8e9190")); gb.position.set(x, 6.75, d / 2 + 0.6); g.add(gb);
        g.add(box(1.5, 1.8, 0.2, WIN, x - 1.4, 1.8, d / 2 + 1.25));   // ground floor
        g.add(box(1.5, 1.8, 0.2, WIN, x + 1.4, 1.8, d / 2 + 1.25));
        g.add(box(2.2, 2, 0.2, WIN, x, 5.3, d / 2 + 1.25));           // second floor, facing the lot
      });
      g.add(box(2.2, 3, 0.3, mat("#3d3129"), w * 0.17, 1.2, d / 2 + 0.15)); // front door
    } else if (b.kind === "clubhouse") {
      // the Clubhouse: grey board-and-batten, red gable wing, pergola and fire-pit patio
      g.add(box(w * 0.7, 5, d, mat("#6f7468"), -w * 0.15, 2, 0));
      var rc = prism(d + 1, 4, w * 0.7 + 1, mat("#585c5d")); rc.rotation.y = Math.PI / 2; rc.position.set(-w * 0.15, 4.5, 0); g.add(rc);
      g.add(box(w * 0.3, 6.4, d * 0.9, mat("#93402f"), w * 0.35, 2.7, 0));
      var r2 = prism(w * 0.3 + 0.6, 3.6, d * 0.9 + 0.6, mat("#585c5d")); r2.position.set(w * 0.35, 5.9, 0); g.add(r2);
      for (var cw = -2; cw <= 1; cw++) g.add(box(2, 2.2, 0.2, WIN, -w * 0.15 + cw * 3.2, 2.8, d / 2 + 0.05));
      var wood = mat("#8a6844");
      [[-1, 1], [-1, -1], [1, 1], [1, -1]].forEach(function (q2) { g.add(box(0.4, 4.5, 0.4, wood, -w / 2 - 3 + q2[0] * 2.5, 2.2, q2[1] * 2.5)); });
      for (var sl = -3; sl <= 3; sl++) g.add(box(6, 0.25, 0.3, wood, -w / 2 - 3, 4.5, sl * 0.9));
      g.add(box(12, 0.3, 8, mat("#b9ae9c"), 0, 0.1, d / 2 + 6));
      var red = mat("#b23a2a");
      for (var ch = 0; ch < 5; ch++) { var an = ch / 5 * Math.PI * 2; g.add(box(1.2, 1.2, 1.2, red, Math.cos(an) * 3, 0.8, d / 2 + 6 + Math.sin(an) * 3)); }
      var pit = new T.Mesh(new T.CylinderGeometry(1.2, 1.4, 0.8, 14), mat("#5a4c44")); pit.position.set(0, 0.6, d / 2 + 6); g.add(pit);
    } else if (b.kind === "woods") {
      // the Woods: long grey cottage at the edge of the trees
      g.add(box(w, 4.8, d, mat("#7a7f7a"), 0, 2, 0));
      var rw = prism(d + 1.2, 4, w + 1.2, mat("#62686e")); rw.rotation.y = Math.PI / 2; rw.position.y = 4.4; g.add(rw);
      for (var ww = -2; ww <= 2; ww++) g.add(box(1.8, 1.8, 0.2, WIN, ww * (w / 5.5), 2.6, d / 2 + 0.05));
      g.add(box(w * 0.5, 0.4, 4, mat("#8d7357"), 0, 0.3, d / 2 + 2));
    } else if (b.kind === "aframe") {
      // the Grooms: black A-frame with a deck and string lights
      g.add(box(w + 2, 0.5, d + 6, mat("#8f7c63"), 0, 0.25, 3));
      var af = prism(w, 10, d, mat("#2b2d2b")); af.position.y = 0.5; g.add(af);
      var sh = prism(w + 0.8, 10.6, d + 0.4, mat("#6a4a37")); sh.position.y = 0.2; sh.scale.z = 0.98; g.add(sh);
      var tri = new T.Shape(); tri.moveTo(-1.2, 6); tri.lineTo(1.2, 6); tri.lineTo(0, 8.2); tri.lineTo(-1.2, 6);
      var tm = new T.Mesh(new T.ShapeGeometry(tri), WIN); tm.position.z = d / 2 + 0.25; g.add(tm);
      g.add(box(2.6, 2, 0.2, WIN, -1.4, 2.6, d / 2 + 0.25));
      var bulb = mat("#ffd89a", { emissive: "#ffd89a", emissiveIntensity: 1 }); stringBulbs.push(bulb);
      for (var sb = 0; sb <= 12; sb++) { var tt = sb / 12; var bl = new T.Mesh(new T.SphereGeometry(0.22, 6, 5), bulb); bl.position.set(tt * 5, 10 - tt * 4 - Math.sin(tt * Math.PI) * 1.3, d / 2 + tt * 6); g.add(bl); }
      g.add(box(0.3, 6, 0.3, mat("#333"), 5, 3, d / 2 + 6));
    } else {
      g.add(box(w, 4.5, d, mat("#a9a59b"), 0, 1.8, 0));
      var rs = prism(d + 0.8, Math.min(3, d * 0.35), w + 0.8, mat("#e0ddd6")); rs.rotation.y = Math.PI / 2; rs.position.y = 4; g.add(rs);
    }
    g.position.set(b.x, height(b.x, b.z), b.z);
    g.rotation.y = b.rot || 0;
    scene.add(g);
    reserved.push([b.x, b.z, Math.max(w, d) * 0.6 + (b.name ? 12 : 4)]);
  });
  var P = L.points;

  /* ---------- fences: arenas, pastures ---------- */
  (function () {
    var posts = [], rails = [];
    function seg(a, b, spacing) {
      var len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / spacing));
      for (var i = 0; i <= n; i++) {
        var t = i / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        posts.push([x, height(x, z) + 0.7, z]);
        if (i < n) {
          var t2 = (i + 1) / n, x2 = a[0] + (b[0] - a[0]) * t2, z2 = a[1] + (b[1] - a[1]) * t2;
          [0.7, 1.3].forEach(function (hh) {
            rails.push({ x: (x + x2) / 2, y: (height(x, z) + height(x2, z2)) / 2 + hh, z: (z + z2) / 2, len: Math.hypot(x2 - x, z2 - z), ry: -Math.atan2(z2 - z, x2 - x) });
          });
        }
      }
    }
    L.fences.forEach(function (line) { for (var i = 0; i < line.length - 1; i++) seg(line[i], line[i + 1], 3.5); });
    L.arenas.forEach(function (a) {
      var x0 = Math.min(a[0], a[2]), x1 = Math.max(a[0], a[2]), z0 = Math.min(a[1], a[3]), z1 = Math.max(a[1], a[3]);
      seg([x0, z0], [x1, z0], 3); seg([x1, z0], [x1, z1], 3); seg([x1, z1], [x0, z1], 3); seg([x0, z1], [x0, z0], 3);
      reserved.push([(x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) * 0.6]);
    });
    var fm = mat("#f1ece0");
    var pm = new T.InstancedMesh(new T.BoxGeometry(0.25, 1.5, 0.25), fm, posts.length);
    var rm = new T.InstancedMesh(new T.BoxGeometry(1, 0.12, 0.1), fm, rails.length);
    var m4 = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3(), up = new T.Vector3(0, 1, 0);
    posts.forEach(function (pp, i) { m4.makeTranslation(pp[0], pp[1], pp[2]); pm.setMatrixAt(i, m4); });
    rails.forEach(function (r, i) { q.setFromAxisAngle(up, r.ry); s.set(r.len, 1, 1); p.set(r.x, r.y, r.z); m4.compose(p, q, s); rm.setMatrixAt(i, m4); });
    pm.castShadow = rm.castShadow = true; scene.add(pm); scene.add(rm);
  })();

  /* ---------- dock & boardwalk ---------- */
  function planks(line, width, color, y) {
    var pts = [];
    for (var i = 0; i < line.length - 1; i++) {
      var a = line[i], b = line[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(len / 0.9);
      for (var k = 0; k < n; k++) { var t = k / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[0] - a[0], b[1] - a[1])]); }
      reserved.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, len / 2 + 9]);
    }
    var im = new T.InstancedMesh(new T.BoxGeometry(width, 0.2, 0.75), mat(color), pts.length);
    var m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), p = new T.Vector3(), one = new T.Vector3(1, 1, 1);
    pts.forEach(function (pt, i) { q.setFromAxisAngle(up, pt[2]); p.set(pt[0], Math.max(y, height(pt[0], pt[1]) + 0.4), pt[1]); m4.compose(p, q, one); im.setMatrixAt(i, m4); });
    im.castShadow = im.receiveShadow = true; scene.add(im);
  }
  planks(L.dock, 2.2, "#9a8466", 0.9);
  planks(L.boardwalk, 1.8, "#a48b6a", 0.9);

  /* ---------- woods: trees on every wooded cell ---------- */
  (function () {
    function blocked(x, z) {
      for (var i = 0; i < reserved.length; i++) { var r = reserved[i]; if (Math.hypot(x - r[0], z - r[1]) < r[2]) return true; }
      return false;
    }
    var pines = [], leafy = [];
    var density = small ? 0.22 : 0.36;
    for (var gz = 0; gz < G.h; gz++) for (var gx = 0; gx < G.w; gx++) {
      var c = G.cls[gz * G.w + gx];
      var p = c === "0" ? density : c === "2" ? 0.012 : c === "1" ? 0.006 : 0;
      if (rand() > p) continue;
      var x = -SW / 2 + (gx + rand()) * G.cell, z = -SH / 2 + (gz + rand()) * G.cell;
      if (wat(x, z) > 0.15 || blocked(x, z)) continue;
      (rand() < 0.22 ? pines : leafy).push([x, height(x, z), z, rr(0.8, 1.35)]);
    }
    // forest beyond the traced square
    var ringN = small ? 900 : 2000;
    for (var i = 0; i < ringN; i++) {
      var x2 = rr(-SW / 2 - 260, SW / 2 + 260), z2 = rr(-SH / 2 - 260, SH / 2 + 260);
      if (Math.abs(x2) < SW / 2 && Math.abs(z2) < SH / 2) continue;
      (rand() < 0.22 ? pines : leafy).push([x2, 1.3, z2, rr(0.8, 1.35)]);
    }
    var m4 = new T.Matrix4(), q = new T.Quaternion(), p = new T.Vector3(), s = new T.Vector3(), col = new T.Color(), up = new T.Vector3(0, 1, 0);
    var pineA = new T.ConeGeometry(4.2, 10, 7); pineA.translate(0, 10, 0);
    var pineB = new T.ConeGeometry(3, 8, 7); pineB.translate(0, 15, 0);
    var trunk = new T.CylinderGeometry(0.5, 0.75, 6, 5); trunk.translate(0, 3, 0);
    var crown = new T.IcosahedronGeometry(5.6, 1); crown.translate(0, 11, 0);
    var white = function (flat) { return new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95, flatShading: !!flat }); };
    var iA = new T.InstancedMesh(pineA, white(), pines.length), iB = new T.InstancedMesh(pineB, white(), pines.length);
    var iC = new T.InstancedMesh(crown, white(true), leafy.length);
    var iT = new T.InstancedMesh(trunk, mat("#5a4330"), pines.length + leafy.length);
    var pineCols = ["#2c4630", "#33513a", "#3b5a3a"];
    var leafCols = ["#3f5a30", "#4b6634", "#56703a", "#61793d", "#a8743a", "#b5592f", "#c99a3e"];
    pines.forEach(function (t, i) {
      q.setFromAxisAngle(up, rand() * 6.28); p.set(t[0], t[1] - 0.3, t[2]); s.set(t[3], t[3] * rr(0.9, 1.3), t[3]); m4.compose(p, q, s);
      iA.setMatrixAt(i, m4); iB.setMatrixAt(i, m4); iT.setMatrixAt(i, m4);
      col.set(pineCols[Math.floor(rand() * 3)]); iA.setColorAt(i, col); iB.setColorAt(i, col);
    });
    leafy.forEach(function (t, i) {
      q.setFromAxisAngle(up, rand() * 6.28); p.set(t[0], t[1] - 0.3, t[2]); s.set(t[3], t[3] * rr(0.8, 1.15), t[3]); m4.compose(p, q, s);
      iC.setMatrixAt(i, m4); iT.setMatrixAt(pines.length + i, m4);
      col.set(leafCols[rand() < 0.14 ? 4 + Math.floor(rand() * 3) : Math.floor(rand() * 4)]); iC.setColorAt(i, col);
    });
    [iA, iB, iC, iT].forEach(function (m) { m.castShadow = true; m.receiveShadow = true; scene.add(m); });

    // reeds across the marsh (the brown band north-east of the lake)
    var reeds = [];
    for (var gz2 = 0; gz2 < G.h; gz2++) for (var gx2 = 0; gx2 < G.w; gx2++) {
      if (G.cls[gz2 * G.w + gx2] !== "2") continue;
      for (var k = 0; k < 3; k++) { var rx = -SW / 2 + (gx2 + rand()) * G.cell, rz = -SH / 2 + (gz2 + rand()) * G.cell; reeds.push([rx, height(rx, rz), rz]); }
    }
    var reedM = new T.InstancedMesh(new T.ConeGeometry(0.9, 2.4, 5).translate(0, 1.2, 0), new T.MeshStandardMaterial({ color: "#ffffff", roughness: 1 }), reeds.length);
    var reedCols = ["#8a6a58", "#9b7a5e", "#7a5c50", "#a88a66"];
    reeds.forEach(function (r, i) { s.set(1, rr(0.6, 1.4), 1); q.identity(); p.set(r[0], r[1] - 0.2, r[2]); m4.compose(p, q, s); reedM.setMatrixAt(i, m4); col.set(reedCols[i % 4]); reedM.setColorAt(i, col); });
    scene.add(reedM);

  })();

  /* ---------- horses in the pastures ---------- */
  var animals = [];
  function horse(color, legsColor) {
    var g = new T.Group(), body = mat(color), dark = mat(legsColor);
    g.add(box(2.4, 1, 0.8, body, 0, 1.6, 0));
    var legs = [];
    [[0.9, 0.3], [0.9, -0.3], [-0.9, 0.3], [-0.9, -0.3]].forEach(function (l) { var leg = box(0.22, 1.2, 0.22, dark, l[0], 0.6, l[1]); g.add(leg); legs.push(leg); });
    var neck = box(0.45, 1.3, 0.45, body, 1.25, 2.3, 0); neck.rotation.z = -0.5; g.add(neck);
    var head = box(0.9, 0.42, 0.42, body, 1.85, 2.85, 0); head.rotation.z = -0.4; g.add(head);
    var tail = box(0.18, 0.9, 0.18, dark, -1.25, 1.5, 0); tail.rotation.z = 0.35; g.add(tail);
    g.userData.legs = legs; g.scale.setScalar(1.15);
    return g;
  }
  function openNear(center, radius) {
    for (var i = 0; i < 40; i++) {
      var x = center[0] + rr(-radius, radius), z = center[1] + rr(-radius, radius);
      var blocked = reserved.some(function (r) { return Math.hypot(x - r[0], z - r[1]) < r[2]; });
      if (cls(x, z) === 1 && !blocked) return [x, z];
    }
    return [center[0], center[1]];
  }
  var horseCols = [["#6b3f24", "#2a1a12"], ["#efe8dc", "#cfc6b6"], ["#2a2420", "#1a1512"], ["#8f5a34", "#2a1a12"], ["#b2a08c", "#4a3e33"], ["#5a3a26", "#2a1a12"]];
  horseCols.forEach(function (c, i) {
    var area = i < 4 ? { c: P.pasture, r: 55 } : { c: [P.barn[0] + 40, P.barn[1] - 45], r: 30 };
    var at = openNear(area.c, area.r);
    var h = horse(c[0], c[1]); h.position.set(at[0], height(at[0], at[1]), at[1]); h.rotation.y = rand() * 6.28; scene.add(h);
    animals.push({ obj: h, area: area, target: new T.Vector3(at[0], 0, at[1]), wait: rand() * 5, phase: rand() * 10 });
  });

  /* ---------- kayaks on the lake ---------- */
  var kayaks = [];
  (function () {
    function kayak(color) {
      var g = new T.Group();
      var hull = new T.Mesh(new T.SphereGeometry(1, 14, 8), mat(color, { roughness: 0.5 })); hull.scale.set(2.2, 0.35, 0.5); hull.castShadow = true; g.add(hull);
      g.add(box(0.5, 0.9, 0.5, mat("#2d3a44"), 0, 0.6, 0));
      var hd = new T.Mesh(new T.SphereGeometry(0.28, 8, 6), mat("#c99a7a")); hd.position.y = 1.3; g.add(hd);
      var paddle = box(0.08, 0.08, 2.8, mat("#222"), 0.1, 0.8, 0); g.add(paddle); g.userData.paddle = paddle;
      return g;
    }
    [["#3aa7a8", 0, 1], ["#3aa7a8", 0.25, 0.85], ["#d8613e", 2.4, 0.7]].forEach(function (k) {
      var o = kayak(k[0]); scene.add(o); kayaks.push({ obj: o, phase: k[1], s: k[2] });
    });
  })();
  function kayakPos(k, t) {
    // an ellipse aligned with the lake's long axis (tilted toward the NNE)
    var a = t * 0.025 + k.phase;
    var ex = Math.cos(a) * 55 * k.s, ez = Math.sin(a) * 170 * k.s, rot = -0.33;
    return [P.lake[0] + ex * Math.cos(rot) - ez * Math.sin(rot), P.lake[1] + ex * Math.sin(rot) + ez * Math.cos(rot)];
  }

  /* ---------- fireflies for dusk ---------- */
  var fireflies;
  (function () {
    var arr = [];
    for (var i = 0; i < 320; i++) { var x = rr(P.homes[0] - 140, P.homes[0] + 120), z = rr(P.homes[1] - 80, P.arenas[1]); arr.push(x, height(x, z) + rr(1.5, 7), z); }
    var g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(arr, 3));
    fireflies = new T.Points(g, new T.PointsMaterial({ color: "#ffe9a3", size: 1.6, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(fireflies);
  })();

  /* ---------- camera chapters (positions derived from the real layout) ---------- */
  function at(p, dx, y, dz) { return new T.Vector3(p[0] + dx, y + height(p[0], p[1]), p[1] + dz); }
  var CHAPTERS = [
    { pos: at(P.overview, -60, 470, 560), look: at(P.overview, -150, 0, -40), dusk: 0, anchor: null },           // the whole farm
    { pos: at(P.lake, 40, 190, 330), look: at(P.lake, -60, 0, -60), dusk: 0, anchor: "lake" },                    // Narrin Lake, from the south
    { pos: at(P.clubhouse, 60, 70, 75), look: at(P.clubhouse, -10, 0, -18), dusk: 0.06, anchor: "clubhouse" },   // Clubhouse & Lodge
    { pos: at(P.woods, 40, 75, 95), look: at(P.woods, -2, 0, -4), dusk: 0.1, anchor: "woods" },                  // Woods & Grooms
    { pos: at(P.boardwalk, 30, 62, 45), look: at(P.boardwalk, -6, 0, -4), dusk: 0.12, anchor: "boardwalk" },     // trail through the woods
    { pos: at(P.barn, 150, 75, 90), look: at(P.barn, 0, 4, 0), dusk: 0.16, anchor: "barn" },                     // barn & boarding
    { pos: at(P.arenas, 150, 95, 150), look: at(P.arenas, -10, 0, -10), dusk: 0.22, anchor: "arenas" },         // riding arenas
    { pos: at(P.pasture, 120, 70, 140), look: at(P.pasture, -10, 0, -10), dusk: 0.4, anchor: "pasture" },       // pastures
    { pos: at(P.lake, 20, 150, 120), look: at(P.homes, -40, 0, 40), dusk: 1, anchor: null }                      // long evenings
  ];
  var ANCHORS = { lake: [P.lake, 6], clubhouse: [P.clubhouse, 0], lodge: [P.lodge, 2], woods: [P.woods, 0], grooms: [P.grooms, 4], boardwalk: [P.boardwalk, 8], barn: [P.barn, 18], arenas: [P.arenas, 6], pasture: [P.pasture, 6] };
  var ANCHOR_LABELS = { lake: "Narrin Lake", clubhouse: "The Clubhouse", lodge: "The Lodge", woods: "The Woods", grooms: "The Grooms", boardwalk: "Boardwalk trail", barn: "Barn", arenas: "Riding arenas", pasture: "Pastures" };
  var EXTRA_PIN = { clubhouse: "lodge", woods: "grooms" }; // chapters that show two homes

  var steps = Array.prototype.slice.call(document.querySelectorAll(".tour-step"));
  var hudWrap = document.querySelector(".tour-hud");
  var progressBar = document.querySelector(".tour-progress");
  var label = document.querySelector(".tour-label");
  var pin = document.querySelector(".tour-pin");
  var pin2 = pin ? pin.cloneNode(false) : null;
  if (pin2) pin.parentNode.insertBefore(pin2, pin.nextSibling);
  var hudBtns = [];
  if (hudWrap) {
    steps.forEach(function (st, i) {
      var b = document.createElement("button"); b.type = "button";
      b.setAttribute("aria-label", "Go to: " + (st.querySelector("h3") ? st.querySelector("h3").textContent : "chapter " + (i + 1)));
      b.addEventListener("click", function () {
        var total = stage.offsetHeight - window.innerHeight;
        var y = window.scrollY + stage.getBoundingClientRect().top + (i / (CHAPTERS.length - 1)) * total + 2;
        window.scrollTo({ top: y, behavior: reduceMotion ? "auto" : "smooth" });
      });
      hudWrap.appendChild(b); hudBtns.push(b);
    });
  }

  var camPos = CHAPTERS[0].pos.clone(), camLook = CHAPTERS[0].look.clone();
  var wantPos = camPos.clone(), wantLook = camLook.clone();
  var dusk = 0, wantDusk = 0, activeIndex = -1;
  var mouse = { x: 0, y: 0 };
  window.addEventListener("pointermove", function (e) { mouse.x = e.clientX / window.innerWidth - 0.5; mouse.y = e.clientY / window.innerHeight - 0.5; }, { passive: true });
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function readScroll() {
    var r = stage.getBoundingClientRect(), total = stage.offsetHeight - window.innerHeight;
    var p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
    var f = p * (CHAPTERS.length - 1), i = Math.min(CHAPTERS.length - 2, Math.floor(f)), t = ease(f - i);
    var a = CHAPTERS[i], b = CHAPTERS[i + 1];
    wantPos.lerpVectors(a.pos, b.pos, t);
    wantPos.y += Math.sin(t * Math.PI) * Math.min(120, a.pos.distanceTo(b.pos) * 0.25);
    wantLook.lerpVectors(a.look, b.look, t);
    wantDusk = T.MathUtils.lerp(a.dusk, b.dusk, t);
    if (progressBar) progressBar.style.width = (p * 100).toFixed(2) + "%";
    var idx = Math.round(f);
    if (idx !== activeIndex) {
      activeIndex = idx;
      steps.forEach(function (s, k) { s.classList.toggle("active", k === idx); });
      hudBtns.forEach(function (b, k) { b.classList.toggle("active", k === idx); });
      if (label) label.textContent = String(idx + 1).padStart(2, "0") + " / " + String(CHAPTERS.length).padStart(2, "0");
    }
  }
  window.addEventListener("scroll", readScroll, { passive: true });

  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < 700 ? 55 : 42; camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);

  var visible = true, running = false;
  var clock = new T.Clock(), tmpCol = new T.Color(), proj = new T.Vector3();
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible && !running) { clock.getDelta(); requestAnimationFrame(frame); } }, { rootMargin: "200px" }).observe(stage);
  }

  function updateAnimals(dt, time) {
    animals.forEach(function (a) {
      var o = a.obj;
      if (a.wait > 0) { a.wait -= dt; return; }
      var dx = a.target.x - o.position.x, dz = a.target.z - o.position.z, d = Math.hypot(dx, dz);
      if (d < 0.8) { var n = openNear(a.area.c, a.area.r); a.target.set(n[0], 0, n[1]); a.wait = rr(3, 10); return; }
      var want = Math.atan2(-dz, dx), cur = o.rotation.y, diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
      o.rotation.y = cur + diff * Math.min(1, dt * 2);
      var step = Math.min(d, 2.2 * dt);
      o.position.x += Math.cos(o.rotation.y) * step; o.position.z -= Math.sin(o.rotation.y) * step;
      o.position.y = height(o.position.x, o.position.z);
      var legs = o.userData.legs;
      for (var i = 0; i < legs.length; i++) legs[i].rotation.z = Math.sin(time * 7 + a.phase + (i % 2 ? Math.PI : 0)) * 0.35;
    });
  }

  function placePin(el, key) {
    if (!el) return;
    if (!key || !ANCHORS[key]) { el.style.opacity = "0"; return; }
    var an = ANCHORS[key];
    proj.set(an[0][0], height(an[0][0], an[0][1]) + an[1] + 6, an[0][1]).project(camera);
    var on = proj.z < 1 && Math.abs(proj.x) < 0.95 && Math.abs(proj.y) < 0.95;
    el.style.opacity = on ? "1" : "0";
    el.style.transform = "translate(-50%, -100%) translate(" + ((proj.x + 1) / 2 * canvas.clientWidth).toFixed(1) + "px," + ((1 - proj.y) / 2 * canvas.clientHeight).toFixed(1) + "px)";
    el.textContent = ANCHOR_LABELS[key];
  }

  function frame() {
    if (!visible) { running = false; return; }
    running = true;
    var dt = Math.min(clock.getDelta(), 0.05), time = clock.elapsedTime;
    var k = reduceMotion ? 1 : 1 - Math.pow(0.003, dt);
    camPos.lerp(wantPos, k); camLook.lerp(wantLook, k); dusk += (wantDusk - dusk) * k;
    camera.position.set(camPos.x + mouse.x * 8, camPos.y - mouse.y * 4, camPos.z);
    camera.lookAt(camLook);

    var sky = tmpCol.copy(DAY_SKY).lerp(DUSK_SKY, Math.min(1, dusk * 1.4));
    if (dusk > 0.7) sky.lerp(NIGHT_SKY, (dusk - 0.7) / 0.3 * 0.55);
    scene.background.copy(sky); scene.fog.color.copy(sky);
    sun.intensity = 1.7 - dusk * 1.1;
    sun.color.set("#fff1d6").lerp(new T.Color("#ff9d5c"), dusk);
    sun.target.position.copy(camLook);
    sun.position.set(camLook.x + 260 - dusk * 520, camLook.y + 380 - dusk * 250, camLook.z + 160);
    hemi.intensity = 0.8 - dusk * 0.35;
    windowMats.forEach(function (m) { m.emissiveIntensity = 0.1 + dusk * 1.8; });
    stringBulbs.forEach(function (m) { m.emissiveIntensity = 0.5 + dusk * 2.5; });
    fireflies.material.opacity = Math.max(0, dusk - 0.45) * 1.5 * (0.75 + Math.sin(time * 3) * 0.25);
    glints.material.opacity = 0.35 + Math.sin(time * 1.7) * 0.2 - dusk * 0.25;

    kayaks.forEach(function (kk) {
      var p0 = kayakPos(kk, time), p1 = kayakPos(kk, time + 0.5);
      kk.obj.position.set(p0[0], 0.45 + Math.sin(time * 2 + kk.phase) * 0.06, p0[1]);
      kk.obj.rotation.y = Math.atan2(-(p1[1] - p0[1]), p1[0] - p0[0]);
      kk.obj.userData.paddle.rotation.x = Math.sin(time * 3 + kk.phase) * 0.6;
    });
    if (!reduceMotion) updateAnimals(dt, time);

    var chap = CHAPTERS[Math.max(0, activeIndex)];
    placePin(pin, chap && chap.anchor);
    placePin(pin2, chap && EXTRA_PIN[chap.anchor]);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  resize(); readScroll();
  camPos.copy(wantPos); camLook.copy(wantLook); dusk = wantDusk;
  if (!running) requestAnimationFrame(frame);
})();
