// Firebase SDK Module Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    updatePassword 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    collection, 
    getDocs, 
    query, 
    where, 
    getDoc, 
    onSnapshot, 
    addDoc, 
    deleteDoc,
    updateDoc, 
    orderBy, 
    limit,
    runTransaction 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- 1. FIREBASE KONFIGURATION (Ihre Daten) ---
const firebaseConfig = {
    apiKey: "AIzaSyCvKdQa7No5TMehgIBS9Nh34kg8EqFJap0",
    authDomain: "waschplanapp.firebaseapp.com",
    projectId: "waschplanapp",
    storageBucket: "waschplanapp.firerostorage.app",
    messagingSenderId: "326700527135",
    appId: "1:326700527135:web:4b0c1d5e287d6ae1932f2a"
};

// --- 2. FIREBASE INITIALISIERUNG ---
let app;
let auth;
let db;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Firebase Initialisierungsfehler:", e);
    const loadingOverlay = document.getElementById("loadingOverlay");
    if (loadingOverlay) {
        loadingOverlay.innerHTML = `
            <div class="message-box error" style="width: 80%; padding: 20px;">
                <h2>Initialisierungsfehler</h2>
                <p>Konfigurationsfehler: ${e.message}</p>
            </div>
        `;
    }
    throw e; 
}


// --- 3. DOM ELEMENTE & ZUSTAND ---
let currentUser = null; 
let currentUserId = null;
let userIsAdmin = false;
let overviewUnsubscribe = null; 
let calendarUnsubscribe = null;
let quickViewUnsubscribe = null;
let requestsUnsubscribe = null; 
let outgoingRequestsUnsubscribe = null;
let bookingToDelete = null; 
let currentCalendarDate = new Date(); 
let currentTheme = 'light'; 
let selectedCalendarDate = null; 
let allBookingsForMonth = {}; 
let parteiChart = null;
let slotChart = null; 

const loadingOverlay = document.getElementById("loadingOverlay");
const appContainer = document.getElementById("app");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const mainMenu = document.getElementById("mainMenu");
const bookingSection = document.getElementById("bookingSection");
const overviewSection = document.getElementById("overviewSection");
const calendarSection = document.getElementById("calendarSection"); 
const profileSection = document.getElementById("profileSection");
const statisticSection = document.getElementById("statisticSection");
const statisticBtn = document.getElementById("statistic-btn");

const bookingsList = document.getElementById("bookingsList");
const userInfo = document.getElementById("userInfo");
const incomingRequestsContainer = document.getElementById("incomingRequestsContainer"); 
const outgoingRequestsStatusContainer = document.getElementById("outgoingRequestsStatusContainer");
const themeIcon = document.getElementById("theme-icon"); 
const calendarGrid = document.getElementById("calendar-grid");
const currentMonthDisplay = document.getElementById("current-month-display");
const calendarDayActions = document.getElementById("calendar-day-actions");
const selectedDayTitle = document.getElementById("selected-day-title");
const calendarActionMessage = document.getElementById("calendar-action-message");

const bookingDateInput = document.getElementById('booking-date');
const dateValidationMessage = document.getElementById('date-validation-message');


// Farbzuweisung für Parteien
const PARTEI_COLORS = {
    "Micha & Stefan": "#007AFF", 
    "Sarah & Florian": "#FF9500", 
    "Christa & Uli": "#34C759", 
};
const ALL_PARTEIEN = Object.keys(PARTEI_COLORS);


// --- DATUMSVORAUSWAHL UND VALIDIERUNG LOGIK ---
function getFormattedDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const today = new Date();
today.setHours(0, 0, 0, 0); 
const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1); 

if (bookingDateInput) {
    bookingDateInput.setAttribute('min', getFormattedDate(today));
    bookingDateInput.value = getFormattedDate(tomorrow);
}

if (bookingDateInput) {
    bookingDateInput.addEventListener('change', () => {
        const selectedDate = new Date(bookingDateInput.value);
        selectedDate.setHours(0, 0, 0, 0); 
        
        if (selectedDate < today) {
            dateValidationMessage.textContent = 'Buchungen können nicht für vergangene Tage vorgenommen werden.';
        } else {
            dateValidationMessage.textContent = '';
        }
    });
}

// --- 4. HILFSFUNKTIONEN ---

function showMessage(elementId, message, type = 'error', duration = 5000) {
    const el = document.getElementById(elementId);
    if (!el) {
        // Fallback, wenn die ID im Hauptmenü nicht gefunden wird (z.B. bei Kalender-Nachricht)
        const fallbackEl = document.getElementById('mainMenu'); 
        if (fallbackEl) {
            // Erzeuge eine temporäre Message-Box im Hauptmenü
            const tempMsg = document.createElement('div');
            tempMsg.className = `message-box ${type}`;
            tempMsg.textContent = message;
            tempMsg.style.display = 'block';
            fallbackEl.prepend(tempMsg); // Füge sie oben im Hauptmenü ein
            
            setTimeout(() => {
                tempMsg.style.display = 'none';
                tempMsg.remove();
            }, duration);
        }
        return;
    }

    el.textContent = message;
    el.className = `message-box ${type}`;
    el.style.display = 'block';
    
    setTimeout(() => {
        if (el) el.style.display = 'none';
    }, duration);
}

function showConfirmation(booking) {
    bookingToDelete = booking;
    const dateStr = new Date(booking.date + "T00:00:00").toLocaleDateString('de-DE');
    confirmText.innerHTML = `Soll die Buchung von <strong>${booking.partei}</strong> am ${dateStr} (${booking.slot}) wirklich gelöscht werden?`;
    confirmationModal.style.display = 'flex';
}

function hideConfirmation() {
    bookingToDelete = null;
    confirmationModal.style.display = 'none';
}

function getBookingsCollectionRef() {
    return collection(db, "bookings");
}

function getUserProfileDocRef(uid) {
    return doc(db, "users", uid);
}

function getSwapRequestsCollectionRef() {
    return collection(db, "swap_requests");
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

function getMonday(year, week) {
    const date = new Date(year, 0, 1 + (week - 1) * 7);
    const startOfWeek = new Date(date);
    startOfWeek.setDate(startOfWeek.getDate() - (startOfWeek.getDay() || 7) + 1); 
    return startOfWeek;
}

function formatDate(date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) 
        month = '0' + month;
    if (day.length < 2) 
        day = '0' + day;

    return [year, month, day].join('-');
}

function setupWeekDropdown() {
    const selectEl = document.getElementById("kw-select");
    selectEl.innerHTML = '';
    const numWeeks = 5;
    let current = new Date();

    for (let i = 0; i < numWeeks; i++) {
        const year = current.getFullYear();
        const week = getWeekNumber(current);

        const monday = getMonday(year, week);
        const readableDate = monday.toLocaleDateString('de-DE', { month: 'short', day: '2-digit' });

        const optionValue = `${year}-W${String(week).padStart(2, '0')}`;
        const optionText = `KW ${String(week).padStart(2, '0')} (${readableDate})`;
        
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionText;
        if (i === 0) {
            option.selected = true;
        }
        selectEl.appendChild(option);
        current.setDate(current.getDate() + 7);
    }
    if (selectEl.value) {
        loadBookings(selectEl.value);
    }
}

