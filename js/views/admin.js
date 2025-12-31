import { 
    db, collection, getDocs, query, orderBy, doc, updateDoc, getUserProfileDocRef, 
    writeBatch, setDoc, getDoc, deleteDoc, where, addDoc, deleteField, Timestamp 
} from '../firebase.js';
import * as dom from '../dom.js';
import { navigateTo } from '../ui.js';
import { getState, setUnsubscriber } from '../state.js';
import { showMessage } from '../ui.js';
import { ALL_PARTEIEN } from '../state.js';
import { handleAdminPasswordReset } from '../services/auth.js';
import { KARMA_START, COST_SLOT_NORMAL, COST_SLOT_PRIME } from '../config.js';
import { updateKarma, getPartyKarma } from '../services/karma.js';
import { getSystemStatus, setSystemStatus, subscribeToTickets, toggleTicketStatus } from '../services/maintenance.js';
import { loadWashPrograms, addWashProgram, deleteWashProgram } from '../services/timers.js';
import { loadStatistics } from '../services/stats.js';
import { deleteMinigameScore, resetMinigameLeaderboard } from '../services/minigame.js';
import { formatDate } from '../utils.js'; 

const MESSAGE_ID = 'admin-message';

// ===== HELPER: GENERIC IOS LIST ITEM =====
function createIOSListItem(text, iconClass, onClick, extraHtml = '') {
    const div = document.createElement('div');
    div.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
        padding: 15px; background: var(--secondary-color);
        border-bottom: 1px solid var(--border-color); cursor: pointer;
        transition: background 0.2s; font-size: 1.1em;
    `;
    div.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
            <i class="${iconClass}" style="width:25px; text-align:center; color:var(--primary-color);"></i>
            <span>${text}</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
            ${extraHtml}
            <i class="fa-solid fa-chevron-right" style="opacity:0.4; font-size:0.9em;"></i>
        </div>
    `;
    div.onmouseover = () => div.style.background = 'var(--hover-color)';
    div.onmouseout = () => div.style.background = 'var(--secondary-color)';
    div.onclick = onClick;
    return div;
}
// =========================================

export async function loadAdminUserData() {
    const { userIsAdmin } = getState();
    if (!userIsAdmin) { showMessage(MESSAGE_ID, 'Zugriff verweigert.', 'error'); return; }

    const container = document.getElementById('admin-ui-wrapper');
    if (!container) {
        console.error("ADMIN ERROR: #admin-ui-wrapper fehlt. Index.html prüfen.");
        return;
    }
    
    container.innerHTML = '';
    
    const wrapper = document.createElement('div');
    wrapper.id = 'admin-ios-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.minHeight = '300px';

    const mainMenu = document.createElement('div');
    mainMenu.id = 'admin-main-menu';

    const subView = document.createElement('div');
    subView.id = 'admin-sub-view';
    subView.style.display = 'none'; 

    wrapper.appendChild(mainMenu);
    wrapper.appendChild(subView);
    container.appendChild(wrapper);

    // --- MENÜ STRUKTUR (HIER IST "TEST-LABOR" DABEI) ---
    mainMenu.appendChild(createIOSListItem('Benutzerverwaltung', 'fa-solid fa-users', () => openSubView('users', 'Benutzer')));
    mainMenu.appendChild(createIOSListItem('System-Status & Wartung', 'fa-solid fa-server', () => openSubView('system', 'System')));
    mainMenu.appendChild(createIOSListItem('Einstellungen (Kosten/Wetter)', 'fa-solid fa-gear', () => openSubView('settings', 'Einstellungen')));
    mainMenu.appendChild(createIOSListItem('Test-Labor & Debug', 'fa-solid fa-flask', () => openSubView('debug', 'Test-Labor')));
    mainMenu.appendChild(createIOSListItem('Minigame Highscores', 'fa-solid fa-gamepad', () => openSubView('minigame', 'Minigame')));
    mainMenu.appendChild(createIOSListItem('Wasch-Programme', 'fa-solid fa-clock', () => openSubView('programs', 'Programme')));
    mainMenu.appendChild(createIOSListItem('Tickets & Logs', 'fa-solid fa-clipboard-list', () => openSubView('tickets', 'Tickets')));
}

