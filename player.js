/*
  今風版（modern.html）の曲リスト用プレーヤー。

  - このスクリプトが動かない環境では、ブラウザ標準の再生バー（<audio controls>）がそのまま使える
  - 波形は、音源から前もって計算した音量の並び（HTMLの data-peaks）を描いているだけで、再生中に音を解析はしない
  - セキュリティ方針は main.js と同じ：通信しない・保存しない・マイクを使わない・innerHTML / eval を使わない
    （音源は自サイトの audio/ フォルダのファイルだけを再生する）
*/
(function () {
  "use strict";

  var box = document.querySelector(".player");
  if (!box) return;
  var audio = box.querySelector("audio");
  var ui = box.querySelector(".player-ui");
  var playButton = box.querySelector(".player-play");
  var playLabel = box.querySelector(".player-play-label");
  var seek = box.querySelector(".player-seek");
  var canvas = box.querySelector(".player-wave");
  var nowText = box.querySelector(".player-now");
  var totalText = box.querySelector(".player-total");
  var titleText = box.querySelector(".player-title");
  var errorText = box.querySelector(".player-error");
  var rows = document.querySelectorAll(".tracklist-row");
  var lyrics = document.querySelectorAll(".lyrics-full");
  var jacket = document.querySelector(".jacket img");
  var lyricsName = document.querySelector(".track-lyrics-name");
  var stage = document.querySelector(".stage");
  var mini = document.querySelector(".mini-player");
  var miniArt = mini && mini.querySelector(".mini-art");
  var miniTitle = mini && mini.querySelector(".mini-title");
  var miniOpen = mini && mini.querySelector(".mini-open");
  var miniPlay = mini && mini.querySelector(".mini-play");
  var miniLabel = mini && mini.querySelector(".mini-play-label");
  var miniPrev = mini && mini.querySelector(".mini-prev");
  var miniNext = mini && mini.querySelector(".mini-next");
  var playerInView = true; /* 大きなプレーヤーが画面に見えているか */
  /* 画面下のバーは「いま流れているもの」（曲か歌詞動画か）を操作する */
  var vid = document.querySelector(".vplayer-video");
  var active = "audio";      /* 最後に再生が始まったほう："audio"（曲）か "video"（歌詞動画） */
  var videoInView = true;   /* 歌詞動画の画面が見えているか */
  var videoPlayed = false;  /* 歌詞動画を一度でも再生したか */
  if (!audio || !ui || !playButton || !playLabel || !seek || !canvas || !nowText || !totalText || !titleText || !rows.length) return;
  var g = canvas.getContext && canvas.getContext("2d");
  if (!g || !audio.play) return;

  var PLAYED = "#fc8b2f"; /* 夕日の色（style.css の --sun） */
  var REST = "rgba(244, 236, 221, 0.3)";
  var current = 0;
  var peaks = [];
  var seconds = 0; /* 曲の長さ（読み込み前は HTML の data-seconds を使う） */
  var pendingSeek = -1;

  function clock(value) {
    var s = Math.max(0, Math.floor(value));
    return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }

  function length() {
    return isFinite(audio.duration) && audio.duration > 0 ? audio.duration : seconds;
  }

  var scrubAt = -1; /* 指で波形をなぞっている間の、仮の再生位置（離したときにそこへ飛ぶ） */

  function position() {
    if (scrubAt >= 0) return scrubAt;
    return pendingSeek >= 0 ? pendingSeek : audio.currentTime || 0;
  }

  /* 波形：再生済みの部分だけ夕日の色にする */
  function draw() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    var step = 4; /* 棒1本＋すき間の幅 */
    var count = Math.max(1, Math.floor(w / step));
    var done = length() > 0 ? position() / length() : 0;
    for (var i = 0; i < count; i++) {
      /* 画面幅に合わせて、音量の並びを棒の本数にまとめ直す */
      var from = Math.floor((i / count) * peaks.length);
      var to = Math.max(from + 1, Math.floor(((i + 1) / count) * peaks.length));
      var peak = 0;
      for (var k = from; k < to && k < peaks.length; k++) peak = Math.max(peak, peaks[k]);
      var bar = Math.max(2, (peak / 100) * h);
      g.fillStyle = (i + 0.5) / count <= done ? PLAYED : REST;
      g.fillRect(i * step, (h - bar) / 2, step - 1.5, bar);
    }
  }

  function refresh() {
    var total = length();
    var at = position();
    nowText.textContent = clock(at);
    totalText.textContent = clock(total);
    seek.value = total > 0 ? String(Math.round((at / total) * 1000)) : "0";
    seek.setAttribute("aria-valuetext", clock(at) + " / " + clock(total));
    if (mini && active === "audio") mini.style.setProperty("--mini", total > 0 ? (at / total).toFixed(4) : "0");
    draw();
  }

  function state() {
    var playing = !audio.paused && !audio.ended;
    playButton.setAttribute("aria-pressed", playing ? "true" : "false");
    playLabel.textContent = playing ? "一時停止" : "再生";
    box.classList.toggle("is-playing", playing);
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle("is-playing", playing && i === current);
    }
    syncMini();
  }

  /* 画面下のバーの中身（絵・曲名・再生ボタン）を、いま流れているほうに合わせる */
  function syncMini() {
    if (!mini) return;
    var playing;
    if (active === "video" && vid) {
      playing = !vid.paused && !vid.ended;
      var card = document.querySelector('.vcard[aria-current="true"]');
      var vtitle = document.querySelector(".vplayer-title");
      if (miniTitle && vtitle) miniTitle.textContent = vtitle.textContent;
      if (miniArt && card) miniArt.setAttribute("src", card.getAttribute("data-poster") || "");
      var d = vid.duration;
      mini.style.setProperty("--mini", isFinite(d) && d > 0 ? (vid.currentTime / d).toFixed(4) : "0");
    } else {
      playing = !audio.paused && !audio.ended;
      var row = rows[current];
      if (miniTitle) miniTitle.textContent = titleText.textContent;
      if (miniArt && row && row.getAttribute("data-art")) miniArt.setAttribute("src", row.getAttribute("data-art"));
      var total = length();
      mini.style.setProperty("--mini", total > 0 ? (position() / total).toFixed(4) : "0");
    }
    mini.classList.toggle("is-video", active === "video");
    if (miniPlay) {
      miniPlay.setAttribute("aria-pressed", playing ? "true" : "false");
      miniLabel.textContent = playing ? "一時停止" : "再生";
    }
    miniShow();
  }

  /* ミニプレーヤーは「曲を選んだあと」かつ「大きなプレーヤーが画面に見えていない」ときだけ出す */
  function miniShow() {
    if (!mini) return;
    var show = active === "video" ? videoPlayed && !videoInView : picked && !playerInView;
    if (show && mini.hidden) {
      mini.hidden = false;
      mini.classList.add("is-away");
      void mini.offsetWidth; /* 沈んだ位置を一度描かせてから、上がってくる動きにする */
    }
    mini.classList.toggle("is-away", !show);
    mini.setAttribute("aria-hidden", show ? "false" : "true");
    if (miniOpen) miniOpen.tabIndex = show ? 0 : -1;
    if (miniPlay) miniPlay.tabIndex = show ? 0 : -1;
    if (miniPrev) miniPrev.tabIndex = show ? 0 : -1;
    if (miniNext) miniNext.tabIndex = show ? 0 : -1;
    document.body.classList.toggle("has-mini", show);
  }

  /* 再生中の画面を、音楽アプリのように画面いっぱいに下から出す。閉じても再生は続き、画面下のバーで操作できる */
  var sheetClose = document.querySelector(".sheet-close");
  var sheetBack = null; /* 開く前にフォーカスがあった所（閉じたら戻す） */
  var stageHome = null; /* 再生中の画面の、もとの置き場所の目印 */
  function reveal() {
    if (!stage) return;
    if (stage.classList.contains("is-sheet")) return;
    sheetBack = document.activeElement;
    /* 親の要素の動き（変形）に引っぱられず画面いっぱいに出すため、開いているあいだは body の直下へ移す */
    if (!stageHome) {
      stageHome = document.createComment("stage");
      stage.parentNode.insertBefore(stageHome, stage);
    }
    document.body.appendChild(stage);
    stage.classList.remove("is-idle");
    stage.classList.add("is-sheet");
    document.documentElement.classList.add("sheet-open");
    if (sheetClose) sheetClose.hidden = false;
    stage.scrollTop = 0;
    /* 波形は画面に出てから幅が決まるので、出したあとで描き直す */
    refresh();
    window.requestAnimationFrame(draw);
    if (sheetClose && sheetClose.focus) sheetClose.focus({ preventScroll: true });
  }

  function hideSheet() {
    if (!stage || !stage.classList.contains("is-sheet")) return;
    stage.classList.remove("is-sheet");
    stage.classList.add("is-idle");
    stage.style.translate = "";
    if (stageHome && stageHome.parentNode) stageHome.parentNode.insertBefore(stage, stageHome);
    document.documentElement.classList.remove("sheet-open");
    if (sheetClose) sheetClose.hidden = true;
    if (sheetBack && sheetBack.focus && document.contains(sheetBack)) sheetBack.focus({ preventScroll: true });
    miniShow();
  }

  if (sheetClose) sheetClose.addEventListener("click", hideSheet);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hideSheet();
  });
  /* 画面の一番上で下へなぞると閉じる（指で触る端末だけ） */
  if (stage) {
    var sy = -1;
    stage.addEventListener("touchstart", function (e) {
      sy = stage.classList.contains("is-sheet") && stage.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : -1;
    }, { passive: true });
    /* 下へなぞっている間は、ブラウザの「引っぱって更新」が動かないように止める */
    stage.addEventListener("touchmove", function (e) {
      if (sy < 0) return;
      var dy = e.touches[0].clientY - sy;
      if (dy > 0) {
        if (e.cancelable) e.preventDefault();
        stage.style.translate = "0 " + dy + "px";
      } else {
        stage.style.translate = "";
        sy = -1; /* 上へなぞったときは、ふつうに中をスクロールする */
      }
    }, { passive: false });
    stage.addEventListener("touchend", function (e) {
      if (sy < 0) return;
      var dy = (e.changedTouches[0] ? e.changedTouches[0].clientY : sy) - sy;
      sy = -1;
      if (dy > 110) hideSheet();
      else stage.style.translate = "";
    });
  }
  /* 「この曲の歌詞動画を見る」は、画面を閉じてから動画へ */
  var toVideoLink = document.querySelector(".player-video-link");
  if (toVideoLink) toVideoLink.addEventListener("click", hideSheet);

  /* 一覧で「いまプレーヤーにある曲」の行を光らせる（ページを開いた直後は光らせない） */
  function mark() {
    for (var i = 0; i < rows.length; i++) {
      if (picked && i === current) rows[i].setAttribute("aria-current", "true");
      else rows[i].removeAttribute("aria-current");
    }
  }

  function start() {
    if (!picked) {
      picked = true;
      mark();
    }
    if (errorText) errorText.hidden = true;
    var result = audio.play();
    if (result && result.catch) {
      result.catch(function () {
        state();
      });
    }
  }

  /* 曲を選ぶ（リストの行に、音源の場所・長さ・波形・曲名が書いてある） */
  var picked = false; /* 一度でも曲を選んだ・再生したか */

  function load(index, autoplay) {
    var row = rows[index];
    var src = row.getAttribute("data-src");
    if (!src) return;
    var changed = index !== current || !audio.getAttribute("src");
    current = index;
    seconds = Number(row.getAttribute("data-seconds")) || 0;
    peaks = (row.getAttribute("data-peaks") || "").split(",").map(Number);
    var name = row.querySelector(".tracklist-title");
    titleText.textContent = name ? name.textContent : "";
    /* ジャケットと歌詞の見出しも、選んだ曲のものに替える */
    var art = row.getAttribute("data-art");
    if (jacket && art) {
      jacket.setAttribute("src", art);
      jacket.setAttribute("alt", row.getAttribute("data-art-alt") || "");
    }
    if (lyricsName) lyricsName.textContent = "（" + titleText.textContent + "）";
    if (active === "audio") syncMini();
    mark();
    for (var k = 0; k < lyrics.length; k++) {
      lyrics[k].hidden = lyrics[k].getAttribute("data-track") !== String(index);
      lyrics[k].scrollTop = 0;
    }
    if (changed) {
      pendingSeek = -1;
      audio.setAttribute("src", src);
    }
    /* スマホのロック画面などに曲名とジャケットを出す */
    if ("mediaSession" in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: titleText.textContent,
        artist: "航士朗",
        artwork: art ? [{ src: art, sizes: "800x800", type: "image/jpeg" }] : []
      });
    }
    refresh();
    state();
    if (autoplay) start();
  }

  playButton.addEventListener("click", function () {
    if (audio.paused) start();
    else audio.pause();
  });

  Array.prototype.forEach.call(rows, function (row, index) {
    row.addEventListener("click", function () {
      if (index === current) {
        if (audio.paused) start();
        else audio.pause();
      } else {
        picked = true;
        load(index, true);
      }
      reveal();
    });
  });

  /* 波形の上をなぞる・押すと、その位置へ飛ぶ */
  function seekTo(target) {
    if (audio.readyState >= 1) {
      audio.currentTime = target;
    } else {
      /* まだ音源を読み込んでいないときは、読み込んでから飛ぶ */
      pendingSeek = target;
      audio.preload = "metadata";
      audio.load();
    }
    refresh();
  }

  seek.addEventListener("input", function () {
    seekTo((Number(seek.value) / 1000) * length());
  });

  /* スマホ：波形に指が触れただけでは飛ばない。横へなぞったときだけ位置を動かし、指を離したところへ飛ぶ。
     縦になぞったときは、ふつうに画面がスクロールする */
  var wrap = canvas.parentNode;
  var touchId = null, tx = 0, ty = 0, dragging = false;
  function scrubFrom(e) {
    var r = wrap.getBoundingClientRect();
    var f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    scrubAt = f * length();
    refresh();
  }
  wrap.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "touch") return;
    touchId = e.pointerId; tx = e.clientX; ty = e.clientY; dragging = false;
  });
  wrap.addEventListener("pointermove", function (e) {
    if (e.pointerId !== touchId) return;
    var dx = Math.abs(e.clientX - tx), dy = Math.abs(e.clientY - ty);
    if (!dragging) {
      if (dx > 12 && dx > dy * 1.5) {
        dragging = true;
        if (wrap.setPointerCapture) wrap.setPointerCapture(touchId);
      } else if (dy > 12) {
        touchId = null;
        return;
      } else {
        return;
      }
    }
    scrubFrom(e);
  });
  function scrubEnd(e, apply) {
    if (e.pointerId !== touchId) return;
    touchId = null;
    if (dragging && apply && scrubAt >= 0) {
      var target = scrubAt;
      scrubAt = -1;
      seekTo(target);
    } else {
      scrubAt = -1;
      refresh();
    }
    dragging = false;
  }
  wrap.addEventListener("pointerup", function (e) { scrubEnd(e, true); });
  wrap.addEventListener("pointercancel", function (e) { scrubEnd(e, false); });

  audio.addEventListener("loadedmetadata", function () {
    if (pendingSeek >= 0) {
      audio.currentTime = Math.min(pendingSeek, audio.duration || pendingSeek);
      pendingSeek = -1;
    }
    refresh();
  });
  audio.addEventListener("timeupdate", refresh);
  /* 曲が完全に止まる（ended）前に、次の曲へつなぐ。
     Android の Brave などは、いったん止まってから次を鳴らそうとすると、画面を消している間などに再生を止めてしまう。
     止まる手前で切り替えれば「鳴り続けている」扱いのまま次の曲へ進める */
  var handing = false;
  audio.addEventListener("timeupdate", function () {
    if (handing || audio.paused || current + 1 >= rows.length) return;
    var d = audio.duration;
    if (isFinite(d) && d > 1 && d - audio.currentTime < 0.4) {
      handing = true;
      load(current + 1, true);
    }
  });
  audio.addEventListener("playing", function () {
    handing = false;
  });
  audio.addEventListener("play", function () {
    active = "audio";
  });
  audio.addEventListener("play", state);
  /* 音楽が始まったら、歌詞動画を止める（同時に鳴らないように） */
  audio.addEventListener("play", function () {
    Array.prototype.forEach.call(document.querySelectorAll("video"), function (v) {
      if (!v.paused) v.pause();
    });
  });
  audio.addEventListener("pause", state);
  audio.addEventListener("ended", function () {
    /* 手前で切り替えられなかったときの予備：次の曲があれば続けて再生、無ければ先頭に戻して止まる */
    if (handing) return;
    if (current + 1 < rows.length) {
      load(current + 1, true);
    } else {
      audio.currentTime = 0;
      state();
      refresh();
    }
  });
  audio.addEventListener("error", function () {
    if (errorText) errorText.hidden = false;
    state();
  });

  window.addEventListener("resize", draw);

  /* トップの「曲を聴く」：曲リストへ移動して、いまプレーヤーにある曲（最初は1曲目）を流す */
  var listen = document.querySelector(".hero-listen");
  if (listen) {
    listen.addEventListener("click", function (event) {
      event.preventDefault();
      start();
      reveal();
    });
  }

  /* ミニプレーヤーの操作 */
  if (mini && miniPlay && miniOpen) {
    miniPlay.addEventListener("click", function () {
      if (active === "video" && vid) {
        if (vid.paused) {
          var r = vid.play();
          if (r && r.catch) r.catch(function () {});
        } else {
          vid.pause();
        }
        return;
      }
      if (audio.paused) start();
      else audio.pause();
    });
    if (miniPrev) miniPrev.addEventListener("click", function () { step(-1); });
    /* 前・次のボタンは、長押しすると早送り・巻き戻し（押している間、10倍の速さで進む・戻る） */
    function holdToSkip(btn, dir) {
      if (!btn) return;
      var timer = null, tick = null, held = false;
      function stop() {
        clearTimeout(timer);
        clearInterval(tick);
        timer = tick = null;
      }
      btn.addEventListener("pointerdown", function (e) {
        if (e.button > 0) return;
        held = false;
        stop();
        timer = setTimeout(function () {
          held = true;
          tick = setInterval(function () {
            if (active === "video" && vid) {
              if (vid.readyState >= 1) vid.currentTime = Math.max(0, Math.min((vid.duration || 0) - 0.5, vid.currentTime + dir));
              return;
            }
            if (audio.readyState < 1) return;
            audio.currentTime = Math.max(0, Math.min(length() - 0.5, audio.currentTime + dir));
            refresh();
          }, 100);
        }, 450);
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (name) {
        btn.addEventListener(name, stop);
      });
      /* 長押しのあとに来る「押した」は、曲送りにしない */
      btn.addEventListener("click", function (e) {
        if (held) {
          held = false;
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      }, true);
      /* スマホの長押しメニューを出さない */
      btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    }
    holdToSkip(miniPrev, -1);
    holdToSkip(miniNext, 1);
    holdToSkip(document.querySelector(".player-prev"), -1);
    holdToSkip(document.querySelector(".player-next"), 1);

    /* 再生中の画面の 前・次 */
    var bigPrev = document.querySelector(".player-prev");
    var bigNext = document.querySelector(".player-next");
    if (bigPrev) bigPrev.addEventListener("click", function () { step(-1); });
    if (bigNext) bigNext.addEventListener("click", function () { step(1); });
    if (miniNext) miniNext.addEventListener("click", function () { step(1); });
    /* 曲名を押すと、流れているほうの大きな画面（曲のプレーヤーか歌詞動画）へ戻る */
    miniOpen.addEventListener("click", function () {
      /* 曲のときは、しまってある「いま流れている曲」の画面を出してから、そこへ動く */
      if (active !== "video" && stage) {
        reveal();
        return;
      }
      var target = active === "video" && vid ? vid : stage;
      if (!target || !target.scrollIntoView) return;
      var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: active === "video" ? "center" : "start" });
    });
    /* 大きなプレーヤー（再生ボタンと波形の部分）が画面から外れたかどうかを見張る */
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        playerInView = entries[0].isIntersecting;
        miniShow();
      }).observe(ui);
      if (vid) {
        new IntersectionObserver(function (entries) {
          videoInView = entries[0].isIntersecting;
          miniShow();
        }).observe(vid);
      }
    }
  }

  /* 歌詞動画の再生・停止・進み具合を、画面下のバーに反映する */
  if (vid) {
    vid.addEventListener("play", function () {
      active = "video";
      videoPlayed = true;
      syncMini();
    });
    vid.addEventListener("pause", syncMini);
    vid.addEventListener("ended", syncMini);
    vid.addEventListener("timeupdate", function () {
      if (active === "video") syncMini();
    });
    /* 動画を切り替えたとき（曲名と絵が替わる） */
    vid.addEventListener("loadstart", function () {
      if (active === "video") syncMini();
    });
  }

  /* 曲のプレーヤーの「この曲の歌詞動画を見る」：同じ順番の歌詞動画を流す */
  var toVideo = document.querySelector(".player-video-link");
  var vcards = document.querySelectorAll(".vcard");
  if (toVideo && vcards.length) {
    toVideo.hidden = false;
    toVideo.addEventListener("click", function (event) {
      var card = vcards[current];
      if (!card) return;
      event.preventDefault();
      card.click();
    });
  }

  /* 前の曲・次の曲（画面下のバーのボタンと、スマホのロック画面のボタン）
     ・曲：鳴っていれば次の曲も続けて鳴らし、止まっていれば止まったまま替える。
       「前」は、曲の頭から3秒より後ならその曲の頭へ戻る。最後の曲の「次」は1曲目へ
     ・歌詞動画：となりの動画へ替えて流す（画面は動かさない） */
  function step(dir) {
    if (active === "video" && vid && vcards.length) {
      var at = -1;
      for (var i = 0; i < vcards.length; i++) {
        if (vcards[i].getAttribute("aria-current") === "true") at = i;
      }
      if (dir < 0 && at >= 0 && vid.currentTime > 3) {
        vid.currentTime = 0;
        return;
      }
      var to = (Math.max(0, at) + dir + vcards.length) % vcards.length;
      var ev;
      try {
        ev = new CustomEvent("vcard-quiet");
      } catch (err) {
        ev = document.createEvent("Event");
        ev.initEvent("vcard-quiet", false, false);
      }
      vcards[to].dispatchEvent(ev);
      return;
    }
    var playing = !audio.paused && !audio.ended;
    if (dir < 0 && (position() > 3 || current === 0)) {
      if (audio.readyState >= 1) audio.currentTime = 0;
      refresh();
      return;
    }
    load((current + dir + rows.length) % rows.length, playing);
  }

  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("previoustrack", function () { step(-1); });
      navigator.mediaSession.setActionHandler("nexttrack", function () { step(1); });
    } catch (err) { /* 対応していない端末では何もしない */ }
  }

  /* アルバム：頭を押すと曲の一覧を開け閉めする（最初は閉じておく）。「アルバムを再生」は1曲目から流す */
  var albumHead = document.querySelector(".album-head");
  var albumPlay = document.querySelector(".album-play");
  var albumList = document.getElementById("album-tracks");
  function albumOpen(open) {
    if (!albumHead || !albumList) return;
    albumHead.setAttribute("aria-expanded", open ? "true" : "false");
    albumList.hidden = !open;
    if (albumPlay) albumPlay.hidden = !open;
  }
  if (albumHead && albumList) {
    albumOpen(false);
    albumHead.addEventListener("click", function () {
      albumOpen(albumHead.getAttribute("aria-expanded") !== "true");
    });
    if (albumPlay) {
      albumPlay.addEventListener("click", function () {
        picked = true;
        load(0, true);
        reveal();
      });
    }
  }

  /* 「停止して閉じる」：再生をやめて、曲を選ぶ前の一覧だけの状態に戻す */
  /* 曲の再生をやめ、ジャケットとプレーヤーをしまう（keepView なら、いま見ている位置が動かないようにする） */
  function closeStage(keepView) {
    audio.pause();
    if (audio.readyState >= 1) audio.currentTime = 0;
    pendingSeek = -1;
    picked = false;
    mark();
    var lyricsBox = document.querySelector(".track-lyrics");
    if (lyricsBox) lyricsBox.open = false;
    if (stage && stage.classList.contains("is-sheet")) hideSheet();
    if (stage && !stage.classList.contains("is-idle")) {
      var before = stage.getBoundingClientRect();
      stage.classList.add("is-idle");
      /* しまった欄が画面より上にあったときは、縮んだぶんだけ戻して、見ている所がずれないようにする */
      if (keepView && before.bottom < 0) {
        var after = stage.getBoundingClientRect();
        window.scrollBy(0, after.height - before.height);
      }
    }
    state();
    refresh();
  }

  /* 歌詞動画を止めて頭に戻し、表紙の絵を出した状態にする */
  function resetVideo() {
    if (!vid) return;
    vid.pause();
    if (vid.getAttribute("src")) vid.load();
    videoPlayed = false;
  }

  var closeButton = document.querySelector(".stage-close");
  if (closeButton && stage) {
    closeButton.hidden = false;
    closeButton.addEventListener("click", function () {
      closeStage(false);
      /* しまったあとは、曲の一覧の頭へ */
      var music = document.getElementById("music") || stage;
      if (music.scrollIntoView) {
        var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        music.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
      }
      /* キーボードで操作している人のために、いまの曲の行へ戻る */
      if (rows[current] && rows[current].focus) rows[current].focus({ preventScroll: true });
    });
  }

  /* スマホ：画面下のバーを横か下へはらうと、再生をやめてすべて閉じる
     （曲の再生欄をしまい、歌詞動画も止めて頭に戻す）。少し動かしただけなら元に戻る */
  if (mini) {
    var drag = null;
    var swallowClick = false;
    mini.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "touch" || mini.classList.contains("is-away")) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, t: Date.now(), moved: false };
    });
    mini.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag.dx = e.clientX - drag.x;
      drag.dy = Math.max(0, e.clientY - drag.y); /* 上へは動かさない */
      if (!drag.moved && Math.abs(drag.dx) + drag.dy > 10) {
        drag.moved = true;
        try { mini.setPointerCapture(drag.id); } catch (err) { /* 取れなくても動く */ }
        mini.classList.add("is-dragging");
      }
      if (drag.moved) {
        var far = Math.min(1, Math.max(Math.abs(drag.dx) / mini.offsetWidth, drag.dy / 120));
        mini.style.translate = "calc(-50% + " + drag.dx + "px) " + drag.dy + "px";
        mini.style.opacity = String(1 - far * 0.7);
      }
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag;
      drag = null;
      mini.classList.remove("is-dragging");
      if (!d.moved) return;
      swallowClick = true; /* はらった指を離したときに、ボタンが押されたことにしない */
      window.setTimeout(function () { swallowClick = false; }, 400);
      var fast = (Math.abs(d.dx) + d.dy) / Math.max(1, Date.now() - d.t) > 0.6;
      var away = Math.abs(d.dx) > mini.offsetWidth * 0.3 || d.dy > 50 || (fast && Math.abs(d.dx) + d.dy > 30);
      if (!away) {
        mini.style.translate = "";
        mini.style.opacity = "";
        return;
      }
      /* はらった向きへ飛ばしてから閉じる */
      if (d.dy > Math.abs(d.dx)) mini.style.translate = "-50% calc(100% + 2rem)";
      else mini.style.translate = "calc(-50% + " + (d.dx > 0 ? "" : "-") + "110vw) " + d.dy + "px";
      mini.style.opacity = "0";
      window.setTimeout(function () {
        closeStage(true);
        resetVideo();
        active = "audio";
        miniShow();
        mini.style.translate = "";
        mini.style.opacity = "";
      }, 260);
    }
    mini.addEventListener("pointerup", endDrag);
    mini.addEventListener("pointercancel", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      mini.classList.remove("is-dragging");
      mini.style.translate = "";
      mini.style.opacity = "";
    });
    mini.addEventListener("click", function (e) {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  /* 準備ができたら、標準の再生バーを専用の画面に置き換える */
  audio.controls = false;
  ui.hidden = false;
  box.classList.add("is-ready");
  if (stage) stage.classList.add("is-idle");
  load(0, false);
})();
