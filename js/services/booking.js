import { 
    db, query, where, getDocs, addDoc, deleteDoc, doc, orderBy, limit,
    onSnapshot, getBookingsCollectionRef, updateDoc, Timestamp
} from '../firebase.js';
import { getState } from '../state.js';
import { showMessage } from '../ui.js';
import { today, formatDate } from '../utils.js';
import * as dom from '../dom.js';
import { checkBookingPermission, updateKarma } from './karma.js'; 
import { BONUS_CANCEL_EARLY, PENALTY_CANCEL_LATE, COST_SLOT_NORMAL, COST_SLOT_PRIME } from '../config.js';
import { getSystemStatus } from './maintenance.js';

// ... (checkDuplicateBooking und checkSlotAvailability bleiben unverändert) ...
export async function checkDuplicateBooking(selectedDate, partei) {
    const q = query(
        getBookingsCollectionRef(),
        where('date', '==', selectedDate),
        where('partei', '==', partei)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

export async function checkSlotAvailability(selectedDate) {
    const { currentUser } = getState();
    if (!currentUser) return null;

    const systemStatus = await getSystemStatus();
    if (systemStatus === 'maintenance') {
         return {
            "07:00-13:00": { status: 'disabled', text: '⚠️ WARTUNG / DEFEKT' },
            "13:00-19:00": { status: 'disabled', text: '⚠️ WARTUNG / DEFEKT' }
        };
    }

    const q = query(getBookingsCollectionRef(), where('date', '==', selectedDate));
    const querySnapshot = await getDocs(q);
    const bookingsOnDay = [];
    querySnapshot.forEach(doc => bookingsOnDay.push(doc.data()));

    const myPartei = currentUser.userData.partei;
    
    const availability = {
        "07:00-13:00": { status: 'available', text: '07:00 - 13:00 (Verfügbar)' },
        "13:00-19:00": { status: 'available', text: '13:00 - 19:00 (Verfügbar)' }
    };

    const hasMyParteiBooked = bookingsOnDay.some(b => b.partei === myPartei && !b.isReleased);

    for (const booking of bookingsOnDay) {
        if (booking.isReleased) {
             availability[booking.slot] = { 
                 status: 'available-spontaneous', 
                 text: `${booking.slot} (Spontan frei! ⚡)` 
             };
             continue; 
        }

        if (availability[booking.slot]) {
            if (booking.partei === myPartei) {
                // NEU: Status anzeigen
                let statusExtra = "";
                if (booking.checkInTime && !booking.checkOutTime) statusExtra = " (Eingecheckt ▶️)";
                
                availability[booking.slot] = { status: 'booked-me', text: `${booking.slot} (Gebucht)${statusExtra}` };
            } else {
                availability[booking.slot] = { status: 'booked-other', text: `${booking.slot} (Belegt - ${booking.partei})` };
            }
        }
    }
    
    if (hasMyParteiBooked) {
        for (const slot in availability) {
            if (availability[slot].status === 'available' || availability[slot].status === 'available-spontaneous') {
                availability[slot] = { status: 'disabled-duplicate', text: `${slot} (Sie haben bereits gebucht)` };
            }
        }
    }
    return availability;
}

// ... (performBooking und performDeletion bleiben unverändert) ...
export async function performBooking(date, slot, messageElementId) { 
    if (!date || !slot) {
        showMessage(messageElementId, "Datum und Slot müssen ausgewählt werden!", 'error');
        return false;
    }
    const { currentUser, currentUserId, userIsAdmin } = getState();
    if (!currentUser || !currentUserId) {
        showMessage(messageElementId, "Fehler: Sie sind nicht angemeldet.", 'error');
        return false;
    }

    const systemStatus = await getSystemStatus();
    if (systemStatus === 'maintenance') {
        showMessage(messageElementId, "Buchungen sind derzeit wegen Wartung gesperrt.", 'error');
        return false;
    }
    
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
        showMessage(messageElementId, "Buchungen können nicht für vergangene Tage vorgenommen werden.", 'error');
        return false;
    }

    let cost = 0;
    if (!userIsAdmin) {
        const check = await checkBookingPermission(date, slot);
        if (!check.allowed) {
            showMessage(messageElementId, check.error, 'error');
            return false;
        }
        cost = check.cost; 
    }

    const bookingsColRef = getBookingsCollectionRef();
    
    try {
        const hasDuplicate = await checkDuplicateBooking(date, currentUser.userData.partei);
        const q = query(bookingsColRef, where("date", "==", date), where("slot", "==", slot));
        const existingBookings = await getDocs(q);
        
        let releasedDocId = null;

        if (!existingBookings.empty) {
             const first = existingBookings.docs[0].data();
             if (first.isReleased) {
                 releasedDocId = existingBookings.docs[0].id;
             } else {
                 showMessage(messageElementId, "Dieser Slot ist bereits belegt!", 'error');
                 return false;
             }
        }
        
        if (hasDuplicate && !releasedDocId) {
             const dateStr = selectedDate.toLocaleDateString('de-DE');
             showMessage(messageElementId, `Fehler: Ihre Partei hat am ${dateStr} bereits gebucht.`, 'error');
             return false;
        }

        if (releasedDocId) {
            await deleteDoc(doc(bookingsColRef, releasedDocId));
        }

        await addDoc(bookingsColRef, {
            date: date,
            slot: slot,
            partei: currentUser.userData.partei, 
            userId: currentUserId, 
            bookedAt: new Date().toISOString(),
            isSwap: false,
            checkInTime: null, // NEU
            checkOutTime: null // NEU
        });

        if (!userIsAdmin && cost !== 0) {
            await updateKarma(currentUser.userData.partei, cost, "Buchung");
        }

        showMessage(messageElementId, `Buchung erfolgreich! (${cost} Karma)`, 'success');
        
        if (messageElementId === 'booking-error') {
            document.getElementById("booking-slot").value = ''; 
        }
        return true;

    } catch (e) {
        showMessage(messageElementId, `Fehler beim Speichern der Buchung: ${e.message}`, 'error');
        return false; 
    }
}

export async function performDeletion(date, slot, messageElementId) {
    const { currentUserId, currentUser, userIsAdmin } = getState();
    if (!date || !slot || !currentUserId || !currentUser) return false;

    const bookingsColRef = getBookingsCollectionRef();
    let q;

    if (userIsAdmin) {
        q = query(bookingsColRef, where("date", "==", date), where("slot", "==", slot));
    } else {
        q = query(bookingsColRef, where("date", "==", date), where("slot", "==", slot), where("partei", "==", currentUser.userData.partei));
    }
    
    try {
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            showMessage(messageElementId, "Fehler: Die Buchung wurde nicht gefunden oder Sie sind nicht berechtigt.", 'error');
            return false;
        }

        const docToDelete = querySnapshot.docs[0];
        const bookingData = docToDelete.data();

        if (!userIsAdmin && bookingData.partei !== currentUser.userData.partei) {
             showMessage(messageElementId, "Löschung fehlgeschlagen: Nicht berechtigt.", 'error');
             return false;
        }
        
        await deleteDoc(docToDelete.ref);

        if (bookingData.userId === currentUserId || (!userIsAdmin && bookingData.partei === currentUser.userData.partei)) {
            const bookingDate = new Date(bookingData.date + "T" + bookingData.slot.substring(0,5));
            const now = new Date();
            const hoursDiff = (bookingDate - now) / (1000 * 60 * 60);
            
            const isWeekend = (bookingDate.getDay() === 0 || bookingDate.getDay() === 6);
            const originalCost = isWeekend ? Math.abs(COST_SLOT_PRIME) : Math.abs(COST_SLOT_NORMAL);

            let refund = originalCost; 
            let message = "Punkte erstattet.";

            if (hoursDiff > 24) {
                refund += BONUS_CANCEL_EARLY;
                message = "Erstattung + Fairness-Bonus!";
            } else if (hoursDiff < 4 && hoursDiff > 0) {
                refund += PENALTY_CANCEL_LATE; 
                message = "Erstattung abzgl. Late-Storno-Strafe.";
            }
            
            if (refund !== 0) {
                await updateKarma(currentUser.userData.partei, refund, "Stornierung");
                showMessage(messageElementId, `Gelöscht. ${message} (+${refund})`, 'success');
                return true;
            }
        }
        
        showMessage(messageElementId, `Buchung gelöscht.`, 'success');
        return true;

    } catch (e) {
        showMessage(messageElementId, `Fehler beim Löschen der Buchung: ${e.message}`, 'error');
        return false;
    }
}

