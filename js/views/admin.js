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

function getSettingsDocRef() {
    return doc(db, 'app_settings', 'config');
}

export async function loadAdminUserData() {
    const { userIsAdmin } = getState();
    if (!userIsAdmin) {
        showMessage(MESSAGE_ID, 'Zugriff verweigert.', 'error');
        return;
    }

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

    loadAdminTickets();
    loadPrograms();
    loadConfig();
    loadStatistics(false);
    loadMinigameAdmin();
    
    setupTestLab();
}

// ==================== TOTAL SMART RESET LOGIK (PERFEKTIONIERT) ====================
async function handleSmartReset() {
    if (!confirm(`⚠️ TOTALER NEUSTART & NEUBERECHNUNG:\n\nDas System wird für ALLE Parteien neu kalibriert:\n\n1. Basis: 100 Punkte\n2. + Minigame (Aktuelle Woche)\n3. - ALLE Buchungen (Vergangenheit & Zukunft)\n4. + ALLE Check-out Boni\n\nDies überschreibt die aktuellen Karma-Stände. Fortfahren?`)) return;
    
    const btn = document.getElementById('smart-reset-btn');
    if(btn) { btn.disabled = true; btn.textContent = "Berechne alles..."; }

    try {
        showMessage(MESSAGE_ID, 'Lese gesamte Historie...', 'success');
        
        // 1. Alle Parteien holen
        const partiesSnap = await getDocs(collection(db, "parties"));
        
        // 2. ALLE Buchungen holen (gesamte Datenbank)
        const bookingsSnap = await getDocs(collection(db, "bookings"));

        // 3. Bilanz pro Partei berechnen
        const partyBalance = {};
        
        bookingsSnap.forEach(doc => {
            const b = doc.data();
            if (b.partei) {
                if (!partyBalance[b.partei]) partyBalance[b.partei] = 0;
                
                // Kosten berechnen
                const dateObj = new Date(b.date);
                const isWeekend = (dateObj.getDay() === 0 || dateObj.getDay() === 6);
                const cost = Math.abs(isWeekend ? COST_SLOT_PRIME : COST_SLOT_NORMAL);
                
                // Abziehen (Kosten sind negativ in der Bilanz)
                partyBalance[b.partei] -= cost;

                // Bonus addieren (wenn ausgecheckt)
                if (b.checkOutTime || b.isReleased) {
                    partyBalance[b.partei] += 5; 
                }
            }
        });

        // 4. Batch Update durchführen
        const batch = writeBatch(db);
        let logMsg = "Neuberechnung:\n";

        partiesSnap.forEach(docSnap => {
            const partei = docSnap.id;
            const data = docSnap.data();
            
            const bookingImpact = partyBalance[partei] || 0;
            const minigameBonus = data.minigame_earned_this_week || 0;
            
            // Die Formel: 100 (Basis) + Minigame + (Buchungen & Boni)
            let newKarma = 100 + minigameBonus + bookingImpact; 

            // Update
            batch.update(docSnap.ref, { 
                karma: newKarma,
                last_karma_update: Timestamp.now()
            });
            
            logMsg += `${partei}: 100 + ${minigameBonus} (Game) ${bookingImpact >= 0 ? '+' : ''}${bookingImpact} (Verlauf) = ${newKarma}\n`;
        });

        await batch.commit();
        
        console.log(logMsg);
        alert("System erfolgreich neu kalibriert!\n\n" + logMsg);
        showMessage(MESSAGE_ID, 'Neuberechnung abgeschlossen!', 'success');
        
        loadAdminUserData();

    } catch (e) {
        console.error(e);
        showMessage(MESSAGE_ID, `Fehler: ${e.message}`, 'error');
        alert("Fehler: " + e.message);
    } finally {
        if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-calculator"></i> Smart Reset (Total)'; }
    }
}
// =================================================================

function setupTestLab() {
    const createBookingBtn = document.getElementById('debug-create-booking-btn');
    const forceCheckinBtn = document.getElementById('debug-force-checkin-btn');
    const resetStatusBtn = document.getElementById('debug-reset-status-btn');
    const killTimerBtn = document.getElementById('debug-kill-timer-btn');

    if (createBookingBtn) createBookingBtn.onclick = debugCreateBooking;
    if (forceCheckinBtn) forceCheckinBtn.onclick = debugForceCheckin;
    if (resetStatusBtn) resetStatusBtn.onclick = debugResetStatus;
    if (killTimerBtn) killTimerBtn.onclick = debugKillTimer;
}

