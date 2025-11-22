const admin = require("firebase-admin");

// Wir lesen die Zugangsdaten aus den Umgebungsvariablen (GitHub Secrets)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

async function checkTimers() {
  console.log("Starte Timer-Check...");
  const now = admin.firestore.Timestamp.now();

  // 1. Suche abgelaufene Timer, die noch nicht benachrichtigt wurden
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

      // User der Partei finden
      const userQuery = await db.collection('users')
        .where('partei', '==', parteiName)
        .get();

      const tokens = [];
      userQuery.forEach(u => {
        const d = u.data();
        if (d.fcmToken) tokens.push(d.fcmToken);
      });

      if (tokens.length > 0) {
        // Push senden
        await messaging.sendEachForMulticast({
          tokens: tokens,
          notification: {
            title: 'Wäsche fertig! 🧺',
            body: `Programm "${timerData.programName}" ist durch. Bitte auschecken!`
          },
          webpush: {
            fcm_options: { link: 'https://waschplanapp.web.app' }
          }
        });
        console.log(`-> Push an ${tokens.length} Geräte gesendet.`);
      }

      // Timer markieren als "erledigt"
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