/*
  今風版（modern.html）専用のスクリプト。無くてもページは全部読める（その場合トップは静止した夕空になる）。

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
     1. トップの絵：「音の波でできた夕景」
        キャッチコピー「日々の景色を音にして届ける」をそのまま絵にしたもの。
        空・沈む夕日・山並み・そして海は何十本もの音の波の線でできている。
        - マウス／指を近づけると、その場所の水面が持ち上がる
        - 押す（タップ）と、そこから波紋が広がる
        - 何もしなくても、数秒ごとに自動で波紋が広がる
        - 下へスクロールすると、夕日が沈んで夜になる
     ========= */
  function initScene() {
    var canvas = hero.querySelector(".hero-scene");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var w = 0;
    var h = 0;
    var dpr = 1;
    var wide = false;
    var horizon = 0;
    var sunR = 0;
    var sunX = 0;
    var lineCount = 0;
    var step = 8;
    var stars = [];
    var clouds = [];
    var unit = 0;
    var pointer = { x: 0, y: 0, strength: 0, target: 0 };
    var ripples = [];
    var startedAt = performance.now();
    var lastBeat = 0.6;
    var onScreen = true;
    var frame = 0;

    /* 毎回同じ並びになる乱数（星の位置を固定するため） */
    function seeded(seed) {
      return function () {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };
    }

    function resize() {
      var box = hero.getBoundingClientRect();
      w = box.width;
      h = box.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      wide = w >= 900;
      horizon = h * (wide ? 0.56 : 0.47);
      sunR = wide ? h * 0.25 : w * 0.34;
      sunX = w * (wide ? 0.7 : 0.62);
      lineCount = wide ? 48 : 34;
      step = wide ? 8 : 6;
      unit = Math.min(w, h);

      var random = seeded(20261110);
      stars = [];
      for (var i = 0; i < (wide ? 110 : 60); i++) {
        stars.push({
          x: random(),
          y: Math.pow(random(), 1.6) * 0.92,
          size: 0.6 + random() * 1.1,
          speed: 0.4 + random() * 1.4,
          phase: random() * 6.28,
          depth: 0.3 + random() * 0.7
        });
      }
      /* 雲：細い線の束（夕日の前を横切るものは影になる） */
      clouds = [];
      for (var c = 0; c < (wide ? 4 : 3); c++) {
        clouds.push({
          x: random() * 1.2 - 0.2,
          height: 0.2 + c * (wide ? 0.3 : 0.42) + random() * 0.12,
          length: (wide ? 0.3 : 0.42) + random() * 0.25,
          thick: sunR * (0.07 + random() * 0.09),
          lines: 5 + Math.floor(random() * 4),
          drift: (c % 2 ? -1 : 1) * (0.003 + random() * 0.004)
        });
      }
      if (reduceMotion) draw(startedAt);
    }

    /* 山並みの稜線（夕日のあたりは低く、左右は高い） */
    function ridge(x, layer) {
      var u = x / w;
      var away = Math.min(1, Math.abs(x - sunX) / (w * (wide ? 0.42 : 0.7)));
      var valley = 0.18 + 0.82 * away * away * (3 - 2 * away);
      var shape =
        layer === 0
          ? 0.55 + 0.25 * Math.sin(u * 7.3 + 1.2) + 0.14 * Math.sin(u * 17.1 + 4.0) + 0.06 * Math.sin(u * 41.0)
          : 0.5 + 0.3 * Math.sin(u * 5.1 + 3.4) + 0.14 * Math.sin(u * 12.7 + 0.6) + 0.06 * Math.sin(u * 33.0 + 2.0);
      var height = layer === 0 ? h * (wide ? 0.15 : 0.085) : h * (wide ? 0.085 : 0.05);
      return horizon - height * valley * Math.max(0, shape);
    }

    function draw(now) {
      var time = (now - startedAt) / 1000;
      var day = Math.max(0, 1 - window.scrollY / (h * 0.85)); /* 1 = 夕暮れ、0 = 夜（スクロールで日が沈む） */
      var night = 1 - day;

      pointer.strength += (pointer.target - pointer.strength) * 0.08;
      var lean = pointer.strength * (pointer.x / w - 0.5); /* 視差（奥のものほど少しだけ動く） */

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";

      /* --- 空 --- */
      var sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "rgb(11,11,16)");
      sky.addColorStop(0.55, "rgb(" + Math.round(20 + 6 * day) + "," + Math.round(17 + 2 * day) + "," + Math.round(27 + 4 * day) + ")");
      sky.addColorStop(1, "rgb(" + Math.round(18 + 46 * day) + "," + Math.round(15 + 21 * day) + "," + Math.round(24 + 12 * day) + ")");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, horizon + 2);

      /* --- 星（夜になるほど増える） --- */
      for (var s = 0; s < stars.length; s++) {
        var star = stars[s];
        var twinkle = reduceMotion ? 0.8 : 0.45 + 0.55 * Math.abs(Math.sin(time * star.speed + star.phase));
        var high = 1 - star.y; /* 地平線近くの星は夕焼けに隠れる */
        var starAlpha = twinkle * (0.18 + 0.82 * night) * (0.25 + 0.75 * high);
        ctx.fillStyle = "rgba(243,240,232," + starAlpha.toFixed(3) + ")";
        ctx.fillRect(star.x * w - lean * 10 * star.depth, star.y * horizon, star.size, star.size);
      }

      /* --- 夕日 --- */
      var sx = sunX - lean * 18;
      var sy = horizon - sunR * 0.42 + night * sunR * 1.75;
      ctx.globalCompositeOperation = "lighter";
      var halo = ctx.createRadialGradient(sx, sy, sunR * 0.6, sx, sy, sunR * 3.4);
      halo.addColorStop(0, "rgba(245,150,70," + (0.34 * day + 0.04).toFixed(3) + ")");
      halo.addColorStop(0.35, "rgba(214,96,60," + (0.13 * day).toFixed(3) + ")");
      halo.addColorStop(1, "rgba(214,96,60,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, horizon + 2);
      ctx.globalCompositeOperation = "source-over";
      var disc = ctx.createLinearGradient(0, sy - sunR, 0, sy + sunR);
      disc.addColorStop(0, "rgb(255,222,160)");
      disc.addColorStop(0.5, "rgb(245,170,84)");
      disc.addColorStop(1, "rgb(214,96,60)");
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(sx, sy, sunR, 0, 6.2832);
      ctx.fill();

      /* --- 雲（線の束。夕日に重なる部分は影、それ以外はうっすら照らされる） --- */
      for (var c = 0; c < clouds.length; c++) {
        var cloud = clouds[c];
        var span = cloud.length * w;
        var travel = (((cloud.x + time * cloud.drift) % 1.7) + 1.7) % 1.7;
        var left = (travel - 0.35) * w - lean * 14;
        var cloudY = horizon - sunR * cloud.height + night * sunR * 0.25;
        var shape = new Path2D();
        for (var j = 0; j < cloud.lines; j++) {
          var off = j / (cloud.lines - 1) - 0.5;
          for (var cxp = 0; cxp <= span; cxp += 8) {
            var taper = Math.sin((Math.PI * cxp) / span);
            var cyp = cloudY + off * cloud.thick * taper + Math.sin(cxp * 0.011 + time * 0.25 + j * 1.3) * 2.5 * taper;
            if (cxp === 0) shape.moveTo(left, cyp);
            else shape.lineTo(left + cxp, cyp);
          }
        }
        ctx.lineWidth = 1;
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = "rgba(255,196,150," + (0.1 * day + 0.03).toFixed(3) + ")";
        ctx.stroke(shape);
        ctx.globalCompositeOperation = "source-over";
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, sunR, 0, 6.2832);
        ctx.clip();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = "rgba(92,40,36,0.55)";
        ctx.stroke(shape);
        ctx.restore();
      }

      /* --- 山並み（奥・手前） --- */
      for (var layer = 0; layer < 2; layer++) {
        var shift = lean * (layer === 0 ? 26 : 44);
        ctx.beginPath();
        ctx.moveTo(-60, horizon + 4);
        for (var mx = -60; mx <= w + 60; mx += 6) ctx.lineTo(mx - shift, ridge(mx, layer));
        ctx.lineTo(w + 60, horizon + 4);
        ctx.closePath();
        ctx.fillStyle = layer === 0 ? "rgb(24,20,30)" : "rgb(14,13,19)";
        ctx.fill();
        if (layer === 0) {
          /* 稜線に夕日の縁取り */
          ctx.beginPath();
          for (var rx = -60; rx <= w + 60; rx += 6) {
            if (rx === -60) ctx.moveTo(rx - shift, ridge(rx, 0));
            else ctx.lineTo(rx - shift, ridge(rx, 0));
          }
          var rim = ctx.createLinearGradient(0, 0, w, 0);
          var mid = Math.min(0.98, Math.max(0.02, sx / w));
          rim.addColorStop(0, "rgba(245,177,76,0.04)");
          rim.addColorStop(mid, "rgba(255,214,150," + (0.6 * day + 0.05).toFixed(3) + ")");
          rim.addColorStop(1, "rgba(245,177,76,0.04)");
          ctx.strokeStyle = rim;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      /* --- 海の地色（夕日の下半分と山のすそを隠す） --- */
      var sea = ctx.createLinearGradient(0, horizon, 0, h);
      sea.addColorStop(0, "rgb(" + Math.round(16 + 12 * day) + "," + Math.round(14 + 5 * day) + "," + Math.round(21 + 1 * day) + ")");
      sea.addColorStop(0.5, "rgb(12,12,17)");
      sea.addColorStop(1, "rgb(11,11,16)");
      ctx.fillStyle = sea;
      ctx.fillRect(0, horizon, w, h - horizon);

      /* --- 夕日の照り返し（水面の光の帯） --- */
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, horizon, w, h - horizon);
      ctx.clip();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(sx, horizon);
      ctx.scale(1, 2.8);
      var path = ctx.createRadialGradient(0, 0, 0, 0, 0, sunR * 1.2);
      path.addColorStop(0, "rgba(245,160,80," + (0.3 * day).toFixed(3) + ")");
      path.addColorStop(0.5, "rgba(214,96,60," + (0.1 * day).toFixed(3) + ")");
      path.addColorStop(1, "rgba(214,96,60,0)");
      ctx.fillStyle = path;
      ctx.fillRect(-sunR * 1.3, 0, sunR * 2.6, sunR * 1.3);
      ctx.restore();

      /* --- 自動の波紋 --- */
      if (!reduceMotion && time - lastBeat > 3.1) {
        ripples.push({ x: w * (0.15 + 0.7 * Math.random()), y: horizon + (h - horizon) * (0.12 + 0.45 * Math.random()), born: time });
        lastBeat = time;
      }
      ripples = ripples.filter(function (r) {
        return time - r.born < 4.2;
      });

      /* --- 海：音の波の線（手前ほど間隔が広く、うねりが大きい） --- */
      ctx.globalCompositeOperation = "lighter";
      var points = Math.ceil(w / step) + 1;
      var seaDepth = h - horizon;
      var glowHalf = sunR * 1.15;
      var stopA = Math.min(0.99, Math.max(0, (sx - glowHalf) / w));
      var stopB = Math.min(0.995, Math.max(0.005, sx / w));
      var stopC = Math.min(1, Math.max(0.01, (sx + glowHalf) / w));
      var reachX = wide ? 200 : 120;

      for (var i = 0; i < lineCount; i++) {
        var t = i / (lineCount - 1);
        var near = t * t; /* 0 = 水平線、1 = 手前 */
        var y0 = horizon + near * seaDepth * 1.04;
        var amp = 1 + near * unit * 0.026;
        var stretch = 1 / (0.3 + near * 1.1);
        var lift = Math.exp(-Math.pow((y0 - pointer.y) / (h * 0.11), 2)) * pointer.strength;

        var baseAlpha = 0.5 * Math.pow(1 - t, 1.5) + 0.1;
        var shine = (1.0 * Math.pow(1 - t, 0.6) + 0.14) * day;
        var cool = "rgba(" + Math.round(150 + 60 * (1 - t)) + "," + Math.round(150 + 10 * (1 - t)) + "," + Math.round(176 - 60 * (1 - t)) + "," + baseAlpha.toFixed(3) + ")";
        var paint = ctx.createLinearGradient(0, 0, w, 0);
        paint.addColorStop(0, cool);
        if (stopA > 0 && stopA < stopB) paint.addColorStop(stopA, cool);
        paint.addColorStop(stopB, "rgba(255,206,140," + Math.min(1, baseAlpha + shine).toFixed(3) + ")"); /* 夕日の照り返し */
        if (stopC > stopB && stopC < 1) paint.addColorStop(stopC, cool);
        paint.addColorStop(1, cool);
        ctx.strokeStyle = paint;
        ctx.lineWidth = 1 + near * 0.6;

        ctx.beginPath();
        for (var q = 0; q < points; q++) {
          var x = q * step;
          var u = x / w;
          var y =
            y0 +
            amp * (Math.sin(u * 15 * stretch + time * 0.7 + i * 0.9) * 0.6 + Math.sin(u * 34 * stretch - time * 1.1 + i * 1.7) * 0.4);

          if (lift > 0.01) y -= Math.exp(-Math.pow((x - pointer.x) / reachX, 2)) * lift * (8 + near * unit * 0.06);

          for (var k = 0; k < ripples.length; k++) {
            var age = time - ripples[k].born;
            var dx = x - ripples[k].x;
            var dy = (y0 - ripples[k].y) * 3.2; /* 奥行きを縮めて、輪が楕円に見えるようにする */
            var dist = Math.sqrt(dx * dx + dy * dy);
            var front = age * (wide ? 230 : 170);
            var band = Math.exp(-Math.pow((dist - front) / 46, 2)) * Math.exp(-age * 0.9);
            if (band > 0.01) y += Math.sin((dist - front) * 0.09) * band * (3 + near * unit * 0.035);
          }

          if (q === 0) ctx.moveTo(0, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
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
      ripples.push({ x: pointer.x, y: Math.max(pointer.y, horizon + 8), born: (performance.now() - startedAt) / 1000 });
      if (ripples.length > 5) ripples.shift();
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
    if (reduceMotion) {
      /* 「動きを減らす」設定では動かさないが、スクロールで日が沈む変化だけは描き直す */
      window.addEventListener(
        "scroll",
        function () {
          if (onScreen) draw(startedAt);
        },
        { passive: true }
      );
    }

    hero.classList.add("has-scene"); /* CSSの静止した夕空から、この描画に切り替える */
    resize();
    if (reduceMotion) draw(startedAt);
    else wake();
  }

  if (hero) initScene();

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
