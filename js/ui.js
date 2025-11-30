import * as dom from './dom.js';
import { getState, setTheme as setGlobalTheme, getUnsubscribers, setUnsubscriber } from './state.js';
import { updatePassword, auth, updateDoc, getUserProfileDocRef } from './firebase.js';
import { loadStatistics } from './services/stats.js';
import { APP_VERSION } from './config.js';

const {
    loginForm, registerForm, mainMenu, bookingSection, 
    overviewSection, calendarSection, profileSection, 
    adminSection, minigameSection, 
    incomingRequestsContainer, outgoingRequestsStatusContainer,
    outgoingRequestsSuccessContainer,
    resetPasswordForm,
    verifyEmailMessage,
    headerContainer 
} = dom;

export function showMessage(elementId, message, type = 'error', duration = 5000) {
    const el = document.getElementById(elementId);
    if (!el) {
        const fallbackEl = dom.mainMenu; 
        if (fallbackEl) {
            const tempMsg = document.createElement('div');
            tempMsg.className = `message-box ${type}`;
            tempMsg.textContent = message;
            tempMsg.style.display = 'block';
            fallbackEl.prepend(tempMsg);
            setTimeout(() => { tempMsg.style.display = 'none'; tempMsg.remove(); }, duration);
        }
        return;
    }
    el.textContent = message;
    el.className = `message-box ${type}`;
    el.style.display = 'block';
    setTimeout(() => { if (el) el.style.display = 'none'; }, duration);
}

export function hideConfirmation() {
    dom.confirmationModal.style.display = 'none';
}

// ===== WICHTIG: Nur Seiten-Listener stoppen, Globale (Timer) behalten! =====
export function unsubscribeForNavigation() {
    const unsubscribers = getUnsubscribers();
    
    // Wir stoppen NUR Listener, die spezifisch für eine Unterseite sind.
    if (unsubscribers.overview) { 
        unsubscribers.overview(); 
        setUnsubscriber('overview', null); 
    }
    if (unsubscribers.calendar) { 
        unsubscribers.calendar(); 
        setUnsubscriber('calendar', null); 
    }
}

// Wird nur beim LOGOUT aufgerufen -> Killt alles
export function unsubscribeAll() {
    const unsubscribers = getUnsubscribers();
    Object.values(unsubscribers).forEach(unsub => { if (unsub) unsub(); });
    setUnsubscriber('overview', null); 
    setUnsubscriber('calendar', null);
    setUnsubscriber('quickView', null); 
    setUnsubscriber('requests', null);
    setUnsubscriber('outgoingRequests', null); 
    setUnsubscriber('outgoingRequestsSuccess', null);
    setUnsubscriber('programs', null); 
    setUnsubscriber('timer', null);
}

export const allSections = [
    loginForm, registerForm, mainMenu, bookingSection, 
    overviewSection, calendarSection, profileSection, 
    adminSection, minigameSection,
    incomingRequestsContainer, outgoingRequestsStatusContainer,
    outgoingRequestsSuccessContainer,
    resetPasswordForm,
    verifyEmailMessage,
    document.getElementById('maintenanceSection') 
];

// Navigation mit View Transitions und Richtungsangabe
// direction kann 'forward' (Standard) oder 'back' sein
export function navigateTo(sectionElement, direction = 'forward') {
    // Wir setzen ein Attribut am HTML-Tag, damit CSS die Richtung kennt
    document.documentElement.dataset.transition = direction;

    if (document.startViewTransition) {
        document.startViewTransition(() => {
            performNavigation(sectionElement);
        });
    } else {
        performNavigation(sectionElement);
    }
}

function performNavigation(sectionElement) {
    const sections = document.querySelectorAll('.card');
    sections.forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });
    
    document.querySelectorAll('.message-box').forEach(el => el.style.display = 'none');
    
    const { currentUser } = getState();
    const isAuthPage = sectionElement === dom.loginForm || 
                       sectionElement === dom.registerForm || 
                       sectionElement === dom.resetPasswordForm ||
                       sectionElement === dom.verifyEmailMessage;
    
    const isGame = sectionElement === dom.minigameSection;

    if (dom.headerContainer) {
        dom.headerContainer.style.display = isGame ? 'none' : 'flex';
    }
    if (dom.userInfo) {
        dom.userInfo.style.display = (currentUser && !isAuthPage && !isGame) ? 'flex' : 'none';
    }

    if (dom.liveTimerSection) {
        const hasContent = dom.liveTimerSection.innerHTML.trim() !== '';
        const shouldShowTimer = currentUser && !isAuthPage && !isGame && hasContent;

        if (shouldShowTimer) {
            dom.liveTimerSection.style.display = 'block';
            setTimeout(() => dom.liveTimerSection.classList.add('active'), 50);
        } else {
            dom.liveTimerSection.style.display = 'none';
            dom.liveTimerSection.classList.remove('active');
        }
    }

    if(sectionElement) {
        sectionElement.style.display = isGame ? 'flex' : 'block';
        setTimeout(() => sectionElement.classList.add('active'), 50);
    }
}

