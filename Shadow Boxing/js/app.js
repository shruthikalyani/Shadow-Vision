import {
    FilesetResolver,
    PoseLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs";

// ========================================
// ELEMENTS
// ========================================

const startButton = document.getElementById("startButton");
const cameraFeed = document.getElementById("cameraFeed");
const cameraContainer = document.getElementById("cameraContainer");
const poseCanvas = document.getElementById("poseCanvas");
const targetLayer = document.getElementById("targetLayer");

const cameraStatus = document.getElementById("cameraStatus");
const visionStatus = document.getElementById("visionStatus");
const activityStatus = document.getElementById("activityStatus");
const trackingStatus = document.getElementById("trackingStatus");

const movementCount = document.getElementById("movementCount");
const sessionTime = document.getElementById("sessionTime");
const gameSpeed = document.getElementById("gameSpeed");
const targetStatus = document.getElementById("targetStatus");

const ctx = poseCanvas.getContext("2d");

// ========================================
// GAME SETTINGS
// ========================================

const BASE_TARGET_INTERVAL = 1800;
const MIN_TARGET_INTERVAL = 650;
const TARGET_RADIUS = 55;

let cameraStream = null;
let poseLandmarker = null;

let animationFrame = null;
let timerInterval = null;
let targetTimeout = null;
let targetExpiryTimeout = null;

let gameRunning = false;
let sessionStartTime = 0;
let totalMovements = 0;

let currentTarget = null;
let currentTargetPosition = null;

// ========================================
// BODY CONNECTIONS
// ========================================

const connections = [
    [11, 12],
    [11, 13], [13, 15],
    [12, 14], [14, 16],
    [11, 23], [12, 24],
    [23, 24],
    [23, 25], [25, 27],
    [24, 26], [26, 28]
];

// ========================================
// VISION ENGINE
// ========================================

async function initializeVision() {

    visionStatus.textContent = "LOADING";

    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    poseLandmarker = await PoseLandmarker.createFromOptions(
        vision,
        {
            baseOptions: {
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
            },

            runningMode: "VIDEO",
            numPoses: 1,

            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
        }
    );

    visionStatus.textContent = "ONLINE";
    visionStatus.style.color = "#b6ff3b";

    trackingStatus.textContent = "POSE TRACKING // ACTIVE";

    startGame();
    detectPose();
}

// ========================================
// CAMERA
// ========================================

async function startCamera() {

    if (gameRunning) return;

    try {

        startButton.disabled = true;
        startButton.textContent = "CONNECTING...";

        cameraStatus.textContent = "REQUESTING";

        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Camera API unavailable. Use localhost.");
        }

        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        });

        cameraFeed.srcObject = cameraStream;

        await cameraFeed.play();

        cameraContainer.classList.add("camera-active");

        cameraStatus.textContent = "CONNECTED";
        cameraStatus.style.color = "#b6ff3b";

        activityStatus.textContent = "INITIALIZING";
        trackingStatus.textContent = "POSE TRACKING // LOADING";

        startButton.textContent = "LOADING VISION...";

        await initializeVision();

        startButton.textContent = "SESSION ACTIVE";

    } catch (error) {

        console.error("Startup error:", error);

        cameraStatus.textContent = "ERROR";
        visionStatus.textContent = "ERROR";
        activityStatus.textContent = "SYSTEM ERROR";

        startButton.textContent = "RETRY SESSION";
        startButton.disabled = false;

        alert("Could not start Shadow Vision: " + error.message);
    }
}

// ========================================
// START GAME
// ========================================

function startGame() {

    gameRunning = true;

    totalMovements = 0;
    sessionStartTime = Date.now();

    movementCount.textContent = "000";
    sessionTime.textContent = "00:00";

    activityStatus.textContent = "ACTIVE";
    activityStatus.style.color = "#b6ff3b";

    targetStatus.textContent = "ACTIVE";
    targetStatus.style.color = "#b6ff3b";

    // Start session timer
    timerInterval = setInterval(updateTimer, 1000);

    // Start target generator
    scheduleNextTarget();
}

// ========================================
// SESSION TIMER
// ========================================

function updateTimer() {

    if (!gameRunning) return;

    const elapsedSeconds = Math.floor(
        (Date.now() - sessionStartTime) / 1000
    );

    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;

    sessionTime.textContent =
        String(minutes).padStart(2, "0") +
        ":" +
        String(seconds).padStart(2, "0");

    updateGameSpeed();
}

// ========================================
// DIFFICULTY SYSTEM
// ========================================

function getTargetInterval() {

    const elapsedSeconds =
        (Date.now() - sessionStartTime) / 1000;

    // Targets gradually become faster over time
    const difficultySteps = Math.floor(elapsedSeconds / 15);

    return Math.max(
        MIN_TARGET_INTERVAL,
        BASE_TARGET_INTERVAL - difficultySteps * 100
    );
}

function updateGameSpeed() {

    const interval = getTargetInterval();

    const multiplier = BASE_TARGET_INTERVAL / interval;

    gameSpeed.textContent = multiplier.toFixed(1) + "x";
}

// ========================================
// RANDOM TARGET GENERATOR
// ========================================

function scheduleNextTarget() {

    if (!gameRunning) return;

    const delay = 300;

    targetTimeout = setTimeout(() => {
        spawnTarget();
    }, delay);
}


