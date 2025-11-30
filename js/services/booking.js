import { 
    db, query, where, getDocs, addDoc, deleteDoc, doc, orderBy, limit,
    onSnapshot, getBookingsCollectionRef, updateDoc, runTransaction
} from '../firebase.js';
import { getState } from '../state.js';
import { showMessage } from '../ui.js';
import { today, formatDate } from '../utils.js';
import * as dom from '../dom.js';
import { checkBookingPermission, updateKarma } from './karma.js'; 
import { BONUS_CANCEL_EARLY, PENALTY_CANCEL_LATE, COST_SLOT_NORMAL, COST_SLOT_PRIME } from '../config.js';
import { getSystemStatus } from './maintenance.js';

export async function checkDuplicateBooking(selectedDate, partei) {
    const q = query(getBookingsCollectionRef(), where('date', '==', selectedDate), where('partei', '==', partei));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

export async function checkSlotAvailability(selectedDate) {
    const { currentUser } = getState();
    if (!currentUser) return null;
    const systemStatus = await getSystemStatus();
    if (systemStatus === 'maintenance') return { "07:00-13:00": { status: 'disabled', text: '⚠️ WARTUNG' }, "13:00-19:00": { status: 'disabled', text: '⚠️ WARTUNG' } };
    const q = query(getBookingsCollectionRef(), where('date', '==', selectedDate));
    const querySnapshot = await getDocs(q);
    const bookingsOnDay = [];
    querySnapshot.forEach(doc => bookingsOnDay.push(doc.data()));
    const myPartei = currentUser.userData.partei;
    const availability = { "07:00-13:00": { status: 'available', text: '07:00 - 13:00 (Verfügbar)' }, "13:00-19:00": { status: 'available', text: '13:00 - 19:00 (Verfügbar)' } };
    const hasMyParteiBooked = bookingsOnDay.some(b => b.partei === myPartei && !b.isReleased);
    for (const booking of bookingsOnDay) {
        if (booking.isReleased) { availability[booking.slot] = { status: 'available-spontaneous', text: `${booking.slot} (Spontan frei! ⚡)` }; continue; }
        if (availability[booking.slot]) {
            if (booking.partei === myPartei) {
                let statusExtra = (booking.checkInTime && !booking.checkOutTime) ? " (Eingecheckt ▶️)" : "";
                availability[booking.slot] = { status: 'booked-me', text: `${booking.slot} (Gebucht)${statusExtra}` };
            } else { availability[booking.slot] = { status: 'booked-other', text: `${booking.slot} (Belegt - ${booking.partei})` }; }
        }
    }
    if (hasMyParteiBooked) {
        for (const slot in availability) {
            if (availability[slot].status.startsWith('available')) availability[slot] = { status: 'disabled-duplicate', text: `${slot} (Bereits gebucht)` };
        }
    }
    return availability;
}

// ===== NEUE FUNKTION: STATUS-LISTENER =====
export function subscribeToMachineStatus(onStatusUpdate) {
    // Wir hören auf alle Buchungen für HEUTE
    const todayStr = formatDate(new Date());
    const q = query(getBookingsCollectionRef(), where("date", "==", todayStr));
    
    return onSnapshot(q, (snapshot) => {
        const bookings = [];
        snapshot.forEach(d => bookings.push(d.data()));
        
        // Berechne Status
        const now = new Date();
        const hour = now.getHours();
        let currentSlot = null;
        
        if (hour >= 7 && hour < 13) currentSlot = "07:00-13:00";
        else if (hour >= 13 && hour < 19) currentSlot = "13:00-19:00";
        
        let status = 'free'; // Default: Frei
        
        if (currentSlot) {
            // Suche Buchung für den aktuellen Slot
            const activeBooking = bookings.find(b => b.slot === currentSlot);
            
            if (activeBooking) {
                // Wenn Buchung existiert, ist sie belegt, ES SEI DENN sie wurde freigegeben (Checkout)
                if (!activeBooking.isReleased) {
                    status = 'busy';
                }
            }
        }
        
        onStatusUpdate(status);
    });
}

// ===== HIER IST DIE KORRIGIERTE FUNKTION =====
export async function performBooking(date, slot, messageElementId) { 
    if (!date || !slot) { showMessage(messageElementId, "Datum/Slot wählen!", 'error'); return false; }
    const { currentUser, currentUserId, userIsAdmin } = getState();
    if (!currentUser) return false;
    if ((await getSystemStatus()) === 'maintenance') { showMessage(messageElementId, "Wartung!", 'error'); return false; }
    
    const selectedDate = new Date(date); selectedDate.setHours(0, 0, 0, 0);
    if (selectedDate < today) { showMessage(messageElementId, "Vergangenheit!", 'error'); return false; }
    
    let cost = 0;
    if (!userIsAdmin) {
        const check = await checkBookingPermission(date, slot);
        if (!check.allowed) { showMessage(messageElementId, check.error, 'error'); return false; }
        cost = check.cost;
    }

    try {
        await runTransaction(db, async (transaction) => {
            // 1. REFERENZEN VORBEREITEN
            // Wir erstellen eine ID aus Datum und Slot, um Doppelbuchungen technisch unmöglich zu machen.
            const uniqueBookingId = `${date}_${slot.replace(':', '-')}`;
            const bookingRef = doc(db, "bookings", uniqueBookingId);
            const partyRef = doc(db, "parties", currentUser.userData.partei);

            // 2. ALLE LESE-OPERATIONEN (Müssen VOR Schreib-Operationen kommen!)
            
            // A) Slot prüfen (Transaktional)
            const bookingDoc = await transaction.get(bookingRef);
            
            // B) Duplikate prüfen (Vorab-Check per Query)
            const bookingsRef = getBookingsCollectionRef();
            const qDup = query(bookingsRef, where("date", "==", date), where("partei", "==", currentUser.userData.partei));
            const dupSnap = await getDocs(qDup); 

            // C) Karma lesen (Transaktional)
            let currentKarma = 0;
            if (!userIsAdmin && cost !== 0) {
                const partyDoc = await transaction.get(partyRef);
                if (!partyDoc.exists()) throw "Partei-Daten fehlen.";
                currentKarma = partyDoc.data().karma || 100;
            }

            // 3. LOGIK-CHECKS
            
            // Check: Ist Slot belegt?
            if (bookingDoc.exists()) {
                const existing = bookingDoc.data();
                // Wenn sie NICHT released ist, ist der Slot voll.
                if (!existing.isReleased) {
                    throw "Dieser Slot wurde gerade von jemand anderem gebucht.";
                }
            }

            // Check: Hat Partei heute schon gebucht?
            const hasActiveBooking = dupSnap.docs.some(d => !d.data().isReleased && d.id !== uniqueBookingId);
            if (hasActiveBooking) {
                throw "Eure Partei hat an diesem Tag bereits gebucht.";
            }

            // Check: Karma
            if (!userIsAdmin && (currentKarma + cost < 0)) {
                throw "Nicht genug Karma (während Transaktion geprüft).";
            }

            // 4. SCHREIB-OPERATIONEN
            
            // Buchung anlegen / überschreiben
            transaction.set(bookingRef, {
                date: date, 
                slot: slot, 
                partei: currentUser.userData.partei, 
                userId: currentUserId, 
                bookedAt: new Date().toISOString(), 
                isSwap: false, 
                checkInTime: null, 
                checkOutTime: null, 
                isReleased: false
            });

            // Karma abziehen
            if (!userIsAdmin && cost !== 0) {
                transaction.update(partyRef, { karma: currentKarma + cost });
            }
        });

        showMessage(messageElementId, `Erfolg! (${cost} Karma)`, 'success');
        if (messageElementId === 'booking-error') document.getElementById("booking-slot").value = ''; 
        return true;

    } catch (e) {
        console.error("Booking Error:", e);
        const msg = typeof e === 'string' ? e : "Buchung fehlgeschlagen (Bitte erneut versuchen).";
        showMessage(messageElementId, msg, 'error');
        return false;
    }
}
// ===========================================

export async function performDeletion(date, slot, messageElementId) {
    const { currentUserId, currentUser, userIsAdmin } = getState();
    if (!date || !slot || !currentUser) return false;
    
    // Für die Löschung müssen wir die ID rekonstruieren oder per Query suchen.
    // Da wir die ID jetzt deterministisch machen, könnten wir auch direkt zugreifen,
    // aber die Query-Methode ist sicherer für alte Buchungen (Rückwärtskompatibilität).
    const bookingsColRef = getBookingsCollectionRef();
    let q = userIsAdmin ? query(bookingsColRef, where("date", "==", date), where("slot", "==", slot)) : query(bookingsColRef, where("date", "==", date), where("slot", "==", slot), where("partei", "==", currentUser.userData.partei));
    
    try {
        const snap = await getDocs(q);
        if (snap.empty) { showMessage(messageElementId, "Nicht gefunden/Berechtigung fehlt.", 'error'); return false; }
        
        const docToDelete = snap.docs[0]; const data = docToDelete.data();
        await deleteDoc(docToDelete.ref);
        
        if (data.userId === currentUserId || (!userIsAdmin && data.partei === currentUser.userData.partei)) {
            const bookingDate = new Date(data.date + "T" + data.slot.substring(0,5));
            const hoursDiff = (bookingDate - new Date()) / (1000 * 60 * 60);
            const isWeekend = (bookingDate.getDay() === 0 || bookingDate.getDay() === 6);
            const cost = isWeekend ? Math.abs(COST_SLOT_PRIME) : Math.abs(COST_SLOT_NORMAL);
            let refund = cost;
            if (hoursDiff > 24) refund += BONUS_CANCEL_EARLY; else if (hoursDiff < 4 && hoursDiff > 0) refund += PENALTY_CANCEL_LATE;
            if (refund !== 0) { await updateKarma(currentUser.userData.partei, refund, "Stornierung"); showMessage(messageElementId, `Gelöscht (+${refund} Karma).`, 'success'); return true; }
        }
        showMessage(messageElementId, `Gelöscht.`, 'success'); return true;
    } catch (e) { showMessage(messageElementId, `Fehler: ${e.message}`, 'error'); return false; }
}

export async function performCheckIn(bookingId, messageElementId) {
    try { await updateDoc(doc(getBookingsCollectionRef(), bookingId), { checkInTime: new Date().toISOString() }); showMessage(messageElementId, "Check-in erfolgreich!", 'success'); return true; } 
    catch (e) { showMessage(messageElementId, `Fehler: ${e.message}`, 'error'); return false; }
}

export async function performCheckOut(bookingId, messageElementId) {
    const { currentUser } = getState();
    try { 
        await updateDoc(doc(getBookingsCollectionRef(), bookingId), { isReleased: true, releasedAt: new Date().toISOString(), checkOutTime: new Date().toISOString() }); 
        if(currentUser) await updateKarma(currentUser.userData.partei, 5, "Früher fertig Bonus");
        showMessage(messageElementId, "Check-out erfolgreich! (+5 Karma)", 'success'); return true; 
    } catch (e) { showMessage(messageElementId, `Fehler: ${e.message}`, 'error'); return false; }
}

export async function releaseSlotEarly(bookingId, messageElementId) { return performCheckOut(bookingId, messageElementId); }

export async function checkAndAutoCheckoutOldBookings() {
    const { currentUser } = getState();
    if (!currentUser) return;
    const q = query(getBookingsCollectionRef(), where("partei", "==", currentUser.userData.partei), orderBy("date", "desc"), limit(10));
    try {
        const snap = await getDocs(q);
        const todayStr = formatDate(new Date());
        const currentHour = new Date().getHours();
        snap.forEach(async (docSnap) => {
            const data = docSnap.data();
            if (data.checkOutTime || data.isReleased) return;
            const endHour = parseInt(data.slot.split('-')[1].split(':')[0]);
            let isExpired = (data.date < todayStr) || (data.date === todayStr && currentHour >= endHour);
            if (isExpired) {
                console.log(`Auto-Checkout: ${docSnap.id}`);
                const closingTime = new Date(data.date + "T" + data.slot.split('-')[1]).toISOString();
                await updateDoc(docSnap.ref, { checkOutTime: closingTime, isReleased: true, autoCheckedOut: true });
            }
        });
    } catch (e) { console.warn("Auto-Cleanup Fehler:", e); }
}

export function listenToMyActiveBooking(onData) {
    const { currentUser } = getState();
    if (!currentUser) return () => {};

    const todayStr = formatDate(new Date());
    const q = query(
        getBookingsCollectionRef(),
        where("partei", "==", currentUser.userData.partei),
        where("date", "==", todayStr),
        where("isReleased", "==", false)
    );

    return onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const docSnap = snapshot.docs[0];
            onData({ id: docSnap.id, ...docSnap.data() });
        } else {
            onData(null);
        }
    }, (error) => {
        console.error("Fehler beim Laden der eigenen Buchung:", error);
        onData(null);
    });
}

export function loadNextBookingsOverview(onData, onError) {
    const todayFormatted = formatDate(new Date());
    const q = query(getBookingsCollectionRef(), where("date", ">=", todayFormatted), orderBy("date"), orderBy("slot"), limit(5));
    return onSnapshot(q, (qs) => {
        const bookings = []; qs.forEach(d => bookings.push({id: d.id, ...d.data()}));
        onData(bookings, getState().currentUser, getState().userIsAdmin);
    }, onError);
}