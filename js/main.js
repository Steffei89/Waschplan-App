// ===== WICHTIG: SERVICE WORKER STARTEN =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then((registration) => {
      console.log('Service Worker registriert mit Scope:', registration.scope);
    })
    .catch((err) => {
      console.error('Service Worker Fehler:', err);
    });
}
// ===========================================

import { auth, onAuthStateChanged, getDoc, getUserProfileDocRef, Timestamp, doc, onSnapshot, db, updateDoc } from './firebase.js';
import * as dom from './dom.js';
import { getState, setCurrentUser, setUnsubscriber, setSelectedCalendarDate, getIsRegistering } from './state.js';
import { getFormattedDate, today, tomorrow, createAndDownloadIcsFile } from './utils.js';
import { 
    showMessage, navigateTo, updateUserInfo, setTheme, unsubscribeAll, unsubscribeForNavigation,
    hideConfirmation, updateSlotDropdownUI,
    checkNotificationPermission, showChangelog
} from './ui.js';
import { handleRegister, handleLogin, handleLogout, handlePasswordReset, handleDeleteAccount } from './services/auth.js';
import { loadWeather } from './services/weather.js';
import { loadStatistics, initStatsView, trackMenuClick } from './services/stats.js';
import { performBooking, performDeletion, loadNextBookingsOverview, checkSlotAvailability, performCheckIn, performCheckOut, checkAndAutoCheckoutOldBookings, subscribeToMachineStatus } from './services/booking.js';
import { 
    loadIncomingRequests, loadOutgoingRequestStatus, loadOutgoingRequestSuccess,
    confirmSwapTransaction, rejectSwapRequest, dismissRequestNotification
} from './services/swap.js';
import { initCalendarView, loadBookingsForMonth } from './views/calendar.js';
import { initOverviewView, setupWeekDropdown, loadBookingsForWeek } from './views/overview.js';
import { initProfileView, loadProfileData } from './views/profile.js';
import { initAdminView, loadAdminUserData } from './views/admin.js';
import { APP_VERSION } from './config.js'; 
import { loadWashPrograms, listenToActiveTimer, startWashTimer, stopWashTimer } from './services/timers.js';
import { initKarmaForParty } from './services/karma.js';
import { initMinigame } from './services/minigame.js'; 
import { startSession, updateSession } from './services/analytics.js';
import { reportIssue } from './services/maintenance.js'; 
import { startScanner } from './services/scanner.js';
import { initPushNotifications } from './services/push.js';
import { initGestures } from './services/gestures.js';

let allPrograms = []; 
let currentTimerData = null; 
let activeTimerInterval = null; 
let karmaUnsubscribe = null; 
let myCurrentBooking = null;
let autoCheckoutInterval = null;
let machineStatusUnsubscribe = null;

// --- AUTH FLOW ---

