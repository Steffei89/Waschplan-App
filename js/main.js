// Firebase
import { auth, onAuthStateChanged, getDoc, getUserProfileDocRef, deleteDoc, doc, getSwapRequestsCollectionRef } from './firebase.js';

// DOM & State
import * as dom from './dom.js';
import { getState, setCurrentUser, setUnsubscriber, setSelectedCalendarDate } from './state.js';

// Utils & UI
import { getFormattedDate, today, tomorrow } from './utils.js';
import { showMessage, navigateTo, updateUserInfo, setTheme, unsubscribeAll, hideConfirmation, updateSlotDropdownUI } from './ui.js';

// Services
import { handleRegister, handleLogin, handleLogout } from './services/auth.js';
import { loadWeather } from './services/weather.js';
import { loadStatistics } from './services/stats.js';
import { performBooking, performDeletion, loadNextBookingsOverview, checkSlotAvailability } from './services/booking.js';
import { 
    loadIncomingRequests, 
    loadOutgoingRequestStatus, 
    loadOutgoingRequestSuccess,
    confirmSwapTransaction, 
    rejectSwapRequest,
    dismissRequestNotification
} from './services/swap.js';

// Views
import { initCalendarView, loadBookingsForMonth } from './views/calendar.js';
import { initOverviewView, setupWeekDropdown, loadBookingsForWeek } from './views/overview.js';
import { initProfileView, loadProfileData } from './views/profile.js';

// --- 1. AUTHENTIFIZIERUNGS-FLOW (Der "Motor" der App) ---

onAuthStateChanged(auth, async (user) => {
    dom.loadingOverlay.style.display = 'none';
    dom.appContainer.style.display = 'block';
    
    if (user) { 
        try {
            const userDocSnap = await getDoc(getUserProfileDocRef(user.uid));
            
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                setCurrentUser({ uid: user.uid, ...user, userData });
                
                updateUserInfo(userData);
                setupMainMenuListeners();
                loadWeather(); 
                dom.weatherWidget.style.display = 'flex'; 
                navigateTo(dom.mainMenu);
                
                handleLoadNextBookings();
                handleLoadIncomingRequests();
                handleLoadOutgoingRequests();
                handleLoadOutgoingSuccess();

            } else {
                await handleLogout(); 
            }
        } catch (e) {
            console.error("Auth-Fehler:", e);
            await handleLogout();
        }
    } else {
        unsubscribeAll();
        setCurrentUser(null);
        updateUserInfo(null);
        dom.weatherWidget.style.display = 'none'; 
        navigateTo(dom.loginForm);
    }
});

// --- 2. DATENLADE-HANDLER (fürs Hauptmenü) ---

function handleLoadNextBookings() {
    dom.myBookingsList.innerHTML = '<p class="small-text">Lade die nächsten Buchungen...</p>';
    const unsub = loadNextBookingsOverview(
        (bookings, currentUser, userIsAdmin) => {
            dom.myBookingsList.innerHTML = '';
            if (bookings.length === 0) {
                dom.myBookingsList.innerHTML = `<p class="small-text">Keine kommenden Buchungen gefunden.</p>`;
                return;
            }
            bookings.forEach(booking => {
                const formattedDate = new Date(booking.date + "T00:00:00").toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
                const isMyParteiBooking = booking.partei === currentUser.userData.partei;
                const item = document.createElement('div');
                item.className = 'my-booking-item';
                item.innerHTML = `
                    <div class="booking-details">
                        <strong>${formattedDate}</strong> (${booking.slot})
                        <span class="small-text ml-10">${booking.partei}</span>
                    </div>
                    <div class="booking-actions">
                        ${isMyParteiBooking || userIsAdmin ? 
                            `<button class="button-small button-danger delete-my-booking-btn" 
                                data-date="${booking.date}" data-slot="${booking.slot}">Löschen</button>` : ''}
                    </div>
                `;
                dom.myBookingsList.appendChild(item);
            });
            attachQuickViewDeleteListeners();
        },
        (error) => {
            dom.myBookingsList.innerHTML = `<p class="small-text" style="color: var(--error-color);">Fehler beim Laden.</p>`;
        }
    );
    setUnsubscriber('quickView', unsub);
}