// --- THEME FUNKTIONEN ---

function setTheme(theme) {
    currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    
    if (themeIcon) {
        if (theme === 'dark') {
            themeIcon.className = 'fa-solid fa-moon clickable';
            themeIcon.title = 'Zum Hell-Modus wechseln';
        } else {
            themeIcon.className = 'fa-solid fa-sun clickable';
            themeIcon.title = 'Zum Dunkel-Modus wechseln';
        }
    }
    if (document.getElementById('statisticSection').style.display === 'block') {
        loadStatistics(true); 
    }
}

async function saveThemePreference() {
    if (!currentUserId) return;
    try {
        await updateDoc(getUserProfileDocRef(currentUserId), {
            theme: currentTheme
        });
    } catch (e) {
        console.error("Fehler beim Speichern der Theme-Präferenz:", e);
    }
}

// --- 5. HAUPT-ROUTING UND UI-FUNKTIONEN ---

function unsubscribeAll() {
    if (overviewUnsubscribe) { overviewUnsubscribe(); overviewUnsubscribe = null; }
    if (calendarUnsubscribe) { calendarUnsubscribe(); calendarUnsubscribe = null; }
    if (quickViewUnsubscribe) { quickViewUnsubscribe(); quickViewUnsubscribe = null; }
    if (requestsUnsubscribe) { requestsUnsubscribe(); requestsUnsubscribe = null; }
    if (outgoingRequestsUnsubscribe) { outgoingRequestsUnsubscribe(); outgoingRequestsUnsubscribe = null; }
}

