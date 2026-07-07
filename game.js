const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const gameShell = document.querySelector(".game-shell");
const collectedEl = document.querySelector("#collected");
const totalEl = document.querySelector("#total");
const dangerEl = document.querySelector("#danger");
const stageEl = document.querySelector("#stage");
const messageEl = document.querySelector("#message");
const soundButton = document.querySelector("#sound");
const restartButton = document.querySelector("#restart");
const digButton = document.querySelector("#dig");
const moveButtons = document.querySelectorAll(".move");

const cols = 12;
const rows = 8;
const tile = 80;
const digSeconds = 0.72;
const characterDigRadius = 58;
const maxStage = 5;
const bossStage = 5;

const stageSettings = [
  { vegetables: 8, enemies: 2, speedScale: 0.82, alertRange: 135, grace: 2.4 },
  { vegetables: 10, enemies: 2, speedScale: 0.96, alertRange: 150, grace: 2.2 },
  { vegetables: 12, enemies: 3, speedScale: 1.08, alertRange: 165, grace: 2 },
  { vegetables: 14, enemies: 3, speedScale: 1.2, alertRange: 180, grace: 1.8 },
  { vegetables: 0, enemies: 2, speedScale: 1.24, alertRange: 185, grace: 2, bombs: 5, bossHp: 3 },
];

const keys = new Set();
let vegetables = [];
let dirtPuffs = [];
let enemies = [];
let bombs = [];
let bombShots = [];
let boss = null;
let player;
let collected = 0;
let currentStage = 1;
let stageGoal = stageSettings[0].vegetables;
let heldBombs = 0;
let state = "title";
let lastTime = 0;
let message = "";
let digTarget = null;
let digProgress = 0;
let digHeld = false;
let emptyDigCooldown = 0;
let dangerLevel = "低";
let graceTime = 0;
let difficulty = "NORMAL";
let audioCtx = null;
let masterGain = null;
let musicGain = null;
let sfxGain = null;
let bgmTimer = null;
let bgmStep = 0;
let soundEnabled = true;
let digSoundCooldown = 0;
let swipeControl = {
  active: false,
  pointerId: null,
  targetX: 0,
  targetY: 0,
};
let characterDigControl = {
  active: false,
  pointerId: null,
};
let lastHudTouchActivation = 0;
let stageClearReleaseRequired = false;
let stageClearUnlockAt = 0;

const difficultySettings = {
  EASY: { speedScale: 0.78, label: "EASY" },
  NORMAL: { speedScale: 1, label: "NORMAL" },
  HARD: { speedScale: 1.26, label: "HARD" },
};

const vegTypes = [
  { name: "carrot", top: "#34984f", body: "#f36f2b" },
  { name: "turnip", top: "#4aa95a", body: "#f7eee9" },
  { name: "radish", top: "#357f47", body: "#dc4052" },
  { name: "potato", top: "#b7a060", body: "#b9824a" },
];