// NEU: Check-In (QR Scan Erfolg)
export async function performCheckIn(bookingId, messageElementId) {
    const { currentUser } = getState();
    if (!currentUser) return;

    try {
        const bookingRef = doc(getBookingsCollectionRef(), bookingId);
        await updateDoc(bookingRef, {
            checkInTime: new Date().toISOString()
        });
        showMessage(messageElementId, "Check-in erfolgreich! Viel Spaß beim Waschen.", 'success');
        return true;
    } catch (e) {
        showMessage(messageElementId, `Check-in Fehler: ${e.message}`, 'error');
        return false;
    }
}

// NEU: Check-Out (ersetzt releaseSlotEarly Logik teilweise, bzw. nutzt sie)
export async function performCheckOut(bookingId, messageElementId) {
    const { currentUser } = getState();
    if (!currentUser) return;

    try {
        const bookingRef = doc(getBookingsCollectionRef(), bookingId);
        
        // Wir setzen checkOutTime UND isReleased (damit Slot frei wird)
        await updateDoc(bookingRef, {
            isReleased: true,
            releasedAt: new Date().toISOString(),
            checkOutTime: new Date().toISOString()
        });

        // BONUS GEBEN (Fairness)
        await updateKarma(currentUser.userData.partei, 5, "Früher fertig Bonus");
        showMessage(messageElementId, "Check-out erfolgreich! Slot freigegeben (+5 Karma).", 'success');
        return true;

    } catch (e) {
        showMessage(messageElementId, `Fehler: ${e.message}`, 'error');
        return false;
    }
}