function navigateTo(section) {
    const sections = [
        loginForm, registerForm, mainMenu, bookingSection, 
        overviewSection, calendarSection, profileSection, statisticSection, 
        incomingRequestsContainer, outgoingRequestsStatusContainer
    ];
    
    sections.forEach(el => {
        if (el) { 
            el.style.display = 'none';
            el.classList.remove('active');
        } 
    });
    
    document.querySelectorAll('.message-box').forEach(el => el.style.display = 'none');
    
    if (section !== 'overviewSection' && section !== 'calendarSection') {
        unsubscribeAll(); 
    }
    
    userInfo.style.display = (currentUser && section !== 'loginForm' && section !== 'registerForm') ? 'flex' : 'none';


    const targetElement = document.getElementById(section);
    if(targetElement) {
        targetElement.style.display = 'block';
        setTimeout(() => targetElement.classList.add('active'), 50); 
        
        if (section === 'loginForm') {
            document.getElementById('login-identifier').focus();
        } else if (section === 'registerForm') {
            document.getElementById('register-username').focus();
        } else if (section === 'mainMenu') {
            loadNextBookingsOverview(); 
            loadIncomingRequests();
            loadOutgoingRequestStatus();
        } else if (section === 'calendarSection') {
            renderCalendar(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
            loadBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
        } else if (section === 'statisticSection') {
            loadStatistics();
        } else if (section === 'bookingSection') {
            if (bookingDateInput) {
                bookingDateInput.value = getFormattedDate(tomorrow);
                dateValidationMessage.textContent = '';
            }
        } 
    }
}

function updateUserInfo(userData) {
    if (userData) {
        document.getElementById('current-username').textContent = userData.username || 'Unbekannt';
        userIsAdmin = !!userData.isAdmin;
        document.getElementById('current-role').textContent = userIsAdmin ? 'Administrator' : 'Nutzer';
        statisticBtn.style.display = userIsAdmin ? 'block' : 'none';
        const userTheme = userData.theme || 'light';
        setTheme(userTheme);
    } else {
        userIsAdmin = false;
        statisticBtn.style.display = 'none'; 
        setTheme('light'); 
    }
}

// --- 6. AUTHENTIFIZIERUNGS-FLOW ---

onAuthStateChanged(auth, async (user) => {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';
    
    const weatherWidget = document.getElementById('weather-widget');
    
    if (user) { 
        currentUserId = user.uid;
        try {
            const userDocSnap = await getDoc(getUserProfileDocRef(currentUserId));
            
            if (userDocSnap.exists()) {
                currentUser = userDocSnap.data(); 
                updateUserInfo(currentUser);
                loadIncomingRequests();
                loadOutgoingRequestStatus(); 
                loadWeather(); 
                if (weatherWidget) weatherWidget.style.display = 'flex'; 
                navigateTo('mainMenu');
            } else {
                await signOut(auth); 
            }
        } catch (e) {
            await signOut(auth);
        }
    } else {
        unsubscribeAll();
        if (requestsUnsubscribe) { 
            requestsUnsubscribe(); 
            requestsUnsubscribe = null;
        }
        if (outgoingRequestsUnsubscribe) { 
            outgoingRequestsUnsubscribe(); 
            outgoingRequestsUnsubscribe = null;
        }
        
        if (weatherWidget) weatherWidget.style.display = 'none'; 

        currentUser = null;
        currentUserId = null;
        updateUserInfo(null);
        navigateTo('loginForm');
    }
});

// --- 7. REGISTRIERUNG & LOGIN ---
document.getElementById("register-btn").addEventListener("click", async () => {
    const username = document.getElementById("register-username").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const partei = document.getElementById("register-partei").value;

    if(!username || !email || !password || !partei){
        showMessage('register-error', "Bitte alle Felder ausfüllen!");
        return;
    }
    if (password.length < 6) {
        showMessage('register-error', "Passwort muss mind. 6 Zeichen lang sein!");
        return;
    }

    try {
        const usersCol = collection(db, "users");
        const qUsername = query(usersCol, where("username", "==", username));
        const usernameSnap = await getDocs(qUsername);
        if (!usernameSnap.empty) {
            showMessage('register-error', "Benutzername ist bereits vergeben!");
            return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        
        await setDoc(getUserProfileDocRef(uid), {
            username: username,
            email: email,
            partei: partei,
            isAdmin: false,
            theme: 'light' 
        });

        showMessage('register-error', "Registrierung erfolgreich! Bitte melden Sie sich an.", 'success');
        navigateTo('loginForm');
        document.getElementById("login-identifier").value = email;
        document.getElementById("login-password").value = '';
    } catch (err) {
        let errorMessage = `Registrierungsfehler: ${err.message}`;
        if (err.code === 'auth/email-already-in-use') {
            errorMessage = 'Diese E-Mail-Adresse ist bereits registriert.';
        }
        showMessage('register-error', errorMessage);
    }
});

document.getElementById("login-btn").addEventListener("click", async () => {
    const identifier = document.getElementById("login-identifier").value.trim();
    const password = document.getElementById("login-password").value;

    if(!identifier || !password){
        showMessage('login-error', "Bitte alle Felder ausfüllen!");
        return;
    }

    let loginEmail = identifier;
    
    try {
        const isEmail = identifier.includes('@');

        if (!isEmail) {
            const usersCol = collection(db, "users");
            const q = query(usersCol, where("username", "==", identifier));
            const querySnapshot = await getDocs(q);

            if(querySnapshot.empty){
                showMessage('login-error', "Login fehlgeschlagen: Benutzername/E-Mail oder Passwort ist falsch.");
                return;
            }
            
            const userData = querySnapshot.docs[0].data();
            loginEmail = userData.email;
        }
        
        await signInWithEmailAndPassword(auth, loginEmail, password);

    } catch (err) {
        showMessage('login-error', "Login fehlgeschlagen: Benutzername/E-Mail oder Passwort ist falsch.");
    }
});
        
// --- DOPPELBUCHUNG PRÜFEN ---
async function checkDuplicateBooking(selectedDate, partei) {
    const q = query(
        getBookingsCollectionRef(),
        where('date', '==', selectedDate),
        where('partei', '==', partei)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}


// --- NEU: TAUSCHANFRAGE LOGIK ---

async function handleSwapRequest(targetBooking, messageElementId) {
    if (!currentUser) return;

    if (!targetBooking || !targetBooking.id) {
         showMessage(messageElementId, "Fehler: Ungültiges Buchungsziel.", 'error');
         console.error("handleSwapRequest: targetBooking.id ist undefined", targetBooking);
         return;
    }

    try {
        const q = query(
            getSwapRequestsCollectionRef(),
            where("targetBookingId", "==", targetBooking.id),
            where("requesterPartei", "==", currentUser.partei)
        );
        const existingRequests = await getDocs(q);
        
        let alreadySent = false;
        existingRequests.forEach(doc => {
            const data = doc.data();
            if (data.status === 'pending' || typeof data.status === 'undefined') {
                alreadySent = true;
            }
        });

        if (alreadySent) {
            showMessage(messageElementId, "Sie haben für diesen Slot bereits eine Anfrage gesendet.", 'error');
            return;
        }

        await addDoc(getSwapRequestsCollectionRef(), {
            targetBookingId: targetBooking.id, 
            targetDate: targetBooking.date, 
            targetSlot: targetBooking.slot,
            targetPartei: targetBooking.partei, 
            
            requesterPartei: currentUser.partei, 
            requesterUserId: currentUserId, 
            requestedAt: new Date().toISOString(),
            status: 'pending' 
        });

        const dateStr = new Date(targetBooking.date + "T00:00:00").toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
        const message = `Tauschanfrage für Slot von "${targetBooking.partei}" am ${dateStr} (${targetBooking.slot}) gesendet!`;
        
        showMessage(messageElementId, message, 'success');
        
    } catch (e) {
        showMessage(messageElementId, `Fehler beim Senden der Tauschanfrage: ${e.message}`, 'error');
        console.error("Fehler in handleSwapRequest:", e, targetBooking);
    }
}

// Zeigt EINGEHENDE Anfragen an (die auf 'pending' stehen)
function loadIncomingRequests() {
    if (requestsUnsubscribe) { requestsUnsubscribe(); } 
    if (!currentUser || !incomingRequestsContainer) { 
        if(incomingRequestsContainer) {
            incomingRequestsContainer.innerHTML = '';
            incomingRequestsContainer.style.display = 'none';
        }
        return;
    }
    
    incomingRequestsContainer.innerHTML = '<p class="small-text">Lade Tauschanfragen...</p>';
    incomingRequestsContainer.style.display = 'none';

    const q = query(
        getSwapRequestsCollectionRef(),
        where("targetPartei", "==", currentUser.partei)
    );
    
    requestsUnsubscribe = onSnapshot(q, (querySnapshot) => {
        if (!incomingRequestsContainer) return;
        incomingRequestsContainer.innerHTML = '';
        
        const allRequests = [];
        querySnapshot.forEach(docSnap => {
            allRequests.push({id: docSnap.id, ...docSnap.data()});
        });

        const pendingRequests = allRequests.filter(r => r.status === 'pending' || typeof r.status === 'undefined');

        if (pendingRequests.length === 0) {
            incomingRequestsContainer.style.display = 'none'; 
            return;
        }

        pendingRequests.sort((a, b) => {
            const dateA = a.requestedAt ? new Date(a.requestedAt) : new Date(0);
            const dateB = b.requestedAt ? new Date(b.requestedAt) : new Date(0);
            return dateB - dateA;
        });

        incomingRequestsContainer.style.display = 'block'; 
        incomingRequestsContainer.innerHTML = `<h3 class="request-item-header">Eingehende Tauschanfragen (${pendingRequests.length})</h3>`;
        
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
                    <button type="button" class="button-small button-success accept-swap-btn" data-req-id="${req.id}">
                        Annehmen
                    </button>
                    <button type="button" class="button-small button-secondary reject-swap-btn" data-req-id="${req.id}">
                        Ablehnen
                    </button>
                </div>
            `;
            
            incomingRequestsContainer.appendChild(item);
        });

        attachSwapRequestListeners();

    }, (error) => {
        console.error("Fehler beim Laden der Tauschanfragen:", error);
        if(incomingRequestsContainer) {
            incomingRequestsContainer.style.display = 'block'; 
            incomingRequestsContainer.innerHTML = '<p class="message-box error">Fehler beim Laden der Anfragen.</p>';
        }
    });
}

// Zeigt dem ANFRAGER den Status seiner Anfragen (z.B. 'rejected')
function loadOutgoingRequestStatus() {
    if (outgoingRequestsUnsubscribe) { outgoingRequestsUnsubscribe(); } 
    if (!currentUser || !outgoingRequestsStatusContainer) return;

    outgoingRequestsStatusContainer.innerHTML = '';
    outgoingRequestsStatusContainer.style.display = 'none';

    const q = query(
        getSwapRequestsCollectionRef(),
        where("requesterPartei", "==", currentUser.partei)
    );

    outgoingRequestsUnsubscribe = onSnapshot(q, (querySnapshot) => {
        if (!outgoingRequestsStatusContainer) return;
        
        const allMyRequests = [];
        querySnapshot.forEach(docSnap => {
            allMyRequests.push({id: docSnap.id, ...docSnap.data()});
        });

        const rejectedRequests = allMyRequests.filter(r => r.status === 'rejected');
        
        if (rejectedRequests.length === 0) {
            outgoingRequestsStatusContainer.innerHTML = '';
            outgoingRequestsStatusContainer.style.display = 'none';
            return;
        }

        outgoingRequestsStatusContainer.style.display = 'block';
        outgoingRequestsStatusContainer.innerHTML = `<h3 class="request-item-header" style="color: var(--error-color);">Abgelehnte Anfragen (${rejectedRequests.length})</h3>`;

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
                    <button type="button" class="button-small button-secondary dismiss-rejection-btn" data-req-id="${req.id}">
                        OK
                    </button>
                </div>
            `;
            outgoingRequestsStatusContainer.appendChild(item);
        });

        attachDismissButtonListeners(); 

    }, (error) => {
        console.error("Fehler beim Laden der ausgehenden Anfragen:", error);
        if (outgoingRequestsStatusContainer) {
            outgoingRequestsStatusContainer.style.display = 'block';
            outgoingRequestsStatusContainer.innerHTML = '<p class="message-box error">Fehler beim Laden der Status-Updates.</p>';
        }
    });
}

// Listener für "OK" bei Ablehnung
function attachDismissButtonListeners() {
    document.querySelectorAll('.dismiss-rejection-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const requestId = e.target.dataset.reqId;
            e.target.disabled = true;
            
            try {
                await deleteDoc(doc(getSwapRequestsCollectionRef(), requestId));
            } catch (err) {
                console.error("Fehler beim Löschen der Benachrichtigung:", err);
                if(e.target.closest('.request-item')) {
                    e.target.closest('.request-item').remove();
                }
            }
        };
    });
}


