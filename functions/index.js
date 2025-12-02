const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// Diese Funktion läuft jeden Tag um 20:00 Uhr (Zeitzone Berlin)
exports.dailyLaundryReminder = functions.pubsub
  .schedule('0 20 * * *') 
  .timeZone('Europe/Berlin')
  .onRun(async (context) => {
    const db = admin.firestore();
    const messaging = admin.messaging();

    console.log("Starte täglichen Erinnerungs-Check...");

    // 1. Datum für "Morgen" berechnen (YYYY-MM-DD)
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const tomorrowStr = `${year}-${month}-${day}`;

    // 2. Buchungen für morgen suchen
    const bookingsSnap = await db.collection('bookings')
      .where('date', '==', tomorrowStr)
      .get();

    if (bookingsSnap.empty) {
      console.log("Keine Buchungen für morgen.");
      return null;
    }

    // 3. Nutzer benachrichtigen
    const promises = [];
    bookingsSnap.forEach(doc => {
      const booking = doc.data();
      
      // Nur wenn User-ID da ist und Slot nicht freigegeben wurde
      if (!booking.userId || booking.isReleased) return;

      const p = db.collection('users').doc(booking.userId).get().then(userSnap => {
        if (!userSnap.exists) return;
        
        const userData = userSnap.data();
        const tokens = userData.fcmTokens || []; // Tokens für Push

        if (tokens.length > 0) {
           const payload = {
            notification: {
              title: 'Waschtag! 🧺',
              body: `Nicht vergessen: Morgen (${booking.slot}) ist dein Termin.`
            }
          };
          // Nachricht an alle Geräte des Nutzers senden
          return messaging.sendToDevice(tokens, payload);
        }
      });
      promises.push(p);
    });

    await Promise.all(promises);
    console.log(`Erinnerungen versendet für ${promises.length} Buchungen.`);
    return null;
  });