import * as dom from '../dom.js';
import { getState, setUnsubscriber } from '../state.js';
import { handleChangePassword } from '../services/auth.js';
import { db, getDoc, setDoc, doc } from '../firebase.js';
import { showMessage, navigateTo, showChangelog, checkNotificationPermission } from '../ui.js';
import { loadWashPrograms, addWashProgram, deleteWashProgram } from '../services/timers.js';
import { getKarmaStatus, getPartyKarma } from '../services/karma.js';
import { KARMA_START } from '../config.js';
import { initPushNotifications } from '../services/push.js';

function getSettingsDocRef() { return doc(db, 'app_settings', 'config'); }

// ... (checkProfilePasswordMatch lassen wir unverändert, ist nur Logik) ...
function checkProfilePasswordMatch() {
    const passField = dom.newPasswordInput; const confirmField = document.getElementById('new-password-confirm');
    if (!passField || !confirmField) return;
    const passValue = passField.value; const confirmValue = confirmField.value;
    if (passValue === "" && confirmValue === "") { passField.classList.remove('input-valid', 'input-invalid'); confirmField.classList.remove('input-valid', 'input-invalid'); return; }
    if (passValue === confirmValue) { passField.classList.add('input-valid'); confirmField.classList.add('input-valid'); passField.classList.remove('input-invalid'); confirmField.classList.remove('input-invalid'); } 
    else { passField.classList.add('input-invalid'); confirmField.classList.add('input-invalid'); passField.classList.remove('input-valid'); confirmField.classList.remove('input-valid'); }
}

