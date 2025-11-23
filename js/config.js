// ===== HIER FESTLEGEN =====
export const SECRET_INVITE_CODE = "FamRei2025"; 
// ==========================

export const APP_VERSION = "2.9.0"; // Stats Update

// ===== Wasch-Karma Einstellungen =====
export const KARMA_START = 100;       
export const KARMA_MAX = 150;         
export const KARMA_REGEN_AMOUNT = 20; 
export const KARMA_REGEN_INTERVAL = 7 * 24 * 60 * 60 * 1000; 

// Kosten & Boni
export const COST_SLOT_NORMAL = -10;
export const COST_SLOT_PRIME = -20;   
export const BONUS_SWAP_ACCEPT = 15;  
export const BONUS_CANCEL_EARLY = 5;  
export const PENALTY_CANCEL_LATE = -5;

// Status-Grenzen
export const LIMIT_VIP = 80;          
export const LIMIT_LOW = 40;          

// ===== MINIGAME SETTINGS =====
export const GAME_POINTS_TO_KARMA_RATIO = 1000; 
export const MAX_KARMA_REWARD_PER_GAME = 5;    
export const MAX_MINIGAME_KARMA_PER_WEEK = 10; 

export const MINIGAME_BASE_SPEED = 3.0;        
export const MINIGAME_SPEED_INCREMENT = 0.3;   
export const MINIGAME_DIFFICULTY_INTERVAL = 500;
export const DIFFICULTY_BAD_ITEM_SCALING = 0.0003; 

export const POWERUP_DURATION = 600; 
export const MAGNET_DURATION = 600; 

export const MINIGAME_SUNSET_SCORE = 500; 
export const MINIGAME_NIGHT_SCORE = 1000;  

export const MINIGAME_SKY_COLORS = {
    day: { top: [135, 206, 235], bottom: [224, 247, 250] },    
    sunset: { top: [255, 127, 80], bottom: [255, 218, 185] },  
    night: { top: [25, 25, 112], bottom: [75, 0, 130] }        
};

// ===== NEU: FEATURE TOGGLES (Freischaltung) =====
// Setze diese auf TRUE, um sie für ALLE sichtbar zu machen.
// Solange sie FALSE sind, sieht sie nur der Admin.
export const FEATURE_PUBLIC_HEATMAP = false;     
export const FEATURE_PUBLIC_USER_STATS = false;  
export const FEATURE_PUBLIC_GAME_STATS = false;