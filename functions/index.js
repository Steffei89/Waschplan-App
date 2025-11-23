/**
 * Backend-Logik für Waschplan App
 * - Minuten-Cronjob (Timer-Ende & Buchungs-Start)
 * - Trigger für Tauschanfragen
 * - Trigger für Problem-Meldungen
 */

const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");
const admin = require("firebase-admin");

admin.initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// ============================================================================
// HILFSFUNKTION: Push an eine Benutzer-Gruppe senden
// ============================================================================
async function sendPushNotification(userQuery, title, body, url = 'https://waschplanapp.web.app') {
    const usersSnap = await userQuery.get();
    if (usersSnap.empty) return;

    let tokens = [];
    const userIds = [];

    const collectTokens = (userData) => {
        let found = [];
        if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
            found = found.concat(userData.fcmTokens);
        }
        if (userData.fcmToken) {
            found.push(userData.fcmToken);
        }
        return found;
    };

    usersSnap.forEach(doc => {
        userIds.push(doc.id);
        tokens = tokens.concat(collectTokens(doc.data()));
    });

    tokens = [...new Set(tokens)];

    if (tokens.length === 0) return;

    // HIER WIRD DER TEXT DEFINIERT
    const messagePayload = {
        tokens: tokens,
        notification: {
            title: title,
            body: body // Wird jetzt vom Aufrufer gesteuert (siehe unten)
        },
        webpush: {
            headers: { "Urgency": "high" },
            fcm_options: { link: url },
            notification: {
                icon: '/img/icon-192.png',
                badge: '/img/icon-maskable-192.png',
                vibrate: [200, 100, 200],
                tag: 'waschplan-alert',
                requireInteraction: true // Nachricht bleibt stehen bis Klick
            }
        }
    };

    try {
        const response = await messaging.sendEachForMulticast(messagePayload);
        console.log(`Push "${title}" gesendet. Erfolg: ${response.successCount}`);

        // Token Cleanup
        if (response.failureCount > 0) {
            const failedTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) failedTokens.push(tokens[idx]);
            });
            
            if (failedTokens.length > 0) {
                const batch = db.batch();
                userIds.forEach(uid => {
                    const ref = db.collection('users').doc(uid);
                    batch.update(ref, { fcmTokens: FieldValue.arrayRemove(...failedTokens) });
                });
                await batch.commit();
            }
        }
    } catch (e) {
        console.error("Push Fehler:", e);
    }
}

// ============================================================================
// 1. CRONJOB
// ============================================================================
exports.checkTimerDone = onSchedule("every 1 minutes", async (event) => {
    const now = admin.firestore.Timestamp.now();
    
    const timerQuery = db.collection('active_timers')
        .where('endTime', '<=', now)
        .where('notified', '!=', true);

    const timerSnap = await timerQuery.get();
    const promises = [];

    timerSnap.forEach(doc => {
        const data = doc.data();
        const partei = doc.id;

        const q = db.collection('users').where('partei', '==', partei);

        promises.push((async () => {
            // ÄNDERUNG: Kurzer Titel, leerer Body (oder sehr kurz)
            // Auf iOS erscheint der Titel fett. Der Body normal darunter.
            // Wir schreiben alles in den Titel, damit es wie EINE Zeile wirkt.
            await sendPushNotification(q, "Wäsche ist fertig! ✅", "Bitte auschecken.");
            await doc.ref.update({ notified: true });
        })());
    });

    // Buchungs-Erinnerung
    const berlinDate = new Date().toLocaleString("en-US", {timeZone: "Europe/Berlin"});
    const dateObj = new Date(berlinDate);
    const currentHour = dateObj.getHours();
    const currentMin = dateObj.getMinutes();

    if (currentMin < 5) {
        let targetSlot = null;
        if (currentHour === 7) targetSlot = "07:00-13:00";
        if (currentHour === 13) targetSlot = "13:00-19:00";

        if (targetSlot) {
            const todayStr = dateObj.toISOString().split('T')[0]; // Vereinfacht YYYY-MM-DD
            
            const bookingQuery = db.collection('bookings')
                .where('date', '==', todayStr)
                .where('slot', '==', targetSlot);

            const bookingSnap = await bookingQuery.get();
            
            bookingSnap.forEach(doc => {
                const b = doc.data();
                if (b.partei && !b.reminderSent) {
                    promises.push((async () => {
                        const q = db.collection('users').where('partei', '==', b.partei);
                        await sendPushNotification(q, "Wasch-Slot beginnt! 🕒", "");
                        await doc.ref.update({ reminderSent: true });
                    })());
                }
            });
        }
    }

    await Promise.all(promises);
});

// ============================================================================
// 2. TRIGGER: Neue Tauschanfrage
// ============================================================================
exports.onSwapRequest = onDocumentCreated("swap_requests/{requestId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const data = snapshot.data();
    const q = db.collection('users').where('partei', '==', data.targetPartei);
    await sendPushNotification(q, "Neue Tauschanfrage 🔄", "");
});

// ============================================================================
// 3. TRIGGER: Neues Problem
// ============================================================================
exports.onMaintenanceTicket = onDocumentCreated("maintenance_tickets/{ticketId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const data = snapshot.data();
    const q = db.collection('users').where('isAdmin', '==', true);
    await sendPushNotification(q, "⚠️ Problem gemeldet", `${data.reason}`);
});