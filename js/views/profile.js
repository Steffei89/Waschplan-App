import * as dom from '../dom.js';
import { getState } from '../state.js';
import { handleChangePassword } from '../services/auth.js';
import { db, getDoc, setDoc, doc } from '../firebase.js';
import { showMessage } from '../ui.js';

function getSettingsDocRef() {
    return doc(db, 'app_settings', 'config');
}

export function initProfileView() {
    document.getElementById('change-password-btn').addEventListener('click', handleChangePassword);
    
    document.getElementById('save-weather-plz-btn').addEventListener('click', async () => {
        const newPlz = dom.weatherPlzInput.value.trim();
        if (!newPlz || newPlz.length < 4 || !/^\d+$/.test(newPlz)) {
            showMessage('profile-message', 'Ungültige PLZ. Bitte geben Sie eine gültige Zahl ein.', 'error');
            return;
        }

        try {
            await setDoc(getSettingsDocRef(), { 
                plz: newPlz 
            }, { merge: true }); // merge: true stellt sicher, dass wir nur dieses Feld überschreiben
            showMessage('profile-message', 'Wetter-Standort gespeichert!', 'success');
        } catch (e) {
            showMessage('profile-message', `Fehler beim Speichern: ${e.message}`, 'error');
        }
    });
}

export async function loadProfileData() {
    const { currentUser, userIsAdmin } = getState();
    if (currentUser) {
        dom.profileUsername.textContent = currentUser.userData.username;
        dom.profileEmail.textContent = currentUser.userData.email;
        dom.profilePartei.textContent = currentUser.userData.partei;
        dom.newPasswordInput.value = '';
    }

    // Lade die aktuell gespeicherte PLZ (nur wenn Admin)
    if (userIsAdmin) {
        try {
            const settingsSnap = await getDoc(getSettingsDocRef());
            if (settingsSnap.exists() && settingsSnap.data().plz) {
                dom.weatherPlzInput.value = settingsSnap.data().plz;
            } else {
                dom.weatherPlzInput.value = '';
            }
        } catch (e) {
            console.error("Fehler beim Laden der Settings-PLZ:", e);
            dom.weatherPlzInput.value = ''; // Im Fehlerfall leer lassen
        }
    }
}