// ===== NAVIGATION LOGIC =====
async function openSubView(type, title) {
    const mainMenu = document.getElementById('admin-main-menu');
    const subView = document.getElementById('admin-sub-view');
    
    mainMenu.style.display = 'none';
    subView.style.display = 'block';
    subView.innerHTML = `
        <div style="display:flex; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
            <button id="admin-back-btn" class="button-small button-secondary" style="margin-right:15px;"><i class="fa-solid fa-arrow-left"></i> Zurück</button>
            <h3 style="margin:0;">${title}</h3>
        </div>
        <div id="admin-sub-content"></div>
    `;

    document.getElementById('admin-back-btn').onclick = () => {
        subView.style.display = 'none';
        mainMenu.style.display = 'block';
    };

    const contentDiv = document.getElementById('admin-sub-content');
    contentDiv.innerHTML = '<div class="skeleton-item"><div class="skeleton skeleton-line full"></div></div>'; 

    try {
        switch (type) {
            case 'users': await renderUserListOverview(contentDiv); break;
            case 'system': await renderSystemSettings(contentDiv); break;
            case 'settings': await renderConfigSettings(contentDiv); break;
            case 'debug': await renderDebugSettings(contentDiv); break;
            case 'minigame': await renderMinigameSettings(contentDiv); break;
            case 'programs': await renderProgramSettings(contentDiv); break;
            case 'tickets': await renderTicketSettings(contentDiv); break;
        }
    } catch(e) {
        contentDiv.innerHTML = `<p class="error">Fehler: ${e.message}</p>`;
    }
}
// =============================

// --- 1. BENUTZER LISTE ---
async function renderUserListOverview(container) {
    container.innerHTML = '';
    const q = query(collection(db, "users"), orderBy("email"));
    const querySnapshot = await getDocs(q);
    
    if(querySnapshot.empty) { container.innerHTML = '<p>Keine Benutzer.</p>'; return; }

    querySnapshot.forEach(docSnap => {
        const user = { id: docSnap.id, ...docSnap.data() };
        const parteiLabel = user.partei ? `<span class="tag">${user.partei}</span>` : '<span style="opacity:0.5;">-</span>';
        
        const item = createIOSListItem(
            `<strong>${user.email}</strong>`, 
            'fa-solid fa-user', 
            () => openUserDetail(user), 
            parteiLabel
        );
        container.appendChild(item);
    });
}

