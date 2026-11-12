/* Narrin Farms — scroll-driven 3D farm tour (three.js r149)
 *
 * A stylised, hand-built model of the farm: Narrin Lake, the four homes,
 * the barn and pastures, the woods and boardwalk, the wedding lawn and the
 * fire pit. The camera glides between "chapters" as the visitor scrolls.
 * It is an illustration, not a survey — positions are artistic.
 */
(function () {
  "use strict";
  var stage = document.querySelector(".tour-stage");
  if (!stage) return;
  var canvas = stage.querySelector(".tour-canvas");
  var tourRoot = document.querySelector(".tour");

  function hasWebGL() {
    try { var c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); }
    catch (e) { return false; }
  }
  if (!window.THREE || !hasWebGL()) { tourRoot.classList.add("no-webgl"); return; }

  var T = window.THREE;
  if (T.ColorManagement) T.ColorManagement.legacyMode = false; // treat hex colours as sRGB
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- deterministic random ---------- */
  var seed = 7;
  function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function rr(a, b) { return a + rand() * (b - a); }

  /* ---------- renderer / scene ---------- */
  var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  var scene = new T.Scene();
  var DAY_SKY = new T.Color("#bcd3d6");
  var DUSK_SKY = new T.Color("#e7a77d");
  var NIGHT_SKY = new T.Color("#3d4058");
  scene.background = DAY_SKY.clone();
  scene.fog = new T.Fog(DAY_SKY.clone(), 320, 900);

  var camera = new T.PerspectiveCamera(42, 1, 1, 2000);

  var hemi = new T.HemisphereLight("#f4efe0", "#41553f", 0.75);
  scene.add(hemi);
  var sun = new T.DirectionalLight("#fff1d6", 1.6);
  sun.position.set(160, 200, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  var sc = sun.shadow.camera;
  sc.left = -230; sc.right = 230; sc.top = 230; sc.bottom = -230; sc.near = 10; sc.far = 600;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  /* ---------- terrain ---------- */
  var LAKE = { x: 0, z: 0, rx: 62, rz: 40 };
  function lakeD(x, z) { var dx = (x - LAKE.x) / LAKE.rx, dz = (z - LAKE.z) / LAKE.rz; return Math.sqrt(dx * dx + dz * dz); }
  function smooth(a, b, v) { var t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
  function height(x, z) {
    var base = 4.6 + 2.4 * Math.sin(x * 0.021) * Math.cos(z * 0.017) + 1.4 * Math.sin((x - z) * 0.011) + 0.6 * Math.sin(x * 0.07 + z * 0.05);
    // the Clubhouse sits on a rise above the lake
    var hx = x - 12, hz = z + 72; base += 7 * Math.exp(-(hx * hx + hz * hz) / 1600);
    // rolling ground out west in the woods
    base += 3 * smooth(-60, -200, x) * Math.sin(z * 0.03);
    var d = lakeD(x, z);
    return -3 + (base + 3) * smooth(0.92, 1.55, d);
  }
  var PASTURE = { x0: 72, x1: 165, z0: 18, z1: 108 };
  function inPasture(x, z, pad) { pad = pad || 0; return x > PASTURE.x0 - pad && x < PASTURE.x1 + pad && z > PASTURE.z0 - pad && z < PASTURE.z1 + pad; }

  (function buildGround() {
    var size = 900, seg = 180;
    var g = new T.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    var pos = g.attributes.position;
    var colors = new Float32Array(pos.count * 3);
    var c = new T.Color();
    var grass1 = new T.Color("#6f8f4e"), grass2 = new T.Color("#8ea35c"), forest = new T.Color("#4a6238"), sand = new T.Color("#c2b48a"), bed = new T.Color("#4f5f48"), past = new T.Color("#9bb066");
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i);
      var y = height(x, z); pos.setY(i, y);
      var d = lakeD(x, z);
      var n = 0.5 + 0.5 * Math.sin(x * 0.09) * Math.cos(z * 0.08);
      c.copy(grass1).lerp(grass2, n);
      if (x < -55 || z > 110 || Math.hypot(x, z) > 230) c.lerp(forest, 0.6);
      if (inPasture(x, z)) c.copy(past).lerp(grass2, n * 0.4);
      if (d < 1.12) c.lerp(sand, smooth(1.12, 0.98, d));
      if (d < 0.98) c.copy(bed);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new T.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    var m = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    m.receiveShadow = true;
    scene.add(m);
  })();

  /* ---------- water ---------- */
  var water;
  (function buildLake() {
    var shape = new T.Shape();
    shape.absellipse(0, 0, LAKE.rx * 1.03, LAKE.rz * 1.03, 0, Math.PI * 2, false, 0);
    var g = new T.ShapeGeometry(shape, 96);
    g.rotateX(-Math.PI / 2);
    water = new T.Mesh(g, new T.MeshStandardMaterial({ color: "#3b6b72", roughness: 0.08, metalness: 0.55, transparent: true, opacity: 0.92 }));
    water.position.set(LAKE.x, 0.35, LAKE.z);
    water.receiveShadow = true;
    scene.add(water);
    // soft glints that drift across the surface
    var glintGeo = new T.BufferGeometry();
    var gp = [];
    for (var i = 0; i < 160; i++) {
      var a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 0.95;
      gp.push(Math.cos(a) * r * LAKE.rx, 0.5, Math.sin(a) * r * LAKE.rz);
    }
    glintGeo.setAttribute("position", new T.Float32BufferAttribute(gp, 3));
    var glints = new T.Points(glintGeo, new T.PointsMaterial({ color: "#fff6dc", size: 0.9, transparent: true, opacity: 0.55, depthWrite: false }));
    glints.name = "glints";
    scene.add(glints);
  })();

  /* ---------- material helpers ---------- */
  var MAT = {};
  function mat(color, opts) {
    var key = color + JSON.stringify(opts || {});
    if (!MAT[key]) MAT[key] = new T.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.85, metalness: 0 }, opts || {}));
    return MAT[key];
  }
  function glow(color, intensity) { return mat(color, { emissive: color, emissiveIntensity: intensity || 1, roughness: 0.4 }); }
  var windowMats = [];
  function windowMat() { var m = new T.MeshStandardMaterial({ color: "#2a2a24", emissive: "#ffc77a", emissiveIntensity: 0.15, roughness: 0.3 }); windowMats.push(m); return m; }
  var WIN = windowMat();

  function box(w, h, d, m, x, y, z) {
    var mesh = new T.Mesh(new T.BoxGeometry(w, h, d), m);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  // a gable roof / prism: triangle (width w, rise h) extruded along depth d
  function prism(w, h, d, m, overhang) {
    overhang = overhang || 0;
    var s = new T.Shape();
    s.moveTo(-w / 2 - overhang, 0); s.lineTo(w / 2 + overhang, 0); s.lineTo(0, h); s.lineTo(-w / 2 - overhang, 0);
    var g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    var mesh = new T.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  function place(group, x, z, rotY, yOffset) {
    group.position.set(x, height(x, z) + (yOffset || 0), z);
    group.rotation.y = rotY || 0;
    scene.add(group);
    return group;
  }
  function foundation(w, d, m) { return box(w, 6, d, m || mat("#6e675c"), 0, -2.6, 0); }

  /* ---------- the four homes ---------- */
  var anchors = {};

  // The Clubhouse — on the hill, board-and-batten grey with the red gable and pergola
  (function () {
    var g = new T.Group();
    g.add(foundation(26, 13));
    g.add(box(18, 6, 11, mat("#6f7468"), -2, 3, 0));
    var roof = prism(12.4, 4.6, 19, mat("#4d5152"), 0.6); roof.rotation.y = Math.PI / 2; roof.position.set(-2, 6, 0); g.add(roof);
    g.add(box(7.5, 7.2, 11.6, mat("#93402f"), 9, 3.6, 0));
    var r2 = prism(7.5, 4, 12.4, mat("#4d5152"), 0.6); r2.position.set(9, 7.2, 0); g.add(r2);
    // windows facing the lake (+z)
    for (var i = -3; i <= 1; i++) g.add(box(2.2, 2.4, 0.3, WIN, -2 + i * 3.4 + 2, 3.4, 5.6));
    g.add(box(2.4, 3.4, 0.3, WIN, 9, 3.6, 5.9));
    // pergola
    var wood = mat("#8a6844");
    [[-14, 3], [-14, -3], [-19, 3], [-19, -3]].forEach(function (p) { g.add(box(0.5, 6, 0.5, wood, p[0], 3, p[1])); });
    for (var s = -4; s <= 4; s += 1.2) g.add(box(6.6, 0.3, 0.35, wood, -16.5, 6.1, s));
    g.add(box(5.4, 0.2, 7, mat("#a99a83"), -16.5, 0.1, 0));
    // stone patio + red Adirondack chairs around the fire pit
    g.add(box(14, 0.4, 10, mat("#b9ae9c"), 4, 0.2, 13));
    var pit = new T.Mesh(new T.CylinderGeometry(1.4, 1.6, 0.9, 18), mat("#5a4c44")); pit.position.set(4, 0.8, 13.5); pit.castShadow = true; g.add(pit);
    var red = mat("#b23a2a");
    for (var k = 0; k < 5; k++) {
      var a = (k / 5) * Math.PI * 2 + 0.3;
      var ch = new T.Group();
      ch.add(box(1.4, 0.4, 1.4, red, 0, 0.9, 0));
      var back = box(1.4, 1.8, 0.3, red, 0, 1.7, -0.75); back.rotation.x = -0.35; ch.add(back);
      ch.position.set(4 + Math.cos(a) * 4, 0, 13.5 + Math.sin(a) * 4);
      ch.lookAt(4, 0, 13.5);
      g.add(ch);
    }
    // evergreens by the porch
    place(g, 12, -72, Math.PI * 0.03, 0);
    anchors.clubhouse = new T.Vector3(12, height(12, -72) + 8, -72);
    anchors.fire = new T.Vector3(16, height(12, -72) + 2, -58.5);
  })();

  // The Lodge — Tudor-style gables, hedges and stairs
  (function () {
    var g = new T.Group();
    g.add(foundation(26, 18));
    var body = mat("#6b5848"), trim = mat("#3d3129"), roofM = mat("#55594f");
    g.add(box(22, 6.5, 13, body, 0, 3.25, 0));
    var roof = prism(14, 5, 23.5, roofM, 0.6); roof.rotation.y = Math.PI / 2; roof.position.y = 6.5; g.add(roof);
    [-6, 4].forEach(function (x) {
      g.add(box(7, 7, 3, body, x, 3.5, 7.5));
      var gab = prism(7.6, 5.4, 3.8, mat("#7c6a56"), 0.3); gab.position.set(x, 7, 7.6); g.add(gab);
      g.add(box(1.8, 2.2, 0.3, WIN, x, 4.5, 9.1));
      g.add(box(0.3, 7, 0.3, trim, x - 3.4, 3.5, 9.05)); g.add(box(0.3, 7, 0.3, trim, x + 3.4, 3.5, 9.05));
    });
    g.add(box(3.2, 2.2, 0.3, WIN, -0.8, 3.2, 6.6));
    g.add(box(2.4, 2, 0.3, WIN, 9.5, 3.2, 6.6));
    var hedge = mat("#3f5a33");
    for (var i = 0; i < 4; i++) { g.add(box(20, 1.4 + i * 0.3, 1.6, hedge, 0, 0.7 - i * 0.6, 11 + i * 2.6)); }
    g.add(box(3, 0.4, 10, mat("#8b6a49"), 12.5, -0.5, 13));
    place(g, -82, -40, 1.1, 0);
    anchors.lodge = new T.Vector3(-82, height(-82, -40) + 8, -40);
  })();

  // The Grooms — black A-frame with string lights and a deck
  var stringBulbs = [];
  (function () {
    var g = new T.Group();
    g.add(foundation(12, 14));
    var aframe = prism(10, 11, 10, mat("#2b2d2b"), 0.4); g.add(aframe);
    var shingles = prism(10.9, 11.9, 10.4, mat("#6a4a37"), 0); shingles.scale.set(1, 1, 1); shingles.position.y = -0.3; g.add(shingles);
    // front face
    var face = new T.Shape(); face.moveTo(-4.6, 0); face.lineTo(4.6, 0); face.lineTo(0, 10.1); face.lineTo(-4.6, 0);
    var faceMesh = new T.Mesh(new T.ShapeGeometry(face), mat("#2f3330")); faceMesh.position.z = 5.25; g.add(faceMesh);
    var tri = new T.Shape(); tri.moveTo(-1.2, 6.6); tri.lineTo(1.2, 6.6); tri.lineTo(0, 8.6); tri.lineTo(-1.2, 6.6);
    var triMesh = new T.Mesh(new T.ShapeGeometry(tri), WIN); triMesh.position.z = 5.3; g.add(triMesh);
    g.add(box(3, 2, 0.2, WIN, -1.6, 2.8, 5.32));
    g.add(box(1.4, 3, 0.2, mat("#1d201e"), 2.3, 1.5, 5.32));
    // deck, table & umbrella
    g.add(box(12, 0.5, 8, mat("#8f7c63"), 0, 0.25, 10));
    g.add(box(2.6, 0.2, 1.6, mat("#222"), -2.5, 2, 11)); g.add(box(0.2, 2, 0.2, mat("#222"), -2.5, 1, 11));
    var umb = new T.Mesh(new T.ConeGeometry(3.4, 1.2, 8), mat("#6b6656")); umb.position.set(-2.5, 4.4, 11); umb.castShadow = true; g.add(umb);
    g.add(box(0.15, 4, 0.15, mat("#555"), -2.5, 2.4, 11));
    // string lights: a sagging line from the peak to a post
    g.add(box(0.3, 6, 0.3, mat("#3a3a3a"), 5.5, 3, 13.5));
    var bulbMat = glow("#ffd89a", 0.6);
    for (var i = 0; i <= 14; i++) {
      var t = i / 14;
      var x = T.MathUtils.lerp(0, 5.5, t), z = T.MathUtils.lerp(5.4, 13.5, t), y = T.MathUtils.lerp(10, 6, t) - Math.sin(t * Math.PI) * 1.4;
      var b = new T.Mesh(new T.SphereGeometry(0.2, 8, 6), bulbMat); b.position.set(x, y, z); g.add(b); stringBulbs.push(b);
    }
    place(g, 72, -42, -1.0, 0);
    anchors.grooms = new T.Vector3(72, height(72, -42) + 7, -42);
  })();

  // The Woods — log cabin tucked into the trees
  (function () {
    var g = new T.Group();
    g.add(foundation(16, 13));
    var logs = mat("#7a5a3d");
    for (var i = 0; i < 6; i++) g.add(box(13, 0.85, 10, i % 2 ? logs : mat("#6d5036"), 0, 0.45 + i * 0.85, 0));
    var roof = prism(11.6, 4.2, 14.4, mat("#3e4a3a"), 0.6); roof.rotation.y = Math.PI / 2; roof.position.y = 5.1; g.add(roof);
    g.add(box(1.4, 6, 1.4, mat("#7f7468"), 4, 7, -2));
    g.add(box(2.2, 2, 0.3, WIN, -3, 2.8, 5.05)); g.add(box(2.2, 2, 0.3, WIN, 3, 2.8, 5.05));
    g.add(box(13, 0.4, 4, mat("#8d7357"), 0, 0.2, 7));
    // hot tub
    var tub = new T.Mesh(new T.CylinderGeometry(1.8, 1.8, 1.2, 20), mat("#5d4632")); tub.position.set(-8.5, 0.6, 5); tub.castShadow = true; g.add(tub);
    var tw = new T.Mesh(new T.CylinderGeometry(1.55, 1.55, 0.1, 20), glow("#6fd3d8", 0.35)); tw.position.set(-8.5, 1.2, 5); g.add(tw);
    place(g, -112, 68, 0.6, 0);
    anchors.woods = new T.Vector3(-112, height(-112, 68) + 6, 68);
  })();

  /* ---------- barn, pasture & fence ---------- */
  (function () {
    var g = new T.Group();
    g.add(foundation(18, 28));
    var red = mat("#9a3424"), white = mat("#efe8da");
    g.add(box(16, 9, 26, red, 0, 4.5, 0));
    var roof = prism(17.5, 6.5, 27, mat("#4b4f50"), 0.4); roof.position.y = 9; g.add(roof);
    var gable = prism(16, 6.2, 0.2, red, 0); gable.position.set(0, 9, 13.05); g.add(gable);
    g.add(box(6, 6.5, 0.3, mat("#7d2b1d"), 0, 3.25, 13.1));
    var x1 = box(0.35, 8.6, 0.2, white, 0, 3.25, 13.3); x1.rotation.z = 0.75; g.add(x1);
    var x2 = box(0.35, 8.6, 0.2, white, 0, 3.25, 13.3); x2.rotation.z = -0.75; g.add(x2);
    g.add(box(6.4, 0.35, 0.25, white, 0, 6.5, 13.3)); g.add(box(0.35, 6.5, 0.25, white, -3.1, 3.25, 13.3)); g.add(box(0.35, 6.5, 0.25, white, 3.1, 3.25, 13.3));
    g.add(box(2.2, 2.2, 0.3, WIN, 0, 11, 13.1));
    // run-in shed + hay
    g.add(box(10, 4.5, 6, mat("#8b6a49"), 15, 2.25, 6));
    var shedRoof = box(11, 0.4, 7.5, mat("#4b4f50"), 15, 4.8, 6); shedRoof.rotation.x = 0.12; g.add(shedRoof);
    for (var h = 0; h < 3; h++) { var bale = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, 1.8, 14), mat("#d6b56a")); bale.rotation.z = Math.PI / 2; bale.position.set(-11, 1.2, -6 + h * 3); bale.castShadow = true; g.add(bale); }
    place(g, 182, 48, -Math.PI / 2, 0);
    anchors.barn = new T.Vector3(182, height(182, 48) + 9, 48);

    // fence posts and rails around the pasture
    var postGeo = new T.BoxGeometry(0.45, 2.6, 0.45);
    var railGeo = new T.BoxGeometry(1, 0.22, 0.18);
    var fenceMat = mat("#e9e1cf");
    var posts = [], rails = [];
    function edge(ax, az, bx, bz) {
      var len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 6);
      for (var i = 0; i <= n; i++) {
        var t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        posts.push([x, height(x, z) + 1.3, z]);
        if (i < n) {
          var t2 = (i + 1) / n, x2 = ax + (bx - ax) * t2, z2 = az + (bz - az) * t2;
          var y1 = height(x, z), y2 = height(x2, z2);
          [1.1, 2.1].forEach(function (hh) { rails.push({ x: (x + x2) / 2, y: (y1 + y2) / 2 + hh, z: (z + z2) / 2, len: Math.hypot(x2 - x, z2 - z), ry: -Math.atan2(z2 - z, x2 - x), rz: Math.atan2(y2 - y1, Math.hypot(x2 - x, z2 - z)) }); });
        }
      }
    }
    var P = PASTURE;
    edge(P.x0, P.z0, P.x1, P.z0); edge(P.x1, P.z0, P.x1, P.z1); edge(P.x1, P.z1, P.x0, P.z1); edge(P.x0, P.z1, P.x0, P.z0);
    // cross fence splitting two paddocks
    edge(P.x0 + 48, P.z0, P.x0 + 48, P.z1);
    var postMesh = new T.InstancedMesh(postGeo, fenceMat, posts.length);
    var railMesh = new T.InstancedMesh(railGeo, fenceMat, rails.length);
    var m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3();
    posts.forEach(function (pp, i) { m4.makeTranslation(pp[0], pp[1], pp[2]); postMesh.setMatrixAt(i, m4); });
    rails.forEach(function (r, i) { e.set(0, r.ry, r.rz, "YXZ"); q.setFromEuler(e); s.set(r.len, 1, 1); p.set(r.x, r.y, r.z); m4.compose(p, q, s); railMesh.setMatrixAt(i, m4); });
    postMesh.castShadow = railMesh.castShadow = true;
    scene.add(postMesh); scene.add(railMesh);
  })();

  /* ---------- animals ---------- */
  var animals = [];
  function quadruped(o) {
    var g = new T.Group();
    var body = mat(o.color), dark = mat(o.legs || "#2a2420");
    var L = o.len, H = o.h;
    g.add(box(L, H * 0.42, H * 0.36, body, 0, H * 0.75, 0));
    var legs = [];
    [[L * 0.36, H * 0.13], [L * 0.36, -H * 0.13], [-L * 0.36, H * 0.13], [-L * 0.36, -H * 0.13]].forEach(function (lp) {
      var leg = box(H * 0.1, H * 0.56, H * 0.1, dark, lp[0], H * 0.28, lp[1]); g.add(leg); legs.push(leg);
    });
    var neck = box(H * 0.18, H * o.neck, H * 0.2, body, L * 0.5, H * (0.75 + o.neck / 2.4), 0); neck.rotation.z = -0.5; g.add(neck);
    var head = box(H * o.headLen, H * 0.2, H * 0.2, o.face ? mat(o.face) : body, L * 0.5 + H * 0.28, H * (0.82 + o.neck * 0.62), 0); head.rotation.z = -0.35; g.add(head);
    if (o.horns) {
      var horn = box(0.18, 0.18, H * 1.25, mat("#e7dcc3"), L * 0.55 + H * 0.12, H * (0.92 + o.neck * 0.6), 0); g.add(horn);
      var tip1 = box(0.16, 0.6, 0.16, mat("#e7dcc3"), L * 0.55 + H * 0.12, H * (0.92 + o.neck * 0.6) + 0.3, H * 0.62); g.add(tip1);
      var tip2 = tip1.clone(); tip2.position.z = -H * 0.62; g.add(tip2);
    }
    if (o.tail) { var tail = box(0.18, H * 0.4, 0.18, dark, -L * 0.52, H * 0.66, 0); tail.rotation.z = 0.35; g.add(tail); }
    if (o.ears) { g.add(box(0.15, H * 0.22, 0.15, body, L * 0.5 + H * 0.12, H * (1.02 + o.neck * 0.62), 0.25)); g.add(box(0.15, H * 0.22, 0.15, body, L * 0.5 + H * 0.12, H * (1.02 + o.neck * 0.62), -0.25)); }
    g.userData.legs = legs;
    return g;
  }
  function addAnimal(o, x, z, area) {
    var a = quadruped(o);
    a.position.set(x, height(x, z), z);
    a.rotation.y = rand() * Math.PI * 2;
    scene.add(a);
    animals.push({ obj: a, area: area, target: new T.Vector3(x, 0, z), speed: o.speed || 1.6, wait: rand() * 4, phase: rand() * 10 });
  }
  var paddockA = { x0: PASTURE.x0 + 5, x1: PASTURE.x0 + 44, z0: PASTURE.z0 + 5, z1: PASTURE.z1 - 5 };
  var paddockB = { x0: PASTURE.x0 + 53, x1: PASTURE.x1 - 5, z0: PASTURE.z0 + 5, z1: PASTURE.z1 - 5 };
  var horse = function (c, legs, face) { return { color: c, legs: legs, face: face, len: 4.2, h: 4.2, neck: 0.55, headLen: 0.55, tail: true, ears: true, speed: 2.2 }; };
  addAnimal(horse("#6b3f24", "#2a1a12"), 90, 40, paddockA);
  addAnimal(horse("#efe8dc", "#cfc6b6"), 100, 70, paddockA);
  addAnimal(horse("#2a2420", "#1a1512", "#e8e0d2"), 85, 90, paddockA);
  addAnimal(horse("#8f5a34", "#2a1a12", "#efe8dc"), 105, 55, paddockA);
  addAnimal(horse("#b2a08c", "#4a3e33"), 140, 35, paddockB);
  // Texas longhorn & a Holstein, donkeys and sheep
  addAnimal({ color: "#9aa0a3", legs: "#6a6f72", len: 4.6, h: 3.6, neck: 0.25, headLen: 0.5, horns: true, tail: true, speed: 0.9 }, 135, 70, paddockB);
  addAnimal({ color: "#1f1f1f", legs: "#efe8dc", face: "#efe8dc", len: 4.3, h: 3.4, neck: 0.25, headLen: 0.5, tail: true, speed: 0.9 }, 150, 90, paddockB);
  addAnimal({ color: "#77706a", legs: "#3a3632", face: "#c9c1b6", len: 2.8, h: 2.8, neck: 0.45, headLen: 0.55, ears: true, tail: true, speed: 1.2 }, 128, 95, paddockB);
  addAnimal({ color: "#8a8178", legs: "#3a3632", face: "#d6cec2", len: 2.7, h: 2.7, neck: 0.45, headLen: 0.55, ears: true, tail: true, speed: 1.2 }, 145, 50, paddockB);
  for (var sh = 0; sh < 4; sh++) addAnimal({ color: "#f1ece2", legs: "#2a2420", face: "#2a2420", len: 2, h: 1.9, neck: 0.2, headLen: 0.45, speed: 0.8 }, rr(130, 155), rr(30, 60), paddockB);

  /* ---------- lake life: dock, kayaks, paddlers ---------- */
  var kayaks = [];
  (function () {
    var wood = mat("#8c7558");
    var dock = new T.Group();
    dock.add(box(3.2, 0.4, 16, wood, 0, 0.9, 0));
    dock.add(box(9, 0.4, 3.2, wood, 0, 0.9, 8));
    for (var i = -6; i <= 8; i += 4) { dock.add(box(0.4, 3, 0.4, wood, -1.4, -0.4, i)); dock.add(box(0.4, 3, 0.4, wood, 1.4, -0.4, i)); }
    dock.position.set(18, 0, -38); scene.add(dock);
    // kayak rack on shore
    var rack = new T.Group();
    rack.add(box(0.4, 4, 0.4, wood, -3, 2, 0)); rack.add(box(0.4, 4, 0.4, wood, 3, 2, 0));
    for (var r = 0; r < 3; r++) {
      rack.add(box(7, 0.25, 0.4, wood, 0, 1 + r * 1.2, 0));
      var k = new T.Mesh(new T.SphereGeometry(1, 14, 8), mat("#eef1f0")); k.scale.set(0.7, 0.35, 3.6); k.position.set(0, 1.4 + r * 1.2, 0.2); k.rotation.y = Math.PI / 2; k.castShadow = true; rack.add(k);
    }
    rack.position.set(32, height(32, -44), -44); rack.rotation.y = 0.2; scene.add(rack);

    function kayak(color) {
      var g = new T.Group();
      var hull = new T.Mesh(new T.SphereGeometry(1, 16, 10), mat(color, { roughness: 0.5 })); hull.scale.set(3.4, 0.45, 0.75); hull.castShadow = true; g.add(hull);
      var person = box(0.7, 1.4, 0.7, mat("#2d3a44"), 0, 0.9, 0); g.add(person);
      var head = new T.Mesh(new T.SphereGeometry(0.38, 10, 8), mat("#c99a7a")); head.position.y = 1.9; g.add(head);
      var paddle = box(0.1, 0.1, 4.2, mat("#222"), 0.2, 1.1, 0); g.add(paddle);
      g.userData.paddle = paddle;
      return g;
    }
    [["#3aa7a8", 0.0, 0.62], ["#3aa7a8", 1.7, 0.45], ["#d8613e", 3.6, 0.55]].forEach(function (k) {
      var obj = kayak(k[0]); scene.add(obj); kayaks.push({ obj: obj, phase: k[1], r: k[2] });
    });
  })();

  /* ---------- wedding lawn ---------- */
  var weddingLights = [];
  (function () {
    var g = new T.Group();
    var white = mat("#f4f0e8");
    // arch of birch posts with florals
    g.add(box(0.5, 7, 0.5, white, -3.2, 3.5, 0)); g.add(box(0.5, 7, 0.5, white, 3.2, 3.5, 0));
    var arch = new T.Mesh(new T.TorusGeometry(3.2, 0.28, 8, 24, Math.PI), white); arch.position.y = 7; g.add(arch);
    var floralColors = ["#f2c5c0", "#f7efe4", "#d98f86", "#b9c9a4"];
    for (var i = 0; i < 26; i++) {
      var a = rand() * Math.PI, f = new T.Mesh(new T.SphereGeometry(rr(0.35, 0.6), 8, 6), mat(floralColors[i % 4]));
      f.position.set(Math.cos(a) * 3.2 + rr(-0.3, 0.3), 7 + Math.sin(a) * 3.2 + rr(-0.3, 0.3), rr(-0.4, 0.4)); g.add(f);
    }
    // aisle runner + rows of chairs
    g.add(box(2.2, 0.08, 22, mat("#efe9df"), 0, 0.05, 14));
    for (var row = 0; row < 6; row++) {
      for (var side = -1; side <= 1; side += 2) {
        for (var c = 0; c < 4; c++) {
          var ch = new T.Group();
          ch.add(box(1, 0.2, 1, white, 0, 1, 0)); ch.add(box(1, 1.2, 0.15, white, 0, 1.6, 0.45));
          ch.add(box(0.12, 1, 0.12, white, -0.4, 0.5, -0.4)); ch.add(box(0.12, 1, 0.12, white, 0.4, 0.5, -0.4));
          ch.position.set(side * (2.2 + c * 1.5), 0, 6 + row * 2.6);
          g.add(ch);
        }
      }
    }
    // café lights strung between poles
    var poleM = mat("#3b3631");
    [[-10, 4], [10, 4], [-10, 22], [10, 22]].forEach(function (p) { g.add(box(0.35, 8, 0.35, poleM, p[0], 4, p[1])); });
    var bulb = glow("#ffd89a", 0.6);
    [[-10, 4, 10, 22], [10, 4, -10, 22], [-10, 4, 10, 4], [-10, 22, 10, 22]].forEach(function (ln) {
      for (var j = 1; j < 14; j++) {
        var t = j / 14, b = new T.Mesh(new T.SphereGeometry(0.17, 6, 5), bulb);
        b.position.set(T.MathUtils.lerp(ln[0], ln[2], t), 8 - Math.sin(t * Math.PI) * 1.4, T.MathUtils.lerp(ln[1], ln[3], t));
        g.add(b); weddingLights.push(b);
      }
    });
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // face the lake: arch at the water's edge, guests looking north-east toward it
    place(g, -54, 52, -0.8, 0.1);
    anchors.wedding = new T.Vector3(-54, height(-54, 52) + 6, 52);
  })();

  /* ---------- boardwalk trail through the woods ---------- */
  (function () {
    var curve = new T.CatmullRomCurve3([
      new T.Vector3(-70, 0, 112), new T.Vector3(-92, 0, 128), new T.Vector3(-118, 0, 122), new T.Vector3(-140, 0, 140), new T.Vector3(-165, 0, 132)
    ]);
    var pts = curve.getSpacedPoints(70);
    var plankGeo = new T.BoxGeometry(4.2, 0.3, 1.1);
    var inst = new T.InstancedMesh(plankGeo, mat("#a48b6a"), pts.length);
    var m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), p = new T.Vector3(), one = new T.Vector3(1, 1, 1);
    pts.forEach(function (pt, i) {
      var nxt = pts[Math.min(i + 1, pts.length - 1)], prv = pts[Math.max(i - 1, 0)];
      var ang = Math.atan2(nxt.x - prv.x, nxt.z - prv.z);
      q.setFromAxisAngle(up, ang);
      p.set(pt.x, height(pt.x, pt.z) + 0.9, pt.z);
      m4.compose(p, q, one); inst.setMatrixAt(i, m4);
    });
    inst.castShadow = true; inst.receiveShadow = true; scene.add(inst);
    anchors.trail = new T.Vector3(-118, height(-118, 122) + 3, 122);
  })();

  /* ---------- trees (instanced) ---------- */
  (function () {
    var reserved = [
      [12, -72, 26], [-82, -40, 26], [72, -42, 18], [-112, 68, 14], [182, 48, 26], [-54, 52, 30], [18, -38, 10], [32, -44, 8],
      // keep camera stops clear
      [52, -18, 16], [-42, 2, 16], [46, -26, 22], [-66, 112, 14], [-86, 84, 20], [-70, 68, 12], [-6, -36, 16], [48, 72, 16]
    ];
    function blocked(x, z) {
      if (lakeD(x, z) < 1.25) return true;
      if (inPasture(x, z, 8)) return true;
      for (var i = 0; i < reserved.length; i++) { var r = reserved[i]; if (Math.hypot(x - r[0], z - r[1]) < r[2]) return true; }
      // keep the boardwalk clear
      if (z > 105 && z < 150 && x < -60 && x > -175) { var mid = 112 + (-(x + 70)) * 0.32; if (Math.abs(z - mid) < 6) return true; }
      return false;
    }
    function density(x, z) {
      var d = 0.06;
      if (x < -55) d = 0.75;
      if (z > 105) d = Math.max(d, 0.7);
      if (Math.hypot(x, z) > 240) d = 0.85;
      if (z < -110) d = Math.max(d, 0.55);
      return d;
    }
    var pines = [], leafy = [];
    for (var i = 0; i < 4200 && (pines.length + leafy.length) < 1300; i++) {
      var x = rr(-420, 420), z = rr(-420, 420);
      if (blocked(x, z) || rand() > density(x, z)) continue;
      (rand() < 0.5 ? pines : leafy).push([x, height(x, z), z, rr(0.75, 1.45)]);
    }
    // a few hand-placed trees around the homes
    [[0, -88], [26, -86], [-8, -60], [-98, -54], [-66, -58], [84, -62], [-126, 56], [-100, 82], [-122, 82]].forEach(function (t) { pines.push([t[0], height(t[0], t[1]), t[1], rr(0.9, 1.3)]); });

    var m4 = new T.Matrix4(), q = new T.Quaternion(), p = new T.Vector3(), s = new T.Vector3(), col = new T.Color();
    // pines: two stacked cones + trunk
    var pineGeoA = new T.ConeGeometry(4.2, 9, 7); pineGeoA.translate(0, 8, 0);
    var pineGeoB = new T.ConeGeometry(3.1, 7, 7); pineGeoB.translate(0, 12.5, 0);
    var trunkGeo = new T.CylinderGeometry(0.5, 0.7, 4, 6); trunkGeo.translate(0, 2, 0);
    var pineMat = new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 });
    var trunkMat = mat("#5a4330");
    var iA = new T.InstancedMesh(pineGeoA, pineMat, pines.length), iB = new T.InstancedMesh(pineGeoB, pineMat, pines.length), iT = new T.InstancedMesh(trunkGeo, trunkMat, pines.length + leafy.length);
    var pineCols = ["#2f4a32", "#36553a", "#3e5f3c", "#8aa14a" /* tamarack */];
    pines.forEach(function (t, i) {
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), rand() * 6.28);
      p.set(t[0], t[1] - 0.3, t[2]); s.set(t[3], t[3] * rr(0.9, 1.25), t[3]); m4.compose(p, q, s);
      iA.setMatrixAt(i, m4); iB.setMatrixAt(i, m4); iT.setMatrixAt(i, m4);
      col.set(pineCols[rand() < 0.1 ? 3 : Math.floor(rand() * 3)]);
      iA.setColorAt(i, col); iB.setColorAt(i, col);
    });
    // deciduous: lumpy crowns in summer greens with early-autumn accents
    var crownGeo = new T.IcosahedronGeometry(4.6, 1); crownGeo.translate(0, 8.5, 0);
    var crownMat = new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95, flatShading: true });
    var iC = new T.InstancedMesh(crownGeo, crownMat, leafy.length);
    var leafCols = ["#4f6b35", "#5f7a3a", "#6c8540", "#c9773a", "#b8542f", "#d9a440"];
    leafy.forEach(function (t, i) {
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), rand() * 6.28);
      p.set(t[0], t[1] - 0.3, t[2]); s.set(t[3], t[3] * rr(0.85, 1.2), t[3]); m4.compose(p, q, s);
      iC.setMatrixAt(i, m4); iT.setMatrixAt(pines.length + i, m4);
      col.set(leafCols[rand() < 0.22 ? 3 + Math.floor(rand() * 3) : Math.floor(rand() * 3)]);
      iC.setColorAt(i, col);
    });
    [iA, iB, iT, iC].forEach(function (m) { m.castShadow = true; m.receiveShadow = true; scene.add(m); });
  })();

  /* ---------- fire & fireflies ---------- */
  var fireLight = new T.PointLight("#ff9a4a", 0, 40, 2);
  fireLight.position.copy(anchors.fire).add(new T.Vector3(0, 1.6, 0));
  scene.add(fireLight);
  var flames = new T.Group();
  for (var fl = 0; fl < 4; fl++) {
    var flame = new T.Mesh(new T.ConeGeometry(0.55 - fl * 0.08, 2.2 - fl * 0.3, 7), glow(fl % 2 ? "#ffb347" : "#ff7a2f", 1.6));
    flame.position.set(rr(-0.4, 0.4), 1.1, rr(-0.4, 0.4)); flames.add(flame);
  }
  flames.position.copy(anchors.fire).add(new T.Vector3(0, 0.6, 0));
  scene.add(flames);

  var fireflies;
  (function () {
    var g = new T.BufferGeometry(), arr = [];
    for (var i = 0; i < 260; i++) { var x = rr(-160, 200), z = rr(-120, 160); arr.push(x, height(x, z) + rr(1.5, 8), z); }
    g.setAttribute("position", new T.Float32BufferAttribute(arr, 3));
    fireflies = new T.Points(g, new T.PointsMaterial({ color: "#ffe9a3", size: 1.1, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(fireflies);
  })();

  /* ---------- camera chapters ---------- */
  function V(x, y, z) { return new T.Vector3(x, y, z); }
  var CHAPTERS = [
    { pos: V(230, 150, 250), look: V(10, 0, 10), dusk: 0, anchor: null },              // the whole farm
    { pos: V(48, 16, 72), look: V(8, 1, -10), dusk: 0, anchor: null },                // Narrin Lake
    { pos: V(52, 26, -18), look: V(12, 8, -70), dusk: 0.05, anchor: "clubhouse" },    // Clubhouse
    { pos: V(-42, 24, 2), look: V(-82, 6, -40), dusk: 0.08, anchor: "lodge" },        // Lodge
    { pos: V(46, 16, -24), look: V(72, 5, -44), dusk: 0.15, anchor: "grooms" },       // Grooms
    { pos: V(-66, 42, 112), look: V(-112, 4, 70), dusk: 0.18, anchor: "woods" },      // Woods & trail
    { pos: V(95, 58, 170), look: V(130, 2, 60), dusk: 0.22, anchor: "barn" },         // pastures & boarding
    { pos: V(-88, 22, 86), look: V(-50, 3, 48), dusk: 0.55, anchor: "wedding" },      // weddings
    { pos: V(-6, 24, -34), look: V(16, 12, -58), dusk: 1, anchor: null }               // the fire, at dusk
  ];
  CHAPTERS.forEach(function (c) { c.look.y += Math.max(0, height(c.look.x, c.look.z)); });
  var ANCHOR_LABELS = { clubhouse: "The Clubhouse", lodge: "The Lodge", grooms: "The Grooms", woods: "The Woods", barn: "Barn & pastures", wedding: "Wedding lawn" };

  var steps = Array.prototype.slice.call(document.querySelectorAll(".tour-step"));
  var hudWrap = document.querySelector(".tour-hud");
  var progressBar = document.querySelector(".tour-progress");
  var label = document.querySelector(".tour-label");
  var pin = document.querySelector(".tour-pin");
  var hudBtns = [];
  if (hudWrap) {
    steps.forEach(function (st, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", "Go to: " + (st.querySelector("h3") ? st.querySelector("h3").textContent : "chapter " + (i + 1)));
      b.addEventListener("click", function () {
        var r = stage.getBoundingClientRect();
        var total = stage.offsetHeight - window.innerHeight;
        var y = window.scrollY + r.top + (i / (CHAPTERS.length - 1)) * total + 2;
        window.scrollTo({ top: y, behavior: reduceMotion ? "auto" : "smooth" });
      });
      hudWrap.appendChild(b); hudBtns.push(b);
    });
  }

  var camPos = CHAPTERS[0].pos.clone(), camLook = CHAPTERS[0].look.clone();
  var wantPos = camPos.clone(), wantLook = camLook.clone();
  var dusk = 0, wantDusk = 0;
  var mouse = { x: 0, y: 0 };
  window.addEventListener("pointermove", function (e) { mouse.x = e.clientX / window.innerWidth - 0.5; mouse.y = e.clientY / window.innerHeight - 0.5; }, { passive: true });

  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  var activeIndex = -1;
  function readScroll() {
    var r = stage.getBoundingClientRect();
    var total = stage.offsetHeight - window.innerHeight;
    var p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
    var f = p * (CHAPTERS.length - 1);
    var i = Math.min(CHAPTERS.length - 2, Math.floor(f));
    var t = ease(f - i);
    var a = CHAPTERS[i], b = CHAPTERS[i + 1];
    wantPos.lerpVectors(a.pos, b.pos, t);
    wantPos.y += Math.sin(t * Math.PI) * 28; // lift between chapters so we glide over trees
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

  /* ---------- resize ---------- */
  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 700 ? 55 : 42;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);

  /* ---------- loop ---------- */
  var visible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) { clock.getDelta(); requestAnimationFrame(frame); } }, { rootMargin: "200px" }).observe(stage);
  }
  var clock = new T.Clock();
  var tmpCol = new T.Color();
  var proj = new T.Vector3();
  var running = false;

  function updateAnimals(dt, time) {
    animals.forEach(function (a) {
      var o = a.obj;
      if (a.wait > 0) {
        a.wait -= dt;
        o.children[0].rotation.z = Math.sin(time * 0.8 + a.phase) * 0.02; // grazing sway
        return;
      }
      var dx = a.target.x - o.position.x, dz = a.target.z - o.position.z, d = Math.hypot(dx, dz);
      if (d < 0.6) {
        a.target.set(rr(a.area.x0, a.area.x1), 0, rr(a.area.z0, a.area.z1));
        a.wait = rr(3, 9);
        return;
      }
      var want = Math.atan2(-dz, dx);
      var cur = o.rotation.y, diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
      o.rotation.y = cur + diff * Math.min(1, dt * 2);
      var step = Math.min(d, a.speed * dt);
      o.position.x += Math.cos(o.rotation.y) * step;
      o.position.z -= Math.sin(o.rotation.y) * step;
      o.position.y = height(o.position.x, o.position.z);
      var legs = o.userData.legs;
      for (var i = 0; i < legs.length; i++) legs[i].rotation.z = Math.sin(time * 7 + a.phase + (i % 2 ? Math.PI : 0)) * 0.35;
    });
  }

  function frame() {
    if (!visible) { running = false; return; }
    running = true;
    var dt = Math.min(clock.getDelta(), 0.05);
    var time = clock.elapsedTime;
    var k = reduceMotion ? 1 : 1 - Math.pow(0.0025, dt);

    camPos.lerp(wantPos, k); camLook.lerp(wantLook, k);
    dusk += (wantDusk - dusk) * k;
    camera.position.set(camPos.x + mouse.x * 6, camPos.y - mouse.y * 3, camPos.z);
    camera.lookAt(camLook);

    // time of day
    var sky = tmpCol.copy(DAY_SKY).lerp(DUSK_SKY, Math.min(1, dusk * 1.4));
    if (dusk > 0.7) sky.lerp(NIGHT_SKY, (dusk - 0.7) / 0.3 * 0.55);
    scene.background.copy(sky); scene.fog.color.copy(sky);
    sun.intensity = 1.6 - dusk * 1.05;
    sun.color.set("#fff1d6").lerp(new T.Color("#ff9d5c"), dusk);
    sun.position.set(160 - dusk * 300, 200 - dusk * 150, 90);
    hemi.intensity = 0.75 - dusk * 0.3;
    windowMats.forEach(function (m) { m.emissiveIntensity = 0.15 + dusk * 1.6; });
    var flicker = 0.85 + Math.sin(time * 13) * 0.08 + Math.sin(time * 23.7) * 0.07;
    fireLight.intensity = (0.4 + dusk * 2.6) * flicker;
    flames.children.forEach(function (f, i) { f.scale.y = 0.8 + Math.sin(time * (9 + i * 3) + i) * 0.25; });
    fireflies.material.opacity = Math.max(0, dusk - 0.4) * 1.4 * (0.75 + Math.sin(time * 3) * 0.25);
    stringBulbs.concat(weddingLights).forEach(function (b) { b.material.emissiveIntensity = 0.6 + dusk * 2; });

    // kayaks loop around the lake
    kayaks.forEach(function (k) {
      var a = time * 0.06 + k.phase;
      var x = Math.cos(a) * LAKE.rx * k.r, z = Math.sin(a) * LAKE.rz * k.r;
      k.obj.position.set(x, 0.55 + Math.sin(time * 2 + k.phase) * 0.08, z);
      k.obj.rotation.y = Math.atan2(-Math.cos(a) * LAKE.rz, -Math.sin(a) * LAKE.rx);
      k.obj.userData.paddle.rotation.x = Math.sin(time * 3 + k.phase) * 0.6;
    });
    var gl = scene.getObjectByName("glints");
    if (gl) { gl.rotation.y = time * 0.01; gl.material.opacity = 0.35 + Math.sin(time * 1.7) * 0.2 - dusk * 0.2; }

    if (!reduceMotion) updateAnimals(dt, time);

    // floating label over the featured building
    if (pin) {
      var ch = CHAPTERS[Math.max(0, activeIndex)];
      if (ch && ch.anchor && anchors[ch.anchor]) {
        proj.copy(anchors[ch.anchor]).add(new T.Vector3(0, 9, 0)).project(camera);
        var on = proj.z < 1 && Math.abs(proj.x) < 0.95 && Math.abs(proj.y) < 0.95;
        pin.style.opacity = on ? "1" : "0";
        pin.style.transform = "translate(-50%, -100%) translate(" + ((proj.x + 1) / 2 * canvas.clientWidth).toFixed(1) + "px," + ((1 - proj.y) / 2 * canvas.clientHeight).toFixed(1) + "px)";
        pin.textContent = ANCHOR_LABELS[ch.anchor];
      } else pin.style.opacity = "0";
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  resize();
  readScroll();
  camPos.copy(wantPos); camLook.copy(wantLook); dusk = wantDusk;
  if (!running) requestAnimationFrame(frame);
})();
