/**
 * Automatische Timer-Überprüfung und Push-Benachrichtigung.
 * Läuft jede Minute.
 */

const {onSchedule} = require("firebase-functions/v2/scheduler");
const {getFirestore} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");
const admin = require("firebase-admin");

// Initialisiere Admin SDK
admin.initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// Dieser "Cronjob" läuft jede Minute
exports.checkTimerDone = onSchedule("every 1 minutes", async (event) => {
    const now = admin.firestore.Timestamp.now();

    console.log("Prüfe auf abgelaufene Timer...", now.toDate());

    // 1. Suche Timer, die abgelaufen sind (endTime <= jetzt) UND noch nicht benachrichtigt wurden
    const query = db.collection('active_timers')
        .where('endTime', '<=', now)
        .where('notified', '!=', true); // Damit wir nicht doppelt senden

    const snapshot = await query.get();

    if (snapshot.empty) {
        return; // Nichts zu tun
    }

    const promises = [];

    snapshot.forEach(doc => {
        const timerData = doc.data();
        const parteiName = doc.id; // Die ID des Dokuments ist der Parteiname

        // Wir verarbeiten diesen Timer
        const p = (async () => {
            console.log(`Timer für ${parteiName} ist abgelaufen!`);

            // 2. Alle User dieser Partei finden, die einen Push-Token haben
            const userQuery = await db.collection('users')
                .where('partei', '==', parteiName)
                .get();

            let tokens = [];
            userQuery.forEach(userDoc => {
                const userData = userDoc.data();
                if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                    // Neue Struktur: Array von Tokens
                    tokens = tokens.concat(userData.fcmTokens);
                } else if (userData.fcmToken) {
                    // Alte Struktur: Einzelner Token (Fallback)
                    tokens.push(userData.fcmToken);
                }
            });

            // Duplikate entfernen
            tokens = [...new Set(tokens)];

            if (tokens.length > 0) {
                // 3. Nachricht senden
                try {
                    const response = await messaging.sendEachForMulticast({
                        tokens: tokens,
                        notification: {
                            title: 'Wäsche fertig! 🧺',
                            body: `Das Programm "${timerData.programName}" ist durch. Bitte auschecken!`
                        },
                        webpush: {
                            fcm_options: {
                                link: 'https://waschplanapp.web.app' // Öffnet die App bei Klick
                            }
                        }
                    });
                    console.log(`Nachricht an ${tokens.length} Geräte gesendet. Erfolgreich: ${response.successCount}`);
                } catch (err) {
                    console.error("Fehler beim Senden der Push-Nachricht:", err);
                }
            } else {
                console.log(`Keine Tokens für Partei ${parteiName} gefunden.`);
            }

            // 4. Timer markieren, damit wir ihn nicht nochmal senden
            await doc.ref.update({ notified: true });
        })();
        
        promises.push(p);
    });

    await Promise.all(promises);
});