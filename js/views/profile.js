import * as dom from '../dom.js';
import { getState, setUnsubscriber } from '../state.js';
import { handleChangePassword } from '../services/auth.js';
import { db, getDoc, setDoc, doc, collection, query, where, getDocs } from '../firebase.js'; 
import { showMessage, navigateTo, showChangelog, checkNotificationPermission } from '../ui.js';
import { loadWashPrograms, addWashProgram, deleteWashProgram } from '../services/timers.js';
import { getKarmaStatus, getPartyKarma } from '../services/karma.js';
import { KARMA_START, COST_SLOT_NORMAL, COST_SLOT_PRIME } from '../config.js'; 
import { initPushNotifications } from '../services/push.js';
import { getPartyStats } from '../services/stats.js';
import { formatDate } from '../utils.js'; 

function getSettingsDocRef() { return doc(db, 'app_settings', 'config'); }

function checkProfilePasswordMatch() {
    const passField = dom.newPasswordInput; const confirmField = document.getElementById('new-password-confirm');
    if (!passField || !confirmField) return;
    const passValue = passField.value; const confirmValue = confirmField.value;
    if (passValue === "" && confirmValue === "") { passField.classList.remove('input-valid', 'input-invalid'); confirmField.classList.remove('input-valid', 'input-invalid'); return; }
    if (passValue === confirmValue) { passField.classList.add('input-valid'); confirmField.classList.add('input-valid'); } 
    else { passField.classList.add('input-invalid'); confirmField.classList.add('input-invalid'); }
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

    const notifBtn = document.getElementById('enable-notifications-btn');
    const newBtn = notifBtn.cloneNode(true);
    notifBtn.parentNode.replaceChild(newBtn, notifBtn);
    
    newBtn.addEventListener('click', async () => {
        if (Notification.permission === 'granted') {
            try {
                const reg = await navigator.serviceWorker.ready;
                await reg.showNotification('Test 🔔', { body: 'Lokaler Test OK', icon: 'img/icon-192.png' });
                await initPushNotifications(); 
                alert("Test-Nachricht lokal gesendet & Server-Sync gestartet.");
            } catch(e) { alert("Fehler: " + e.message); }
        } else {
            await initPushNotifications();
            loadProfileData(); 
        }
    });

    document.getElementById('show-changelog-btn').addEventListener('click', showChangelog);
    
    // Listener für "Zurück" wurde entfernt. Der globale Button im Header übernimmt das nun.
}

// ===== HILFSFUNKTION: KARMA BILANZ (TOTAL - Historie & Zukunft) =====
async function getDetailedKarmaBill(parteiName) {
    if (!parteiName) return { past: [], future: [], totalCost: 0, minigame: 0 };
    
    const todayStr = formatDate(new Date());
    
    // 1. Minigame Infos holen
    const partyRef = doc(db, "parties", parteiName);
    const partySnap = await getDoc(partyRef);
    const minigame = (partySnap.exists() ? partySnap.data().minigame_earned_this_week : 0) || 0;

    // 2. ALLE Buchungen holen (kein Datum-Filter!)
    const q = query(collection(db, "bookings"), where("partei", "==", parteiName));
    const snapshot = await getDocs(q);
    
    const past = [];
    const future = [];
    let totalCost = 0; // Summe der Abzüge (negativ) plus Boni

    snapshot.forEach(docSnap => {
        const b = docSnap.data();
        
        const dateObj = new Date(b.date);
        const isWeekend = (dateObj.getDay() === 0 || dateObj.getDay() === 6);
        const cost = Math.abs(isWeekend ? COST_SLOT_PRIME : COST_SLOT_NORMAL);
        
        let impact = -cost;
        let note = "";

        // Bonus für Checkout?
        if (b.checkOutTime || b.isReleased) {
            impact += 5; 
            note = "(inkl. +5 Bonus)";
        }

        totalCost += impact;

        const entry = {
            date: new Date(b.date).toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit'}),
            slot: b.slot,
            val: impact,
            note: note
        };

        if (b.date < todayStr) {
            past.push(entry);
        } else {
            future.push(entry);
        }
    });
    
    // Sortieren
    past.sort((a,b) => b.date.localeCompare(a.date)); // Neueste zuerst
    future.sort((a,b) => a.date.localeCompare(b.date)); // Nächste zuerst
    
    return { past, future, totalCost, minigame };
}
// ===================================================================

