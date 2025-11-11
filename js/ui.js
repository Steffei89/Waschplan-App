import * as dom from './dom.js';
import { getState, setTheme as setGlobalTheme, getUnsubscribers, setUnsubscriber } from './state.js';
import { updatePassword, auth, updateDoc, getUserProfileDocRef } from './firebase.js';
import { loadStatistics } from './services/stats.js';

export function showMessage(elementId, message, type = 'error', duration = 5000) {
    // ... (Diese Funktion bleibt unverändert)
    const el = document.getElementById(elementId);
    if (!el) {
        // Fallback
        const fallbackEl = dom.mainMenu; 
        if (fallbackEl) {
            const tempMsg = document.createElement('div');
            tempMsg.className = `message-box ${type}`;
            tempMsg.textContent = message;
            tempMsg.style.display = 'block';
            fallbackEl.prepend(tempMsg);
            
            setTimeout(() => {
                tempMsg.style.display = 'none';
                tempMsg.remove();
            }, duration);
        }
        return;
    }

    el.textContent = message;
    el.className = `message-box ${type}`;
    el.style.display = 'block';
    
    setTimeout(() => {
        if (el) el.style.display = 'none';
    }, duration);
}

export function hideConfirmation() {
    // ... (Diese Funktion bleibt unverändert)
    dom.confirmationModal.style.display = 'none';
}

export function unsubscribeAll() {
    // ... (Diese Funktion bleibt unverändert)
    const unsubscribers = getUnsubscribers();
    Object.values(unsubscribers).forEach(unsub => {
        if (unsub) unsub();
    });
    setUnsubscriber('overview', null);
    setUnsubscriber('calendar', null);
    setUnsubscriber('quickView', null);
    setUnsubscriber('requests', null);
    setUnsubscriber('outgoingRequests', null);
    setUnsubscriber('outgoingRequestsSuccess', null);
}

export function navigateTo(sectionElement) {
    // ... (Diese Funktion bleibt unverändert)
    dom.allSections.forEach(el => {
        if (el) { 
            el.style.display = 'none';
            el.classList.remove('active');
        } 
    });
    
    document.querySelectorAll('.message-box').forEach(el => el.style.display = 'none');
    
    const { currentUser } = getState();
    dom.userInfo.style.display = (currentUser && sectionElement !== dom.loginForm && sectionElement !== dom.registerForm) ? 'flex' : 'none';

    if(sectionElement) {
        sectionElement.style.display = 'block';
        setTimeout(() => sectionElement.classList.add('active'), 50);
    }
}

export function updateUserInfo(userData) {
    // ... (Diese Funktion bleibt unverändert)
    const { userIsAdmin } = getState();
    if (userData) {
        document.getElementById('current-username').textContent = userData.username || 'Unbekannt';
        document.getElementById('current-role').textContent = userIsAdmin ? 'Administrator' : 'Nutzer';
        dom.statisticBtn.style.display = userIsAdmin ? 'block' : 'none';
        const userTheme = userData.theme || 'light';
        setTheme(userTheme, false);
    } else {
        dom.statisticBtn.style.display = 'none'; 
        setTheme('light', false); 
    }
}

export function setTheme(theme, save = true) {
    // ... (Diese Funktion bleibt unverändert)
    setGlobalTheme(theme);
    document.body.setAttribute('data-theme', theme);
    
    if (dom.themeIcon) {
        if (theme === 'dark') {
            dom.themeIcon.className = 'fa-solid fa-moon clickable';
            dom.themeIcon.title = 'Zum Hell-Modus wechseln';
        } else {
            dom.themeIcon.className = 'fa-solid fa-sun clickable';
            dom.themeIcon.title = 'Zum Dunkel-Modus wechseln';
        }
    }
    if (dom.statisticSection.style.display === 'block') {
        loadStatistics(true); 
    }
    if (save) {
        saveThemePreference();
    }
}

async function saveThemePreference() {
    // ... (Diese Funktion bleibt unverändert)
    const { currentUserId, currentTheme } = getState();
    if (!currentUserId) return;
    try {
        await updateDoc(getUserProfileDocRef(currentUserId), {
            theme: currentTheme
        });
    } catch (e) {
        console.error("Fehler beim Speichern der Theme-Präferenz:", e);
    }
}

// --- NEUE FUNKTION ---
/**
 * Aktualisiert das Slot-Dropdown-Menü basierend auf der Verfügbarkeit.
 * @param {object} availability - Das von checkSlotAvailability zurückgegebene Objekt.
 */
export function updateSlotDropdownUI(availability) {
    if (!dom.bookingSlotSelect) return;

    // Setzt die Auswahl auf "Slot wählen" zurück
    dom.bookingSlotSelect.value = '';

    // Geht alle <option> Elemente durch (außer dem ersten "Slot wählen")
    const options = dom.bookingSlotSelect.querySelectorAll('option');
    
    options.forEach(option => {
        const slotValue = option.value;
        if (!slotValue) return; // Überspringt "Slot wählen"

        const slotInfo = availability[slotValue];

        if (slotInfo) {
            option.textContent = slotInfo.text;
            
            // Deaktiviert die Option, wenn sie nicht verfügbar ist
            if (slotInfo.status === 'available') {
                option.disabled = false;
                option.style.color = 'var(--text-color)';
            } else {
                option.disabled = true;
                // Färbt die Option basierend auf dem Status
                if (slotInfo.status === 'booked-me') {
                    option.style.color = 'var(--success-color)';
                } else if (slotInfo.status === 'booked-other') {
                    option.style.color = 'var(--error-color)';
                } else { // 'disabled-duplicate'
                    option.style.color = 'var(--border-color)';
                }
            }
        }
    });
}
// --- ENDE NEUE FUNKTION ---