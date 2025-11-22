import { 
    db, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, Timestamp 
} from '../firebase.js';
import { 
    KARMA_START, KARMA_MAX, KARMA_REGEN_AMOUNT, KARMA_REGEN_INTERVAL,
    COST_SLOT_NORMAL, COST_SLOT_PRIME, LIMIT_VIP, LIMIT_LOW,
    GAME_POINTS_TO_KARMA_RATIO, MAX_KARMA_REWARD_PER_GAME, MAX_MINIGAME_KARMA_PER_WEEK // Neu importiert
} from '../config.js';
import { showMessage } from '../ui.js';
import { getState } from '../state.js';
import { getWeekNumber } from '../utils.js'; // Import für Wochenberechnung

/**
 * Gibt den aktuellen Karma-Stand und den Status zurück.
 */
export function getKarmaStatus(karmaPoints) {
    if (karmaPoints >= LIMIT_VIP) return { status: 'VIP', weeks: 4, canPrime: true, label: '💎 VIP' };
    if (karmaPoints >= LIMIT_LOW) return { status: 'Standard', weeks: 2, canPrime: true, label: '🙂 Standard' };
    return { status: 'Eingeschränkt', weeks: 1, canPrime: false, label: '⚠️ Eingeschränkt' };
}

/**
 * Prüft beim App-Start, ob eine Partei initialisiert ist.
 */
export async function initKarmaForParty(parteiName) {
    if (!parteiName) return;
    
    const partyRef = doc(db, "parties", parteiName);
    const partySnap = await getDoc(partyRef);
    const now = Date.now();

    // 1. Initialisierung
    if (!partySnap.exists()) {
        console.log(`Initialisiere Karma für Partei: ${parteiName}...`);
        let startKarma = KARMA_START;

        const todayStr = new Date().toISOString().split('T')[0];
        const q = query(collection(db, "bookings"), where("partei", "==", parteiName));
        const snapshot = await getDocs(q);
        let deduction = 0;
        
        snapshot.forEach(docSnap => {
            const b = docSnap.data();
            if (b.date >= todayStr) {
                const dateObj = new Date(b.date);
                const isWeekend = (dateObj.getDay() === 0 || dateObj.getDay() === 6);
                deduction += (isWeekend ? Math.abs(COST_SLOT_PRIME) : Math.abs(COST_SLOT_NORMAL));
            }
        });

        const initialKarma = startKarma - deduction;
        
        await setDoc(partyRef, {
            karma: initialKarma,
            last_karma_update: Timestamp.now(),
            minigame_earned_this_week: 0, // Neu initialisieren
            minigame_last_played_week: ""
        });
        return;
    }

    // 2. Wöchentliche Regeneration
    const partyData = partySnap.data();
    let currentKarma = partyData.karma;
    let lastUpdate = partyData.last_karma_update ? partyData.last_karma_update.toMillis() : 0;

    if (now - lastUpdate > KARMA_REGEN_INTERVAL) {
        if (currentKarma < KARMA_MAX) {
            let newKarma = currentKarma + KARMA_REGEN_AMOUNT;
            if (newKarma > KARMA_MAX) newKarma = KARMA_MAX;
            
            await updateDoc(partyRef, {
                karma: newKarma,
                last_karma_update: Timestamp.now()
            });
        } else {
            await updateDoc(partyRef, { last_karma_update: Timestamp.now() });
        }
    }
}

export async function getPartyKarma(parteiName) {
    if (!parteiName) return KARMA_START;
    try {
        const partySnap = await getDoc(doc(db, "parties", parteiName));
        if (partySnap.exists()) {
            return partySnap.data().karma;
        }
    } catch (e) {
        console.error("Fehler beim Laden des Party-Karmas:", e);
    }
    return KARMA_START;
}

export async function updateKarma(parteiName, amount, reason) {
    if (!parteiName) return;
    try {
        const partyRef = doc(db, "parties", parteiName);
        const snap = await getDoc(partyRef);
        
        let oldKarma = KARMA_START;
        if (snap.exists()) oldKarma = snap.data().karma;
        else await setDoc(partyRef, { karma: KARMA_START, last_karma_update: Timestamp.now() });

        let newKarma = oldKarma + amount;
        await updateDoc(partyRef, { karma: newKarma });
        console.log(`Karma Update für ${parteiName} (${reason}): ${oldKarma} -> ${newKarma}`);
        
    } catch (e) {
        console.error("Fehler beim Karma-Update:", e);
    }
}

