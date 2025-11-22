import { messaging, getToken, onMessage, doc, updateDoc, db, arrayUnion } from '../firebase.js';
import { getState } from '../state.js';
import { showMessage } from '../ui.js';

// DEIN KEY
const VAPID_KEY = "BDYYVt3HarS6Ex9rnRVEalXjYvPbKZLCxFppym90rlnugDh4CS4lpk1ENW_b3Pr9YecmVrDJTzpuQVSQq42PzFs"; 

export async function initPushNotifications() {
    const { currentUser } = getState();
    if (!currentUser) return;

    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn("Push-Berechtigung verweigert.");
            return;
        }

        const registration = await navigator.serviceWorker.ready;

        const currentToken = await getToken(messaging, { 
            vapidKey: VAPID_KEY, 
            serviceWorkerRegistration: registration 
        });
        
        if (currentToken) {
            console.log("FCM Token erhalten:", currentToken);
            await saveTokenToDatabase(currentToken);
        } else {
            console.log('Kein Registration Token verfügbar.');
        }

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
    
    // WICHTIG: Wir nutzen arrayUnion, um den Token zur Liste hinzuzufügen,
    // ohne die Tokens anderer Geräte zu löschen.
    await updateDoc(userRef, {
        fcmTokens: arrayUnion(token),
        lastTokenUpdate: new Date().toISOString()
    });
}