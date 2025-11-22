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

      let tokens = [];
      
      userQuery.forEach(u => {
        const d = u.data();
        
        // NEU: Wir schauen nach der Liste 'fcmTokens'
        if (d.fcmTokens && Array.isArray(d.fcmTokens)) {
            tokens = tokens.concat(d.fcmTokens);
        } 
        // Fallback für alte Daten: einzelner 'fcmToken'
        else if (d.fcmToken) {
            tokens.push(d.fcmToken);
        }
      });

      // Duplikate entfernen (zur Sicherheit)
      tokens = [...new Set(tokens)];

      if (tokens.length > 0) {
        // Push senden
        // Achtung: sendEachForMulticast erlaubt max 500 Tokens, das reicht hier locker
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
        console.log(`-> Push an ${tokens.length} Geräte gesendet.`);
        if (response.failureCount > 0) {
            console.log("Einige Tokens waren ungültig, aber das ist okay.");
        }
      } else {
          console.log("Keine Tokens für diese Partei gefunden.");
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