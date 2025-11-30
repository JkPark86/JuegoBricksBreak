const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement ? canvasElement.getContext('2d') : null; // chequeo seguro

// Referencias de pantallas y botón de inicio
const introScreen = document.getElementById('introScreen');
const gameScreen = document.getElementById('gameScreen');
const startGameButton = document.getElementById('startGame');

class RompeBloquesGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    // tamaño inicial
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Images (se crean con fallback en onerror)
    this.images = {
      platform: new Image(),
      ball: new Image(),
      brick: new Image(),
    };

    // configurar fallback handlers ANTES de asignar src
    this.images.platform.onerror = () => {
      console.warn('platform image failed, using fallback');
      this.images.platform = this.createFallbackImageElement(240, 35, '#00ff00', 'platform');
    };
    this.images.ball.onerror = () => {
      console.warn('ball image failed, using fallback');
      this.images.ball = this.createFallbackImageElement(50, 50, '#ffffff', 'ball');
    };
    this.images.brick.onerror = () => {
      console.warn('brick image failed, using fallback');
      this.images.brick = this.createFallbackImageElement(100, 40, '#ff0000', 'brick');
    };

    // rutas (si están en public, deben resolverse como /archivo.ext)
    this.images.platform.src = '/tierra.png';
    this.images.ball.src = '/esfera.png';
    this.images.brick.src = '/ladrillo.png';

    // también pre-genera fallbacks por si quieres usarlos directamente
    this._fallbacks = {
      platform: this.createFallbackImageElement(240, 35, '#00ff00', 'platform'),
      ball: this.createFallbackImageElement(50, 50, '#ffffff', 'ball'),
      brick: this.createFallbackImageElement(100, 40, '#ff0000', 'brick'),
    };

    // estado del juego
    this.platform = {
      x: this.canvas.width / 2 - 120,
      y: this.canvas.height - 120,
      width: 240,
      height: 35,
    };

    this.ball = {
      x: this.canvas.width / 2,
      y: this.canvas.height - 180,
      radius: 25,
      speedX: 8,
      speedY: -8,
      active: false,
    };

    this.bricks = [];
    this.lives = 3;
    this.score = 0;
    this.level = 1;
    this.gameState = 'intro'; // intro, menu, levels, playing, paused, win, lose, complete
    this.waitingForRestart = false;
    this.fistStartTime = 0;
    this.completedLevels = [];

    this.gestureState = {
      indexTip: { x: 0, y: 0 },
      middleTip: { x: 0, y: 0 },
      palmBase: { x: 0, y: 0 },
      fist: false,
      fingersUp: 0,
      clickActive: false,
      lastClickTime: 0,
      hoverButton: null,
      vGesture: false,
    };

    this.hands = null;
    this.camera = null;
    this.cameraStarted = false;

    this.levelSpeeds = {
      1: { x: 8, y: -8 },
      2: { x: 12, y: -12 },
      3: { x: 16, y: -16 },
    };

    // loop y listeners
    this.gameLoop();
    this.setupStartButton();
    this.attachMenuListeners();
  }

  // ---------- UTILIDADES ----------
  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    if (canvasElement) {
      canvasElement.width = window.innerWidth;
      canvasElement.height = window.innerHeight;
    }
    // mantener plataforma dentro
    if (this.platform) {
      if (this.platform.x + this.platform.width > this.canvas.width) {
        this.platform.x = Math.max(0, this.canvas.width - this.platform.width);
      }
      this.platform.y = this.canvas.height - 120;
    }
  }

  createFallbackImageElement(width, height, color, name = '') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;

    if (name === 'ball' || (width === height)) {
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, width, height);
      if (name === 'brick') {
        ctx.strokeStyle = '#aa0000';
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, width, height);
      }
    }

    const img = new Image();
    img.src = canvas.toDataURL();
    return img;
  }

  // ---------- INICIO / CAMBIOS DE PANTALLA ----------
  setupStartButton() {
    if (startGameButton) {
      startGameButton.addEventListener('click', () => {
        this.startApp();
      });
    }
  }

  startApp() {
    // transición visual
    if (introScreen) introScreen.style.display = 'none';
    if (gameScreen) gameScreen.style.display = 'block';

    // asegurarse de cambiar estado para que no bloquee hover
    this.gameState = 'menu';

    // iniciar mediapipe + bricks (async)
    this.init().catch(err => console.error('init error', err));

    // mostrar menú principal
    this.showMainMenu();
  }

  // ---------- MEDIA PIPE (seguro) ----------
  async init() {
    // create bricks immediately so menu shows correct values
    this.createBricks();

    // inicie mediapipe en background pero protegido
    await this.setupMediaPipe();
  }

  async setupMediaPipe() {
    // Si no hay video o libs, salir sin romper la app
    try {
      if (typeof Hands === 'undefined' || typeof Camera === 'undefined' || !videoElement) {
        console.warn('MediaPipe Hands/Camera no disponibles — el control por gestos quedará deshabilitado.');
        return;
      }

      // Evitar reiniciar cámara si ya está inicializada
      if (this.cameraStarted) {
        console.log('camera already started');
        return;
      }

      // crea instancia de Hands (usa locateFile a CDN)
      try {
        this.hands = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });
      } catch (err) {
        console.error('Error creando Hands:', err);
        this.hands = null;
        return;
      }

      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.hands.onResults(this.onHandResults.bind(this));

      // iniciar la cámara con la API de MediaPipe Camera
      try {
        this.camera = new Camera(videoElement, {
          onFrame: async () => {
            if (!this.hands) return;
            await this.hands.send({ image: videoElement });
          },
          width: window.innerWidth,
          height: window.innerHeight,
        });

        await this.camera.start();
        this.cameraStarted = true;
        console.log('Camera started');
      } catch (err) {
        console.error('Error starting Camera:', err);
        this.camera = null;
        this.cameraStarted = false;
      }
    } catch (error) {
      console.error('Error setupMediaPipe:', error);
      this.hands = null;
      this.camera = null;
      this.cameraStarted = false;
    }
  }

  stopCamera() {
    try {
      if (this.camera && this.camera.stream) {
        this.camera.stream.getTracks().forEach((t) => t.stop());
      } else if (videoElement && videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach(t => t.stop());
      }
    } catch (err) {
      console.warn('stopCamera error', err);
    } finally {
      this.cameraStarted = false;
    }
  }

  // ---------- PROCESS RESULTS (draw + gestures) ----------
  onHandResults(results) {
    if (!canvasCtx || !canvasElement) return; // chequeo de seguridad

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (results.image) {
      // dibuja camera frame en canvas de salida
      canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    }

    if (results.multiHandLandmarks) {
      for (const landmarks of results.multiHandLandmarks) {
        this.drawHandLandmarks(landmarks);
        this.processHandLandmarks(landmarks);
      }
    }

    canvasCtx.restore();
  }

  drawHandLandmarks(landmarks) {
    if (!canvasCtx || !canvasElement) return;
    const HAND_CONNECTIONS = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],
      [0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],
      [5,9],[9,13],[13,17]
    ];

    canvasCtx.strokeStyle = '#00ff00';
    canvasCtx.lineWidth = 4;
    for (const connection of HAND_CONNECTIONS) {
      const [start, end] = connection;
      canvasCtx.beginPath();
      canvasCtx.moveTo(landmarks[start].x * canvasElement.width, landmarks[start].y * canvasElement.height);
      canvasCtx.lineTo(landmarks[end].x * canvasElement.width, landmarks[end].y * canvasElement.height);
      canvasCtx.stroke();
    }

    canvasCtx.fillStyle = '#ff0000';
    for (const landmark of landmarks) {
      canvasCtx.beginPath();
      canvasCtx.arc(landmark.x * canvasElement.width, landmark.y * canvasElement.height, 6, 0, 2 * Math.PI);
      canvasCtx.fill();
    }
  }

  processHandLandmarks(landmarks) {
    // landmarks son coordenadas normalizadas [0..1]
    const wrist = landmarks[0];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];

    if (!canvasElement) return;

    this.gestureState.palmBase = {
      x: (1 - wrist.x) * canvasElement.width,
      y: wrist.y * canvasElement.height,
    };

    this.gestureState.indexTip = {
      x: (1 - indexTip.x) * canvasElement.width,
      y: indexTip.y * canvasElement.height,
    };

    this.gestureState.middleTip = {
      x: (1 - middleTip.x) * canvasElement.width,
      y: middleTip.y * canvasElement.height,
    };

    this.gestureState.fingersUp = this.countFingersUp(landmarks);
    this.gestureState.fist = this.isFist(landmarks);
    this.gestureState.vGesture = this.isVGesture(landmarks);

    const clickDistance = Math.hypot(
      this.gestureState.indexTip.x - this.gestureState.middleTip.x,
      this.gestureState.indexTip.y - this.gestureState.middleTip.y
    );

    const now = Date.now();
    if (clickDistance < 40 && !this.gestureState.clickActive && (now - this.gestureState.lastClickTime) > 500) {
      this.gestureState.clickActive = true;
      this.gestureState.lastClickTime = now;
      this.handleGestureClick();
    } else if (clickDistance >= 40) {
      this.gestureState.clickActive = false;
    }

    // actualizar UI pequeña
    const fc = document.getElementById('fingersCount');
    if (fc) fc.textContent = this.gestureState.fingersUp;

    let estado = '🖐️ MOVIMIENTO - Plataforma';
    if (this.gestureState.fist) estado = '✊ PUÑO - Pausa';
    else if (clickDistance < 40) estado = '👆 CLIC - Botones';
    else if (this.gestureState.vGesture) estado = '✌️ V - Seleccionar Nivel';

    const gs = document.getElementById('gestureState');
    if (gs) gs.textContent = estado;

    // mover plataforma si se está jugando
    if (this.gameState === 'playing' && !this.waitingForRestart) {
      this.movePlatformWithHand();
    }

    // pausa por puño largo
    if (this.gestureState.fist) {
      if (this.fistStartTime === 0) this.fistStartTime = now;
      else if (this.gameState === 'playing' && !this.waitingForRestart && (now - this.fistStartTime) > 500) {
        this.pauseGame();
        this.fistStartTime = 0;
      }
    } else {
      this.fistStartTime = 0;
    }

    // hover y selección de nivel si estamos en pantalla levels
    this.handleButtonHover();
    if (this.gameState === 'levels' && this.gestureState.vGesture) {
      this.handleLevelSelection();
    }
  }

  // ---------- GESTOS ----------
  isVGesture(landmarks) {
    const indexTip = landmarks[8], middleTip = landmarks[12], ringTip = landmarks[16], pinkyTip = landmarks[20];
    const indexPip = landmarks[6], middlePip = landmarks[10], ringPip = landmarks[14], pinkyPip = landmarks[18];

    const indexUp = indexTip.y < indexPip.y;
    const middleUp = middleTip.y < middlePip.y;
    const ringDown = ringTip.y > ringPip.y;
    const pinkyDown = pinkyTip.y > pinkyPip.y;

    return indexUp && middleUp && ringDown && pinkyDown;
  }

  handleLevelSelection() {
    const levelOptions = document.querySelectorAll('.level-option');
    let selectedLevel = null;

    levelOptions.forEach(option => {
      const rect = option.getBoundingClientRect();
      option.classList.remove('selected');

      if (this.gestureState.indexTip.x >= rect.left &&
          this.gestureState.indexTip.x <= rect.right &&
          this.gestureState.indexTip.y >= rect.top &&
          this.gestureState.indexTip.y <= rect.bottom) {
        option.classList.add('selected');
        selectedLevel = parseInt(option.dataset.level);
      }
    });

    if (selectedLevel && this.gestureState.vGesture) {
      setTimeout(() => {
        if (this.gestureState.vGesture) this.startGame(selectedLevel);
      }, 800);
    }
  }

  countFingersUp(landmarks) {
    let count = 0;
    const fingerTips = [8, 12, 16, 20];
    const fingerPips = [6, 10, 14, 18];

    for (let i = 0; i < fingerTips.length; i++) {
      if (landmarks[fingerTips[i]].y < landmarks[fingerPips[i]].y) count++;
    }

    // pulgar simple heuristic
    if (landmarks[4] && landmarks[3] && landmarks[4].x < landmarks[3].x) count++;

    return count;
  }

  isFist(landmarks) {
    const fingerTips = [8, 12, 16, 20];
    const fingerPips = [6, 10, 14, 18];
    let bent = 0;
    for (let i = 0; i < fingerTips.length; i++) {
      if (landmarks[fingerTips[i]].y > landmarks[fingerPips[i]].y) bent++;
    }
    return bent >= 3;
  }

  movePlatformWithHand() {
    const gameX = this.gestureState.palmBase.x;
    this.platform.x = gameX - this.platform.width / 2;
    if (this.platform.x < 0) this.platform.x = 0;
    if (this.platform.x + this.platform.width > this.canvas.width) {
      this.platform.x = this.canvas.width - this.platform.width;
    }
  }

  handleButtonHover() {
    if (this.gameState === 'intro') return;
    const activeMenus = document.querySelectorAll('.menu');
    let hoverButton = null;

    activeMenus.forEach(menu => {
      const style = window.getComputedStyle(menu);
      if (style.display !== 'none') {
        const buttons = menu.querySelectorAll('.menu-button, .level-option');
        buttons.forEach(button => {
          const rect = button.getBoundingClientRect();
          button.classList.remove('selected');
          if (this.gestureState.indexTip.x >= rect.left &&
              this.gestureState.indexTip.x <= rect.right &&
              this.gestureState.indexTip.y >= rect.top &&
              this.gestureState.indexTip.y <= rect.bottom) {
            hoverButton = button;
            button.classList.add('selected');
          }
        });
      }
    });

    this.gestureState.hoverButton = hoverButton;
  }

  handleGestureClick() {
    if (this.gameState === 'intro') return;
    if (this.gestureState.hoverButton) {
      // efecto visual rápido
      const btn = this.gestureState.hoverButton;
      const old = btn.style.background;
      btn.style.background = '#ffff00';
      setTimeout(() => {
        btn.style.background = old || '';
      }, 200);

      this.handleButtonClick(btn);
    }
  }

  // ---------- LADRILLOS / UI ----------
  createBricks() {
    this.bricks = [];
    const rows = 2;
    const cols = 8;
    const brickWidth = 120;
    const brickHeight = 45;
    const padding = 8;
    const totalWidth = cols * (brickWidth + padding) - padding;
    const startX = (this.canvas.width - totalWidth) / 2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        this.bricks.push({
          x: startX + col * (brickWidth + padding),
          y: 100 + row * (brickHeight + padding),
          width: brickWidth,
          height: brickHeight,
          active: true,
        });
      }
    }
  }

  async showLifeLostMessage() {
    if (this.lives > 0) {
      const message = document.getElementById('lifeLostMessage');
      const text = document.getElementById('lifeLostText');
      const timer = document.getElementById('lifeLostTimer');

      if (!message || !text || !timer) return;

      text.textContent = `Te quedan ${this.lives} vidas`;
      message.style.display = 'block';

      for (let i = 3; i > 0; i--) {
        timer.textContent = `Continuando en ${i} segundos...`;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      message.style.display = 'none';
      this.waitingForRestart = false;

      this.ball.x = this.canvas.width / 2;
      this.ball.y = this.canvas.height - 180;
      this.ball.speedX = this.levelSpeeds[this.level].x;
      this.ball.speedY = this.levelSpeeds[this.level].y;
    }
  }

  startGame(level) {
    this.level = level || 1;
    this.lives = 3;
    this.score = 0;
    this.gameState = 'playing';
    this.waitingForRestart = false;

    const speed = this.levelSpeeds[this.level] || this.levelSpeeds[1];
    this.ball.speedX = speed.x;
    this.ball.speedY = speed.y;

    this.ball.x = this.canvas.width / 2;
    this.ball.y = this.canvas.height - 180;
    this.ball.active = true;

    this.createBricks();
    this.hideAllMenus();
    this.updateUI();
  }

  handleButtonClick(button) {
    const action = button.dataset.action || button.dataset.level;
    switch (action) {
      case 'start':
        this.startGame(1);
        break;
      case 'levels':
        this.showLevelsMenu();
        break;
      case 'exit':
        this.exitToIntroScreen();
        break;
      case 'back':
        this.showMainMenu();
        break;
      case 'resume':
        this.resumeGame();
        break;
      case 'menu':
        this.showMainMenu();
        break;
      case 'nextLevel':
        this.nextLevel();
        break;
      case 'retry':
        this.retryLevel();
        break;
      case '1':
      case '2':
      case '3':
        this.startGame(parseInt(action));
        break;
      default:
        // si el botón es un level-option (dataset.level)
        if (button.dataset.level) {
          this.startGame(parseInt(button.dataset.level));
        }
        break;
    }
  }

  exitToIntroScreen() {
    this.gameState = 'intro';
    this.hideAllMenus();
    if (gameScreen) gameScreen.style.display = 'none';
    if (introScreen) introScreen.style.display = 'flex';
    // detener la cámara
    this.stopCamera();
  }

  nextLevel() {
    if (this.level < 3) this.startGame(this.level + 1);
    else this.showWinMenu();
  }

  retryLevel() {
    this.startGame(this.level);
  }

  pauseGame() {
    if (this.gameState === 'playing' && !this.waitingForRestart) {
      this.gameState = 'paused';
      this.showPauseMenu();
    }
  }

  resumeGame() {
    if (this.gameState === 'paused') {
      this.gameState = 'playing';
      this.hideAllMenus();
    }
  }

  showMainMenu() {
    this.gameState = 'menu';
    this.hideAllMenus();
    const m = document.getElementById('mainMenu');
    if (m) m.style.display = 'block';
  }

  showLevelsMenu() {
    this.gameState = 'levels';
    this.hideAllMenus();
    const m = document.getElementById('levelsMenu');
    if (m) m.style.display = 'block';
  }

  showPauseMenu() {
    this.hideAllMenus();
    const m = document.getElementById('pauseMenu');
    if (m) m.style.display = 'block';
  }

  showWinMenu() {
    this.gameState = 'win';
    this.hideAllMenus();

    if (!this.completedLevels.includes(this.level)) this.completedLevels.push(this.level);

    if (this.completedLevels.length === 3) {
      this.showGameCompleteMenu();
    } else {
      const title = document.getElementById('winTitle');
      if (title) title.textContent = `¡Ganaste el Nivel ${this.level}!`;
      const scoreEl = document.getElementById('winScore');
      if (scoreEl) scoreEl.textContent = this.score;

      const nextLevelButton = document.querySelector('#winMenu [data-action="nextLevel"]');
      if (nextLevelButton) {
        if (this.level < 3) {
          nextLevelButton.textContent = `CONTINUAR NIVEL ${this.level + 1}`;
          nextLevelButton.style.display = 'block';
        } else {
          nextLevelButton.textContent = '¡JUEGO COMPLETADO!';
          nextLevelButton.style.display = 'none';
        }
      }

      const winMenu = document.getElementById('winMenu');
      if (winMenu) winMenu.style.display = 'block';
    }
  }

  showGameCompleteMenu() {
    this.gameState = 'complete';
    this.hideAllMenus();
    const t = document.getElementById('completeTitle');
    if (t) t.textContent = '¡FELICIDADES!';
    const st = document.getElementById('completeSubtitle');
    if (st) st.textContent = 'Has completado todos los niveles';
    const sc = document.getElementById('completeScore');
    if (sc) sc.textContent = this.score;
    const menu = document.getElementById('gameCompleteMenu');
    if (menu) menu.style.display = 'block';
  }

  showLoseMenu() {
    this.gameState = 'lose';
    this.hideAllMenus();
    const lv = document.getElementById('loseLevel');
    if (lv) lv.textContent = this.level;
    const sc = document.getElementById('loseScore');
    if (sc) sc.textContent = this.score;
    const menu = document.getElementById('loseMenu');
    if (menu) menu.style.display = 'block';
  }

  hideAllMenus() {
    const menus = document.querySelectorAll('.menu, .life-lost-message');
    menus.forEach(m => m.style.display = 'none');
  }

  updateUI() {
    const l = document.getElementById('livesCount');
    if (l) l.textContent = this.lives;
    const s = document.getElementById('scoreCount');
    if (s) s.textContent = this.score;
    const lv = document.getElementById('levelCount');
    if (lv) lv.textContent = this.level;
  }

  update() {
    if (this.gameState !== 'playing' || this.waitingForRestart) return;

    // mover pelota
    this.ball.x += this.ball.speedX;
    this.ball.y += this.ball.speedY;

    // paredes
    if (this.ball.x - this.ball.radius <= 0 || this.ball.x + this.ball.radius >= this.canvas.width) {
      this.ball.speedX = -this.ball.speedX;
    }
    if (this.ball.y - this.ball.radius <= 0) {
      this.ball.speedY = -this.ball.speedY;
    }

    // abajo - perdemos vida
    if (this.ball.y + this.ball.radius >= this.canvas.height) {
      this.lives--;
      this.updateUI();
      if (this.lives <= 0) {
        this.gameState = 'lose';
        this.showLoseMenu();
      } else {
        this.waitingForRestart = true;
        this.showLifeLostMessage();
      }
    }

    // colisión con plataforma
    if (this.ball.y + this.ball.radius >= this.platform.y &&
        this.ball.y - this.ball.radius <= this.platform.y + this.platform.height &&
        this.ball.x >= this.platform.x &&
        this.ball.x <= this.platform.x + this.platform.width) {

      this.ball.speedY = -Math.abs(this.ball.speedY);
      const hitPos = (this.ball.x - this.platform.x) / this.platform.width;
      this.ball.speedX = 15 * (hitPos - 0.5);
    }

    // colisiones ladrillos
    for (let brick of this.bricks) {
      if (brick.active && this.checkCollision(brick)) {
        brick.active = false;
        this.ball.speedY = -this.ball.speedY;
        this.score += 10;
        this.updateUI();
      }
    }

    const activeBricks = this.bricks.filter(b => b.active);
    if (activeBricks.length === 0) {
      this.gameState = 'win';
      this.showWinMenu();
    }
  }

  checkCollision(brick) {
    return this.ball.x + this.ball.radius >= brick.x &&
           this.ball.x - this.ball.radius <= brick.x + brick.width &&
           this.ball.y + this.ball.radius >= brick.y &&
           this.ball.y - this.ball.radius <= brick.y + brick.height;
  }

  draw() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // plataforma
    const platformImg = (this.images.platform && this.images.platform.complete) ? this.images.platform : this._fallbacks.platform;
    if (platformImg) {
      this.ctx.drawImage(platformImg, this.platform.x, this.platform.y, this.platform.width, this.platform.height);
    } else {
      // fallback básico
      this.ctx.fillStyle = '#0f0';
      this.ctx.fillRect(this.platform.x, this.platform.y, this.platform.width, this.platform.height);
    }

    // bola
    const ballImg = (this.images.ball && this.images.ball.complete) ? this.images.ball : this._fallbacks.ball;
    if (ballImg) {
      this.ctx.drawImage(ballImg, this.ball.x - this.ball.radius, this.ball.y - this.ball.radius, this.ball.radius * 2, this.ball.radius * 2);
    } else {
      this.ctx.beginPath();
      this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // bricks
    const brickImg = (this.images.brick && this.images.brick.complete) ? this.images.brick : this._fallbacks.brick;
    for (let brick of this.bricks) {
      if (!brick.active) continue;
      if (brickImg) {
        this.ctx.drawImage(brickImg, brick.x, brick.y, brick.width, brick.height);
      } else {
        this.ctx.fillStyle = '#a00';
        this.ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
      }
    }
  }

  gameLoop() {
    this.update();
    this.draw();
    requestAnimationFrame(() => this.gameLoop());
  }

  // ---------- listeners de menú y delegación ----------
  attachMenuListeners() {
    // menu-button clicks normales
    const menuButtons = document.querySelectorAll('.menu-button');
    menuButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleButtonClick(btn);
      });
    });

    // level-option click (clic normal)
    const levelOptions = document.querySelectorAll('.level-option');
    levelOptions.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.preventDefault();
        // simular dataset.level
        if (opt.dataset && opt.dataset.level) {
          this.startGame(parseInt(opt.dataset.level));
        }
      });
    });

    // permitir volver a intro con ESC (útil para debugging)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.exitToIntroScreen();
      }
    });
  }
}

// arrancar
window.addEventListener('DOMContentLoaded', () => {
  // Si el script se carga antes de los elementos, asegurar que existen
  try {
    new RompeBloquesGame();
  } catch (err) {
    console.error('Error iniciando RompeBloquesGame:', err);
  }
});
