// scripts/scheduler.js
const admin = require("firebase-admin");

// Wir lesen die Zugangsdaten aus den Umgebungsvariablen
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

async function checkTimers() {
  console.log("Starte Timer-Check...");
  const now = admin.firestore.Timestamp.now();

  // Suche abgelaufene Timer
  const query = db.collection('active_timers')
    .where('endTime', '<=', now)
    .where('notified', '!=', true);

  const snapshot = await query.get();

  if (snapshot.empty) {
    console.log("Keine abgelaufenen Timer gefunden.");
    return;
  }

  const promises = [];

  snapshot.forEach(doc => {
    const timerData = doc.data();
    const parteiName = doc.id;

    const p = (async () => {
      console.log(`Timer fertig für: ${parteiName}`);

      // Alle Token der Partei finden
      const userQuery = await db.collection('users')
        .where('partei', '==', parteiName)
        .get();

      let tokens = [];
      userQuery.forEach(u => {
        const d = u.data();
        if (d.fcmTokens && Array.isArray(d.fcmTokens)) {
            tokens = tokens.concat(d.fcmTokens);
        } else if (d.fcmToken) {
            tokens.push(d.fcmToken);
        }
      });
      tokens = [...new Set(tokens)]; // Duplikate entfernen

      if (tokens.length > 0) {
        const response = await messaging.sendEachForMulticast({
          tokens: tokens,
          notification: {
            title: 'Wäsche fertig! 🧺',
            body: `Programm "${timerData.programName}" ist durch. Bitte auschecken!`
          },
          webpush: {
            fcm_options: { link: 'https://waschplanapp.web.app' }
          }
        });
        console.log(`-> Push an ${tokens.length} Geräte gesendet. Erfolge: ${response.successCount}`);
      }

      // Markieren als erledigt
      await doc.ref.update({ notified: true });
    })();
    promises.push(p);
  });

  await Promise.all(promises);
  console.log("Check abgeschlossen.");
}

checkTimers().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});