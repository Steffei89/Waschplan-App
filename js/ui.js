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

export function unsubscribeForNavigation() {
    const unsubscribers = getUnsubscribers();
    if (unsubscribers.overview) { unsubscribers.overview(); setUnsubscriber('overview', null); }
    if (unsubscribers.calendar) { unsubscribers.calendar(); setUnsubscriber('calendar', null); }
}

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

// --- NAVIGATION DOCK LOGIK ---
export function initBottomNav(onTabChange) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.dataset.target;
            const targetEl = document.getElementById(targetId);
            
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            if(targetEl) navigateTo(targetEl);
            
            // Callback (Minigame Init)
            if (onTabChange) onTabChange(targetId);
        });
    });
}

export function navigateTo(sectionElement, direction = 'forward') {
    document.documentElement.dataset.transition = direction;
    if (document.startViewTransition) { document.startViewTransition(() => performNavigation(sectionElement)); } 
    else { performNavigation(sectionElement); }
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
    
    // Header
    if (dom.headerContainer) {
        // Immer anzeigen (außer Login). Vollbild regelt das CSS.
        dom.headerContainer.style.display = isAuthPage ? 'none' : 'flex';
    }

    // Dock Steuerung
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) {
        if (currentUser && !isAuthPage) {
            bottomNav.style.display = 'flex';
            
            let activeTabId = sectionElement.id;
            if (activeTabId === 'maintenanceSection') activeTabId = 'profileSection';
            if (activeTabId === 'adminSection') activeTabId = 'mainMenu';
            if (activeTabId === 'bookingSection') activeTabId = 'calendarSection';

            const navItems = document.querySelectorAll('.nav-item');
            navItems.forEach(item => {
                if(item.dataset.target === activeTabId) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        } else {
            bottomNav.style.display = 'none';
        }
    }
    
    // Back Button
    const isMainTab = ['mainMenu', 'calendarSection', 'profileSection', 'minigameSection'].includes(sectionElement.id);
    const globalBackBtn = document.getElementById('global-back-btn');
    
    if (globalBackBtn) {
        if (currentUser && !isAuthPage && !isMainTab) {
            sectionElement.prepend(globalBackBtn);
            globalBackBtn.style.display = 'flex';
        } else {
            globalBackBtn.style.display = 'none';
        }
    }

    if (dom.userInfo) {
        dom.userInfo.style.display = (currentUser && !isAuthPage) ? 'flex' : 'none';
    }

    if (dom.liveTimerSection) {
        const hasContent = dom.liveTimerSection.innerHTML.trim() !== '';
        // Timer auch im Spiel-Tab anzeigen, solange nicht im Vollbild (CSS regelt das)
        const shouldShowTimer = currentUser && !isAuthPage && hasContent;

        if (shouldShowTimer) {
            dom.liveTimerSection.style.display = 'block';
            setTimeout(() => dom.liveTimerSection.classList.add('active'), 50);
        } else {
            dom.liveTimerSection.style.display = 'none';
            dom.liveTimerSection.classList.remove('active');
        }
    }

    if(sectionElement) {
        sectionElement.style.display = (sectionElement.id === 'minigameSection') ? 'flex' : 'block';
        setTimeout(() => sectionElement.classList.add('active'), 50);
    }
}

export function updateUserInfo(userData) {
    const { userIsAdmin } = getState();
    if (userData) {
        document.getElementById('current-username').textContent = userData.email || 'Unbekannt';
        document.getElementById('profile-email').textContent = userData.email || '';
        document.getElementById('profile-partei').textContent = userData.partei || '';
        
        const adminBtn = document.getElementById('admin-btn');
        if(adminBtn) adminBtn.style.display = userIsAdmin ? 'block' : 'none';

        const userTheme = userData.theme || 'light';
        setTheme(userTheme, false);
    } else {
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
        
        let htmlContent = '';
        try {
            const sections = text.split('## [');
            if (sections.length < 2) throw new Error("Format");
            let latestChanges = sections[1].split('## [')[0];
            const lines = latestChanges.split('\n');
            const version = lines[0].split(']')[0]; 
            
            htmlContent = `<h4>Version ${version}</h4><ul>`;
            lines.slice(1).forEach(line => {
                line = line.trim();
                if (line.startsWith('###')) htmlContent += `</ul><h5>${line.replace('###', '').trim()}</h5><ul>`;
                else if (line.startsWith('*')) htmlContent += `<li>${line.replace('*', '').trim()}</li>`;
            });
            htmlContent += '</ul>';
        } catch(parseError) {
            htmlContent = `<pre style="white-space: pre-wrap; font-family: inherit;">${text}</pre>`;
        }

        dom.changelogContent.innerHTML = htmlContent;
        dom.changelogModal.style.display = 'flex';
    } catch (e) {
        console.error("Fehler beim Anzeigen des Changelogs:", e);
        dom.changelogContent.innerHTML = "<p>Konnte Neuheiten nicht laden.</p>";
        dom.changelogModal.style.display = 'flex';
        localStorage.setItem('waschplan_version', APP_VERSION);
    }
}