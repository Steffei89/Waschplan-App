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

    try {
        // DEBUG 1
        // alert("Schritt 1: Frage Berechtigung...");
        
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            alert("Fehler: Berechtigung wurde verweigert (Status: " + permission + ")");
            return;
        }

        // DEBUG 2
        // alert("Schritt 2: Berechtigung OK. Suche Service Worker...");

        const registration = await navigator.serviceWorker.ready;
        
        if (!registration) {
            alert("Fehler: Kein Service Worker gefunden!");
            return;
        }

        // DEBUG 3
        // alert("Schritt 3: Hole Token von Firebase...");

        const currentToken = await getToken(messaging, { 
            vapidKey: VAPID_KEY, 
            serviceWorkerRegistration: registration 
        });
        
        if (currentToken) {
            // DEBUG 4
            // alert("Schritt 4: Token erhalten! Speichere in DB...");
            console.log("FCM Token erhalten:", currentToken);
            await saveTokenToDatabase(currentToken);
            alert("ERFOLG! Token gespeichert. Jetzt sollte es klappen.");
        } else {
            alert("Fehler: Kein Token von Google erhalten.");
        }

        onMessage(messaging, (payload) => {
            const title = payload.notification.title;
            const body = payload.notification.body;
            showMessage('main-menu-message', `🔔 ${title}: ${body}`, 'success', 8000);
        });

    } catch (err) {
        // WICHTIG: Hier sehen wir den echten Fehler auf dem Handy
        alert("CRASH FEHLER: " + err.message + " | " + err.name);
        console.error('Fehler bei Push-Init:', err);
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
        alert("DB Fehler beim Speichern: " + e.message);
    }
}