export async function checkBookingPermission(dateStr, slot) {
    const { currentUser } = getState();
    if (!currentUser) return { allowed: false, error: "Nicht eingeloggt" };
    
    const parteiName = currentUser.userData.partei;
    const karma = await getPartyKarma(parteiName);
    const { weeks, canPrime } = getKarmaStatus(karma);

    const bookingDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const diffTime = Math.abs(bookingDate - today);
    const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7)); 

    if (diffWeeks > weeks) {
        return { allowed: false, error: `Euer Partei-Karma erlaubt Buchungen nur ${weeks} Woche(n) im Voraus.` };
    }

    const isWeekend = (bookingDate.getDay() === 0 || bookingDate.getDay() === 6);
    if (isWeekend && !canPrime) {
        const diffHours = (bookingDate - new Date()) / (1000 * 60 * 60);
        if (diffHours > 24) {
            return { allowed: false, error: "Euer Karma-Status erlaubt am Wochenende nur kurzfristige Buchungen (24h vorher)." };
        }
    }

    const cost = isWeekend ? COST_SLOT_PRIME : COST_SLOT_NORMAL;
    if (karma + cost < 0) { 
        return { allowed: false, error: `Nicht genug Karma-Punkte (${karma}). Benötigt: ${Math.abs(cost)}.` };
    }

    return { allowed: true, cost: cost };
}

// ===== NEU: MINIGAME REWARD LOGIK MIT WOCHENLIMIT =====
export async function processMinigameReward(parteiName, score) {
    if (!parteiName || score <= 0) return 0;

    const partyRef = doc(db, "parties", parteiName);

    try {
        const partySnap = await getDoc(partyRef);
        if (!partySnap.exists()) return 0;

        const data = partySnap.data();
        const currentKarma = data.karma || KARMA_START;

        // 1. Berechne den "theoretischen" Gewinn dieser Runde (max 5)
        let potential = Math.floor(score / GAME_POINTS_TO_KARMA_RATIO);
        if (potential > MAX_KARMA_REWARD_PER_GAME) potential = MAX_KARMA_REWARD_PER_GAME;

        if (potential <= 0) return 0;

        // 2. Ermittle aktuelle Kalenderwoche
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentWeek = getWeekNumber(now);
        const weekId = `${currentYear}-W${currentWeek}`; // z.B. "2025-W48"

        // 3. Prüfe, was diese Woche schon gewonnen wurde
        let storedWeekId = data.minigame_last_played_week || "";
        let earnedThisWeek = data.minigame_earned_this_week || 0;

        // Falls neue Woche: Zähler zurücksetzen
        if (storedWeekId !== weekId) {
            earnedThisWeek = 0;
        }

        // 4. Berechne, wie viel bis zum Limit (10) noch übrig ist
        const remainingAllowance = MAX_MINIGAME_KARMA_PER_WEEK - earnedThisWeek;
        
        // Der tatsächliche Gewinn ist das Minimum aus Potenzial und Restlimit
        let actualReward = Math.min(potential, remainingAllowance);
        if (actualReward < 0) actualReward = 0;

        // 5. Speichern (nur wenn Gewinn > 0)
        if (actualReward > 0) {
            await updateDoc(partyRef, {
                karma: currentKarma + actualReward,
                minigame_last_played_week: weekId,
                minigame_earned_this_week: earnedThisWeek + actualReward
            });
            console.log(`Minigame: +${actualReward} Karma. (Wochenstand: ${earnedThisWeek + actualReward}/${MAX_MINIGAME_KARMA_PER_WEEK})`);
        } else {
            console.log(`Minigame: Kein Karma gewonnen (Wochenlimit erreicht).`);
        }

        return actualReward; // Gibt zurück, wie viel tatsächlich gutgeschrieben wurde

    } catch (e) {
        console.error("Fehler bei Minigame Karma:", e);
        return 0;
    }
}