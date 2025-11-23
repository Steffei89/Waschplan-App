import * as dom from '../dom.js';
import { db, collection, addDoc, query, orderBy, limit, getDocs, setDoc, doc, getDoc, serverTimestamp, deleteDoc, writeBatch } from '../firebase.js';
import { getState } from '../state.js';
import { processMinigameReward } from './karma.js'; 
import { 
    GAME_POINTS_TO_KARMA_RATIO, 
    MAX_KARMA_REWARD_PER_GAME, 
    MINIGAME_BASE_SPEED, 
    MINIGAME_SPEED_INCREMENT,
    MINIGAME_DIFFICULTY_INTERVAL,
    MINIGAME_SKY_COLORS,
    MINIGAME_SUNSET_SCORE,
    MINIGAME_NIGHT_SCORE,
    POWERUP_DURATION,
    MAGNET_DURATION, 
    DIFFICULTY_BAD_ITEM_SCALING
} from '../config.js';

let ctx;
let animationFrameId;
let isGameRunning = false;
let isPaused = false; 
let isMuted = false; 

let score = 0;
let highscore = 0; 
let highscoreBroken = false; 
let gameSpeed = MINIGAME_BASE_SPEED || 3;
let spawnRate = 70;
let frames = 0;

// Statistik-Tracking
let gameStartTime = 0;
let maxComboInGame = 0;

// Delta Time
let lastTime = 0;
let spawnAccumulator = 0; 
let difficultyTimer = 0; 

// Audio
let audioCtx = null;

// Cache für Performance (Pre-Rendering)
let machineCache = document.createElement('canvas');
let machineCacheCtx = machineCache.getContext('2d');
let machineCacheCreated = false;

// Objekte
// NEU: targetX für smoothere Maus/Touch Steuerung
let basket = { x: 0, y: 0, width: 80, baseWidth: 80, height: 50, tilt: 0, speed: 8, scaleX: 1, scaleY: 1, prevX: 0, targetX: null };
let items = []; 
let particles = []; 
let floatingTexts = []; 
let stars = [];

// Game State
let comboCount = 0;
let isComboMode = false;

// Powerups
let powerupTimer = 0; 
let isPowerupActive = false; 
let isMagnetActive = false;  
let magnetTimer = 0;

let machineRotation = 0; 
let machineShake = 0;    

const keys = { left: false, right: false };

// Items Definition
const ITEMS_TYPES = [
    { type: 'good', symbol: '🧦', points: 10, weight: 0.4, color: '#FF69B4', sound: 'pop' },
    { type: 'good', symbol: '🧸', points: 30, weight: 0.1, color: '#FFD700', sound: 'bonus' }, 
    { type: 'good', symbol: '👕', points: 20, weight: 0.2, color: '#00BFFF', sound: 'pop' },
    { type: 'good', symbol: '🫧', points: 5, weight: 0.1, color: '#E0FFFF', sound: 'bubble' }, 
    { type: 'powerup', symbol: '🧴', points: 5, weight: 0.04, color: '#0000FF', sound: 'powerup' }, 
    { type: 'magnet', symbol: '🧲', points: 5, weight: 0.03, color: '#FF0000', sound: 'powerup' }, 
    { type: 'bad', symbol: '🦠', points: -20, weight: 0.1, color: '#32CD32', sound: 'bad' },
    { type: 'deadly', symbol: '🍷', points: 0, weight: 0.1, color: '#8B0000', sound: 'crash' }  
];

export async function initMinigame() {
    if (!dom.gameCanvas) {
        console.error("Game Canvas nicht gefunden!");
        return;
    }
    ctx = dom.gameCanvas.getContext('2d');
    resizeCanvas();
    
    // Sterne für Nachtmodus generieren
    if (stars.length === 0) {
        for(let i=0; i<50; i++) {
            stars.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                size: Math.random() * 2,
                blink: Math.random()
            });
        }
    }

    // Cache vorbereiten
    prerenderWashingMachine();

    const rulesText = document.getElementById('minigame-rules-text');
    if (rulesText) {
        rulesText.textContent = `${GAME_POINTS_TO_KARMA_RATIO} Punkte = 1 Karma (Max ${MAX_KARMA_REWARD_PER_GAME})`;
    }

    window.addEventListener('resize', () => {
        resizeCanvas();
        prerenderWashingMachine();
    });
    
    window.addEventListener('blur', () => {
        if (isGameRunning && !isPaused) {
            togglePause();
        }
    });
    
    const moveHandler = (clientX) => {
        if (isPaused || !isGameRunning) return; 
        if (dom.tutorialOverlay && dom.tutorialOverlay.style.display !== 'none') dom.tutorialOverlay.style.display = 'none';

        const rect = dom.gameCanvas.getBoundingClientRect();
        const x = clientX - rect.left;
        
        // NEU: Wir setzen nur das Ziel, die Bewegung macht der Loop
        basket.targetX = x - basket.width / 2;
    };

    dom.gameCanvas.addEventListener('mousemove', (e) => moveHandler(e.clientX));
    dom.gameCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        moveHandler(e.touches[0].clientX);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
        if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && isGameRunning) togglePause();
        if (e.key === 'm' || e.key === 'M') toggleMute();
    });
    
    window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    });

    const startBtn = document.getElementById('start-game-btn');
    const restartBtn = document.getElementById('restart-game-btn');
    if(startBtn) startBtn.addEventListener('click', () => initAudioAndStart());
    if(restartBtn) restartBtn.addEventListener('click', () => initAudioAndStart());

    const quitGameOverBtn = document.getElementById('quit-game-over-btn');
    if(quitGameOverBtn) quitGameOverBtn.addEventListener('click', quitToMenu);

    if(dom.gamePauseBtn) dom.gamePauseBtn.addEventListener('click', togglePause);
    if(dom.gameMuteBtn) dom.gameMuteBtn.addEventListener('click', toggleMute); 

    if(dom.resumeGameBtn) dom.resumeGameBtn.addEventListener('click', resumeGameWithCountdown);
    if(dom.restartGameBtnPause) dom.restartGameBtnPause.addEventListener('click', () => {
        togglePause(); 
        startGameWithCountdown();
    });
    if(dom.quitGameBtn) dom.quitGameBtn.addEventListener('click', quitToMenu);
    
    await loadLeaderboard();
    await fetchMyHighscore();
}