function attachSwapRequestListeners() {
    document.querySelectorAll('.accept-swap-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault(); 
            e.stopPropagation();
            const requestId = e.target.dataset.reqId;
            e.target.disabled = true;
            e.target.textContent = 'Prüfe...';
            confirmSwapTransaction(requestId);
        };
    });
    
    document.querySelectorAll('.reject-swap-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault(); 
            e.stopPropagation();
            const requestId = e.target.dataset.reqId;
            e.target.disabled = true;
            e.target.textContent = '...';
            rejectSwapRequest(requestId);
        };
    });
}

async function confirmSwapTransaction(requestId) {
    if (!currentUser) return;
    
    const requestRef = doc(getSwapRequestsCollectionRef(), requestId);
    let reqData;
    const messageElementId = 'main-menu-message'; 

    try {
        await runTransaction(db, async (transaction) => {
            const reqDoc = await transaction.get(requestRef);
            if (!reqDoc.exists()) {
                throw new Error("Anfrage existiert nicht mehr.");
            }
            reqData = reqDoc.data();
            
            const bookingRef = doc(getBookingsCollectionRef(), reqData.targetBookingId);
            const bookingDoc = await transaction.get(bookingRef);
            if (!bookingDoc.exists()) {
                transaction.delete(requestRef); 
                throw new Error("Die ursprüngliche Buchung existiert nicht mehr.");
            }

            const duplicateCheck = await checkDuplicateBooking(reqData.targetDate, reqData.requesterPartei);
            
            if (duplicateCheck) {
                transaction.delete(requestRef);
                throw new Error(`Tausch fehlgeschlagen: Partei "${reqData.requesterPartei}" hat an diesem Tag bereits eine Buchung.`);
            }

            transaction.update(bookingRef, {
                partei: reqData.requesterPartei,
                userId: reqData.requesterUserId 
            });
            
            transaction.delete(requestRef);
        });

        showMessage(messageElementId, `Tausch erfolgreich! Slot wurde an "${reqData.requesterPartei}" übergeben.`, 'success');

    } catch (e) {
        console.error("Tausch-Transaktion fehlgeschlagen:", e.message);
        showMessage(messageElementId, e.message, 'error', 7000); 
        loadIncomingRequests(); 
    }
}

// ÄNDERUNG: Setzt Status auf 'rejected' statt zu löschen
async function rejectSwapRequest(requestId) {
    const messageElementId = 'main-menu-message';
    try {
        const requestRef = doc(getSwapRequestsCollectionRef(), requestId);
        await updateDoc(requestRef, {
            status: 'rejected'
        });
        
        showMessage(messageElementId, 'Tauschanfrage abgelehnt.', 'success');
    } catch (e) {
        showMessage(messageElementId, `Fehler beim Ablehnen: ${e.message}`, 'error');
    }
}


// --- 8. BUCHUNGSFUNKTIONEN ---

document.getElementById("book-submit").addEventListener("click", async () => {
    const date = document.getElementById("booking-date").value;
    const slot = document.getElementById("booking-slot").value;
    await performBooking(date, slot, 'booking-error', document.getElementById("book-submit"));
});

async function performBooking(date, slot, messageElementId, buttonElement = null) {
    if (!date || !slot) {
        showMessage(messageElementId, "Datum und Slot müssen ausgewählt werden!", 'error');
        return false;
    }
    if (!currentUser || !currentUserId) {
        showMessage(messageElementId, "Fehler: Sie sind nicht angemeldet.", 'error');
        return false;
    }
    
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
        showMessage(messageElementId, "Buchungen können nicht für vergangene Tage vorgenommen werden.", 'error');
        return false;
    }

    const bookingsColRef = getBookingsCollectionRef();
    
    try {
        const hasDuplicate = await checkDuplicateBooking(date, currentUser.partei);

        if (hasDuplicate) {
            const dateStr = selectedDate.toLocaleDateString('de-DE');
            showMessage(messageElementId, `Fehler: Ihre Partei ("${currentUser.partei}") hat am ${dateStr} bereits einen Slot gebucht.`, 'error');
            return false;
        }

        const q = query(bookingsColRef, where("date", "==", date), where("slot", "==", slot));
        const existingBookings = await getDocs(q);

        if (!existingBookings.empty) {
             showMessage(messageElementId, "Dieser Slot ist bereits belegt!", 'error');
             return false;
        }

        await addDoc(bookingsColRef, {
            date: date,
            slot: slot,
            partei: currentUser.partei, 
            userId: currentUserId, 
            bookedAt: new Date().toISOString(),
            isSwap: false 
        });

        if (buttonElement) {
             const bookText = document.getElementById("book-text"); 
             const bookIcon = document.getElementById("book-success-icon"); 
             buttonElement.classList.add('booking-success');
             if(bookText) bookText.style.display = 'none';
             if(bookIcon) bookIcon.style.display = 'block';

             setTimeout(() => {
                buttonElement.classList.remove('booking-success');
                if(bookText) bookText.style.display = 'block';
                if(bookIcon) bookIcon.style.display = 'none';
             }, 2000);
        }

        showMessage(messageElementId, "Buchung erfolgreich!", 'success');
        
        if (messageElementId === 'booking-error') {
            document.getElementById("booking-slot").value = ''; 
        }

        return true;

    } catch (e) {
        showMessage(messageElementId, `Fehler beim Speichern der Buchung: ${e.message}`, 'error');
        return false;
    }
}

async function performDeletion(date, slot, messageElementId, expectedUserId) {
    if (!date || !slot || !currentUserId || !currentUser) return false;

    const bookingsColRef = getBookingsCollectionRef();
    let q;

    if (userIsAdmin) {
        q = query(
            bookingsColRef, 
            where("date", "==", date), 
            where("slot", "==", slot)
        );
    } else {
        q = query(
            bookingsColRef, 
            where("date", "==", date), 
            where("slot", "==", slot),
            where("partei", "==", currentUser.partei) 
        );
    }
    
    try {
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            showMessage(messageElementId, "Fehler: Die Buchung wurde nicht gefunden oder Sie sind nicht berechtigt.", 'error');
            return false;
        }

        const docToDelete = querySnapshot.docs[0];
        const bookingData = docToDelete.data();

        if (!userIsAdmin && bookingData.partei !== currentUser.partei) {
             showMessage(messageElementId, "Löschung fehlgeschlagen: Nicht berechtigt.", 'error');
             return false;
        }
        
        await deleteDoc(docToDelete.ref);
        
        showMessage(messageElementId, `Buchung von ${bookingData.partei || 'Unbekannt'} erfolgreich gelöscht.`, 'success');
        return true;

    } catch (e) {
        showMessage(messageElementId, `Fehler beim Löschen der Buchung: ${e.message}`, 'error');
        return false;
    }
}


