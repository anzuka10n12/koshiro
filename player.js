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
  var lyricsBox = document.querySelector(".track-lyrics");
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
  }

  function start() {
    if (errorText) errorText.hidden = true;
    var result = audio.play();
    if (result && result.catch) {
      result.catch(function () {
        state();
      });
    }
  }

  /* 曲を選ぶ（リストの行に、音源の場所・長さ・波形・曲名が書いてある） */
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
    for (var i = 0; i < rows.length; i++) {
      if (i === index) rows[i].setAttribute("aria-current", "true");
      else rows[i].removeAttribute("aria-current");
    }
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
  audio.addEventListener("play", state);
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

  /* PCなど広い画面では、歌詞はジャケットの右に最初から開いておく */
  if (lyricsBox && window.matchMedia) {
    var wide = window.matchMedia("(min-width: 900px)");
    if (wide.matches) lyricsBox.open = true;
    var openIfWide = function (event) {
      if (event.matches) lyricsBox.open = true;
    };
    if (wide.addEventListener) wide.addEventListener("change", openIfWide);
  }

  /* 準備ができたら、標準の再生バーを専用の画面に置き換える */
  audio.controls = false;
  ui.hidden = false;
  box.classList.add("is-ready");
  load(0, false);
})();