onAuthStateChanged(auth, async (user) => {
    
    if (getIsRegistering()) {
        return; 
    }

    if (user) { 
        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            // Wir reloaden den User nur, wenn wir sicher sind, dass wir online sind, 
            // um Hänger zu vermeiden.
            try { await user.reload(); } catch(e) { console.warn("User reload failed (Offline?)", e); }
            
            if (!user.emailVerified) {
                await signOut(auth);
                return;
            }

            const userDocSnap = await getDoc(getUserProfileDocRef(user.uid));
            
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                
                // === CHECK: PARTEI FEHLT? (Neuer Nutzer) ===
                if (!userData.partei) {
                    dom.loadingOverlay.style.display = 'none';
                    dom.appContainer.style.display = 'block';
                    
                    // SICHERHEITS-CHECK: Existiert das Modal?
                    if (!dom.setupParteiModal) {
                        alert("FEHLER: 'index.html' ist veraltet! Bitte die Datei aktualisieren.");
                        return;
                    }

                    // Alles andere ausblenden
                    navigateTo(null);
                    dom.setupParteiModal.style.display = 'flex';
                    
                    // Listener für das Speichern
                    if (dom.setupParteiSaveBtn) {
                        dom.setupParteiSaveBtn.onclick = async () => {
                            const selected = dom.setupParteiSelect.value;
                            if (!selected) {
                                alert("Bitte Partei wählen!");
                                return;
                            }
                            dom.setupParteiSaveBtn.disabled = true;
                            dom.setupParteiSaveBtn.textContent = 'Speichere...';
                            
                            try {
                                await updateDoc(getUserProfileDocRef(user.uid), { partei: selected });
                                window.location.reload();
                            } catch (e) {
                                alert("Fehler beim Speichern: " + e.message);
                                dom.setupParteiSaveBtn.disabled = false;
                            }
                        };
                    }
                    return; // WICHTIG: Hier stoppen!
                }
                // ================================================

                // === NORMALER LOGIN (Bestehender Nutzer) ===
                setCurrentUser({ uid: user.uid, ...user, userData });
                
                startSession();
                
                checkAndAutoCheckoutOldBookings();
                if (autoCheckoutInterval) clearInterval(autoCheckoutInterval);
                autoCheckoutInterval = setInterval(checkAndAutoCheckoutOldBookings, 60000);

                initPushNotifications();
                initGestures();

                if (userData.partei) {
                    try {
                        await initKarmaForParty(userData.partei);
                        setupKarmaHeaderListener(userData.partei);
                    } catch (karmaError) {
                        console.error("Karma Fehler:", karmaError);
                    }
                }

                updateUserInfo(userData);
                setupMainMenuListeners(); 
                loadWeather(); 
                
                // UI ANZEIGEN
                dom.loadingOverlay.style.display = 'none';
                dom.appContainer.style.display = 'block';

                if(dom.weatherWidget) dom.weatherWidget.style.display = 'flex'; 
                
                // Hier könnte der Fehler liegen, wenn dom.mainMenu fehlt oder navigateTo crasht
                navigateTo(dom.mainMenu);
                
                handleLoadNextBookings();
                handleLoadIncomingRequests();
                handleLoadOutgoingRequests();
                handleLoadOutgoingSuccess();
                handleLoadPrograms();
                handleListenToTimer();
                handleMachineStatus();
                checkAppVersion();

            } else {
                // User in Auth, aber kein Profil in Firestore?
                await handleLogout(); 
            }
        } catch (e) {
            console.error("Critical Auth Error:", e);
            
            // FEHLERBEHANDLUNG:
            // Wenn der User hier landet, sieht er sonst nur den Login-Screen, obwohl er eingeloggt ist.
            // Wir loggen ihn aus und zeigen den Fehler.
            alert("Ein Fehler ist aufgetreten:\n" + e.message + "\n\nBitte App neu laden.");
            await handleLogout();
        }
    } else {
        // NICHT EINGELOGGT
        dom.loadingOverlay.style.display = 'none';
        dom.appContainer.style.display = 'block';

        unsubscribeAll();
        if(karmaUnsubscribe) karmaUnsubscribe();
        if(machineStatusUnsubscribe) machineStatusUnsubscribe();
        
        if (autoCheckoutInterval) clearInterval(autoCheckoutInterval);
        
        setCurrentUser(null);
        updateUserInfo(null);
        if(dom.weatherWidget) dom.weatherWidget.style.display = 'none';
        if(dom.machineStatusWidget) dom.machineStatusWidget.style.display = 'none';
        
        if (activeTimerInterval) clearInterval(activeTimerInterval);
        if(dom.liveTimerSection) {
            dom.liveTimerSection.style.display = 'none';
            dom.liveTimerSection.classList.remove('active'); 
        }
        allPrograms = [];
        currentTimerData = null;
        myCurrentBooking = null;

        if (dom.deleteAccountModal) dom.deleteAccountModal.style.display = 'none';
        if (dom.setupParteiModal) dom.setupParteiModal.style.display = 'none';

        navigateTo(dom.loginForm);
    }
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden') updateSession();
});

function handleMachineStatus() {
    if(machineStatusUnsubscribe) machineStatusUnsubscribe();
    const widget = dom.machineStatusWidget;
    const icon = document.getElementById('machine-status-icon');
    const text = document.getElementById('machine-status-text');
    if(!widget) return;
    widget.style.display = 'flex';
    machineStatusUnsubscribe = subscribeToMachineStatus((status) => {
        if (status === 'busy') {
            widget.className = 'status-widget status-busy';
            text.textContent = 'Belegt';
            icon.className = 'fa-solid fa-shirt'; 
        } else {
            widget.className = 'status-widget status-free';
            text.textContent = 'Frei';
            icon.className = 'fa-regular fa-circle-check';
        }
    });
}

