/*
  今風版（modern.html）専用のスクリプト。無くてもページは全部読める（その場合もトップの絵は表示される）。

  セキュリティ方針：
  - このファイル1つだけを自サイトから読み込む（CSP: script-src 'self'。外部スクリプト・インラインスクリプトは禁止のまま）
  - 通信しない（fetch / XHR なし）・保存しない（Cookie / localStorage なし）・入力を受け取らない
  - HTMLを文字列から組み立てない（innerHTML / eval / document.write は使わない）
*/
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hero = document.querySelector(".hero");

  /* =========
     1. トップの絵に奥行きをつける
        指・マウスの位置に合わせて、絵を少しだけずらす（視差）
     ========= */
  if (hero && !reduceMotion) {
    var waiting = false;
    hero.addEventListener("pointermove", function (event) {
      if (waiting) return;
      waiting = true;
      requestAnimationFrame(function () {
        var box = hero.getBoundingClientRect();
        /* -1（左・上）〜 1（右・下） */
        hero.style.setProperty("--px", (((event.clientX - box.left) / box.width - 0.5) * 2).toFixed(3));
        hero.style.setProperty("--py", (((event.clientY - box.top) / box.height - 0.5) * 2).toFixed(3));
        waiting = false;
      });
    });
    hero.addEventListener("pointerleave", function () {
      hero.style.setProperty("--px", "0");
      hero.style.setProperty("--py", "0");
    });
  }

  /* =========
     2. 今見ている欄のメニューを光らせる
        欄が画面の中央付近に来たときだけ光る。トップ（どの欄にも入っていない）では何も光らない。
     ========= */
  if ("IntersectionObserver" in window) {
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
          } else {
            link.removeAttribute("aria-current");
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

  /* =========
     3. スクロール連動アニメーション非対応のブラウザ向けの代替（対応ブラウザではCSSに任せる）
     ========= */
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
