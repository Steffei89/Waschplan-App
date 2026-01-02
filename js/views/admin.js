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
import { deleteMinigameScore, resetMinigameLeaderboard } from '../services/minigame.js';
import { loadStatistics } from '../services/stats.js'; // [NEU] Import für Statistiken
import { formatDate } from '../utils.js'; 

const MESSAGE_ID = 'admin-message';

// ===== NAVIGATION STATE =====
let currentAdminView = 'menu'; // 'menu', 'list', 'detail'
let currentListTitle = '';
let currentListType = '';

// Diese Funktion wird von main.js aufgerufen, wenn der globale Zurück-Button gedrückt wird
export function handleAdminBack() {
    const subView = document.getElementById('admin-sub-view');
    const mainMenu = document.getElementById('admin-main-menu');
    
    // Fall 1: Wir sind in einer Detail-Ansicht -> Zurück zur Liste
    if (currentAdminView === 'detail') {
        openSubView(currentListType, currentListTitle); 
        return true; 
    }

    // Fall 2: Wir sind in einer Unterliste -> Zurück zum Admin Menü
    if (currentAdminView === 'list') {
        if(subView) subView.style.display = 'none';
        if(mainMenu) mainMenu.style.display = 'block';
        currentAdminView = 'menu';
        return true; 
    }

    // Fall 3: Wir sind im Admin Menü -> false zurückgeben, damit main.js das Menü verlässt
    return false;
}

// ===== HELPER: GENERIC IOS LIST ITEM (Bleibt für Unterlisten erhalten) =====
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

// ===== HAUPTFUNKTION: ADMIN UI RENDERN =====
export async function loadAdminUserData() {
    const { userIsAdmin } = getState();
    if (!userIsAdmin) { showMessage(MESSAGE_ID, 'Zugriff verweigert.', 'error'); return; }

    const container = document.getElementById('admin-ui-wrapper');
    if (!container) {
        console.error("ADMIN ERROR: #admin-ui-wrapper fehlt.");
        return;
    }
    
    // Reset State
    currentAdminView = 'menu';
    container.innerHTML = '<div class="spinner"></div>';

    // 1. Karma-Status laden (für den Toggle Switch)
    let karmaActive = true;
    try {
        const settingsSnap = await getDoc(doc(db, 'app_settings', 'config'));
        if (settingsSnap.exists()) {
            // Standard ist true, falls Feld nicht existiert
            karmaActive = (settingsSnap.data().karmaSystemActive !== false);
        }
    } catch (e) {
        console.warn("Konnte Karma-Settings nicht laden", e);
    }
    
    // 2. HTML Struktur aufbauen (Neues Kachel-Design)
    const html = `
        <div id="admin-ios-wrapper" style="position:relative; min-height:300px;">
            
            <div id="admin-main-menu">
                
                <div class="admin-section-title">System & Konfiguration</div>
                
                <div class="setting-row">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <i class="fa-solid fa-star" style="color: gold;"></i>
                        <span>Karma-System</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="main-karma-toggle" ${karmaActive ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>

                <div class="admin-section-title">Verwaltung</div>
                
                <div class="admin-grid">
                    <div class="admin-tile" id="tile-users">
                        <i class="fa-solid fa-users"></i>
                        <span>Benutzer</span>
                    </div>
                    <div class="admin-tile" id="tile-stats">
                        <i class="fa-solid fa-chart-pie"></i>
                        <span>Statistik</span>
                    </div>
                    <div class="admin-tile" id="tile-system">
                        <i class="fa-solid fa-server"></i>
                        <span>System</span>
                    </div>
                    <div class="admin-tile" id="tile-tickets">
                        <i class="fa-solid fa-clipboard-list"></i>
                        <span>Tickets</span>
                    </div>
                    <div class="admin-tile" id="tile-programs">
                        <i class="fa-solid fa-clock"></i>
                        <span>Programme</span>
                    </div>
                     <div class="admin-tile" id="tile-minigame">
                        <i class="fa-solid fa-gamepad"></i>
                        <span>Minigame</span>
                    </div>
                    <div class="admin-tile" id="tile-settings">
                        <i class="fa-solid fa-gear"></i>
                        <span>Config</span>
                    </div>
                </div>

                <div class="admin-section-title">Entwicklung</div>
                <div class="admin-grid">
                    <div class="admin-tile" id="tile-debug" style="background: rgba(255, 59, 48, 0.1); color: var(--error-color);">
                        <i class="fa-solid fa-flask" style="color: var(--error-color);"></i>
                        <span>Test-Labor</span>
                    </div>
                </div>

            </div>

            <div id="admin-sub-view" style="display:none;"></div>
        </div>
    `;

    container.innerHTML = html;

    // 3. Event Listener hinzufügen

    // Toggle Switch Logik
    const toggle = document.getElementById('main-karma-toggle');
    if(toggle) {
        toggle.addEventListener('change', async (e) => {
            const newState = e.target.checked;
            try {
                await setDoc(doc(db, 'app_settings', 'config'), { karmaSystemActive: newState }, { merge: true });
                
                // Header Badge sofort updaten (Optional, für visuelles Feedback ohne Reload)
                const badge = document.getElementById('header-karma-display');
                if(badge) badge.style.display = newState ? 'flex' : 'none';

                showMessage(MESSAGE_ID, `Karma System ${newState ? 'aktiviert' : 'deaktiviert'}`, 'success');
            } catch(err) {
                e.target.checked = !newState; // Zurücksetzen bei Fehler
                showMessage(MESSAGE_ID, "Fehler beim Speichern", "error");
            }
        });
    }

    // Tile Klicks -> openSubView
    document.getElementById('tile-users').onclick = () => openSubView('users', 'Benutzer');
    document.getElementById('tile-stats').onclick = () => openSubView('stats', 'Statistiken'); // [NEU] Handler
    document.getElementById('tile-system').onclick = () => openSubView('system', 'System & Wartung');
    document.getElementById('tile-tickets').onclick = () => openSubView('tickets', 'Tickets & Logs');
    document.getElementById('tile-programs').onclick = () => openSubView('programs', 'Wasch-Programme');
    document.getElementById('tile-minigame').onclick = () => openSubView('minigame', 'Highscores');
    document.getElementById('tile-settings').onclick = () => openSubView('settings', 'Einstellungen');
    document.getElementById('tile-debug').onclick = () => openSubView('debug', 'Test-Labor');
}