function initAudioAndStart() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    startGameWithCountdown();
}

function prerenderWashingMachine() {
    machineCache.width = 120; 
    machineCache.height = 140;
    const ctx = machineCacheCtx;
    ctx.clearRect(0, 0, 120, 140);
    
    ctx.save();
    ctx.translate(60, 70); 

    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.ellipse(0, 55, 55, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f8f8f8";
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 4;
    roundRect(ctx, -50, -60, 100, 120, 12, true, true);

    ctx.fillStyle = "#eee";
    roundRect(ctx, -45, -55, 90, 25, 5, true, false);
    
    ctx.fillStyle = "#bbb";
    ctx.beginPath();
    ctx.arc(-30, -43, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4a4a4a";
    roundRect(ctx, -10, -50, 45, 15, 2, true, false);

    ctx.fillStyle = "#ddd";
    ctx.strokeStyle = "#bbb";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 10, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const glassGrad = ctx.createLinearGradient(-20, -10, 20, 30);
    glassGrad.addColorStop(0, "#a6c1ee");
    glassGrad.addColorStop(1, "#84a9e3");
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.arc(0, 10, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.ellipse(-10, 0, 10, 5, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    machineCacheCreated = true;
}

function toggleMute() {
    isMuted = !isMuted;
    const icon = dom.gameMuteBtn.querySelector('i');
    if(icon) {
        if (isMuted) {
            icon.className = 'fa-solid fa-volume-xmark';
        } else {
            icon.className = 'fa-solid fa-volume-high';
        }
    }
}

// ===== SOUND ENGINE =====
function playSound(type) {
    if (isMuted || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'pop') {
        osc.type = 'sine';
        const freq = isComboMode ? 600 : 400; 
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq + 200, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'bubble') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(500, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'bonus') {
        playTone(600, 'sine', 0.2);
        setTimeout(() => playTone(800, 'sine', 0.2), 100);
        setTimeout(() => playTone(1200, 'sine', 0.4), 200);
    } else if (type === 'powerup') {
        playTone(300, 'square', 0.1);
        setTimeout(() => playTone(400, 'square', 0.1), 100);
        setTimeout(() => playTone(500, 'square', 0.1), 200);
        setTimeout(() => playTone(800, 'square', 0.3), 300);
    } else if (type === 'bad') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
        vibrate(200); 
    } else if (type === 'crash') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
        vibrate([100, 50, 100, 50, 400]); 
    } else if (type === 'gameover') {
        playTone(400, 'triangle', 0.3);
        setTimeout(() => playTone(300, 'triangle', 0.3), 300);
        setTimeout(() => playTone(200, 'triangle', 0.6), 600);
    } else if (type === 'combo_start') {
        playTone(300, 'square', 0.1);
        setTimeout(() => playTone(400, 'square', 0.1), 100);
        setTimeout(() => playTone(600, 'square', 0.3), 200);
    } else if (type === 'highscore') {
        playTone(523, 'square', 0.1); 
        setTimeout(() => playTone(659, 'square', 0.1), 100); 
        setTimeout(() => playTone(784, 'square', 0.1), 200); 
        setTimeout(() => playTone(1046, 'square', 0.4), 300); 
    }
}

function playTone(freq, type, duration) {
    if (isMuted || !audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.1, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    o.start(); o.stop(audioCtx.currentTime + duration);
}

function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
}

function resizeCanvas() {
    dom.gameCanvas.width = window.innerWidth;
    dom.gameCanvas.height = window.innerHeight;
    basket.y = dom.gameCanvas.height - 160; 
}

function startGameWithCountdown() {
    dom.gameStartScreen.style.display = 'none';
    dom.gameOverScreen.style.display = 'none';
    if(dom.gamePauseMenu) dom.gamePauseMenu.style.display = 'none';
    dom.gameContainer.style.display = 'flex'; 
    if(dom.gamePauseBtn) dom.gamePauseBtn.style.display = 'none'; 
    if(dom.gameMuteBtn) dom.gameMuteBtn.style.display = 'none';

    isGameRunning = true; 
    isPaused = true;      
    
    lastTime = performance.now();
    spawnAccumulator = 0;
    difficultyTimer = 0;
    
    score = 0;
    gameSpeed = MINIGAME_BASE_SPEED || 3; 
    items = [];
    particles = [];
    floatingTexts = [];
    frames = 0; 
    
    comboCount = 0;
    isComboMode = false;
    maxComboInGame = 0;
    
    isPowerupActive = false;
    powerupTimer = 0;
    isMagnetActive = false;
    magnetTimer = 0;
    
    basket.width = basket.baseWidth;
    highscoreBroken = false;
    machineRotation = 0;
    machineShake = 0;
    basket.scaleX = 1;
    basket.scaleY = 1;
    basket.prevX = basket.x;
    basket.targetX = null; // Reset
    keys.left = false;
    keys.right = false;
    
    gameStartTime = Date.now(); // Startzeit setzen
    
    document.getElementById('game-score-display').textContent = `Score: 0`;
    
    drawScene(); 

    runCountdown(() => {
        isPaused = false;
        lastTime = performance.now();
        
        if(dom.gamePauseBtn) dom.gamePauseBtn.style.display = 'flex';
        if(dom.gameMuteBtn) dom.gameMuteBtn.style.display = 'flex';
        if(dom.tutorialOverlay) dom.tutorialOverlay.style.display = 'flex';
        loop();
    });
}

function resumeGameWithCountdown() {
    if(dom.gamePauseMenu) dom.gamePauseMenu.style.display = 'none';
    runCountdown(() => {
        isPaused = false;
        lastTime = performance.now(); 
        if(dom.gamePauseBtn) dom.gamePauseBtn.style.display = 'flex';
        if(dom.gameMuteBtn) dom.gameMuteBtn.style.display = 'flex';
        loop();
    });
}

function runCountdown(onComplete) {
    const el = dom.countdownDisplay;
    if(!el) { onComplete(); return; }
    el.style.display = 'block';
    let count = 3;
    el.textContent = count;
    
    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            el.textContent = count;
            el.style.animation = 'none';
            el.offsetHeight; 
            el.style.animation = 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            playTone(600 + (3-count)*100, 'sine', 0.1);
        } else {
            clearInterval(interval);
            el.textContent = "GO!";
            playTone(1000, 'square', 0.3);
            setTimeout(() => {
                el.style.display = 'none';
                onComplete();
            }, 500);
        }
    }, 800);
}