// Globaler Listener für das Löschen (QuickView)
document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-my-booking-btn')) {
        const date = e.target.dataset.date;
        const slot = e.target.dataset.slot;

        if (!currentUserId || !date || !slot) {
            showMessage('my-upcoming-bookings', 'Löschfehler: Ungültige Buchungsdaten.', 'error');
            return;
        }

        e.target.disabled = true;
        e.target.textContent = 'Lösche...';

        const success = await performDeletion(date, slot, 'my-upcoming-bookings', currentUserId);
        
        if (!success) {
            e.target.disabled = false;
            e.target.textContent = 'Löschen';
        }
    }
});


// --- LÄDT DIE NÄCHSTEN 5 GESAMTBUCHUNGEN (für Quick View) ---
async function loadNextBookingsOverview() {
    if (quickViewUnsubscribe) { quickViewUnsubscribe(); }
    
    const myBookingsList = document.getElementById('my-bookings-list');
    myBookingsList.innerHTML = '<p class="small-text">Lade die nächsten Buchungen...</p>';
    
    const todayFormatted = formatDate(new Date());

    const q = query(
        getBookingsCollectionRef(),
        where("date", ">=", todayFormatted), 
        orderBy("date"),
        orderBy("slot"),
        limit(5) 
    );

    quickViewUnsubscribe = onSnapshot(q, (querySnapshot) => {
        myBookingsList.innerHTML = '';
        const bookings = [];
        querySnapshot.forEach(docSnap => bookings.push({id: docSnap.id, ...docSnap.data()}));

        if (bookings.length === 0) {
            myBookingsList.innerHTML = `<p class="small-text">Keine kommenden Buchungen gefunden.</p>`;
            return;
        }
        
        if (!currentUser) return; 

        bookings.forEach(booking => {
            const bookingDate = new Date(booking.date + "T00:00:00");
            const formattedDate = bookingDate.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
            
            const isMyParteiBooking = booking.partei === currentUser.partei;
            
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
                            data-id="${booking.id}" 
                            data-date="${booking.date}" 
                            data-slot="${booking.slot}">
                            Löschen
                        </button>` : ''}
                </div>
            `;
            myBookingsList.appendChild(item);
        });
    }, (error) => {
        myBookingsList.innerHTML = `<p class="small-text" style="color: var(--error-color);">Fehler beim Laden der Buchungen.</p>`;
        console.error("QuickView Load Error:", error);
    });
}


// --- 9. KALENDER-LOGIK ---

function loadBookingsForMonth(year, monthIndex) {
    if (calendarUnsubscribe) { calendarUnsubscribe(); }
    
    const startOfMonth = new Date(year, monthIndex, 1);
    const endOfMonth = new Date(year, monthIndex + 1, 0); 
    
    const startDateString = formatDate(startOfMonth);
    const endDateString = formatDate(endOfMonth);
    
    const q = query(
        getBookingsCollectionRef(),
        where("date", ">=", startDateString), 
        where("date", "<=", endDateString), 
        orderBy("date"),
        orderBy("slot")
    );

    calendarUnsubscribe = onSnapshot(q, (querySnapshot) => {
        allBookingsForMonth = {};
        querySnapshot.forEach(docSnap => {
            const data = docSnap.data();
            const dateKey = data.date;
            
            const bookingData = { 
                date: dateKey,
                slot: data.slot, 
                partei: data.partei, 
                userId: data.userId, 
                id: docSnap.id 
            };
            
            if (!allBookingsForMonth[dateKey]) {
                allBookingsForMonth[dateKey] = [];
            }
            allBookingsForMonth[dateKey].push(bookingData);
        });
        
        renderCalendar(year, monthIndex);

        if (selectedCalendarDate) {
            const selectedDateString = formatDate(selectedCalendarDate);
            updateCalendarDayActions(selectedDateString);
        }

    }, (error) => {
        console.error("Kalender Buchungs-Load Error:", error);
    });
}

function renderCalendar(year, monthIndex) {
    const todayFormatted = formatDate(new Date());
    const firstDayOfMonth = new Date(year, monthIndex, 1);
    const lastDayOfMonth = new Date(year, monthIndex + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    
    currentMonthDisplay.textContent = firstDayOfMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    calendarGrid.innerHTML = ''; 
    
    const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    dayNames.forEach(day => {
        const header = document.createElement('div');
        header.className = 'day-header';
        header.textContent = day;
        calendarGrid.appendChild(header);
    });

    let startDay = firstDayOfMonth.getDay();
    if (startDay === 0) startDay = 7; 
    
    for (let i = 1; i < startDay; i++) {
        const emptyDay = document.createElement('div');
        calendarGrid.appendChild(emptyDay);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthIndex, day);
        const dateString = formatDate(date);
        
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day clickable-day';
        dayEl.dataset.date = dateString;
        
        const dateNoTime = new Date(dateString + "T00:00:00");
        const todayNoTime = new Date(todayFormatted + "T00:00:00"); 

        const isPast = dateNoTime < todayNoTime; 

        if (dateString === todayFormatted) {
            dayEl.classList.add('is-today');
        }
        if (isPast) {
            dayEl.classList.add('inactive');
        }
        if (selectedCalendarDate && formatDate(selectedCalendarDate) === dateString) {
            dayEl.classList.add('selected-day');
        }

        dayEl.innerHTML = `<span class="day-number">${day}</span>`;

        const bookings = allBookingsForMonth[dateString] || [];
        if (bookings.length > 0) {
            const indicatorContainer = document.createElement('div');
            indicatorContainer.className = 'booking-indicator-container';
            
            const slots = { '07:00-13:00': null, '13:00-19:00': null };
            bookings.forEach(b => slots[b.slot] = b.partei);
            
            Object.values(slots).forEach(partei => {
                const indicator = document.createElement('div');
                indicator.className = 'booking-indicator';
                if (partei && PARTEI_COLORS[partei]) {
                    indicator.style.backgroundColor = PARTEI_COLORS[partei];
                } else {
                    indicator.style.backgroundColor = 'transparent'; 
                }
                indicatorContainer.appendChild(indicator);
            });
            dayEl.appendChild(indicatorContainer);
        }
        calendarGrid.appendChild(dayEl);
    }

    document.querySelectorAll('.calendar-day.clickable-day').forEach(dayEl => {
        const dateString = dayEl.dataset.date;
        const date = new Date(dateString + "T00:00:00");
        const todayNoTime = new Date(todayFormatted + "T00:00:00");
        
        if (date >= todayNoTime) { 
            dayEl.addEventListener('click', () => {
                document.querySelectorAll('.calendar-day.selected-day').forEach(el => el.classList.remove('selected-day'));
                selectedCalendarDate = date;
                dayEl.classList.add('selected-day');
                updateCalendarDayActions(dateString);
            });
        }
    });

    renderCalendarLegend();
}