function setupKarmaHeaderListener(parteiName) {
    if(karmaUnsubscribe) karmaUnsubscribe();
    const headerDisplay = document.getElementById('header-karma-display');
    const headerValue = document.getElementById('header-karma-value');
    const headerIcon = document.getElementById('header-karma-icon');
    if (!headerDisplay || !headerValue || !headerIcon) return;
    headerDisplay.style.display = 'flex';
    karmaUnsubscribe = onSnapshot(doc(db, "parties", parteiName), (docSnap) => {
        if (docSnap.exists()) {
            const karma = docSnap.data().karma;
            headerValue.textContent = karma;
            if (karma < 40) {
                headerDisplay.style.background = 'linear-gradient(135deg, #ff3b30, #ff9f0a)';
                headerIcon.className = 'fa-solid fa-triangle-exclamation';
            } else if (karma > 80) {
                headerDisplay.style.background = 'linear-gradient(135deg, #34c759, #f1c40f)';
                headerIcon.className = 'fa-solid fa-star';
            } else {
                headerDisplay.style.background = 'linear-gradient(135deg, var(--primary-color), var(--primary-color-transparent))';
                headerIcon.className = 'fa-solid fa-circle-check';
            }
        }
    });
}

function handleLoadNextBookings() {
    dom.myBookingsList.innerHTML = `<div class="skeleton-item"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div>`;
    const unsub = loadNextBookingsOverview((bookings, currentUser, userIsAdmin) => {
            dom.myBookingsList.innerHTML = '';
            const todayStr = getFormattedDate(new Date());
            const myActive = bookings.find(b => b.partei === currentUser.userData.partei && b.date === todayStr && !b.isReleased);
            myCurrentBooking = myActive || null;
            renderTimerUI(); 
            if (bookings.length === 0) { dom.myBookingsList.innerHTML = `<p class="small-text">Keine kommenden Buchungen gefunden.</p>`; return; }
            bookings.forEach(booking => {
                const formattedDate = new Date(booking.date + "T00:00:00").toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
                const isMyParteiBooking = booking.partei === currentUser.userData.partei;
                const item = document.createElement('div');
                item.className = 'my-booking-item';
                if (isMyParteiBooking || userIsAdmin) {
                    const icsBtn = document.createElement('button');
                    icsBtn.className = 'button-small export-ics-btn';
                    icsBtn.title = 'In Kalender speichern';
                    icsBtn.innerHTML = '<i class="fa-regular fa-calendar-plus"></i>';
                    icsBtn.onclick = (e) => { e.stopPropagation(); createAndDownloadIcsFile(booking.date, booking.slot); };
                    const delBtn = document.createElement('button');
                    delBtn.className = 'button-small button-danger delete-my-booking-btn';
                    delBtn.textContent = 'Löschen';
                    delBtn.onclick = async (e) => {
                        e.target.disabled = true; e.target.textContent = 'Lösche...';
                        const success = await performDeletion(booking.date, booking.slot, 'main-menu-message');
                        if (success && dom.bookingDateInput.value === booking.date) dom.bookingDateInput.dispatchEvent(new Event('change'));
                    };
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'booking-actions';
                    actionsDiv.appendChild(icsBtn);
                    if (userIsAdmin) actionsDiv.appendChild(delBtn);
                    else { if (!booking.checkInTime) actionsDiv.appendChild(delBtn); }
                    let statusText = '';
                    if (booking.isReleased) statusText = '<br><span style="color:var(--success-color); font-size:0.8em;">(Abgeschlossen ✅)</span>';
                    else if (booking.checkInTime) statusText = '<br><span style="color:var(--primary-color); font-weight:bold; font-size:0.8em;">(Läuft ▶️)</span>';
                    const detailsDiv = document.createElement('div');
                    detailsDiv.className = 'booking-details';
                    detailsDiv.innerHTML = `<strong>${formattedDate}</strong> (${booking.slot})<span class="small-text ml-10">${booking.partei}</span>${statusText}`;
                    item.appendChild(detailsDiv); item.appendChild(actionsDiv);
                } else {
                     item.innerHTML = `<div class="booking-details"><strong>${formattedDate}</strong> (${booking.slot})<span class="small-text ml-10">${booking.partei}</span></div>`;
                }
                dom.myBookingsList.appendChild(item);
            });
        },
        (error) => { dom.myBookingsList.innerHTML = `<p class="small-text" style="color: var(--error-color);">Fehler beim Laden.</p>`; }
    );
    setUnsubscriber('quickView', unsub);
}