function togglePause() {
    if (!isGameRunning) return;
    isPaused = !isPaused;
    if (isPaused) {
        cancelAnimationFrame(animationFrameId);
        if(dom.pauseScoreDisplay) dom.pauseScoreDisplay.textContent = score;
        if(dom.gamePauseMenu) dom.gamePauseMenu.style.display = 'block';
        if(dom.gamePauseBtn) dom.gamePauseBtn.style.display = 'none';
        if(dom.gameMuteBtn) dom.gameMuteBtn.style.display = 'none';
    } else {
        if(dom.gamePauseMenu) dom.gamePauseMenu.style.display = 'none';
        if(dom.gamePauseBtn) dom.gamePauseBtn.style.display = 'flex';
        if(dom.gameMuteBtn) dom.gameMuteBtn.style.display = 'flex';
        
        lastTime = performance.now();
        loop();
    }
}

function quitToMenu() {
    isGameRunning = false;
    isPaused = false;
    if(dom.gamePauseMenu) dom.gamePauseMenu.style.display = 'none';
    if(dom.gameOverScreen) dom.gameOverScreen.style.display = 'none';
    
    dom.gameContainer.style.display = 'none';
    dom.gameStartScreen.style.display = 'block';
    loadLeaderboard(); 
}

function loop() {
    if (!isGameRunning || isPaused) return;
    
    const now = performance.now();
    const dt = now - lastTime;
    lastTime = now;
    
    const timeFactor = Math.min(dt / 16.67, 4.0);

    ctx.globalAlpha = 1.0;

    frames += timeFactor; 
    
    machineRotation += 0.1 * timeFactor; 
    if (isComboMode) {
        machineShake = Math.sin(frames * 0.2) * 3; 
    } else {
        machineShake = 0;
    }
    
    if (isPowerupActive) {
        powerupTimer -= timeFactor;
        if (powerupTimer <= 0) {
            isPowerupActive = false;
        }
    }
    if (isMagnetActive) {
        magnetTimer -= timeFactor;
        if (magnetTimer <= 0) isMagnetActive = false;
    }

    // --- NEUER BEWEGUNGS-CODE START ---
    let velocity = 0;
    const moveSpeed = basket.speed * timeFactor;

    // 1. Maus/Touch Ziel verfolgen (weiches Nachziehen)
    if (basket.targetX !== null) {
        // Lerp (Linear Interpolation) für weiche Bewegung: 0.2 ist die "Trägheit"
        const diff = basket.targetX - basket.x;
        if (Math.abs(diff) > 0.5) {
            basket.x += diff * 0.2 * timeFactor; 
        } else {
            basket.x = basket.targetX; // Ziel erreicht
            basket.targetX = null; // Reset
        }
    }

    // 2. Tastatur (überschreibt Maus wenn gedrückt)
    if (keys.left) {
        basket.x -= moveSpeed;
        basket.targetX = null; // Maus-Ziel abbrechen
    } else if (keys.right) {
        basket.x += moveSpeed;
        basket.targetX = null;
    }

    // 3. Tilt und Velocity berechnen (für alle Eingabemethoden gleich!)
    velocity = basket.x - basket.prevX;
    basket.tilt = velocity * 2.0; // Tilt basiert jetzt rein auf der echten Bewegung
    
    // Limits
    limitTilt();
    limitBasketPos();
    
    basket.prevX = basket.x;
    // --- NEUER BEWEGUNGS-CODE ENDE ---
    
    let targetWidth = isPowerupActive ? basket.baseWidth * 1.5 : basket.baseWidth;
    basket.width += (targetWidth - basket.width) * (0.1 * timeFactor);

    const normalizedVel = velocity / timeFactor; 
    const speedFactor = Math.abs(normalizedVel) / basket.speed; 
    let targetScaleX = 1;
    let targetScaleY = 1;

    if (speedFactor > 0.1) {
        targetScaleX = 1 - (speedFactor * 0.15);
        targetScaleY = 1 + (speedFactor * 0.15);
    }
    
    basket.scaleX += (targetScaleX - basket.scaleX) * (0.2 * timeFactor);
    basket.scaleY += (targetScaleY - basket.scaleY) * (0.2 * timeFactor);

    spawnAccumulator += timeFactor;
    let currentSpawnThreshold = isComboMode ? spawnRate / 1.5 : spawnRate;
    
    if (spawnAccumulator >= currentSpawnThreshold) {
        spawnItem();
        spawnAccumulator -= currentSpawnThreshold; 
    }
    
    difficultyTimer += timeFactor;
    const difficultyInterval = MINIGAME_DIFFICULTY_INTERVAL || 500;

    if (difficultyTimer >= difficultyInterval) {
        difficultyTimer -= difficultyInterval; 
        gameSpeed += (MINIGAME_SPEED_INCREMENT || 0.3);
        spawnRate = Math.max(30, spawnRate - 2);
        
        floatingTexts.push({
            x: dom.gameCanvas.width / 2, 
            y: dom.gameCanvas.height / 2, 
            text: "SPEED UP! 🚀", 
            color: "#FF4500", 
            life: 2.0, 
            dy: -1.0 
        });
    }
    
    // ZEICHNEN
    drawBackground(); 
    drawBasketShadow();
    drawBasket3D();
    
    updateItems(timeFactor);
    updateParticles(timeFactor);
    updateFloatingTexts(timeFactor);
    
    if (highscore > 0 && score > highscore && !highscoreBroken) {
        highscoreBroken = true;
        playSound('highscore');
        for(let i=0; i<30; i++) {
            createParticles(dom.gameCanvas.width/2, dom.gameCanvas.height/2, ['✨','🎉','🏆'][Math.floor(Math.random()*3)], 1);
        }
        floatingTexts.push({
            x: dom.gameCanvas.width/2, y: 150, 
            text: "NEUER REKORD!", color: "#FFD700", 
            life: 3.0, dy: -0.5
        });
    }

    if (isComboMode) {
        ctx.save();
        ctx.font = "bold 20px Arial";
        ctx.fillStyle = "#FFD700";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 3;
        ctx.textAlign = "center";
        ctx.strokeText("🔥 SUPER-WASCHGANG! (x2) 🔥", dom.gameCanvas.width/2, 100);
        ctx.fillText("🔥 SUPER-WASCHGANG! (x2) 🔥", dom.gameCanvas.width/2, 100);
        ctx.restore();
    }

    document.getElementById('game-score-display').textContent = `Score: ${score}`;
    animationFrameId = requestAnimationFrame(loop);
}

