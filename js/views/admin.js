import { db, collection, getDocs, query, orderBy, doc, updateDoc, getUserProfileDocRef, writeBatch, setDoc, getDoc, deleteDoc } from '../firebase.js';
import * as dom from '../dom.js';
import { navigateTo } from '../ui.js';
import { getState, setUnsubscriber } from '../state.js';
import { showMessage } from '../ui.js';
import { ALL_PARTEIEN } from '../state.js';
import { handleAdminPasswordReset } from '../services/auth.js';
import { KARMA_START } from '../config.js';
import { updateKarma, getPartyKarma } from '../services/karma.js';
import { getSystemStatus, setSystemStatus, subscribeToTickets, toggleTicketStatus } from '../services/maintenance.js';
import { loadWashPrograms, addWashProgram, deleteWashProgram } from '../services/timers.js';
// NEU: Stats laden
import { loadStatistics } from '../services/stats.js';

const MESSAGE_ID = 'admin-message';

function getSettingsDocRef() {
    return doc(db, 'app_settings', 'config');
}

export async function loadAdminUserData() {
    const { userIsAdmin } = getState();
    if (!userIsAdmin) {
        showMessage(MESSAGE_ID, 'Zugriff verweigert.', 'error');
        return;
    }

    // 1. Nutzer laden
    const userListContainer = document.getElementById('user-list-container');
    if (userListContainer) {
        userListContainer.innerHTML = `
            <div class="skeleton-item"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line full"></div></div>
        `;
        try {
            const users = [];
            const q = query(collection(db, "users"), orderBy("email"));
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));

            const karmaMap = {};
            for (const p of ALL_PARTEIEN) {
                karmaMap[p] = await getPartyKarma(p);
            }
            renderUserList(users, karmaMap);
        } catch (e) {
            showMessage(MESSAGE_ID, `Fehler Nutzer: ${e.message}`, 'error');
        }
    }

    // 2. Tickets laden
    loadAdminTickets();

    // 3. Programme laden
    loadPrograms();

    // 4. Config laden (PLZ, QR)
    loadConfig();

    // 5. Statistiken laden (NEU)
    loadStatistics(false);
}

function loadConfig() {
    getDoc(getSettingsDocRef()).then(snap => {
        if(snap.exists()) {
            const data = snap.data();
            if(data.plz) document.getElementById('weather-plz-input').value = data.plz;
            if(data.qrCodeSecret) document.getElementById('qr-secret-input').value = data.qrCodeSecret;
        }
    });
}

function loadPrograms() {
    const container = document.getElementById('program-list-container');
    if(!container) return;
    container.innerHTML = '<p class="small-text">Lade...</p>';
    
    const unsub = loadWashPrograms((programs) => {
        container.innerHTML = '';
        if (programs.length === 0) {
            container.innerHTML = '<p class="small-text">Keine Programme definiert.</p>';
            return;
        }
        programs.forEach(prog => {
            const item = document.createElement('div');
            item.className = 'program-list-item';
            item.innerHTML = `
                <span>${prog.name} (${prog.durationMinutes} Min)</span>
                <button class="button-small button-danger delete-program-btn" data-id="${prog.id}">Löschen</button>
            `;
            container.appendChild(item);
        });

        container.querySelectorAll('.delete-program-btn').forEach(btn => {
            btn.onclick = (e) => {
                if (confirm('Löschen?')) deleteWashProgram(e.target.dataset.id);
            };
        });
    }, (err) => container.innerHTML = 'Fehler.');
    
    setUnsubscriber('programs', unsub);
}

