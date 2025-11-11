import { 
    db, query, where, getDocs, addDoc, deleteDoc, doc, orderBy, limit,
    // --- HIER WURDE onSnapshot HINZUGEFÜGT ---
    onSnapshot, 
    // --- ENDE DER KORREKTUR ---
    getBookingsCollectionRef
} from '../firebase.js';
import { getState } from '../state.js';
import { showMessage } from '../ui.js';
import { today, formatDate } from '../utils.js';
import * as dom from '../dom.js';

export async function checkDuplicateBooking(selectedDate, partei) {
    const q = query(
        getBookingsCollectionRef(),
        where('date', '==', selectedDate),
        where('partei', '==', partei)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

export async function performBooking(date, slot, messageElementId, buttonElement = null) {
    if (!date || !slot) {
        showMessage(messageElementId, "Datum und Slot müssen ausgewählt werden!", 'error');
        return false;
    }
    const { currentUser, currentUserId } = getState();
    if (!currentUser || !currentUserId) {
        showMessage(messageElementId, "Fehler: Sie sind nicht angemeldet.", 'error');
        return false;
    }
    
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
        showMessage(messageElementId, "Buchungen können nicht für vergangene Tage vorgenommen werden.", 'error');
        return false;
    }

    const bookingsColRef = getBookingsCollectionRef();
    
    try {
        const hasDuplicate = await checkDuplicateBooking(date, currentUser.userData.partei);

        if (hasDuplicate) {
            const dateStr = selectedDate.toLocaleDateString('de-DE');
            showMessage(messageElementId, `Fehler: Ihre Partei ("${currentUser.userData.partei}") hat am ${dateStr} bereits einen Slot gebucht.`, 'error');
            return false;
        }

        const q = query(bookingsColRef, where("date", "==", date), where("slot", "==", slot));
        const existingBookings = await getDocs(q);

        if (!existingBookings.empty) {
             showMessage(messageElementId, "Dieser Slot ist bereits belegt!", 'error');
             return false;
        }

        await addDoc(bookingsColRef, {
            date: date,
            slot: slot,
            partei: currentUser.userData.partei, 
            userId: currentUserId, 
            bookedAt: new Date().toISOString(),
            isSwap: false 
        });

        if (buttonElement) {
             const bookText = document.getElementById("book-text"); 
             const bookIcon = document.getElementById("book-success-icon"); 
             buttonElement.classList.add('booking-success');
             if(bookText) bookText.style.display = 'none';
             if(bookIcon) bookIcon.style.display = 'block';

             setTimeout(() => {
                buttonElement.classList.remove('booking-success');
                if(bookText) bookText.style.display = 'block';
                if(bookIcon) bookIcon.style.display = 'none';
             }, 2000);
        }

        showMessage(messageElementId, "Buchung erfolgreich!", 'success');
        
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
        q = query(
            bookingsColRef, 
            where("date", "==", date), 
            where("slot", "==", slot)
        );
    } else {
        q = query(
            bookingsColRef, 
            where("date", "==", date), 
            where("slot", "==", slot),
            where("partei", "==", currentUser.userData.partei) 
        );
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
        
        showMessage(messageElementId, `Buchung von ${bookingData.partei || 'Unbekannt'} erfolgreich gelöscht.`, 'success');
        return true;

    } catch (e) {
        showMessage(messageElementId, `Fehler beim Löschen der Buchung: ${e.message}`, 'error');
        return false;
    }
}

export function loadNextBookingsOverview(onData, onError) {
    const { currentUser } = getState();
    if (!currentUser) return;

    const todayFormatted = formatDate(new Date());

    const q = query(
        getBookingsCollectionRef(),
        where("date", ">=", todayFormatted), 
        orderBy("date"),
        orderBy("slot"),
        limit(5) 
    );

    return onSnapshot(q, (querySnapshot) => {
        const bookings = [];
        querySnapshot.forEach(docSnap => bookings.push({id: docSnap.id, ...docSnap.data()}));
        onData(bookings, currentUser, getState().userIsAdmin);
    }, onError);
}