function drawScene() {
    ctx.globalAlpha = 1.0; 
    drawBackground();
    drawBasketShadow();
    drawBasket3D();
}

function getSkyColor(score) {
    const sunsetScore = MINIGAME_SUNSET_SCORE || 250;
    const nightScore = MINIGAME_NIGHT_SCORE || 500;
    const colors = MINIGAME_SKY_COLORS;

    if (score <= sunsetScore) {
        const factor = score / sunsetScore; 
        return interpolateColor(colors.day.top, colors.sunset.top, factor);
    } else {
        let factor = (score - sunsetScore) / (nightScore - sunsetScore);
        if (factor > 1) factor = 1;
        return interpolateColor(colors.sunset.top, colors.night.top, factor);
    }
}

function getSkyColorBottom(score) {
    const sunsetScore = MINIGAME_SUNSET_SCORE || 250;
    const nightScore = MINIGAME_NIGHT_SCORE || 500;
    const colors = MINIGAME_SKY_COLORS;
    
    if (score <= sunsetScore) {
        const factor = score / sunsetScore;
        return interpolateColor(colors.day.bottom, colors.sunset.bottom, factor);
    } else {
        let factor = (score - sunsetScore) / (nightScore - sunsetScore);
        if (factor > 1) factor = 1;
        return interpolateColor(colors.sunset.bottom, colors.night.bottom, factor);
    }
}

