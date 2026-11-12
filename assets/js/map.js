/* Narrin Farms — interactive satellite map (Leaflet + Esri World Imagery)
 *
 * To add a pin for each home, barn or wedding lawn, add an entry to PLACES
 * below and a matching <button data-place="..."> in the page's map panel.
 */
(function () {
  "use strict";
  if (!window.L) return;

  // Narrin Lake (USGS GNIS feature 633215). The farm overlooks the lake.
  var FARM = [42.8301, -83.4729];
  var ADDRESS = "1100 Bird Rd, Ortonville, MI 48462";
  var DIRECTIONS = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(ADDRESS);

  var PLACES = {
    farm:    { latlng: FARM, zoom: 17, color: "#a4402c", title: "Narrin Farms", text: "56 acres of pasture, woods and trails on spring-fed Narrin Lake.<br>" + ADDRESS },
    lake:    { latlng: [42.8301, -83.4729], zoom: 18, color: "#3f6f78", title: "Narrin Lake", text: "Private-access, spring-fed and motor-free — kayaks and fishing right from the farm." },
    holly:   { latlng: [42.8128, -83.5075], zoom: 14, color: "#4d6a4f", title: "Holly Recreation Area", text: "Thousands of acres of state trails, beaches and mountain biking — about 0.7 miles from The Woods." },
    ortonville: { latlng: [42.8523, -83.4430], zoom: 15, color: "#c6a46a", title: "Ortonville", text: "Village shops, coffee and dining a few minutes up the road." },
    clarkston:  { latlng: [42.7359, -83.4188], zoom: 15, color: "#c6a46a", title: "Clarkston", text: "Historic downtown restaurants and the Pine Knob Music Theatre area." }
  };

  function tileLayers() {
    var esriAttr = "Imagery &copy; Esri, Maxar, Earthstar Geographics";
    var sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 19, attribution: esriAttr });
    var labels = L.layerGroup([
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, opacity: 0.9 }),
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 })
    ]);
    var street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" });
    return { sat: sat, labels: labels, street: street };
  }

  function popupHtml(p) {
    return "<h4>" + p.title + "</h4><div>" + p.text + "</div>" +
      '<div style="margin-top:8px"><a href="' + DIRECTIONS + '" target="_blank" rel="noopener">Get directions to the farm →</a></div>';
  }

  function init(el) {
    var canvas = el.querySelector(".map-canvas");
    var mapDiv = document.createElement("div");
    canvas.insertBefore(mapDiv, canvas.firstChild);

    var map = L.map(mapDiv, { zoomControl: false, scrollWheelZoom: false, attributionControl: true }).setView(FARM, 15);
    var layers = tileLayers();
    layers.sat.addTo(map);
    layers.labels.addTo(map);

    // Only zoom with the wheel once someone has clicked into the map.
    map.on("click focus", function () { map.scrollWheelZoom.enable(); var h = el.querySelector(".map-hint"); if (h) h.style.display = "none"; });
    map.on("mouseout", function () { map.scrollWheelZoom.disable(); });

    var markers = {};
    Object.keys(PLACES).forEach(function (key) {
      var p = PLACES[key];
      var icon;
      if (key === "farm") {
        icon = L.divIcon({ className: "", html: '<div class="pin-pulse"></div><div class="farm-pin"><span>N</span></div>', iconSize: [46, 46], iconAnchor: [23, 46], popupAnchor: [0, -44] });
      } else if (key === "lake") {
        return; // same spot as the farm pin
      } else {
        icon = L.divIcon({ className: "", html: '<div class="small-pin" style="background:' + p.color + '"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
      }
      markers[key] = L.marker(p.latlng, { icon: icon, title: p.title, keyboard: true }).addTo(map).bindPopup(popupHtml(p));
    });
    markers.lake = markers.farm;

    // layer switch
    var layerBtns = el.querySelectorAll(".map-layers button");
    layerBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        layerBtns.forEach(function (x) { x.classList.remove("active"); x.setAttribute("aria-pressed", "false"); });
        b.classList.add("active"); b.setAttribute("aria-pressed", "true");
        var mode = b.getAttribute("data-layer");
        [layers.sat, layers.labels, layers.street].forEach(function (l) { if (map.hasLayer(l)) map.removeLayer(l); });
        if (mode === "satellite") layers.sat.addTo(map);
        if (mode === "hybrid") { layers.sat.addTo(map); layers.labels.addTo(map); }
        if (mode === "map") layers.street.addTo(map);
      });
    });

    // place buttons
    var placeBtns = el.querySelectorAll("[data-place]");
    function go(key) {
      var p = PLACES[key]; if (!p) return;
      placeBtns.forEach(function (x) { x.classList.toggle("active", x.getAttribute("data-place") === key); });
      map.flyTo(p.latlng, p.zoom, { duration: 1.8 });
      map.once("moveend", function () { if (key === "lake") { L.popup().setLatLng(p.latlng).setContent(popupHtml(p)).openOn(map); } else if (markers[key]) markers[key].openPopup(); });
    }
    placeBtns.forEach(function (b) { b.addEventListener("click", function () { stopTour(); go(b.getAttribute("data-place")); }); });

    // tools
    var tourTimer = null;
    function stopTour() { if (tourTimer) { clearInterval(tourTimer); tourTimer = null; } }
    el.querySelectorAll("[data-map-tool]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = b.getAttribute("data-map-tool");
        if (t === "in") map.zoomIn();
        if (t === "out") map.zoomOut();
        if (t === "home") { stopTour(); go("farm"); }
        if (t === "full") {
          var target = canvas;
          if (document.fullscreenElement) document.exitFullscreen();
          else if (target.requestFullscreen) target.requestFullscreen().then(function () { setTimeout(function () { map.invalidateSize(); }, 200); });
        }
        if (t === "tour") {
          if (tourTimer) { stopTour(); return; }
          var keys = ["farm", "lake", "holly", "ortonville", "clarkston", "farm"];
          var i = 0; go(keys[i]);
          tourTimer = setInterval(function () { i++; if (i >= keys.length) { stopTour(); return; } go(keys[i]); }, 4200);
        }
      });
    });
    document.addEventListener("fullscreenchange", function () { setTimeout(function () { map.invalidateSize(); }, 200); });

    // Gentle zoom-in the first time the map scrolls into view.
    if ("IntersectionObserver" in window) {
      var seen = false;
      new IntersectionObserver(function (entries, obs) {
        if (entries[0].isIntersecting && !seen) { seen = true; obs.disconnect(); map.invalidateSize(); map.flyTo(FARM, 16, { duration: 2.4 }); }
      }, { threshold: 0.35 }).observe(canvas);
    }
  }

  document.querySelectorAll("[data-farm-map]").forEach(init);
})();