function renderCalendarLegend() {
    const legendEl = document.getElementById('partei-legend');
    legendEl.innerHTML = '';
    
    ALL_PARTEIEN.forEach(partei => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <div class="legend-color" style="background-color: ${PARTEI_COLORS[partei]}"></div>
            <span>${partei}</span>
        `;
        legendEl.appendChild(item);
    });
}

function updateCalendarDayActions(dateString) {
    if (!currentUser) return; 
    
    calendarActionMessage.style.display = 'none';
    calendarDayActions.style.display = 'block';
    
    const date = new Date(dateString + "T00:00:00");
    selectedDayTitle.textContent = `Aktionen für: ${date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    
    const bookingsOnDay = allBookingsForMonth[dateString] || [];
    const todayFormatted = formatDate(new Date());

    const hasDuplicateOnThisDay = bookingsOnDay.some(b => b.partei === currentUser.partei);

    const slots = [
        { id: '07', slot: '07:00-13:00' },
        { id: '13', slot: '13:00-19:00' }
    ];

    slots.forEach(slotInfo => {
        const statusEl = document.getElementById(`slot-status-${slotInfo.id}`);
        const bookBtn = document.getElementById(`btn-book-${slotInfo.id}`);
        const deleteBtn = document.getElementById(`btn-delete-${slotInfo.id}`);
        const requestBtn = document.getElementById(`btn-request-${slotInfo.id}`); 

        statusEl.className = '';
        bookBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
        requestBtn.style.display = 'none';
        requestBtn.disabled = false;
        requestBtn.title = '';

        const booking = bookingsOnDay.find(b => b.slot === slotInfo.slot);

        if (booking) {
            statusEl.textContent = `Gebucht (${booking.partei})`;
            statusEl.classList.add('booked');

            if (booking.partei === currentUser.partei) {
                statusEl.textContent = `Gebucht (Ihre Partei)`; 
                statusEl.classList.add('booked-me');
                deleteBtn.style.display = 'block'; 
                deleteBtn.dataset.id = booking.id;
            } else if (userIsAdmin) {
                deleteBtn.style.display = 'block'; 
                deleteBtn.dataset.id = booking.id;
            } else {
                if (hasDuplicateOnThisDay) {
                    requestBtn.style.display = 'block';
                    requestBtn.disabled = true;
                    requestBtn.title = 'Ihre Partei hat an diesem Tag bereits gebucht.';
                } else {
                    requestBtn.style.display = 'block';
                    requestBtn.dataset.id = booking.id; 
                }
            }
        } else {
            if (hasDuplicateOnThisDay) {
                statusEl.textContent = `Verfügbar (Sie haben bereits gebucht)`;
                statusEl.classList.add('booked-me');
            } else {
                statusEl.textContent = `Verfügbar`;
                bookBtn.style.display = 'block'; 
            }
        }
        
        if (dateString < todayFormatted) {
            statusEl.textContent = booking ? statusEl.textContent : 'Vergangen';
            bookBtn.style.display = 'none';
            deleteBtn.style.display = 'none';
            requestBtn.style.display = 'none';
        }
    });
}

document.querySelectorAll('.calendar-action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        if (!selectedCalendarDate || !currentUserId) return;

        const action = e.target.dataset.action;
        const slot = e.target.dataset.slot;
        const dateString = formatDate(selectedCalendarDate);

        e.target.disabled = true;
        const originalText = e.target.textContent;
        
        let success = false;
        
        if (action === 'book') {
            e.target.textContent = 'Buche...';
            success = await performBooking(dateString, slot, 'calendar-action-message');
        } else if (action === 'delete') {
            e.target.textContent = 'Lösche...';
            success = await performDeletion(dateString, slot, 'calendar-action-message', currentUserId);
        } else if (action === 'request') {
            e.target.textContent = 'Angefragt...';
            
            const bookingId = e.target.dataset.id; 
            const booking = (allBookingsForMonth[dateString] || []).find(b => b.id === bookingId);
            
            if (booking) {
                await handleSwapRequest(booking, 'calendar-action-message');
                success = true; 
            } else {
                showMessage('calendar-action-message', 'Fehler: Buchung nicht gefunden.', 'error');
            }
        }
        
        if (action !== 'delete' && !success) {
             e.target.disabled = false;
             e.target.textContent = originalText;
        } else if (action === 'request') {
             setTimeout(() => {
                if(e.target) {
                    e.target.disabled = false;
                    e.target.textContent = originalText;
                }
             }, 3000);
        }
    });
});


// Navigation durch die Monate
document.getElementById('prev-month-btn').addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    calendarDayActions.style.display = 'none'; 
    selectedCalendarDate = null;
    loadBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
});

document.getElementById('next-month-btn').addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    calendarDayActions.style.display = 'none';
    selectedCalendarDate = null;
    loadBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
});