function interpolateColor(color1, color2, factor) {
    const result = color1.slice();
    for (let i = 0; i < 3; i++) {
        result[i] = Math.round(result[i] + factor * (color2[i] - color1[i]));
    }
    return `rgb(${result[0]}, ${result[1]}, ${result[2]})`;
}

function drawBackground() {
    const w = dom.gameCanvas.width;
    const h = dom.gameCanvas.height;
    const horizonY = h - 140;
    
    ctx.clearRect(0, 0, w, h);
    
    const skyGradient = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGradient.addColorStop(0, getSkyColor(score));
    skyGradient.addColorStop(1, getSkyColorBottom(score));
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, w, horizonY);

    let dayProgress = Math.min(score / (MINIGAME_NIGHT_SCORE || 500), 1); 
    if (dayProgress > 0.6) {
        ctx.save();
        ctx.globalAlpha = (dayProgress - 0.6) * 2.5; 
        ctx.fillStyle = "white";
        stars.forEach(star => {
            if(Math.random() > 0.9) star.blink = Math.random();
            ctx.globalAlpha = star.blink * ((dayProgress - 0.6) * 2.5);
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI*2);
            ctx.fill();
        });
        ctx.restore();
    }

    const floorGradient = ctx.createLinearGradient(0, horizonY, 0, h);
    const maxDarkScore = (MINIGAME_NIGHT_SCORE || 500);
    const darknessFactor = Math.min(score / maxDarkScore, 1) * 0.6; 
    const baseGray = 220 - (100 * darknessFactor);
    floorGradient.addColorStop(0, `rgb(${baseGray},${baseGray},${baseGray})`);
    floorGradient.addColorStop(1, `rgb(${baseGray+20},${baseGray+20},${baseGray+20})`);
    ctx.fillStyle = floorGradient;
    ctx.fillRect(0, horizonY, w, h - horizonY);
    
    ctx.strokeStyle = dayProgress > 0.5 ? "rgba(100,100,150,0.3)" : "rgba(150, 150, 200, 0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const y = horizonY + (i * i * 6); 
        if (y > h) break;
        ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    const centerX = w / 2;
    for (let i = -5; i <= 5; i++) {
        const xStart = centerX + i * 80;
        const xEnd = centerX + i * 400; 
        ctx.moveTo(xStart, horizonY); ctx.lineTo(xEnd, h);
    }
    ctx.stroke();
    
    ctx.strokeStyle = dayProgress > 0.5 ? "#444" : "#fff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, horizonY); ctx.lineTo(w, horizonY);
    ctx.stroke();

    drawCachedWashingMachine(centerX + machineShake, horizonY - 50, dayProgress);
}

