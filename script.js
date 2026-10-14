(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const screens = {
    start: $("screen-start"),
    countdown: $("screen-countdown"),
    play: $("screen-play"),
    result: $("screen-result"),
  };

  const els = {
    name: $("player-name"),
    mode: $("mode"),
    duration: $("duration"),
    startBtn: $("start-btn"),
    rankingList: $("ranking-list"),
    rankingLabel: $("ranking-label"),
    clearRanking: $("clear-ranking"),
    countdown: $("countdown"),
    timeLeft: $("time-left"),
    score: $("score"),
    miss: $("miss"),
    combo: $("combo"),
    timebarFill: $("timebar-fill"),
    wordBox: $("word-box"),
    wordDisplay: $("word-display"),
    wordRomaji: $("word-romaji"),
    rankBadge: $("rank-badge"),
    rScore: $("r-score"),
    rKpm: $("r-kpm"),
    rAccuracy: $("r-accuracy"),
    rWords: $("r-words"),
    rCorrect: $("r-correct"),
    rCombo: $("r-combo"),
    newRecord: $("new-record"),
    retryBtn: $("retry-btn"),
    homeBtn: $("home-btn"),
  };

  const MODE_LABELS = {
    english: "英単語",
    japanese: "日本語",
    programming: "プログラミング",
  };
  const RANKING_SIZE = 10;
  const STORAGE_KEY = "typing-speed-ranking-v1";
  const SETTINGS_KEY = "typing-speed-settings-v1";

  let state = "start";
  let game = null;
  let timerId = null;
  let countdownId = null;

  // ---------- 保存まわり（localStorage が使えない環境でも動くように） ----------
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 保存できなくてもゲームは続行 */
    }
  }

  function rankingKey() {
    return `${els.mode.value}-${els.duration.value}`;
  }
  function loadRanking() {
    const all = loadJSON(STORAGE_KEY, {});
    return all[rankingKey()] || [];
  }
  function saveRanking(list) {
    const all = loadJSON(STORAGE_KEY, {});
    all[rankingKey()] = list;
    saveJSON(STORAGE_KEY, all);
  }

  function renderRanking() {
    els.rankingLabel.textContent =
      `（${MODE_LABELS[els.mode.value]} / ${els.duration.value}秒）`;
    const list = loadRanking();
    els.rankingList.innerHTML = "";
    if (list.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "まだ記録がありません。最初の記録を作ろう！";
      els.rankingList.appendChild(li);
      return;
    }
    for (const r of list) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "rank-name";
      name.textContent = r.name;
      const score = document.createElement("span");
      score.className = "rank-score";
      score.textContent = r.score;
      const meta = document.createElement("span");
      meta.className = "rank-meta";
      meta.textContent = `${r.kpm}打/分・${r.accuracy}%`;
      li.append(name, score, meta);
      els.rankingList.appendChild(li);
    }
  }

  // ---------- 画面切り替え ----------
  function show(name) {
    state = name;
    for (const [key, el] of Object.entries(screens)) {
      el.classList.toggle("active", key === name);
    }
  }

  // ---------- ゲーム本体 ----------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function toEntry(word) {
    return typeof word === "string" ? { text: word, input: word } : word;
  }

  function nextWord() {
    if (game.queue.length === 0) {
      game.queue = shuffle(WORDS[game.mode]).map(toEntry);
    }
    game.word = game.queue.pop();
    game.pos = 0;
    renderWord();
  }

  function renderWord() {
    const { text, input } = game.word;
    const isJapanese = text !== input;
    els.wordDisplay.textContent = isJapanese ? text : "";
    els.wordDisplay.hidden = !isJapanese;

    els.wordRomaji.innerHTML = "";
    const typed = document.createElement("span");
    typed.className = "typed";
    typed.textContent = input.slice(0, game.pos);
    const current = document.createElement("span");
    current.className = "current";
    current.textContent = input.slice(game.pos, game.pos + 1);
    const rest = document.createElement("span");
    rest.className = "rest";
    rest.textContent = input.slice(game.pos + 1);
    els.wordRomaji.append(typed, current, rest);
  }

  // スコア = 打鍵/分 × 正確率² （速さと正確さの両方を評価）
  function calcStats(elapsedSec) {
    const total = game.correct + game.miss;
    const accuracy = total === 0 ? 0 : game.correct / total;
    const kpm = elapsedSec > 0 ? (game.correct / elapsedSec) * 60 : 0;
    const score = Math.round(kpm * accuracy * accuracy);
    return {
      kpm: Math.round(kpm),
      accuracy: Math.round(accuracy * 1000) / 10,
      score,
    };
  }

  function updateHud() {
    const elapsed = (performance.now() - game.startTime) / 1000;
    const left = Math.max(0, game.duration - elapsed);
    els.timeLeft.textContent = Math.ceil(left);
    els.timebarFill.style.width = `${(left / game.duration) * 100}%`;
    els.timebarFill.classList.toggle("danger", left <= 10);
    els.score.textContent = game.correct;
    els.miss.textContent = game.miss;
    els.combo.textContent = game.combo;
    return left;
  }

  function tick() {
    if (updateHud() <= 0) finish();
  }

  function startCountdown() {
    saveJSON(SETTINGS_KEY, {
      name: els.name.value,
      mode: els.mode.value,
      duration: els.duration.value,
    });
    game = {
      mode: els.mode.value,
      duration: Number(els.duration.value),
      queue: [],
      word: null,
      pos: 0,
      correct: 0,
      miss: 0,
      combo: 0,
      maxCombo: 0,
      words: 0,
      startTime: 0,
    };
    show("countdown");
    let n = 3;
    els.countdown.textContent = n;
    countdownId = setInterval(() => {
      n -= 1;
      if (n > 0) {
        els.countdown.textContent = n;
      } else {
        clearInterval(countdownId);
        countdownId = null;
        startPlay();
      }
    }, 1000);
  }

  function startPlay() {
    show("play");
    game.startTime = performance.now();
    nextWord();
    updateHud();
    timerId = setInterval(tick, 100);
  }

  function stopTimers() {
    clearInterval(timerId);
    clearInterval(countdownId);
    timerId = null;
    countdownId = null;
  }

  function handleTypingKey(e) {
    if (e.isComposing || e.key === "Process") {
      els.wordDisplay.hidden = false;
      els.wordDisplay.textContent = "⚠️ 半角英数モードに切り替えてください";
      return;
    }
    if (e.key.length !== 1) return; // Shift などの修飾キーは無視
    e.preventDefault();

    const expected = game.word.input[game.pos];
    if (e.key === expected) {
      game.correct += 1;
      game.combo += 1;
      game.maxCombo = Math.max(game.maxCombo, game.combo);
      game.pos += 1;
      if (game.pos >= game.word.input.length) {
        game.words += 1;
        nextWord();
      } else {
        renderWord();
      }
    } else {
      game.miss += 1;
      game.combo = 0;
      els.wordBox.classList.remove("shake");
      void els.wordBox.offsetWidth; // アニメーションを再実行させる
      els.wordBox.classList.add("shake");
    }
    updateHud();
  }

  function rankOf(score) {
    if (score >= 400) return { label: "S", color: "#f59e0b" };
    if (score >= 300) return { label: "A", color: "#ef4444" };
    if (score >= 200) return { label: "B", color: "#4f6df5" };
    if (score >= 100) return { label: "C", color: "#10b981" };
    return { label: "D", color: "#6b7280" };
  }

  function finish() {
    stopTimers();
    const stats = calcStats(game.duration);
    const rank = rankOf(stats.score);

    els.rankBadge.textContent = rank.label;
    els.rankBadge.style.background = rank.color;
    els.rScore.textContent = stats.score;
    els.rKpm.textContent = stats.kpm;
    els.rAccuracy.textContent = `${stats.accuracy}%`;
    els.rWords.textContent = game.words;
    els.rCorrect.textContent = game.correct;
    els.rCombo.textContent = game.maxCombo;

    const name = els.name.value.trim() || "ななし";
    const ranking = loadRanking();
    const best = ranking
      .filter((r) => r.name === name)
      .reduce((m, r) => Math.max(m, r.score), -1);
    els.newRecord.hidden = !(stats.score > best && stats.score > 0);

    if (game.correct > 0) {
      ranking.push({ name, ...stats, date: Date.now() });
      ranking.sort((a, b) => b.score - a.score);
      saveRanking(ranking.slice(0, RANKING_SIZE));
    }
    show("result");
  }

  function goHome() {
    stopTimers();
    renderRanking();
    show("start");
  }

  // ---------- イベント ----------
  document.addEventListener("keydown", (e) => {
    if (state === "play") {
      if (e.key === "Escape") return goHome();
      return handleTypingKey(e);
    }
    if (state === "countdown" && e.key === "Escape") return goHome();
    if (state === "result") {
      if (e.key === " ") { e.preventDefault(); return startCountdown(); }
      if (e.key === "Escape") return goHome();
    }
    if (state === "start" && e.key === " " && document.activeElement !== els.name) {
      e.preventDefault();
      startCountdown();
    }
  });

  els.startBtn.addEventListener("click", startCountdown);
  els.retryBtn.addEventListener("click", startCountdown);
  els.homeBtn.addEventListener("click", goHome);
  els.mode.addEventListener("change", renderRanking);
  els.duration.addEventListener("change", renderRanking);
  els.clearRanking.addEventListener("click", () => {
    if (confirm("このモード・制限時間のランキングを削除しますか？")) {
      saveRanking([]);
      renderRanking();
    }
  });

  // 前回の設定を復元
  const saved = loadJSON(SETTINGS_KEY, null);
  if (saved) {
    els.name.value = saved.name || "";
    if (saved.mode in MODE_LABELS) els.mode.value = saved.mode;
    if (["30", "60", "90"].includes(saved.duration)) els.duration.value = saved.duration;
  }
  renderRanking();
})();
