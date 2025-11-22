import { messaging, getToken, onMessage, doc, updateDoc, db, arrayUnion } from '../firebase.js';
import { getState } from '../state.js';
import { showMessage } from '../ui.js';

const VAPID_KEY = "BDYYVt3HarS6Ex9rnRVEalXjYvPbKZLCxFppym90rlnugDh4CS4lpk1ENW_b3Pr9YecmVrDJTzpuQVSQq42PzFs"; 

export async function initPushNotifications() {
    const { currentUser } = getState();
    if (!currentUser) {
        alert("Fehler: Nicht eingeloggt.");
        return;
    }

    // SICHERHEITS-CHECK 1: Unterstützt der Browser überhaupt Notifications?
    if (!('Notification' in window)) {
        alert("⚠️ Dein iPhone unterstützt Push in diesem Modus nicht.\n\nLÖSUNG:\n1. Tippe unten auf 'Teilen'.\n2. Wähle 'Zum Home-Bildschirm'.\n3. Öffne die App über das neue Icon.");
        return;
    }

    try {
        // DEBUG: Permission Status vorher prüfen
        // alert("Status: " + Notification.permission);

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            alert("Fehler: Berechtigung verweigert. Bitte in iOS Einstellungen -> Waschplan -> Mitteilungen aktivieren.");
            return;
        }

        // SICHERHEITS-CHECK 2: Service Worker
        if (!('serviceWorker' in navigator)) {
            alert("Fehler: Service Worker nicht unterstützt.");
            return;
        }

        const registration = await navigator.serviceWorker.ready;
        if (!registration) {
            alert("Fehler: Service Worker nicht bereit.");
            return;
        }

        const currentToken = await getToken(messaging, { 
            vapidKey: VAPID_KEY, 
            serviceWorkerRegistration: registration 
        });
        
        if (currentToken) {
            console.log("FCM Token:", currentToken);
            await saveTokenToDatabase(currentToken);
            alert("✅ ERFOLG! Dein iPhone ist registriert.\nJetzt App schließen und GitHub-Test starten.");
        } else {
            alert("Fehler: Kein Token erhalten.");
        }

        onMessage(messaging, (payload) => {
            const title = payload.notification.title;
            const body = payload.notification.body;
            showMessage('main-menu-message', `🔔 ${title}: ${body}`, 'success', 8000);
        });

    } catch (err) {
        alert("CRASH: " + err.message);
        console.error('Push Error:', err);
    }
}

async function saveTokenToDatabase(token) {
    const { currentUser } = getState();
    if (!currentUser) return;

    const userRef = doc(db, "users", currentUser.uid);
    try {
        await updateDoc(userRef, {
            fcmTokens: arrayUnion(token),
            lastTokenUpdate: new Date().toISOString()
        });
    } catch(e) {
        console.error("DB Save Error", e);
    }
}