function handleLoadIncomingRequests() {
    dom.incomingRequestsContainer.innerHTML = '<p class="small-text">Lade Tauschanfragen...</p>';
    dom.incomingRequestsContainer.style.display = 'none';

    const unsub = loadIncomingRequests(
        (pendingRequests) => {
            dom.incomingRequestsContainer.innerHTML = '';
            if (pendingRequests.length === 0) {
                dom.incomingRequestsContainer.style.display = 'none'; 
                return;
            }
            dom.incomingRequestsContainer.style.display = 'block'; 
            dom.incomingRequestsContainer.innerHTML = `<h3 class="request-item-header">Eingehende Tauschanfragen (${pendingRequests.length})</h3>`;
            
            pendingRequests.forEach(req => {
                const dateStr = new Date(req.targetDate + "T00:00:00").toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                const item = document.createElement('div');
                item.className = 'request-item';
                item.innerHTML = `
                    <div class="request-details">
                        <strong>${dateStr} (${req.targetSlot})</strong>
                        <span class="small-text ml-10">von: ${req.requesterPartei}</span>
                    </div>
                    <div class="request-actions">
                        <button type="button" class="button-small button-success accept-swap-btn" data-req-id="${req.id}">Annehmen</button>
                        <button type="button" class="button-small button-secondary reject-swap-btn" data-req-id="${req.id}">Ablehnen</button>
                    </div>
                `;
                dom.incomingRequestsContainer.appendChild(item);
            });
            attachSwapRequestListeners();
        },
        (error) => {
            console.error("Fehler Tauschanfragen:", error);
            dom.incomingRequestsContainer.style.display = 'block'; 
            dom.incomingRequestsContainer.innerHTML = '<p class="message-box error">Fehler beim Laden der Anfragen.</p>';
        }
    );
    setUnsubscriber('requests', unsub);
}

function handleLoadOutgoingRequests() {
    dom.outgoingRequestsStatusContainer.innerHTML = '';
    dom.outgoingRequestsStatusContainer.style.display = 'none';

    const unsub = loadOutgoingRequestStatus(
        (rejectedRequests) => {
            dom.outgoingRequestsStatusContainer.innerHTML = '';
            if (rejectedRequests.length === 0) {
                dom.outgoingRequestsStatusContainer.style.display = 'none';
                return;
            }
            dom.outgoingRequestsStatusContainer.style.display = 'block';
            dom.outgoingRequestsStatusContainer.innerHTML = `<h3 class="request-item-header" style="color: var(--error-color);">Abgelehnte Anfragen (${rejectedRequests.length})</h3>`;

            rejectedRequests.forEach(req => {
                const dateStr = new Date(req.targetDate + "T00:00:00").toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                const item = document.createElement('div');
                item.className = 'request-item rejected'; 
                item.innerHTML = `
                    <div class="request-details">
                        <strong>${dateStr} (${req.targetSlot})</strong>
                        <span class="small-text ml-10">Anfrage an ${req.targetPartei} wurde abgelehnt.</span>
                    </div>
                    <div class="request-actions">
                        <button type="button" class="button-small button-secondary dismiss-notification-btn" data-req-id="${req.id}">OK</button>
                    </div>
                `;
                dom.outgoingRequestsStatusContainer.appendChild(item);
            });
            attachRequestNotificationListeners(); 
        },
        (error) => {
             console.error("Fehler ausgehende Anfragen:", error);
        }
    );
    setUnsubscriber('outgoingRequests', unsub);
}