// --- 10. STATISTIK ---
let cachedAllBookings = null;
async function loadStatistics(forceReloadChart = false) {
    if (!userIsAdmin) {
        showMessage('stats-message', 'Zugriff verweigert.', 'error');
        return;
    }
    if (!forceReloadChart) {
        showMessage('stats-message', 'Lade Statistikdaten...', 'success');
    }
    
    try {
        let allBookings;
        if (forceReloadChart && cachedAllBookings) {
            allBookings = cachedAllBookings;
        } else {
            const q = query(getBookingsCollectionRef(), orderBy("bookedAt", "desc"));
            const querySnapshot = await getDocs(q);
            allBookings = [];
            querySnapshot.forEach(doc => allBookings.push(doc.data()));
            cachedAllBookings = allBookings; 
        }

        if (allBookings.length === 0) {
            showMessage('stats-message', 'Keine Buchungsdaten vorhanden.', 'error');
            document.getElementById('total-bookings-count').textContent = 'Gesamtzahl Buchungen: 0';
            return;
        }

        document.getElementById('total-bookings-count').textContent = `Gesamtzahl Buchungen: ${allBookings.length}`;
        document.getElementById('stats-message').style.display = 'none'; 

        const parteiCounts = {};
        const slotCounts = { '07:00-13:00': 0, '13:00-19:00': 0 };

        allBookings.forEach(b => {
            parteiCounts[b.partei] = (parteiCounts[b.partei] || 0) + 1;
            if (slotCounts.hasOwnProperty(b.slot)) {
                slotCounts[b.slot]++;
            }
        });
        renderParteienChart(parteiCounts);
        renderSlotChart(slotCounts);
    } catch (e) {
        showMessage('stats-message', `Fehler beim Laden der Statistik: ${e.message}`, 'error');
    }
}
function renderParteienChart(parteiCounts) {
    if (parteiChart) parteiChart.destroy(); 
    const chartTextColor = document.body.style.getPropertyValue('--text-color') || '#333';
    const dataLabels = ALL_PARTEIEN.filter(p => parteiCounts[p] > 0 || p in parteiCounts);
    const dataValues = dataLabels.map(p => parteiCounts[p] || 0);
    const backgroundColors = dataLabels.map(p => PARTEI_COLORS[p]);
    const ctx = document.getElementById('parteiChart').getContext('2d');
    parteiChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: dataLabels,
            datasets: [{
                data: dataValues,
                backgroundColor: backgroundColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            aspectRatio: 1, 
            plugins: {
                legend: { position: 'top', labels: { color: chartTextColor } },
                tooltip: {
                    titleColor: chartTextColor,
                    bodyColor: chartTextColor,
                    backgroundColor: document.body.style.getPropertyValue('--card-background') || 'white', 
                    borderColor: chartTextColor,
                    borderWidth: 1
                }
            }
        }
    });
}
function renderSlotChart(slotCounts) {
    if (slotChart) slotChart.destroy(); 
    const chartTextColor = document.body.style.getPropertyValue('--text-color') || '#333';
    const chartGridColor = document.body.style.getPropertyValue('--grid-color') || 'rgba(128, 128, 128, 0.1)';
    const labels = Object.keys(slotCounts);
    const dataValues = Object.values(slotCounts);
    const totalCount = dataValues.reduce((a, b) => a + b, 0);
    const ctx = document.getElementById('slotChart').getContext('2d');
    slotChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Anzahl Buchungen',
                data: dataValues,
                backgroundColor: ['rgba(0, 122, 255, 0.7)', 'rgba(255, 149, 0, 0.7)'],
                borderColor: ['#007AFF', '#FF9500'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, ticks: { color: chartTextColor, stepSize: 1 }, grid: { color: chartGridColor } },
                x: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    titleColor: chartTextColor,
                    bodyColor: chartTextColor,
                    backgroundColor: document.body.style.getPropertyValue('--card-background') || 'white', 
                    borderColor: chartTextColor,
                    borderWidth: 1
                }
            }
        }
    });
    const textEl = document.getElementById('slot-stats-text');
    if (totalCount > 0) {
        const percent07 = ((slotCounts['07:00-13:00'] / totalCount) * 100).toFixed(1);
        const percent13 = ((slotCounts['13:00-19:00'] / totalCount) * 100).toFixed(1);
        textEl.innerHTML = `Der Früh-Slot (07-13 Uhr) wurde zu **${percent07}%** und der Spät-Slot (13-19 Uhr) zu **${percent13}%** gebucht (Gesamt: ${totalCount} Buchungen).`;
    } else {
         textEl.innerHTML = 'Keine Slot-Buchungen vorhanden.';
    }
}


// --- 11. WEITERE EVENT LISTENER ---

// Navigation
document.getElementById('show-register').addEventListener('click', () => navigateTo('registerForm'));
document.getElementById('show-login').addEventListener('click', () => navigateTo('loginForm'));
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
document.getElementById('book-btn').addEventListener('click', () => navigateTo('bookingSection'));
document.getElementById('overview-btn').addEventListener('click', () => {
    setupWeekDropdown();
    navigateTo('overviewSection');
});
document.getElementById('calendar-btn').addEventListener('click', () => {
    currentCalendarDate = new Date(); 
    calendarDayActions.style.display = 'none'; 
    selectedCalendarDate = null;
    navigateTo('calendarSection');
});
statisticBtn.addEventListener('click', () => navigateTo('statisticSection'));

document.getElementById('profile-btn').addEventListener('click', () => {
    document.getElementById('profile-username').textContent = currentUser.username;
    document.getElementById('profile-email').textContent = currentUser.email;
    document.getElementById('profile-partei').textContent = currentUser.partei;
    navigateTo('profileSection');
});

// Zurück-Buttons
document.getElementById('back-to-menu-btn-1').addEventListener('click', () => navigateTo('mainMenu'));
document.getElementById('back-to-menu-btn-2').addEventListener('click', () => navigateTo('mainMenu'));
document.getElementById('back-to-menu-btn-3').addEventListener('click', () => navigateTo('mainMenu'));
document.getElementById('back-to-menu-btn-4').addEventListener('click', () => navigateTo('mainMenu'));
document.getElementById('back-to-menu-btn-5').addEventListener('click', () => navigateTo('mainMenu'));

// Theme-Wechsel
themeIcon.addEventListener('click', () => {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    saveThemePreference();
});

// Passwort ändern
document.getElementById("change-password-btn").addEventListener("click", async () => {
    const newPassword = document.getElementById("new-password").value;
    if (newPassword.length < 6) {
        showMessage('profile-message', "Das Passwort muss mindestens 6 Zeichen lang sein.", 'error');
        return;
    }
    if (!auth.currentUser) {
        showMessage('profile-message', "Fehler: Nicht angemeldet.", 'error');
        return;
    }
    try {
        await updatePassword(auth.currentUser, newPassword);
        showMessage('profile-message', "Passwort erfolgreich aktualisiert!", 'success');
        document.getElementById("new-password").value = '';
    } catch (error) {
         let msg = "Fehler beim Aktualisieren des Passworts. Bitte melden Sie sich neu an.";
         if (error.code === 'auth/weak-password') {
             msg = "Das neue Passwort ist zu schwach.";
         }
         showMessage('profile-message', msg, 'error');
    }
});

/**
 * (ANGEPASST) Lade Buchungen für die ausgewählte KW (Wochenübersicht).
 */
