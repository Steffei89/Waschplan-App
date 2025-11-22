
import { db, collection, addDoc, updateDoc, doc, serverTimestamp } from '../firebase.js';
import { getState } from '../state.js';
import { APP_VERSION } from '../config.js';

let currentSessionId = null;
let sessionStartTime = 0;
let lastPath = 'login';

/**
 * Startet eine neue Sitzung, wenn der User sich einloggt oder die App öffnet.
 */
export async function startSession() {
    const { currentUser } = getState();
    if (!currentUser) return;

    try {
        // Geräte-Infos sammeln
        const userAgent = navigator.userAgent;
        const isMobile = /iPhone|iPad|iPod|Android/i.test(userAgent);
        const screenRes = `${window.screen.width}x${window.screen.height}`;
        
        sessionStartTime = Date.now();

        const sessionData = {
            userId: currentUser.uid,              // Eindeutige ID
            email: currentUser.userData.email,    // User-Name
            partei: currentUser.userData.partei || "Unbekannt",
            
            startTime: serverTimestamp(),
            lastActive: serverTimestamp(),
            
            deviceType: isMobile ? "Mobile" : "Desktop",
            screenResolution: screenRes,
            browserInfo: getBrowserName(userAgent),
            appVersion: APP_VERSION,
            
            durationSeconds: 0,
            path_history: ['start'] // Wir speichern grob, wo er war
        };

        // Speichert in eigener Collection "analytics_sessions"
        const docRef = await addDoc(collection(db, "analytics_sessions"), sessionData);
        currentSessionId = docRef.id;
        console.log("Analytics: Session gestartet für", currentUser.userData.email);

    } catch (e) {
        console.error("Analytics Start Error:", e);
    }
}

/**
 * Aktualisiert die aktuelle Sitzung (Heartbeat).
 */
export async function updateSession(newPath = null) {
    if (!currentSessionId) return;

    const now = Date.now();
    const duration = Math.floor((now - sessionStartTime) / 1000); // Sekunden

    const updates = {
        lastActive: serverTimestamp(),
        durationSeconds: duration
    };

    if (newPath && newPath !== lastPath) {
        updates.last_view = newPath;
        lastPath = newPath;
    }

    try {
        const sessionRef = doc(db, "analytics_sessions", currentSessionId);
        await updateDoc(sessionRef, updates);
    } catch (e) {
        // Silent fail (Offline etc.)
    }
}

function getBrowserName(agent) {
    if (agent.includes("Chrome")) return "Chrome";
    if (agent.includes("Safari") && !agent.includes("Chrome")) return "Safari";
    if (agent.includes("Firefox")) return "Firefox";
    if (agent.includes("Edge")) return "Edge";
    return "Other";
}