// ===== NAVIGATION LOGIC =====
async function openSubView(type, title) {
    const mainMenu = document.getElementById('admin-main-menu');
    const subView = document.getElementById('admin-sub-view');
    
    currentAdminView = 'list';
    currentListType = type;
    currentListTitle = title;
    
    mainMenu.style.display = 'none';
    subView.style.display = 'block';
    
    // Header der Unterseite
    subView.innerHTML = `
        <div style="display:flex; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
            <h3 style="margin:0;">${title}</h3>
        </div>
        <div id="admin-sub-content"></div>
    `;

    const contentDiv = document.getElementById('admin-sub-content');
    contentDiv.innerHTML = '<div class="spinner"></div>'; 

    try {
        switch (type) {
            case 'users': await renderUserListOverview(contentDiv); break;
            case 'stats': await renderStatsOverview(contentDiv); break; // [NEU] Case
            case 'system': await renderSystemSettings(contentDiv); break;
            case 'settings': await renderConfigSettings(contentDiv); break;
            case 'debug': await renderDebugSettings(contentDiv); break;
            case 'minigame': await renderMinigameSettings(contentDiv); break;
            case 'programs': await renderProgramSettings(contentDiv); break;
            case 'tickets': await renderTicketSettings(contentDiv); break;
        }
    } catch(e) {
        contentDiv.innerHTML = `<p class="message-box error">Fehler: ${e.message}</p>`;
    }
}

// =========================================================
// HIER FOLGEN DIE SUB-VIEW RENDER FUNKTIONEN (UNVERÄNDERT + STATS)
// =========================================================

