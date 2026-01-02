import * as dom from '../dom.js';
import { getState } from '../state.js';
import { handleLogout, handleChangePassword } from '../services/auth.js';
import { initPushNotifications } from '../services/push.js';
import { navigateTo } from '../ui.js'; 

export function initProfileView() {
    console.log("Profile View initialized");

    // 1. Button-Logik: Passwort ändern
    if (dom.changePasswordBtn) {
        dom.changePasswordBtn.onclick = () => {
            if (dom.passwordChangeContainer) {
                const isHidden = dom.passwordChangeContainer.style.display === 'none';
                dom.passwordChangeContainer.style.display = isHidden ? 'block' : 'none';
                
                dom.changePasswordBtn.innerHTML = isHidden 
                    ? '<i class="fa-solid fa-chevron-up"></i> Abbrechen' 
                    : '<i class="fa-solid fa-key"></i> Passwort ändern';
            }
        };
    }

    // 2. Button-Logik: Passwort speichern
    if (dom.saveNewPasswordBtn) {
        dom.saveNewPasswordBtn.onclick = async () => {
            await handleChangePassword();
        };
    }

    // Validierung der Passwörter
    if (dom.newPasswordInput && dom.newPasswordConfirmInput) {
        const validatePasswords = () => {
            const p1 = dom.newPasswordInput.value;
            const p2 = dom.newPasswordConfirmInput.value;
            
            if (p1 === "" && p2 === "") {
                dom.newPasswordInput.classList.remove('input-valid', 'input-invalid');
                dom.newPasswordConfirmInput.classList.remove('input-valid', 'input-invalid');
                return;
            }
            
            if (p1 === p2 && p1.length >= 6) {
                dom.newPasswordInput.classList.add('input-valid');
                dom.newPasswordInput.classList.remove('input-invalid');
                dom.newPasswordConfirmInput.classList.add('input-valid');
                dom.newPasswordConfirmInput.classList.remove('input-invalid');
            } else {
                dom.newPasswordInput.classList.add('input-invalid');
                dom.newPasswordInput.classList.remove('input-valid');
                dom.newPasswordConfirmInput.classList.add('input-invalid');
                dom.newPasswordConfirmInput.classList.remove('input-valid');
            }
        };
        dom.newPasswordInput.oninput = validatePasswords;
        dom.newPasswordConfirmInput.oninput = validatePasswords;
    }

    // 3. Changelog
    if (dom.showChangelogBtn && dom.changelogModal && dom.changelogContent) {
        dom.showChangelogBtn.onclick = async () => {
            dom.changelogContent.innerHTML = '<div class="spinner" style="margin: 20px auto;"></div><p style="text-align:center">Lade Neuigkeiten...</p>';
            dom.changelogModal.style.display = 'flex';

            try {
                const response = await fetch('CHANGELOG.md?v=' + new Date().getTime());
                if (!response.ok) throw new Error("Konnte Datei nicht laden");
                const text = await response.text();
                
                let formattedHtml = text
                    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                    .replace(/^\- (.*$)/gim, '<li>$1</li>')
                    .replace(/\n/gim, '<br>');

                dom.changelogContent.innerHTML = formattedHtml;
            } catch (e) {
                dom.changelogContent.innerHTML = "<p>Keine Neuigkeiten verfügbar.</p>";
            }
        };
    }

    if (dom.changelogCloseBtn && dom.changelogModal) {
        dom.changelogCloseBtn.onclick = () => { dom.changelogModal.style.display = 'none'; };
    }

    // 4. Push Notifications (mit Test-Funktion)
    if (dom.enableNotificationsBtn) {
        dom.enableNotificationsBtn.onclick = async () => {
            if (Notification.permission === 'granted') {
                try {
                    const reg = await navigator.serviceWorker.ready;
                    if (reg) {
                        reg.showNotification("Push Test 🔔", {
                            body: "Super! Push-Nachrichten funktionieren.",
                            icon: './img/icon-192.png',
                            vibrate: [200, 100, 200]
                        });
                    } else {
                        new Notification("Push Test 🔔", { body: "Super! Push-Nachrichten funktionieren." });
                    }
                } catch (e) {
                    alert("Test konnte nicht gesendet werden: " + e);
                }
                initPushNotifications(true);
            } else {
                initPushNotifications(true);
            }
            setTimeout(loadProfileData, 1000);
        };
    }

    // 5. PROBLEM MELDEN (NEU) - Leitet zur Wartungsseite
    if (dom.reportIssueBtnProfile) {
        dom.reportIssueBtnProfile.onclick = () => {
            const maintSec = document.getElementById('maintenanceSection');
            if (maintSec) {
                navigateTo(maintSec);
            } else {
                alert("Fehler: Wartungs-Seite nicht gefunden.");
            }
        };
    }

    // 6. Logout
    if (dom.logoutBtnProfile) {
        dom.logoutBtnProfile.onclick = () => {
            if(confirm("Wirklich abmelden?")) handleLogout();
        };
    }

    // 7. Konto löschen
    if (dom.deleteAccountBtn) {
        dom.deleteAccountBtn.onclick = () => {
            if (dom.deleteAccountModal) {
                dom.deleteAccountModal.style.display = 'flex';
                if(dom.deleteAccountPasswordInput) dom.deleteAccountPasswordInput.value = '';
            }
        };
    }
}

export function loadProfileData() {
    const { currentUser } = getState();
    
    if (currentUser && currentUser.userData) {
        if (dom.profileEmail) dom.profileEmail.textContent = currentUser.userData.email || '...';
        if (dom.profilePartei) dom.profilePartei.textContent = currentUser.userData.partei || '...';
        
        if (dom.enableNotificationsBtn) {
            if (Notification.permission === 'granted') {
                dom.enableNotificationsBtn.innerHTML = '<i class="fa-solid fa-bell"></i> Push testen 🔔';
                dom.enableNotificationsBtn.className = 'button-primary'; 
            } else {
                dom.enableNotificationsBtn.innerHTML = '<i class="fa-solid fa-bell-slash"></i> Push aktivieren';
                dom.enableNotificationsBtn.className = 'button-secondary'; 
            }
        }
    }
}