export async function loadProfileData() {
    const { currentUser, userIsAdmin } = getState();
    if (currentUser) {
        dom.profileEmail.textContent = currentUser.userData.email;
        dom.profilePartei.textContent = currentUser.userData.partei;
        
        // --- NEU: Check ob System aktiv ist ---
        const settingsSnap = await getDoc(getSettingsDocRef());
        const karmaActive = settingsSnap.exists() ? (settingsSnap.data().karmaSystemActive !== false) : true;
        // --------------------------------------

        let karmaContainer = document.getElementById('profile-karma-container');
        if (!karmaContainer) {
            karmaContainer = document.createElement('div');
            karmaContainer.id = 'profile-karma-container';
            karmaContainer.style.marginBottom = '20px'; karmaContainer.style.padding = '10px'; karmaContainer.style.backgroundColor = 'var(--primary-color-light)'; karmaContainer.style.borderRadius = '8px'; karmaContainer.style.border = '1px solid var(--primary-color)';
            dom.profilePartei.parentElement.after(karmaContainer);
        }

        // --- ENTSCHEIDUNG: ANZEIGEN ODER VERSTECKEN ---
        if (karmaActive) {
            karmaContainer.style.display = 'block';
            const karma = await getPartyKarma(currentUser.userData.partei);
            const { label, status, weeks } = getKarmaStatus(karma);
            
            let statusColor = status === 'VIP' ? '#34c759' : (status === 'Eingeschränkt' ? '#ff3b30' : 'var(--text-color)');
            
            karmaContainer.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <p style="margin:0; font-size:1.1em;"><strong>Karma:</strong> ${karma}</p>
                        <p style="margin:5px 0; font-size:0.9em; color:${statusColor}">Status: <strong>${label}</strong></p>
                    </div>
                    <button class="button-small button-secondary" id="profile-karma-help-btn" style="width:auto; margin:0;"><i class="fa-solid fa-circle-question"></i> Regeln</button>
                </div>
            `;
            
            const helpBtn = document.getElementById('profile-karma-help-btn');
            if(helpBtn) {
                helpBtn.onclick = () => {
                    const modal = document.getElementById('karmaGuideModal');
                    const closeBtn = document.getElementById('close-karma-guide-btn');
                    if(modal) {
                        modal.style.display = 'flex';
                        if(closeBtn) closeBtn.onclick = () => modal.style.display = 'none';
                    }
                };
            }
            
            // --- KARMA BILANZ BOX (NUR WENN AKTIV) ---
            let billContainer = document.getElementById('profile-karma-bill');
            if (!billContainer) {
                billContainer = document.createElement('div');
                billContainer.id = 'profile-karma-bill';
                billContainer.style.marginTop = '15px';
                billContainer.style.marginBottom = '20px';
                billContainer.style.padding = '15px';
                billContainer.style.backgroundColor = 'var(--secondary-color)';
                billContainer.style.borderRadius = '12px';
                billContainer.style.border = '1px solid var(--border-color)';
                karmaContainer.after(billContainer);
            }
            billContainer.style.display = 'block';
            
            billContainer.innerHTML = '<p class="small-text"><i class="fa-solid fa-spinner fa-spin"></i> Lade Bilanz...</p>';
            
            const bill = await getDetailedKarmaBill(currentUser.userData.partei);
            
            const renderRow = (item) => `
                <div style="display:flex; justify-content:space-between; font-size:0.85em; margin-bottom:3px;">
                    <span>${item.date} (${item.slot})</span>
                    <span style="color:${item.val >= 0 ? 'var(--success-color)' : 'var(--error-color)'};">${item.val > 0 ? '+' : ''}${item.val} ${item.note}</span>
                </div>`;

            let pastHtml = bill.past.length ? bill.past.map(renderRow).join('') : '<span class="small-text" style="opacity:0.5;">Keine.</span>';
            let futureHtml = bill.future.length ? bill.future.map(renderRow).join('') : '<span class="small-text" style="opacity:0.5;">Keine.</span>';

            // GAP CLOSER: Berechnen ob Differenz besteht
            const calculatedTotal = 100 + bill.minigame + bill.totalCost;
            const diff = karma - calculatedTotal;
            
            let adjustmentRow = '';
            if (diff !== 0) {
                adjustmentRow = `
                <div style="display:flex; justify-content:space-between; font-size:0.9em; font-weight:bold; margin-bottom:10px; border-bottom:1px dashed #ccc; padding-bottom:5px;">
                    <span>Historische Anpassung / Sonstiges:</span>
                    <span style="color:${diff >= 0 ? 'var(--success-color)' : 'var(--error-color)'};">${diff > 0 ? '+' : ''}${diff}</span>
                </div>`;
            }

            billContainer.innerHTML = `
                <h3 style="margin-top:0; font-size:1.1em; border-bottom:1px solid var(--border-color); padding-bottom:5px;">Deine Karma-Bilanz 🧾</h3>
                
                <div style="display:flex; justify-content:space-between; font-size:0.9em; font-weight:bold; margin-bottom:5px;">
                    <span>Startguthaben:</span>
                    <span style="color:var(--success-color);">100</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.9em; font-weight:bold; margin-bottom:10px; border-bottom:1px dashed #ccc; padding-bottom:5px;">
                    <span>Minigame (Woche):</span>
                    <span style="color:var(--success-color);">+${bill.minigame}</span>
                </div>

                <strong style="font-size:0.9em; opacity:0.8;">Geplant (Zukunft):</strong>
                <div style="margin-bottom:10px; padding-left:5px;">${futureHtml}</div>

                <strong style="font-size:0.9em; opacity:0.8;">Verlauf (Vergangenheit):</strong>
                <div style="margin-bottom:10px; padding-left:5px;">${pastHtml}</div>
                
                ${adjustmentRow}
                
                <div style="display:flex; justify-content:space-between; font-weight:bold; margin-top:10px; border-top:2px solid var(--text-color); padding-top:5px; font-size:1.1em;">
                    <span>Ergebnis:</span>
                    <span>${karma}</span>
                </div>
            `;
        } else {
            // Wenn inaktiv, Container verstecken
            karmaContainer.style.display = 'none';
            // Und Bilanz Container auch verstecken falls vorhanden
            let billContainer = document.getElementById('profile-karma-bill');
            if (billContainer) billContainer.style.display = 'none';
        }
        // ---------------------------------------------

        let statsContainer = document.getElementById('profile-personal-stats');
        if (!statsContainer) {
            statsContainer = document.createElement('div');
            statsContainer.id = 'profile-personal-stats';
            statsContainer.style.marginTop = '15px';
            statsContainer.style.marginBottom = '20px';
            statsContainer.style.padding = '15px';
            statsContainer.style.backgroundColor = 'var(--secondary-color)';
            statsContainer.style.borderRadius = '12px';
            statsContainer.style.border = '1px solid var(--border-color)';
            // Insert position safe check
            let reference = billContainer || karmaContainer;
            if(reference && reference.parentNode) {
                reference.after(statsContainer);
            } else {
                dom.profilePartei.parentElement.after(statsContainer);
            }
        }
        
        statsContainer.innerHTML = '<p class="small-text">Lade Statistik...</p>';
        const stats = await getPartyStats(currentUser.userData.partei);
        if (stats) {
            const currentYear = new Date().getFullYear();
            statsContainer.innerHTML = `
                <h3 style="margin-top:0; font-size:1.1em; border-bottom:1px solid var(--border-color); padding-bottom:5px;">Statistik ${currentYear} 📊</h3>
                <div style="display:flex; justify-content: space-between; align-items:center; margin-top:10px;">
                    <div style="text-align:center;">
                        <span class="small-text">Wäschen</span><br>
                        <strong style="font-size:1.4em; color:var(--primary-color);">${stats.totalBookings}</strong>
                    </div>
                    <div style="width:1px; height:40px; background:var(--border-color);"></div>
                    <div style="text-align:center;">
                        <span class="small-text">Lieblingstag</span><br>
                        <strong style="font-size:1.1em;">${stats.favoriteDay}</strong>
                    </div>
                </div>
            `;
        }

        const notifBtn = document.getElementById('enable-notifications-btn');
        notifBtn.style.display = 'block';
        if (Notification.permission === 'granted') {
            notifBtn.innerHTML = '<i class="fa-solid fa-bell"></i> Test-Nachricht senden';
            notifBtn.className = 'button-primary';
        } else {
            notifBtn.innerHTML = '<i class="fa-solid fa-bell"></i> Erlauben';
            notifBtn.className = 'button-secondary';
        }
    }
    if (userIsAdmin) {
        dom.adminProgramsSection.style.display = 'block';
        const unsub = loadWashPrograms((programs) => {
             dom.programListContainer.innerHTML = '';
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