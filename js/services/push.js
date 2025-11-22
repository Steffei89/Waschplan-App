import { messaging, getToken, onMessage, doc, updateDoc, db } from '../firebase.js';
import { getState } from '../state.js';
import { showMessage } from '../ui.js';

// DEIN KEY
const VAPID_KEY = "BDYYVt3HarS6Ex9rnRVEalXjYvPbKZLCxFppym90rlnugDh4CS4lpk1ENW_b3Pr9YecmVrDJTzpuQVSQq42PzFs"; 

export async function initPushNotifications() {
    const { currentUser } = getState();
    if (!currentUser) return;

    try {
        // 1. Berechtigung anfragen
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn("Push-Berechtigung verweigert.");
            return;
        }

        // 2. Service Worker Registrierung abwarten
        // WICHTIG: Das behebt den 404 Fehler! Wir nutzen die existierende sw.js
        const registration = await navigator.serviceWorker.ready;

        // 3. Token holen mit Verweis auf den Service Worker
        const currentToken = await getToken(messaging, { 
            vapidKey: VAPID_KEY, 
            serviceWorkerRegistration: registration 
        });
        
        if (currentToken) {
            console.log("FCM Token erhalten:", currentToken);
            // 4. Token beim User speichern
            await saveTokenToDatabase(currentToken);
        } else {
            console.log('Kein Registration Token verfügbar.');
        }

        // 5. Listener für Nachrichten im VORDERGRUND
        onMessage(messaging, (payload) => {
            console.log('Nachricht im Vordergrund:', payload);
            const title = payload.notification.title;
            const body = payload.notification.body;
            showMessage('main-menu-message', `🔔 ${title}: ${body}`, 'success', 8000);
        });

    } catch (err) {
        console.error('Fehler bei Push-Init:', err);
    }
}

async function saveTokenToDatabase(token) {
    const { currentUser } = getState();
    if (!currentUser) return;

    const userRef = doc(db, "users", currentUser.uid);
    
    await updateDoc(userRef, {
        fcmToken: token,
        lastTokenUpdate: new Date().toISOString()
    });
}