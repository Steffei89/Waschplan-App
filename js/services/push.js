import { messaging, getToken, onMessage, doc, updateDoc, db, arrayUnion } from '../firebase.js';
import { getState } from '../state.js';
import { showMessage } from '../ui.js';

const VAPID_KEY = "BDYYVt3HarS6Ex9rnRVEalXjYvPbKZLCxFppym90rlnugDh4CS4lpk1ENW_b3Pr9YecmVrDJTzpuQVSQq42PzFs"; 

export async function initPushNotifications() {
    const { currentUser } = getState();
    if (!currentUser) return; // Silent return (kein Alert mehr, um User nicht zu nerven)

    if (!('Notification' in window)) return;

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
            console.log("FCM Token:", currentToken);
            await saveTokenToDatabase(currentToken);
        }

        onMessage(messaging, (payload) => {
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
        // HIER IST DER TRICK: arrayUnion fügt hinzu, statt zu überschreiben!
        await updateDoc(userRef, {
            fcmTokens: arrayUnion(token), 
            lastTokenUpdate: new Date().toISOString()
        });
    } catch(e) {
        console.error("DB Save Error", e);
    }
}