function handleLoadOutgoingSuccess() {
    dom.outgoingRequestsSuccessContainer.innerHTML = '';
    dom.outgoingRequestsSuccessContainer.style.display = 'none';

    const unsub = loadOutgoingRequestSuccess(
        (acceptedRequests) => {
            dom.outgoingRequestsSuccessContainer.innerHTML = '';
            if (acceptedRequests.length === 0) {
                dom.outgoingRequestsSuccessContainer.style.display = 'none';
                return;
            }
            dom.outgoingRequestsSuccessContainer.style.display = 'block';
            dom.outgoingRequestsSuccessContainer.innerHTML = `<h3 class="request-item-header" style="color: var(--success-color);">Angenommene Anfragen (${acceptedRequests.length})</h3>`;

            acceptedRequests.forEach(req => {
                const dateStr = new Date(req.targetDate + "T00:00:00").toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                const item = document.createElement('div');
                item.className = 'request-item accepted'; 
                item.innerHTML = `
                    <div class="request-details">
                        <strong>${dateStr} (${req.targetSlot})</strong>
                        <span class="small-text ml-10">Tausch mit ${req.targetPartei} war erfolgreich!</span>
                    </div>
                    <div class="request-actions">
                        <button type="button" class="button-small button-secondary dismiss-notification-btn" data-req-id="${req.id}">OK</button>
                    </div>
                `;
                dom.outgoingRequestsSuccessContainer.appendChild(item);
            });
            attachRequestNotificationListeners(); 
        },
        (error) => {
             console.error("Fehler ausgehende Erfolgs-Anfragen:", error);
        }
    );
    setUnsubscriber('outgoingRequestsSuccess', unsub);
}


// --- 3. EVENT LISTENER INITIALISIERUNG ---

// Login / Register
document.getElementById("register-btn").addEventListener("click", handleRegister);
document.getElementById("login-btn").addEventListener("click", handleLogin);
document.getElementById('show-register').addEventListener('click', () => navigateTo(dom.registerForm));
document.getElementById('show-login').addEventListener('click', () => navigateTo(dom.loginForm));
document.getElementById('login-password').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault(); 
        document.getElementById('login-btn').click(); 
    }
});

// Hauptnavigation
document.getElementById('logout-btn').addEventListener('click', handleLogout);
dom.themeIcon.addEventListener('click', () => {
    const newTheme = getState().currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme, true); 
});

document.getElementById('book-btn').addEventListener('click', () => {
    dom.bookingDateInput.value = getFormattedDate(tomorrow);
    dom.dateValidationMessage.textContent = '';
    dom.bookingSlotSelect.value = '';
    navigateTo(dom.bookingSection);
    dom.bookingDateInput.dispatchEvent(new Event('change'));
});

document.getElementById('overview-btn').addEventListener('click', () => {
    unsubscribeAll();
    setupWeekDropdown();
    loadBookingsForWeek(dom.kwSelect.value, setUnsubscriber);
    navigateTo(dom.overviewSection);
});

document.getElementById('calendar-btn').addEventListener('click', () => {
    unsubscribeAll();
    dom.calendarDayActions.style.display = 'none'; 
    setSelectedCalendarDate(null);
    const now = new Date();
    loadBookingsForMonth(now.getFullYear(), now.getMonth(), setUnsubscriber);
    navigateTo(dom.calendarSection);
});

document.getElementById('statistic-btn').addEventListener('click', () => {
    unsubscribeAll();
    loadStatistics();
    navigateTo(dom.statisticSection);
});

document.getElementById('profile-btn').addEventListener('click', () => {
    unsubscribeAll();
    dom.adminSettingsSection.style.display = getState().userIsAdmin ? 'block' : 'none';
    loadProfileData(); 
    navigateTo(dom.profileSection);
});

// Zurück-Buttons
document.getElementById('back-to-menu-btn-1').addEventListener('click', () => navigateTo(dom.mainMenu));
document.getElementById('back-to-menu-btn-2').addEventListener('click', () => navigateTo(dom.mainMenu));
document.getElementById('back-to-menu-btn-3').addEventListener('click', () => navigateTo(dom.mainMenu));
document.getElementById('back-to-menu-btn-4').addEventListener('click', () => navigateTo(dom.mainMenu));
document.getElementById('back-to-menu-btn-5').addEventListener('click', () => navigateTo(dom.mainMenu));

