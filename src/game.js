const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement ? canvasElement.getContext('2d') : null; // Añadir chequeo

// **********************************************
// NUEVAS REFERENCIAS DE PANTALLAS
// **********************************************
const introScreen = document.getElementById('introScreen');
const gameScreen = document.getElementById('gameScreen');
const startGameButton = document.getElementById('startGame'); 
// **********************************************


class RompeBloquesGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if(canvasElement) { // Solo si el canvas existe
            canvasElement.width = window.innerWidth;
            canvasElement.height = window.innerHeight;
        }
        
        this.images = {
            platform: new Image(),
            ball: new Image(), 
            brick: new Image()
        };

        // Asegúrate que las rutas sean correctas, si están en la raíz del proyecto
        this.images.platform.src = '/tierra.png';
        this.images.ball.src = '/esfera.png';
        this.images.brick.src = '/ladrillo.png';

        this.setupFallbackImages();

        this.platform = {
            x: this.canvas.width / 2 - 120,
            y: this.canvas.height - 120,
            width: 240,
            height: 35
        };
        
        this.ball = {
            x: this.canvas.width / 2,
            y: this.canvas.height - 180,
            radius: 25,
            speedX: 8,
            speedY: -8,
            active: false
        };
        
        this.bricks = [];
        this.lives = 3;
        this.score = 0;
        this.level = 1;
        this.gameState = 'intro'; // Estado inicial: intro
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
            vGesture: false
        };
        
        this.hands = null;
        this.camera = null;
        
        this.levelSpeeds = {
            1: { x: 8, y: -8 },
            2: { x: 12, y: -12 },
            3: { x: 16, y: -16 }
        };
        
        // Inicialización diferida: solo crea el loop, la camara y los ladrillos se crean al iniciar el juego
        this.gameLoop();
        this.setupStartButton();
    }
    
    // **********************************************
    // NUEVA FUNCIÓN PARA GESTIONAR LA TRANSICIÓN
    // **********************************************
    setupStartButton() {
        if (startGameButton) {
            startGameButton.addEventListener('click', () => {
                this.startApp();
            });
        }
    }

    startApp() {
    // 1. Esconder la pantalla de introducción
    introScreen.style.display = 'none';

    // 2. Mostrar la pantalla de juego
    gameScreen.style.display = 'block';

    // 3. Cambiar el estado (esto es lo que faltaba)
    this.gameState = "menu";

    // 4. Inicializar MediaPipe + ladrillos
    this.init();

    // 5. Mostrar el menú principal para poder jugar
    this.showMainMenu();
}
    
    // **********************************************
    // FIN NUEVA FUNCIÓN
    // **********************************************


    setupFallbackImages() {
        this.createFallbackImage('platform', 240, 35, '#00ff00');
        this.createFallbackImage('ball', 50, 50, '#ffffff');
        this.createFallbackImage('brick', 100, 40, '#ff0000');
    }

    createFallbackImage(name, width, height, color) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = color;
        
        if (name === 'ball') {
            ctx.beginPath();
            ctx.arc(width/2, height/2, width/2, 0, Math.PI * 2);
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
        
        this.images[name].onerror = () => {
            this.images[name] = img;
        };
    }
    
    async init() {
        // Inicializa MediaPipe solo cuando se va a usar el juego
        await this.setupMediaPipe();
        this.createBricks();
    }
    
    async setupMediaPipe() {
        try {
            if (typeof Hands === 'undefined' || typeof Camera === 'undefined' || !videoElement) {
                console.error('MediaPipe Hands, Camera o videoElement no están definidos.');
                return;
            }

            this.hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });
            
            this.hands.setOptions({
                maxNumHands: 2,
                modelComplexity: 1,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            
            this.hands.onResults(this.onHandResults.bind(this));
            
            this.camera = new Camera(videoElement, {
                onFrame: async () => {
                    await this.hands.send({ image: videoElement });
                },
                width: window.innerWidth,
                height: window.innerHeight
            });
            
            await this.camera.start();
            
        } catch (error) {
            console.error('Error MediaPipe:', error);
        }
    }
    
    onHandResults(results) {
        if (!canvasCtx) return; // Chequeo de seguridad

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        if (results.image) {
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
            canvasCtx.moveTo(
                landmarks[start].x * canvasElement.width,
                landmarks[start].y * canvasElement.height
            );
            canvasCtx.lineTo(
                landmarks[end].x * canvasElement.width,
                landmarks[end].y * canvasElement.height
            );
            canvasCtx.stroke();
        }
        
        canvasCtx.fillStyle = '#ff0000';
        for (const landmark of landmarks) {
            canvasCtx.beginPath();
            canvasCtx.arc(
                landmark.x * canvasElement.width,
                landmark.y * canvasElement.height,
                6, 0, 2 * Math.PI
            );
            canvasCtx.fill();
        }
    }
    
    processHandLandmarks(landmarks) {
        const wrist = landmarks[0];
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];

        this.gestureState.palmBase = {
            x: (1 - wrist.x) * canvasElement.width,
            y: wrist.y * canvasElement.height
        };
        
        this.gestureState.indexTip = {
            x: (1 - indexTip.x) * canvasElement.width,
            y: indexTip.y * canvasElement.height
        };
        
        this.gestureState.middleTip = {
            x: (1 - middleTip.x) * canvasElement.width,
            y: middleTip.y * canvasElement.height
        };
        
        this.gestureState.fingersUp = this.countFingersUp(landmarks);
        this.gestureState.fist = this.isFist(landmarks);
        this.gestureState.vGesture = this.isVGesture(landmarks);
        
        const clickDistance = Math.sqrt(
            Math.pow(this.gestureState.indexTip.x - this.gestureState.middleTip.x, 2) +
            Math.pow(this.gestureState.indexTip.y - this.gestureState.middleTip.y, 2)
        );
        
        const now = Date.now();
        
        if (clickDistance < 40 && !this.gestureState.clickActive && 
            (now - this.gestureState.lastClickTime) > 500) {
            this.gestureState.clickActive = true;
            this.gestureState.lastClickTime = now;
            this.handleGestureClick();
        } else if (clickDistance >= 40) {
            this.gestureState.clickActive = false;
        }
        
        document.getElementById('fingersCount').textContent = this.gestureState.fingersUp;
        
        let estado = '🖐️ MOVIMIENTO - Plataforma';
        if (this.gestureState.fist) {
            estado = '✊ PUÑO - Pausa';
        } else if (clickDistance < 40) {
            estado = '👆 CLIC - Botones';
        } else if (this.gestureState.vGesture) {
            estado = '✌️ V - Seleccionar Nivel';
        }
        document.getElementById('gestureState').textContent = estado;
        
        if (this.gameState === 'playing' && !this.waitingForRestart) {
            this.movePlatformWithHand();
        }
        
        if (this.gestureState.fist) {
            if (this.fistStartTime === 0) {
                this.fistStartTime = now;
            } else if (this.gameState === 'playing' && !this.waitingForRestart && (now - this.fistStartTime) > 500) {
                this.pauseGame();
                this.fistStartTime = 0;
            }
        } else {
            this.fistStartTime = 0;
        }
        
        this.handleButtonHover();
        
        if (this.gameState === 'levels' && this.gestureState.vGesture) {
            this.handleLevelSelection();
        }
    }
    
    isVGesture(landmarks) {
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];
        const indexPip = landmarks[6];
        const middlePip = landmarks[10];
        const ringPip = landmarks[14];
        const pinkyPip = landmarks[18];
        
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
                if (this.gestureState.vGesture) {
                    this.startGame(selectedLevel);
                }
            }, 800);
        }
    }
    
    countFingersUp(landmarks) {
        let count = 0;
        const fingerTips = [8, 12, 16, 20];
        const fingerPips = [6, 10, 14, 18];
        
        for (let i = 0; i < fingerTips.length; i++) {
            if (landmarks[fingerTips[i]].y < landmarks[fingerPips[i]].y) {
                count++;
            }
        }
        
        if (landmarks[4].x < landmarks[3].x) count++;
        
        return count;
    }
    
    isFist(landmarks) {
        const fingerTips = [8, 12, 16, 20];
        const fingerPips = [6, 10, 14, 18];
        let bentFingers = 0;
        
        for (let i = 0; i < fingerTips.length; i++) {
            if (landmarks[fingerTips[i]].y > landmarks[fingerPips[i]].y) {
                bentFingers++;
            }
        }
        
        return bentFingers >= 3;
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
        // SOLO MUESTRA HOVER SI NO ESTÁS EN LA PANTALLA INTRO
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
        // El botón de la pantalla de introducción usa el listener estándar, no el gesto
        if (this.gameState === 'intro') return;

        if (this.gestureState.hoverButton) { 
            this.gestureState.hoverButton.style.background = '#ffff00';
            setTimeout(() => {
                if (this.gestureState.hoverButton) {
                    this.gestureState.hoverButton.style.background = '';
                }
            }, 200);
            
            this.handleButtonClick(this.gestureState.hoverButton);
        }
    }
    
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
                    active: true
                });
            }
        }
    }
    
    async showLifeLostMessage() {
        if (this.lives > 0) {
            const message = document.getElementById('lifeLostMessage');
            const text = document.getElementById('lifeLostText');
            const timer = document.getElementById('lifeLostTimer');
            
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
        this.level = level;
        this.lives = 3;
        this.score = 0;
        this.gameState = 'playing';
        this.waitingForRestart = false;
        
        const speed = this.levelSpeeds[level];
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
        
        switch(action) {
            case 'start':
                this.startGame(1);
                break;
            case 'levels':
                this.showLevelsMenu();
                break;
            // **********************************************
            // CAMBIO CLAVE: Volver a la pantalla de INTRO
            // **********************************************
            case 'exit':
                this.exitToIntroScreen();
                break;
            // **********************************************
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
        }
    }

    // **********************************************
    // NUEVA FUNCIÓN PARA SALIR A LA INTRO
    // **********************************************
    exitToIntroScreen() {
        this.gameState = 'intro';
        this.hideAllMenus();
        gameScreen.style.display = 'none';
        introScreen.style.display = 'flex'; // Usar flex para centrar
        
        // Detener la cámara si es necesario
        if (this.camera && this.camera.stream) {
            this.camera.stream.getTracks().forEach(track => track.stop());
        }
    }
    // **********************************************
    // FIN NUEVA FUNCIÓN
    // **********************************************
    
    nextLevel() {
        if (this.level < 3) {
            this.startGame(this.level + 1);
        } else {
            this.showWinMenu();
        }
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
        document.getElementById('mainMenu').style.display = 'block';
    }
    
    showLevelsMenu() {
        this.gameState = 'levels';
        this.hideAllMenus();
        document.getElementById('levelsMenu').style.display = 'block';
    }
    
    showPauseMenu() {
        this.hideAllMenus();
        document.getElementById('pauseMenu').style.display = 'block';
    }
    
    showWinMenu() {
        this.gameState = 'win';
        this.hideAllMenus();
        
        if (!this.completedLevels.includes(this.level)) {
            this.completedLevels.push(this.level);
        }
        
        if (this.completedLevels.length === 3) {
            this.showGameCompleteMenu();
        } else {
            document.getElementById('winTitle').textContent = `¡Ganaste el Nivel ${this.level}!`;
            document.getElementById('winScore').textContent = this.score;
            
            const nextLevelButton = document.querySelector('#winMenu [data-action="nextLevel"]');
            if (this.level < 3) {
                nextLevelButton.textContent = `CONTINUAR NIVEL ${this.level + 1}`;
                nextLevelButton.style.display = 'block';
            } else {
                nextLevelButton.textContent = '¡JUEGO COMPLETADO!';
                nextLevelButton.style.display = 'none';
            }
            
            document.getElementById('winMenu').style.display = 'block';
        }
    }
    
    showGameCompleteMenu() {
        this.gameState = 'complete';
        this.hideAllMenus();
        document.getElementById('completeTitle').textContent = '¡FELICIDADES!';
        document.getElementById('completeSubtitle').textContent = 'Has completado todos los niveles';
        document.getElementById('completeScore').textContent = this.score;
        document.getElementById('gameCompleteMenu').style.display = 'block';
    }
    
    showLoseMenu() {
        this.gameState = 'lose';
        this.hideAllMenus();
        document.getElementById('loseLevel').textContent = this.level;
        document.getElementById('loseScore').textContent = this.score;
        document.getElementById('loseMenu').style.display = 'block';
    }
    
    hideAllMenus() {
        const menus = document.querySelectorAll('.menu, .life-lost-message');
        menus.forEach(menu => menu.style.display = 'none');
    }
    
    updateUI() {
        document.getElementById('livesCount').textContent = this.lives;
        document.getElementById('scoreCount').textContent = this.score;
        document.getElementById('levelCount').textContent = this.level;
    }
    
    update() {
        if (this.gameState !== 'playing' || this.waitingForRestart) return;
        
        this.ball.x += this.ball.speedX;
        this.ball.y += this.ball.speedY;
        
        if (this.ball.x - this.ball.radius <= 0 || 
            this.ball.x + this.ball.radius >= this.canvas.width) {
            this.ball.speedX = -this.ball.speedX;
        }
        
        if (this.ball.y - this.ball.radius <= 0) {
            this.ball.speedY = -this.ball.speedY;
        }
        
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
        
        if (this.ball.y + this.ball.radius >= this.platform.y &&
            this.ball.y - this.ball.radius <= this.platform.y + this.platform.height &&
            this.ball.x >= this.platform.x &&
            this.ball.x <= this.platform.x + this.platform.width) {
            
            this.ball.speedY = -Math.abs(this.ball.speedY);
            const hitPos = (this.ball.x - this.platform.x) / this.platform.width;
            this.ball.speedX = 15 * (hitPos - 0.5);
        }
        
        for (let brick of this.bricks) {
            if (brick.active && this.checkCollision(brick)) {
                brick.active = false;
                this.ball.speedY = -this.ball.speedY;
                this.score += 10;
                this.updateUI();
            }
        }
        
        const activeBricks = this.bricks.filter(brick => brick.active);
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
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.images.platform.complete) {
            this.ctx.drawImage(this.images.platform, this.platform.x, this.platform.y, this.platform.width, this.platform.height);
        }
        
        if (this.images.ball.complete) {
            this.ctx.drawImage(this.images.ball, this.ball.x - this.ball.radius, this.ball.y - this.ball.radius, this.ball.radius * 2, this.ball.radius * 2);
        }
        
        this.bricks.forEach(brick => {
            if (brick.active && this.images.brick.complete) {
                this.ctx.drawImage(this.images.brick, brick.x, brick.y, brick.width, brick.height);
            }
        });
    }
    
    gameLoop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new RompeBloquesGame();
});