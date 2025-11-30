// ============================
// GAME.JS FINAL COMPATIBLE
// ============================

let video = null;
let canvas = null;
let ctx = null;
let hands = null;
let camera = null;

let gameCanvas = null;
let gtx = null;

let platformX = 300;
const platformWidth = 150;

// Inicialización general
window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("startGame").addEventListener("click", startApp);
});

// ============================
// INICIAR TODO
// ============================
async function startApp() {
    document.getElementById("introScreen").style.display = "none";
    document.getElementById("gameScreen").style.display = "block";

    await setupCamera();
    setupHands();
    loop();
}

// ============================
// CONFIGURAR CÁMARA
// ============================
async function setupCamera() {
    video = document.getElementById("webcam");

    const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 }
    });

    video.srcObject = stream;

    return new Promise(resolve => {
        video.onloadedmetadata = () => resolve();
    });
}

// ============================
// CONFIGURAR MEDIAPIPE HANDS
// ============================
function setupHands() {
    canvas = document.getElementById("output_canvas");
    ctx = canvas.getContext("2d");

    gameCanvas = document.getElementById("gameCanvas");
    gtx = gameCanvas.getContext("2d");

    let config = {
        locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    };

    hands = new Hands(config);

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
    });

    hands.onResults(onResults);

    camera = new Camera(video, {
        onFrame: async () => {
            await hands.send({ image: video });
        },
        width: 1280,
        height: 720
    });

    camera.start();
}

// ============================
// PROCESAR RESULTADOS DE MANO
// ============================
function onResults(results) {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dibujar video
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        let lm = results.multiHandLandmarks[0];

        // Dibujar landmarks
        drawConnectors(ctx, lm, HAND_CONNECTIONS, { color: "#00FF00" });
        drawLandmarks(ctx, lm, { color: "#FF0000", radius: 4 });

        movePlatform(lm);
    }

    ctx.restore();
}

// ============================
// MOVER PLATAFORMA
// ============================
function movePlatform(landmarks) {
    const x = landmarks[9].x; // Punto intermedio de la mano
    platformX = x * gameCanvas.width;
}

// ============================
// LOOP PRINCIPAL DEL JUEGO
// ============================
function loop() {
    requestAnimationFrame(loop);

    gtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

    // Dibujar plataforma
    gtx.fillStyle = "#00ff00";
    gtx.fillRect(platformX - platformWidth / 2, gameCanvas.height - 40, platformWidth, 20);
}