export function updateUserInfo(userData) {
    const { userIsAdmin } = getState();
    if (userData) {
        document.getElementById('current-username').textContent = userData.email || 'Unbekannt';
        document.getElementById('current-role').textContent = userIsAdmin ? 'Administrator' : 'Nutzer';
        document.getElementById('admin-btn').style.display = userIsAdmin ? 'block' : 'none';
        const userTheme = userData.theme || 'light';
        setTheme(userTheme, false);
    } else {
        document.getElementById('admin-btn').style.display = 'none';
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
    // Falls Admin-Bereich offen ist, Charts neu laden (für Farbanpassung)
    if (dom.adminSection && dom.adminSection.style.display === 'block') {
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
        await updateDoc(getUserProfileDocRef(currentUserId), { theme: currentTheme });
    } catch (e) { console.error("Fehler beim Speichern der Theme-Präferenz:", e); }
}

export function updateSlotDropdownUI(availability) {
    if (!dom.bookingSlotSelect) return;
    dom.bookingSlotSelect.value = '';
    const options = dom.bookingSlotSelect.querySelectorAll('option');
    options.forEach(option => {
        const slotValue = option.value;
        if (!slotValue) return; 
        const slotInfo = availability[slotValue];
        if (slotInfo) {
            option.textContent = slotInfo.text;
            if (slotInfo.status === 'available' || slotInfo.status === 'available-spontaneous') {
                option.disabled = false; option.style.color = 'var(--text-color)';
                if (slotInfo.status === 'available-spontaneous') {
                    option.style.fontWeight = 'bold';
                    option.style.color = 'var(--success-color)';
                }
            } else {
                option.disabled = true;
                if (slotInfo.status === 'booked-me') option.style.color = 'var(--success-color)';
                else if (slotInfo.status === 'booked-other') option.style.color = 'var(--error-color)';
                else if (slotInfo.status === 'disabled') option.style.color = 'var(--error-color)'; 
                else option.style.color = 'var(--border-color)';
            }
        }
    });
}

export async function checkNotificationPermission(requestIfNeeded = false) {
    if (!('Notification' in window)) { console.warn('Dieser Browser unterstützt keine Benachrichtigungen.'); return 'denied'; }
    let permission = Notification.permission;
    if (permission === 'default' && requestIfNeeded) { permission = await Notification.requestPermission(); }
    return permission;
}

export async function showTimerDoneNotification(programName) {
    const permission = await checkNotificationPermission(false); 
    if (permission !== 'granted') return;
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        alert(`Timer fertig: ${programName}`); return;
    }
    try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
            await registration.showNotification('Waschplan', {
                body: `Dein Programm "${programName}" ist fertig!`,
                icon: 'img/icon-192.png', badge: 'img/icon-192.png', vibrate: [200, 100, 200] 
            });
        }
    } catch (e) { console.error('Fehler beim Anzeigen der Benachrichtigung:', e); }
}

export async function showChangelog() {
    try {
        const response = await fetch(`CHANGELOG.md?v=${Date.now()}`);
        if (!response.ok) throw new Error('Changelog nicht gefunden.');
        const text = await response.text();
        const sections = text.split('## [');
        if (sections.length < 2) throw new Error('Changelog-Format ungültig.');
        let latestChanges = sections[1].split('## [')[0];
        const lines = latestChanges.split('\n');
        const version = lines[0].split(']')[0]; 
        let htmlContent = `<h4>Version ${version}</h4><ul>`;
        lines.slice(1).forEach(line => {
            line = line.trim();
            if (line.startsWith('###')) htmlContent += `</ul><h5>${line.replace('###', '').trim()}</h5><ul>`;
            else if (line.startsWith('*')) htmlContent += `<li>${line.replace('*', '').trim()}</li>`;
        });
        htmlContent += '</ul>';
        dom.changelogContent.innerHTML = htmlContent;
        dom.changelogModal.style.display = 'flex';
    } catch (e) {
        console.error("Fehler beim Anzeigen des Changelogs:", e);
        localStorage.setItem('waschplan_version', APP_VERSION);
    }
}