async function getMyTodaysBookingDoc() {
    const { currentUser } = getState();
    if(!currentUser) return null;
    const todayStr = formatDate(new Date());
    try {
        const q = query(collection(db, "bookings"), where("date", "==", todayStr), where("partei", "==", currentUser.userData.partei));
        const snap = await getDocs(q);
        if(snap.empty) return null;
        return snap.docs.find(d => d.data().isReleased === false) || null;
    } catch (e) { return null; }
}
async function debugCreateBooking() {
    const { currentUser } = getState();
    if(!currentUser) return;
    const todayStr = formatDate(new Date());
    try {
        await addDoc(collection(db, "bookings"), {
            date: todayStr, slot: "00:00-23:59", partei: currentUser.userData.partei,
            userId: currentUser.uid, bookedAt: new Date().toISOString(), isSwap: false,
            checkInTime: null, checkOutTime: null, isReleased: false
        });
        showMessage(MESSAGE_ID, "Test-Buchung erstellt!", "success");
    } catch(e) { showMessage(MESSAGE_ID, "Fehler: " + e.message, "error"); }
}
async function debugForceCheckin() {
    try {
        const docSnap = await getMyTodaysBookingDoc();
        if(!docSnap) { showMessage(MESSAGE_ID, "Keine Buchung heute.", "error"); return; }
        await updateDoc(docSnap.ref, { checkInTime: new Date().toISOString() });
        showMessage(MESSAGE_ID, "Check-in erzwungen!", "success");
    } catch(e) { showMessage(MESSAGE_ID, "Fehler: " + e.message, "error"); }
}
async function debugResetStatus() {
    const { currentUser } = getState();
    if (!currentUser) return;
    try {
        const todayStr = formatDate(new Date());
        const q = query(collection(db, "bookings"), where("date", "==", todayStr), where("partei", "==", currentUser.userData.partei));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
        await debugKillTimer(true);
        showMessage(MESSAGE_ID, "Status Reset OK.", "success");
    } catch(e) { showMessage(MESSAGE_ID, "Fehler: " + e.message, "error"); }
}
async function debugKillTimer(silent = false) {
    const { currentUser } = getState();
    if(!currentUser || !currentUser.userData.partei) return;
    try { await deleteDoc(doc(db, "active_timers", currentUser.userData.partei)); if(!silent) showMessage(MESSAGE_ID, "Timer gelöscht.", "success"); } 
    catch(e) { if(!silent) showMessage(MESSAGE_ID, "Fehler: " + e.message, "error"); }
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
    const unsub = loadWashPrograms((programs) => {
        container.innerHTML = '';
        programs.forEach(prog => {
            const item = document.createElement('div');
            item.className = 'program-list-item';
            item.innerHTML = `<span>${prog.name} (${prog.durationMinutes} Min)</span><button class="button-small button-danger delete-program-btn" data-id="${prog.id}">Löschen</button>`;
            container.appendChild(item);
        });
        container.querySelectorAll('.delete-program-btn').forEach(btn => {
            btn.onclick = (e) => { if (confirm('Löschen?')) deleteWashProgram(e.target.dataset.id); };
        });
    }, (err) => container.innerHTML = 'Fehler.');
    setUnsubscriber('programs', unsub);
}