function initAudio() {
  if (!soundEnabled) return;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    musicGain = audioCtx.createGain();
    sfxGain = audioCtx.createGain();
    masterGain.gain.value = 0.5;
    musicGain.gain.value = 0.16;
    sfxGain.gain.value = 0.42;
    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function setSoundEnabled(enabled) {
  soundEnabled = enabled;
  if (!soundEnabled) {
    stopBgm();
    if (masterGain) masterGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
  } else {
    initAudio();
    if (masterGain) masterGain.gain.setTargetAtTime(0.5, audioCtx.currentTime, 0.02);
    if (state === "playing") startBgm();
    playTone(660, 0.06, "square", 0.22);
  }
  updateHud();
}

function playTone(freq, duration, type = "sine", volume = 0.3, delay = 0) {
  if (!soundEnabled) return;
  initAudio();
  const now = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function startBgm() {
  if (!soundEnabled || bgmTimer) return;
  initAudio();
  const notes = [392, 494, 587, 494, 440, 523, 659, 523];
  bgmTimer = window.setInterval(() => {
    if (!soundEnabled || state !== "playing") return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(notes[bgmStep % notes.length], now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(now);
    osc.stop(now + 0.2);
    bgmStep += 1;
  }, 230);
}

function stopBgm() {
  if (!bgmTimer) return;
  window.clearInterval(bgmTimer);
  bgmTimer = null;
}

function playStartSound() {
  playTone(523, 0.08, "square", 0.22, 0);
  playTone(659, 0.08, "square", 0.22, 0.08);
  playTone(784, 0.12, "square", 0.24, 0.16);
}

function playDigSound() {
  playTone(140 + Math.random() * 35, 0.045, "sawtooth", 0.16);
}

function playEmptyDigSound() {
  playTone(110, 0.07, "triangle", 0.18);
}

function playCollectSound() {
  playTone(659, 0.08, "square", 0.22, 0);
  playTone(880, 0.1, "square", 0.22, 0.07);
}

function playWinSound() {
  [523, 659, 784, 1046].forEach((note, index) => playTone(note, 0.16, "triangle", 0.24, index * 0.11));
}

function playStageClearSound() {
  [440, 554, 659].forEach((note, index) => playTone(note, 0.12, "triangle", 0.22, index * 0.09));
}

function playLoseSound() {
  [330, 247, 196].forEach((note, index) => playTone(note, 0.16, "sawtooth", 0.2, index * 0.13));
}

function resetGame() {
  initAudio();
  playStartSound();
  startBgm();
  currentStage = 1;
  startStage(currentStage);
}

function startStage(stageNumber) {
  const settings = currentStageSettings();
  startBgm();
  player = {
    x: tile * 1.5,
    y: tile * 4.5,
    radius: 23,
    speed: 245,
    facing: { x: 1, y: 0 },
  };
  vegetables = [];
  bombs = [];
  bombShots = [];
  boss = stageNumber === bossStage ? createBoss() : null;
  dirtPuffs = [];
  enemies = createEnemies();
  collected = 0;
  heldBombs = 0;
  stageGoal = settings.vegetables;
  state = "playing";
  message = stageNumber === bossStage ? "爆弾を掘ってボスに投げろ" : `STAGE ${stageNumber}: 野菜を全部掘り出せ`;
  lastTime = 0;
  digTarget = null;
  digProgress = 0;
  digHeld = false;
  emptyDigCooldown = 0;
  digSoundCooldown = 0;
  stopSwipeControl();
  stopCharacterDigControl();
  dangerLevel = "低";
  graceTime = settings.grace;
  if (stageNumber === bossStage) placeBombs();
  else placeVegetables(settings.vegetables);
  updateHud();
}

function returnToTitle() {
  keys.clear();
  digHeld = false;
  digTarget = null;
  digProgress = 0;
  emptyDigCooldown = 0;
  digSoundCooldown = 0;
  stopSwipeControl();
  stopCharacterDigControl();
  state = "title";
  setupTitle();
}

function setupTitle() {
  stopBgm();
  currentStage = 1;
  player = {
    x: tile * 1.5,
    y: tile * 4.5,
    radius: 23,
    speed: 245,
    facing: { x: 1, y: 0 },
  };
  vegetables = [
    { c: 2, r: 1, type: vegTypes[0], found: false, wiggle: 0.4 },
    { c: 4, r: 3, type: vegTypes[1], found: false, wiggle: 1.4 },
    { c: 7, r: 2, type: vegTypes[2], found: false, wiggle: 2.4 },
    { c: 9, r: 5, type: vegTypes[3], found: false, wiggle: 3.4 },
  ];
  enemies = createEnemies();
  bombs = [];
  bombShots = [];
  boss = null;
  collected = 0;
  heldBombs = 0;
  stageGoal = stageSettings[0].vegetables;
  dangerLevel = "低";
  message = "クリックでスタート";
  updateHud();
}

function currentStageSettings() {
  return stageSettings[currentStage - 1];
}

function createEnemies() {
  const settings = currentStageSettings();
  const enemyTemplates = [
    makeEnemy(10.4, 1.2, 126, [
      [10.4, 1.2],
      [6.8, 1.2],
      [6.8, 3.4],
      [10.2, 3.4],
    ]),
    makeEnemy(9.5, 6.5, 116, [
      [9.5, 6.5],
      [4.8, 6.5],
      [4.8, 4.7],
      [9.0, 4.7],
    ]),
    makeEnemy(3.6, 1.4, 108, [
      [3.6, 1.4],
      [1.4, 1.4],
      [1.4, 6.4],
      [3.6, 6.4],
    ]),
  ];
  return enemyTemplates.slice(0, settings.enemies);
}

function makeEnemy(c, r, speed, path) {
  const settings = currentStageSettings();
  return {
    x: c * tile,
    y: r * tile,
    radius: 25,
    baseSpeed: speed,
    speed: speed * settings.speedScale * difficultySettings[difficulty].speedScale,
    path: path.map(([pc, pr]) => ({ x: pc * tile, y: pr * tile })),
    targetIndex: 1,
    wobble: Math.random() * Math.PI * 2,
    alert: false,
    facing: { x: -1, y: 0 },
  };
}

function createBoss() {
  return {
    x: tile * 9.7,
    y: tile * 3.8,
    radius: 46,
    hp: currentStageSettings().bossHp,
    maxHp: currentStageSettings().bossHp,
    speed: 92 * difficultySettings[difficulty].speedScale,
    chargeCooldown: 1.2,
    stun: 0,
    facing: { x: -1, y: 0 },
    wobble: 0,
  };
}

function placeVegetables(goal) {
  const reserved = new Set(["1,4", "1,5", "2,4"]);
  while (vegetables.length < goal) {
    const c = Math.floor(Math.random() * cols);
    const r = Math.floor(Math.random() * rows);
    const key = `${c},${r}`;
    if (reserved.has(key) || vegetables.some((veg) => veg.c === c && veg.r === r)) continue;
    vegetables.push({
      c,
      r,
      type: vegTypes[Math.floor(Math.random() * vegTypes.length)],
      found: false,
      wiggle: Math.random() * Math.PI * 2,
    });
  }
}

function placeBombs() {
  const reserved = new Set(["1,4", "1,5", "2,4", "10,3", "10,4"]);
  while (bombs.length < currentStageSettings().bombs) {
    const c = Math.floor(Math.random() * cols);
    const r = Math.floor(Math.random() * rows);
    const key = `${c},${r}`;
    if (reserved.has(key) || bombs.some((bomb) => bomb.c === c && bomb.r === r)) continue;
    bombs.push({
      c,
      r,
      found: false,
      wiggle: Math.random() * Math.PI * 2,
    });
  }
}

function updateHud() {
  stageEl.textContent = String(currentStage);
  collectedEl.textContent = String(currentStage === bossStage ? heldBombs : collected);
  totalEl.textContent = String(currentStage === bossStage && boss ? boss.hp : stageGoal);
  dangerEl.textContent = dangerLevel;
  messageEl.textContent = message;
  soundButton.textContent = soundEnabled ? "♪" : "×";
  restartButton.textContent = state === "title" ? "↻" : "⌂";
  restartButton.setAttribute("aria-label", state === "title" ? "ゲームを始める" : "スタート画面に戻る");
}

function update(dt) {
  if (state !== "playing") return;

  const movement = readMovement();
  updatePlayer(movement, dt);
  updateDigging(movement, dt);
  updateEnemies(dt);
  updateBoss(dt);
  updateBombShots(dt);
  updatePuffs(dt);
  updateDanger();
  updateHud();
}

function readMovement() {
  if (swipeControl.active) {
    const dx = swipeControl.targetX - player.x;
    const dy = swipeControl.targetY - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 10) return { x: dx / dist, y: dy / dist, moving: true };
  }

  let dx = 0;
  let dy = 0;
  if (keys.has("ArrowLeft") || keys.has("a")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) dx += 1;
  if (keys.has("ArrowUp") || keys.has("w")) dy -= 1;
  if (keys.has("ArrowDown") || keys.has("s")) dy += 1;

  if (!dx && !dy) return { x: 0, y: 0, moving: false };
  const len = Math.hypot(dx, dy);
  return { x: dx / len, y: dy / len, moving: true };
}

function updatePlayer(movement, dt) {
  if (!movement.moving) return;
  player.facing = { x: movement.x, y: movement.y };
  player.x = clamp(player.x + movement.x * player.speed * dt, player.radius, canvas.width - player.radius);
  player.y = clamp(player.y + movement.y * player.speed * dt, player.radius, canvas.height - player.radius);
}

function updateDigging(movement, dt) {
  emptyDigCooldown = Math.max(0, emptyDigCooldown - dt);
  digSoundCooldown = Math.max(0, digSoundCooldown - dt);

  if (!digHeld || movement.moving) {
    if (movement.moving && digProgress > 0) message = "動くと掘るのを中断";
    digTarget = null;
    digProgress = 0;
    return;
  }

  const pc = Math.floor(player.x / tile);
  const pr = Math.floor(player.y / tile);
  const veg = vegetables.find((item) => !item.found && item.c === pc && item.r === pr);
  const bomb = bombs.find((item) => !item.found && item.c === pc && item.r === pr);

  if (!veg && !bomb) {
    if (tryThrowBomb()) return;
    digTarget = null;
    digProgress = 0;
    if (emptyDigCooldown <= 0) {
      dirtPuffs.push({ x: pc * tile + tile / 2, y: pr * tile + tile / 2, life: 0.35 });
      message = heldBombs > 0 && boss ? "ボスに向かって爆弾を投げろ" : "ここは空っぽ";
      emptyDigCooldown = 0.28;
      playEmptyDigSound();
    }
    return;
  }

  const target = veg || bomb;
  if (digTarget !== target) {
    digTarget = target;
    digProgress = 0;
    message = bomb ? "爆弾だ。掘り出せ" : "掘り続けろ";
  }

  digProgress += dt;
  if (digSoundCooldown <= 0) {
    playDigSound();
    digSoundCooldown = 0.16;
  }
  dirtPuffs.push({
    x: pc * tile + tile / 2 + (Math.random() - 0.5) * 18,
    y: pr * tile + tile / 2 + (Math.random() - 0.5) * 18,
    life: 0.24,
  });

  if (digProgress >= digSeconds) {
    if (bomb) collectBomb(bomb);
    else collectVegetable(veg);
  }
}

function collectVegetable(veg) {
  veg.found = true;
  collected += 1;
  message = `${vegetableLabel(veg.type.name)}を回収`;
  playCollectSound();
  digTarget = null;
  digProgress = 0;

  if (collected === stageGoal) {
    if (currentStage < bossStage) {
      currentStage += 1;
      enterStageClear();
    } else {
      winGame();
    }
  }
}

function enterStageClear() {
  state = "stageClear";
  message = "クリア！次のステージへ";
  digHeld = false;
  digTarget = null;
  digProgress = 0;
  stopSwipeControl();
  stopCharacterDigControl();
  stageClearReleaseRequired = true;
  stageClearUnlockAt = Date.now() + 450;
  playStageClearSound();
  updateHud();
}

function releaseStageClearInput() {
  if (state !== "stageClear") return;
  if (!stageClearReleaseRequired) return;
  stageClearReleaseRequired = false;
  stageClearUnlockAt = Math.max(stageClearUnlockAt, Date.now() + 250);
}

function canAdvanceStageClear() {
  return state === "stageClear" && !stageClearReleaseRequired && Date.now() >= stageClearUnlockAt;
}

function advanceStageClear() {
  if (!canAdvanceStageClear()) return false;
  startStage(currentStage);
  return true;
}

function collectBomb(bomb) {
  bomb.found = true;
  heldBombs += 1;
  message = "爆弾を手に入れた";
  playCollectSound();
  digTarget = null;
  digProgress = 0;
}

function tryThrowBomb() {
  if (!boss || heldBombs <= 0 || bombShots.length > 0) return false;
  const dx = boss.x - player.x;
  const dy = boss.y - player.y;
  const dist = Math.hypot(dx, dy) || 1;
  heldBombs -= 1;
  bombShots.push({
    x: player.x + player.facing.x * 28,
    y: player.y + player.facing.y * 28,
    vx: (dx / dist) * 430,
    vy: (dy / dist) * 430,
    life: 1.6,
  });
  message = "爆弾を投げた";
  playTone(180, 0.08, "square", 0.22);
  digHeld = false;
  digTarget = null;
  digProgress = 0;
  return true;
}

function updateEnemies(dt) {
  graceTime = Math.max(0, graceTime - dt);
  const settings = currentStageSettings();

  enemies.forEach((enemy) => {
    const toPlayer = distance(enemy.x, enemy.y, player.x, player.y);
    enemy.alert = toPlayer < settings.alertRange;
    enemy.wobble += dt * 5.2;

    const target = enemy.alert ? player : enemy.path[enemy.targetIndex];
    const tx = target.x;
    const ty = target.y;
    const dx = tx - enemy.x;
    const dy = ty - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = enemy.alert ? enemy.speed * 1.24 : enemy.speed;

    enemy.facing = { x: dx / dist, y: dy / dist };
    enemy.x += enemy.facing.x * speed * dt;
    enemy.y += enemy.facing.y * speed * dt;

    if (!enemy.alert && dist < 8) {
      enemy.targetIndex = (enemy.targetIndex + 1) % enemy.path.length;
    }

    if (graceTime <= 0 && distance(player.x, player.y, enemy.x, enemy.y) < player.radius + enemy.radius - 7) {
      loseGame("敵に捕まった");
    }
  });
}

function updateBoss(dt) {
  if (!boss) return;
  boss.wobble += dt * 5;
  boss.stun = Math.max(0, boss.stun - dt);
  if (boss.stun > 0) return;

  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const dist = Math.hypot(dx, dy) || 1;
  boss.facing = { x: dx / dist, y: dy / dist };
  const charge = dist < 260 ? 1.45 : 1;
  boss.x = clamp(boss.x + boss.facing.x * boss.speed * charge * dt, boss.radius, canvas.width - boss.radius);
  boss.y = clamp(boss.y + boss.facing.y * boss.speed * charge * dt, boss.radius, canvas.height - boss.radius);

  if (graceTime <= 0 && distance(player.x, player.y, boss.x, boss.y) < player.radius + boss.radius - 8) {
    loseGame("ボスに吹き飛ばされた");
  }
}

function updateBombShots(dt) {
  if (!boss) {
    bombShots = [];
    return;
  }

  bombShots = bombShots
    .map((shot) => {
      const dx = boss.x - shot.x;
      const dy = boss.y - shot.y;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = Math.hypot(shot.vx, shot.vy) || 430;
      const vx = shot.vx * 0.88 + (dx / dist) * speed * 0.12;
      const vy = shot.vy * 0.88 + (dy / dist) * speed * 0.12;
      return {
        ...shot,
        vx,
        vy,
        x: shot.x + vx * dt,
        y: shot.y + vy * dt,
        life: shot.life - dt,
      };
    })
    .filter((shot) => shot.life > 0 && shot.x > -30 && shot.x < canvas.width + 30 && shot.y > -30 && shot.y < canvas.height + 30);

  bombShots.forEach((shot) => {
    if (!shot.hit && distance(shot.x, shot.y, boss.x, boss.y) < boss.radius + 15) {
      shot.hit = true;
      boss.hp -= 1;
      boss.stun = 0.7;
      dirtPuffs.push({ x: boss.x, y: boss.y, life: 0.5 });
      message = `命中。あと${Math.max(0, boss.hp)}発`;
      playTone(90, 0.18, "sawtooth", 0.26);
      if (boss.hp <= 0) winGame();
    }
  });

  bombShots = bombShots.filter((shot) => !shot.hit);
}

function loseGame(reason) {
  if (state !== "playing") return;
  state = "lost";
  message = reason;
  digHeld = false;
  stopSwipeControl();
  stopCharacterDigControl();
  stopBgm();
  playLoseSound();
}

function winGame() {
  state = "won";
  message = "CLEAR! あなたの畑は守られました";
  boss = null;
  bombShots = [];
  stopBgm();
  playWinSound();
}

function updatePuffs(dt) {
  dirtPuffs = dirtPuffs
    .map((puff) => ({ ...puff, life: puff.life - dt }))
    .filter((puff) => puff.life > 0);
}

function updateDanger() {
  let nearest = enemies.reduce((best, enemy) => Math.min(best, distance(player.x, player.y, enemy.x, enemy.y)), Infinity);
  if (boss) nearest = Math.min(nearest, distance(player.x, player.y, boss.x, boss.y));
  if (nearest < 95) dangerLevel = "危険";
  else if (nearest < 190) dangerLevel = "注意";
  else dangerLevel = "低";
}

function vegetableLabel(name) {
  return {
    carrot: "にんじん",
    turnip: "かぶ",
    radish: "ラディッシュ",
    potato: "じゃがいも",
  }[name];
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawField();
  drawVegetableClues();
  drawBombClues();
  drawEnemyPaths();
  vegetables.filter((veg) => veg.found).forEach(drawVegetable);
  dirtPuffs.forEach(drawPuff);
  enemies.forEach(drawEnemy);
  if (boss) drawBoss();
  bombShots.forEach(drawBombShot);
  drawPlayer();
  drawDigMeter();
  drawBossMeter();
  if (state === "title") drawTitle();
  else if (state !== "playing") drawOverlay();
}

function drawField() {
  ctx.fillStyle = "#8c5733";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = c * tile;
      const y = r * tile;
      ctx.fillStyle = (r + c) % 2 ? "#83502f" : "#905a35";
      roundedRect(x + 5, y + 5, tile - 10, tile - 10, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(61, 36, 24, 0.18)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  ctx.fillStyle = "#476c35";
  ctx.fillRect(0, 0, canvas.width, 18);
  ctx.fillRect(0, canvas.height - 18, canvas.width, 18);
}

function drawVegetableClues() {
  vegetables
    .filter((veg) => !veg.found)
    .forEach((veg) => {
      const x = veg.c * tile + tile / 2;
      const y = veg.r * tile + tile / 2;
      const sway = Math.sin(performance.now() / 400 + veg.wiggle) * 3;
      ctx.strokeStyle = "#276936";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x - 12 + sway, y - 22);
      ctx.moveTo(x + 2, y - 4);
      ctx.lineTo(x + 13 + sway, y - 19);
      ctx.stroke();
    });
}

function drawBombClues() {
  bombs
    .filter((bomb) => !bomb.found)
    .forEach((bomb) => {
      const x = bomb.c * tile + tile / 2;
      const y = bomb.r * tile + tile / 2;
      const pulse = Math.sin(performance.now() / 280 + bomb.wiggle) * 2;
      ctx.strokeStyle = "#1f2524";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - 12, y - 12 + pulse);
      ctx.lineTo(x + 12, y - 18 + pulse);
      ctx.moveTo(x - 6, y - 4 + pulse);
      ctx.lineTo(x + 14, y - 8 + pulse);
      ctx.stroke();
    });
}

function drawEnemyPaths() {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 211, 106, 0.18)";
  ctx.lineWidth = 5;
  ctx.setLineDash([12, 14]);
  enemies.forEach((enemy) => {
    ctx.beginPath();
    enemy.path.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.stroke();
  });
  ctx.restore();
}