// --- [NEU] STATISTIK ---
async function renderStatsOverview(container) {
    container.innerHTML = `
        <div style="padding:10px;">
            <div style="display:flex; justify-content:flex-end; margin-bottom:15px;">
                <select id="stats-filter" style="padding:8px; border-radius:8px; border:1px solid var(--border-color); background:var(--secondary-color); color:var(--text-color);">
                    <option value="ytd" selected>Dieses Jahr</option>
                    <option value="6m">Letzte 6 Monate</option>
                    <option value="30d">Letzte 30 Tage</option>
                    <option value="all">Gesamt</option>
                </select>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:20px;">
                <div style="background:var(--secondary-color); padding:10px; border-radius:12px; text-align:center;">
                    <div id="kpi-total-bookings" style="font-size:1.5em; font-weight:bold;">-</div>
                    <div style="font-size:0.8em; opacity:0.7;">Buchungen</div>
                </div>
                <div style="background:var(--secondary-color); padding:10px; border-radius:12px; text-align:center;">
                    <div id="kpi-most-active" style="font-size:1.2em; font-weight:bold; margin-bottom:4px;">-</div>
                    <div style="font-size:0.8em; opacity:0.7;">Top Partei</div>
                </div>
                <div style="background:var(--secondary-color); padding:10px; border-radius:12px; text-align:center;">
                    <div id="kpi-most-popular-day" style="font-size:1.2em; font-weight:bold; margin-bottom:4px;">-</div>
                    <div style="font-size:0.8em; opacity:0.7;">Top Tag</div>
                </div>
            </div>

            <div style="background:var(--secondary-color); padding:15px; border-radius:12px; margin-bottom:15px;">
                <h4 style="margin-top:0;">Karma Verteilung</h4>
                <canvas id="karmaChart"></canvas>
            </div>

            <div style="background:var(--secondary-color); padding:15px; border-radius:12px; margin-bottom:15px;">
                <h4 style="margin-top:0;">Anteile</h4>
                <canvas id="parteiChart"></canvas>
            </div>

            <div style="background:var(--secondary-color); padding:15px; border-radius:12px; margin-bottom:15px;">
                <h4 style="margin-top:0;">Slot Nutzung</h4>
                <canvas id="slotChart"></canvas>
                <p id="slot-stats-text" class="small-text" style="margin-top:10px; opacity:0.7; text-align:center;"></p>
            </div>

            <div style="background:var(--secondary-color); padding:15px; border-radius:12px; margin-bottom:15px;">
                 <h4 style="margin-top:0;">Buchungsverlauf</h4>
                 <div><canvas id="bookingsOverTimeChart"></canvas></div>
            </div>
            
            <div style="background:var(--secondary-color); padding:15px; border-radius:12px; margin-bottom:15px;">
                 <h4 style="margin-top:0;">Wochentage</h4>
                 <canvas id="dayOfWeekChart"></canvas>
            </div>

            <div id="advanced-stats-container">
                <div id="stats-heatmap-wrapper" style="display:none; background:var(--secondary-color); padding:15px; border-radius:12px; margin-bottom:15px;">
                    <h4 style="margin-top:0;">Auslastung (Heatmap)</h4>
                    <div id="heatmap-container" style="overflow-x:auto;"></div>
                </div>

                <div id="stats-user-lists-wrapper" style="display:none; background:var(--secondary-color); padding:15px; border-radius:12px; margin-bottom:15px;">
                    <h4 style="margin-top:0;">Top Listen</h4>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <div>
                            <h5 style="margin:0 0 5px 0;">Top Wäscher</h5>
                            <div id="list-top-washers" class="small-text"></div>
                        </div>
                        <div>
                            <h5 style="margin:0 0 5px 0;">Top User (Login)</h5>
                            <div id="list-top-users" class="small-text"></div>
                        </div>
                    </div>
                    <div style="margin-top:15px;">
                        <h5 style="margin:0 0 5px 0;">Top Gamer</h5>
                        <div id="list-top-gamers" class="small-text"></div>
                    </div>
                </div>

                <div id="stats-game-balancing-wrapper" style="display:none; background:var(--secondary-color); padding:15px; border-radius:12px; margin-bottom:15px;">
                     <h4 style="margin-top:0;">Minigame Balancing</h4>
                     <canvas id="gameBalancingChart"></canvas>
                </div>
            </div>
        </div>
    `;

    document.getElementById('stats-filter').onchange = () => loadStatistics(true);
    await loadStatistics();
}