async function loadBookings(kwString) {
    if (overviewUnsubscribe) { overviewUnsubscribe(); }
    const bookingsListEl = document.getElementById("bookingsList");
    bookingsListEl.innerHTML = '<p class="small-text">Lade Wochenbuchungen...</p>';

    const [yearStr, weekStr] = kwString.split('-W');
    const year = parseInt(yearStr);
    const week = parseInt(weekStr);
    
    const monday = getMonday(year, week);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const startDate = formatDate(monday);
    const endDate = formatDate(sunday);

    const myPartyBookedDates = new Set();
    if (currentUser) {
        try {
            const myBookingsQuery = query(
                getBookingsCollectionRef(),
                where("partei", "==", currentUser.partei),
                where("date", ">=", startDate),
                where("date", "<=", endDate)
            );
            const myBookingsSnap = await getDocs(myBookingsQuery);
            myBookingsSnap.forEach(doc => myPartyBookedDates.add(doc.data().date));
        } catch (e) {
            console.error("Fehler beim Vorabladen der Partei-Buchungen:", e);
        }
    }

    const q = query(
        getBookingsCollectionRef(),
        where("date", ">=", startDate), 
        where("date", "<=", endDate), 
        orderBy("date"),
        orderBy("slot")
    );

    overviewUnsubscribe = onSnapshot(q, (querySnapshot) => {
        bookingsListEl.innerHTML = '';
        const bookings = [];
        querySnapshot.forEach(docSnap => bookings.push({id: docSnap.id, ...docSnap.data()}));

        if (bookings.length === 0) {
            bookingsListEl.innerHTML = `<p class="small-text">In dieser Woche sind keine Buchungen vorhanden.</p>`;
            return;
        }
        if (!currentUser) return;

        let currentDay = '';
        bookings.forEach(booking => {
            const bookingDate = new Date(booking.date + "T00:00:00");
            const formattedDate = bookingDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
            
            if (formattedDate !== currentDay) {
                const dayHeader = document.createElement('h3');
                dayHeader.textContent = formattedDate;
                dayHeader.style.marginTop = '15px';
                dayHeader.style.marginBottom = '5px';
                bookingsListEl.appendChild(dayHeader);
                currentDay = formattedDate;
            }

            const isMyParteiBooking = booking.partei === currentUser.partei;
            
            let actionsHTML = '';
            if (isMyParteiBooking || userIsAdmin) {
                actionsHTML = `<button class="button-small button-danger delete-overview-btn" 
                                data-id="${booking.id}" 
                                data-date="${booking.date}" 
                                data-slot="${booking.slot}">
                                Löschen
                            </button>`;
            } else {
                const hasDuplicate = myPartyBookedDates.has(booking.date);
                if (!hasDuplicate) {
                    actionsHTML = `<button class="button-small button-primary swap-request-btn" 
                                    data-id="${booking.id}" 
                                    data-date="${booking.date}" 
                                    data-slot="${booking.slot}" 
                                    data-partei="${booking.partei}">
                                    Slot anfragen
                                </button>`;
                } else {
                    actionsHTML = `<button class="button-small button-secondary" disabled 
                                    title="Ihre Partei hat an diesem Tag bereits gebucht.">
                                    Slot anfragen
                                </button>`;
                }
            }

            const item = document.createElement('div');
            item.className = 'booking-item';
            
            item.innerHTML = `
                <div>
                    <strong>${booking.slot}</strong> 
                    <span class="small-text ml-10">${booking.partei}</span>
                </div>
                <div class="booking-actions">
                    ${actionsHTML}
                </div>
            `;
            bookingsListEl.appendChild(item);
        });

        // Event-Listener für Lösch-Buttons
        document.querySelectorAll('.delete-overview-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const date = e.target.dataset.date;
                const slot = e.target.dataset.slot;
                
                e.target.disabled = true;
                e.target.textContent = 'Lösche...';

                await performDeletion(date, slot, 'overview-message', currentUserId);
            });
        });

        // Event-Listener für Anfrage-Buttons
        document.querySelectorAll('.swap-request-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const bookingId = e.target.dataset.id;
                const date = e.target.dataset.date;
                const slot = e.target.dataset.slot;
                const partei = e.target.dataset.partei;
                
                e.target.disabled = true;
                e.target.textContent = 'Angefragt...';
                
                await handleSwapRequest(
                    { id: bookingId, date, slot, partei }, 
                    'overview-message'
                );

                setTimeout(() => {
                    if (e.target) { 
                        e.target.disabled = false;
                        e.target.textContent = 'Slot anfragen';
                    }
                }, 3000); 
            });
        });

    }, (error) => {
        bookingsListEl.innerHTML = `<p class="small-text" style="color: var(--error-color);">Fehler beim Laden der Wochenbuchungen.</p>`;
        console.error("Overview Load Error:", error);
    });
}

// Listener für KW-Auswahl
document.getElementById("kw-select").addEventListener('change', (e) => {
    loadBookings(e.target.value);
});

// --- START ÄNDERUNG: WETTER-LOGIK ANGEPASST ---

/**
 * Analysiert die Wetterdaten und gibt eine Trocken-Prognose für die nächsten 3 Stunden zurück.
 * @param {object} data - Die API-Antwort von Open-Meteo.
 * @returns {{isDry: boolean, icon: string, label: string}}
 */
function getDryingIndicator(data) {
    try {
        const currentTime = new Date(data.current_weather.time);
        const precipitation = data.hourly.precipitation_probability;
        
        // Finde den Index der aktuellen oder nächsten vollen Stunde
        const hourIndex = data.hourly.time.findIndex(t => new Date(t) >= currentTime);

        if (hourIndex === -1) {
            throw new Error("Aktuelle Zeit konnte nicht im Stunden-Array gefunden werden.");
        }

        const isDay = data.current_weather.is_day === 1;
        const rainThreshold = 30; // 30% Regenwahrscheinlichkeit

        const prob1 = precipitation[hourIndex] || 0;
        const prob2 = precipitation[hourIndex + 1] || 0;
        const prob3 = precipitation[hourIndex + 2] || 0;
        
        const willRain = prob1 > rainThreshold || prob2 > rainThreshold || prob3 > rainThreshold;
        
        if (willRain) {
            return { 
                isDry: false, 
                icon: 'fa-solid fa-cloud-showers-heavy', // Regen-Icon
                label: 'Regen'
            };
        } else {
            return { 
                isDry: true, 
                icon: isDay ? 'fa-solid fa-sun' : 'fa-solid fa-moon', // Tag/Nacht-Icon
                label: 'Trocken'
            };
        }
    } catch (e) {
        console.error("Fehler bei der Wetter-Analyse:", e);
        return { isDry: false, icon: 'fa-solid fa-question', label: 'Fehler' };
    }
}


/**
 * Lädt das aktuelle Wetter und die 3-Stunden-Regenprognose für 83471 Schönau.
 */
async function loadWeather() {
    const lat = 47.60; // 83471 Schönau
    const lon = 12.98;
    
    // --- START ÄNDERUNG: forecast_days=2 ---
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=precipitation_probability&timezone=auto&forecast_days=2`;
    // --- ENDE ÄNDERUNG ---

    const widgetEl = document.getElementById('weather-widget');
    const tempEl = document.getElementById('weather-temp'); 
    const labelEl = document.getElementById('weather-label');
    const iconEl = document.getElementById('weather-icon');

    if (!widgetEl || !labelEl || !iconEl || !tempEl) return; 

    widgetEl.className = '';
    iconEl.className = 'fa-solid fa-spinner fa-spin';
    labelEl.textContent = 'Lade...';
    tempEl.textContent = '--'; 

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Wetterdaten-Antwort nicht ok');
        
        const data = await response.json();
        
        if (data && data.current_weather && data.hourly && data.hourly.precipitation_probability) {
            
            // 1. Aktuelle Temperatur holen und setzen
            const temp = data.current_weather.temperature;
            tempEl.textContent = Math.round(temp);

            // 2. Trocken-Indikator holen und setzen
            const indicator = getDryingIndicator(data);
            labelEl.textContent = indicator.label;
            iconEl.className = indicator.icon;
            
            // 3. Widget einfärben
            widgetEl.classList.add(indicator.isDry ? 'is-dry' : 'is-wet');
            
        } else {
            throw new Error("Unvollständige Wetterdaten erhalten.");
        }
    } catch (error) {
        console.error("Wetter-Widget-Fehler:", error);
        labelEl.textContent = "N/A";
        tempEl.textContent = "!"; 
        iconEl.className = 'fa-solid fa-circle-xmark'; 
        widgetEl.classList.add('is-wet'); 
    }
}
// --- ENDE WETTER-LOGIK ---