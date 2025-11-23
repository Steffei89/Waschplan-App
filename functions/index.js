/**
 * Automatische Timer-Überprüfung und Push-Benachrichtigung.
 * Läuft jede Minute.
 */

const {onSchedule} = require("firebase-functions/v2/scheduler");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");
const admin = require("firebase-admin");

admin.initializeApp();
const db = getFirestore();
const messaging = getMessaging();

exports.checkTimerDone = onSchedule("every 1 minutes", async (event) => {
    const now = admin.firestore.Timestamp.now();
    
    const query = db.collection('active_timers')
        .where('endTime', '<=', now)
        .where('notified', '!=', true);

    const snapshot = await query.get();
    if (snapshot.empty) return;

    const promises = [];

    snapshot.forEach(doc => {
        const timerData = doc.data();
        const parteiName = doc.id;
        const starterUid = timerData.startedBy;

        const p = (async () => {
            console.log(`Timer fertig für: ${parteiName}`);
            let tokens = [];
            let uidForCleanup = null;

            const collectTokens = (userData, uid) => {
                let found = [];
                if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                    found = found.concat(userData.fcmTokens);
                }
                if (userData.fcmToken) {
                    found.push(userData.fcmToken);
                }
                // Merken uns die UID für spätere Bereinigung
                if (found.length > 0 && !uidForCleanup) uidForCleanup = uid;
                return found;
            };

            if (starterUid) {
                const userDoc = await db.collection('users').doc(starterUid).get();
                if (userDoc.exists) tokens = collectTokens(userDoc.data(), starterUid);
            } else {
                const userQuery = await db.collection('users').where('partei', '==', parteiName).get();
                userQuery.forEach(userDoc => {
                    // Bei Gruppen-Nachrichten nehmen wir Tokens aller User, Cleanup ist hier komplexer,
                    // wir fokussieren Cleanup auf den Starter-Fall oder lassen es generisch.
                    tokens = tokens.concat(collectTokens(userDoc.data(), userDoc.id));
                });
            }

            tokens = [...new Set(tokens)];

            if (tokens.length > 0) {
                try {
                    // WICHTIG: Wir nutzen DATA statt NOTIFICATION, um Dopplungen zu vermeiden
                    const messagePayload = {
                        tokens: tokens,
                        data: {
                            title: 'Wäsche fertig! 🧺',
                            body: `Dein Programm "${timerData.programName}" ist durch. Bitte auschecken!`,
                            url: 'https://waschplanapp.web.app'
                        },
                        webpush: {
                            headers: { "Urgency": "high" }
                        }
                    };

                    const response = await messaging.sendEachForMulticast(messagePayload);
                    console.log(`Push gesendet. Erfolg: ${response.successCount}, Fehler: ${response.failureCount}`);

                    // AUTOMATISCHE REINIGUNG ungültiger Tokens
                    if (response.failureCount > 0 && uidForCleanup) {
                        const failedTokens = [];
                        response.responses.forEach((resp, idx) => {
                            if (!resp.success) {
                                failedTokens.push(tokens[idx]);
                            }
                        });
                        if (failedTokens.length > 0) {
                            console.log("Entferne ungültige Tokens:", failedTokens);
                            await db.collection('users').doc(uidForCleanup).update({
                                fcmTokens: FieldValue.arrayRemove(...failedTokens)
                            });
                        }
                    }

                } catch (err) {
                    console.error("Push Fehler:", err);
                }
            }

            await doc.ref.update({ notified: true });
        })();
        promises.push(p);
    });

    await Promise.all(promises);
});