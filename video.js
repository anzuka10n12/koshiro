/*
  今風版（modern.html）の「Video（歌詞動画）」欄。一覧を押すと、上の画面でその動画が流れる。

  - このスクリプトが動かない環境では、一覧の各項目は動画ファイルへのふつうのリンクとして働く
  - セキュリティ方針は main.js と同じ：通信しない・保存しない・innerHTML / eval を使わない
    （動画は自サイトの videos/ フォルダのファイルだけを再生する）
  - 曲リストの音楽と動画が同時に鳴らないよう、片方が始まったらもう片方を止める
*/
(function () {
  "use strict";

  var video = document.querySelector(".vplayer-video");
  var title = document.querySelector(".vplayer-title");
  var cards = document.querySelectorAll(".vcard");
  if (!video || !title || !cards.length) return;

  function pick(card, play, quiet) {
    var src = card.getAttribute("data-src");
    if (!src) return;
    if (video.getAttribute("src") !== src) {
      video.setAttribute("poster", card.getAttribute("data-poster") || "");
      video.setAttribute("src", src);
    }
    var name = card.querySelector(".vcard-title");
    title.textContent = name ? name.textContent : "";
    for (var i = 0; i < cards.length; i++) {
      if (cards[i] === card) cards[i].setAttribute("aria-current", "true");
      else cards[i].removeAttribute("aria-current");
    }
    if (play) {
      var result = video.play();
      if (result && result.catch) result.catch(function () {});
      /* 画面が一覧のほうにあるときは、動画の位置まで戻す */
      var box = video.getBoundingClientRect();
      if (!quiet && (box.top < 0 || box.bottom > window.innerHeight)) {
        var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        video.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" });
      }
    }
  }

  Array.prototype.forEach.call(cards, function (card) {
    card.addEventListener("click", function (event) {
      event.preventDefault();
      pick(card, true);
    });
    /* 画面下のバーの「前・次」から呼ばれたとき：画面は動かさずに替えて流す */
    card.addEventListener("vcard-quiet", function () {
      pick(card, true, true);
    });
  });

  /* 動画が始まったら、曲リストの音楽を止める */
  video.addEventListener("play", function () {
    Array.prototype.forEach.call(document.querySelectorAll("audio"), function (a) {
      if (!a.paused) a.pause();
    });
  });

  /* 最後まで流れたら、次の動画を続けて流す（画面は動かさない。最後の動画で止まる） */
  video.addEventListener("ended", function () {
    for (var i = 0; i < cards.length - 1; i++) {
      if (cards[i].getAttribute("aria-current") === "true") {
        pick(cards[i + 1], true, true);
        return;
      }
    }
  });
})();