// ... handleLoadIncomingRequests, handleLoadOutgoingRequests, handleLoadOutgoingSuccess ... (Unverändert)
function handleLoadIncomingRequests() {
    const unsub = loadIncomingRequests(
        (pendingRequests) => {
            dom.incomingRequestsContainer.innerHTML = '';
            if (pendingRequests.length === 0) { dom.incomingRequestsContainer.style.display = 'none'; return; }
            dom.incomingRequestsContainer.style.display = 'block'; 
            const header = document.createElement('h3');
            header.className = 'request-item-header';
            header.textContent = `Eingehende Tauschanfragen (${pendingRequests.length})`;
            dom.incomingRequestsContainer.appendChild(header);
            pendingRequests.forEach(req => {
                const dateStr = new Date(req.targetDate + "T00:00:00").toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                const item = document.createElement('div'); item.className = 'request-item';
                const detailsDiv = document.createElement('div'); detailsDiv.className = 'request-details';
                detailsDiv.innerHTML = `<strong>${dateStr} (${req.targetSlot})</strong><span class="small-text ml-10">von: ${req.requesterPartei}</span>`;
                const actionsDiv = document.createElement('div'); actionsDiv.className = 'request-actions';
                const acceptBtn = document.createElement('button'); acceptBtn.className = 'button-small button-success'; acceptBtn.textContent = 'Annehmen';
                acceptBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); acceptBtn.disabled = true; acceptBtn.textContent = 'Prüfe...'; confirmSwapTransaction(req.id); };
                const rejectBtn = document.createElement('button'); rejectBtn.className = 'button-small button-secondary'; rejectBtn.textContent = 'Ablehnen';
                rejectBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); rejectBtn.disabled = true; rejectBtn.textContent = '...'; rejectSwapRequest(req.id); };
                actionsDiv.appendChild(acceptBtn); actionsDiv.appendChild(rejectBtn); item.appendChild(detailsDiv); item.appendChild(actionsDiv);
                dom.incomingRequestsContainer.appendChild(item);
            });
        },
        (error) => { dom.incomingRequestsContainer.style.display = 'block'; dom.incomingRequestsContainer.innerHTML = '<p class="message-box error">Fehler beim Laden.</p>'; }
    );
    setUnsubscriber('requests', unsub);
}

function handleLoadOutgoingRequests() {
    const unsub = loadOutgoingRequestStatus(
        (rejectedRequests) => {
            const container = dom.outgoingRequestsStatusContainer;
            container.innerHTML = '';
            if (rejectedRequests.length === 0) { container.style.display = 'none'; return; }
            container.style.display = 'block';
            const header = document.createElement('h3'); header.className = 'request-item-header'; header.style.color = 'var(--error-color)'; header.textContent = `Abgelehnte Anfragen (${rejectedRequests.length})`; container.appendChild(header);
            rejectedRequests.forEach(req => {
                const dateStr = new Date(req.targetDate + "T00:00:00").toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                const item = document.createElement('div'); item.className = 'request-item rejected'; 
                item.innerHTML = `<div class="request-details"><strong>${dateStr} (${req.targetSlot})</strong><span class="small-text ml-10">Anfrage an ${req.targetPartei} wurde abgelehnt.</span></div>`;
                const actionsDiv = document.createElement('div'); actionsDiv.className = 'request-actions';
                const okBtn = document.createElement('button'); okBtn.className = 'button-small button-secondary dismiss-notification-btn'; okBtn.textContent = 'OK';
                okBtn.addEventListener('click', async (e) => { e.preventDefault(); okBtn.disabled = true; await dismissRequestNotification(req.id); });
                actionsDiv.appendChild(okBtn); item.appendChild(actionsDiv); container.appendChild(item);
            });
        },
        (error) => console.error(error)
    );
    setUnsubscriber('outgoingRequests', unsub);
}

function handleLoadOutgoingSuccess() {
    const unsub = loadOutgoingRequestSuccess(
        (acceptedRequests) => {
            const container = dom.outgoingRequestsSuccessContainer;
            container.innerHTML = '';
            if (acceptedRequests.length === 0) { container.style.display = 'none'; return; }
            container.style.display = 'block';
            const header = document.createElement('h3'); header.className = 'request-item-header'; header.style.color = 'var(--success-color)'; header.textContent = `Angenommene Anfragen (${acceptedRequests.length})`; container.appendChild(header);
            acceptedRequests.forEach(req => {
                const dateStr = new Date(req.targetDate + "T00:00:00").toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                const item = document.createElement('div'); item.className = 'request-item accepted'; 
                item.innerHTML = `<div class="request-details"><strong>${dateStr} (${req.targetSlot})</strong><span class="small-text ml-10">Tausch mit ${req.targetPartei} war erfolgreich!</span></div>`;
                const actionsDiv = document.createElement('div'); actionsDiv.className = 'request-actions';
                const okBtn = document.createElement('button'); okBtn.className = 'button-small button-secondary dismiss-notification-btn'; okBtn.textContent = 'OK';
                okBtn.addEventListener('click', async (e) => { e.preventDefault(); okBtn.disabled = true; okBtn.textContent = '...'; await dismissRequestNotification(req.id); });
                actionsDiv.appendChild(okBtn); item.appendChild(actionsDiv); container.appendChild(item);
            });
        },
        (error) => console.error(error)
    );
    setUnsubscriber('outgoingRequestsSuccess', unsub);
}