function loadAdminTickets() {
    const ticketContainer = document.getElementById('admin-tickets-container');
    if (!ticketContainer) return;
    const unsub = subscribeToTickets((tickets) => {
        ticketContainer.innerHTML = '';
        if (tickets.length === 0) { ticketContainer.innerHTML = '<p class="small-text">Keine Meldungen.</p>'; return; }
        tickets.forEach(ticket => {
            const date = new Date(ticket.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' });
            const isOpen = ticket.status === 'open';
            const statusColor = isOpen ? 'var(--error-color)' : 'var(--success-color)';
            const div = document.createElement('div');
            div.className = 'user-list-item';
            div.style.borderLeft = `5px solid ${statusColor}`;
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <strong style="color:${statusColor}">${isOpen ? 'OFFEN' : 'ERLEDIGT'}</strong>
                    <span class="small-text">${date}</span>
                </div>
                <div style="font-weight:bold; margin-bottom:5px;">${ticket.reason}</div>
                <div style="font-size:0.9em; margin-bottom:10px; color:var(--text-color);">${ticket.details || '-'}</div>
                <div class="small-text" style="margin-bottom:10px;">Von: ${ticket.partei}</div>
                <button class="button-small ${isOpen ? 'button-success' : 'button-secondary'} ticket-toggle-btn">${isOpen ? 'Als erledigt markieren' : 'Wieder öffnen'}</button>
            `;
            div.querySelector('.ticket-toggle-btn').onclick = () => toggleTicketStatus(ticket.id, ticket.status);
            ticketContainer.appendChild(div);
        });
    });
}

async function loadMinigameAdmin() {
    const container = document.getElementById('minigame-admin-list');
    if (!container) return;
    const resetAllBtn = document.getElementById('reset-minigame-btn');
    if(resetAllBtn) {
        resetAllBtn.onclick = async () => {
            if(confirm("WARNUNG: Wirklich ALLE Highscores unwiderruflich löschen?")) {
                const success = await resetMinigameLeaderboard();
                if(success) { showMessage(MESSAGE_ID, "Rangliste zurückgesetzt!", "success"); loadMinigameAdmin(); } 
                else { showMessage(MESSAGE_ID, "Fehler beim Reset.", "error"); }
            }
        };
    }
    try {
        const q = query(collection(db, "minigame_scores"), orderBy("score", "desc"));
        const snapshot = await getDocs(q);
        container.innerHTML = '';
        if (snapshot.empty) { container.innerHTML = '<p class="small-text">Keine Scores.</p>'; return; }
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const item = document.createElement('div');
            item.className = 'program-list-item'; 
            let nameDisplay = data.partei;
            if(data.username) nameDisplay += ` (${data.username})`;
            item.innerHTML = `<span><strong>${data.score}</strong> - ${nameDisplay}</span><button class="button-small button-danger delete-score-btn" data-id="${docSnap.id}"><i class="fa-solid fa-trash"></i></button>`;
            container.appendChild(item);
        });
        container.querySelectorAll('.delete-score-btn').forEach(btn => {
            btn.onclick = async (e) => {
                if(confirm(`Score löschen?`)) { await deleteMinigameScore(e.target.closest('button').dataset.id); loadMinigameAdmin(); }
            };
        });
    } catch(e) { container.innerHTML = '<p class="small-text error">Fehler beim Laden.</p>'; }
}

function renderUserList(users, karmaMap) {
    const container = document.getElementById('user-list-container');
    container.innerHTML = '';
    if (users.length === 0) { container.innerHTML = '<p class="small-text">Keine Nutzer.</p>'; return; }
    const parteiOptions = ALL_PARTEIEN.map(p => `<option value="${p}">${p}</option>`).join('');
    
    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'user-list-item';
        item.dataset.userId = user.id;
        const currentKarma = user.partei ? (karmaMap[user.partei] ?? KARMA_START) : '--';
        item.innerHTML = `
            <div class="user-list-item-header"><strong>${user.email}</strong><button class="button-small button-secondary admin-reset-pw-btn" data-email="${user.email}">PW Reset</button></div>
            <div class="user-list-item-body">
                <div class="admin-action-row"><label>Name:</label><input type="text" class="admin-username-input" value="${user.username||''}" placeholder="Name"><button class="button-small button-secondary save-username-btn">Save</button></div>
                <div class="admin-action-row"><label>Partei:</label><select class="admin-partei-select"><option value="" ${!user.partei?'selected':''}>Keine</option>${parteiOptions}</select></div>
                <div class="admin-action-row"><label>Karma:</label><input type="number" class="admin-karma-input" value="${currentKarma}" style="width:60px;" ${!user.partei?'disabled':''}><button class="button-small button-secondary save-karma-btn" ${!user.partei?'disabled':''}>Save</button></div>
                <div class="admin-action-row"><label>Admin:</label><input type="checkbox" class="admin-isadmin-check" ${user.isAdmin?'checked':''}></div>
            </div>
        `;
        const sel = item.querySelector('.admin-partei-select');
        if(user.partei && [...sel.options].some(o => o.value === user.partei)) sel.value = user.partei;
        container.appendChild(item);
    });
    attachAdminListeners();
}

function attachAdminListeners() {
    document.querySelectorAll('.save-username-btn').forEach(btn => btn.addEventListener('click', (e) => handleUserUpdate(e.target.closest('.user-list-item').dataset.userId, 'username', e.target.closest('.admin-action-row').querySelector('input').value.trim())));
    document.querySelectorAll('.admin-partei-select').forEach(sel => sel.addEventListener('change', (e) => handleUserUpdate(e.target.closest('.user-list-item').dataset.userId, 'partei', e.target.value)));
    document.querySelectorAll('.admin-isadmin-check').forEach(chk => chk.addEventListener('change', (e) => handleUserUpdate(e.target.closest('.user-list-item').dataset.userId, 'isAdmin', e.target.checked)));
    document.querySelectorAll('.save-karma-btn').forEach(btn => btn.addEventListener('click', async (e) => {
        const item = e.target.closest('.user-list-item');
        const partei = item.querySelector('.admin-partei-select').value;
        const newVal = parseInt(item.querySelector('.admin-karma-input').value);
        if(partei && !isNaN(newVal)) {
            const oldVal = await getPartyKarma(partei);
            if (newVal !== oldVal) { await updateKarma(partei, newVal - oldVal, "Admin-Korrektur"); showMessage(MESSAGE_ID, `Karma aktualisiert!`, 'success'); }
        }
    }));
    document.querySelectorAll('.admin-reset-pw-btn').forEach(btn => btn.addEventListener('click', (e) => { if(confirm(`Reset Link an ${e.target.dataset.email}?`)) handleAdminPasswordReset(e.target.dataset.email, MESSAGE_ID); }));
}

async function handleUserUpdate(userId, field, value) {
    try { await updateDoc(getUserProfileDocRef(userId), { [field]: value }); showMessage(MESSAGE_ID, `Gespeichert!`, 'success'); } catch (e) { showMessage(MESSAGE_ID, `Fehler: ${e.message}`, 'error'); }
}

export function initAdminView() {
    document.getElementById('back-to-menu-btn-6').addEventListener('click', () => navigateTo(dom.mainMenu, 'back'));
    const toggleBtn = document.getElementById('toggle-maintenance-btn');
    if (toggleBtn) {
        getSystemStatus().then(status => updateAdminMaintUI(status));
        toggleBtn.onclick = async () => { toggleBtn.disabled = true; await setSystemStatus((await getSystemStatus()) === 'ok' ? 'maintenance' : 'ok'); updateAdminMaintUI(await getSystemStatus()); toggleBtn.disabled = false; };
    }
    const savePlzBtn = document.getElementById('save-weather-plz-btn');
    if(savePlzBtn) savePlzBtn.onclick = async () => { try { await setDoc(getSettingsDocRef(), { plz: document.getElementById('weather-plz-input').value }, { merge: true }); showMessage(MESSAGE_ID, "PLZ gespeichert!", "success"); } catch(e) { showMessage(MESSAGE_ID, e.message, "error"); } };
    const qrBtn = document.getElementById('generate-qr-btn');
    if(qrBtn) qrBtn.onclick = async () => { const secret = document.getElementById('qr-secret-input').value; try { await setDoc(getSettingsDocRef(), { qrCodeSecret: secret }, { merge: true }); document.getElementById('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(secret)}`; document.getElementById('qr-code-display').style.display = 'block'; document.getElementById('qr-code-text-display').textContent = secret; showMessage(MESSAGE_ID, "QR Code gespeichert!", "success"); } catch(e) { showMessage(MESSAGE_ID, e.message, "error"); } };
    const addProgBtn = document.getElementById('add-program-btn');
    if(addProgBtn) addProgBtn.onclick = async () => { if(await addWashProgram(document.getElementById('program-name-input').value, document.getElementById('program-duration-input').value)) { document.getElementById('program-name-input').value = ''; document.getElementById('program-duration-input').value = ''; } };

    // --- BUTTON: SMART RESET (TOTAL) ---
    const oldBtn = document.getElementById('smart-reset-btn') || document.getElementById('global-karma-reset-btn');
    const newBtn = document.createElement('button');
    newBtn.id = 'smart-reset-btn';
    newBtn.className = 'button-danger';
    newBtn.innerHTML = '<i class="fa-solid fa-calculator"></i> Smart Reset (Total)';
    newBtn.onclick = handleSmartReset;
    newBtn.style.marginTop = '20px';

    if (oldBtn) {
        oldBtn.replaceWith(newBtn);
    } else {
        const configDetails = document.querySelectorAll('details.admin-group')[2]; 
        if(configDetails) configDetails.querySelector('.admin-content').appendChild(newBtn);
    }
}

function updateAdminMaintUI(status) {
    const toggleBtn = document.getElementById('toggle-maintenance-btn');
    const statusDisplay = document.getElementById('system-status-display');
    if(!toggleBtn) return;
    if (status === 'maintenance') {
        statusDisplay.innerHTML = 'Status: <strong style="color:red;">WARTUNG AKTIV ⛔</strong>';
        toggleBtn.textContent = 'Wartung beenden (Freischalten)'; toggleBtn.className = 'button-small button-success';
    } else {
        statusDisplay.innerHTML = 'Status: <strong style="color:green;">OK ✅</strong>';
        toggleBtn.textContent = 'Wartungsmodus aktivieren (Sperren)'; toggleBtn.className = 'button-small button-danger';
    }
}