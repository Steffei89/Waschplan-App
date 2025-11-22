import { db, doc, setDoc, getDoc, updateDoc, addDoc, collection, Timestamp, query, orderBy, onSnapshot, where } from '../firebase.js';
import { getState } from '../state.js';

// Referenz zum globalen Einstellungs-Dokument
function getSettingsRef() {
    return doc(db, 'app_settings', 'config');
}

/**
 * Meldet ein Problem mit der Waschmaschine.
 */
export async function reportIssue(reason, details) {
    const { currentUser } = getState();
    if (!currentUser) return;

    try {
        await addDoc(collection(db, "maintenance_tickets"), {
            userId: currentUser.uid,
            email: currentUser.userData.email,
            partei: currentUser.userData.partei || 'Unbekannt',
            reason: reason,
            details: details,
            status: 'open', // open, solved
            timestamp: new Date().toISOString()
        });
        return true;
    } catch (e) {
        console.error(e);
        throw e;
    }
}

/**
 * Prüft den Systemstatus.
 */
export async function getSystemStatus() {
    try {
        const snap = await getDoc(getSettingsRef());
        if (snap.exists()) {
            return snap.data().systemStatus || 'ok';
        }
        return 'ok';
    } catch (e) {
        return 'ok';
    }
}

/**
 * Setzt den Systemstatus (Admin).
 */
export async function setSystemStatus(status) {
    try {
        await setDoc(getSettingsRef(), { systemStatus: status }, { merge: true });
    } catch (e) {
        console.error(e);
        throw e;
    }
}

/**
 * Lädt alle offenen Tickets (Live-Listener für Admin).
 */
export function subscribeToTickets(onData) {
    // Wir laden alle Tickets, sortiert nach Datum (neueste oben)
    const q = query(collection(db, "maintenance_tickets"), orderBy("timestamp", "desc"));
    
    return onSnapshot(q, (snapshot) => {
        const tickets = [];
        snapshot.forEach(doc => {
            tickets.push({ id: doc.id, ...doc.data() });
        });
        onData(tickets);
    });
}

/**
 * Markiert ein Ticket als erledigt (oder öffnet es wieder).
 */
export async function toggleTicketStatus(ticketId, currentStatus) {
    const newStatus = currentStatus === 'open' ? 'solved' : 'open';
    const ref = doc(db, "maintenance_tickets", ticketId);
    await updateDoc(ref, { status: newStatus });
}