function handleLoadPrograms() {
    const unsub = loadWashPrograms((programs) => { allPrograms = programs; renderTimerUI(); }, (error) => console.error(error));
    setUnsubscriber('programs', unsub);
}

function handleListenToTimer() {
    const { currentUser } = getState();
    if (!currentUser) return;
    const unsub = listenToActiveTimer(currentUser.userData.partei, (timerData) => { currentTimerData = timerData; renderTimerUI(); });
    setUnsubscriber('timer', unsub);
}

async function getStoredQrCode() {
    try { const snap = await getDoc(doc(db, 'app_settings', 'config')); if (snap.exists() && snap.data().qrCodeSecret) return snap.data().qrCodeSecret; return 'WASCH-START'; } catch(e) { return 'WASCH-START'; }
}

function renderTimerUI() {
    if (activeTimerInterval) { clearTimeout(activeTimerInterval); clearInterval(activeTimerInterval); }
    activeTimerInterval = null; 
    const { currentUser } = getState();
    if (!currentUser) { 
        if(dom.liveTimerSection) { dom.liveTimerSection.style.display = 'none'; dom.liveTimerSection.classList.remove('active'); }
        return; 
    }
    
    // Sicherheit: Existiert das Element überhaupt?
    if(!dom.liveTimerSection) return;

    dom.liveTimerSection.innerHTML = ''; 

    if (currentTimerData) {
        dom.liveTimerSection.style.display = 'block'; setTimeout(() => dom.liveTimerSection.classList.add('active'), 10); 
        const { programName, endTime, startTime, durationMinutes } = currentTimerData;
        const endTimeMs = endTime.toMillis(); const startTimeMs = startTime.toMillis(); const totalDurationMs = durationMinutes * 60 * 1000;
        dom.liveTimerSection.innerHTML = `<div class="timer-running-container"><h3>Programm läuft: ${programName}</h3><div class="progress-bar-container"><div class="progress-bar-fill" id="timer-progress-fill"></div></div><p class="timer-countdown-text" id="timer-countdown-text">Berechne...</p><button class="timer-stop-btn" id="timer-stop-btn"><i class="fa-solid fa-right-from-bracket"></i> Check-out / Stopp</button></div>`;
        const updateCountdown = () => {
            const nowMs = Date.now(); const remainingMs = endTimeMs - nowMs;
            if (remainingMs <= 0) { if (activeTimerInterval) clearInterval(activeTimerInterval); activeTimerInterval = null; stopWashTimer(currentUser.userData.partei); currentTimerData = null; renderTimerUI(); return; }
            const remainingMinutes = Math.floor(remainingMs / 60000); const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);
            const countdownTextEl = document.getElementById('timer-countdown-text');
            if(countdownTextEl) countdownTextEl.textContent = `${remainingMinutes}:${String(remainingSeconds).padStart(2, '0')} Min. verbleibend`;
            const elapsedMs = nowMs - startTimeMs; let percent = (elapsedMs / totalDurationMs) * 100; if (percent > 100) percent = 100; if (percent < 0) percent = 0;
            const fillEl = document.getElementById('timer-progress-fill'); if (fillEl) fillEl.style.width = `${percent}%`;
        };
        activeTimerInterval = setInterval(updateCountdown, 1000); updateCountdown(); 
        document.getElementById('timer-stop-btn').addEventListener('click', async () => {
            if (confirm('Möchtest du auschecken und den Timer stoppen?')) {
                const correctCode = await getStoredQrCode();
                startScanner((scannedCode) => { if (scannedCode === correctCode) { stopWashTimer(currentUser.userData.partei); showMessage('main-menu-message', 'Check-out erfolgreich! ✅', 'success'); } else { alert("Falscher QR-Code! ❌"); } }, (error) => {});
            }
        });
    } else {
        if (myCurrentBooking) {
            dom.liveTimerSection.style.display = 'block'; setTimeout(() => dom.liveTimerSection.classList.add('active'), 10);
            if (!myCurrentBooking.checkInTime) {
                const now = new Date(); const [startHour, startMinute] = myCurrentBooking.slot.split('-')[0].split(':').map(Number); const startTime = new Date(); startTime.setHours(startHour, startMinute, 0, 0);
                if (now < startTime) {
                    dom.liveTimerSection.innerHTML = `<div class="timer-start-container" style="text-align:center;"><h3 style="margin:0 0 10px 0;">Dein Slot: ${myCurrentBooking.slot}</h3><p style="margin-bottom:15px; color: var(--text-color); opacity: 0.8;"><i class="fa-regular fa-clock"></i> Check-in möglich ab <strong>${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')} Uhr</strong></p><button class="button-secondary" disabled style="opacity: 0.6; cursor: not-allowed; background-color: var(--secondary-color); color: var(--text-color);"><i class="fa-solid fa-hourglass-start"></i> Warte auf Startzeit...</button></div>`;
                    const msUntilStart = startTime - now;
                    if (msUntilStart > 0 && msUntilStart < 24 * 60 * 60 * 1000) { activeTimerInterval = setTimeout(() => { renderTimerUI(); showMessage('main-menu-message', 'Deine Zeit beginnt jetzt! Check-in ist freigeschaltet.', 'success'); }, msUntilStart); }
                } else {
                    dom.liveTimerSection.innerHTML = `<div class="timer-start-container" style="text-align:center;"><h3 style="margin:0 0 10px 0;">Dein Slot: ${myCurrentBooking.slot}</h3><p style="margin-bottom:15px;">Bitte einchecken, wenn du an der Maschine bist.</p><button id="check-in-btn" class="button-primary" style="font-size:1.2em; padding:15px;"><i class="fa-solid fa-qrcode"></i> Check-in (Scan)</button></div>`;
                    document.getElementById('check-in-btn').addEventListener('click', async () => { const correctCode = await getStoredQrCode(); startScanner(async (code) => { if (code === correctCode) { await performCheckIn(myCurrentBooking.id, 'main-menu-message'); } else { alert("Falscher QR-Code!"); } }); });
                }
            } else {
                let buttonsHTML = ''; if(allPrograms.length > 0) { buttonsHTML = '<p style="margin-top:15px; font-weight:bold;">Programm-Timer starten (optional):</p><div class="timer-button-row">' + allPrograms.map(prog => `<button class="timer-start-btn" data-id="${prog.id}">${prog.name} (${prog.durationMinutes} min)</button>`).join('') + '</div>'; }
                dom.liveTimerSection.innerHTML = `<div class="timer-start-container"><div style="background:var(--success-color); color:white; padding:5px 10px; border-radius:5px; display:inline-block; margin-bottom:10px; font-size:0.9em;"><i class="fa-solid fa-check"></i> Eingecheckt seit ${new Date(myCurrentBooking.checkInTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div><button id="check-out-btn" class="button-danger"><i class="fa-solid fa-right-from-bracket"></i> Check-out / Fertig</button>${buttonsHTML}</div>`;
                document.getElementById('check-out-btn').addEventListener('click', async () => { if(confirm("Wäsche fertig? Slot freigeben?")) { await performCheckOut(myCurrentBooking.id, 'main-menu-message'); } });
                document.querySelectorAll('.timer-start-btn').forEach(btn => { btn.addEventListener('click', async (e) => { const pId = e.target.dataset.id; const prog = allPrograms.find(p => p.id === pId); if(prog) { startWashTimer(currentUser.userData.partei, prog); } }); });
            }
        } else { dom.liveTimerSection.style.display = 'none'; dom.liveTimerSection.classList.remove('active'); }
    }
}