function drawVegetable(veg) {
  const x = veg.c * tile + tile / 2;
  const y = veg.r * tile + tile / 2 + 4;
  ctx.fillStyle = veg.type.body;
  ctx.beginPath();
  ctx.ellipse(x, y + 8, 15, 23, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3e2a1d";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = veg.type.top;
  ctx.beginPath();
  ctx.ellipse(x - 8, y - 18, 7, 15, -0.6, 0, Math.PI * 2);
  ctx.ellipse(x + 8, y - 18, 7, 15, 0.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawBomb(bomb) {
  const x = bomb.c * tile + tile / 2;
  const y = bomb.r * tile + tile / 2 + 6;
  ctx.fillStyle = "#2a2d30";
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#101315";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = "#ffd36a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 9, y - 15);
  ctx.quadraticCurveTo(x + 26, y - 27, x + 34, y - 12);
  ctx.stroke();
}

function drawPuff(puff) {
  ctx.globalAlpha = Math.max(0, puff.life / 0.35);
  ctx.fillStyle = "#c79763";
  ctx.beginPath();
  ctx.arc(puff.x, puff.y, 9 + (1 - puff.life / 0.35) * 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawEnemy(enemy) {
  const y = enemy.y + Math.sin(enemy.wobble) * 4;
  const alertColor = enemy.alert ? "#d94f35" : "#2f2f35";
  ctx.fillStyle = enemy.alert ? "rgba(217, 79, 53, 0.14)" : "rgba(47, 47, 53, 0.08)";
  ctx.beginPath();
  ctx.arc(enemy.x, y, enemy.alert ? 70 : 44, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = alertColor;
  ctx.beginPath();
  ctx.ellipse(enemy.x, y, 34, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f1f1d2";
  ctx.beginPath();
  ctx.arc(enemy.x - 12, y - 5, 6, 0, Math.PI * 2);
  ctx.arc(enemy.x + 12, y - 5, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#263126";
  ctx.beginPath();
  ctx.arc(enemy.x - 12 + enemy.facing.x * 2, y - 4 + enemy.facing.y * 2, 2, 0, Math.PI * 2);
  ctx.arc(enemy.x + 12 + enemy.facing.x * 2, y - 4 + enemy.facing.y * 2, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd36a";
  ctx.fillRect(enemy.x - 18, y + 15, 36, 7);
}

function drawBoss() {
  const y = boss.y + Math.sin(boss.wobble) * 5;
  const angry = boss.stun <= 0;
  ctx.fillStyle = angry ? "rgba(154, 45, 35, 0.18)" : "rgba(255, 211, 106, 0.22)";
  ctx.beginPath();
  ctx.arc(boss.x, y, angry ? 88 : 70, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#5b3028";
  ctx.beginPath();
  ctx.ellipse(boss.x, y, 58, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2c1715";
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.fillStyle = "#3a1d1a";
  ctx.beginPath();
  ctx.ellipse(boss.x + boss.facing.x * 20, y + 6, 28, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f2e4c5";
  ctx.beginPath();
  ctx.moveTo(boss.x + boss.facing.x * 30 - 8, y + 12);
  ctx.lineTo(boss.x + boss.facing.x * 52 - 12, y + 22);
  ctx.lineTo(boss.x + boss.facing.x * 38 - 2, y + 2);
  ctx.moveTo(boss.x + boss.facing.x * 30 + 8, y + 12);
  ctx.lineTo(boss.x + boss.facing.x * 52 + 12, y + 22);
  ctx.lineTo(boss.x + boss.facing.x * 38 + 2, y + 2);
  ctx.fill();

  ctx.fillStyle = "#f7f0d7";
  ctx.beginPath();
  ctx.arc(boss.x + boss.facing.x * 18 - 13, y - 12, 7, 0, Math.PI * 2);
  ctx.arc(boss.x + boss.facing.x * 18 + 13, y - 12, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#cf2f2f";
  ctx.beginPath();
  ctx.arc(boss.x + boss.facing.x * 20 - 13, y - 12, 3, 0, Math.PI * 2);
  ctx.arc(boss.x + boss.facing.x * 20 + 13, y - 12, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2c1715";
  ctx.beginPath();
  ctx.moveTo(boss.x - 34, y - 30);
  ctx.lineTo(boss.x - 16, y - 54);
  ctx.lineTo(boss.x - 6, y - 29);
  ctx.moveTo(boss.x + 34, y - 30);
  ctx.lineTo(boss.x + 16, y - 54);
  ctx.lineTo(boss.x + 6, y - 29);
  ctx.fill();
}

function drawBombShot(shot) {
  ctx.fillStyle = "#1e2224";
  ctx.beginPath();
  ctx.arc(shot.x, shot.y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffd36a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(shot.x + 8, shot.y - 8);
  ctx.lineTo(shot.x + 20, shot.y - 18);
  ctx.stroke();
}

function drawPlayer() {
  ctx.fillStyle = digHeld && digProgress > 0 ? "#2f71c9" : "#3c7dd9";
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1c3d6d";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = "#fff8e8";
  ctx.beginPath();
  ctx.arc(player.x + player.facing.x * 10 - 6, player.y + player.facing.y * 8 - 4, 5, 0, Math.PI * 2);
  ctx.arc(player.x + player.facing.x * 10 + 6, player.y + player.facing.y * 8 - 4, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#ffd36a";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(player.x + player.facing.x * 14, player.y + player.facing.y * 14);
  ctx.lineTo(player.x + player.facing.x * 34, player.y + player.facing.y * 34);
  ctx.stroke();
}

function drawDigMeter() {
  if (!digTarget || state !== "playing") return;
  const width = 58;
  const height = 10;
  const x = player.x - width / 2;
  const y = player.y - 45;
  ctx.fillStyle = "rgba(38, 49, 38, 0.55)";
  roundedRect(x, y, width, height, 5);
  ctx.fill();
  ctx.fillStyle = "#ffd36a";
  roundedRect(x, y, width * clamp(digProgress / digSeconds, 0, 1), height, 5);
  ctx.fill();
}

function drawBossMeter() {
  if (!boss || state !== "playing") return;
  const width = 260;
  const height = 16;
  const x = canvas.width / 2 - width / 2;
  const y = 78;
  ctx.fillStyle = "rgba(38, 49, 38, 0.68)";
  roundedRect(x, y, width, height, 8);
  ctx.fill();
  ctx.fillStyle = "#d94f35";
  roundedRect(x, y, width * clamp(boss.hp / boss.maxHp, 0, 1), height, 8);
  ctx.fill();
  ctx.fillStyle = "#fff8e8";
  ctx.font = "900 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("悪い猪ボス", canvas.width / 2, y - 8);
  ctx.textAlign = "start";
}

function drawOverlay() {
  ctx.fillStyle = "rgba(38, 49, 38, 0.72)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff8e8";
  ctx.textAlign = "center";
  if (state === "won") {
    ctx.font = "900 58px system-ui, sans-serif";
    ctx.fillText("CLEAR!", canvas.width / 2, canvas.height / 2 - 42);
    ctx.font = "800 28px system-ui, sans-serif";
    ctx.fillText("あなたの畑は守られました", canvas.width / 2, canvas.height / 2 + 8);
    ctx.font = "700 20px system-ui, sans-serif";
    ctx.fillText("⌂ でスタート画面へ", canvas.width / 2, canvas.height / 2 + 54);
  } else if (state === "stageClear") {
    ctx.font = "900 58px system-ui, sans-serif";
    ctx.fillText("クリア！", canvas.width / 2, canvas.height / 2 - 54);
    ctx.font = "800 30px system-ui, sans-serif";
    ctx.fillText("次のステージへ", canvas.width / 2, canvas.height / 2 - 6);
    ctx.font = "700 20px system-ui, sans-serif";
    ctx.fillText(canAdvanceStageClear() ? "クリック / 掘る / スペースで進む" : "いったん指やキーを離して準備", canvas.width / 2, canvas.height / 2 + 44);
    ctx.fillText(`次は STAGE ${currentStage}`, canvas.width / 2, canvas.height / 2 + 78);
  } else {
    ctx.font = "900 54px system-ui, sans-serif";
    ctx.fillText("失敗", canvas.width / 2, canvas.height / 2 - 86);
    ctx.font = "700 24px system-ui, sans-serif";
    ctx.fillText(message, canvas.width / 2, canvas.height / 2 - 42);
    drawLostChoiceButtons();
  }
  ctx.textAlign = "start";
}

function drawLostChoiceButtons() {
  const buttons = lostChoiceRects();
  buttons.forEach((button) => {
    ctx.fillStyle = button.action === "stage" ? "#f47f4d" : "#fff8e8";
    roundedRect(button.x, button.y, button.w, button.h, 8);
    ctx.fill();
    ctx.strokeStyle = "#4b2d1e";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "#263126";
    ctx.font = "900 24px system-ui, sans-serif";
    ctx.fillText(button.label, button.x + button.w / 2, button.y + 38);
  });

  ctx.fillStyle = "#fff8e8";
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillText("⌂ でスタート画面へ", canvas.width / 2, canvas.height / 2 + 118);
}

function drawTitle() {
  ctx.fillStyle = "rgba(38, 49, 38, 0.68)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff8e8";
  ctx.font = "900 62px system-ui, sans-serif";
  ctx.fillText("もぐって野菜ハント", canvas.width / 2, canvas.height / 2 - 86);

  ctx.font = "700 25px system-ui, sans-serif";
  ctx.fillText("敵を避けて、地面の野菜を全部掘り出せ", canvas.width / 2, canvas.height / 2 - 30);

  ctx.fillStyle = "#ffd36a";
  roundedRect(canvas.width / 2 - 150, canvas.height / 2 + 18, 300, 58, 8);
  ctx.fill();
  ctx.strokeStyle = "#4b2d1e";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = "#263126";
  ctx.font = "900 25px system-ui, sans-serif";
  ctx.fillText("クリックでスタート", canvas.width / 2, canvas.height / 2 + 56);

  drawDifficultyButtons();

  ctx.fillStyle = "#fff8e8";
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.fillText(controlHintText(), canvas.width / 2, canvas.height / 2 + 154);
  ctx.textAlign = "start";
}

function controlHintText() {
  if (isTouchDevice()) return "移動: 画面をスワイプ  掘る: キャラ長押し";
  return "移動: 矢印/WASD  掘る: スペース長押し";
}

function drawDifficultyButtons() {
  const labels = ["EASY", "NORMAL", "HARD"];
  const buttonWidth = 132;
  const buttonHeight = 42;
  const gap = 14;
  const totalWidth = labels.length * buttonWidth + (labels.length - 1) * gap;
  const startX = canvas.width / 2 - totalWidth / 2;
  const y = canvas.height / 2 + 92;

  labels.forEach((label, index) => {
    const x = startX + index * (buttonWidth + gap);
    ctx.fillStyle = difficulty === label ? "#f47f4d" : "#fff8e8";
    roundedRect(x, y, buttonWidth, buttonHeight, 8);
    ctx.fill();
    ctx.strokeStyle = "#4b2d1e";
    ctx.lineWidth = difficulty === label ? 5 : 3;
    ctx.stroke();
    ctx.fillStyle = "#263126";
    ctx.font = "900 19px system-ui, sans-serif";
    ctx.fillText(label, x + buttonWidth / 2, y + 27);
  });
}

function difficultyAtCanvasPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;
  const labels = ["EASY", "NORMAL", "HARD"];
  const buttonWidth = 132;
  const buttonHeight = 42;
  const gap = 14;
  const totalWidth = labels.length * buttonWidth + (labels.length - 1) * gap;
  const startX = canvas.width / 2 - totalWidth / 2;
  const startY = canvas.height / 2 + 92;

  return labels.find((label, index) => {
    const buttonX = startX + index * (buttonWidth + gap);
    return x >= buttonX && x <= buttonX + buttonWidth && y >= startY && y <= startY + buttonHeight;
  });
}

function lostChoiceRects() {
  const width = 220;
  const height = 58;
  const gap = 22;
  const y = canvas.height / 2 + 8;
  const startX = canvas.width / 2 - width - gap / 2;
  return [
    { action: "stage", label: "今のステージから", x: startX, y, w: width, h: height },
    { action: "start", label: "最初から", x: startX + width + gap, y, w: width, h: height },
  ];
}

function lostChoiceAtCanvasPoint(clientX, clientY) {
  const point = canvasPointFromClient(clientX, clientY);
  const button = lostChoiceRects().find((rect) => {
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  });
  return button ? button.action : null;
}

function canvasPointFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  };
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function loop(timestamp) {
  const dt = lastTime ? Math.min(0.033, (timestamp - lastTime) / 1000) : 0;
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function isTouchDevice() {
  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

function isTouchPointer(event) {
  return event.pointerType === "touch" || event.pointerType === "pen" || isTouchDevice();
}

function canvasPointFromEvent(event) {
  return canvasPointFromClient(event.clientX, event.clientY);
}

function isPointOnPlayer(point) {
  return distance(point.x, point.y, player.x, player.y) <= characterDigRadius;
}

function startCharacterDigControl(event) {
  if (state !== "playing" || !isTouchPointer(event)) return false;

  const point = canvasPointFromEvent(event);
  if (!isPointOnPlayer(point)) return false;

  characterDigControl = {
    active: true,
    pointerId: event.pointerId,
  };
  stopSwipeControl();
  digHeld = true;
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
  return true;
}

function updateCharacterDigControl(event) {
  if (!characterDigControl.active || event.pointerId !== characterDigControl.pointerId) return false;
  event.preventDefault();
  return true;
}

function stopCharacterDigControl(event) {
  if (event && characterDigControl.pointerId !== event.pointerId) return false;
  if (characterDigControl.active) digHeld = false;
  characterDigControl = {
    active: false,
    pointerId: null,
  };
  return true;
}

function startSwipeControl(event) {
  if (state !== "playing" || !isTouchPointer(event)) return false;

  const point = canvasPointFromEvent(event);
  swipeControl = {
    active: true,
    pointerId: event.pointerId,
    targetX: point.x,
    targetY: point.y,
  };
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
  return true;
}

function updateSwipeControl(event) {
  if (!swipeControl.active || event.pointerId !== swipeControl.pointerId) return;
  const point = canvasPointFromEvent(event);
  swipeControl.targetX = point.x;
  swipeControl.targetY = point.y;
  event.preventDefault();
}

function stopSwipeControl(event) {
  if (event && swipeControl.pointerId !== event.pointerId) return;
  swipeControl = {
    active: false,
    pointerId: null,
    targetX: 0,
    targetY: 0,
  };
}

function blockTouchSelection(event) {
  if (isTouchPointer(event)) event.preventDefault();
}

function clearTouchSelection() {
  if (!isTouchDevice() || !window.getSelection) return;
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) selection.removeAllRanges();
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "a", "d", "s", "w"].includes(event.key)) {
    event.preventDefault();
  }
  if (event.key === " " && state === "title") resetGame();
  else if (event.key === " " && state === "stageClear") advanceStageClear();
  else if (event.key === " " && state === "lost") startStage(currentStage);
  else if (event.key === " " && state === "won") returnToTitle();
  else if (event.key === " ") digHeld = true;
  keys.add(event.key);
});

window.addEventListener("keyup", (event) => {
  if (event.key === " ") digHeld = false;
  if (event.key === " ") releaseStageClearInput();
  keys.delete(event.key);
});

function activateSoundButton(event) {
  event.stopPropagation();
  if (event.cancelable) event.preventDefault();
  setSoundEnabled(!soundEnabled);
}

function activateRestartButton(event) {
  event.stopPropagation();
  if (event.cancelable) event.preventDefault();
  if (state === "title") resetGame();
  else returnToTitle();
}

function shouldHandlePointerButton(event) {
  return event.pointerType === "touch" || event.pointerType === "pen";
}

function rememberHudTouchActivation() {
  lastHudTouchActivation = Date.now();
}

function isDuplicateTouchClick() {
  return Date.now() - lastHudTouchActivation < 500;
}

soundButton.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});
soundButton.addEventListener("pointerup", (event) => {
  if (!shouldHandlePointerButton(event)) return;
  rememberHudTouchActivation();
  activateSoundButton(event);
});
soundButton.addEventListener("click", (event) => {
  if (!isDuplicateTouchClick()) activateSoundButton(event);
  else event.stopPropagation();
});

restartButton.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});
restartButton.addEventListener("pointerup", (event) => {
  if (!shouldHandlePointerButton(event)) return;
  rememberHudTouchActivation();
  activateRestartButton(event);
});
restartButton.addEventListener("click", (event) => {
  if (!isDuplicateTouchClick()) activateRestartButton(event);
  else event.stopPropagation();
});
digButton.addEventListener("click", () => {
  if (state === "title") resetGame();
  else if (state === "stageClear") advanceStageClear();
  else if (state === "lost") startStage(currentStage);
  else if (state === "won") returnToTitle();
});
digButton.addEventListener("pointerdown", (event) => {
  if (state === "title") return;
  event.preventDefault();
  digHeld = true;
});
digButton.addEventListener("pointerup", (event) => {
  event.preventDefault();
  digHeld = false;
  releaseStageClearInput();
});
digButton.addEventListener("pointerleave", (event) => {
  event.preventDefault();
  digHeld = false;
  releaseStageClearInput();
});
digButton.addEventListener("pointercancel", (event) => {
  event.preventDefault();
  digHeld = false;
  releaseStageClearInput();
});

document.addEventListener("contextmenu", blockTouchSelection);
document.addEventListener("selectstart", blockTouchSelection);
document.addEventListener("dragstart", blockTouchSelection);
document.addEventListener("selectionchange", clearTouchSelection);

canvas.addEventListener("pointerdown", (event) => {
  if (startCharacterDigControl(event)) return;
  startSwipeControl(event);
});

canvas.addEventListener("pointermove", (event) => {
  if (updateCharacterDigControl(event)) return;
  updateSwipeControl(event);
});

canvas.addEventListener("pointerup", (event) => {
  stopCharacterDigControl(event);
  stopSwipeControl(event);
  releaseStageClearInput();
});

canvas.addEventListener("pointercancel", (event) => {
  stopCharacterDigControl(event);
  stopSwipeControl(event);
  releaseStageClearInput();
});

canvas.addEventListener("click", (event) => {
  if (state === "stageClear") {
    advanceStageClear();
    return;
  }

  if (state === "lost") {
    const choice = lostChoiceAtCanvasPoint(event.clientX, event.clientY);
    if (choice === "stage") startStage(currentStage);
    else if (choice === "start") resetGame();
    return;
  }

  if (state !== "title") return;

  const selectedDifficulty = difficultyAtCanvasPoint(event.clientX, event.clientY);
  if (selectedDifficulty) {
    initAudio();
    difficulty = selectedDifficulty;
    playTone(selectedDifficulty === "HARD" ? 784 : selectedDifficulty === "EASY" ? 440 : 587, 0.08, "square", 0.2);
    event.stopPropagation();
    return;
  }

  resetGame();
});

gameShell.addEventListener("click", (event) => {
  if (event.target === canvas) return;
  if (state === "title") resetGame();
});

moveButtons.forEach((button) => {
  const dir = button.dataset.dir;
  const keyByDir = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };
  const key = keyByDir[dir];
  button.addEventListener("pointerdown", () => keys.add(key));
  button.addEventListener("pointerup", () => keys.delete(key));
  button.addEventListener("pointerleave", () => keys.delete(key));
  button.addEventListener("pointercancel", () => keys.delete(key));
});

setupTitle();
requestAnimationFrame(loop);
