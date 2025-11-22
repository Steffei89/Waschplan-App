// js/services/push.js
import { messaging, getToken, onMessage, doc, updateDoc, db, arrayUnion } from '../firebase.js';
import { getState } from '../state.js';
import { showMessage } from '../ui.js';

const VAPID_KEY = "BDYYVt3HarS6Ex9rnRVEalXjYvPbKZLCxFppym90rlnugDh4CS4lpk1ENW_b3Pr9YecmVrDJTzpuQVSQq42PzFs"; 

export async function initPushNotifications() {
    const { currentUser } = getState();
    if (!currentUser) return;

    // Check ob Browser das überhaupt kann
    if (!('Notification' in window)) {
        console.log("Dieser Browser unterstützt keine Notifications.");
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn("Push-Berechtigung verweigert.");
            return;
        }

        const registration = await navigator.serviceWorker.ready;
        if (!registration) return;

        const currentToken = await getToken(messaging, { 
            vapidKey: VAPID_KEY, 
            serviceWorkerRegistration: registration 
        });
        
        if (currentToken) {
            console.log("FCM Token:", currentToken);
            await saveTokenToDatabase(currentToken);
        }

        // Listener für Nachrichten bei OFFENER App
        onMessage(messaging, (payload) => {
            console.log('Nachricht im Vordergrund:', payload);
            const title = payload.notification.title;
            const body = payload.notification.body;
            showMessage('main-menu-message', `🔔 ${title}: ${body}`, 'success', 8000);
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
        // Fügt den Token zur Liste hinzu (arrayUnion verhindert Duplikate)
        await updateDoc(userRef, {
            fcmTokens: arrayUnion(token),
            lastTokenUpdate: new Date().toISOString()
        });
    } catch(e) {
        console.error("DB Save Error", e);
    }
}