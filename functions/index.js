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

    // Helper: Tokens sammeln aus verschiedenen Feldern
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

    // Duplikate entfernen
    tokens = [...new Set(tokens)];

    if (tokens.length === 0) return;

    // Payload Bauen (Sicher für iOS & Android)
    const messagePayload = {
        tokens: tokens,
        notification: {
            title: title,
            body: body
        },
        webpush: {
            headers: { "Urgency": "high" },
            fcm_options: { link: url },
            notification: {
                icon: '/img/icon-192.png',
                badge: '/img/icon-maskable-192.png',
                vibrate: [200, 100, 200],
                tag: 'waschplan-alert'
            }
        }
    };

    try {
        const response = await messaging.sendEachForMulticast(messagePayload);
        console.log(`Push "${title}" an ${tokens.length} Geräte gesendet. Erfolg: ${response.successCount}`);

        // Cleanup ungültiger Tokens
        if (response.failureCount > 0) {
            const failedTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) failedTokens.push(tokens[idx]);
            });
            
            if (failedTokens.length > 0) {
                console.log("Bereinige ungültige Tokens...", failedTokens.length);
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
// 1. CRONJOB: Timer-Check UND Buchungs-Erinnerung (Jede Minute)
// ============================================================================
exports.checkTimerDone = onSchedule("every 1 minutes", async (event) => {
    const now = admin.firestore.Timestamp.now();
    
    // --- TEIL A: Timer abgelaufen? ---
    const timerQuery = db.collection('active_timers')
        .where('endTime', '<=', now)
        .where('notified', '!=', true);

    const timerSnap = await timerQuery.get();
    const promises = [];

    timerSnap.forEach(doc => {
        const data = doc.data();
        const starter = data.startedBy;
        const partei = doc.id;

        let q;
        if (starter) {
            q = db.collection('users').where(admin.firestore.FieldPath.documentId(), '==', starter);
        } else {
            q = db.collection('users').where('partei', '==', partei);
        }

        promises.push((async () => {
            await sendPushNotification(q, "Wäsche fertig! 🧺", `Programm "${data.programName}" ist durch. Bitte auschecken!`);
            await doc.ref.update({ notified: true });
        })());
    });

    // --- TEIL B: Buchungs-Erinnerung (Start) ---
    const berlinDate = new Date().toLocaleString("en-US", {timeZone: "Europe/Berlin"});
    const dateObj = new Date(berlinDate);
    const currentHour = dateObj.getHours();
    const currentMin = dateObj.getMinutes();

    // Nur in den ersten 5 Minuten der Stunde prüfen (Performance)
    if (currentMin < 5) {
        let targetSlot = null;
        if (currentHour === 7) targetSlot = "07:00-13:00";
        if (currentHour === 13) targetSlot = "13:00-19:00";

        if (targetSlot) {
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const todayStr = `${year}-${month}-${day}`;

            // Suche Buchungen, die JETZT starten und noch keine Erinnerung haben
            // Hinweis: Firestore behandelt fehlende Felder in != Abfragen oft speziell,
            // aber 'reminderSent' wird bei neuen Buchungen einfach fehlen.
            // Sicherer ist: Wir laden die Buchungen des Slots und filtern im Code.
            const bookingQuery = db.collection('bookings')
                .where('date', '==', todayStr)
                .where('slot', '==', targetSlot);

            const bookingSnap = await bookingQuery.get();
            
            bookingSnap.forEach(doc => {
                const b = doc.data();
                // Nur senden, wenn noch NICHT gesendet wurde
                if (b.partei && !b.reminderSent) {
                    promises.push((async () => {
                        const q = db.collection('users').where('partei', '==', b.partei);
                        await sendPushNotification(q, "Wasch-Slot beginnt! 🕒", `Euer Slot (${targetSlot}) beginnt jetzt.`);
                        // Markieren als gesendet
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
    const targetPartei = data.targetPartei;
    const requester = data.requesterPartei;
    
    if (!targetPartei) return;

    console.log(`Neue Tauschanfrage von ${requester} an ${targetPartei}`);

    const q = db.collection('users').where('partei', '==', targetPartei);
    
    // Datum formatieren (YYYY-MM-DD -> DD.MM.)
    const dateParts = (data.targetDate || "").split('-');
    const dateNice = dateParts.length === 3 ? `${dateParts[2]}.${dateParts[1]}.` : data.targetDate;

    await sendPushNotification(q, "Neue Tauschanfrage 🔄", `${requester} möchte deinen Slot am ${dateNice} tauschen.`);
});

// ============================================================================
// 3. TRIGGER: Neues Problem (Wartung)
// ============================================================================
exports.onMaintenanceTicket = onDocumentCreated("maintenance_tickets/{ticketId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    const reason = data.reason || "Unbekannt";
    const userEmail = data.email || "Jemand";

    console.log(`Neues Ticket: ${reason}`);

    // Nachricht an alle Admins
    const q = db.collection('users').where('isAdmin', '==', true);

    await sendPushNotification(q, "⚠️ Problem gemeldet", `${userEmail} meldet: ${reason}`);
});