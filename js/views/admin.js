import { 
    db, collection, getDocs, query, orderBy, doc, updateDoc, getUserProfileDocRef, 
    writeBatch, setDoc, getDoc, deleteDoc, where, addDoc, deleteField 
} from '../firebase.js';
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

// ==================== TEST LABOR LOGIK ====================
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
        const q = query(
            collection(db, "bookings"),
            where("date", "==", todayStr),
            where("partei", "==", currentUser.userData.partei)
        );
        
        const snap = await getDocs(q);
        if(snap.empty) return null;

        const activeBooking = snap.docs.find(d => d.data().isReleased === false);
        return activeBooking || null;

    } catch (e) {
        console.error("Fehler beim Suchen der Buchung:", e);
        showMessage(MESSAGE_ID, "DB Fehler (Suche): " + e.message, "error");
        return null;
    }
}

async function debugCreateBooking() {
    const { currentUser } = getState();
    if(!currentUser) {
        showMessage(MESSAGE_ID, "Nicht eingeloggt!", "error");
        return;
    }
    
    if (!currentUser.userData.partei) {
        showMessage(MESSAGE_ID, "Fehler: Dein Admin-User hat keine 'Partei' im Profil.", "error");
        return;
    }
    
    const todayStr = formatDate(new Date());
    
    try {
        const existing = await getMyTodaysBookingDoc();
        if(existing) {
            showMessage(MESSAGE_ID, "Du hast heute schon eine aktive Buchung! Bitte erst resetten.", "error");
            return;
        }
    
        await addDoc(collection(db, "bookings"), {
            date: todayStr,
            slot: "00:00-23:59", 
            partei: currentUser.userData.partei,
            userId: currentUser.uid,
            bookedAt: new Date().toISOString(),
            isSwap: false,
            checkInTime: null,
            checkOutTime: null,
            isReleased: false
        });
        showMessage(MESSAGE_ID, "Test-Buchung (Ganztags) erstellt! Gehe ins Hauptmenü.", "success");
    } catch(e) {
        console.error(e);
        showMessage(MESSAGE_ID, "Fehler beim Erstellen: " + e.message, "error");
    }
}

async function debugForceCheckin() {
    try {
        const docSnap = await getMyTodaysBookingDoc();
        if(!docSnap) {
            showMessage(MESSAGE_ID, "Keine aktive Buchung für heute gefunden. Erst erstellen!", "error");
            return;
        }
        await updateDoc(docSnap.ref, {
            checkInTime: new Date().toISOString()
        });
        showMessage(MESSAGE_ID, "Erzwungener Check-in erfolgreich!", "success");
    } catch(e) { 
        console.error(e);
        showMessage(MESSAGE_ID, "Fehler Check-in: " + e.message, "error"); 
    }
}

async function debugResetStatus() {
    const { currentUser } = getState();
    if (!currentUser) return;

    try {
        const todayStr = formatDate(new Date());
        const q = query(
            collection(db, "bookings"), 
            where("date", "==", todayStr), 
            where("partei", "==", currentUser.userData.partei)
        );
        const snap = await getDocs(q);

        let deletedCount = 0;
        const batch = writeBatch(db);
        
        if(!snap.empty) {
            snap.forEach(d => {
                 batch.delete(d.ref);
                 deletedCount++;
            });
            await batch.commit();
        }

        await debugKillTimer(true); 
        
        if (deletedCount > 0) {
            showMessage(MESSAGE_ID, "Alles bereinigt (Buchung & Timer gelöscht).", "success");
        } else {
            showMessage(MESSAGE_ID, "Reset durchgeführt (Timer geprüft).", "success");
        }
    } catch(e) { 
        console.error(e);
        showMessage(MESSAGE_ID, "Reset Fehler: " + e.message, "error"); 
    }
}

async function debugKillTimer(silent = false) {
    const { currentUser } = getState();
    if(!currentUser) return;
    
    if (!currentUser.userData.partei) {
        if(!silent) showMessage(MESSAGE_ID, "Keine Partei zugeordnet.", "error");
        return;
    }

    try {
        await deleteDoc(doc(db, "active_timers", currentUser.userData.partei));
        if(!silent) showMessage(MESSAGE_ID, "Aktiver Timer gelöscht.", "success");
    } catch(e) {
        if(!silent) showMessage(MESSAGE_ID, "Timer Kill Fehler: " + e.message, "error");
    }
}
// ==========================================================

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
            // Sicheres Erstellen von Textelementen
            const span = document.createElement('span');
            span.textContent = `${prog.name} (${prog.durationMinutes} Min)`;
            
            const btn = document.createElement('button');
            btn.className = 'button-small button-danger delete-program-btn';
            btn.dataset.id = prog.id;
            btn.textContent = 'Löschen';

            item.appendChild(span);
            item.appendChild(btn);
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

