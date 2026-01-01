import * as dom from '../dom.js';
import { getState } from '../state.js';
import { handleChangePassword } from '../services/auth.js';
import { showChangelog } from '../ui.js';
import { initPushNotifications } from '../services/push.js';

function checkProfilePasswordMatch() {
    const p1 = document.getElementById('new-password');
    const p2 = document.getElementById('new-password-confirm');
    
    if (!p1 || !p2) return;
    
    const v1 = p1.value; 
    const v2 = p2.value;
    
    if (v1 === "" && v2 === "") { 
        p1.classList.remove('input-valid', 'input-invalid'); 
        p2.classList.remove('input-valid', 'input-invalid'); 
        return; 
    }
    
    if (v1 === v2) { 
        p1.classList.add('input-valid'); p1.classList.remove('input-invalid');
        p2.classList.add('input-valid'); p2.classList.remove('input-invalid');
    } else { 
        p1.classList.add('input-invalid'); p1.classList.remove('input-valid');
        p2.classList.add('input-invalid'); p2.classList.remove('input-valid');
    }
}

export function initProfileView() {
    console.log("Profile View wird initialisiert...");

    // 1. Passwort Ändern Toggle (onclick)
    const toggleBtn = document.getElementById('change-password-btn');
    const pwContainer = document.getElementById('password-change-container');
    
    if (toggleBtn && pwContainer) {
        toggleBtn.onclick = () => {
            const isHidden = pwContainer.style.display === 'none';
            pwContainer.style.display = isHidden ? 'block' : 'none';
            toggleBtn.innerHTML = isHidden ? '<i class="fa-solid fa-chevron-up"></i> Abbrechen' : '<i class="fa-solid fa-key"></i> Passwort ändern';
        };
    }

    // 2. Passwort Speichern
    const savePwBtn = document.getElementById('save-new-password-btn');
    if (savePwBtn) {
        savePwBtn.onclick = () => {
            const p1 = document.getElementById('new-password').value;
            const p2 = document.getElementById('new-password-confirm').value;
            if(p1 && p1 === p2) {
                handleChangePassword(); 
            } else {
                alert("Passwörter stimmen nicht überein oder sind leer.");
            }
        };
    }

    // 3. Live-Validierung
    const p1 = document.getElementById('new-password');
    const p2 = document.getElementById('new-password-confirm');
    if (p1) p1.oninput = checkProfilePasswordMatch;
    if (p2) p2.oninput = checkProfilePasswordMatch;

    // 4. Konto Löschen Button
    const delBtn = document.getElementById('delete-account-btn');
    const modal = document.getElementById('deleteAccountModal');
    const modalInput = document.getElementById('delete-account-password');
    
    if (delBtn && modal) {
        delBtn.onclick = () => {
            modal.style.display = 'flex';
            if(modalInput) modalInput.value = '';
        };
    }

    // 5. Notifications
    const notifBtn = document.getElementById('enable-notifications-btn');
    if (notifBtn) {
        notifBtn.onclick = async () => {
            if (Notification.permission === 'granted') {
                try {
                    const reg = await navigator.serviceWorker.ready;
                    await reg.showNotification('Test 🔔', { body: 'Test OK!', icon: 'img/icon-192.png' });
                    await initPushNotifications(); 
                    alert("Test-Nachricht gesendet.");
                } catch(e) { alert("Fehler: " + e.message); }
            } else {
                await initPushNotifications();
                loadProfileData(); 
            }
        };
    }

    // 6. Changelog
    const changelogBtn = document.getElementById('show-changelog-btn');
    if (changelogBtn) {
        changelogBtn.onclick = () => showChangelog();
    }
}

export async function loadProfileData() {
    const { currentUser } = getState();
    if (currentUser) {
        const emailEl = document.getElementById('profile-email');
        const parteiEl = document.getElementById('profile-partei');
        
        if(emailEl) emailEl.textContent = currentUser.userData.email || '...';
        if(parteiEl) parteiEl.textContent = currentUser.userData.partei || '...';
        
        const notifBtn = document.getElementById('enable-notifications-btn');
        if (notifBtn) {
            notifBtn.style.display = 'block';
            if (Notification.permission === 'granted') {
                notifBtn.innerHTML = '<i class="fa-solid fa-bell"></i> Push aktiv (Testen)';
                notifBtn.className = 'button-primary';
            } else {
                notifBtn.innerHTML = '<i class="fa-solid fa-bell"></i> Push aktivieren';
                notifBtn.className = 'button-secondary';
            }
        }
    }
}