function checkPasswordMatch() {
    const regPass = document.getElementById('register-password'); const regPassConfirm = document.getElementById('register-password-confirm');
    if (!regPass || !regPassConfirm) return; 
    const passValue = regPass.value; const confirmValue = regPassConfirm.value;
    if (passValue === "" && confirmValue === "") { regPass.classList.remove('input-valid', 'input-invalid'); regPassConfirm.classList.remove('input-valid', 'input-invalid'); return; }
    if (passValue === confirmValue) { regPass.classList.add('input-valid'); regPass.classList.remove('input-invalid'); regPassConfirm.classList.add('input-valid'); regPassConfirm.classList.remove('input-invalid'); } 
    else { regPass.classList.add('input-invalid'); regPass.classList.remove('input-valid'); regPassConfirm.classList.add('input-invalid'); regPassConfirm.classList.remove('input-valid'); }
}

function checkInviteCode() { 
    // UI Logik für das Dropdown-Anzeigen (erst ab 8 Zeichen)
    const inviteCodeField = document.getElementById('register-invite-code');
    const parteiWrapper = document.getElementById('partei-selection-wrapper');
    if (!inviteCodeField || !parteiWrapper) return;
    if (inviteCodeField.value.trim().length >= 8) {
        parteiWrapper.classList.remove('hidden');
    } else {
        parteiWrapper.classList.add('hidden');
    }
}