async function openUserDetail(user) {
    const contentDiv = document.getElementById('admin-sub-content');
    const backBtn = document.getElementById('admin-back-btn');
    const oldOnClick = backBtn.onclick; 
    
    backBtn.onclick = () => {
        openSubView('users', 'Benutzer'); 
        backBtn.onclick = oldOnClick; 
    };

    const karma = await getPartyKarma(user.partei);

    contentDiv.innerHTML = `
        <div class="user-detail-card" style="background:var(--secondary-color); padding:20px; border-radius:12px;">
            <h4 style="margin-top:0;">Bearbeiten: ${user.email}</h4>
            <div class="admin-action-row"><label>Name:</label><input type="text" id="edit-user-name" value="${user.username||''}" placeholder="Name"></div>
            <div class="admin-action-row"><label>Partei:</label>
                <select id="edit-user-partei">
                    <option value="" ${!user.partei?'selected':''}>Keine</option>
                    ${ALL_PARTEIEN.map(p => `<option value="${p}" ${user.partei===p?'selected':''}>${p}</option>`).join('')}
                </select>
            </div>
            <div class="admin-action-row"><label>Karma:</label><input type="number" id="edit-user-karma" value="${user.partei ? karma : 0}" ${!user.partei?'disabled':''}></div>
            <div class="admin-action-row"><label>Admin:</label><input type="checkbox" id="edit-user-admin" ${user.isAdmin?'checked':''}></div>
            
            <div style="margin-top:20px; display:flex; gap:10px;">
                <button class="button-success" id="save-user-btn">Speichern</button>
                <button class="button-secondary" id="pw-reset-user-btn">Passwort Reset Link</button>
            </div>
        </div>
    `;

    document.getElementById('save-user-btn').onclick = async () => {
        const newName = document.getElementById('edit-user-name').value;
        const newPartei = document.getElementById('edit-user-partei').value;
        const isAdmin = document.getElementById('edit-user-admin').checked;
        const newKarma = parseInt(document.getElementById('edit-user-karma').value);

        try {
            await updateDoc(getUserProfileDocRef(user.id), { username: newName, partei: newPartei, isAdmin: isAdmin });
            
            if (newPartei && !isNaN(newKarma) && newKarma !== karma) {
                const diff = newKarma - karma;
                await updateKarma(newPartei, diff, "Admin-Korrektur");
            }
            showMessage(MESSAGE_ID, 'Gespeichert!', 'success');
        } catch(e) { showMessage(MESSAGE_ID, e.message, 'error'); }
    };

    document.getElementById('pw-reset-user-btn').onclick = () => {
        if(confirm(`Reset Link an ${user.email}?`)) handleAdminPasswordReset(user.email, MESSAGE_ID);
    };
}

// --- 2. SYSTEM STATUS ---
async function renderSystemSettings(container) {
    const status = await getSystemStatus();
    container.innerHTML = `
        <div style="padding:10px;">
            <div id="system-status-box" style="margin-bottom:20px; padding:15px; border:1px solid #ccc; border-radius:8px;">
                <div id="system-status-display" style="font-size:1.2em; margin-bottom:10px;">Lade...</div>
                <button id="toggle-maintenance-btn" class="button-small">Lade...</button>
                <button id="toggle-karma-system-btn" class="button-small" style="margin-top:10px; width:100%;">Lade...</button>
            </div>

            <hr>
            <h4>Notfall / Reset</h4>
            <button id="smart-reset-btn" class="button-danger" style="width:100%;"><i class="fa-solid fa-calculator"></i> Smart Reset (Total)</button>
            <p class="small-text">Setzt alle Karma-Punkte auf 100 zurück und berechnet Historie neu.</p>
        </div>
    `;

    const updateMaintUI = (s) => {
        const d = document.getElementById('system-status-display');
        const b = document.getElementById('toggle-maintenance-btn');
        if(s === 'maintenance') {
            d.innerHTML = 'Status: <strong style="color:red;">WARTUNG ⛔</strong>';
            b.textContent = 'Wartung beenden'; b.className = 'button-small button-success';
        } else {
            d.innerHTML = 'Status: <strong style="color:green;">OK ✅</strong>';
            b.textContent = 'Wartung aktivieren'; b.className = 'button-small button-danger';
        }
    };
    updateMaintUI(status);
    document.getElementById('toggle-maintenance-btn').onclick = async () => {
        const newS = (await getSystemStatus()) === 'ok' ? 'maintenance' : 'ok';
        await setSystemStatus(newS); updateMaintUI(newS);
    };

    const settingsSnap = await getDoc(doc(db, 'app_settings', 'config'));
    let karmaActive = settingsSnap.exists() ? (settingsSnap.data().karmaSystemActive !== false) : true;
    
    const updateKarmaUI = (active) => {
        const b = document.getElementById('toggle-karma-system-btn');
        if (active) {
            b.innerHTML = '<i class="fa-solid fa-eye"></i> Karma: <strong>SICHTBAR & AKTIV</strong>';
            b.className = 'button-small button-primary';
        } else {
            b.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Karma: <strong>VERSTECKT</strong>';
            b.className = 'button-small button-secondary';
        }
    };
    updateKarmaUI(karmaActive);
    document.getElementById('toggle-karma-system-btn').onclick = async () => {
        karmaActive = !karmaActive;
        await setDoc(doc(db, 'app_settings', 'config'), { karmaSystemActive: karmaActive }, { merge: true });
        updateKarmaUI(karmaActive);
        showMessage(MESSAGE_ID, `Karma System jetzt ${karmaActive ? 'AKTIV' : 'VERSTECKT'}`, 'success');
    };

    document.getElementById('smart-reset-btn').onclick = handleSmartReset;
}

