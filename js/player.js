(function () {
  'use strict';

  var STAGE_W = 1080;
  var STAGE_H = 1920;
  var CROSSFADE_SEC = 1.1;
  var VIEW_MORPH_SEC = 2.0;
  var CONTROLS_H = 56;
  var CHAR_FADE_SEC = 0.25;

  var FALLBACK_META = {
    1: { title: '健康甜美的親子關係', verse_ref: '西三20', verse: '『作兒女的，要凡事順從父母，因為這在主裏是可喜悅的。作父親的，不要惹你們兒女的氣，免得他們灰心喪志。』' },
    2: { title: '美好的家庭時光', verse_ref: '徒二46', verse: '『他們天天同心合意，堅定持續的在殿裏，並且挨家挨戶擘餅，存著歡躍單純的心用飯。』' },
    3: { title: '孩子！這是彎曲悖謬的世代！', verse_ref: '腓二15', verse: '『使你們無可指摘、純潔無雜，在彎曲悖謬的世代中，作神無瑕疵的兒女；你們在其中好像發光之體顯在世界裏。』' },
    4: { title: '優良品格—留給孩子最好的禮物', verse_ref: '提後二21', verse: '『所以人若潔淨自己，脫離這些卑賤的，就必成為貴重的器皿，分別為聖，合乎主人使用，預備行各樣的善事。』' },
    5: { title: '孩子一生的守護者', verse_ref: '約十29', verse: '『我父把羊賜給我，祂比萬有都大，誰也不能從我父手裏把他們奪去。』' },
    6: { title: '和諧的夫妻關係—孩子的幸福堡壘', verse_ref: '彼前三7', verse: '『照樣，作丈夫的，要按情理與妻子同住，因為她們是比你軟弱的器皿，是女性；又要按她們是與你一同承受生命之恩的，敬重她們。』' }
  };

  var DEFAULT_PALETTE = {
    bg: '#f6e7df',
    ink: '#462c22',
    accent: '#b83724',
    panel: 'rgba(255, 251, 247, 0.88)'
  };

  var params = new URLSearchParams(window.location.search);
  var rawT = params.get('t') || '1';
  var tractId = parseInt(String(rawT).replace(/\D+/g, ''), 10);
  if (!tractId || tractId < 1) tractId = 1;

  var isRenderMode = params.get('render') === '1' || params.get('render') === 'true';
  if (isRenderMode) {
    document.body.classList.add('render-mode');
  }

  var prefersReducedMotion = false;
  try {
    if (!isRenderMode && window.matchMedia) {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      prefersReducedMotion = !!(mq && mq.matches);
      if (mq && mq.addEventListener) {
        mq.addEventListener('change', function (e) {
          prefersReducedMotion = !!e.matches;
        });
      }
    }
  } catch (_) {}

  var stageViewport = document.getElementById('stage-viewport');
  var stageEl = document.getElementById('stage');
  var scenesLayer = document.getElementById('scenes-layer');
  var whiteOverlay = document.getElementById('white-overlay');
  var uiLayer = document.getElementById('ui-layer');
  var startOverlay = document.getElementById('start-overlay');
  var endOverlay = document.getElementById('end-overlay');
  var playBtn = document.getElementById('play-btn');
  var playBtnLabel = document.getElementById('play-btn-label');
  var replayBtn = document.getElementById('replay-btn');
  var endTitleEl = document.getElementById('end-title');
  var controlsEl = document.getElementById('controls');
  var ctrlPlayBtn = document.getElementById('ctrl-play');
  var ctrlTrack = document.getElementById('ctrl-track');
  var ctrlFill = document.getElementById('ctrl-fill');
  var ctrlThumb = document.getElementById('ctrl-thumb');
  var ctrlCur = document.getElementById('ctrl-cur');
  var ctrlTot = document.getElementById('ctrl-tot');
  var isDragging = false;

  var sceneModels = [];
  var totalDuration = 5.0;
  var currentTime = 0;
  var isReady = false;

  // Audio & interactive state
  var playState = 'idle'; // 'idle' | 'playing' | 'paused' | 'ended'
  var rafId = null;
  var playStartPerf = 0;
  var pausedAtTime = 0;
  var bgmAudio = null;

  function clamp(val, min, max) {
    return val < min ? min : (val > max ? max : val);
  }

  function easeInOutSine(x) {
    return -(Math.cos(Math.PI * clamp(x, 0, 1)) - 1) / 2;
  }

  function updateStageScale() {
    var vw = window.innerWidth || STAGE_W;
    var vh = window.innerHeight || STAGE_H;
    if (!isRenderMode) vh = Math.max(200, vh - CONTROLS_H);
    var scale = Math.min(vw / STAGE_W, vh / STAGE_H);
    var scaledW = Math.round(STAGE_W * scale);
    var scaledH = Math.round(STAGE_H * scale);
    if (stageViewport) {
      stageViewport.style.width = scaledW + 'px';
      stageViewport.style.height = scaledH + 'px';
    }
    if (controlsEl) {
      controlsEl.style.width = Math.max(300, scaledW) + 'px';
    }
    if (stageEl) {
      stageEl.style.transform = 'scale(' + scale + ')';
      stageEl.classList.toggle('is-scaled', Math.abs(scale - 1) > 0.01);
    }
  }

  window.addEventListener('resize', updateStageScale);
  updateStageScale();

  function applyPalette(palette) {
    var p = {
      bg: (palette && palette.bg) || DEFAULT_PALETTE.bg,
      ink: (palette && palette.ink) || DEFAULT_PALETTE.ink,
      accent: (palette && palette.accent) || DEFAULT_PALETTE.accent,
      panel: (palette && palette.panel) || DEFAULT_PALETTE.panel
    };
    var root = document.documentElement;
    root.style.setProperty('--bg', p.bg);
    root.style.setProperty('--ink', p.ink);
    root.style.setProperty('--accent', p.accent);
    root.style.setProperty('--panel', p.panel);
    document.body.style.background =
      'radial-gradient(circle at 50% 35%, #fffaf5 0%, ' + p.bg + ' 68%, ' + p.bg + ' 100%)';
    return p;
  }

  function loadFontReady() {
    var timeout = new Promise(function (resolve) {
      setTimeout(resolve, 1800);
    });
    var fontPromise = Promise.resolve();
    try {
      if (document.fonts) {
        fontPromise = Promise.all([
          document.fonts.ready,
          document.fonts.load ? document.fonts.load('56px "WenKai"') : Promise.resolve(),
          document.fonts.load ? document.fonts.load('60px "PrayerHand"') : Promise.resolve()
        ]).catch(function () {});
      }
    } catch (_) {}
    return Promise.race([fontPromise, timeout]);
  }

  function preloadImage(src) {
    return new Promise(function (resolve) {
      if (!src) {
        resolve({ src: '', width: 2000, height: 1410, ok: false });
        return;
      }
      var img = new Image();
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        resolve({
          src: src,
          width: img.naturalWidth || 2000,
          height: img.naturalHeight || 1410,
          ok: ok
        });
      }
      var timer = setTimeout(function () {
        finish(false);
      }, 4000);
      img.onload = function () {
        clearTimeout(timer);
        if (img.decode) {
          img.decode().then(function () { finish(true); }).catch(function () { finish(true); });
        } else {
          finish(true);
        }
      };
      img.onerror = function () {
        clearTimeout(timer);
        finish(false);
      };
      img.src = src;
    });
  }

  function defaultCamForSize(imgW, imgH) {
    var targetRatio = STAGE_W / STAGE_H; // 0.5625
    var w = imgH * targetRatio;
    var h = imgH;
    if (w > imgW) {
      w = imgW;
      h = imgW / targetRatio;
    }
    var x = (imgW - w) / 2;
    var y = (imgH - h) / 2;
    return [x, y, w, h];
  }

  function normalizeCam(cam, fallbackCam, imgW, imgH) {
    if (Array.isArray(cam) && cam.length >= 4) {
      var x = Number(cam[0]);
      var y = Number(cam[1]);
      var w = Number(cam[2]);
      var h = Number(cam[3]);
      if (isFinite(x) && isFinite(y) && isFinite(w) && isFinite(h) && w > 0 && h > 0) {
        return [x, y, w, h];
      }
    }
    if (Array.isArray(fallbackCam) && fallbackCam.length >= 4) {
      return fallbackCam.slice(0, 4);
    }
    return defaultCamForSize(imgW, imgH);
  }

  function normalizeRegions(rawRegions) {
    var map = {};
    if (!rawRegions) return map;
    if (Array.isArray(rawRegions)) {
      rawRegions.forEach(function (r) {
        if (r && r.name && Array.isArray(r.box) && r.box.length >= 4) {
          map[r.name] = {
            img: r.img || 'front',
            box: r.box.map(Number)
          };
        }
      });
    } else if (typeof rawRegions === 'object') {
      Object.keys(rawRegions).forEach(function (key) {
        var r = rawRegions[key];
        if (r && Array.isArray(r.box) && r.box.length >= 4) {
          map[key] = {
            img: r.img || 'front',
            box: r.box.map(Number)
          };
        } else if (Array.isArray(r) && r.length >= 4) {
          map[key] = {
            img: 'front',
            box: r.map(Number)
          };
        }
      });
    }
    return map;
  }

  function getCharWeight(ch) {
    if (!ch || ch === '\n' || ch === '\r' || ch === ' ' || ch === '\t') return 0.2;
    if ('，、,'.indexOf(ch) !== -1) return 2;
    if ('。！？…；：.!?;:'.indexOf(ch) !== -1) return 4;
    return 1;
  }

  function computeMatchMask(text, phrases, splitClauses) {
    var mask = new Array(text.length).fill(false);
    if (!text || !Array.isArray(phrases)) return mask;

    function markSubstring(sub) {
      if (!sub) return;
      var startIdx = 0;
      while (startIdx < text.length) {
        var idx = text.indexOf(sub, startIdx);
        if (idx === -1) break;
        for (var k = idx; k < idx + sub.length; k++) {
          mask[k] = true;
        }
        startIdx = idx + sub.length;
      }
    }

    phrases.forEach(function (phrase) {
      if (typeof phrase !== 'string') return;
      var trimmed = phrase.trim();
      if (!trimmed) return;
      if (text.indexOf(trimmed) !== -1) {
        markSubstring(trimmed);
      } else if (splitClauses) {
        var clauses = trimmed.split(/[，。！？；：、…\n]+/);
        clauses.forEach(function (cl) {
          var c = cl.trim();
          if (c.length >= 4) {
            markSubstring(c);
          }
        });
      }
    });

    return mask;
  }

  var NO_START_RE = /^[，。、；：！？）」』》】〕〉”’…—－\-～~·・,.!?;:)\]}%]/;
  var NO_END_RE = /[（([｛{《〈「『【〔“‘]$/;
  var ASCII_LETTER_RE = /^[A-Za-z]$/;

  function canBreakBefore(paraChars, idx) {
    if (idx <= 0 || idx >= paraChars.length) return true;
    var prevCh = paraChars[idx - 1].ch;
    var currCh = paraChars[idx].ch;
    if (NO_START_RE.test(currCh)) return false;
    if (NO_END_RE.test(prevCh)) return false;
    if (ASCII_LETTER_RE.test(prevCh) && ASCII_LETTER_RE.test(currCh)) return false;
    return true;
  }

  function rangeWidth(paraChars, start, end) {
    var sum = 0;
    for (var i = start; i < end; i++) {
      sum += paraChars[i].w;
    }
    return sum;
  }

  function allNoStart(paraChars, start, end) {
    if (start >= end) return false;
    for (var i = start; i < end; i++) {
      if (!NO_START_RE.test(paraChars[i].ch)) return false;
    }
    return true;
  }

  function breakParagraphIntoLines(paraChars, maxW, fontSize) {
    var lines = [];
    var n = paraChars.length;
    var lineStart = 0;

    while (lineStart < n) {
      var accW = 0;
      var k = lineStart;
      while (k < n) {
        var nextW = accW + paraChars[k].w;
        if (k > lineStart && nextW > maxW + 0.5) {
          break;
        }
        accW = nextW;
        k++;
      }

      if (k >= n) {
        lines.push(paraChars.slice(lineStart, n));
        break;
      }

      var breakIdx = k;
      if (!canBreakBefore(paraChars, breakIdx)) {
        var kFwd = breakIdx + 1;
        while (kFwd < n && !canBreakBefore(paraChars, kFwd)) {
          kFwd++;
        }
        var pullOk = allNoStart(paraChars, breakIdx, kFwd) &&
                     rangeWidth(paraChars, lineStart, kFwd) <= maxW + fontSize * 0.45;
        if (pullOk) {
          breakIdx = kFwd;
        } else {
          var kBack = breakIdx - 1;
          while (kBack > lineStart && !canBreakBefore(paraChars, kBack)) {
            kBack--;
          }
          if (kBack > lineStart) {
            breakIdx = kBack;
          } else {
            breakIdx = kFwd;
          }
        }
      }

      lines.push(paraChars.slice(lineStart, breakIdx));
      lineStart = breakIdx;
    }

    return lines;
  }

  function layoutPanelLines(panelInner, paragraphs, refWrap, penTipEl, fontSize, lineHeight) {
    panelInner.style.fontSize = fontSize + 'px';
    panelInner.style.lineHeight = lineHeight.toFixed(2);
    panelInner.innerHTML = '';

    paragraphs.forEach(function (paraChars) {
      paraChars.forEach(function (cm) {
        panelInner.appendChild(cm.el);
      });
    });

    var maxW = panelInner.clientWidth || 840;
    var innerRect = panelInner.getBoundingClientRect();
    var scaleFactor = (innerRect && innerRect.width > 0 && maxW > 0) ? (innerRect.width / maxW) : 1;
    paragraphs.forEach(function (paraChars) {
      paraChars.forEach(function (cm) {
        var rect = cm.el.getBoundingClientRect();
        cm.w = (rect && rect.width > 0) ? (rect.width / scaleFactor) : (cm.el.offsetWidth || fontSize);
      });
    });

    panelInner.innerHTML = '';
    paragraphs.forEach(function (paraChars) {
      if (paraChars.length === 0) return;
      var lines = breakParagraphIntoLines(paraChars, maxW, fontSize);
      lines.forEach(function (lineChars) {
        var lineEl = document.createElement('div');
        lineEl.className = 'text-line';
        lineChars.forEach(function (cm) {
          lineEl.appendChild(cm.el);
        });
        panelInner.appendChild(lineEl);
      });
    });

    if (refWrap) {
      panelInner.appendChild(refWrap);
    }
    if (penTipEl) {
      panelInner.appendChild(penTipEl);
    }
  }

  function normalizeTextPos(pos) {
    var allowed = {
      'top': 'pos-top',
      'top-left': 'pos-top-left',
      'top-right': 'pos-top-right',
      'center': 'pos-center',
      'bottom': 'pos-bottom',
      'bottom-left': 'pos-bottom-left',
      'bottom-right': 'pos-bottom-right'
    };
    return allowed[pos] || 'pos-bottom';
  }

  // view rect in stage px: [x, y, w, h, radius, rotateDeg]
  function normalizeView(v) {
    if (!Array.isArray(v) || v.length < 4) return null;
    var out = [];
    for (var i = 0; i < 6; i++) {
      var n = Number(v[i]);
      out.push(isFinite(n) ? n : 0);
    }
    if (out[2] <= 0 || out[3] <= 0) return null;
    return out;
  }

  function buildScenes(rawData, loadedImages) {
    var meta = FALLBACK_META[tractId] || FALLBACK_META[1];
    var data = rawData && typeof rawData === 'object' ? rawData : {};

    var title = (typeof data.title === 'string' && data.title.trim()) ? data.title.trim() : meta.title;
    var verseText = (typeof data.verse === 'string' && data.verse.trim()) ? data.verse.trim() : meta.verse;
    var verseRef = (typeof data.verse_ref === 'string' && data.verse_ref.trim()) ? data.verse_ref.trim() : meta.verse_ref;

    document.title = title + ' — 兒童家長福音單張動畫版';
    if (endTitleEl) {
      endTitleEl.textContent = title;
    }

    applyPalette(data.palette);

    var sizeObj = data.size || data.image_size || {};
    var frontSize = (Array.isArray(sizeObj.front) && sizeObj.front.length >= 2 && sizeObj.front[0] > 0)
      ? [Number(sizeObj.front[0]), Number(sizeObj.front[1])]
      : [loadedImages.front.width, loadedImages.front.height];
    var backSize = (Array.isArray(sizeObj.back) && sizeObj.back.length >= 2 && sizeObj.back[0] > 0)
      ? [Number(sizeObj.back[0]), Number(sizeObj.back[1])]
      : [loadedImages.back.width, loadedImages.back.height];

    var regionsMap = normalizeRegions(data.regions);
    var globalBold = Array.isArray(data.bold) ? data.bold : [];
    var globalHighlight = Array.isArray(data.verse_highlight) ? data.verse_highlight : [];

    var rawScenes = Array.isArray(data.scenes) && data.scenes.length > 0
      ? data.scenes
      : [
          { type: 'cover', img: 'front', start: 0, duration: 3.0 },
          { type: 'verse', img: 'front', start: 3.0, duration: 7.0, text: verseText, ref: verseRef, text_pos: 'bottom' }
        ];

    scenesLayer.innerHTML = '';
    sceneModels = [];

    var cursorStart = 0;

    rawScenes.forEach(function (s, idx) {
      var sc = s && typeof s === 'object' ? s : {};
      var type = sc.type || (idx === 0 && !sc.text ? 'cover' : 'text');

      var imgKey = 'front';
      if (sc.img === 'back' || (typeof sc.img === 'string' && sc.img.indexOf('back') !== -1)) {
        imgKey = 'back';
      } else if (!sc.img && type === 'text') {
        imgKey = 'back';
      }

      var imgInfo = imgKey === 'back' ? loadedImages.back : loadedImages.front;
      var imgSize = imgKey === 'back' ? backSize : frontSize;
      var imgW = imgSize[0] || 2000;
      var imgH = imgSize[1] || 1410;

      var audioOffset = typeof sc.audio_offset === 'number' && isFinite(sc.audio_offset)
        ? sc.audio_offset
        : (type === 'cover' ? 0 : 0.5);

      var duration = typeof sc.duration === 'number' && sc.duration > 0
        ? sc.duration
        : (type === 'cover'
            ? 3.0
            : (typeof sc.audio_dur === 'number' && sc.audio_dur > 0
                ? audioOffset + sc.audio_dur + 1.0
                : 8.0));

      var audioDur = typeof sc.audio_dur === 'number' && sc.audio_dur > 0
        ? sc.audio_dur
        : Math.max(0.5, duration - audioOffset - 1.0);

      var start = typeof sc.start === 'number' && isFinite(sc.start) ? sc.start : cursorStart;
      var end = start + duration;
      cursorStart = end;

      var camFrom = normalizeCam(sc.cam_from, sc.cam_to, imgW, imgH);
      var camTo = normalizeCam(sc.cam_to, camFrom, imgW, imgH);

      // Build Scene DOM
      var sceneEl = document.createElement('div');
      sceneEl.className = 'scene scene-' + type;
      sceneEl.style.display = 'none';
      sceneEl.style.opacity = '0';

      var camLayer = document.createElement('div');
      camLayer.className = 'scene-cam-layer';
      camLayer.style.width = imgW + 'px';
      camLayer.style.height = imgH + 'px';

      if (imgInfo && imgInfo.src) {
        var bgImg = document.createElement('img');
        bgImg.className = 'scene-bg-img';
        bgImg.src = imgInfo.src;
        bgImg.alt = '';
        bgImg.style.width = imgW + 'px';
        bgImg.style.height = imgH + 'px';
        camLayer.appendChild(bgImg);
      }

      var viewFrom = normalizeView(sc.view_from || sc.view_to);
      var viewTo = normalizeView(sc.view_to || sc.view_from);
      var viewEl = document.createElement('div');
      viewEl.className = 'scene-view' + (sc.frame ? ' frame-' + String(sc.frame).replace(/[^a-z]/g, '') : '');
      if (viewTo && imgInfo && imgInfo.src) {
        var backdrop = document.createElement('div');
        backdrop.className = 'scene-backdrop';
        backdrop.style.backgroundImage = 'url("' + imgInfo.src + '")';
        sceneEl.appendChild(backdrop);
      }
      viewEl.appendChild(camLayer);
      sceneEl.appendChild(viewEl);

      // Build Sprites
      var spritesLayer = document.createElement('div');
      spritesLayer.className = 'scene-sprites-layer';
      var spriteModels = [];

      if (Array.isArray(sc.sprites)) {
        sc.sprites.forEach(function (sp) {
          if (!sp || typeof sp !== 'object') return;
          var regName = sp.region || sp.name;
          var reg = (regName && regionsMap[regName]) || (Array.isArray(sp.box) ? { img: sp.img || imgKey, box: sp.box } : null);
          if (!reg || !Array.isArray(reg.box) || reg.box.length < 4) return;

          var x0 = Number(reg.box[0]);
          var y0 = Number(reg.box[1]);
          var x1 = Number(reg.box[2]);
          var y1 = Number(reg.box[3]);
          var regW = x1 - x0;
          var regH = y1 - y0;
          if (!isFinite(regW) || !isFinite(regH) || regW <= 0 || regH <= 0) return;

          var spImgKey = (reg.img === 'back' || (typeof reg.img === 'string' && reg.img.indexOf('back') !== -1)) ? 'back' : 'front';
          var spImgInfo = spImgKey === 'back' ? loadedImages.back : loadedImages.front;
          var spImgSize = spImgKey === 'back' ? backSize : frontSize;
          if (!spImgInfo || !spImgInfo.src) return;

          var rawW = typeof sp.w === 'number' && sp.w > 0 ? sp.w : 0.35;
          var stageW = rawW <= 1.5 ? rawW * STAGE_W : rawW;
          var stageH = stageW * (regH / regW);

          var rawX = typeof sp.x === 'number' ? sp.x : 0.5;
          var rawY = typeof sp.y === 'number' ? sp.y : 0.5;
          var cx = rawX <= 1.5 ? rawX * STAGE_W : rawX;
          var cy = rawY <= 1.5 ? rawY * STAGE_H : rawY;

          var scale = stageW / regW;
          var spEl = document.createElement('div');
          spEl.className = 'scene-sprite';
          spEl.style.width = stageW.toFixed(2) + 'px';
          spEl.style.height = stageH.toFixed(2) + 'px';
          spEl.style.left = (cx - stageW / 2).toFixed(2) + 'px';
          spEl.style.top = (cy - stageH / 2).toFixed(2) + 'px';
          spEl.style.backgroundImage = 'url("' + spImgInfo.src + '")';
          spEl.style.backgroundSize = (spImgSize[0] * scale).toFixed(2) + 'px ' + (spImgSize[1] * scale).toFixed(2) + 'px';
          spEl.style.backgroundPosition = (-x0 * scale).toFixed(2) + 'px ' + (-y0 * scale).toFixed(2) + 'px';

          spritesLayer.appendChild(spEl);
          spriteModels.push({
            el: spEl,
            motion: sp.motion || 'float'
          });
        });
      }

      sceneEl.appendChild(spritesLayer);

      // Build Text / Verse Panel
      var panelEl = null;
      var panelInner = null;
      var penTipEl = null;
      var charModels = [];

      var bodyText = '';
      if (type === 'verse') {
        bodyText = typeof sc.text === 'string' && sc.text.trim() ? sc.text.trim() : verseText;
      } else if (type !== 'cover') {
        bodyText = typeof sc.text === 'string' ? sc.text.trim() : '';
      }

      if (type !== 'cover' && bodyText) {
        panelEl = document.createElement('div');
        var tb = sc.text_box && typeof sc.text_box === 'object' ? sc.text_box : null;
        if (tb && isFinite(tb.x) && isFinite(tb.y) && isFinite(tb.w)) {
          panelEl.className = 'scene-panel pos-custom' + (tb.style ? ' panel-' + String(tb.style).replace(/[^a-z]/g, '') : '');
          panelEl.style.left = Number(tb.x) + 'px';
          panelEl.style.width = Number(tb.w) + 'px';
          if (tb.anchor === 'bottom') panelEl.style.bottom = Number(tb.y) + 'px';
          else panelEl.style.top = Number(tb.y) + 'px';
        } else {
          tb = null;
          panelEl.className = 'scene-panel ' + normalizeTextPos(sc.text_pos);
        }

        panelInner = document.createElement('div');
        panelInner.className = 'panel-inner';

        var boldPhrases = globalBold.concat(Array.isArray(sc.bold) ? sc.bold : []);
        var highlightPhrases = globalHighlight.concat(Array.isArray(sc.verse_highlight) ? sc.verse_highlight : []);

        var boldMask = type === 'text' ? computeMatchMask(bodyText, boldPhrases, true) : [];
        var highlightMask = type === 'verse' ? computeMatchMask(bodyText, highlightPhrases, false) : [];

        var paragraphs = [[]];
        for (var i = 0; i < bodyText.length; i++) {
          var ch = bodyText.charAt(i);
          if (ch === '\n') {
            if (paragraphs[paragraphs.length - 1].length > 0) {
              paragraphs.push([]);
            }
            continue;
          }
          var span = document.createElement('span');
          var cls = 'char';
          if (ch === ' ' || ch === '\t') cls += ' char-space';
          if (boldMask[i]) cls += ' char-bold';
          if (highlightMask[i]) cls += ' char-highlight';
          span.className = cls;
          span.textContent = ch;
          var cmObj = {
            el: span,
            ch: ch,
            w: 0,
            weight: getCharWeight(ch),
            appearTime: 0,
            lastP: -1,
            penX: 0,
            penY: 0
          };
          paragraphs[paragraphs.length - 1].push(cmObj);
          charModels.push(cmObj);
        }

        var refWrap = null;
        if (type === 'verse') {
          var rawRef = (typeof sc.ref === 'string' && sc.ref.trim()) ? sc.ref.trim() : verseRef;
          if (rawRef) {
            var formattedRef = /^[—－\-]/.test(rawRef) ? rawRef : ('—' + rawRef);
            refWrap = document.createElement('div');
            refWrap.className = 'verse-ref-wrap';
            for (var rIdx = 0; rIdx < formattedRef.length; rIdx++) {
              var rCh = formattedRef.charAt(rIdx);
              var rSpan = document.createElement('span');
              rSpan.className = 'char';
              rSpan.textContent = rCh;
              refWrap.appendChild(rSpan);
              charModels.push({
                el: rSpan,
                ch: rCh,
                w: 0,
                weight: getCharWeight(rCh),
                appearTime: 0,
                lastP: -1,
                penX: 0,
                penY: 0
              });
            }
          }
        }

        penTipEl = document.createElement('div');
        penTipEl.className = 'pen-tip';

        panelEl.appendChild(panelInner);
        sceneEl.appendChild(panelEl);

        // Calculate linear weighted character appearTime within [audioOffset, audioOffset + writeSpan]
        var totalWeight = 0;
        charModels.forEach(function (cm) {
          totalWeight += cm.weight;
        });
        if (totalWeight <= 0) totalWeight = 1;

        var writeSpan = Math.max(0.15, audioDur - Math.min(CHAR_FADE_SEC, audioDur * 0.15));
        var accWeight = 0;
        charModels.forEach(function (cm) {
          cm.appearTime = audioOffset + (accWeight / totalWeight) * writeSpan;
          accWeight += cm.weight;
        });
      }

      scenesLayer.appendChild(sceneEl);

      // Custom kinsoku line-breaking, auto-fit font size, and cache character coordinates for pen tip
      if (panelEl && panelInner && charModels.length > 0) {
        sceneEl.style.display = 'block';
        sceneEl.style.visibility = 'hidden';

        var fontSize = type === 'verse' ? 58 : (type === 'prayer' ? 60 : 56);
        var lineHeight = 1.72;
        var maxInnerHeight = 920;
        if (tb && isFinite(tb.maxh) && tb.maxh > 200) maxInnerHeight = Number(tb.maxh) - 92;

        layoutPanelLines(panelInner, paragraphs, refWrap, penTipEl, fontSize, lineHeight);

        while (panelInner.scrollHeight > maxInnerHeight && fontSize > 44) {
          fontSize -= 2;
          if (fontSize < 50) {
            lineHeight = Math.max(1.55, 1.72 - (50 - fontSize) * 0.025);
          }
          layoutPanelLines(panelInner, paragraphs, refWrap, penTipEl, fontSize, lineHeight);
        }

        charModels.forEach(function (cm) {
          cm.penX = cm.el.offsetLeft + cm.el.offsetWidth * 0.75;
          cm.penY = cm.el.offsetTop + cm.el.offsetHeight * 0.68;
        });

        sceneEl.style.visibility = 'visible';
        sceneEl.style.display = 'none';
      }

      var audioEl = null;
      if (!isRenderMode && sc.audio && typeof sc.audio === 'string') {
        audioEl = new Audio();
        audioEl.preload = 'auto';
        audioEl.src = sc.audio;
        audioEl.volume = 1.0;
      }

      sceneModels.push({
        index: idx,
        type: type,
        el: sceneEl,
        camLayer: camLayer,
        viewEl: viewEl,
        viewFrom: viewFrom,
        viewTo: viewTo,
        lastViewKey: '',
        panelEl: panelEl,
        panelSlide: tb ? (tb.anchor === 'bottom' ? 1 : -1) : 0,
        penTipEl: penTipEl,
        sprites: spriteModels,
        chars: charModels,
        start: start,
        duration: duration,
        end: end,
        audioOffset: audioOffset,
        audioDur: audioDur,
        camFrom: camFrom,
        camTo: camTo,
        audioEl: audioEl,
        audioStarted: false,
        visible: false
      });
    });

    var lastSceneEnd = sceneModels.length > 0 ? sceneModels[sceneModels.length - 1].end : 3.0;
    totalDuration = (typeof data.total === 'number' && data.total > 0)
      ? data.total
      : (lastSceneEnd + 1.0);
    window.__total = totalDuration;

    if (!isRenderMode) {
      var bgmSrc = (typeof data.bgm === 'string' && data.bgm.trim()) ? data.bgm.trim() : 'audio/bgm.mp3';
      bgmAudio = new Audio();
      bgmAudio.preload = 'auto';
      bgmAudio.loop = true;
      bgmAudio.src = bgmSrc;
      bgmAudio.volume = 0;
    }
  }

  function computeSpriteTransform(motion, localT, sceneProgress) {
    var factor = prefersReducedMotion ? 0.25 : 1.0;
    var dx = 0;
    var dy = 0;
    var rot = 0;
    var sc = 1.0;

    switch (motion) {
      case 'drift':
        dx = ((sceneProgress - 0.5) * 44 + Math.sin(localT * 1.3) * 8) * factor;
        dy = Math.cos(localT * 1.05) * 10 * factor;
        rot = Math.sin(localT * 0.95) * 1.6 * factor;
        sc = 1 + 0.02 * factor;
        break;
      case 'sway':
        dx = Math.sin(localT * 1.75) * 14 * factor;
        dy = Math.cos(localT * 1.15) * 6 * factor;
        rot = Math.sin(localT * 1.75) * 4.2 * factor;
        sc = 1.0;
        break;
      case 'rise':
        dx = Math.sin(localT * 1.25) * 10 * factor;
        dy = (0.5 - sceneProgress) * 56 * factor;
        rot = Math.sin(localT * 1.0) * 1.8 * factor;
        sc = 1 + sceneProgress * 0.04 * factor;
        break;
      case 'zoom':
        dx = 0;
        dy = (0.5 - sceneProgress) * 18 * factor;
        rot = 0;
        sc = 1 + (sceneProgress - 0.3) * 0.12 * factor;
        break;
      case 'float':
      default:
        dx = Math.cos(localT * 1.1) * 10 * factor;
        dy = Math.sin(localT * 1.65) * 18 * factor;
        rot = Math.sin(localT * 1.25) * 2.0 * factor;
        sc = 1 + Math.sin(localT * 1.4) * 0.022 * factor;
        break;
    }

    return 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0) rotate(' + rot.toFixed(2) + 'deg) scale(' + sc.toFixed(4) + ')';
  }

  function renderSceneAt(scene, t, sceneOpacity) {
    if (!scene.visible) {
      scene.el.style.display = 'block';
      scene.visible = true;
    }
    scene.el.style.opacity = sceneOpacity.toFixed(4);

    // Camera interpolation (cam_from -> cam_to)
    var camSpanStart = scene.index > 0 ? (scene.start - CROSSFADE_SEC) : scene.start;
    var camSpanDur = Math.max(0.001, scene.end - camSpanStart);
    var camRawP = clamp((t - camSpanStart) / camSpanDur, 0, 1);
    var camEased = easeInOutSine(camRawP);
    if (prefersReducedMotion) {
      camEased = 0.4 + camEased * 0.2;
    }

    var cf = scene.camFrom;
    var ct = scene.camTo;
    var cx = cf[0] + (ct[0] - cf[0]) * camEased;
    var cy = cf[1] + (ct[1] - cf[1]) * camEased;
    var cw = Math.max(1, cf[2] + (ct[2] - cf[2]) * camEased);
    var ch = Math.max(1, cf[3] + (ct[3] - cf[3]) * camEased);

    var vx = 0, vy = 0, vw = STAGE_W, vh = STAGE_H, vr = 0, vrot = 0;
    if (scene.viewTo) {
      var vp = easeInOutSine(clamp((t - camSpanStart) / VIEW_MORPH_SEC, 0, 1));
      if (prefersReducedMotion) vp = 1;
      var a = scene.viewFrom || scene.viewTo;
      var b = scene.viewTo;
      vx = a[0] + (b[0] - a[0]) * vp;
      vy = a[1] + (b[1] - a[1]) * vp;
      vw = a[2] + (b[2] - a[2]) * vp;
      vh = a[3] + (b[3] - a[3]) * vp;
      vr = a[4] + (b[4] - a[4]) * vp;
      vrot = a[5] + (b[5] - a[5]) * vp;
    }
    var viewKey = vx.toFixed(1) + ',' + vy.toFixed(1) + ',' + vw.toFixed(1) + ',' + vh.toFixed(1) + ',' + vr.toFixed(1) + ',' + vrot.toFixed(2);
    if (viewKey !== scene.lastViewKey) {
      scene.lastViewKey = viewKey;
      var vs = scene.viewEl.style;
      vs.left = vx.toFixed(1) + 'px';
      vs.top = vy.toFixed(1) + 'px';
      vs.width = vw.toFixed(1) + 'px';
      vs.height = vh.toFixed(1) + 'px';
      vs.borderRadius = vr.toFixed(1) + 'px';
      vs.transform = vrot ? 'rotate(' + vrot.toFixed(2) + 'deg)' : 'none';
    }

    var s = Math.max(vw / cw, vh / ch);
    var tx = (vw - cw * s) / 2 - cx * s;
    var ty = (vh - ch * s) / 2 - cy * s;
    scene.camLayer.style.transform =
      'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) scale(' + s.toFixed(5) + ')';

    var localT = t - scene.start;
    var sceneProgress = clamp(localT / Math.max(0.001, scene.duration), 0, 1);

    // Sprites motion
    for (var sIdx = 0; sIdx < scene.sprites.length; sIdx++) {
      var sp = scene.sprites[sIdx];
      sp.el.style.transform = computeSpriteTransform(sp.motion, Math.max(0, localT), sceneProgress);
      var spFade = clamp((t - camSpanStart) / 0.6, 0, 0.96);
      sp.el.style.opacity = spFade.toFixed(3);
    }

    // Text panel & handwriting characters
    if (scene.panelEl) {
      var panelFade = clamp((localT + 0.35) / 0.6, 0, 1);
      scene.panelEl.style.opacity = panelFade.toFixed(3);
      if (scene.panelSlide) {
        var pe = 1 - (1 - panelFade) * (1 - panelFade);
        var slide = prefersReducedMotion ? 0 : (1 - pe) * 36 * scene.panelSlide;
        scene.panelEl.style.transform = slide ? 'translate3d(0,' + slide.toFixed(1) + 'px,0)' : 'none';
      }

      var chars = scene.chars;
      var activePenChar = null;
      var activePenP = 0;

      for (var cIdx = 0; cIdx < chars.length; cIdx++) {
        var cm = chars[cIdx];
        var p = clamp((localT - cm.appearTime) / CHAR_FADE_SEC, 0, 1);

        if (p !== cm.lastP) {
          cm.lastP = p;
          if (p <= 0) {
            cm.el.style.opacity = '0';
            cm.el.style.transform = 'none';
            cm.el.style.filter = 'none';
          } else if (p >= 1) {
            cm.el.style.opacity = '1';
            cm.el.style.transform = 'none';
            cm.el.style.filter = 'none';
          } else {
            var e = 1 - (1 - p) * (1 - p);
            var dy = prefersReducedMotion ? 0 : (1 - e) * 10;
            var blur = (1 - e) * 3.6;
            cm.el.style.opacity = e.toFixed(3);
            cm.el.style.transform = 'translate3d(0,' + dy.toFixed(2) + 'px,0)';
            cm.el.style.filter = 'blur(' + blur.toFixed(2) + 'px)';
          }
        }

        if (p > 0 && p < 1) {
          activePenChar = cm;
          activePenP = p;
        }
      }

      if (scene.penTipEl) {
        if (activePenChar) {
          var tipAlpha = Math.sin(activePenP * Math.PI) * 0.85 + 0.15;
          scene.penTipEl.style.opacity = tipAlpha.toFixed(3);
          scene.penTipEl.style.left = activePenChar.penX.toFixed(1) + 'px';
          scene.penTipEl.style.top = activePenChar.penY.toFixed(1) + 'px';
        } else {
          scene.penTipEl.style.opacity = '0';
        }
      }
    }
  }

  function render(rawTime) {
    var t = clamp(Number(rawTime) || 0, 0, totalDuration);
    currentTime = t;

    var count = sceneModels.length;
    for (var i = 0; i < count; i++) {
      var sc = sceneModels[i];
      var isLast = i === count - 1;
      var preStart = i > 0 ? sc.start - CROSSFADE_SEC : sc.start;
      var activeEnd = isLast ? totalDuration + 0.01 : sc.end;

      if (t >= preStart && t <= activeEnd) {
        var opacity = 1;
        if (i > 0 && t < sc.start) {
          opacity = easeInOutSine((t - preStart) / CROSSFADE_SEC);
        }
        renderSceneAt(sc, t, opacity);
      } else if (sc.visible) {
        sc.el.style.display = 'none';
        sc.el.style.opacity = '0';
        sc.visible = false;
      }
    }

    // White fade-in (first 1.0s) and fade-out (last 1.0s)
    var whiteOpacity = 0;
    if (t < 1.0) {
      whiteOpacity = 1.0 - t / 1.0;
    } else if (t > totalDuration - 1.0) {
      whiteOpacity = (t - (totalDuration - 1.0)) / 1.0;
    }
    whiteOverlay.style.opacity = clamp(whiteOpacity, 0, 1).toFixed(4);
    updateControls(t);
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec + 0.0001));
    var m = Math.floor(sec / 60);
    var r = sec % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  var lastCtrlKey = '';
  function updateControls(t) {
    if (!controlsEl || isRenderMode) return;
    var pct = totalDuration > 0 ? clamp(t / totalDuration, 0, 1) * 100 : 0;
    var key = pct.toFixed(2) + '|' + playState;
    if (key === lastCtrlKey) return;
    lastCtrlKey = key;
    if (ctrlFill) ctrlFill.style.width = pct.toFixed(3) + '%';
    if (ctrlThumb) ctrlThumb.style.left = pct.toFixed(3) + '%';
    if (ctrlCur) ctrlCur.textContent = fmtTime(t);
    if (ctrlTrack) {
      ctrlTrack.setAttribute('aria-valuenow', String(Math.round(t)));
      ctrlTrack.setAttribute('aria-valuetext', fmtTime(t) + ' / ' + fmtTime(totalDuration));
    }
    if (ctrlPlayBtn) {
      var playing = playState === 'playing';
      ctrlPlayBtn.classList.toggle('is-playing', playing);
      ctrlPlayBtn.setAttribute('aria-label', playing ? '暫停' : '播放');
    }
  }

  window.render = render;
  window.__total = totalDuration;
  window.__seek = function (t) {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (!isRenderMode) {
      if (startOverlay) startOverlay.classList.add('hidden');
      if (endOverlay) endOverlay.classList.add('hidden');
    }
    render(t);
  };

  // Interactive audio & playback controls
  function syncAudioAt(t) {
    if (isRenderMode) return;

    if (bgmAudio) {
      var bgmVol = 0.18;
      if (t < 2.0) {
        bgmVol = 0.18 * clamp(t / 2.0, 0, 1);
      } else if (t > totalDuration - 2.0) {
        bgmVol = 0.18 * clamp((totalDuration - t) / 2.0, 0, 1);
      }
      bgmAudio.volume = clamp(bgmVol, 0, 1);
      if (bgmAudio.paused && playState === 'playing' && t < totalDuration) {
        bgmAudio.play().catch(function () {});
      }
    }

    for (var i = 0; i < sceneModels.length; i++) {
      var sc = sceneModels[i];
      if (!sc.audioEl) continue;
      var narStart = sc.start + sc.audioOffset;
      var narEnd = narStart + sc.audioDur + 0.25;
      if (t >= narStart && t < narEnd && playState === 'playing') {
        var targetTime = Math.max(0, t - narStart);
        if (sc.audioEl.paused) {
          try {
            if (Math.abs(sc.audioEl.currentTime - targetTime) > 0.25) {
              sc.audioEl.currentTime = targetTime;
            }
          } catch (_) {}
          sc.audioEl.play().catch(function () {});
        }
      } else {
        if (!sc.audioEl.paused) {
          sc.audioEl.pause();
        }
      }
    }
  }

  function pauseAllAudio() {
    if (bgmAudio && !bgmAudio.paused) {
      bgmAudio.pause();
    }
    for (var i = 0; i < sceneModels.length; i++) {
      var a = sceneModels[i].audioEl;
      if (a && !a.paused) {
        a.pause();
      }
    }
  }

  function resetAllAudio() {
    pauseAllAudio();
    if (bgmAudio) {
      try { bgmAudio.currentTime = 0; } catch (_) {}
    }
    for (var i = 0; i < sceneModels.length; i++) {
      var a = sceneModels[i].audioEl;
      if (a) {
        try { a.currentTime = 0; } catch (_) {}
      }
    }
  }

  function tick() {
    if (playState !== 'playing') return;
    var now = performance.now();
    var t = pausedAtTime + (now - playStartPerf) / 1000;

    if (t >= totalDuration) {
      render(totalDuration);
      pauseAllAudio();
      playState = 'ended';
      rafId = null;
      pausedAtTime = totalDuration;
      updateControls(totalDuration);
      if (endOverlay) endOverlay.classList.remove('hidden');
      return;
    }

    render(t);
    syncAudioAt(t);
    rafId = requestAnimationFrame(tick);
  }

  function startOrResumePlayback() {
    if (isRenderMode || !isReady) return;
    if (playState === 'idle' || playState === 'ended') {
      resetAllAudio();
      pausedAtTime = 0;
    }
    playState = 'playing';
    playStartPerf = performance.now();
    if (startOverlay) startOverlay.classList.add('hidden');
    if (endOverlay) endOverlay.classList.add('hidden');
    syncAudioAt(pausedAtTime);
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function getPlayTime() {
    if (playState === 'playing') {
      return clamp(pausedAtTime + (performance.now() - playStartPerf) / 1000, 0, totalDuration);
    }
    if (playState === 'ended') return totalDuration;
    return pausedAtTime;
  }

  // Jump every timeline (visuals, narration, BGM) to time t.
  function seekTo(t, resume) {
    if (isRenderMode || !isReady) return;
    t = clamp(Number(t) || 0, 0, Math.max(0, totalDuration - 0.05));
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    pauseAllAudio();
    for (var i = 0; i < sceneModels.length; i++) {
      var sc = sceneModels[i];
      if (!sc.audioEl) continue;
      var narStart = sc.start + sc.audioOffset;
      var target = (t >= narStart && t < narStart + sc.audioDur) ? (t - narStart) : 0;
      try { sc.audioEl.currentTime = target; } catch (_) {}
    }
    if (bgmAudio) {
      var bd = bgmAudio.duration;
      try { bgmAudio.currentTime = (bd && isFinite(bd) && bd > 0) ? (t % bd) : t; } catch (_) {}
    }
    pausedAtTime = t;
    playStartPerf = performance.now();
    if (playState !== 'playing') playState = 'paused';
    if (startOverlay) startOverlay.classList.add('hidden');
    if (endOverlay) endOverlay.classList.add('hidden');
    if (playBtnLabel) playBtnLabel.textContent = '繼續';
    render(t);
    if (resume) {
      playState = 'paused';
      startOrResumePlayback();
    } else if (playState === 'playing') {
      playState = 'paused';
      updateControls(t);
    }
  }
  window.__seekTo = seekTo;
  window.__audioState = function () {
    var r = sceneModels.filter(function (m) { return m.audioEl && !m.audioEl.paused; })
      .map(function (m) { return [m.index, +m.audioEl.currentTime.toFixed(1), +(m.start + m.audioOffset).toFixed(1)]; });
    return { narr: r, bgm: bgmAudio ? [!bgmAudio.paused, +bgmAudio.currentTime.toFixed(1)] : null };
  };

  function pausePlayback(showOverlay) {
    if (playState !== 'playing') return;
    var now = performance.now();
    pausedAtTime = clamp(pausedAtTime + (now - playStartPerf) / 1000, 0, totalDuration);
    playState = 'paused';
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    pauseAllAudio();
    if (playBtnLabel) playBtnLabel.textContent = '繼續';
    if (startOverlay && showOverlay !== false) startOverlay.classList.remove('hidden');
    updateControls(pausedAtTime);
  }

  function togglePlayback() {
    if (playState === 'playing') pausePlayback(false);
    else startOrResumePlayback();
  }

  function trackTimeFromEvent(e) {
    var rect = ctrlTrack.getBoundingClientRect();
    var x = (e.clientX !== undefined ? e.clientX : 0) - rect.left;
    return clamp(x / Math.max(1, rect.width), 0, 1) * totalDuration;
  }

  function setupControls() {
    if (!controlsEl || isRenderMode) return;
    if (ctrlTot) ctrlTot.textContent = fmtTime(totalDuration);
    if (ctrlTrack) {
      ctrlTrack.setAttribute('aria-valuemax', String(Math.round(totalDuration)));
      var ticks = ctrlTrack.querySelector('.ctrl-ticks');
      if (ticks) {
        ticks.innerHTML = '';
        for (var i = 1; i < sceneModels.length; i++) {
          var tk = document.createElement('span');
          tk.className = 'ctrl-tick' + (sceneModels[i].type === 'verse' || sceneModels[i].type === 'prayer' ? ' tick-key' : '');
          tk.style.left = (sceneModels[i].start / totalDuration * 100).toFixed(3) + '%';
          ticks.appendChild(tk);
        }
      }
    }
    updateControls(currentTime);
  }

  if (!isRenderMode && controlsEl) {
    if (ctrlPlayBtn) {
      ctrlPlayBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!isReady) return;
        togglePlayback();
      });
    }
    if (ctrlTrack) {
      var wasPlaying = false;
      var dragT = 0;
      ctrlTrack.addEventListener('pointerdown', function (e) {
        if (!isReady) return;
        if (e.button !== undefined && e.button > 0) return;
        e.preventDefault();
        isDragging = true;
        wasPlaying = playState === 'playing';
        if (wasPlaying) pausePlayback(false);
        try { ctrlTrack.setPointerCapture(e.pointerId); } catch (_) {}
        controlsEl.classList.add('is-dragging');
        dragT = trackTimeFromEvent(e);
        if (startOverlay) startOverlay.classList.add('hidden');
        if (endOverlay) endOverlay.classList.add('hidden');
        render(dragT);
      });
      ctrlTrack.addEventListener('pointermove', function (e) {
        if (!isDragging) return;
        e.preventDefault();
        dragT = trackTimeFromEvent(e);
        render(dragT);
      });
      var endDrag = function (e) {
        if (!isDragging) return;
        isDragging = false;
        controlsEl.classList.remove('is-dragging');
        if (e && e.clientX !== undefined && e.type === 'pointerup') dragT = trackTimeFromEvent(e);
        seekTo(dragT, wasPlaying);
      };
      ctrlTrack.addEventListener('pointerup', endDrag);
      ctrlTrack.addEventListener('pointercancel', endDrag);
      ctrlTrack.addEventListener('keydown', function (e) {
        if (!isReady) return;
        var step = e.key === 'ArrowRight' ? 5 : (e.key === 'ArrowLeft' ? -5 : 0);
        if (!step) return;
        e.preventDefault();
        seekTo(getPlayTime() + step, playState === 'playing');
      });
    }
    document.addEventListener('keydown', function (e) {
      if (!isReady) return;
      if (e.target && e.target.closest && e.target.closest('input, textarea, a')) return;
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlayback();
      }
    });
  }

  if (!isRenderMode) {
    if (playBtn) {
      playBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        startOrResumePlayback();
      });
    }
    if (startOverlay) {
      startOverlay.addEventListener('click', function (e) {
        e.stopPropagation();
        startOrResumePlayback();
      });
    }
    if (replayBtn) {
      replayBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (playBtnLabel) playBtnLabel.textContent = '播放';
        startOrResumePlayback();
      });
    }
    if (stageEl) {
      stageEl.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('a, button')) return;
        if (playState === 'playing') {
          pausePlayback(true);
        } else if (playState === 'paused') {
          startOrResumePlayback();
        }
      });
    }
  }

  function setupCard(data) {
    var section = document.getElementById('card-section');
    if (!section || isRenderMode) return;
    var img = document.getElementById('card-img');
    var dl = document.getElementById('card-download');
    var src = 'img/card_t' + tractId + '.png';
    var title = (data && data.title) || (FALLBACK_META[tractId] || {}).title || '';
    if (img) {
      img.src = src + '?v=r2';
      var prayer = '';
      (data.scenes || []).forEach(function (s) { if (s && s.type === 'prayer') prayer = s.text || ''; });
      img.alt = '經文：' + ((data && data.verse) || '') + ' ' + ((data && data.verse_ref) || '') + '　禱告：' + prayer;
    }
    if (dl) {
      dl.href = src;
      dl.setAttribute('download', '圖文卡_' + tractId + '_' + title.replace(/[\\/:*?"<>|！—\s]/g, '') + '.png');
    }
    var toCard = document.getElementById('to-card-btn');
    if (toCard) {
      toCard.addEventListener('click', function (e) {
        e.stopPropagation();
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  window.__ready = (function init() {
    var dataUrl = 'data/t' + tractId + '.json';
    return fetch(dataUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch(function () {
        return {};
      })
      .then(function (data) {
        var imagesCfg = (data && data.images) || {};
        var frontSrc = imagesCfg.front || ('img/t' + tractId + '_front.jpg');
        var backSrc = imagesCfg.back || ('img/t' + tractId + '_back.jpg');

        return Promise.all([
          loadFontReady(),
          preloadImage(frontSrc),
          preloadImage(backSrc)
        ]).then(function (results) {
          var loadedImages = {
            front: results[1],
            back: results[2]
          };
          buildScenes(data, loadedImages);
          isReady = true;
          setupControls();
          setupCard(data);

          if (isRenderMode) {
            render(0);
          } else {
            // Show static cover preview at t=1.5 behind the circular play button
            render(Math.min(1.5, totalDuration * 0.5));
            whiteOverlay.style.opacity = '0';
          }
        });
      });
  })();
})();
