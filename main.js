/*
  今風版（modern.html）専用の補助スクリプト。無くてもページは全部読める。

  セキュリティ方針：
  - このファイル1つだけを自サイトから読み込む（CSP: script-src 'self'。外部スクリプト・インラインスクリプトは禁止のまま）
  - 通信しない（fetch / XHR なし）・保存しない（Cookie / localStorage なし）・入力を受け取らない
  - HTMLを文字列から組み立てない（innerHTML / eval / document.write は使わない）
*/
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 1. マウスに追従する光（ヒーロー） */
  var hero = document.querySelector(".hero");
  if (hero && !reduceMotion && window.matchMedia("(hover: hover)").matches) {
    var waiting = false;
    hero.addEventListener("pointermove", function (event) {
      if (waiting) return;
      waiting = true;
      requestAnimationFrame(function () {
        var box = hero.getBoundingClientRect();
        hero.style.setProperty("--mx", event.clientX - box.left + "px");
        hero.style.setProperty("--my", event.clientY - box.top + "px");
        waiting = false;
      });
    });
  }

  /* 2. 今見ている欄のメニューを光らせる（CSSだけで対応できるブラウザでは何もしない） */
  if (!CSS.supports("scroll-target-group", "auto") && "IntersectionObserver" in window) {
    var links = {};
    Array.prototype.forEach.call(document.querySelectorAll('.nav a[href^="#"]'), function (link) {
      links[link.getAttribute("href").slice(1)] = link;
    });
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var link = links[entry.target.id];
          if (!link) return;
          if (entry.isIntersecting) {
            Object.keys(links).forEach(function (id) {
              links[id].removeAttribute("aria-current");
            });
            link.setAttribute("aria-current", "true");
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    Object.keys(links).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) spy.observe(section);
    });
  }

  /* 3. スクロール連動アニメーション非対応のブラウザ向けの代替（対応ブラウザではCSSに任せる） */
  if (CSS.supports("animation-timeline", "view()")) return;
  if (!("IntersectionObserver" in window)) return;

  root.classList.add("js-fallback");

  var reveal = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add(entry.target.classList.contains("reveal") ? "is-in" : "is-lit");
        reveal.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -18% 0px" }
  );
  Array.prototype.forEach.call(document.querySelectorAll(".reveal, .statement-text span"), function (el) {
    reveal.observe(el);
  });

  /* 進捗バー */
  var ticking = false;
  function updateProgress() {
    var max = root.scrollHeight - window.innerHeight;
    root.style.setProperty("--progress", max > 0 ? Math.min(1, window.scrollY / max) : 0);
    ticking = false;
  }
  window.addEventListener(
    "scroll",
    function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateProgress);
    },
    { passive: true }
  );
  updateProgress();
})();