document.getElementById("register-btn").addEventListener("click", handleRegister);
document.getElementById("login-btn").addEventListener("click", handleLogin);
document.getElementById('show-register').addEventListener('click', () => {
    const regPass = document.getElementById('register-password'); const regPassConfirm = document.getElementById('register-password-confirm'); const inviteCodeField = document.getElementById('register-invite-code');
    if (regPass) { regPass.value = ''; regPass.classList.remove('input-valid', 'input-invalid'); regPass.addEventListener('input', checkPasswordMatch); }
    if (regPassConfirm) { regPassConfirm.value = ''; regPassConfirm.classList.remove('input-valid', 'input-invalid'); regPassConfirm.addEventListener('input', checkPasswordMatch); }
    if (inviteCodeField) { inviteCodeField.value = ''; inviteCodeField.addEventListener('input', checkInviteCode); }
    navigateTo(dom.registerForm);
});
document.getElementById('show-login').addEventListener('click', () => navigateTo(dom.loginForm));
document.getElementById('login-password').addEventListener('keyup', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('login-btn').click(); } });
document.getElementById('show-reset-password').addEventListener('click', () => { navigateTo(dom.resetPasswordForm); document.getElementById('reset-email').value = ''; });
document.getElementById('back-to-login-btn').addEventListener('click', () => navigateTo(dom.loginForm, 'back'));
document.getElementById('reset-password-btn').addEventListener('click', handlePasswordReset);
document.getElementById('back-to-login-from-verify-btn').addEventListener('click', () => navigateTo(dom.loginForm, 'back'));
document.getElementById('logout-btn').addEventListener('click', handleLogout);
dom.themeIcon.addEventListener('click', () => { const newTheme = getState().currentTheme === 'light' ? 'dark' : 'light'; setTheme(newTheme, true); });
document.getElementById('refresh-app-btn').addEventListener('click', () => { const btn = document.getElementById('refresh-app-btn'); btn.classList.add('fa-spin'); location.reload(true); setTimeout(() => btn.classList.remove('fa-spin'), 1500); });

function setupMainMenuListeners() {
    document.getElementById('book-btn').addEventListener('click', () => { trackMenuClick('btn_book'); unsubscribeForNavigation(); dom.bookingDateInput.value = getFormattedDate(tomorrow); dom.dateValidationMessage.textContent = ''; dom.bookingSlotSelect.value = ''; navigateTo(dom.bookingSection); dom.bookingDateInput.dispatchEvent(new Event('change')); });
    document.getElementById('overview-btn').addEventListener('click', () => { trackMenuClick('btn_week'); unsubscribeForNavigation(); setupWeekDropdown(); loadBookingsForWeek(dom.kwSelect.value, setUnsubscriber); navigateTo(dom.overviewSection); });
    document.getElementById('calendar-btn').addEventListener('click', () => { trackMenuClick('btn_calendar'); unsubscribeForNavigation(); dom.calendarDayActions.style.display = 'none'; setSelectedCalendarDate(null); const now = new Date(); loadBookingsForMonth(now.getFullYear(), now.getMonth(), setUnsubscriber); navigateTo(dom.calendarSection); });
    document.getElementById('admin-btn').addEventListener('click', () => { unsubscribeForNavigation(); loadAdminUserData(); navigateTo(dom.adminSection); });
    document.getElementById('profile-btn').addEventListener('click', () => { unsubscribeForNavigation(); loadProfileData(); navigateTo(dom.profileSection); });
    const minigameBtn = document.getElementById('minigame-btn'); if (minigameBtn) { minigameBtn.addEventListener('click', () => { trackMenuClick('btn_minigame'); unsubscribeForNavigation(); initMinigame(); navigateTo(dom.minigameSection); }); }
    const backGameBtn = document.getElementById('back-to-menu-btn-game'); if (backGameBtn) { backGameBtn.addEventListener('click', () => navigateTo(dom.mainMenu, 'back')); }
    const reportBtn = document.getElementById('report-issue-btn'); if (reportBtn) { reportBtn.addEventListener('click', () => { const maintSec = document.getElementById('maintenanceSection'); if (maintSec) navigateTo(maintSec); }); }
    const maintBackBtn = document.getElementById('back-to-menu-btn-maint'); if (maintBackBtn) maintBackBtn.addEventListener('click', () => navigateTo(dom.mainMenu, 'back'));
    const submitMaintBtn = document.getElementById('submit-maintenance-btn'); if (submitMaintBtn) { submitMaintBtn.addEventListener('click', async () => { const reason = document.getElementById('maintenance-reason').value; const details = document.getElementById('maintenance-details').value; submitMaintBtn.disabled = true; try { await reportIssue(reason, details); showMessage('maintenance-message', 'Problem gemeldet! Der Admin wurde benachrichtigt.', 'success'); setTimeout(() => navigateTo(dom.mainMenu, 'back'), 2000); } catch(e) { showMessage('maintenance-message', 'Fehler beim Senden.', 'error'); } finally { submitMaintBtn.disabled = false; } }); }
}

