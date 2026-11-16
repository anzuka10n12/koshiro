/*
  イメージ曲「夕陽の帰り道」を、プログラムだけで演奏するスクリプト（今風版 modern.html 専用）。

  - 音声ファイルは一切使わない。ピアノ・ベース・ドラム・歌声を、すべてこのファイルの計算で作って鳴らす
  - 歌声は「のこぎり波＋母音ごとの共鳴（フォルマント）」で作った合成音。歌詞の1音ずつ母音を切り替え、
    子音は短い息の音などで近似している（人の歌声ほど明瞭にはならない）
  - セキュリティ方針は main.js と同じ：通信しない・保存しない・マイクを使わない・innerHTML / eval を使わない
  - 再生ボタンを押すまで絶対に鳴らない

  曲の作り：ニ長調（トップの「弾ける海」と同じ調）・テンポ84・4拍子・全24小節（約1分9秒）
    前奏4小節 → Aメロ8小節 → サビ8小節 → 後奏4小節
*/
(function () {
  "use strict";

  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var player = document.querySelector(".song");
  var controls = document.querySelector(".song-controls");
  var playButton = document.querySelector(".song-play");
  var playLabel = document.querySelector(".song-play-label");
  var resetButton = document.querySelector(".song-reset");
  var timeText = document.querySelector(".song-time");
  var lines = document.querySelectorAll(".lyrics li");
  if (!AudioCtx || !player || !controls || !playButton || !playLabel || !resetButton || !timeText) return;

  /* ---- 曲の設計図 ---- */

  var BPM = 84;
  var E = 60 / BPM / 2; /* 8分音符1つの秒数 */
  var BAR = E * 8;
  var BARS = 24;
  var LENGTH = BARS * BAR;
  var TAIL = 3.5; /* 最後の余韻 */
  var MIX = { band: 1, voice: 1 }; /* 伴奏と歌の音量バランス */

  /* 和音：bass=ベースの音、keys=ピアノが弾く4音（数字はMIDIの音番号。60が中央のド） */
  var CHORDS = {
    D: { bass: 38, keys: [50, 57, 62, 66] },
    "A/C#": { bass: 37, keys: [52, 57, 61, 64] },
    Bm7: { bass: 35, keys: [47, 54, 57, 62] },
    "F#m7": { bass: 42, keys: [54, 57, 61, 64] },
    G: { bass: 43, keys: [55, 59, 62, 66] },
    "D/F#": { bass: 42, keys: [54, 57, 62, 66] },
    Em7: { bass: 40, keys: [52, 55, 59, 62] },
    A: { bass: 45, keys: [52, 57, 61, 64] }
  };

  var PROGRESSION = [
    "G", "A", "F#m7", "Bm7", /* 前奏 */
    "D", "A/C#", "Bm7", "F#m7", "G", "D/F#", "Em7", "A", /* Aメロ */
    "G", "A", "F#m7", "Bm7", "G", "A", "D", "D", /* サビ */
    "G", "A", "D", "D" /* 後奏 */
  ];

  /* 歌のメロディー。小節ごとに [何番目の8分音符から, 長さ(8分音符の数), 音の高さ, 発音(ローマ字)] */
  var MELODY = {
    /* Aメロ：日々の景色が 音になる */
    4: [[0, 1, 66, "hi"], [1, 1, 66, "bi"], [2, 1, 64, "no"], [3, 1, 66, "ke"], [4, 1, 69, "shi"], [5, 1, 66, "ki"], [6, 2, 64, "ga"]],
    5: [[0, 1, 64, "o"], [1, 1, 64, "to"], [2, 1, 61, "ni"], [3, 1, 62, "na"], [4, 3, 64, "ru"]],
    /* 夕陽に染まる 帰り道 */
    6: [[0, 1, 62, "yu"], [1, 1, 62, "u"], [2, 1, 66, "hi"], [3, 1, 66, "ni"], [4, 1, 69, "so"], [5, 1, 66, "ma"], [6, 2, 62, "ru"]],
    7: [[0, 1, 61, "ka"], [1, 1, 61, "e"], [2, 1, 64, "ri"], [3, 1, 66, "mi"], [4, 3, 61, "chi"]],
    /* 波のリズムに 歩いてく */
    8: [[0, 1, 59, "na"], [1, 1, 62, "mi"], [2, 1, 62, "no"], [3, 1, 67, "ri"], [4, 1, 67, "zu"], [5, 1, 66, "mu"], [6, 2, 62, "ni"]],
    9: [[0, 1, 62, "a"], [1, 1, 66, "ru"], [2, 1, 69, "i"], [3, 1, 66, "te"], [4, 3, 66, "ku"]],
    /* 言葉は海へ 溶けていく */
    10: [[0, 1, 64, "ko"], [1, 1, 67, "to"], [2, 1, 67, "ba"], [3, 1, 71, "wa"], [4, 1, 69, "u"], [5, 1, 67, "mi"], [6, 2, 64, "e"]],
    11: [[0, 1, 64, "to"], [1, 1, 66, "ke"], [2, 1, 67, "te"], [3, 1, 69, "i"], [4, 3, 69, "ku"]],
    /* サビ：歌うよ 今日の空を */
    12: [[0, 2, 71, "u"], [2, 2, 69, "ta"], [4, 1, 67, "u"], [5, 3, 69, "yo"]],
    13: [[0, 1, 69, "kyo"], [1, 1, 69, "u"], [2, 1, 66, "no"], [3, 1, 64, "so"], [4, 1, 66, "ra"], [5, 3, 69, "o"]],
    /* 届け 君の街まで */
    14: [[0, 2, 69, "to"], [2, 2, 66, "do"], [4, 3, 64, "ke"]],
    15: [[0, 1, 66, "ki"], [1, 1, 66, "mi"], [2, 1, 64, "no"], [3, 1, 66, "ma"], [4, 1, 69, "chi"], [5, 1, 66, "ma"], [6, 2, 62, "de"]],
    /* 沈む光も 明日の色 */
    16: [[0, 1, 71, "shi"], [1, 1, 71, "zu"], [2, 1, 69, "mu"], [3, 1, 67, "hi"], [4, 1, 69, "ka"], [5, 1, 71, "ri"], [6, 2, 69, "mo"]],
    17: [[0, 1, 69, "a"], [1, 1, 69, "shi"], [2, 1, 71, "ta"], [3, 1, 69, "no"], [4, 1, 66, "i"], [5, 3, 64, "ro"]],
    /* ここから 始まる歌 */
    18: [[0, 1, 62, "ko"], [1, 1, 64, "ko"], [2, 2, 66, "ka"], [4, 3, 69, "ra"]],
    19: [[0, 1, 69, "ha"], [1, 1, 66, "ji"], [2, 1, 64, "ma"], [3, 1, 62, "ru"], [4, 1, 64, "u"], [5, 3, 62, "ta"]],
    /* 後奏：ららら */
    20: [[0, 7, 67, "ra"]],
    21: [[0, 7, 69, "ra"]],
    22: [[0, 8, 66, "ra"]]
  };

  /* 歌詞の表示：何小節目から光らせるか（HTMLの <li> の順） */
  var LINE_BARS = [4, 6, 8, 10, 12, 14, 16, 18];

  /* 母音ごとの共鳴の周波数（声道の形の違い）。n は「ん」 */
  var FORMANTS = {
    a: [760, 1150, 2500],
    i: [300, 2250, 3000],
    u: [330, 1250, 2350],
    e: [520, 1850, 2500],
    o: [540, 880, 2450],
    n: [260, 1100, 2300]
  };

  /* 母音によって共鳴の強さが違うので、聞こえる大きさをそろえる */
  var VOWEL_LEVEL = { a: 1.15, i: 0.85, u: 0.9, e: 1.1, o: 1.05, n: 1 };

  function hz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /* ---- 設計図から「いつ・何を鳴らすか」の一覧を作る ---- */

  function buildEvents() {
    var list = [];
    function add(bar, eighth, name, args) {
      list.push({ t: bar * BAR + eighth * E, name: name, args: args });
    }

    for (var bar = 0; bar < BARS; bar++) {
      var chord = CHORDS[PROGRESSION[bar]];
      var intro = bar < 4;
      var verse = bar >= 4 && bar < 12;
      var chorus = bar >= 12 && bar < 20;
      var outro = bar >= 20;
      var last = bar === BARS - 1;
      var e;

      /* ピアノ：和音をばらして弾く */
      if (last) {
        for (e = 0; e < 4; e++) add(bar, e * 0.5, "keys", [chord.keys[e], 6, 0.5]);
        add(bar, 2, "keys", [78, 6, 0.35]);
      } else if (outro) {
        for (e = 0; e < 4; e++) add(bar, e * 2, "keys", [chord.keys[[0, 2, 3, 2][e]], 2.5, 0.42]);
      } else {
        var order = [0, 1, 2, 3, 2, 1, 2, 1];
        for (e = 0; e < 8; e++) {
          add(bar, e, "keys", [chord.keys[order[e]], 1.6, (e % 4 === 0 ? 0.5 : 0.34) * (chorus ? 1.1 : 1)]);
        }
      }

      /* 包むような持続音（前奏・サビ・後奏） */
      if (!verse) add(bar, 0, "pad", [chord.keys, last ? 10 : 8, chorus ? 1 : 0.7]);

      /* ベース */
      if (intro || outro) {
        add(bar, 0, "bass", [chord.bass, last ? 10 : 7.5, 0.8]);
      } else if (verse) {
        add(bar, 0, "bass", [chord.bass, 3, 1]);
        add(bar, 4, "bass", [chord.bass, 2.5, 0.9]);
        add(bar, 7, "bass", [chord.bass + 7, 0.8, 0.7]);
      } else {
        add(bar, 0, "bass", [chord.bass, 1.8, 1]);
        add(bar, 3, "bass", [chord.bass, 0.8, 0.8]);
        add(bar, 4, "bass", [chord.bass, 1.8, 1]);
        add(bar, 6, "bass", [chord.bass + 12, 0.8, 0.7]);
        add(bar, 7, "bass", [chord.bass + 7, 0.8, 0.75]);
      }

      /* ドラム：Aメロ前半は控えめ、後半から背中を押し、サビで全部そろう */
      if (verse || chorus) {
        var full = bar >= 8;
        for (e = 0; e < 8; e++) add(bar, e, "hat", [e % 2 === 0 ? 1 : 0.55]);
        add(bar, 0, "kick", [1]);
        if (full) {
          add(bar, 2, "snare", [chorus ? 1 : 0.6]);
          add(bar, 6, "snare", [chorus ? 1 : 0.6]);
          add(bar, 5, "kick", [0.8]);
        }
        if (chorus) add(bar, 4, "kick", [0.9]);
        /* サビへ入る直前と、サビの終わりの合図 */
        if (bar === 11 || bar === 19) {
          add(bar, 6.5, "snare", [0.6]);
          add(bar, 7, "snare", [0.8]);
          add(bar, 7.5, "snare", [1]);
        }
      } else if (bar === 20 || bar === 21) {
        for (e = 0; e < 8; e += 2) add(bar, e, "hat", [0.6]);
      }

      /* 前奏の鈴：サビのメロディーを1オクターブ上で先に聞かせる */
      if (intro) {
        MELODY[bar + 12].forEach(function (note) {
          add(bar, note[0], "bell", [note[2] + 12, note[1], 0.8]);
        });
      }
      if (bar === 22) {
        add(bar, 0, "bell", [78, 2, 0.6]);
        add(bar, 2, "bell", [76, 2, 0.6]);
        add(bar, 4, "bell", [74, 4, 0.7]);
      }

      /* 歌 */
      if (MELODY[bar]) {
        MELODY[bar].forEach(function (note) {
          add(bar, note[0], "voice", [note[2], note[1], note[3], outro ? 0.6 : chorus ? 1 : 0.85]);
        });
      }
    }

    list.sort(function (a, b) {
      return a.t - b.t;
    });
    return list;
  }

  /* ---- 楽器（その場で音を合成する） ---- */

  function makeKit(ctx) {
    var out = ctx.createDynamicsCompressor(); /* 音が大きくなりすぎないよう全体を整える */
    out.threshold.value = -16;
    out.ratio.value = 4;
    out.attack.value = 0.005;
    out.release.value = 0.2;
    var master = ctx.createGain();
    master.gain.value = 0.6;
    var limiter = ctx.createDynamicsCompressor(); /* 一瞬の大きな音で割れないようにする */
    limiter.threshold.value = -5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    out.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);

    /* 残響：減衰する雑音を「部屋の響き」として使う */
    var rate = ctx.sampleRate;
    var impulse = ctx.createBuffer(2, Math.floor(rate * 2.4), rate);
    for (var ch = 0; ch < 2; ch++) {
      var data = impulse.getChannelData(ch);
      for (var i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3.2);
      }
    }
    var reverb = ctx.createConvolver();
    reverb.buffer = impulse;
    var wet = ctx.createGain();
    wet.gain.value = 0.55;
    reverb.connect(wet);
    wet.connect(out);

    function bus(level, send) {
      var g = ctx.createGain();
      g.gain.value = level;
      g.connect(out);
      if (send) {
        var s = ctx.createGain();
        s.gain.value = send;
        g.connect(s);
        s.connect(reverb);
      }
      return g;
    }
    var band = bus(MIX.band * 0.85, 0.28); /* ピアノ・鈴・持続音 */
    var rhythm = bus(MIX.band * 0.85, 0); /* ベース・ドラム（響きを付けない） */
    var vox = bus(MIX.voice, 0.4); /* 歌 */

    /* 雑音（ドラムと子音に使う） */
    var noise = ctx.createBuffer(1, rate, rate);
    var noiseData = noise.getChannelData(0);
    for (var n = 0; n < noiseData.length; n++) noiseData[n] = Math.random() * 2 - 1;

    /* 歌のビブラート用のゆっくりした揺れ */
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 5.3;
    lfo.start();

    function osc(type, freq, start, stop, dest) {
      var o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.connect(dest);
      o.start(start);
      o.stop(stop);
      return o;
    }

    /* はじいて消えていく音量変化 */
    function pluck(t, peak, dur, dest) {
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(dest);
      return g;
    }

    /* 伸ばしてから消える音量変化 */
    function hold(t, peak, attack, len, release, dest) {
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.setValueAtTime(peak, t + Math.max(attack, len));
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, len) + release);
      g.connect(dest);
      return g;
    }

    function burst(t, dur, peak, type, freq, q, dest) {
      var src = ctx.createBufferSource();
      src.buffer = noise;
      var f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      var g = ctx.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(dest);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.02);
    }

    return {
      /* やわらかいエレクトリックピアノ */
      keys: function (t, midi, len, vel) {
        var dur = len * E + 0.5;
        var g = pluck(t, 0.2 * vel, dur, band);
        osc("sine", hz(midi), t, t + dur, g);
        var shine = pluck(t, 0.05 * vel, Math.min(dur, 0.7), band);
        osc("triangle", hz(midi) * 2, t, t + dur, shine);
      },

      /* 包むような持続音 */
      pad: function (t, midis, len, vel) {
        var dur = len * E;
        var filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 900;
        filter.connect(band);
        var g = hold(t, 0.03 * vel, 0.5, dur - 0.3, 0.9, filter);
        midis.forEach(function (midi) {
          osc("sawtooth", hz(midi) * 1.003, t, t + dur + 1, g);
          osc("sawtooth", hz(midi) * 0.997, t, t + dur + 1, g);
        });
      },

      bass: function (t, midi, len, vel) {
        var dur = len * E;
        var filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 520;
        filter.connect(rhythm);
        var g = hold(t, 0.34 * vel, 0.012, dur - 0.05, 0.09, filter);
        osc("triangle", hz(midi), t, t + dur + 0.2, g);
        osc("sine", hz(midi) * 2, t, t + dur + 0.2, g).detune.value = 3;
      },

      kick: function (t, vel) {
        var g = pluck(t, 0.75 * vel, 0.3, rhythm);
        var o = osc("sine", 130, t, t + 0.32, g);
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
      },

      snare: function (t, vel) {
        burst(t, 0.17, 0.3 * vel, "bandpass", 1900, 0.7, rhythm);
        var g = pluck(t, 0.16 * vel, 0.09, rhythm);
        osc("triangle", 196, t, t + 0.1, g);
      },

      hat: function (t, vel) {
        burst(t, 0.045, 0.085 * vel, "highpass", 7200, 0.5, rhythm);
      },

      /* 鈴のような音（トップの海と同じ作り） */
      bell: function (t, midi, len, vel) {
        var dur = len * E + 1.4;
        var g = pluck(t, 0.17 * vel, dur, band);
        osc("sine", hz(midi), t, t + dur, g);
        var shine = pluck(t, 0.04 * vel, 0.45, band);
        osc("triangle", hz(midi) * 2, t, t + 0.5, shine);
      },

      /* 歌声：のこぎり波を、母音ごとの共鳴に通す */
      voice: function (t, midi, len, syllable, vel) {
        var vowel = syllable === "n" ? "n" : syllable.slice(-1);
        var consonant = syllable === "n" ? "" : syllable.slice(0, -1);
        var target = FORMANTS[vowel];
        var freq = hz(midi - 12); /* 楽譜より1オクターブ下＝男声の高さで歌う */
        var dur = len * E;
        var unvoiced = /^(k|ky|s|sh|t|ts|ch|h|f)$/.test(consonant);
        var start = unvoiced ? t + 0.055 : t; /* 息の子音のあとに母音が始まる */
        var end = t + dur - 0.02;

        /* 息の音の子音 */
        if (consonant === "s" || consonant === "ts") burst(t, 0.075, 0.1 * vel, "highpass", 5600, 0.5, vox);
        else if (consonant === "sh" || consonant === "ch") burst(t, 0.075, 0.13 * vel, "bandpass", 3300, 1.2, vox);
        else if (consonant === "k" || consonant === "ky") burst(t, 0.035, 0.2 * vel, "bandpass", 2100, 2.5, vox);
        else if (consonant === "t") burst(t, 0.028, 0.16 * vel, "highpass", 4200, 0.5, vox);
        else if (consonant === "h" || consonant === "f") burst(t, 0.07, 0.07 * vel, "bandpass", 1500, 0.8, vox);

        var g = hold(start, 0.85 * vel * VOWEL_LEVEL[vowel], 0.035, end - start - 0.035, 0.11, vox);
        var source = ctx.createGain();
        var stop = end + 0.2;
        var a = osc("sawtooth", freq, start, stop, source);
        var b = osc("sawtooth", freq * 1.004, start, stop, source);

        /* 伸ばす音にだけ、少し遅れてビブラートがかかる */
        if (dur > 0.5) {
          var depth = ctx.createGain();
          depth.gain.setValueAtTime(0, start + 0.22);
          depth.gain.linearRampToValueAtTime(freq * 0.007, start + 0.5);
          lfo.connect(depth);
          depth.connect(a.frequency);
          depth.connect(b.frequency);
          /* 鳴り終わったら揺れの配線を外す（lfo は曲の最後まで動き続けるため） */
          a.onended = function () {
            lfo.disconnect(depth);
          };
        }

        /* 声の芯になる低い成分 */
        var body = ctx.createBiquadFilter();
        body.type = "lowpass";
        body.frequency.value = Math.max(420, freq * 1.3);
        var bodyGain = ctx.createGain();
        bodyGain.gain.value = 0.22;
        source.connect(body);
        body.connect(bodyGain);
        bodyGain.connect(g);

        /* 共鳴3つ。声を出す子音は、口が閉じた形から母音の形へすばやく動かして近似する */
        var nasal = consonant === "m" || consonant === "n";
        var from = nasal ? [260, consonant === "m" ? 950 : 1450, 2300] : consonant && !unvoiced ? [290, target[1] * 0.82, target[2]] : target;
        var glide = nasal ? 0.07 : 0.04;
        [1, 0.62, 0.3].forEach(function (level, index) {
          var f = ctx.createBiquadFilter();
          f.type = "bandpass";
          f.Q.value = index === 0 ? 4.5 : 7;
          f.frequency.setValueAtTime(from[index], start);
          if (nasal) f.frequency.setValueAtTime(from[index], start + 0.045);
          f.frequency.exponentialRampToValueAtTime(target[index], start + (nasal ? 0.045 : 0) + glide);
          var fg = ctx.createGain();
          fg.gain.value = level * 2.2;
          source.connect(f);
          f.connect(fg);
          fg.connect(g);
        });
      }
    };
  }

  /* ---- 再生の制御 ---- */

  var events = buildEvents();
  var ctx = null;
  var kit = null;
  var startAt = 0;
  var next = 0;
  var playing = false;
  var timer = 0;

  function clock(seconds) {
    var s = Math.max(0, Math.floor(seconds));
    return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }

  /* 少し先の分だけ予約していく（まとめて予約すると端末に負担がかかるため） */
  function pump() {
    if (!ctx) return;
    var ahead = ctx.startRendering ? Infinity : 1.6;
    var limit = ctx.currentTime - startAt + ahead;
    while (next < events.length && events[next].t < limit) {
      var ev = events[next++];
      kit[ev.name].apply(null, [startAt + ev.t].concat(ev.args));
    }
  }

  function show(position) {
    var done = Math.min(1, Math.max(0, position / LENGTH));
    player.style.setProperty("--song", done.toFixed(4));
    timeText.textContent = clock(position) + " / " + clock(LENGTH);
    var bar = position / BAR;
    for (var i = 0; i < lines.length; i++) {
      var on = playingOrPaused() && bar >= LINE_BARS[i] - 0.15 && bar < LINE_BARS[i] + 2;
      lines[i].classList.toggle("is-now", on);
    }
  }

  function playingOrPaused() {
    return ctx !== null;
  }

  function tick() {
    if (!ctx) return;
    pump();
    var position = ctx.currentTime - startAt;
    show(position);
    if (position > LENGTH + TAIL) stop();
  }

  function label() {
    playButton.setAttribute("aria-pressed", playing ? "true" : "false");
    playLabel.textContent = playing ? "一時停止" : ctx ? "続きを再生" : "再生する";
    player.classList.toggle("is-playing", playing);
    resetButton.hidden = !ctx;
  }

  function stop() {
    window.clearInterval(timer);
    if (ctx && ctx.close) {
      try {
        ctx.close();
      } catch (error) {
        /* すでに閉じている場合は何もしない */
      }
    }
    ctx = null;
    kit = null;
    playing = false;
    next = 0;
    show(0);
    label();
  }

  function play() {
    try {
      if (!ctx) {
        ctx = new AudioCtx();
        kit = makeKit(ctx);
        startAt = ctx.currentTime + 0.12;
        next = 0;
      }
      ctx.resume();
    } catch (error) {
      stop();
      return;
    }
    playing = true;
    pump();
    window.clearInterval(timer);
    timer = window.setInterval(tick, 80);
    label();
  }

  function pause() {
    if (!ctx) return;
    ctx.suspend();
    playing = false;
    window.clearInterval(timer);
    label();
  }

  controls.hidden = false;
  show(0);
  label();
  playButton.addEventListener("click", function () {
    if (playing) pause();
    else play();
  });
  resetButton.addEventListener("click", stop);
})();
