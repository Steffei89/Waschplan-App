import { 
    db, addDoc, getDocs, query, where, updateDoc, doc, runTransaction, deleteDoc, onSnapshot,
    getSwapRequestsCollectionRef, getBookingsCollectionRef
} from '../firebase.js';
import { getState } from '../state.js';
import { showMessage } from '../ui.js';
import { checkDuplicateBooking } from './booking.js';
import { updateKarma } from './karma.js';
import { BONUS_SWAP_ACCEPT } from '../config.js';

export async function handleSwapRequest(targetBooking, messageElementId) {
    const { currentUser, currentUserId } = getState();
    if (!currentUser) return;

    if (!targetBooking || !targetBooking.id) {
         showMessage(messageElementId, "Fehler: Ungültiges Buchungsziel.", 'error');
         return;
    }

    try {
        const q = query(
            getSwapRequestsCollectionRef(),
            where("targetBookingId", "==", targetBooking.id),
            where("requesterPartei", "==", currentUser.userData.partei)
        );
        const existingRequests = await getDocs(q);
        
        let alreadySent = false;
        existingRequests.forEach(doc => {
            const data = doc.data();
            if (data.status === 'pending' || typeof data.status === 'undefined') alreadySent = true;
        });

        if (alreadySent) {
            showMessage(messageElementId, "Sie haben für diesen Slot bereits eine Anfrage gesendet.", 'error');
            return;
        }

        await addDoc(getSwapRequestsCollectionRef(), {
            targetBookingId: targetBooking.id, 
            targetDate: targetBooking.date, 
            targetSlot: targetBooking.slot,
            targetPartei: targetBooking.partei, 
            
            requesterPartei: currentUser.userData.partei, 
            requesterUserId: currentUserId, 
            requestedAt: new Date().toISOString(),
            status: 'pending' 
        });

        const dateStr = new Date(targetBooking.date + "T00:00:00").toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
        showMessage(messageElementId, `Tauschanfrage für Slot von "${targetBooking.partei}" am ${dateStr} (${targetBooking.slot}) gesendet!`, 'success');
        
    } catch (e) {
        showMessage(messageElementId, `Fehler beim Senden der Tauschanfrage: ${e.message}`, 'error');
    }
}

export function loadIncomingRequests(onData, onError) {
    const { currentUser } = getState();
    if (!currentUser) return;
    const q = query(getSwapRequestsCollectionRef(), where("targetPartei", "==", currentUser.userData.partei));
    return onSnapshot(q, (querySnapshot) => {
        const allRequests = [];
        querySnapshot.forEach(docSnap => allRequests.push({id: docSnap.id, ...docSnap.data()}));
        const pendingRequests = allRequests
            .filter(r => r.status === 'pending' || typeof r.status === 'undefined')
            .sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));
        onData(pendingRequests);
    }, onError);
}

export function loadOutgoingRequestStatus(onData, onError) {
    const { currentUser } = getState();
    if (!currentUser) return;
    const q = query(getSwapRequestsCollectionRef(), where("requesterPartei", "==", currentUser.userData.partei), where("status", "==", "rejected"));
    return onSnapshot(q, (querySnapshot) => {
        const allMyRequests = [];
        querySnapshot.forEach(docSnap => allMyRequests.push({id: docSnap.id, ...docSnap.data()}));
        onData(allMyRequests); 
    }, onError);
}

export function loadOutgoingRequestSuccess(onData, onError) {
    const { currentUser } = getState();
    if (!currentUser) return;
    const q = query(getSwapRequestsCollectionRef(), where("requesterPartei", "==", currentUser.userData.partei), where("status", "==", "accepted"));
    return onSnapshot(q, (querySnapshot) => {
        const allMyRequests = [];
        querySnapshot.forEach(docSnap => allMyRequests.push({id: docSnap.id, ...docSnap.data()}));
        onData(allMyRequests);
    }, onError);
}

export async function confirmSwapTransaction(requestId) {
    const { currentUser, currentUserId } = getState(); 
    if (!currentUser) return;
    
    const requestRef = doc(getSwapRequestsCollectionRef(), requestId);
    let reqData;
    const messageElementId = 'main-menu-message'; 

    try {
        await runTransaction(db, async (transaction) => {
            const reqDoc = await transaction.get(requestRef);
            if (!reqDoc.exists()) throw new Error("Anfrage existiert nicht mehr.");
            reqData = reqDoc.data();
            
            const bookingRef = doc(getBookingsCollectionRef(), reqData.targetBookingId);
            const bookingDoc = await transaction.get(bookingRef);
            if (!bookingDoc.exists()) {
                transaction.delete(requestRef); 
                throw new Error("Die ursprüngliche Buchung existiert nicht mehr.");
            }
            const duplicateCheck = await checkDuplicateBooking(reqData.targetDate, reqData.requesterPartei);
            if (duplicateCheck) {
                transaction.delete(requestRef);
                throw new Error(`Tausch fehlgeschlagen: Partei "${reqData.requesterPartei}" hat an diesem Tag bereits eine Buchung.`);
            }
            transaction.update(bookingRef, { partei: reqData.requesterPartei, userId: reqData.requesterUserId });
            transaction.update(requestRef, { status: 'accepted' });
        });

        // BONUS FÜR HELFER (Auf Partei)
        await updateKarma(currentUser.userData.partei, BONUS_SWAP_ACCEPT, "Tausch-Bonus");

        showMessage(messageElementId, `Tausch erfolgreich! Slot übergeben (+${BONUS_SWAP_ACCEPT} Karma).`, 'success');

    } catch (e) {
        showMessage(messageElementId, e.message, 'error', 7000); 
    }
}

export async function rejectSwapRequest(requestId) {
    const messageElementId = 'main-menu-message';
    try {
        const requestRef = doc(getSwapRequestsCollectionRef(), requestId);
        await updateDoc(requestRef, { status: 'rejected' });
        showMessage(messageElementId, 'Tauschanfrage abgelehnt.', 'success');
    } catch (e) {
        showMessage(messageElementId, `Fehler beim Ablehnen: ${e.message}`, 'error');
    }
}

export async function dismissRequestNotification(requestId) {
    try { await deleteDoc(doc(getSwapRequestsCollectionRef(), requestId)); } 
    catch (err) { console.error("Fehler beim Löschen der Benachrichtigung:", err); }
}