// --- 1. BENUTZER LISTE ---
async function renderUserListOverview(container) {
    container.innerHTML = '';
    const q = query(collection(db, "users"), orderBy("email"));
    const querySnapshot = await getDocs(q);
    
    if(querySnapshot.empty) { container.innerHTML = '<p>Keine Benutzer.</p>'; return; }

    querySnapshot.forEach(docSnap => {
        const user = { id: docSnap.id, ...docSnap.data() };
        const parteiLabel = user.partei ? `<span class="tag" style="background:var(--primary-color); color:white; padding:2px 8px; border-radius:10px; font-size:0.8em;">${user.partei}</span>` : '<span style="opacity:0.5;">-</span>';
        
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
    currentAdminView = 'detail';
    const contentDiv = document.getElementById('admin-sub-content');
    const karma = await getPartyKarma(user.partei);

    contentDiv.innerHTML = `
        <div class="user-detail-card" style="background:var(--secondary-color); padding:20px; border-radius:12px;">
            <h4 style="margin-top:0;">Bearbeiten: ${user.email}</h4>
            <div class="admin-action-row" style="margin-bottom:10px;"><label>Name:</label><input type="text" id="edit-user-name" value="${user.username||''}" placeholder="Name"></div>
            <div class="admin-action-row" style="margin-bottom:10px;"><label>Partei:</label>
                <select id="edit-user-partei">
                    <option value="" ${!user.partei?'selected':''}>Keine</option>
                    ${ALL_PARTEIEN.map(p => `<option value="${p}" ${user.partei===p?'selected':''}>${p}</option>`).join('')}
                </select>
            </div>
            <div class="admin-action-row" style="margin-bottom:10px;"><label>Karma:</label><input type="number" id="edit-user-karma" value="${user.partei ? karma : 0}" ${!user.partei?'disabled':''}></div>
            <div class="admin-action-row" style="margin-bottom:10px;"><label>Admin:</label><input type="checkbox" id="edit-user-admin" ${user.isAdmin?'checked':''}></div>
            
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
            <div id="system-status-box" style="margin-bottom:20px; padding:15px; border:1px solid var(--border-color); border-radius:18px; background:white;">
                <div id="system-status-display" style="font-size:1.1em; margin-bottom:15px;">Lade...</div>
                <button id="toggle-maintenance-btn" class="button-small">Lade...</button>
            </div>

            <hr style="border-color:var(--border-color); opacity:0.5;">
            <h4>Notfall / Reset</h4>
            <button id="smart-reset-btn" class="button-danger" style="width:100%;"><i class="fa-solid fa-calculator"></i> Smart Reset (Total)</button>
            <p class="small-text" style="opacity:0.6; margin-top:5px;">Setzt alle Karma-Punkte auf 100 zurück und berechnet Historie neu.</p>
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

    document.getElementById('smart-reset-btn').onclick = handleSmartReset;
}

// --- 3. EINSTELLUNGEN ---
async function renderConfigSettings(container) {
    const snap = await getDoc(doc(db, 'app_settings', 'config'));
    const data = snap.exists() ? snap.data() : {};
    
    container.innerHTML = `
        <div style="padding:10px;">
             <div class="admin-action-row" style="margin-bottom:15px;">
                <label>Wetter PLZ:</label>
                <div style="display:flex; gap:10px;">
                    <input type="number" id="weather-plz-input" value="${data.plz || ''}" placeholder="12345" style="margin:0;">
                    <button class="button-small" id="save-plz-btn" style="margin:0;">Save</button>
                </div>
            </div>
            <hr style="border-color:var(--border-color); opacity:0.5;">
            <div class="admin-action-row">
                <label>QR Code Secret:</label>
                <div style="display:flex; gap:10px;">
                    <input type="text" id="qr-secret-input" value="${data.qrCodeSecret || ''}" placeholder="Geheimcode" style="margin:0;">
                    <button class="button-small" id="gen-qr-btn" style="margin:0;">Gen</button>
                </div>
            </div>
            <div id="qr-code-display" style="display:none; text-align:center; margin-top:15px; background:white; padding:10px; border-radius:10px;">
                <img id="qr-image" src="" style="width:150px; height:150px;">
                <p id="qr-code-text-display" style="font-family:monospace; margin-top:5px;"></p>
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

// --- 4. TEST-LABOR & DEBUG ---
async function renderDebugSettings(container) {
    container.innerHTML = `
        <div style="padding:10px;">
            <p class="small-text"><strong>Achtung:</strong> Diese Funktionen beeinflussen direkt die Datenbank.</p>
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
            <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid var(--border-color);">
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
            <div style="display:flex; gap:10px; margin-bottom:15px; align-items:center;">
                <input type="text" id="program-name-input" placeholder="Programm Name" style="flex:1; margin:0;">
                
                <input type="number" id="program-duration-input" placeholder="Min" style="width:80px; margin:0; text-align:center;">
                
                <button id="add-program-btn" class="button-success" style="width:52px; height:52px; margin:0; padding:0; display:flex; align-items:center; justify-content:center; border-radius:16px;">
                    <i class="fa-solid fa-plus" style="font-size:1.2em;"></i>
                </button>
            </div>
            <div id="program-list">Lade...</div>
        </div>
    `;

    const loadList = () => loadWashPrograms((progs) => {
        const list = document.getElementById('program-list'); 
        if(!list) return; 
        list.innerHTML = '';
        
        if(progs.length === 0) {
            list.innerHTML = '<p style="text-align:center; opacity:0.5;">Keine Programme definiert.</p>';
            return;
        }

        progs.forEach(p => {
            const row = document.createElement('div'); 
            
            // KORREKTUR: background: var(--secondary-color) statt white
            // Das sorgt dafür, dass es im Dark Mode dunkel wird.
            row.style.cssText = `
                display: flex; 
                justify-content: space-between; 
                padding: 12px; 
                background: var(--secondary-color); 
                margin-bottom: 8px; 
                border-radius: 12px; 
                align-items: center; 
                border: 1px solid var(--border-color);
                color: var(--text-color); /* Sicherstellen, dass Textfarbe stimmt */
            `;
            
            // Für den runden Kreis nutzen wir jetzt eine leichte Transparenz, damit er sich abhebt
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="background:rgba(128,128,128,0.15); width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center;">
                        <span style="font-weight:800; font-size:0.9em;">${p.durationMinutes}</span>
                    </div>
                    <span style="font-weight:600;">${p.name}</span>
                </div>
                <button class="button-small button-danger del-prog-btn" data-id="${p.id}" style="margin:0; width:35px; height:35px; padding:0; display:flex; align-items:center; justify-content:center; border-radius:50%;">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;
            list.appendChild(row);
        });
        
        list.querySelectorAll('.del-prog-btn').forEach(b => b.onclick = (e) => deleteWashProgram(e.target.closest('button').dataset.id));
    }, () => {});
    
    loadList();
    
    document.getElementById('add-program-btn').onclick = async () => {
        const n = document.getElementById('program-name-input').value; 
        const d = document.getElementById('program-duration-input').value;
        if(await addWashProgram(n, d)) { 
            document.getElementById('program-name-input').value = ''; 
            document.getElementById('program-duration-input').value = ''; 
        }
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
            const div = document.createElement('div'); div.style.cssText = `border-left:5px solid ${color}; padding:15px; background:var(--secondary-color); margin-bottom:10px; border-radius:12px;`;
            div.innerHTML = `<div style="font-weight:bold;">${t.reason} <span style="font-weight:normal; font-size:0.8em; opacity:0.6;">(${new Date(t.timestamp).toLocaleDateString()})</span></div><div style="font-size:0.9em; margin:5px 0;">${t.details||'-'}</div><div style="font-size:0.8em; opacity:0.7;">Von: ${t.partei}</div><button class="button-small ${isOpen?'button-success':'button-secondary'} toggle-ticket-btn" style="margin-top:10px;">${isOpen?'Erledigt markieren':'Wieder öffnen'}</button>`;
            div.querySelector('.toggle-ticket-btn').onclick = () => toggleTicketStatus(t.id, t.status);
            list.appendChild(div);
        });
    });
}