function spawnTarget() {

    if (!gameRunning) return;

    removeCurrentTarget();

    const target = document.createElement("div");

    target.className = "game-target";

    // Keep targets away from the extreme edges
    const x = 12 + Math.random() * 76;
    const y = 15 + Math.random() * 70;

    target.style.left = x + "%";
    target.style.top = y + "%";

    targetLayer.appendChild(target);

    currentTarget = target;

    currentTargetPosition = {
        x: x / 100,
        y: y / 100
    };

    targetStatus.textContent = "TARGET ACTIVE";

    // Target disappears sooner as difficulty increases
    const lifetime = Math.max(
        550,
        getTargetInterval() * 0.85
    );

    targetExpiryTimeout = setTimeout(() => {

        if (!currentTarget) return;

        removeCurrentTarget();

        targetStatus.textContent = "TARGET MISSED";

        scheduleNextTarget();

    }, lifetime);
}

// ========================================
// REMOVE TARGET
// ========================================

function removeCurrentTarget() {

    if (targetExpiryTimeout) {
        clearTimeout(targetExpiryTimeout);
        targetExpiryTimeout = null;
    }

    if (currentTarget) {
        currentTarget.remove();
        currentTarget = null;
    }

    currentTargetPosition = null;
}

// ========================================
// TARGET HIT DETECTION
// ========================================

function checkTargetReach(landmarks) {

    if (!gameRunning || !currentTargetPosition) return;

    const width = targetLayer.clientWidth;
    const height = targetLayer.clientHeight;

    if (!width || !height) return;

    // MediaPipe wrist landmarks:
    // 15 = left wrist
    // 16 = right wrist

    const wrists = [
        landmarks[15],
        landmarks[16]
    ];

    for (const wrist of wrists) {

        if (!wrist) continue;

        const confidence = wrist.visibility ?? 1;

        if (confidence < 0.5) continue;

        // Convert mirrored camera coordinates to screen coordinates
        const wristX = (1 - wrist.x) * width;
        const wristY = wrist.y * height;

        const targetX = currentTargetPosition.x * width;
        const targetY = currentTargetPosition.y * height;

        const distance = Math.sqrt(
            Math.pow(wristX - targetX, 2) +
            Math.pow(wristY - targetY, 2)
        );

        if (distance < TARGET_RADIUS) {
            registerTargetHit();
            return;
        }
    }
}

// ========================================
// REGISTER SUCCESSFUL REACH
// ========================================

function registerTargetHit() {

    if (!currentTarget) return;

    // Visual hit feedback
    currentTarget.classList.add("hit");

    totalMovements++;

    movementCount.textContent =
        String(totalMovements).padStart(3, "0");

    targetStatus.textContent = "TARGET HIT";

    currentTarget = null;
    currentTargetPosition = null;

    if (targetExpiryTimeout) {
        clearTimeout(targetExpiryTimeout);
        targetExpiryTimeout = null;
    }

    // Spawn next target shortly after a successful reach
    targetTimeout = setTimeout(() => {

        if (!gameRunning) return;

        spawnTarget();

    }, 300);
}

// ========================================
// POSE VISUALIZATION
// ========================================

function drawPose(landmarks) {

    const width = cameraFeed.videoWidth;
    const height = cameraFeed.videoHeight;

    if (!width || !height) return;

    if (
        poseCanvas.width !== width ||
        poseCanvas.height !== height
    ) {
        poseCanvas.width = width;
        poseCanvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);

    if (!landmarks) return;

    // Draw body connections
    ctx.strokeStyle = "#b6ff3b";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#b6ff3b";
    ctx.shadowBlur = 10;

    connections.forEach(([start, end]) => {

        const a = landmarks[start];
        const b = landmarks[end];

        if (!a || !b) return;

        if (
            (a.visibility ?? 0) < 0.5 ||
            (b.visibility ?? 0) < 0.5
        ) return;

        ctx.beginPath();

        ctx.moveTo(a.x * width, a.y * height);
        ctx.lineTo(b.x * width, b.y * height);

        ctx.stroke();
    });

    // Draw body landmarks
    ctx.fillStyle = "#ffffff";

    landmarks.forEach(point => {

        if ((point.visibility ?? 0) < 0.5) return;

        ctx.beginPath();

        ctx.arc(
            point.x * width,
            point.y * height,
            5,
            0,
            Math.PI * 2
        );

        ctx.fill();
    });

    ctx.shadowBlur = 0;
}

// ========================================
// LIVE POSE DETECTION
// ========================================

function detectPose() {

    if (!gameRunning) return;

    if (
        !poseLandmarker ||
        cameraFeed.readyState < 2
    ) {
        animationFrame = requestAnimationFrame(detectPose);
        return;
    }

    try {

        const results = poseLandmarker.detectForVideo(
            cameraFeed,
            performance.now()
        );

        const landmarks = results.landmarks?.[0];

        if (landmarks) {

            drawPose(landmarks);
            checkTargetReach(landmarks);

        } else {

            drawPose(null);
        }

    } catch (error) {

        console.error("Pose detection error:", error);
    }

    animationFrame = requestAnimationFrame(detectPose);
}

// ========================================
// START BUTTON
// ========================================

startButton.addEventListener("click", startCamera);