// Wird für Kompatibilität noch behalten, leitet aber an performCheckOut weiter
export async function releaseSlotEarly(bookingId, messageElementId) {
    return performCheckOut(bookingId, messageElementId);
}

// NEU: Automatische Bereinigung alter Slots (Auto-Checkout)
export async function checkAndAutoCheckoutOldBookings() {
    const { currentUser } = getState();
    if (!currentUser) return;

    // Wir suchen Buchungen meiner Partei, die vergangen sind, aber kein checkOutTime haben
    // Da wir in Firestore schlecht "Datum < heute" UND "checkOutTime == null" gleichzeitig filtern können (Index-Problem),
    // laden wir die letzten Buchungen und filtern im Code.
    
    // Strategie: Lade letzte 10 Buchungen meiner Partei
    const q = query(
        getBookingsCollectionRef(),
        where("partei", "==", currentUser.userData.partei),
        orderBy("date", "desc"),
        limit(10)
    );

    try {
        const snapshot = await getDocs(q);
        const now = new Date();
        const todayStr = formatDate(now);
        const currentHour = now.getHours();

        snapshot.forEach(async (docSnap) => {
            const data = docSnap.data();
            
            // Wenn bereits ausgecheckt, ignorieren
            if (data.checkOutTime || data.isReleased) return;

            // Endzeit des Slots ermitteln
            // Format: "2025-11-22", Slot: "13:00-19:00"
            const endTimeStr = data.slot.split('-')[1]; // "19:00"
            const endHour = parseInt(endTimeStr.split(':')[0]);
            
            let isExpired = false;
            if (data.date < todayStr) {
                isExpired = true; // War gestern oder früher
            } else if (data.date === todayStr) {
                if (currentHour >= endHour) {
                    isExpired = true; // Slot ist heute vorbei
                }
            }

            if (isExpired) {
                // AUTO CHECKOUT DURCHFÜHREN
                console.log(`Auto-Checkout für Buchung ${docSnap.id} (${data.date})`);
                
                // Wir setzen die CheckOutTime auf das theoretische Ende des Slots
                const closingTime = new Date(data.date + "T" + endTimeStr).toISOString();
                
                await updateDoc(docSnap.ref, {
                    checkOutTime: closingTime,
                    autoCheckedOut: true // Flag für Statistik (User hat es vergessen)
                });
            }
        });
    } catch (e) {
        console.warn("Fehler beim Auto-Cleanup:", e);
    }
}

export function loadNextBookingsOverview(onData, onError) {
    const { currentUser } = getState();
    if (!currentUser) return;
    const todayFormatted = formatDate(new Date());
    const q = query(
        getBookingsCollectionRef(),
        where("date", ">=", todayFormatted), 
        orderBy("date"), orderBy("slot"), limit(5) 
    );
    return onSnapshot(q, (querySnapshot) => {
        const bookings = [];
        querySnapshot.forEach(docSnap => bookings.push({id: docSnap.id, ...docSnap.data()}));
        onData(bookings, currentUser, getState().userIsAdmin);
    }, onError);
}