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
import { getState } from '../state.js'; // <--- NEU: Import für User-ID

// ... (loadWashPrograms, addWashProgram, deleteWashProgram, listenToActiveTimer bleiben unverändert) ...

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

export async function deleteWashProgram(docId) {
    try {
        await deleteDoc(getWashProgramDocRef(docId));
        showMessage('profile-message', 'Programm gelöscht.', 'success');
    } catch (e) {
        showMessage('profile-message', `Fehler: ${e.message}`, 'error');
    }
}

export function listenToActiveTimer(partei, onData) {
    if (!partei) {
        onData(null);
        return () => {}; 
    }
    
    return onSnapshot(getActiveTimerDocRef(partei), (docSnap) => {
        if (docSnap.exists()) {
            onData(docSnap.data());
        } else {
            onData(null); 
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
    if (!partei) {
        alert("Fehler: Deinem Benutzer ist keine 'Partei' zugeordnet.");
        return;
    }

    // NEU: Wir holen den aktuellen User
    const { currentUser } = getState();
    if (!currentUser) {
        alert("Fehler: Nicht eingeloggt.");
        return;
    }

    try {
        const now = Timestamp.now();
        const endTime = new Timestamp(now.seconds + program.durationMinutes * 60, now.nanoseconds);
        
        await setDoc(getActiveTimerDocRef(partei), {
            programName: program.name,
            endTime: endTime,
            startTime: now, 
            durationMinutes: program.durationMinutes,
            startedBy: currentUser.uid, // <--- WICHTIG: Wir speichern WER es war
            notified: false 
        });
    } catch (e) {
        console.error("Fehler beim Starten des Timers:", e);
        alert("Fehler: " + e.message);
    }
}

export async function stopWashTimer(partei) {
    if (!partei) return;
    try {
        await deleteDoc(getActiveTimerDocRef(partei));
    } catch (e) {
        console.error("Fehler beim Stoppen des Timers:", e);
    }
}