document.getElementById('back-to-menu-btn-1').addEventListener('click', () => navigateTo(dom.mainMenu, 'back'));
dom.bookSubmitBtn.addEventListener("click", async () => { const date = dom.bookingDateInput.value; const slot = dom.bookingSlotSelect.value; const button = dom.bookSubmitBtn; const bookText = document.getElementById("book-text"); const bookIcon = document.getElementById("book-success-icon"); const originalText = "Buchen"; button.disabled = true; if (bookText) bookText.textContent = "Buche..."; if (bookIcon) bookIcon.style.display = 'none'; let success = false; try { success = await performBooking(date, slot, 'booking-error'); } catch (e) { console.error(e); showMessage('booking-error', 'Ein unerwarteter Fehler ist aufgetreten.', 'error'); success = false; } finally { if (success) { button.classList.add('booking-success'); if(bookText) bookText.style.display = 'none'; if(bookIcon) bookIcon.style.display = 'block'; setTimeout(() => { button.classList.remove('booking-success'); if(bookIcon) bookIcon.style.display = 'none'; if(bookText) { bookText.style.display = 'block'; bookText.textContent = originalText; } button.disabled = false; dom.bookingDateInput.dispatchEvent(new Event('change')); }, 2000); } else { if(bookText) bookText.textContent = originalText; button.disabled = false; } } });
dom.bookingDateInput.addEventListener('change', async () => { const selectedDateStr = dom.bookingDateInput.value; const selectedDate = new Date(selectedDateStr); selectedDate.setHours(0, 0, 0, 0); const isPast = selectedDate < today; dom.dateValidationMessage.textContent = isPast ? 'Buchungen können nicht für vergangene Tage vorgenommen werden.' : ''; if (isPast) { updateSlotDropdownUI({ "07:00-13:00": { status: 'disabled-duplicate', text: '07:00 - 13:00' }, "13:00-19:00": { status: 'disabled-duplicate', text: '13:00 - 19:00' } }); return; } try { const options = dom.bookingSlotSelect.querySelectorAll('option'); options.forEach(opt => { if (opt.value) { opt.textContent = `${opt.value} (Prüfe...)`; opt.disabled = true; } }); const availability = await checkSlotAvailability(selectedDateStr); if (availability) { updateSlotDropdownUI(availability); } } catch (e) { console.error(e); showMessage('booking-error', 'Fehler beim Prüfen der Verfügbarkeit.', 'error'); } });
dom.bookingDateInput.setAttribute('min', getFormattedDate(today)); dom.bookingDateInput.value = getFormattedDate(tomorrow);
document.getElementById('confirm-cancel').addEventListener('click', hideConfirmation);
dom.cancelDeleteAccountBtn.addEventListener('click', () => { dom.deleteAccountModal.style.display = 'none'; dom.deleteAccountPasswordInput.value = ''; showMessage('delete-account-message', '', 'error'); });
dom.confirmDeleteAccountBtn.addEventListener('click', async () => { const password = dom.deleteAccountPasswordInput.value; await handleDeleteAccount(password); });
dom.changelogCloseBtn.addEventListener('click', () => { dom.changelogModal.style.display = 'none'; localStorage.setItem('waschplan_version', APP_VERSION); });
function checkAppVersion() { const seenVersion = localStorage.getItem('waschplan_version'); if (seenVersion !== APP_VERSION) { showChangelog(); } }

initCalendarView(setUnsubscriber);
initOverviewView(setUnsubscriber);
initProfileView();
initStatsView();
initAdminView();