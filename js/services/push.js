import { messaging, getToken, onMessage, doc, updateDoc, db, arrayUnion } from '../firebase.js';
import { getState } from '../state.js';
import { showMessage } from '../ui.js';

const VAPID_KEY = "BDYYVt3HarS6Ex9rnRVEalXjYvPbKZLCxFppym90rlnugDh4CS4lpk1ENW_b3Pr9YecmVrDJTzpuQVSQq42PzFs"; 

export async function initPushNotifications() {
    const { currentUser } = getState();
    if (!currentUser) return;

    if (!('Notification' in window)) {
        console.log("Kein Push-Support.");
        return;
    }

    // iOS Check
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    if (isIOS && !isStandalone) {
        console.log("iOS: Bitte App zum Home-Screen hinzufügen für Push.");
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const registration = await navigator.serviceWorker.ready;
        if (!registration) return;

        const currentToken = await getToken(messaging, { 
            vapidKey: VAPID_KEY, 
            serviceWorkerRegistration: registration 
        });
        
        if (currentToken) {
            await saveTokenToDatabase(currentToken);
        }

        // Listener für Nachrichten bei OFFENER App
        onMessage(messaging, (payload) => {
            console.log('Nachricht im Vordergrund:', payload);
            
            // WICHTIG: Wir prüfen jetzt 'data', da 'notification' leer sein kann
            const data = payload.data || {};
            const title = data.title || payload.notification?.title || 'Nachricht';
            const body = data.body || payload.notification?.body || '';

            showMessage('main-menu-message', `🔔 ${title}: ${body}`, 'success', 8000);
            
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        });

    } catch (err) {
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