// === HIER WURDE DIE SICHERHEITSLÜCKE GESCHLOSSEN ===
function loadAdminTickets() {
    const ticketContainer = document.getElementById('admin-tickets-container');
    if (!ticketContainer) return;

    const unsub = subscribeToTickets((tickets) => {
        ticketContainer.innerHTML = '';
        if (tickets.length === 0) {
            ticketContainer.textContent = 'Keine Meldungen vorhanden.';
            ticketContainer.className = 'small-text';
            return;
        }

        tickets.forEach(ticket => {
            const date = new Date(ticket.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' });
            const isOpen = ticket.status === 'open';
            const statusColor = isOpen ? 'var(--error-color)' : 'var(--success-color)';
            const statusText = isOpen ? 'OFFEN' : 'ERLEDIGT';
            const btnText = isOpen ? 'Als erledigt markieren' : 'Wieder öffnen';
            const btnClass = isOpen ? 'button-success' : 'button-secondary';

            // Container
            const div = document.createElement('div');
            div.className = 'user-list-item';
            div.style.borderLeft = `5px solid ${statusColor}`;
            
            // Header (Status + Datum)
            const headerDiv = document.createElement('div');
            headerDiv.style.display = 'flex';
            headerDiv.style.justifyContent = 'space-between';
            headerDiv.style.marginBottom = '5px';
            
            const statusSpan = document.createElement('span');
            statusSpan.style.fontWeight = 'bold';
            statusSpan.style.color = statusColor;
            statusSpan.textContent = statusText;
            
            const dateSpan = document.createElement('span');
            dateSpan.className = 'small-text';
            dateSpan.textContent = date;
            
            headerDiv.appendChild(statusSpan);
            headerDiv.appendChild(dateSpan);
            
            // Grund (Reason)
            const reasonDiv = document.createElement('div');
            reasonDiv.style.fontWeight = 'bold';
            reasonDiv.style.marginBottom = '5px';
            reasonDiv.textContent = ticket.reason; // SICHER: textContent statt innerHTML
            
            // Details
            const detailsDiv = document.createElement('div');
            detailsDiv.style.fontSize = '0.9em';
            detailsDiv.style.marginBottom = '10px';
            detailsDiv.style.color = 'var(--text-color)';
            detailsDiv.textContent = ticket.details || 'Keine Details'; // SICHER: textContent
            
            // User Info
            const metaDiv = document.createElement('div');
            metaDiv.className = 'small-text';
            metaDiv.style.marginBottom = '10px';
            metaDiv.textContent = `Von: ${ticket.email} (${ticket.partei})`; // SICHER: textContent
            
            // Button
            const btn = document.createElement('button');
            btn.className = `button-small ${btnClass} ticket-toggle-btn`;
            btn.textContent = btnText;
            btn.addEventListener('click', async () => {
                await toggleTicketStatus(ticket.id, ticket.status);
            });

            // Alles zusammenbauen
            div.appendChild(headerDiv);
            div.appendChild(reasonDiv);
            div.appendChild(detailsDiv);
            div.appendChild(metaDiv);
            div.appendChild(btn);

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
                if(success) {
                    showMessage(MESSAGE_ID, "Rangliste zurückgesetzt!", "success");
                    loadMinigameAdmin(); 
                } else {
                    showMessage(MESSAGE_ID, "Fehler beim Reset.", "error");
                }
            }
        };
    }

    container.innerHTML = '<div class="skeleton-item"><div class="skeleton skeleton-line"></div></div>';

    try {
        const q = query(collection(db, "minigame_scores"), orderBy("score", "desc"));
        const snapshot = await getDocs(q);
        
        container.innerHTML = '';
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="small-text">Keine Scores vorhanden.</p>';
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const item = document.createElement('div');
            item.className = 'program-list-item'; 
            
            let nameDisplay = data.partei;
            if(data.username) nameDisplay += ` (${data.username})`;

            // Text-Teil sicher erstellen
            const span = document.createElement('span');
            span.innerHTML = `<strong>${data.score}</strong> - `; // Score ist Zahl, okay.
            const nameSpan = document.createElement('span');
            nameSpan.textContent = nameDisplay; // Name ist User-Input, muss safe sein!
            span.appendChild(nameSpan);

            // Lösch Button
            const btn = document.createElement('button');
            btn.className = 'button-small button-danger delete-score-btn';
            btn.dataset.partei = docSnap.id;
            btn.innerHTML = '<i class="fa-solid fa-trash"></i>';

            item.appendChild(span);
            item.appendChild(btn);
            container.appendChild(item);
        });

        container.querySelectorAll('.delete-score-btn').forEach(btn => {
            btn.onclick = async (e) => {
                const target = e.target.closest('button');
                const partei = target.dataset.partei;
                if(confirm(`Score von ${partei} löschen?`)) {
                    const success = await deleteMinigameScore(partei);
                    if(success) {
                        showMessage(MESSAGE_ID, "Score gelöscht.", "success");
                        loadMinigameAdmin();
                    }
                }
            };
        });

    } catch(e) {
        console.error(e);
        container.innerHTML = '<p class="small-text error">Fehler beim Laden.</p>';
    }
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

        // Hinweis: Hier wird HTML-String verwendet, was okay ist, da wir Inputs generieren
        // Aber Username sollte escaped werden. Wir nutzen value="${username}" Attribut, das ist relativ sicher.
        item.innerHTML = `
            <div class="user-list-item-header">
                <strong>${user.email}</strong>
                <button class="button-small button-secondary admin-reset-pw-btn" data-email="${user.email}">PW Reset</button>
            </div>
            <div class="user-list-item-body">
                <div class="admin-action-row">
                    <label>Name:</label>
                    <input type="text" class="admin-username-input" value="${username.replace(/"/g, '&quot;')}" placeholder="Name" style="margin-bottom:0; flex-grow:1;">
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
    document.getElementById('back-to-menu-btn-6').addEventListener('click', () => navigateTo(dom.mainMenu, 'back'));

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