function drawCachedWashingMachine(x, y, dayProgress) {
    if (!machineCacheCreated) {
        prerenderWashingMachine();
    }

    ctx.save();
    ctx.translate(x, y);
    const scale = 0.8; 
    ctx.scale(scale, scale);
    ctx.translate(-60, -70); 

    const brightness = Math.max(0.4, 1 - (dayProgress * 0.6));
    ctx.filter = `brightness(${brightness})`;

    ctx.drawImage(machineCache, 0, 0);
    ctx.filter = 'none'; 

    const blink = Math.floor(frames / 30) % 2 === 0;
    ctx.fillStyle = isComboMode && blink ? "#ff0000" : "#4a4a4a"; 
    ctx.fillRect(50, 20, 45, 15); 
    ctx.fillStyle = "#00ff00";
    ctx.font = "10px monospace";
    ctx.fillText(isComboMode ? "FAST!" : "0:45", 72, 31);

    ctx.save();
    ctx.translate(60, 80); 
    ctx.rotate(machineRotation); 
    ctx.fillStyle = isComboMode ? "#FF69B4" : "#ffffff"; 
    ctx.beginPath();
    ctx.arc(15, 0, 8, 0, Math.PI * 2);
    ctx.arc(-10, 10, 6, 0, Math.PI * 2);
    ctx.arc(0, -15, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
}

function drawBasketShadow() {
    ctx.fillStyle = "rgba(0,0,0,0.4)"; 
    ctx.beginPath();
    const shadowY = basket.y + basket.height + 10;
    ctx.ellipse(basket.x + basket.width/2, shadowY, (basket.width/2)*basket.scaleX, 10*basket.scaleY, 0, 0, Math.PI * 2);
    ctx.fill();
}

function drawBasket3D() {
    ctx.save();
    const cx = basket.x + basket.width / 2;
    const cy = basket.y + basket.height / 2;
    
    ctx.translate(cx, cy);
    ctx.scale(basket.scaleX, basket.scaleY);
    ctx.rotate(basket.tilt * Math.PI / 180);
    ctx.translate(-cx, -cy);

    const bx = basket.x;
    const by = basket.y;
    const bw = basket.width;
    const bh = basket.height;

    if (isPowerupActive) {
        ctx.shadowColor = "#00BFFF";
        ctx.shadowBlur = 20;
    } else if (isMagnetActive) {
        ctx.shadowColor = "#FF0000";
        ctx.shadowBlur = 20;
    }

    const colorLight = isComboMode ? "#FFD700" : "#D2B48C"; 
    const colorMedium = isComboMode ? "#DAA520" : "#CD853F";
    const colorInside = "#3E2723"; 

    ctx.fillStyle = colorInside;
    ctx.beginPath();
    ctx.ellipse(bx + bw/2, by + 10, bw/2, 10, 0, Math.PI, 0);
    ctx.fill();

    const grad = ctx.createLinearGradient(bx, by, bx + bw, by);
    grad.addColorStop(0, colorMedium);
    grad.addColorStop(0.5, isComboMode ? "#FFFFE0" : "#DEB887"); 
    grad.addColorStop(1, colorMedium);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(bx, by + 10);
    ctx.lineTo(bx + 10, by + bh);
    ctx.lineTo(bx + bw - 10, by + bh);
    ctx.lineTo(bx + bw, by + 10);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = "#5D4037";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + 5, by + 25); ctx.lineTo(bx + bw - 5, by + 25);
    ctx.moveTo(bx + 8, by + 40); ctx.lineTo(bx + bw - 8, by + 40);
    ctx.stroke();

    ctx.fillStyle = isComboMode ? "#F0E68C" : "#F4A460"; 
    ctx.beginPath();
    ctx.ellipse(bx + bw/2, by + 10, bw/2, 10, 0, 0, Math.PI);
    ctx.fill();
    
    ctx.strokeStyle = "#5D4037";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(bx + bw/2, by + 10, bw/2, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    
    if (isComboMode && frames % 5 < 1) { 
        createParticles(bx + Math.random()*bw, by + Math.random()*bh, '✨', 1);
    }
    
    if (isMagnetActive && frames % 10 < 1) {
        createParticles(bx + Math.random()*bw, by + Math.random()*bh, '⚡', 1);
    }

    ctx.restore();
}

function limitBasketPos() {
    if (basket.x < 0) basket.x = 0;
    if (basket.x > dom.gameCanvas.width - basket.width) basket.x = dom.gameCanvas.width - basket.width;
}

function limitTilt() {
    if (basket.tilt > 20) basket.tilt = 20;
    if (basket.tilt < -20) basket.tilt = -20;
}

function spawnItem() {
    const rand = Math.random();
    let cumulative = 0;
    let selected = ITEMS_TYPES[0];
    
    const scaling = (typeof DIFFICULTY_BAD_ITEM_SCALING !== 'undefined') ? DIFFICULTY_BAD_ITEM_SCALING : 0.0003;
    const badFactor = score * scaling;
    
    let currentWeights = ITEMS_TYPES.map(item => {
        let w = item.weight;
        if (item.type === 'bad' || item.type === 'deadly') {
            w += badFactor; 
        }
        return { ...item, adjustedWeight: w };
    });
    
    const totalWeight = currentWeights.reduce((a, b) => a + b.adjustedWeight, 0);
    let randomVal = Math.random() * totalWeight;
    
    for (let item of currentWeights) {
        randomVal -= item.adjustedWeight;
        if (randomVal <= 0) {
            selected = item;
            break;
        }
    }

    items.push({
        x: Math.random() * (dom.gameCanvas.width - 40) + 20,
        y: -50,
        angle: 0,
        spin: (Math.random() - 0.5) * 0.1,
        scale: 0.8 + Math.random() * 0.4, 
        isSquashing: false,
        squashX: 1,
        squashY: 1,
        alpha: 1.0,
        ...selected
    });
}

function updateItems(timeFactor) {
    for (let i = items.length - 1; i >= 0; i--) {
        let item = items[i];
        
        if (item.isSquashing) {
            item.squashX += 0.1 * timeFactor; 
            item.squashY -= 0.1 * timeFactor; 
            item.alpha -= 0.1 * timeFactor;   
            item.y += (gameSpeed * 0.5) * timeFactor; 
            
            if (item.squashY <= 0 || item.alpha <= 0) {
                items.splice(i, 1); 
                continue;
            }
            
            ctx.save();
            ctx.globalAlpha = item.alpha;
            ctx.translate(item.x, item.y);
            ctx.scale(item.squashX, item.squashY);
            ctx.shadowBlur = 10; ctx.shadowColor = item.color;
            ctx.font = "32px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(item.symbol, 0, 0);
            ctx.restore();
            continue; 
        }
        
        if (isMagnetActive && (item.type === 'good' || item.type === 'powerup')) {
            const basketCenterX = basket.x + basket.width / 2;
            const basketCenterY = basket.y + basket.height / 2;
            const dx = basketCenterX - item.x;
            const dy = basketCenterY - item.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist > 0) {
                item.x += (dx / dist) * 4 * timeFactor; 
                item.y += (dy / dist) * 4 * timeFactor; 
            }
        }

        item.y += gameSpeed * timeFactor;
        item.angle += item.spin * timeFactor;
        
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(item.angle);
        ctx.scale(item.scale, item.scale); 
        
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 5; 
        
        ctx.font = "32px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(255,255,255,0.8)"; 
        ctx.strokeText(item.symbol, 0, 0);
        ctx.fillText(item.symbol, 0, 0);
        
        ctx.restore();
        
        const basketMouthY = basket.y + 10;
        
        if (
            item.y > basketMouthY && 
            item.y < basketMouthY + 30 &&
            item.x > basket.x && 
            item.x < basket.x + basket.width
        ) {
            if (item.type === 'deadly') {
                createParticles(item.x, item.y, '💀', 10);
                playSound('crash');
                resetCombo(); 
                gameOver();
                return;
            }
            
            if (item.type === 'powerup') {
                isPowerupActive = true;
                powerupTimer = POWERUP_DURATION || 600;
                playSound('powerup');
                floatingTexts.push({ x: item.x, y: item.y - 40, text: "RIESEN-KORB!", color: "#00BFFF", life: 2.0, dy: -1.0 });
                items.splice(i, 1);
                continue;
            }
            if (item.type === 'magnet') {
                isMagnetActive = true;
                magnetTimer = MAGNET_DURATION || 600;
                playSound('powerup');
                floatingTexts.push({ x: item.x, y: item.y - 40, text: "MAGNET!", color: "#FF0000", life: 2.0, dy: -1.0 });
                items.splice(i, 1);
                continue;
            }

            if (item.points > 0) handleComboSuccess();
            else resetCombo(); 

            playSound(item.sound);
            let effectSymbol = item.points > 0 ? '💕' : '💢';
            if (item.symbol === '🧸') effectSymbol = '✨';
            createParticles(item.x, item.y, effectSymbol, 5);
            
            let pointsEarned = item.points * (isComboMode ? 2 : 1);
            const text = pointsEarned > 0 ? `+${pointsEarned}` : `${pointsEarned}`;
            const color = pointsEarned > 0 ? (isComboMode ? '#FFD700' : '#32CD32') : '#FF0000'; 
            
            floatingTexts.push({
                x: item.x, y: item.y - 40, text: text, color: color, life: 1.0, dy: -1.5 
            });

            score += pointsEarned;
            if (score < 0) score = 0;
            
            item.isSquashing = true;
            item.y = basket.y + 20; 
            continue;
        }
        
        if (item.y > dom.gameCanvas.height + 50) {
            if (item.points > 0) resetCombo(); 
            items.splice(i, 1);
        }
    }
}

