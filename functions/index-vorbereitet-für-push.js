const {onSchedule} = require("firebase-functions/v2/scheduler");
const {getFirestore} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");
const admin = require("firebase-admin");

admin.initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// Dieser "Cronjob" läuft jede Minute
exports.checkTimerDone = onSchedule("every 1 minutes", async (event) => {
    const now = admin.firestore.Timestamp.now();

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

            const tokens = [];
            userQuery.forEach(userDoc => {
                const userData = userDoc.data();
                if (userData.fcmToken) {
                    tokens.push(userData.fcmToken);
                }
            });

            if (tokens.length > 0) {
                // 3. Nachricht senden
                await messaging.sendEachForMulticast({
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
                console.log(`Nachricht an ${tokens.length} Geräte gesendet.`);
            }

            // 4. Timer markieren, damit wir ihn nicht nochmal senden
            await doc.ref.update({ notified: true });
        })();
        
        promises.push(p);
    });

    await Promise.all(promises);
});