export function initAdminView() {
    // Legacy cleanup if needed
}

// --- HELPER FUNCTIONS FOR DEBUG/RESET ---

async function handleSmartReset() {
    if (!confirm(`⚠️ TOTALER NEUSTART:\n\nAlle Karmastände werden neu berechnet. Fortfahren?`)) return;
    try { 
        showMessage(MESSAGE_ID, 'Berechne...', 'success'); 
        const partiesSnap = await getDocs(collection(db, "parties")); 
        const bookingsSnap = await getDocs(collection(db, "bookings")); 
        const partyBalance = {}; 
        
        bookingsSnap.forEach(doc => { 
            const b = doc.data(); 
            if (b.partei) { 
                if (!partyBalance[b.partei]) partyBalance[b.partei] = 0; 
                const dateObj = new Date(b.date); 
                const isWeekend = (dateObj.getDay() === 0 || dateObj.getDay() === 6); 
                const cost = Math.abs(isWeekend ? COST_SLOT_PRIME : COST_SLOT_NORMAL); 
                partyBalance[b.partei] -= cost; 
                if (b.checkOutTime || b.isReleased) partyBalance[b.partei] += 5; 
            } 
        }); 
        
        const batch = writeBatch(db); 
        partiesSnap.forEach(docSnap => { 
            const partei = docSnap.id; 
            const data = docSnap.data(); 
            const bookingImpact = partyBalance[partei] || 0; 
            const minigameBonus = data.minigame_earned_this_week || 0; 
            const newKarma = 100 + minigameBonus + bookingImpact; 
            batch.update(docSnap.ref, { karma: newKarma, last_karma_update: Timestamp.now() }); 
        }); 
        
        await batch.commit(); 
        alert("System erfolgreich neu kalibriert!"); 
        showMessage(MESSAGE_ID, 'Fertig!', 'success'); 
        openSubView('system', 'System'); 
    } catch (e) { showMessage(MESSAGE_ID, `Fehler: ${e.message}`, 'error'); }
}

