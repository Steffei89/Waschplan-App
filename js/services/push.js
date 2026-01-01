import { messaging, getToken, onMessage, doc, updateDoc, db, arrayUnion } from '../firebase.js';
import { getState } from '../state.js';
import { showMessage } from '../ui.js';

const VAPID_KEY = "BDYYVt3HarS6Ex9rnRVEalXjYvPbKZLCxFppym90rlnugDh4CS4lpk1ENW_b3Pr9YecmVrDJTzpuQVSQq42PzFs"; 

/**
 * Initialisiert Push.
 * @param {boolean} isManualRequest - Wenn true, wurde der Button geklickt (darf fragen). Wenn false, ist es ein Auto-Start (darf nicht nerven).
 */
export async function initPushNotifications(isManualRequest = false) {
    const { currentUser } = getState();
    if (!currentUser) return;

    if (!('Notification' in window)) {
        console.log("Kein Push-Support.");
        if (isManualRequest) alert("Dein Browser unterstützt keine Push-Nachrichten.");
        return;
    }

    // iOS Check
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    
    if (isIOS && !isStandalone) {
        if (isManualRequest) {
            alert("Hinweis für iPhone/iPad:\nBitte füge die App erst zum Home-Bildschirm hinzu, damit Push funktioniert.");
        }
        return;
    }

    try {
        // 1. Status prüfen
        let permission = Notification.permission;

        // 2. Wenn wir nicht 'granted' sind, müssen wir entscheiden: Fragen oder Schweigen?
        if (permission !== 'granted') {
            // Wenn das KEIN manueller Klick war (sondern Refresh), tun wir NICHTS.
            // Das verhindert die nervige Fehlermeldung beim Laden.
            if (!isManualRequest) {
                console.log("Push noch nicht erlaubt, warte auf User-Aktion im Profil.");
                return; 
            }

            // War manueller Klick -> Wir fragen den Browser
            permission = await Notification.requestPermission();
            
            if (permission === 'denied') {
                alert("Push-Benachrichtigungen wurden blockiert. Bitte in den Browser-Einstellungen erlauben.");
                return;
            }
        }

        // 3. Wenn wir hier sind, ist permission == 'granted'. Token holen!
        if (permission === 'granted') {
            const registration = await navigator.serviceWorker.ready;
            if (!registration) return;

            const currentToken = await getToken(messaging, { 
                vapidKey: VAPID_KEY, 
                serviceWorkerRegistration: registration 
            });
            
            if (currentToken) {
                await saveTokenToDatabase(currentToken);
                if (isManualRequest) {
                    console.log("Token frisch geholt:", currentToken);
                }
            }
        }

        // Listener für Nachrichten bei OFFENER App
        onMessage(messaging, (payload) => {
            console.log('Nachricht im Vordergrund:', payload);
            
            const data = payload.data || {};
            const title = data.title || payload.notification?.title || 'Nachricht';
            const body = data.body || payload.notification?.body || '';

            showMessage('main-menu-message', `🔔 ${title}: ${body}`, 'success', 8000);
            
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        });

    } catch (err) {
        console.error('Push Error:', err);
        // Fehler nur anzeigen, wenn der User gerade geklickt hat
        if (isManualRequest && err.code === "messaging/permission-blocked") {
            alert("Bitte Benachrichtigungen in den Einstellungen zulassen.");
        }
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
        // Ignorieren, passiert oft im Hintergrund
        console.error("DB Save Error", e);
    }
}