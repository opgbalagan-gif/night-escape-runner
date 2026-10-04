(() => {
  'use strict';

  const W = 540;
  const H = 960;
  const ROAD = 621;
  const HERO_X = 180;
  const HERO_W = 98;
  const HERO_H = 184;
  const GRAVITY = 1640;
  const JUMP_VELOCITY = -590;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = W;
  skyCanvas.height = 370;
  const skyCtx = skyCanvas.getContext('2d');
  const ui = {
    coins: document.getElementById('coins'),
    distance: document.getElementById('distance'),
    hearts: document.getElementById('hearts'),
    chaseFill: document.getElementById('chaseFill'),
    toast: document.getElementById('toast'),
    intro: document.getElementById('introScreen'),
    pause: document.getElementById('pauseScreen'),
    end: document.getElementById('endScreen'),
    start: document.getElementById('startBtn'),
    resume: document.getElementById('resumeBtn'),
    retry: document.getElementById('retryBtn'),
    restartFromPause: document.getElementById('restartFromPauseBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    soundBtn: document.getElementById('soundBtn'),
    jumpBtn: document.getElementById('jumpBtn'),
    introCircle: document.getElementById('introCircle'),
    skipIntroBtn: document.getElementById('skipIntroBtn'),
    caughtMeme: document.getElementById('caughtMeme'),
    caughtMemeImage: document.getElementById('caughtMemeImage'),
    defeatVideo: document.getElementById('defeatVideo'),
    skipBtn: document.getElementById('skipBtn'),
    finalDistance: document.getElementById('finalDistance'),
    finalCoins: document.getElementById('finalCoins'),
    bestDistance: document.getElementById('bestDistance'),
    introLeaderboardBtn: document.getElementById('introLeaderboardBtn'),
    endLeaderboardBtn: document.getElementById('endLeaderboardBtn'),
    leaderboardScreen: document.getElementById('leaderboardScreen'),
    leaderboardList: document.getElementById('leaderboardList'),
    closeLeaderboardBtn: document.getElementById('closeLeaderboardBtn'),
    scoreForm: document.getElementById('scoreForm'),
    playerName: document.getElementById('playerName'),
    scoreHint: document.getElementById('scoreHint')
  };

  const images = {};
  const imageFiles = {
    background: 'assets/coast-night.png',
    run: 'assets/hero-run.png',
    idle: 'assets/hero-idle.png',
    pursuer: 'assets/pursuer.png',
    crate: 'assets/obstacle-crate.png',
    cone: 'assets/obstacle-cone.png'
  };
  let ready = false;
  let mode = 'intro';
  let muted = false;
  let audioContext;
  let lastFrame = performance.now();
  let toastTimer;
  let cutsceneTimer;
  let best = readBest();
  let leaderboard = readLeaderboard();
  let leaderboardOpen = false;
  let leaderboardReturnFocus = null;
  let currentRunId = null;
  let game;
  let lastMeme = '';
  const caughtMemes = ['end.png', 'stop.png', 'reaction.png'];

  class VoiceBank {
    constructor() {
      this.files = {};
      this.lastFile = '';
      this.lastPlayed = -Infinity;
      this.categoryTime = {};
      this.current = null;
      fetch('audio/voice/manifest.json')
        .then(response => response.ok ? response.json() : null)
        .then(data => { if (data?.clips) this.files = data.clips; })
        .catch(() => {});
    }

    play(category, cooldown = 9000, priority = false) {
      if (muted || !this.files[category]?.length) return;
      const now = performance.now();
      if (!priority && now - this.lastPlayed < 8000) return;
      if (now - (this.categoryTime[category] ?? -Infinity) < cooldown) return;
      if (this.current && !this.current.paused) {
        if (!priority) return;
        this.current.pause();
      }
      const choices = this.files[category].filter(file => file !== this.lastFile);
      const file = choices[Math.floor(Math.random() * choices.length)];
      if (!file) return;
      this.current = new Audio(file);
      this.current.volume = .78;
      this.current.play().catch(() => {});
      this.lastFile = file;
      this.lastPlayed = now;
      this.categoryTime[category] = now;
    }
  }
  const voice = new VoiceBank();

  function readBest() {
    try { return Number(localStorage.getItem('nightRunnerBest')) || 0; }
    catch { return 0; }
  }

  function saveBest(value) {
    try { localStorage.setItem('nightRunnerBest', String(value)); }
    catch { /* Private browsing may disable storage. */ }
  }

  function readLeaderboard() {
    try {
      const rows = JSON.parse(localStorage.getItem('nightRunnerScoresV2') || '[]');
      if (!Array.isArray(rows)) return [];
      return rows.filter(row => row && typeof row.name === 'string' && Number.isFinite(row.distance) && row.distance >= 0)
        .map(row => ({ id: String(row.id), name: row.name.slice(0, 14), distance: Math.floor(row.distance), coins: Math.max(0, Math.floor(Number(row.coins) || 0)) }))
        .sort((a, b) => b.distance - a.distance || b.coins - a.coins)
        .slice(0, 10);
    } catch { return []; }
  }

  function persistLeaderboard() {
    try { localStorage.setItem('nightRunnerScoresV2', JSON.stringify(leaderboard)); }
    catch { /* Play remains available if storage is disabled. */ }
  }

  function addOrUpdateScore(name) {
    if (!currentRunId) return;
    const safeName = name.trim().replace(/\s+/g, ' ').slice(0, 14) || 'Игрок';
    leaderboard = leaderboard.filter(row => row.id !== currentRunId);
    leaderboard.push({ id: currentRunId, name: safeName, distance: Math.floor(game.distance), coins: game.coins });
    leaderboard.sort((a, b) => b.distance - a.distance || b.coins - a.coins);
    leaderboard = leaderboard.slice(0, 10);
    persistLeaderboard();
    try { localStorage.setItem('nightRunnerScoreNameV2', safeName); } catch {}
    ui.scoreHint.textContent = leaderboard.some(row => row.id === currentRunId) ? 'Результат в таблице' : 'Результат ниже первой десятки';
    renderLeaderboard();
  }

  function renderLeaderboard() {
    ui.leaderboardList.replaceChildren();
    if (!leaderboard.length) {
      const empty = document.createElement('li');
      empty.className = 'leaderboard-empty';
      empty.textContent = 'Пока нет забегов. Стань первым!';
      ui.leaderboardList.append(empty);
      return;
    }
    leaderboard.forEach((row, index) => {
      const item = document.createElement('li');
      if (row.id === currentRunId && mode === 'over') item.className = 'current-score';
      const rank = document.createElement('span');
      rank.textContent = `${index + 1}.`;
      const name = document.createElement('strong');
      name.textContent = row.name;
      const score = document.createElement('span');
      score.textContent = `${row.distance} м`;
      item.append(rank, name, score);
      ui.leaderboardList.append(item);
    });
  }

  function openLeaderboard(event) {
    leaderboardReturnFocus = event.currentTarget;
    leaderboardOpen = true;
    renderLeaderboard();
    ui.leaderboardScreen.hidden = false;
    ui.closeLeaderboardBtn.focus();
  }

  function closeLeaderboard() {
    leaderboardOpen = false;
    ui.leaderboardScreen.hidden = true;
    leaderboardReturnFocus?.focus();
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
      image.src = src;
    });
  }

  Promise.all(Object.entries(imageFiles).map(async ([key, src]) => {
    images[key] = await loadImage(src);
  })).then(() => {
    ready = true;
    ui.start.disabled = false;
    ui.start.textContent = 'Смотреть вступление';
  }).catch(error => {
    ui.start.textContent = 'Ошибка загрузки';
    ui.intro.querySelector('p').textContent = error.message + '. Проверьте файлы assets.';
  });

  function freshGame() {
    return {
      time: 0,
      distance: 0,
      coins: 0,
      streak: 0,
      lastCoinTime: -100,
      lives: 3,
      threat: 0,
      speed: 275,
      nextSpeedMark: 350,
      spawnIn: 1.25,
      items: [],
      particles: [],
      player: { y: 0, vy: 0, grounded: true, invulnerable: 0 },
      shake: 0,
      flash: 0,
      nearWarning: false
    };
  }

  game = freshGame();

  function playIntro() {
    if (!ready || mode !== 'intro') return;
    mode = 'intro_video';
    ui.start.disabled = true;
    ui.start.textContent = 'Вступление…';
    ui.skipIntroBtn.hidden = false;
    ui.introCircle.currentTime = 0;
    ui.introCircle.muted = muted;
    ui.introCircle.play().catch(startGame);
  }

  function startGame() {
    if (!ready) return;
    unlockAudio();
    clearTimeout(cutsceneTimer);
    clearTimeout(toastTimer);
    ui.toast.classList.remove('visible');
    ui.toast.textContent = '';
    ui.introCircle.pause();
    ui.skipIntroBtn.hidden = true;
    ui.start.disabled = false;
    ui.start.textContent = 'Смотреть вступление';
    ui.caughtMeme.hidden = true;
    ui.defeatVideo.pause();
    ui.defeatVideo.hidden = true;
    ui.skipBtn.hidden = true;
    ui.intro.hidden = true;
    ui.pause.hidden = true;
    ui.end.hidden = true;
    ui.leaderboardScreen.hidden = true;
    leaderboardOpen = false;
    currentRunId = null;
    ui.jumpBtn.hidden = false;
    ui.pauseBtn.hidden = false;
    game = freshGame();
    mode = 'playing';
    syncHud();
    canvas.focus({ preventScroll: true });
  }

  function togglePause() {
    if (mode === 'playing') {
      mode = 'paused';
      ui.pause.hidden = false;
      ui.jumpBtn.hidden = true;
      ui.resume.focus();
    } else if (mode === 'paused') {
      mode = 'playing';
      ui.pause.hidden = true;
      ui.jumpBtn.hidden = false;
      canvas.focus({ preventScroll: true });
    }
  }

  function jump() {
    if (mode !== 'playing' || !game.player.grounded) return;
    unlockAudio();
    game.player.grounded = false;
    game.player.vy = JUMP_VELOCITY;
    game.player.y = -1;
    burst(HERO_X + 43, ROAD - 5, '#c8a579', 9);
    sound('jump');
    if (Math.random() < .22) voice.play('jump');
  }

  function spawnWave() {
    const cone = Math.random() < .27;
    const obstacle = {
      kind: 'obstacle',
      shape: cone ? 'cone' : 'crate',
      x: W + 44,
      y: ROAD - (cone ? 49 : 45),
      w: cone ? 44 : 68,
      h: cone ? 49 : 45,
      hit: false
    };
    game.items.push(obstacle);
    if (Math.random() < .82) {
      for (let i = 0; i < 5; i++) {
        game.items.push({
          kind: 'coin',
          x: obstacle.x + 14 + i * 34,
          y: ROAD - 136 - Math.sin(i / 4 * Math.PI) * 19,
          r: 12,
          taken: false,
          phase: Math.random() * Math.PI * 2
        });
      }
    }
  }

  function update(dt) {
    const g = game;
    g.time += dt;
    g.speed = Math.min(430, 275 + g.time * 3.8);
    g.distance += g.speed * dt * .065;
    g.player.invulnerable = Math.max(0, g.player.invulnerable - dt);
    g.shake = Math.max(0, g.shake - dt * 2.5);
    g.flash = Math.max(0, g.flash - dt * 2.3);
    if (g.time - g.lastCoinTime > 4) g.streak = 0;

    if (!g.player.grounded) {
      g.player.vy += GRAVITY * dt;
      g.player.y += g.player.vy * dt;
      if (g.player.y >= 0) {
        g.player.y = 0;
        g.player.vy = 0;
        g.player.grounded = true;
        burst(HERO_X + 52, ROAD - 4, '#d9c4a0', 7);
      }
    }

    g.spawnIn -= dt;
    if (g.spawnIn <= 0) {
      spawnWave();
      g.spawnIn = Math.max(1.15, 1.65 + Math.random() * .48 - g.time * .006);
    }

    const pickupX = HERO_X + 53;
    const pickupY = ROAD - 86 + g.player.y;
    for (const item of g.items) {
      item.x -= g.speed * dt;
      if (item.kind === 'coin') {
        item.phase += dt * 7;
        if (!item.taken && Math.hypot(item.x - pickupX, item.y - pickupY) < 35) {
          item.taken = true;
          collectCoin(item);
        }
      } else if (!item.hit && g.player.invulnerable <= 0) {
        const horizontal = HERO_X + 73 > item.x + 8 && HERO_X + 28 < item.x + item.w - 8;
        const footTouchesObstacle = ROAD + g.player.y > item.y + 8;
        if (horizontal && footTouchesObstacle) {
          item.hit = true;
          hitObstacle();
          if (mode !== 'playing') break;
        }
      }
    }
    g.items = g.items.filter(item => item.x > -95 && !item.taken);
    g.particles = g.particles.filter(p => p.life > 0);
    for (const p of g.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 210 * dt;
      p.life -= dt;
    }
    if (g.player.grounded && Math.random() < dt * 13) {
      g.particles.push({ x: HERO_X + 23, y: ROAD - 3, vx: -40 - Math.random() * 55, vy: -15 - Math.random() * 45, life: .3 + Math.random() * .25, maxLife: .55, size: 2 + Math.random() * 4, color: '#c8b29a' });
    }

    if (g.threat >= .72 && !g.nearWarning) {
      g.nearWarning = true;
      toast('Они близко!');
      voice.play('near_caught', 15000);
    }
    if (g.threat < .5) g.nearWarning = false;
    if (g.distance >= g.nextSpeedMark) {
      g.nextSpeedMark += 350;
      toast('Скорость растёт!');
      voice.play('run', 20000);
    }
    syncHud();
  }

  function collectCoin(item) {
    game.coins++;
    game.streak++;
    game.lastCoinTime = game.time;
    burst(item.x, item.y, '#ffdc73', 7);
    sound('coin');
    if (game.streak === 5) {
      toast('Серия монет ×5');
      voice.play('coin', 12000);
    }
  }

  function hitObstacle() {
    game.lives--;
    game.streak = 0;
    game.threat = Math.min(1, game.threat + .36);
    game.player.invulnerable = 1.5;
    game.shake = .7;
    game.flash = .55;
    burst(HERO_X + 72, ROAD - 30 + game.player.y, '#ffc27f', 13);
    sound('hit');
    voice.play('hit', 4000, true);
    if (game.lives <= 0 || game.threat >= 1) {
      beginCaught();
    } else {
      toast('Осторожно!');
    }
  }

  function beginCaught() {
    mode = 'cutscene';
    ui.jumpBtn.hidden = true;
    ui.pauseBtn.hidden = true;
    const choices = caughtMemes.filter(name => name !== lastMeme);
    lastMeme = choices[Math.floor(Math.random() * choices.length)];
    ui.caughtMemeImage.src = `media/public/memes/${lastMeme}`;
    ui.caughtMeme.hidden = false;
    ui.caughtMemeImage.style.animation = 'none';
    void ui.caughtMemeImage.offsetWidth;
    ui.caughtMemeImage.style.animation = '';
    ui.skipBtn.hidden = false;
    voice.play('caught', 0, true);
    cutsceneTimer = setTimeout(showEnd, 2900);
  }

  function showEnd() {
    if (mode === 'over') return;
    clearTimeout(cutsceneTimer);
    mode = 'over';
    ui.caughtMeme.hidden = true;
    ui.skipBtn.hidden = true;
    ui.defeatVideo.hidden = false;
    ui.defeatVideo.currentTime = 0;
    ui.defeatVideo.play().catch(() => {});
    ui.end.hidden = false;
    ui.finalDistance.textContent = `${Math.floor(game.distance)} м`;
    ui.finalCoins.textContent = String(game.coins);
    best = Math.max(best, Math.floor(game.distance));
    saveBest(best);
    ui.bestDistance.textContent = `${best} м`;
    currentRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try { ui.playerName.value = localStorage.getItem('nightRunnerScoreNameV2') || 'Игрок'; }
    catch { ui.playerName.value = 'Игрок'; }
    addOrUpdateScore(ui.playerName.value);
    voice.play('game_over', 0, true);
    ui.retry.focus();
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const life = .35 + Math.random() * .42;
      game.particles.push({ x, y, vx: (Math.random() - .5) * 170, vy: -30 - Math.random() * 155, life, maxLife: life, size: 2 + Math.random() * 5, color });
    }
  }

  function toast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 1450);
  }

  function syncHud() {
    ui.coins.textContent = String(game.coins);
    ui.distance.textContent = `${Math.floor(game.distance)} м`;
    ui.hearts.textContent = Array.from({ length: 3 }, (_, i) => i < game.lives ? '♥' : '♡').join(' ');
    ui.hearts.setAttribute('aria-label', `${game.lives} из 3 попыток`);
    ui.chaseFill.style.width = `${Math.round(game.threat * 100)}%`;
  }

  function unlockAudio() {
    if (muted) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
    } catch { /* The game remains playable without audio. */ }
  }

  function sound(kind) {
    if (muted || !audioContext) return;
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain).connect(audioContext.destination);
    const settings = {
      jump: [340, 580, .16, 'sine'],
      coin: [710, 1040, .12, 'triangle'],
      hit: [200, 75, .24, 'sawtooth']
    }[kind];
    if (!settings) return;
    const [from, to, duration, wave] = settings;
    osc.type = wave;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === 'hit' ? .08 : .055, now + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    osc.start(now);
    osc.stop(now + duration + .02);
  }

  function drawScrollingSlice(top, height, offset) {
    const image = images.background;
    const sourceY = top / H * image.height;
    const sourceHeight = height / H * image.height;
    const tileIndex = Math.floor(offset / W);
    const phase = offset % W;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, W, height);
    ctx.clip();
    for (let i = -1; i <= 2; i++) {
      const x = i * W - phase;
      if ((tileIndex + i) % 2 === 0) {
        ctx.drawImage(image, 0, sourceY, image.width, sourceHeight, x, top, W, height);
      } else {
        ctx.save();
        ctx.translate(x + W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(image, 0, sourceY, image.width, sourceHeight, 0, top, W, height);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawBackground() {
    if (images.background) {
      drawScrollingSlice(0, ROAD, game.distance * 2.6);
      const skyPan = 35 + Math.sin(game.distance * .018) * 28;
      skyCtx.clearRect(0, 0, W, 370);
      skyCtx.drawImage(images.background, 0, 0, images.background.width, images.background.height * 370 / H, -skyPan, 0, W + 70, 370);
      skyCtx.globalCompositeOperation = 'destination-in';
      const skyFade = skyCtx.createLinearGradient(0, 275, 0, 370);
      skyFade.addColorStop(0, '#000');
      skyFade.addColorStop(1, '#0000');
      skyCtx.fillStyle = skyFade;
      skyCtx.fillRect(0, 0, W, 370);
      skyCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(skyCanvas, 0, 0);
      drawScrollingSlice(ROAD, H - ROAD, game.distance * 14.5);
    } else {
      ctx.fillStyle = '#091b2b'; ctx.fillRect(0, 0, W, H);
    }

    // Cobblestones travel with the road while the coast drifts more slowly.
    const offset = (game.distance * 14.5) % 66;
    ctx.fillStyle = 'rgba(18, 22, 31, .28)';
    for (let x = -70 - offset; x < W + 70; x += 66) {
      ctx.beginPath();
      ctx.moveTo(x + 9, ROAD + 2);
      ctx.lineTo(x + 53, ROAD + 2);
      ctx.lineTo(x + 47, ROAD + 11);
      ctx.lineTo(x + 4, ROAD + 11);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 195, 100, .55)';
    ctx.fillRect(0, ROAD - 10, W, 2);
  }

  function drawPursuers() {
    const image = images.pursuer;
    if (!image) return;
    const fallBehind = Math.min(90, game.time * 16);
    const close = game.threat * 123;
    for (let i = 2; i >= 0; i--) {
      const x = HERO_X - 70 - fallBehind + close - i * 29;
      const bob = mode === 'playing' ? Math.sin(game.time * 13 + i * 1.7) * 3 : 0;
      if (x + 77 < -10) continue;
      ctx.save();
      ctx.globalAlpha = .82 + (2 - i) * .06;
      if (mode === 'playing') {
        ctx.globalAlpha = .55;
        ctx.fillStyle = '#ddc9aa';
        ctx.beginPath();
        ctx.arc(x + 11, ROAD - 3, 9, 0, Math.PI * 2);
        ctx.arc(x + 23, ROAD - 9, 12, 0, Math.PI * 2);
        ctx.arc(x + 36, ROAD - 3, 8, 0, Math.PI * 2);
        ctx.fill();
        const pulse = (game.time * 4.5 + i * .37) % 1;
        for (let j = 0; j < 3; j++) {
          const age = (pulse + j / 3) % 1;
          ctx.globalAlpha = (.62 + (2 - i) * .04) * (1 - age * .82);
          ctx.fillStyle = j === 1 ? '#eed7b0' : '#c5b5a0';
          ctx.beginPath();
          ctx.ellipse(x + 21 - age * 34 - j * 5, ROAD - 4 - age * 17, 10 + age * 12, 6 + age * 7, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = .82 + (2 - i) * .06;
      ctx.drawImage(image, 57, 53, 918, 1205, x, ROAD - 115 + bob, 77, 115);
      ctx.restore();
    }
  }

  function drawHero() {
    const p = game.player;
    const idle = mode === 'intro' || mode === 'paused';
    ctx.save();
    if (p.invulnerable > 0 && Math.floor(game.time * 14) % 2 === 0) ctx.globalAlpha = .45;
    ctx.fillStyle = `rgba(0, 0, 0, ${p.grounded ? .34 : .15})`;
    ctx.beginPath();
    ctx.ellipse(HERO_X + HERO_W / 2, ROAD + 3, p.grounded ? 43 : 30, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (idle && images.idle) {
      ctx.drawImage(images.idle, 0, 0, 1360, 2048, HERO_X, ROAD - HERO_H + p.y, HERO_W, HERO_H);
    } else if (images.run) {
      const frame = p.grounded ? Math.floor(game.time * 10) % 6 : 2;
      ctx.drawImage(images.run, frame * 362, 20, 362, 690, HERO_X, ROAD - HERO_H + p.y, HERO_W, HERO_H);
    }
    ctx.restore();
  }

  function drawCoin(item) {
    ctx.save();
    ctx.translate(item.x, item.y);
    const width = 8 + 4 * Math.abs(Math.cos(item.phase));
    ctx.shadowColor = '#ffcc56';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#b86a0d';
    ctx.beginPath(); ctx.ellipse(0, 0, width + 3, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffce4d';
    ctx.beginPath(); ctx.ellipse(0, 0, width, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff5b1'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, Math.max(3, width - 4), 8, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff2a4';
    ctx.beginPath(); ctx.arc(-2, -4, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawCrate(item) {
    const { x, y, w, h } = item;
    if (images.crate) {
      ctx.drawImage(images.crate, 110, 200, 1320, 645, x - 2, y - 2, w + 4, h + 4);
      return;
    }
    ctx.save();
    ctx.fillStyle = '#1a1620';
    ctx.fillRect(x - 2, y + 3, w + 4, h + 1);
    ctx.fillStyle = '#694227';
    ctx.fillRect(x + 2, y + 1, w - 4, h - 2);
    ctx.fillStyle = '#9d6538';
    ctx.fillRect(x + 6, y + 5, w - 12, h - 10);
    ctx.strokeStyle = '#2d201c';
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 4, y + 3, w - 8, h - 6);
    ctx.beginPath(); ctx.moveTo(x + 7, y + 7); ctx.lineTo(x + w - 8, y + h - 8); ctx.stroke();
    ctx.strokeStyle = '#d49a5d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 11, y + 9); ctx.lineTo(x + w - 11, y + h - 10); ctx.stroke();
    ctx.fillStyle = '#d2a977';
    for (const dx of [8, w - 9]) for (const dy of [8, h - 9]) ctx.fillRect(x + dx, y + dy, 3, 3);
    ctx.restore();
  }

  function drawCone(item) {
    const { x, y, w, h } = item;
    if (images.cone) {
      ctx.drawImage(images.cone, 130, 45, 1000, 1170, x - 1, y - 1, w + 2, h + 2);
      return;
    }
    ctx.save();
    ctx.fillStyle = '#171b23'; ctx.fillRect(x - 2, y + h - 8, w + 4, 8);
    ctx.fillStyle = '#e77735';
    ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w - 5, y + h - 7); ctx.lineTo(x + 5, y + h - 7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1e2026'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff0cf'; ctx.beginPath(); ctx.moveTo(x + 14, y + h * .58); ctx.lineTo(x + w - 14, y + h * .58); ctx.lineTo(x + w - 10, y + h * .76); ctx.lineTo(x + 10, y + h * .76); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawItems() {
    for (const item of game.items) {
      if (item.kind === 'coin') drawCoin(item);
      else if (item.shape === 'cone') drawCone(item);
      else drawCrate(item);
    }
  }

  function drawParticles() {
    for (const p of game.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (game.shake > 0) ctx.translate((Math.random() - .5) * game.shake * 9, (Math.random() - .5) * game.shake * 7);
    drawBackground();
    drawPursuers();
    drawItems();
    drawHero();
    drawParticles();
    ctx.restore();
    if (game.flash > 0) {
      ctx.fillStyle = `rgba(255, 150, 125, ${game.flash * .27})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function loop(now) {
    const dt = Math.min((now - lastFrame) / 1000, .033);
    lastFrame = now;
    if (mode === 'playing') update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  ui.start.addEventListener('click', playIntro);
  ui.skipIntroBtn.addEventListener('click', startGame);
  ui.introCircle.addEventListener('ended', startGame);
  ui.retry.addEventListener('click', startGame);
  ui.introLeaderboardBtn.addEventListener('click', openLeaderboard);
  ui.endLeaderboardBtn.addEventListener('click', openLeaderboard);
  ui.closeLeaderboardBtn.addEventListener('click', closeLeaderboard);
  ui.scoreForm.addEventListener('submit', event => {
    event.preventDefault();
    if (mode === 'over') addOrUpdateScore(ui.playerName.value);
  });
  ui.restartFromPause.addEventListener('click', startGame);
  ui.resume.addEventListener('click', togglePause);
  ui.pauseBtn.addEventListener('click', togglePause);
  ui.jumpBtn.addEventListener('pointerdown', event => { event.preventDefault(); event.stopPropagation(); jump(); });
  canvas.addEventListener('pointerdown', event => { event.preventDefault(); if (mode === 'playing') jump(); });
  ui.skipBtn.addEventListener('click', showEnd);
  ui.soundBtn.addEventListener('click', () => {
    muted = !muted;
    ui.soundBtn.textContent = muted ? '♪̸' : '♪';
    ui.soundBtn.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
    if (muted && voice.current) voice.current.pause();
    ui.introCircle.muted = muted;
    if (!muted) unlockAudio();
  });
  window.addEventListener('keydown', event => {
    if (leaderboardOpen) {
      if (event.code === 'Escape') { event.preventDefault(); closeLeaderboard(); }
      return;
    }
    if (event.target instanceof HTMLInputElement) return;
    if (event.target instanceof HTMLElement && event.target.closest('button')) return;
    if (['Space', 'ArrowUp', 'KeyW'].includes(event.code)) {
      event.preventDefault();
      if (mode === 'playing') jump();
      else if (mode === 'intro' && ready) playIntro();
      else if (mode === 'intro_video') startGame();
      else if (mode === 'over' && ready) startGame();
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      event.preventDefault();
      togglePause();
    } else if (event.code === 'Enter' && ready) {
      if (mode === 'intro') playIntro();
      else if (mode === 'intro_video' || mode === 'over') startGame();
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') togglePause(); });

  syncHud();
  requestAnimationFrame(loop);
})();
