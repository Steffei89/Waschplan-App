import { 
    db,
    onSnapshot,
    addDoc,
    deleteDoc,
    setDoc,
    Timestamp,
    orderBy,
    query,
    getWashProgramsCollectionRef,
    getWashProgramDocRef,
    getActiveTimerDocRef
} from '../firebase.js';
import { showMessage } from '../ui.js';

/**
 * Erstellt einen Live-Listener für die Waschprogramm-Vorlagen (Admin).
 */
export function loadWashPrograms(onData, onError) {
    const q = query(getWashProgramsCollectionRef(), orderBy("name"));
    return onSnapshot(q, (querySnapshot) => {
        const programs = [];
        querySnapshot.forEach((doc) => {
            programs.push({ id: doc.id, ...doc.data() });
        });
        onData(programs);
    }, onError);
}

/**
 * Admin: Fügt ein neues Waschprogramm hinzu.
 */
export async function addWashProgram(name, duration) {
    if (!name || !duration) {
        showMessage('profile-message', 'Name und Dauer sind erforderlich.', 'error');
        return false;
    }
    const durationMinutes = parseInt(duration, 10);
    if (isNaN(durationMinutes) || durationMinutes <= 0) {
        showMessage('profile-message', 'Dauer muss eine positive Zahl sein.', 'error');
        return false;
    }

    try {
        await addDoc(getWashProgramsCollectionRef(), {
            name: name,
            durationMinutes: durationMinutes
        });
        showMessage('profile-message', 'Programm hinzugefügt!', 'success');
        return true;
    } catch (e) {
        showMessage('profile-message', `Fehler: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Admin: Löscht ein Waschprogramm.
 */
export async function deleteWashProgram(docId) {
    try {
        await deleteDoc(getWashProgramDocRef(docId));
        showMessage('profile-message', 'Programm gelöscht.', 'success');
    } catch (e) {
        showMessage('profile-message', `Fehler: ${e.message}`, 'error');
    }
}

/**
 * Erstellt einen Live-Listener für den Timer der EIGENEN Partei.
 */
export function listenToActiveTimer(partei, onData) {
    if (!partei) return () => {}; // Leere Unsubscribe-Funktion
    
    // Dies hört auf ein EINZIGES Dokument
    return onSnapshot(getActiveTimerDocRef(partei), (docSnap) => {
        if (docSnap.exists()) {
            onData(docSnap.data());
        } else {
            onData(null); // Kein Timer aktiv
        }
    }, (error) => {
        console.error("Fehler beim Hören auf den Timer:", error);
        onData(null);
    });
}

/**
 * Nutzer: Startet einen Timer für die eigene Partei.
 */
export async function startWashTimer(partei, program) {
    try {
        const now = Timestamp.now();
        const endTime = new Timestamp(now.seconds + program.durationMinutes * 60, now.nanoseconds);
        
        await setDoc(getActiveTimerDocRef(partei), {
            programName: program.name,
            endTime: endTime,
            startTime: now, // Nützlich für die %-Berechnung
            durationMinutes: program.durationMinutes
        });
    } catch (e) {
        console.error("Fehler beim Starten des Timers:", e);
    }
}

/**
 * Nutzer: Stoppt (löscht) den Timer für die eigene Partei.
 */
export async function stopWashTimer(partei) {
    try {
        await deleteDoc(getActiveTimerDocRef(partei));
    } catch (e) {
        console.error("Fehler beim Stoppen des Timers:", e);
    }
}