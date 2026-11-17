/*
  今風版（modern.html）専用のスクリプト。無くてもページは全部読める（その場合もトップの絵は表示される）。

  セキュリティ方針：
  - このファイル1つだけを自サイトから読み込む（CSP: script-src 'self'。外部スクリプト・インラインスクリプトは禁止のまま）
  - 通信しない（fetch / XHR なし）・保存しない（Cookie / localStorage なし）・文字入力を受け取らない
  - HTMLを文字列から組み立てない（innerHTML / eval / document.write は使わない）
  - 音は鳴らさない（曲の再生は player.js が担当）
*/
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hero = document.querySelector(".hero");

  /* =========
     1. トップの絵に奥行きをつける
        指・マウスの位置に合わせて、奥の景色と手前の人物を少しだけ逆向きにずらす（視差）
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
     2. 弾ける海
        海に触れると波紋が広がり、空に触れると星がまたたく（音は鳴らない。説明のない小さな仕掛け）。
     ========= */
  (function sea() {
    var canvas = document.querySelector(".hero-sea");
    var bg = document.querySelector(".hero-bg");
    if (!hero || !canvas || !bg || !canvas.getContext) return;
    var g = canvas.getContext("2d");
    if (!g) return;

    /* 元の絵（1536×1024）の中での水平線の高さと、夕日の中心の横位置 */
    var IMG_W = 1536;
    var IMG_H = 1024;
    var HORIZON = 545;
    var SUN_X = 765;

    var W = 0;
    var H = 0;
    var marks = []; /* 波紋と星 */
    var running = false;
    var visible = true;

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = hero.clientWidth;
      H = hero.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* いま画面に見えている絵の中で、水平線と夕日がどこにあるか（絵は拡大・移動するので毎回計算する） */
    function scene() {
      var h = hero.getBoundingClientRect();
      var b = bg.getBoundingClientRect();
      var scale = Math.max(b.width / IMG_W, b.height / IMG_H);
      return {
        horizon: b.top - h.top + (b.height - IMG_H * scale) / 2 + HORIZON * scale,
        sunX: b.left - h.left + (b.width - IMG_W * scale) / 2 + SUN_X * scale,
        scale: scale
      };
    }

    /* 夕日の照り返しのきらめき（位置は固定、明るさだけがゆっくり変わる） */
    var glints = [];
    for (var i = 0; i < 26; i++) {
      glints.push({
        depth: Math.pow((i + 0.5) / 26, 1.4), /* 0=水平線 1=手前 */
        side: Math.sin(i * 12.9898) * 0.5, /* -0.5〜0.5 の決まった乱数 */
        len: 0.5 + ((i * 7) % 5) / 5,
        speed: 0.5 + ((i * 3) % 7) / 6,
        phase: i * 2.4
      });
    }

    function draw(now) {
      running = false;
      g.clearRect(0, 0, W, H);
      var s = scene();
      var t = now / 1000;
      var sea = Math.max(1, H - s.horizon);

      if (!reduceMotion) {
        g.lineCap = "round";
        for (var i = 0; i < glints.length; i++) {
          var q = glints[i];
          var a = Math.sin(t * q.speed + q.phase);
          if (a <= 0) continue;
          var spread = (30 + q.depth * 150) * s.scale;
          var x = s.sunX + q.side * spread * 2;
          var y = s.horizon + 6 + q.depth * sea * 0.7;
          var half = (8 + q.depth * 30) * q.len * s.scale;
          g.strokeStyle = "rgba(255, 196, 120, " + (a * a * a * 0.55).toFixed(3) + ")";
          g.lineWidth = 1 + q.depth * 1.5;
          g.beginPath();
          g.moveTo(x - half, y);
          g.lineTo(x + half, y);
          g.stroke();
        }
      }

      for (var k = marks.length - 1; k >= 0; k--) {
        var m = marks[k];
        var age = (now - m.born) / 1000;
        if (age > m.life) {
          marks.splice(k, 1);
          continue;
        }
        var fade = 1 - age / m.life;
        if (m.star) {
          /* 空：十字にまたたく星 */
          var r = (4 + 22 * Math.sin(Math.min(1, age * 3) * Math.PI * 0.5)) * (0.4 + fade * 0.6);
          g.strokeStyle = "rgba(255, 236, 200, " + (fade * 0.95).toFixed(3) + ")";
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(m.x - r, m.y);
          g.lineTo(m.x + r, m.y);
          g.moveTo(m.x, m.y - r);
          g.lineTo(m.x, m.y + r);
          g.stroke();
          g.fillStyle = "rgba(255, 236, 200, " + fade.toFixed(3) + ")";
          g.beginPath();
          g.arc(m.x, m.y, 2.2, 0, Math.PI * 2);
          g.fill();
        } else {
          /* 海：遠くほど小さく平たい、3重の波紋 */
          var near = 0.3 + 0.7 * Math.min(1, Math.max(0, (m.y - s.horizon) / sea));
          for (var ring = 0; ring < 3; ring++) {
            var ringAge = age - ring * 0.28;
            if (ringAge <= 0) continue;
            var rx = (14 + ringAge * 150) * near;
            g.strokeStyle = "rgba(255, 184, 102, " + (fade * fade * (0.85 - ring * 0.22)).toFixed(3) + ")";
            g.lineWidth = 1 + near * 1.4;
            g.beginPath();
            g.ellipse(m.x, m.y, rx, rx * 0.2, 0, 0, Math.PI * 2);
            g.stroke();
          }
        }
      }

      schedule();
    }

    /* 画面外・別タブのとき、動かすものが無いときは描かない（電池を使わない） */
    function schedule() {
      if (running || !visible || document.hidden) return;
      if (reduceMotion && marks.length === 0) return;
      running = true;
      requestAnimationFrame(draw);
    }

    function addMark(x, y, star) {
      if (marks.length > 40) marks.shift();
      marks.push({ x: x, y: y, star: star, born: performance.now(), life: star ? 1.4 : 2.6 });
      schedule();
    }

    /* ---- 触れたとき（音は鳴らさない。触れた場所に波紋や星が出るだけ） ---- */

    var dragging = false;
    var lastX = 0;
    var lastY = 0;

    function touch(event) {
      /* ボタンやリンクの上は対象外 */
      if (event.target.closest && event.target.closest("a, button")) return;
      var box = hero.getBoundingClientRect();
      var x = event.clientX - box.left;
      var y = event.clientY - box.top;
      if (x < 0 || x > box.width || y < 0 || y > box.height) return;
      lastX = x;
      lastY = y;
      addMark(x, y, y < scene().horizon);
    }

    hero.addEventListener("pointerdown", function (event) {
      dragging = true;
      touch(event);
    });
    /* なぞると、少し離れるたびに波紋が続く */
    hero.addEventListener("pointermove", function (event) {
      if (!dragging) return;
      var box = hero.getBoundingClientRect();
      var dx = event.clientX - box.left - lastX;
      var dy = event.clientY - box.top - lastY;
      if (dx * dx + dy * dy > 60 * 60) touch(event);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (name) {
      hero.addEventListener(name, function () {
        dragging = false;
      });
    });

    document.addEventListener("visibilitychange", function () {
      schedule();
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        schedule();
      }).observe(hero);
    }

    window.addEventListener("resize", function () {
      resize();
      schedule();
    });
    resize();
    schedule();
  })();

  /* =========
     3. 今見ている欄のメニューを光らせる
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
     4. スクロール連動アニメーション非対応のブラウザ向けの代替（対応ブラウザではCSSに任せる）
     ========= */
  if (window.CSS && CSS.supports && CSS.supports("animation-timeline", "view()")) return;
  if (!("IntersectionObserver" in window)) return;

  root.classList.add("js-fallback");

  /* キャッチコピー：画面に入ったら右の行から順に点灯 */
  var statement = document.querySelector(".statement-text");
  if (statement) {
    var lit = new IntersectionObserver(
      function (entries) {
        if (!entries[0].isIntersecting) return;
        statement.classList.add("is-lit");
        lit.disconnect();
      },
      { rootMargin: "0px 0px -30% 0px" }
    );
    lit.observe(statement);
  }

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