// Buchungs-Formular
dom.bookSubmitBtn.addEventListener("click", async () => {
    const date = dom.bookingDateInput.value;
    const slot = dom.bookingSlotSelect.value;
    await performBooking(date, slot, 'booking-error', dom.bookSubmitBtn);
});

dom.bookingDateInput.addEventListener('change', async () => { 
    const selectedDateStr = dom.bookingDateInput.value;
    const selectedDate = new Date(selectedDateStr);
    selectedDate.setHours(0, 0, 0, 0); 
    
    const isPast = selectedDate < today;
    dom.dateValidationMessage.textContent = isPast ? 'Buchungen können nicht für vergangene Tage vorgenommen werden.' : '';

    if (isPast) {
        updateSlotDropdownUI({
            "07:00-13:00": { status: 'disabled-duplicate', text: '07:00 - 13:00' },
            "13:00-19:00": { status: 'disabled-duplicate', text: '13:00 - 19:00' }
        });
        return;
    }
    
    try {
        const options = dom.bookingSlotSelect.querySelectorAll('option');
        options.forEach(opt => {
            if (opt.value) {
                opt.textContent = `${opt.value} (Prüfe...)`;
                opt.disabled = true;
            }
        });
        
        const availability = await checkSlotAvailability(selectedDateStr);
        
        if (availability) {
            updateSlotDropdownUI(availability);
        }
    } catch (e) {
        console.error("Fehler bei der Slot-Prüfung:", e);
        showMessage('booking-error', 'Fehler beim Prüfen der Verfügbarkeit.', 'error');
    }
});

dom.bookingDateInput.setAttribute('min', getFormattedDate(today));
dom.bookingDateInput.value = getFormattedDate(tomorrow);

// Modal-Buttons
document.getElementById('confirm-cancel').addEventListener('click', hideConfirmation);

// Dynamische Listener für Tauschanfragen (im Hauptmenü)
function attachSwapRequestListeners() {
    document.querySelectorAll('.accept-swap-btn').forEach(btn => {
        if (btn.onclick) return;
        btn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            const requestId = e.target.dataset.reqId;
            e.target.disabled = true;
            e.target.textContent = 'Prüfe...';
            confirmSwapTransaction(requestId);
        };
    });
    
    document.querySelectorAll('.reject-swap-btn').forEach(btn => {
        if (btn.onclick) return;
        btn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            const requestId = e.target.dataset.reqId;
            e.target.disabled = true;
            e.target.textContent = '...';
            rejectSwapRequest(requestId);
        };
    });
}

// --- KORRIGIERTER FUNKTIONSNAME ---
// (von attachDismissButtonListeners zu attachRequestNotificationListeners)
function attachRequestNotificationListeners() {
    document.querySelectorAll('.dismiss-notification-btn').forEach(btn => {
        if (btn.onclick) return;
        
        btn.onclick = async (e) => {
            e.preventDefault(); e.stopPropagation();
            e.target.disabled = true;
            await dismissRequestNotification(e.target.dataset.reqId);
        };
    });
}
// --- ENDE KORREKTUR ---

// Dynamische Listener für QuickView-Löschen
function attachQuickViewDeleteListeners() {
    document.querySelectorAll('.delete-my-booking-btn').forEach(btn => {
        if (btn.onclick) return;
        btn.onclick = async (e) => {
            const { date, slot } = e.target.dataset;
            if (!date || !slot) return;
            e.target.disabled = true;
            e.target.textContent = 'Lösche...';
            await performDeletion(date, slot, 'my-upcoming-bookings');
        };
    });
}


// Initialisiere die View-spezifischen Listener
function setupMainMenuListeners() {
}

initCalendarView(setUnsubscriber);
initOverviewView(setUnsubscriber);
initProfileView();