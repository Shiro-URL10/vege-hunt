const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const gameShell = document.querySelector(".game-shell");
const collectedEl = document.querySelector("#collected");
const totalEl = document.querySelector("#total");
const dangerEl = document.querySelector("#danger");
const soundButton = document.querySelector("#sound");
const restartButton = document.querySelector("#restart");
const digButton = document.querySelector("#dig");
const moveButtons = document.querySelectorAll(".move");

const cols = 12;
const rows = 8;
const tile = 80;
const totalVegetables = 14;
const digSeconds = 0.72;

const keys = new Set();
let vegetables = [];
let dirtPuffs = [];
let enemies = [];
let player;
let collected = 0;
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

function playLoseSound() {
  [330, 247, 196].forEach((note, index) => playTone(note, 0.16, "sawtooth", 0.2, index * 0.13));
}

function resetGame() {
  initAudio();
  playStartSound();
  startBgm();
  player = {
    x: tile * 1.5,
    y: tile * 4.5,
    radius: 23,
    speed: 245,
    facing: { x: 1, y: 0 },
  };
  vegetables = [];
  dirtPuffs = [];
  enemies = createEnemies();
  collected = 0;
  state = "playing";
  message = "敵を避けながら全部掘り出せ";
  lastTime = 0;
  digTarget = null;
  digProgress = 0;
  digHeld = false;
  emptyDigCooldown = 0;
  digSoundCooldown = 0;
  stopSwipeControl();
  dangerLevel = "低";
  graceTime = 2.2;
  placeVegetables();
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
  state = "title";
  setupTitle();
}

function setupTitle() {
  stopBgm();
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
  collected = 0;
  dangerLevel = "低";
  message = "クリックでスタート";
  totalEl.textContent = String(totalVegetables);
  updateHud();
}

function createEnemies() {
  return [
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
}

function makeEnemy(c, r, speed, path) {
  return {
    x: c * tile,
    y: r * tile,
    radius: 25,
    baseSpeed: speed,
    speed: speed * difficultySettings[difficulty].speedScale,
    path: path.map(([pc, pr]) => ({ x: pc * tile, y: pr * tile })),
    targetIndex: 1,
    wobble: Math.random() * Math.PI * 2,
    alert: false,
    facing: { x: -1, y: 0 },
  };
}

function placeVegetables() {
  const reserved = new Set(["1,4", "1,5", "2,4"]);
  while (vegetables.length < totalVegetables) {
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
  totalEl.textContent = String(totalVegetables);
}

function updateHud() {
  collectedEl.textContent = String(collected);
  dangerEl.textContent = dangerLevel;
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

  if (!veg) {
    digTarget = null;
    digProgress = 0;
    if (emptyDigCooldown <= 0) {
      dirtPuffs.push({ x: pc * tile + tile / 2, y: pr * tile + tile / 2, life: 0.35 });
      message = "ここは空っぽ";
      emptyDigCooldown = 0.28;
      playEmptyDigSound();
    }
    return;
  }

  if (digTarget !== veg) {
    digTarget = veg;
    digProgress = 0;
    message = "掘り続けろ";
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
    collectVegetable(veg);
  }
}

function collectVegetable(veg) {
  veg.found = true;
  collected += 1;
  message = `${vegetableLabel(veg.type.name)}を回収`;
  playCollectSound();
  digTarget = null;
  digProgress = 0;

  if (collected === totalVegetables) {
    state = "won";
    message = "全部回収。畑の勝ち";
    stopBgm();
    playWinSound();
  }
}

function updateEnemies(dt) {
  graceTime = Math.max(0, graceTime - dt);

  enemies.forEach((enemy) => {
    const toPlayer = distance(enemy.x, enemy.y, player.x, player.y);
    enemy.alert = toPlayer < 205;
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
      state = "lost";
      message = "敵に捕まった";
      stopBgm();
      playLoseSound();
    }
  });
}

function updatePuffs(dt) {
  dirtPuffs = dirtPuffs
    .map((puff) => ({ ...puff, life: puff.life - dt }))
    .filter((puff) => puff.life > 0);
}

function updateDanger() {
  const nearest = enemies.reduce((best, enemy) => Math.min(best, distance(player.x, player.y, enemy.x, enemy.y)), Infinity);
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
  drawEnemyPaths();
  vegetables.filter((veg) => veg.found).forEach(drawVegetable);
  dirtPuffs.forEach(drawPuff);
  enemies.forEach(drawEnemy);
  drawPlayer();
  drawDigMeter();
  drawMessage();
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

function drawMessage() {
  ctx.save();
  ctx.fillStyle = "rgba(255, 248, 232, 0.9)";
  roundedRect(16, 18, 404, 46, 8);
  ctx.fill();
  ctx.fillStyle = "#263126";
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillText(message, 32, 49);
  ctx.restore();
}

function drawOverlay() {
  ctx.fillStyle = "rgba(38, 49, 38, 0.72)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff8e8";
  ctx.textAlign = "center";
  ctx.font = "900 54px system-ui, sans-serif";
  ctx.fillText(state === "won" ? "クリア" : "失敗", canvas.width / 2, canvas.height / 2 - 24);
  ctx.font = "700 24px system-ui, sans-serif";
  ctx.fillText("掘る / ↻ でリスタート", canvas.width / 2, canvas.height / 2 + 20);
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.fillText("⌂ でスタート画面へ", canvas.width / 2, canvas.height / 2 + 56);
  ctx.textAlign = "start";
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
  if (isTouchDevice()) return "移動: 画面をスワイプ  掘る: ボタン長押し";
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
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
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

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "a", "d", "s", "w"].includes(event.key)) {
    event.preventDefault();
  }
  if (event.key === " " && state === "title") resetGame();
  else if (event.key === " " && state !== "playing") resetGame();
  else if (event.key === " ") digHeld = true;
  keys.add(event.key);
});

window.addEventListener("keyup", (event) => {
  if (event.key === " ") digHeld = false;
  keys.delete(event.key);
});

soundButton.addEventListener("click", (event) => {
  event.stopPropagation();
  setSoundEnabled(!soundEnabled);
});

restartButton.addEventListener("click", (event) => {
  event.stopPropagation();
  if (state === "title") resetGame();
  else returnToTitle();
});
digButton.addEventListener("click", () => {
  if (state !== "playing") resetGame();
});
digButton.addEventListener("pointerdown", (event) => {
  if (state === "title") return;
  event.preventDefault();
  digHeld = true;
});
digButton.addEventListener("pointerup", (event) => {
  event.preventDefault();
  digHeld = false;
});
digButton.addEventListener("pointerleave", (event) => {
  event.preventDefault();
  digHeld = false;
});
digButton.addEventListener("pointercancel", (event) => {
  event.preventDefault();
  digHeld = false;
});

document.addEventListener("contextmenu", blockTouchSelection);
document.addEventListener("selectstart", blockTouchSelection);
document.addEventListener("dragstart", blockTouchSelection);

canvas.addEventListener("pointerdown", (event) => {
  startSwipeControl(event);
});

canvas.addEventListener("pointermove", (event) => {
  updateSwipeControl(event);
});

canvas.addEventListener("pointerup", (event) => {
  stopSwipeControl(event);
});

canvas.addEventListener("pointercancel", (event) => {
  stopSwipeControl(event);
});

canvas.addEventListener("click", (event) => {
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