function handleComboSuccess() {
    comboCount++;
    if(comboCount > maxComboInGame) maxComboInGame = comboCount;
    if (comboCount >= 5 && !isComboMode) {
        isComboMode = true;
        playSound('combo_start');
        for(let i=0; i<10; i++) {
            createParticles(basket.x + Math.random()*basket.width, basket.y, '🔥', 1);
        }
    }
}

function resetCombo() {
    comboCount = 0;
    isComboMode = false;
}

function updateFloatingTexts(timeFactor) {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i];
        ft.y += ft.dy * timeFactor;
        ft.life -= 0.02 * timeFactor;
        if (ft.life <= 0) { floatingTexts.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = ft.life;
        ctx.fillStyle = ft.color;
        ctx.font = "bold 28px 'Segoe UI', sans-serif"; 
        ctx.lineWidth = 3;
        ctx.strokeStyle = "black";
        ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
    }
}

function createParticles(x, y, symbol, count) {
    for(let i=0; i<count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 1) * 6 - 3, 
            life: 1.0, symbol: symbol
        });
    }
}

function updateParticles(timeFactor) {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx * timeFactor; p.y += p.vy * timeFactor; 
        p.vy += 0.2 * timeFactor; 
        p.life -= 0.02 * timeFactor;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.font = "20px Arial";
        ctx.fillText(p.symbol, p.x, p.y);
        ctx.restore();
    }
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  if (typeof stroke === 'undefined') { stroke = true; }
  if (typeof radius === 'undefined') { radius = 5; }
  if (typeof radius === 'number') { radius = {tl: radius, tr: radius, br: radius, bl: radius}; } else { var defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0}; for (var side in defaultRadius) { radius[side] = radius[side] || defaultRadius[side]; } }
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + width - radius.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  ctx.lineTo(x + width, y + height - radius.br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
  ctx.lineTo(x + radius.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();
  if (fill) { ctx.fill(); }
  if (stroke) { ctx.stroke(); }
}

// ===== NEU: SAVE DATA IN FLAT COLLECTION =====
async function saveGameStats(partei, currentScore, currentMaxCombo, durationSeconds) {
    const { currentUser } = getState();
    if (!currentUser) return;
    try {
        await addDoc(collection(db, "analytics_games"), {
            userId: currentUser.uid,
            email: currentUser.userData.email,
            partei: partei,
            score: currentScore,
            max_combo: currentMaxCombo,
            duration_seconds: durationSeconds,
            timestamp: serverTimestamp() // Benötigt Import von firebase.js
        });
    } catch (e) {
        console.error("Stats Save Error:", e);
    }
}

async function gameOver() {
    isGameRunning = false;
    cancelAnimationFrame(animationFrameId);
    if(dom.gamePauseBtn) dom.gamePauseBtn.style.display = 'none'; 
    if(dom.gameMuteBtn) dom.gameMuteBtn.style.display = 'none';
    
    playSound('gameover'); 
    dom.gameCanvas.style.transform = "translate(5px, 5px)";
    setTimeout(() => dom.gameCanvas.style.transform = "translate(-5px, -5px)", 50);
    setTimeout(() => dom.gameCanvas.style.transform = "none", 100);
    dom.gameOverScreen.style.display = 'block';
    dom.finalScoreDisplay.textContent = score;
    
    const karmaResultBox = dom.karmaWonDisplay.parentElement;
    dom.karmaWonDisplay.textContent = "...";

    const { currentUser } = getState();
    let karmaWon = 0;
    
    if (currentUser && currentUser.userData.partei) {
        const partei = currentUser.userData.partei;
        const duration = (Date.now() - gameStartTime) / 1000;
        
        karmaWon = await processMinigameReward(partei, score);
        await saveHighscore(partei, score);
        // Hier speichern wir jetzt die Stats für den User, nicht in die History Subcollection
        await saveGameStats(partei, score, maxComboInGame, duration);
        await loadLeaderboard();
    }

    dom.karmaWonDisplay.textContent = karmaWon;
    
    if (score >= GAME_POINTS_TO_KARMA_RATIO && karmaWon === 0) {
        karmaResultBox.innerHTML = `<strong>Wochenlimit erreicht (10/10)</strong> 🛑`;
        karmaResultBox.style.backgroundColor = 'var(--secondary-color)';
        karmaResultBox.style.color = 'var(--text-color)';
    } else {
        karmaResultBox.innerHTML = `<strong>+ <span id="karma-won">${karmaWon}</span> Karma gewonnen!</strong> 🌟`;
        karmaResultBox.style.backgroundColor = '#e8f5e9';
        karmaResultBox.style.color = '#2e7d32';
    }
}

// Highscore wird nur geupdated wenn höher
async function saveHighscore(partei, newScore) {
    if (!partei || newScore === 0) return;
    
    // NEU: Wir holen uns den User, um den Namen zu speichern
    const { currentUser } = getState();
    const username = currentUser?.userData?.username || currentUser?.userData?.email || "Unbekannt";

    try {
        // Erst lesen, dann schreiben
        const docRef = doc(db, "minigame_scores", partei);
        const docSnap = await getDoc(docRef);
        
        let currentHigh = 0;
        if(docSnap.exists()) {
            currentHigh = docSnap.data().score || 0;
        }
        
        if (newScore > currentHigh) {
             await setDoc(docRef, {
                partei: partei,
                score: newScore,
                last_played: new Date().toISOString(),
                username: username // <--- NEU: Benutzername speichern
            }, { merge: true });
        }
    } catch (e) {
        console.error("Highscore Error:", e);
    }
}

async function fetchMyHighscore() {
    const { currentUser } = getState();
    if (!currentUser) return;
    const partei = currentUser.userData.partei;
    try {
        const docSnap = await getDoc(doc(db, "minigame_scores", partei));
        if (docSnap.exists()) {
            highscore = docSnap.data().score || 0;
        }
    } catch (e) { highscore = 0; }
}

async function loadLeaderboard() {
    if(!dom.leaderboardList) return;
    dom.leaderboardList.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    try {
        const q = query(collection(db, "minigame_scores"), orderBy("score", "desc"), limit(5));
        const querySnapshot = await getDocs(q);
        let html = '<ol style="list-style: none; padding: 0;">';
        let rank = 1;
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            let medal = '';
            if(rank === 1) medal = '🥇'; else if(rank === 2) medal = '🥈'; else if(rank === 3) medal = '🥉';
            
            // NEU: Anzeige Name + Partei oder nur Partei
            let displayName = data.partei;
            if (data.username) {
                // Wenn Username vorhanden, zeigen wir "Username (Partei)"
                // Wir kürzen den Usernamen, falls er eine E-Mail ist
                let shortName = data.username;
                if (shortName.includes('@')) shortName = shortName.split('@')[0];
                
                displayName = `${shortName} <small style="opacity:0.7; font-weight:normal;">(${data.partei})</small>`;
            }

            html += `<li style="padding: 8px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                        <span>${medal} <strong>${displayName}</strong></span>
                        <span style="color: var(--primary-color); font-weight:bold;">${data.score}</span>
                     </li>`;
            rank++;
        });
        html += '</ol>';
        if (querySnapshot.empty) html = "<p class='small-text'>Noch keine Spieler.</p>";
        dom.leaderboardList.innerHTML = html;
    } catch (e) { dom.leaderboardList.innerHTML = "Fehler."; }
}

// NEUE FUNKTIONEN FÜR ADMIN-VERWALTUNG

export async function deleteMinigameScore(partei) {
    if(!partei) return;
    try {
        await deleteDoc(doc(db, "minigame_scores", partei));
        return true;
    } catch(e) {
        console.error(e);
        return false;
    }
}

export async function resetMinigameLeaderboard() {
    try {
        const q = query(collection(db, "minigame_scores"));
        const snapshot = await getDocs(q);
        
        const batch = writeBatch(db);
        snapshot.forEach(docSnap => {
            batch.delete(docSnap.ref);
        });
        
        await batch.commit();
        return true;
    } catch(e) {
        console.error(e);
        return false;
    }
}