import * as dom from './dom.js';
import { getState, setTheme as setGlobalTheme, getUnsubscribers, setUnsubscriber } from './state.js';
// KORRIGIERTE IMPORTE: updateDoc und getUserProfileDocRef wurden hinzugefügt
import { updatePassword, auth, updateDoc, getUserProfileDocRef } from './firebase.js';
import { loadStatistics } from './services/stats.js';

export function showMessage(elementId, message, type = 'error', duration = 5000) {
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
    dom.confirmationModal.style.display = 'none';
}

export function unsubscribeAll() {
    const unsubscribers = getUnsubscribers();
    Object.values(unsubscribers).forEach(unsub => {
        if (unsub) unsub();
    });
    setUnsubscriber('overview', null);
    setUnsubscriber('calendar', null);
    setUnsubscriber('quickView', null);
    setUnsubscriber('requests', null);
    setUnsubscriber('outgoingRequests', null);
}

export function navigateTo(sectionElement) {
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
    const { userIsAdmin } = getState();
    if (userData) {
        document.getElementById('current-username').textContent = userData.username || 'Unbekannt';
        document.getElementById('current-role').textContent = userIsAdmin ? 'Administrator' : 'Nutzer';
        dom.statisticBtn.style.display = userIsAdmin ? 'block' : 'none';
        const userTheme = userData.theme || 'light';
        setTheme(userTheme, false); // Wende Theme an, ohne zu speichern
    } else {
        dom.statisticBtn.style.display = 'none'; 
        setTheme('light', false); 
    }
}

export function setTheme(theme, save = true) {
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