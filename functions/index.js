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
        .where('notified', '!=', true);

    const snapshot = await query.get();

    if (snapshot.empty) {
        return; // Nichts zu tun
    }

    const promises = [];

    snapshot.forEach(doc => {
        const timerData = doc.data();
        const parteiName = doc.id;
        const starterUid = timerData.startedBy; // <--- NEU: Die ID des Starters

        const p = (async () => {
            console.log(`Timer für ${parteiName} (User: ${starterUid || 'Alle'}) ist abgelaufen!`);

            let tokens = [];

            // Logik: Wenn ein Starter bekannt ist, hole nur diesen User. Sonst alle der Partei.
            if (starterUid) {
                const userDoc = await db.collection('users').doc(starterUid).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                        tokens = tokens.concat(userData.fcmTokens);
                    } else if (userData.fcmToken) {
                        tokens.push(userData.fcmToken);
                    }
                }
            } else {
                // Fallback (alte Methode): Alle User der Partei
                const userQuery = await db.collection('users')
                    .where('partei', '==', parteiName)
                    .get();
                
                userQuery.forEach(userDoc => {
                    const userData = userDoc.data();
                    if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                        tokens = tokens.concat(userData.fcmTokens);
                    } else if (userData.fcmToken) {
                        tokens.push(userData.fcmToken);
                    }
                });
            }

            // Duplikate entfernen
            tokens = [...new Set(tokens)];

            if (tokens.length > 0) {
                try {
                    const response = await messaging.sendEachForMulticast({
                        tokens: tokens,
                        notification: {
                            title: 'Wäsche fertig! 🧺',
                            body: `Dein Programm "${timerData.programName}" ist durch. Bitte auschecken!`
                        },
                        webpush: {
                            fcm_options: {
                                link: 'https://waschplanapp.web.app'
                            }
                        }
                    });
                    console.log(`Nachricht an ${tokens.length} Geräte gesendet. Erfolgreich: ${response.successCount}`);
                } catch (err) {
                    console.error("Fehler beim Senden der Push-Nachricht:", err);
                }
            } else {
                console.log(`Keine Tokens gefunden.`);
            }

            // 4. Timer markieren
            await doc.ref.update({ notified: true });
        })();
        
        promises.push(p);
    });

    await Promise.all(promises);
});