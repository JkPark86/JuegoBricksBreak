// game.js - completo y autocontenido (no ES module, listo para public/)
/* global Hands, Camera, drawConnectors, drawLandmarks, HAND_CONNECTIONS */

(function () {
  // DOM refs globales
  const videoElement = document.getElementById('webcam');
  const canvasElement = document.getElementById('output_canvas');
  const canvasCtx = canvasElement ? canvasElement.getContext('2d') : null;
  const introScreen = document.getElementById('introScreen');
  const gameScreen = document.getElementById('gameScreen');
  const startGameButton = document.getElementById('startGame');

  // Game state
  let canvasGame = document.getElementById('gameCanvas');
  let ctxGame = canvasGame ? canvasGame.getContext('2d') : null;

  let hands = null;
  let camera = null;
  let cameraStarted = false;

  const images = {
    platform: new Image(),
    ball: new Image(),
    brick: new Image()
  };
  // Rutas (debe haber estos archivos en public/)
images.platform.src = './public/tierra.png';
images.ball.src     = './public/esfera.png'; 
images.brick.src    = './public/ladrillo.png';

  // Fallback generator
  function createFallback(w, h, color, type) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = color;
    if (type === 'ball') {
      g.beginPath(); g.arc(w/2, h/2, Math.min(w,h)/2, 0, Math.PI*2); g.fill();
    } else {
      g.fillRect(0,0,w,h);
      if (type === 'brick') { g.strokeStyle = '#aa0000'; g.lineWidth = 3; g.strokeRect(0,0,w,h); }
    }
    const img = new Image(); img.src = c.toDataURL(); return img;
  }
  const fallback = {
    platform: createFallback(240,35,'#00ff00','platform'),
    ball: createFallback(50,50,'#ffffff','ball'),
    brick: createFallback(100,40,'#ff0000','brick')
  };

  const state = {
    platform: { x: 0, y: 0, width: 240, height: 35 },
    ball: { x: 0, y: 0, radius: 22, speedX: 8, speedY: -8, active:false },
    bricks: [],
    lives: 3,
    score: 0,
    level: 1,
    gameState: 'intro', // intro/menu/levels/playing/paused/win/lose/complete
    waitingForRestart: false,
    fistStartTime: 0,
    completedLevels: [],
    gestureState: {
      indexTip: {x:0,y:0}, middleTip:{x:0,y:0}, palmBase:{x:0,y:0},
      fist:false, fingersUp:0, clickActive:false, lastClickTime:0, hoverButton:null, vGesture:false
    },
    levelSpeeds: {1:{x:8,y:-8}, 2:{x:12,y:-12}, 3:{x:16,y:-16}}
  };

  // resize helper
  function resizeAll() {
    if (!canvasGame || !canvasElement) return;
    canvasGame.width = window.innerWidth;
    canvasGame.height = window.innerHeight;
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
    // platform pos
    state.platform.x = Math.max(0, (canvasGame.width/2) - (state.platform.width/2));
    state.platform.y = canvasGame.height - 120;
    state.ball.x = canvasGame.width / 2;
    state.ball.y = canvasGame.height - 180;
  }
  window.addEventListener('resize', resizeAll);

  // Start handlers
  function setupStartButton() {
    if (!startGameButton) return;
    startGameButton.addEventListener('click', startApp);
  }

  // Attach menu listeners (buttons on DOM)
  function attachMenuListeners() {
    document.querySelectorAll('.menu-button').forEach(b => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        handleButtonClick(b);
      });
    });
    document.querySelectorAll('.level-option').forEach(o => {
      o.addEventListener('click', (e) => {
        e.preventDefault();
        const lv = parseInt(o.dataset.level || '1');
        startGame(lv);
      });
    });
    // ESC to go to intro (debug)
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') exitToIntroScreen(); });
  }

  // ---------- MediaPipe setup ----------
  async function setupMediaPipe() {
    try {
      if (typeof Hands === 'undefined' || typeof Camera === 'undefined' || !videoElement) {
        console.warn('MediaPipe Hands/Camera no disponibles — gestos deshabilitados');
        return;
      }
      if (cameraStarted) return;

      hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      hands.onResults(onHandResults);

      camera = new Camera(videoElement, {
        onFrame: async () => { if (hands) await hands.send({image: videoElement}); },
        width: window.innerWidth, height: window.innerHeight
      });
      await camera.start();
      cameraStarted = true;
      console.log('Camera started');
    } catch (err) {
      console.error('setupMediaPipe error', err);
      hands = null; camera = null; cameraStarted = false;
    }
  }

  function stopCamera() {
    try {
      if (camera && camera.stream) camera.stream.getTracks().forEach(t=>t.stop());
      else if (videoElement && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(t=>t.stop());
      }
    } catch(e){console.warn('stopCamera',e);}
    cameraStarted = false;
  }

  // ---------- Results processing ----------
  function onHandResults(results) {
    if (!canvasCtx || !canvasElement) return;
    canvasCtx.save();
    canvasCtx.clearRect(0,0,canvasElement.width, canvasElement.height);
    if (results.image) {
      canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    }
    if (results.multiHandLandmarks) {
      for (const lm of results.multiHandLandmarks) {
        if (typeof drawConnectors !== 'undefined') {
          drawConnectors(canvasCtx, lm, HAND_CONNECTIONS, {color:'#00ff00', lineWidth:3});
          drawLandmarks(canvasCtx, lm, {color:'#ff0000', radius:4});
        }
        processHandLandmarks(lm);
      }
    }
    canvasCtx.restore();
  }

  function processHandLandmarks(landmarks) {
    if (!canvasElement) return;
    const wrist = landmarks[0], indexTip = landmarks[8], middleTip = landmarks[12];
    state.gestureState.palmBase = { x: (1 - wrist.x) * canvasElement.width, y: wrist.y * canvasElement.height };
    state.gestureState.indexTip = { x: (1 - indexTip.x) * canvasElement.width, y: indexTip.y * canvasElement.height };
    state.gestureState.middleTip = { x: (1 - middleTip.x) * canvasElement.width, y: middleTip.y * canvasElement.height };

    state.gestureState.fingersUp = countFingersUp(landmarks);
    state.gestureState.fist = isFist(landmarks);
    state.gestureState.vGesture = isVGesture(landmarks);

    const clickDistance = Math.hypot(state.gestureState.indexTip.x - state.gestureState.middleTip.x, state.gestureState.indexTip.y - state.gestureState.middleTip.y);
    const now = Date.now();
    if (clickDistance < 40 && !state.gestureState.clickActive && (now - state.gestureState.lastClickTime) > 400) {
      state.gestureState.clickActive = true; state.gestureState.lastClickTime = now; handleGestureClick();
    } else if (clickDistance >= 40) state.gestureState.clickActive = false;

    const fcount = document.getElementById('fingersCount'); if (fcount) fcount.textContent = state.gestureState.fingersUp;
    const gs = document.getElementById('gestureState'); if (gs) {
      let e = '🖐️ MOVIMIENTO - Plataforma';
      if (state.gestureState.fist) e = '✊ PUÑO - Pausa';
      else if (clickDistance < 40) e = '👆 CLIC - Botones';
      else if (state.gestureState.vGesture) e = '✌️ V - Seleccionar Nivel';
      gs.textContent = e;
    }

    if (state.gameState === 'playing' && !state.waitingForRestart) movePlatformWithHand();

    // fist long press to pause
    if (state.gestureState.fist) {
      if (state.fistStartTime === 0) state.fistStartTime = now;
      else if (state.gameState === 'playing' && !state.waitingForRestart && (now - state.fistStartTime) > 600) { pauseGame(); state.fistStartTime = 0; }
    } else state.fistStartTime = 0;

    handleButtonHover();
    if (state.gameState === 'levels' && state.gestureState.vGesture) handleLevelSelection();
  }

  // gestures helpers
  function isVGesture(landmarks) {
    const indexTip = landmarks[8], middleTip = landmarks[12], ringTip = landmarks[16], pinkyTip = landmarks[20];
    const indexPip = landmarks[6], middlePip = landmarks[10], ringPip = landmarks[14], pinkyPip = landmarks[18];
    return (indexTip.y < indexPip.y) && (middleTip.y < middlePip.y) && (ringTip.y > ringPip.y) && (pinkyTip.y > pinkyPip.y);
  }

  function countFingersUp(landmarks) {
    let cnt = 0; const tips=[8,12,16,20], pips=[6,10,14,18];
    for (let i=0;i<tips.length;i++) if (landmarks[tips[i]].y < landmarks[pips[i]].y) cnt++;
    if (landmarks[4] && landmarks[3] && landmarks[4].x < landmarks[3].x) cnt++;
    return cnt;
  }

  function isFist(landmarks) {
    let bent = 0; const tips=[8,12,16,20], pips=[6,10,14,18];
    for (let i=0;i<tips.length;i++) if (landmarks[tips[i]].y > landmarks[pips[i]].y) bent++;
    return bent >= 3;
  }

  // UI hover / click handling
  function handleButtonHover() {
    if (state.gameState === 'intro') return;
    const menus = document.querySelectorAll('.menu');
    let hover = null;
    menus.forEach(menu => {
      if (getComputedStyle(menu).display === 'none') return;
      const items = menu.querySelectorAll('.menu-button, .level-option');
      items.forEach(it => {
        it.classList.remove('selected');
        const r = it.getBoundingClientRect();
        if (state.gestureState.indexTip.x >= r.left && state.gestureState.indexTip.x <= r.right && state.gestureState.indexTip.y >= r.top && state.gestureState.indexTip.y <= r.bottom) {
          hover = it;
          it.classList.add('selected');
        }
      });
    });
    state.gestureState.hoverButton = hover;
  }

  function handleGestureClick() {
    if (state.gameState === 'intro') return;
    const btn = state.gestureState.hoverButton;
    if (!btn) return;
    const old = btn.style.background;
    btn.style.background = '#ffff00';
    setTimeout(()=>{ btn.style.background = old || ''; }, 180);
    handleButtonClick(btn);
  }

  function handleLevelSelection() {
    const options = document.querySelectorAll('.level-option');
    let sel = null;
    options.forEach(opt => {
      const r = opt.getBoundingClientRect();
      opt.classList.remove('selected');
      if (state.gestureState.indexTip.x >= r.left && state.gestureState.indexTip.x <= r.right && state.gestureState.indexTip.y >= r.top && state.gestureState.indexTip.y <= r.bottom) {
        opt.classList.add('selected');
        sel = parseInt(opt.dataset.level);
      }
    });
    if (sel && state.gestureState.vGesture) {
      setTimeout(()=>{ if (state.gestureState.vGesture) startGame(sel); }, 700);
    }
  }

  // Platform movement by hand
  function movePlatformWithHand() {
    const gameX = state.gestureState.palmBase.x;
    state.platform.x = gameX - (state.platform.width / 2);
    if (state.platform.x < 0) state.platform.x = 0;
    if (state.platform.x + state.platform.width > canvasGame.width) state.platform.x = canvasGame.width - state.platform.width;
  }

  // --------- Bricks / Game logic ----------
  function createBricks() {
    state.bricks = [];
    const rows = 3;
    const cols = 8;
    const brickW = Math.min(120, Math.floor(canvasGame.width/cols) - 8);
    const brickH = 40;
    const padding = 8;
    const totalWidth = cols * (brickW + padding) - padding;
    const startX = Math.max(20, Math.floor((canvasGame.width - totalWidth)/2));
    for (let r=0;r<rows;r++){
      for (let c=0;c<cols;c++){
        state.bricks.push({ x: startX + c*(brickW+padding), y: 80 + r*(brickH+padding), width: brickW, height: brickH, active:true });
      }
    }
  }

  async function showLifeLostMessage() {
    if (state.lives > 0) {
      const msg = document.getElementById('lifeLostMessage');
      const text = document.getElementById('lifeLostText');
      const timer = document.getElementById('lifeLostTimer');
      if (!msg || !text || !timer) return;
      text.textContent = `Te quedan ${state.lives} vidas`;
      msg.style.display = 'block';
      for (let i=3;i>0;i--) { timer.textContent = `Continuando en ${i} segundos...`; await new Promise(r=>setTimeout(r,1000)); }
      msg.style.display = 'none';
      state.waitingForRestart = false;
      state.ball.x = canvasGame.width / 2;
      state.ball.y = canvasGame.height - 180;
      const sp = state.levelSpeeds[state.level] || state.levelSpeeds[1];
      state.ball.speedX = sp.x; state.ball.speedY = sp.y;
    }
  }

  function startGame(level) {
    level = level || 1;
    state.level = level;
    state.lives = 3; state.score = 0; state.gameState = 'playing'; state.waitingForRestart = false;
    const sp = state.levelSpeeds[level] || state.levelSpeeds[1];
    state.ball.speedX = sp.x; state.ball.speedY = sp.y;
    state.ball.x = canvasGame.width / 2; state.ball.y = canvasGame.height - 180; state.ball.active = true;
    createBricks();
    hideAllMenus();
    updateUI();
  }

  function handleButtonClick(button) {
    const action = button.dataset.action || button.dataset.level;
    switch(action) {
      case 'start': startGame(1); break;
      case 'levels': showLevelsMenu(); break;
      case 'exit': exitToIntroScreen(); break;
      case 'back': showMainMenu(); break;
      case 'resume': resumeGame(); break;
      case 'menu': showMainMenu(); break;
      case 'nextLevel': nextLevel(); break;
      case 'retry': retryLevel(); break;
      case '1': case '2': case '3': startGame(parseInt(action)); break;
      default: if (button.dataset && button.dataset.level) startGame(parseInt(button.dataset.level)); break;
    }
  }

  function exitToIntroScreen() {
    state.gameState = 'intro';
    hideAllMenus();
    if (gameScreen) gameScreen.style.display = 'none';
    if (introScreen) introScreen.style.display = 'flex';
    stopCamera();
  }

  function nextLevel(){ if (state.level < 3) startGame(state.level+1); else showWinMenu(); }
  function retryLevel(){ startGame(state.level); }
  function pauseGame(){ if (state.gameState === 'playing' && !state.waitingForRestart){ state.gameState = 'paused'; showPauseMenu(); } }
  function resumeGame(){ if (state.gameState === 'paused'){ state.gameState = 'playing'; hideAllMenus(); } }
  function showMainMenu(){ state.gameState='menu'; hideAllMenus(); const m=document.getElementById('mainMenu'); if(m) m.style.display='block'; }
  function showLevelsMenu(){ state.gameState='levels'; hideAllMenus(); const m=document.getElementById('levelsMenu'); if(m) m.style.display='block'; }
  function showPauseMenu(){ hideAllMenus(); const m=document.getElementById('pauseMenu'); if(m) m.style.display='block'; }
  function showWinMenu(){ state.gameState='win'; hideAllMenus(); if (!state.completedLevels.includes(state.level)) state.completedLevels.push(state.level); if (state.completedLevels.length===3) showGameCompleteMenu(); else { const title=document.getElementById('winTitle'); if(title) title.textContent=`¡Ganaste Nivel ${state.level}!`; const scoreEl=document.getElementById('winScore'); if(scoreEl) scoreEl.textContent=state.score; const btn=document.querySelector('#winMenu [data-action="nextLevel"]'); if(btn){ if(state.level<3){ btn.textContent=`CONTINUAR NIVEL ${state.level+1}`; btn.style.display='block'; } else { btn.textContent='¡JUEGO COMPLETADO!'; btn.style.display='none'; } } const m=document.getElementById('winMenu'); if(m) m.style.display='block'; } }
  function showGameCompleteMenu(){ state.gameState='complete'; hideAllMenus(); const t=document.getElementById('completeTitle'); if(t) t.textContent='¡FELICIDADES!'; const st=document.getElementById('completeSubtitle'); if(st) st.textContent='Has completado todos los niveles'; const sc=document.getElementById('completeScore'); if(sc) sc.textContent=state.score; const m=document.getElementById('gameCompleteMenu'); if(m) m.style.display='block'; }
  function showLoseMenu(){ state.gameState='lose'; hideAllMenus(); const lv=document.getElementById('loseLevel'); if(lv) lv.textContent=state.level; const sc=document.getElementById('loseScore'); if(sc) sc.textContent=state.score; const m=document.getElementById('loseMenu'); if(m) m.style.display='block'; }
  function hideAllMenus(){ document.querySelectorAll('.menu, .life-lost-message').forEach(x=>x.style.display='none'); }
  function updateUI(){ const l=document.getElementById('livesCount'); if(l) l.textContent=state.lives; const s=document.getElementById('scoreCount'); if(s) s.textContent=state.score; const lv=document.getElementById('levelCount'); if(lv) lv.textContent=state.level; }

  // ---------- Physics update & draw ----------
  function update() {
    if (state.gameState !== 'playing' || state.waitingForRestart) return;

    state.ball.x += state.ball.speedX;
    state.ball.y += state.ball.speedY;

    // walls
    if (state.ball.x - state.ball.radius <= 0 || state.ball.x + state.ball.radius >= canvasGame.width) state.ball.speedX = -state.ball.speedX;
    if (state.ball.y - state.ball.radius <= 0) state.ball.speedY = -state.ball.speedY;

    // floor
    if (state.ball.y + state.ball.radius >= canvasGame.height) {
      state.lives--; updateUI();
      if (state.lives <= 0) { state.gameState = 'lose'; showLoseMenu(); }
      else { state.waitingForRestart = true; showLifeLostMessage(); }
    }

    // platform collision
    if (state.ball.y + state.ball.radius >= state.platform.y &&
        state.ball.y - state.ball.radius <= state.platform.y + state.platform.height &&
        state.ball.x >= state.platform.x &&
        state.ball.x <= state.platform.x + state.platform.width) {
      state.ball.speedY = -Math.abs(state.ball.speedY);
      const hitPos = (state.ball.x - state.platform.x) / state.platform.width;
      state.ball.speedX = 15 * (hitPos - 0.5);
    }

    // bricks collision
    for (let b of state.bricks) {
      if (b.active && checkCollision(b)) {
        b.active = false;
        state.ball.speedY = -state.ball.speedY;
        state.score += 10; updateUI();
      }
    }

    // win check
    if (state.bricks.filter(b=>b.active).length === 0) { state.gameState = 'win'; showWinMenu(); }
  }

  function checkCollision(b) {
    return state.ball.x + state.ball.radius >= b.x &&
           state.ball.x - state.ball.radius <= b.x + b.width &&
           state.ball.y + state.ball.radius >= b.y &&
           state.ball.y - state.ball.radius <= b.y + b.height;
  }

  function draw() {
    if (!ctxGame || !canvasGame) return;
    ctxGame.clearRect(0,0,canvasGame.width,canvasGame.height);

    // platform
    const platformImg = (images.platform && images.platform.complete) ? images.platform : fallback.platform;
    ctxGame.drawImage(platformImg, state.platform.x, state.platform.y, state.platform.width, state.platform.height);

    // ball
    const ballImg = (images.ball && images.ball.complete) ? images.ball : fallback.ball;
    ctxGame.drawImage(ballImg, state.ball.x - state.ball.radius, state.ball.y - state.ball.radius, state.ball.radius*2, state.ball.radius*2);

    // bricks
    const brickImg = (images.brick && images.brick.complete) ? images.brick : fallback.brick;
    for (let b of state.bricks) {
      if (!b.active) continue;
      ctxGame.drawImage(brickImg, b.x, b.y, b.width, b.height);
    }
  }

  function loop() {
    update(); draw();
    requestAnimationFrame(loop);
  }

  // ---------- Lifecycle ----------
  async function startApp() {
    if (introScreen) introScreen.style.display = 'none';
    if (gameScreen) gameScreen.style.display = 'block';
    state.gameState = 'menu';
    resizeAll();
    createBricks();
    attachMenuListeners();
    setupStartButton(); // in case not set
    // initialize mediapipe camera (ask permission)
    try {
      await startCameraAndHands();
    } catch (e) {
      console.warn('No se pudo iniciar MediaPipe:', e);
    }
    showMainMenu();
  }

  async function startCameraAndHands() {
    // request camera permission + start mediapipe
    try {
      // try standard getUserMedia first to ensure permission prompt
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: window.innerWidth, height: window.innerHeight } });
        // attach to videoElement so MP Camera can reuse or we stop and hand over to Camera(); we stop immediately and let Camera() request device again (but permission is set)
        videoElement.srcObject = stream;
        // we keep stream for short time then stop (Camera will create its own)
        setTimeout(()=> {
          try { stream.getTracks().forEach(t=>t.stop()); } catch(e) {}
        }, 200);
      }
    } catch(e) {
      console.warn('getUserMedia warning:', e);
    }
    await setupMediaPipe();
  }

  // Expose small helpers to window for debugging (optional)
  window.RompeBricksDebug = {
    state, startApp, startCameraAndHands, stopCamera
  };

  // init on DOMContentLoaded
  function initOnLoad() {
    canvasGame = document.getElementById('gameCanvas'); ctxGame = canvasGame ? canvasGame.getContext('2d') : null;
    resizeAll();
    setupStartButton();
    attachMenuListeners();
    // start the render loop even if not started playing
    requestAnimationFrame(loop);
  }
  window.addEventListener('DOMContentLoaded', initOnLoad);

  // helper: expose startApp to global (so external button can call)
  window.startApp = startApp;

})(); // EOF


