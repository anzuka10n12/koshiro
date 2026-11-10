/*
  今風版（modern.html）専用のスクリプト。無くてもページは全部読める（その場合トップは写真だけになる）。

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
     1. トップの「音の波形」
        何十本もの細い線を束ねた帯が、ゆっくりうねる。
        - マウス／指を近づけると、その場所がふくらむ
        - 押す（タップ）と、そこから波紋が左右に走る
        - 何もしなくても、数秒ごとに自動で波紋が走る（鼓動）
        - 下へスクロールすると、静かにほどけて消える
     ========= */
  function initWave() {
    var canvas = hero.querySelector(".hero-wave");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var w = 0;
    var h = 0;
    var dpr = 1;
    var lineCount = 0;
    var step = 8;
    var wide = false;
    var pointer = { x: 0, y: 0, strength: 0, target: 0 };
    var ripples = [];
    var startedAt = performance.now();
    var lastBeat = 0.4;
    var onScreen = true;
    var frame = 0;

    function resize() {
      var box = hero.getBoundingClientRect();
      w = box.width;
      h = box.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      wide = w >= 900;
      lineCount = wide ? 58 : 38;
      step = wide ? 8 : 6;
      if (reduceMotion) draw(startedAt);
    }

    /* 帯の中心線：PCでは右上がりに写真の前を横切り、スマホでは顔にかからないよう肩のあたりを横切る */
    function centerY(u) {
      return wide ? h * (0.7 - 0.3 * u) : h * (0.7 - 0.04 * Math.sin(u * Math.PI));
    }

    function draw(now) {
      var time = (now - startedAt) / 1000;
      var fade = Math.max(0, 1 - window.scrollY / (h * 0.85));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (fade <= 0) return;

      pointer.strength += (pointer.target - pointer.strength) * 0.08;

      /* 自動の波紋（鼓動） */
      if (!reduceMotion && time - lastBeat > 2.8) {
        ripples.push({ x: w * (0.2 + 0.6 * Math.random()), born: time });
        lastBeat = time;
      }
      ripples = ripples.filter(function (r) {
        return time - r.born < 3.6;
      });

      var spread = h * (wide ? 0.3 : 0.17);
      var amp = h * 0.055;
      var points = Math.ceil(w / step) + 1;
      var reach = wide ? 220 : 130;

      /* x方向で共通の値を先に計算しておく */
      var base = new Float32Array(points);
      var open = new Float32Array(points);
      var wobble = new Float32Array(points);
      var env = new Float32Array(points);
      for (var p = 0; p < points; p++) {
        var x = p * step;
        var u = x / w;
        var e = 0.22 + 0.78 * Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
        var near = Math.exp(-Math.pow((x - pointer.x) / reach, 2)) * pointer.strength;
        var cy = centerY(u);
        var rippleOpen = 0;
        var rippleWave = 0;
        for (var k = 0; k < ripples.length; k++) {
          var age = time - ripples[k].born;
          var front = age * w * 0.5;
          var dist = Math.abs(x - ripples[k].x);
          var band = Math.exp(-Math.pow((dist - front) / (w * 0.07 + 30), 2)) * Math.exp(-age * 1.1);
          rippleOpen += band;
          rippleWave += Math.sin((dist - front) * 0.05) * band;
        }
        env[p] = e;
        base[p] = cy + near * (pointer.y - cy) * 0.45;
        open[p] = spread * e * (1 + near * 0.9 + rippleOpen * 0.6);
        wobble[p] = rippleWave * h * 0.03;
      }

      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1.25;

      for (var i = 0; i < lineCount; i++) {
        var o = i / (lineCount - 1) - 0.5; /* -0.5（上端）〜 0.5（下端） */
        var core = 1 - Math.abs(o) * 2; /* 帯の中心ほど 1 に近い */

        /* 色：外側は灰紫、中心は金色、芯はあたたかい白 */
        var r = 150 + 95 * core;
        var g = 150 + 27 * core;
        var b = 178 - 102 * core;
        if (core > 0.88) {
          var hot = (core - 0.88) / 0.12;
          r += (255 - r) * hot;
          g += (236 - g) * hot;
          b += (196 - b) * hot;
        }
        var alpha = (0.09 + 0.66 * Math.pow(core, 1.4)) * fade;
        ctx.strokeStyle = "rgba(" + Math.round(r) + "," + Math.round(g) + "," + Math.round(b) + "," + alpha.toFixed(3) + ")";

        ctx.beginPath();
        for (var q = 0; q < points; q++) {
          var uu = (q * step) / w;
          var wave =
            Math.sin(uu * 6.0 + time * 0.6 + o * 2.4) * 0.55 +
            Math.sin(uu * 13.0 - time * 0.9 + o * 5.0) * 0.25 +
            Math.sin(uu * 2.2 + time * 0.25) * 0.5;
          var y = base[q] + o * open[q] * (0.55 + 0.45 * fade) + amp * env[q] * wave * fade + wobble[q] * (0.5 + Math.abs(o) * 2);
          if (q === 0) ctx.moveTo(0, y);
          else ctx.lineTo(q * step, y);
        }
        ctx.stroke();
      }
    }

    function loop(now) {
      frame = 0;
      draw(now);
      if (onScreen && !document.hidden) frame = requestAnimationFrame(loop);
    }

    function wake() {
      if (!frame && onScreen && !document.hidden && !reduceMotion) frame = requestAnimationFrame(loop);
    }

    function moveTo(event) {
      var box = hero.getBoundingClientRect();
      pointer.x = event.clientX - box.left;
      pointer.y = event.clientY - box.top;
    }

    hero.addEventListener("pointermove", function (event) {
      moveTo(event);
      pointer.target = 1;
    });
    hero.addEventListener("pointerleave", function () {
      pointer.target = 0;
    });
    hero.addEventListener("pointercancel", function () {
      pointer.target = 0;
    });
    hero.addEventListener("pointerdown", function (event) {
      moveTo(event);
      if (reduceMotion) return;
      ripples.push({ x: pointer.x, born: (performance.now() - startedAt) / 1000 });
      if (ripples.length > 6) ripples.shift();
    });
    hero.addEventListener("pointerup", function (event) {
      if (event.pointerType !== "mouse") pointer.target = 0;
    });

    /* 画面外・別タブのときは描画を止めて電池を節約 */
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[0].isIntersecting;
        wake();
      }).observe(hero);
    }
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("resize", resize);

    resize();
    if (reduceMotion) draw(startedAt); /* 「動きを減らす」設定では静止画を1枚だけ描く */
    else wake();
  }

  if (hero) {
    initWave();

    /* マウスに追従するやわらかい光 */
    if (!reduceMotion && window.matchMedia("(hover: hover)").matches) {
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
  }

  /* =========
     2. 今見ている欄のメニューを光らせる（CSSだけで対応できるブラウザでは何もしない）
     ========= */
  if (!CSS.supports("scroll-target-group", "auto") && "IntersectionObserver" in window) {
    var links = {};
    Array.prototype.forEach.call(document.querySelectorAll('.nav a[href^="#"]'), function (link) {
      links[link.getAttribute("href").slice(1)] = link;
    });
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var link = links[entry.target.id];
          if (!link || !entry.isIntersecting) return;
          Object.keys(links).forEach(function (id) {
            links[id].removeAttribute("aria-current");
          });
          link.setAttribute("aria-current", "true");
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
