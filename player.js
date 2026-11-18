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

  function position() {
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
    document.body.classList.toggle("has-mini", show);
  }

  /* 曲を初めて選んだとき、隠していたジャケットとプレーヤーを出し、そこまで画面を動かす */
  function reveal() {
    if (!stage || !stage.classList.contains("is-idle")) return;
    stage.classList.remove("is-idle");
    /* 歌詞は閉じたまま出す（「歌詞」を押すと開く） */
    refresh();
    /* 現れる動きの途中の位置ではなく、動かない外枠（.stage）の位置まで動かす */
    if (stage.scrollIntoView) {
      var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      stage.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    }
  }

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
    reveal();
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
    });
  });

  /* 波形の上をなぞる・押すと、その位置へ飛ぶ */
  seek.addEventListener("input", function () {
    var target = (Number(seek.value) / 1000) * length();
    if (audio.readyState >= 1) {
      audio.currentTime = target;
    } else {
      /* まだ音源を読み込んでいないときは、読み込んでから飛ぶ */
      pendingSeek = target;
      audio.preload = "metadata";
      audio.load();
    }
    refresh();
  });

  audio.addEventListener("loadedmetadata", function () {
    if (pendingSeek >= 0) {
      audio.currentTime = Math.min(pendingSeek, audio.duration || pendingSeek);
      pendingSeek = -1;
    }
    refresh();
  });
  audio.addEventListener("timeupdate", refresh);
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
    /* 次の曲があれば続けて再生、無ければ先頭に戻して止まる */
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
    /* 曲名を押すと、流れているほうの大きな画面（曲のプレーヤーか歌詞動画）へ戻る */
    miniOpen.addEventListener("click", function () {
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

  /* 「停止して閉じる」：再生をやめて、曲を選ぶ前の一覧だけの状態に戻す */
  var closeButton = document.querySelector(".stage-close");
  if (closeButton && stage) {
    closeButton.hidden = false;
    closeButton.addEventListener("click", function () {
      audio.pause();
      if (audio.readyState >= 1) audio.currentTime = 0;
      pendingSeek = -1;
      picked = false;
      mark();
      var lyricsBox = document.querySelector(".track-lyrics");
      if (lyricsBox) lyricsBox.open = false;
      stage.classList.add("is-idle");
      state();
      refresh();
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

  /* 準備ができたら、標準の再生バーを専用の画面に置き換える */
  audio.controls = false;
  ui.hidden = false;
  box.classList.add("is-ready");
  if (stage) stage.classList.add("is-idle");
  load(0, false);
})();