// --- 3. EINSTELLUNGEN ---
async function renderConfigSettings(container) {
    const snap = await getDoc(doc(db, 'app_settings', 'config'));
    const data = snap.exists() ? snap.data() : {};
    
    container.innerHTML = `
        <div style="padding:10px;">
             <div class="admin-action-row">
                <label>Wetter PLZ:</label>
                <input type="number" id="weather-plz-input" value="${data.plz || ''}" placeholder="12345">
                <button class="button-small" id="save-plz-btn">Save</button>
            </div>
            <hr>
            <div class="admin-action-row">
                <label>QR Code Secret:</label>
                <input type="text" id="qr-secret-input" value="${data.qrCodeSecret || ''}" placeholder="Geheimcode">
                <button class="button-small" id="gen-qr-btn">Generieren</button>
            </div>
            <div id="qr-code-display" style="display:none; text-align:center; margin-top:15px;">
                <img id="qr-image" src="" style="width:150px; height:150px;">
                <p id="qr-code-text-display"></p>
            </div>
        </div>
    `;
    
    document.getElementById('save-plz-btn').onclick = async () => {
        await setDoc(doc(db, 'app_settings', 'config'), { plz: document.getElementById('weather-plz-input').value }, { merge: true });
        showMessage(MESSAGE_ID, "PLZ gespeichert!", "success");
    };
    document.getElementById('gen-qr-btn').onclick = async () => {
        const s = document.getElementById('qr-secret-input').value;
        await setDoc(doc(db, 'app_settings', 'config'), { qrCodeSecret: s }, { merge: true });
        document.getElementById('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(s)}`;
        document.getElementById('qr-code-display').style.display = 'block';
        document.getElementById('qr-code-text-display').textContent = s;
    };
}

// --- 4. TEST-LABOR & DEBUG (NEU) ---
async function renderDebugSettings(container) {
    container.innerHTML = `
        <div style="padding:10px;">
            <p><strong>Achtung:</strong> Diese Funktionen beeinflussen direkt die Datenbank und sind zum Testen gedacht.</p>
            <div style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
                <button id="debug-create-booking-btn" class="button-secondary"><i class="fa-regular fa-calendar-plus"></i> Fake Buchung erstellen (Heute)</button>
                <button id="debug-force-checkin-btn" class="button-secondary"><i class="fa-solid fa-qrcode"></i> Check-in erzwingen (ohne Scan)</button>
                <button id="debug-kill-timer-btn" class="button-danger"><i class="fa-solid fa-stopwatch"></i> Aktiven Timer löschen (Kill)</button>
                <button id="debug-reset-status-btn" class="button-danger"><i class="fa-solid fa-power-off"></i> Status Reset (Ich: Auschecken)</button>
            </div>
        </div>
    `;
    document.getElementById('debug-create-booking-btn').onclick = debugCreateBooking;
    document.getElementById('debug-force-checkin-btn').onclick = debugForceCheckin;
    document.getElementById('debug-kill-timer-btn').onclick = debugKillTimer;
    document.getElementById('debug-reset-status-btn').onclick = debugResetStatus;
}

// --- 5. MINIGAME ---
async function renderMinigameSettings(container) {
    const q = query(collection(db, "minigame_scores"), orderBy("score", "desc"));
    const snapshot = await getDocs(q);
    
    let html = `<div style="padding:10px;"><button id="reset-minigame-btn" class="button-danger button-small" style="margin-bottom:15px;">🏆 Rangliste löschen</button><div id="minigame-list">`;
    if (snapshot.empty) html += '<p>Keine Scores.</p>';
    snapshot.forEach(docSnap => {
        const d = docSnap.data();
        let name = d.partei + (d.username ? ` (${d.username})` : '');
        html += `
            <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #eee;">
                <span><strong>${d.score}</strong> - ${name}</span>
                <button class="button-small button-danger delete-score-btn" data-id="${docSnap.id}"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
    });
    html += '</div></div>';
    container.innerHTML = html;

    document.getElementById('reset-minigame-btn').onclick = async () => { if(confirm("Highscores zurücksetzen?")) { await resetMinigameLeaderboard(); renderMinigameSettings(container); } };
    container.querySelectorAll('.delete-score-btn').forEach(b => { b.onclick = async (e) => { if(confirm("Löschen?")) { await deleteMinigameScore(e.target.closest('button').dataset.id); renderMinigameSettings(container); } }; });
}

// --- 6. PROGRAMME ---
async function renderProgramSettings(container) {
    container.innerHTML = `
        <div style="padding:10px;">
            <div style="display:flex; gap:5px; margin-bottom:15px;">
                <input type="text" id="program-name-input" placeholder="Name" style="flex:2;">
                <input type="number" id="program-duration-input" placeholder="Min" style="width:60px;">
                <button id="add-program-btn" class="button-success">+</button>
            </div>
            <div id="program-list">Lade...</div>
        </div>
    `;
    const loadList = () => loadWashPrograms((progs) => {
        const list = document.getElementById('program-list'); if(!list) return; list.innerHTML = '';
        progs.forEach(p => {
            const row = document.createElement('div'); row.style.cssText = "display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #eee;";
            row.innerHTML = `<span>${p.name} (${p.durationMinutes}m)</span><button class="button-small button-danger del-prog-btn" data-id="${p.id}">X</button>`;
            list.appendChild(row);
        });
        list.querySelectorAll('.del-prog-btn').forEach(b => b.onclick = (e) => deleteWashProgram(e.target.dataset.id));
    }, () => {});
    loadList();
    document.getElementById('add-program-btn').onclick = async () => {
        const n = document.getElementById('program-name-input').value; const d = document.getElementById('program-duration-input').value;
        if(await addWashProgram(n, d)) { document.getElementById('program-name-input').value = ''; document.getElementById('program-duration-input').value = ''; }
    };
}

// --- 7. TICKETS ---
async function renderTicketSettings(container) {
    container.innerHTML = '<div id="ticket-list" style="padding:10px;">Lade...</div>';
    subscribeToTickets((tickets) => {
        const list = document.getElementById('ticket-list'); if(!list) return; list.innerHTML = '';
        if(tickets.length === 0) { list.innerHTML = 'Keine Tickets.'; return; }
        tickets.forEach(t => {
            const isOpen = t.status === 'open'; const color = isOpen ? 'var(--error-color)' : 'var(--success-color)';
            const div = document.createElement('div'); div.style.cssText = `border-left:5px solid ${color}; padding:10px; background:var(--secondary-color); margin-bottom:10px; border-radius:4px;`;
            div.innerHTML = `<div style="font-weight:bold;">${t.reason} <span style="font-weight:normal; font-size:0.8em;">(${new Date(t.timestamp).toLocaleDateString()})</span></div><div style="font-size:0.9em; margin:5px 0;">${t.details||'-'}</div><div style="font-size:0.8em;">Von: ${t.partei}</div><button class="button-small ${isOpen?'button-success':'button-secondary'} toggle-ticket-btn" style="margin-top:5px;">${isOpen?'Erledigt':'Öffnen'}</button>`;
            div.querySelector('.toggle-ticket-btn').onclick = () => toggleTicketStatus(t.id, t.status);
            list.appendChild(div);
        });
    });
}

export function initAdminView() {
    const backBtn = document.getElementById('back-to-menu-btn-6');
    if(backBtn) backBtn.addEventListener('click', () => navigateTo(dom.mainMenu, 'back'));
}

async function handleSmartReset() {
    if (!confirm(`⚠️ TOTALER NEUSTART:\n\nAlle Karmastände werden neu berechnet. Fortfahren?`)) return;
    try { showMessage(MESSAGE_ID, 'Berechne...', 'success'); const partiesSnap = await getDocs(collection(db, "parties")); const bookingsSnap = await getDocs(collection(db, "bookings")); const partyBalance = {}; bookingsSnap.forEach(doc => { const b = doc.data(); if (b.partei) { if (!partyBalance[b.partei]) partyBalance[b.partei] = 0; const dateObj = new Date(b.date); const isWeekend = (dateObj.getDay() === 0 || dateObj.getDay() === 6); const cost = Math.abs(isWeekend ? COST_SLOT_PRIME : COST_SLOT_NORMAL); partyBalance[b.partei] -= cost; if (b.checkOutTime || b.isReleased) partyBalance[b.partei] += 5; } }); const batch = writeBatch(db); partiesSnap.forEach(docSnap => { const partei = docSnap.id; const data = docSnap.data(); const bookingImpact = partyBalance[partei] || 0; const minigameBonus = data.minigame_earned_this_week || 0; const newKarma = 100 + minigameBonus + bookingImpact; batch.update(docSnap.ref, { karma: newKarma, last_karma_update: Timestamp.now() }); }); await batch.commit(); alert("System erfolgreich neu kalibriert!"); showMessage(MESSAGE_ID, 'Fertig!', 'success'); openSubView('system', 'System'); } catch (e) { showMessage(MESSAGE_ID, `Fehler: ${e.message}`, 'error'); }
}

async function debugCreateBooking() { const { currentUser } = getState(); if(!currentUser) return; try { await addDoc(collection(db, "bookings"), { date: formatDate(new Date()), slot: "00:00-23:59", partei: currentUser.userData.partei, userId: currentUser.uid, bookedAt: new Date().toISOString(), isSwap: false, checkInTime: null, checkOutTime: null, isReleased: false }); showMessage(MESSAGE_ID, "Test-Buchung erstellt!", "success"); } catch(e) { showMessage(MESSAGE_ID, e.message, "error"); } }
async function debugForceCheckin() { const { currentUser } = getState(); if(!currentUser) return; try { const q = query(collection(db, "bookings"), where("date", "==", formatDate(new Date())), where("partei", "==", currentUser.userData.partei)); const snap = await getDocs(q); const docSnap = snap.docs.find(d => !d.data().isReleased); if(docSnap) { await updateDoc(docSnap.ref, { checkInTime: new Date().toISOString() }); showMessage(MESSAGE_ID, "Check-in erzwungen!", "success"); } else showMessage(MESSAGE_ID, "Keine Buchung.", "error"); } catch(e) { showMessage(MESSAGE_ID, e.message, "error"); } }
async function debugResetStatus() { const { currentUser } = getState(); if (!currentUser) return; try { const q = query(collection(db, "bookings"), where("date", "==", formatDate(new Date())), where("partei", "==", currentUser.userData.partei)); const snap = await getDocs(q); const batch = writeBatch(db); snap.forEach(d => batch.delete(d.ref)); await batch.commit(); await debugKillTimer(); showMessage(MESSAGE_ID, "Reset OK.", "success"); } catch(e) { showMessage(MESSAGE_ID, e.message, "error"); } }
async function debugKillTimer() { const { currentUser } = getState(); if(!currentUser) return; try { await deleteDoc(doc(db, "active_timers", currentUser.userData.partei)); showMessage(MESSAGE_ID, "Timer gelöscht.", "success"); } catch(e) { showMessage(MESSAGE_ID, e.message, "error"); } }