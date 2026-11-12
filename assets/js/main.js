/* Narrin Farms — shared site behaviour */
(function () {
  "use strict";
  var doc = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----- header: solid once scrolled ----- */
  var header = document.querySelector(".site-header");
  function onScroll() {
    if (header) header.classList.toggle("scrolled", window.scrollY > 40);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ----- mobile menu ----- */
  var menuBtn = document.querySelector(".menu-btn");
  if (menuBtn) {
    menuBtn.addEventListener("click", function () {
      var open = document.body.classList.toggle("menu-open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
    });
    document.querySelectorAll(".nav-links a").forEach(function (a) {
      a.addEventListener("click", function () {
        document.body.classList.remove("menu-open");
        menuBtn.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      });
    });
  }

  /* ----- reveal on scroll ----- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ----- hero photo stack: rotate cards ----- */
  var cards = Array.prototype.slice.call(document.querySelectorAll(".hero-card"));
  if (cards.length > 1 && !reduceMotion) {
    var order = cards.map(function (_, i) { return i; });
    setInterval(function () {
      order.push(order.shift());
      order.forEach(function (cardIdx, pos) { cards[cardIdx].setAttribute("data-pos", String(Math.min(pos, 3))); });
    }, 4200);
  }

  /* ----- gallery lightbox ----- */
  var lb = document.querySelector(".lightbox");
  var galleryBtns = Array.prototype.slice.call(document.querySelectorAll("[data-lightbox]"));
  if (lb && galleryBtns.length) {
    var lbImg = lb.querySelector("img");
    var idx = 0;
    var lastFocus = null;
    function show(i) {
      idx = (i + galleryBtns.length) % galleryBtns.length;
      var img = galleryBtns[idx].querySelector("img");
      lbImg.src = img.src; lbImg.alt = img.alt;
    }
    function close() { lb.classList.remove("open"); document.body.style.overflow = ""; if (lastFocus) lastFocus.focus(); }
    galleryBtns.forEach(function (b, i) {
      b.addEventListener("click", function () { lastFocus = b; show(i); lb.classList.add("open"); document.body.style.overflow = "hidden"; lb.querySelector(".lb-close").focus(); });
    });
    lb.querySelector(".lb-close").addEventListener("click", close);
    lb.querySelector(".lb-prev").addEventListener("click", function () { show(idx - 1); });
    lb.querySelector(".lb-next").addEventListener("click", function () { show(idx + 1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") show(idx - 1);
      if (e.key === "ArrowRight") show(idx + 1);
    });
  }

  /* ----- sub-navigation highlight ----- */
  var subLinks = Array.prototype.slice.call(document.querySelectorAll(".subnav a"));
  if (subLinks.length && "IntersectionObserver" in window) {
    var map = {};
    subLinks.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          subLinks.forEach(function (a) { a.classList.remove("active"); });
          var a = map[e.target.id];
          if (a) { a.classList.add("active"); a.scrollIntoView({ block: "nearest", inline: "center" }); }
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) so.observe(s); });
  }

  /* ----- inquiry form: compose an email to the farm ----- */
  var form = document.getElementById("inquiry");
  if (form) {
    var params = new URLSearchParams(location.search);
    var preType = params.get("type");
    var preHome = params.get("home");
    if (preType) {
      var r = form.querySelector('input[name="type"][value="' + preType + '"]');
      if (r) r.checked = true;
    }
    if (preHome) {
      var sel = form.querySelector('select[name="home"]');
      if (sel) sel.value = preHome;
    }
    function syncConditional() {
      var type = (form.querySelector('input[name="type"]:checked') || {}).value || "stay";
      form.querySelectorAll(".cond").forEach(function (el) {
        el.classList.toggle("show", el.getAttribute("data-for").split(" ").indexOf(type) !== -1);
      });
    }
    form.querySelectorAll('input[name="type"]').forEach(function (r) { r.addEventListener("change", syncConditional); });
    syncConditional();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var fd = new FormData(form);
      var type = fd.get("type");
      var labels = { stay: "Stay inquiry", wedding: "Wedding inquiry", boarding: "Horse boarding inquiry", other: "General question" };
      var lines = [
        "Name: " + fd.get("name"),
        "Email: " + fd.get("email"),
        "Phone: " + (fd.get("phone") || "—"),
        "Inquiry: " + labels[type]
      ];
      form.querySelectorAll(".cond.show [name]").forEach(function (el) {
        if (el.value) lines.push(el.getAttribute("data-label") + ": " + el.value);
      });
      lines.push("", fd.get("message") || "");
      var subject = labels[type] + " — " + fd.get("name");
      var text = lines.join("\n");
      var href = "mailto:service@narrinfarms.com?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(text);
      var status = document.querySelector(".form-status");
      if (status) {
        status.querySelector(".fs-text").value = "To: service@narrinfarms.com\nSubject: " + subject + "\n\n" + text;
        status.querySelector(".fs-mail").href = href;
        status.classList.add("show");
        status.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  }

  var copyBtn = document.querySelector(".fs-copy");
  if (copyBtn) copyBtn.addEventListener("click", function () {
    var ta = document.querySelector(".fs-text");
    function done(ok) { copyBtn.textContent = ok ? "Copied" : "Select the text and copy it"; }
    try {
      navigator.clipboard.writeText(ta.value).then(function () { done(true); }, function () { ta.select(); done(false); });
    } catch (err) { ta.select(); done(false); }
  });

  /* ----- footer year ----- */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  doc.classList.add("js");
})();