async function debugCreateBooking() { 
    const { currentUser } = getState(); 
    if(!currentUser) return; 
    try { 
        await addDoc(collection(db, "bookings"), { 
            date: formatDate(new Date()), 
            slot: "00:00-23:59", 
            partei: currentUser.userData.partei, 
            userId: currentUser.uid, 
            bookedAt: new Date().toISOString(), 
            isSwap: false, 
            checkInTime: null, 
            checkOutTime: null, 
            isReleased: false 
        }); 
        showMessage(MESSAGE_ID, "Test-Buchung erstellt!", "success"); 
    } catch(e) { showMessage(MESSAGE_ID, e.message, "error"); } 
}

async function debugForceCheckin() { 
    const { currentUser } = getState(); 
    if(!currentUser) return; 
    try { 
        const q = query(collection(db, "bookings"), where("date", "==", formatDate(new Date())), where("partei", "==", currentUser.userData.partei)); 
        const snap = await getDocs(q); 
        const docSnap = snap.docs.find(d => !d.data().isReleased); 
        if(docSnap) { 
            await updateDoc(docSnap.ref, { checkInTime: new Date().toISOString() }); 
            showMessage(MESSAGE_ID, "Check-in erzwungen!", "success"); 
        } else showMessage(MESSAGE_ID, "Keine Buchung.", "error"); 
    } catch(e) { showMessage(MESSAGE_ID, e.message, "error"); } 
}

async function debugResetStatus() { 
    const { currentUser } = getState(); 
    if (!currentUser) return; 
    try { 
        const q = query(collection(db, "bookings"), where("date", "==", formatDate(new Date())), where("partei", "==", currentUser.userData.partei)); 
        const snap = await getDocs(q); 
        const batch = writeBatch(db); 
        snap.forEach(d => batch.delete(d.ref)); 
        await batch.commit(); 
        await debugKillTimer(); 
        showMessage(MESSAGE_ID, "Reset OK.", "success"); 
    } catch(e) { showMessage(MESSAGE_ID, e.message, "error"); } 
}

async function debugKillTimer() { 
    const { currentUser } = getState(); 
    if(!currentUser) return; 
    try { 
        await deleteDoc(doc(db, "active_timers", currentUser.userData.partei)); 
        showMessage(MESSAGE_ID, "Timer gelöscht.", "success"); 
    } catch(e) { showMessage(MESSAGE_ID, e.message, "error"); } 
}