function loadAdminTickets() {
    const ticketContainer = document.getElementById('admin-tickets-container');
    if (!ticketContainer) return;

    const unsub = subscribeToTickets((tickets) => {
        ticketContainer.innerHTML = '';
        if (tickets.length === 0) {
            ticketContainer.innerHTML = '<p class="small-text">Keine Meldungen vorhanden.</p>';
            return;
        }

        tickets.forEach(ticket => {
            const date = new Date(ticket.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' });
            const isOpen = ticket.status === 'open';
            const statusColor = isOpen ? 'var(--error-color)' : 'var(--success-color)';
            const statusText = isOpen ? 'OFFEN' : 'ERLEDIGT';
            const btnText = isOpen ? 'Als erledigt markieren' : 'Wieder öffnen';
            const btnClass = isOpen ? 'button-success' : 'button-secondary';

            const div = document.createElement('div');
            div.className = 'user-list-item';
            div.style.borderLeft = `5px solid ${statusColor}`;
            
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span style="font-weight:bold; color:${statusColor}">${statusText}</span>
                    <span class="small-text">${date}</span>
                </div>
                <div style="font-weight:bold; margin-bottom:5px;">${ticket.reason}</div>
                <div style="font-size:0.9em; margin-bottom:10px; color:var(--text-color);">${ticket.details || 'Keine Details'}</div>
                <div class="small-text" style="margin-bottom:10px;">Von: ${ticket.email} (${ticket.partei})</div>
                <button class="button-small ${btnClass} ticket-toggle-btn">${btnText}</button>
            `;

            div.querySelector('.ticket-toggle-btn').addEventListener('click', async () => {
                await toggleTicketStatus(ticket.id, ticket.status);
            });

            ticketContainer.appendChild(div);
        });
    });
}

function renderUserList(users, karmaMap) {
    const container = document.getElementById('user-list-container');
    container.innerHTML = '';

    if (users.length === 0) {
        container.innerHTML += '<p class="small-text">Keine Nutzer gefunden.</p>';
        return;
    }

    const parteiOptions = ALL_PARTEIEN.map(p => `<option value="${p}">${p}</option>`).join('');

    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'user-list-item';
        item.dataset.userId = user.id;
        item.dataset.partei = user.partei; 

        const isAdminChecked = user.isAdmin ? 'checked' : '';
        const currentKarma = user.partei ? (karmaMap[user.partei] ?? KARMA_START) : '--';
        const username = user.username || "";

        item.innerHTML = `
            <div class="user-list-item-header">
                <strong>${user.email}</strong>
                <button class="button-small button-secondary admin-reset-pw-btn" data-email="${user.email}">PW Reset</button>
            </div>
            <div class="user-list-item-body">
                <div class="admin-action-row">
                    <label>Name:</label>
                    <input type="text" class="admin-username-input" value="${username}" placeholder="Name" style="margin-bottom:0; flex-grow:1;">
                    <button class="button-small button-secondary save-username-btn">Save</button>
                </div>
                <div class="admin-action-row">
                    <label>Partei:</label>
                    <select class="admin-partei-select" style="margin-bottom:0; flex-grow:1;">
                        <option value="" ${user.partei === "" ? 'selected' : ''}>Keine</option>
                        ${parteiOptions}
                    </select>
                </div>
                <div class="admin-action-row">
                    <label>Karma:</label>
                    <input type="number" class="admin-karma-input" value="${currentKarma}" style="width: 60px; margin-bottom:0;" ${!user.partei ? 'disabled' : ''}>
                    <button class="button-small button-secondary save-karma-btn" ${!user.partei ? 'disabled' : ''}>Save</button>
                </div>
                <div class="admin-action-row">
                    <label>Admin:</label>
                    <input type="checkbox" class="admin-isadmin-check" ${isAdminChecked}>
                </div>
            </div>
        `;
        container.appendChild(item);
        const sel = item.querySelector('.admin-partei-select');
        if(user.partei && [...sel.options].some(o => o.value === user.partei)) sel.value = user.partei;
    });

    attachAdminListeners();
}

function attachAdminListeners() {
    document.querySelectorAll('.save-username-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const row = e.target.closest('.admin-action-row');
            const input = row.querySelector('.admin-username-input');
            const userId = e.target.closest('.user-list-item').dataset.userId;
            handleUserUpdate(userId, 'username', input.value.trim());
        });
    });
    document.querySelectorAll('.admin-partei-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const userId = e.target.closest('.user-list-item').dataset.userId;
            handleUserUpdate(userId, 'partei', e.target.value);
        });
    });
    document.querySelectorAll('.admin-isadmin-check').forEach(check => {
        check.addEventListener('change', (e) => {
            const userId = e.target.closest('.user-list-item').dataset.userId;
            handleUserUpdate(userId, 'isAdmin', e.target.checked);
        });
    });
    document.querySelectorAll('.save-karma-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const item = e.target.closest('.user-list-item');
            const partei = item.dataset.partei;
            const input = e.target.closest('.admin-action-row').querySelector('.admin-karma-input');
            const newVal = parseInt(input.value);
            if(!partei) return;
            if(!isNaN(newVal)) {
                const oldVal = await getPartyKarma(partei);
                const diff = newVal - oldVal;
                if (diff !== 0) {
                    await updateKarma(partei, diff, "Admin-Korrektur");
                    showMessage(MESSAGE_ID, `Karma aktualisiert!`, 'success');
                }
            }
        });
    });
    document.querySelectorAll('.admin-reset-pw-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const email = e.target.dataset.email;
            if(confirm(`Reset Link an ${email}?`)) handleAdminPasswordReset(email, MESSAGE_ID);
        });
    });
}

async function handleUserUpdate(userId, field, value) {
    try {
        const userDocRef = getUserProfileDocRef(userId); 
        await updateDoc(userDocRef, { [field]: value });
        showMessage(MESSAGE_ID, `Gespeichert!`, 'success');
    } catch (e) {
        showMessage(MESSAGE_ID, `Fehler: ${e.message}`, 'error');
    }
}

async function handleGlobalKarmaReset() {
    if (!confirm(`ACHTUNG: Alle Parteien auf ${KARMA_START} zurücksetzen?`)) return;
    try {
        showMessage(MESSAGE_ID, 'Setze zurück...', 'success');
        const q = query(collection(db, "parties"));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.forEach(doc => batch.update(doc.ref, { karma: KARMA_START }));
        await batch.commit();
        showMessage(MESSAGE_ID, 'Reset erfolgreich!', 'success');
        loadAdminUserData(); 
    } catch (e) {
        showMessage(MESSAGE_ID, `Fehler: ${e.message}`, 'error');
    }
}

export function initAdminView() {
    document.getElementById('back-to-menu-btn-6').addEventListener('click', () => navigateTo(dom.mainMenu));

    const toggleBtn = document.getElementById('toggle-maintenance-btn');
    const statusDisplay = document.getElementById('system-status-display');
    
    if (toggleBtn && statusDisplay) {
        getSystemStatus().then(status => updateAdminMaintUI(status));
        toggleBtn.onclick = async () => {
            toggleBtn.disabled = true;
            const current = await getSystemStatus();
            const newState = current === 'ok' ? 'maintenance' : 'ok';
            await setSystemStatus(newState);
            updateAdminMaintUI(newState);
            toggleBtn.disabled = false;
        };
    }

    const savePlzBtn = document.getElementById('save-weather-plz-btn');
    if(savePlzBtn) {
        savePlzBtn.onclick = async () => {
            const val = document.getElementById('weather-plz-input').value;
            if(val.length < 4) return alert("Ungültige PLZ");
            try {
                await setDoc(getSettingsDocRef(), { plz: val }, { merge: true });
                showMessage(MESSAGE_ID, "PLZ gespeichert!", "success");
            } catch(e) { showMessage(MESSAGE_ID, e.message, "error"); }
        };
    }

    const qrBtn = document.getElementById('generate-qr-btn');
    if(qrBtn) {
        qrBtn.onclick = async () => {
            const secret = document.getElementById('qr-secret-input').value;
            try {
                await setDoc(getSettingsDocRef(), { qrCodeSecret: secret }, { merge: true });
                document.getElementById('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(secret)}`;
                document.getElementById('qr-code-display').style.display = 'block';
                document.getElementById('qr-code-text-display').textContent = secret;
                showMessage(MESSAGE_ID, "QR Code gespeichert!", "success");
            } catch(e) { showMessage(MESSAGE_ID, e.message, "error"); }
        };
    }

    const addProgBtn = document.getElementById('add-program-btn');
    if(addProgBtn) {
        addProgBtn.onclick = async () => {
            const name = document.getElementById('program-name-input').value;
            const dur = document.getElementById('program-duration-input').value;
            if(await addWashProgram(name, dur)) {
                document.getElementById('program-name-input').value = '';
                document.getElementById('program-duration-input').value = '';
            }
        };
    }

    const resetBtn = document.getElementById('global-karma-reset-btn');
    if(resetBtn) resetBtn.onclick = handleGlobalKarmaReset;
}

function updateAdminMaintUI(status) {
    const toggleBtn = document.getElementById('toggle-maintenance-btn');
    const statusDisplay = document.getElementById('system-status-display');
    if(!toggleBtn) return;

    if (status === 'maintenance') {
        statusDisplay.innerHTML = 'Status: <strong style="color:red;">WARTUNG AKTIV ⛔</strong>';
        toggleBtn.textContent = 'Wartung beenden (Freischalten)';
        toggleBtn.className = 'button-small button-success';
    } else {
        statusDisplay.innerHTML = 'Status: <strong style="color:green;">OK ✅</strong>';
        toggleBtn.textContent = 'Wartungsmodus aktivieren (Sperren)';
        toggleBtn.className = 'button-small button-danger';
    }
}