export function initProfileView() {
    document.getElementById('change-password-btn').addEventListener('click', handleChangePassword);
    
    const passField = dom.newPasswordInput;
    const confirmField = document.getElementById('new-password-confirm');
    if (passField) passField.addEventListener('input', checkProfilePasswordMatch);
    if (confirmField) confirmField.addEventListener('input', checkProfilePasswordMatch);

    document.getElementById('save-weather-plz-btn').addEventListener('click', async () => {
        const newPlz = dom.weatherPlzInput.value.trim();
        if (!newPlz || newPlz.length < 4) { showMessage('profile-message', 'Ungültige PLZ.', 'error'); return; }
        try { await setDoc(getSettingsDocRef(), { plz: newPlz }, { merge: true }); showMessage('profile-message', 'Gespeichert!', 'success'); } catch (e) { showMessage('profile-message', e.message, 'error'); }
    });

    const qrBtn = document.getElementById('generate-qr-btn');
    if (qrBtn) {
        qrBtn.addEventListener('click', async () => {
            const secret = document.getElementById('qr-secret-input').value.trim() || 'WASCH-START';
            try {
                await setDoc(getSettingsDocRef(), { qrCodeSecret: secret }, { merge: true });
                document.getElementById('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(secret)}`;
                document.getElementById('qr-code-display').style.display = 'block';
                showMessage('profile-message', 'QR-Code gespeichert!', 'success');
            } catch(e) { showMessage('profile-message', 'Fehler: ' + e.message, 'error'); }
        });
    }

    document.getElementById('delete-account-btn').addEventListener('click', () => {
        dom.deleteAccountModal.style.display = 'flex';
        dom.deleteAccountPasswordInput.value = '';
    });

    dom.addProgramBtn.addEventListener('click', async () => {
        const name = dom.programNameInput.value; const duration = dom.programDurationInput.value;
        if (await addWashProgram(name, duration)) { dom.programNameInput.value = ''; dom.programDurationInput.value = ''; }
    });

    // === DER WICHTIGE TEIL ===
    const notifBtn = document.getElementById('enable-notifications-btn');
    // Alten Listener entfernen (zur Sicherheit, falls mehrfach init)
    const newBtn = notifBtn.cloneNode(true);
    notifBtn.parentNode.replaceChild(newBtn, notifBtn);
    
    newBtn.addEventListener('click', async () => {
        alert("Klick erkannt! Starte Prozess..."); // DEBUG 1: MUSS KOMMEN!
        
        if (Notification.permission === 'granted') {
            try {
                const reg = await navigator.serviceWorker.ready;
                if(!reg) { alert("Fehler: Service Worker nicht bereit!"); return; }
                
                // Lokaler Test
                await reg.showNotification('Lokal Test 🔔', { body: 'Geht!', icon: 'img/icon-192.png' });
                
                // Server Sync erzwingen
                await initPushNotifications(); 
                
            } catch(e) {
                alert("Fehler Test: " + e.message);
            }
        } else {
            alert("Frage Berechtigung an..."); // DEBUG 2
            await initPushNotifications();
            loadProfileData(); 
        }
    });

    document.getElementById('show-changelog-btn').addEventListener('click', showChangelog);
    document.getElementById('back-to-menu-btn-4').addEventListener('click', () => navigateTo(dom.mainMenu));
}

export async function loadProfileData() {
    const { currentUser, userIsAdmin } = getState();
    if (currentUser) {
        dom.profileEmail.textContent = currentUser.userData.email;
        dom.profilePartei.textContent = currentUser.userData.partei;
        const karma = await getPartyKarma(currentUser.userData.partei);
        const { label, status, weeks } = getKarmaStatus(karma);
        
        // Karma Box
        let karmaContainer = document.getElementById('profile-karma-container');
        if (!karmaContainer) {
            karmaContainer = document.createElement('div');
            karmaContainer.id = 'profile-karma-container';
            karmaContainer.style.marginBottom = '20px'; karmaContainer.style.padding = '10px'; karmaContainer.style.backgroundColor = 'var(--primary-color-light)'; karmaContainer.style.borderRadius = '8px'; karmaContainer.style.border = '1px solid var(--primary-color)';
            dom.profilePartei.parentElement.after(karmaContainer);
        }
        let statusColor = status === 'VIP' ? '#34c759' : (status === 'Eingeschränkt' ? '#ff3b30' : 'var(--text-color)');
        karmaContainer.innerHTML = `<p style="margin:0; font-size:1.1em;"><strong>Karma:</strong> ${karma}</p><p style="margin:5px 0; font-size:0.9em; color:${statusColor}">Status: <strong>${label}</strong></p>`;
        
        // Push Button Text
        const notifBtn = document.getElementById('enable-notifications-btn');
        notifBtn.style.display = 'block';
        if (Notification.permission === 'granted') {
            notifBtn.innerHTML = '<i class="fa-solid fa-bell"></i> Test-Nachricht senden';
            notifBtn.className = 'button-primary'; // Blau
        } else if (Notification.permission === 'denied') {
            notifBtn.innerHTML = '⚠️ Blockiert in iOS Einstellungen';
            notifBtn.className = 'button-secondary';
            notifBtn.disabled = true;
        } else {
            notifBtn.innerHTML = '<i class="fa-solid fa-bell"></i> Erlauben';
            notifBtn.className = 'button-secondary';
        }
    }
    // Admin Bereich
    if (userIsAdmin) {
        dom.adminProgramsSection.style.display = 'block';
        try {
            const settingsSnap = await getDoc(getSettingsDocRef());
            if (settingsSnap.exists()) {
                const data = settingsSnap.data();
                if (data.plz) dom.weatherPlzInput.value = data.plz;
                if (data.qrCodeSecret) document.getElementById('qr-secret-input').value = data.qrCodeSecret;
            }
        } catch (e) { dom.weatherPlzInput.value = ''; }
        const unsub = loadWashPrograms((programs) => {
            dom.programListContainer.innerHTML = ''; 
            if (programs.length === 0) { dom.programListContainer.innerHTML = '<p class="small-text">Leer.</p>'; return; }
            programs.forEach(prog => {
                const item = document.createElement('div'); item.className = 'program-list-item';
                item.innerHTML = `<span>${prog.name} (${prog.durationMinutes} Min)</span><button class="button-small button-danger delete-program-btn" data-id="${prog.id}">Löschen</button>`;
                dom.programListContainer.appendChild(item);
            });
            dom.programListContainer.querySelectorAll('.delete-program-btn').forEach(btn => {
                btn.onclick = (e) => { if(confirm('Löschen?')) deleteWashProgram(e.target.dataset.id); };
            });
        }, () => {});
        setUnsubscriber('programs', unsub); 
    } else {
        dom.adminProgramsSection.style.display = 'none';
    }
}