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
    limit 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- 1. FIREBASE KONFIGURATION (Ihre Daten) ---
const firebaseConfig = {
    apiKey: "AIzaSyCvKdQa7No5TMehgIBS9Nh34kg8EqFJap0",
    authDomain: "waschplanapp.firebaseapp.com",
    projectId: "waschplanapp",
    storageBucket: "waschplanapp.firebasestorage.app",
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
let bookingToDelete = null; 
let currentCalendarDate = new Date(); 
let currentTheme = 'light'; 
let selectedCalendarDate = null; 
let allBookingsForMonth = {}; 
let parteiChart = null; // Instanz für das Kreisdiagramm
let slotChart = null; // Instanz für das Balkendiagramm


const loadingOverlay = document.getElementById("loadingOverlay");
const appContainer = document.getElementById("app");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const mainMenu = document.getElementById("mainMenu");
const bookingSection = document.getElementById("bookingSection");
const overviewSection = document.getElementById("overviewSection");
const calendarSection = document.getElementById("calendarSection"); 
const profileSection = document.getElementById("profileSection");
// NEU: Statistik Sektion
const statisticSection = document.getElementById("statisticSection");
const statisticBtn = document.getElementById("statistic-btn");

const bookingsList = document.getElementById("bookingsList");
const userInfo = document.getElementById("userInfo");
const confirmationModal = document.getElementById("confirmationModal");
const confirmText = document.getElementById("confirm-text");
const themeIcon = document.getElementById("theme-icon"); 
const calendarGrid = document.getElementById("calendar-grid");
const currentMonthDisplay = document.getElementById("current-month-display");
const calendarDayActions = document.getElementById("calendar-day-actions");
const selectedDayTitle = document.getElementById("selected-day-title");
const calendarActionMessage = document.getElementById("calendar-action-message");


// Farbzuweisung für Parteien (für Kalender-Punkte und Charts)
const PARTEI_COLORS = {
    "Micha & Stefan": "#007AFF", // Blau
    "Sarah & Florian": "#FF9500", // Orange
    "Christa & Uli": "#34C759", // Grün
};
const ALL_PARTEIEN = Object.keys(PARTEI_COLORS);


// --- 4. HILFSFUNKTIONEN ---

function showMessage(elementId, message, type = 'error') {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.textContent = message;
    el.className = `message-box ${type}`;
    el.style.display = 'block';
    
    // Nachricht nach 5 Sekunden ausblenden
    setTimeout(() => {
        el.style.display = 'none';
    }, 5000);
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

// Berechnet die Kalenderwoche (ISO 8601 Standard)
function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

// Gibt das Datum des Montags der KW zurück
function getMonday(year, week) {
    const date = new Date(year, 0, 1 + (week - 1) * 7);
    const startOfWeek = new Date(date);
    startOfWeek.setDate(startOfWeek.getDate() - (startOfWeek.getDay() || 7) + 1); 
    return startOfWeek;
}

// Datum formatieren: YYYY-MM-DD
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

// Generiert das KW Dropdown für die nächsten 5 Wochen
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

        // Nächste Woche
        current.setDate(current.getDate() + 7);
    }
    // Lade Buchungen für die aktuell ausgewählte Woche
    if (selectEl.value) {
        loadBookings(selectEl.value);
    }
}

// --- THEME FUNKTIONEN ---

/**
 * Setzt das Theme (light/dark) und aktualisiert das Icon.
 * @param {string} theme 'light' oder 'dark'
 */
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
}

/**
 * Speichert das aktuelle Theme im Firestore-Benutzerprofil.
 */
async function saveThemePreference() {
    if (!currentUserId) return;
    try {
        await updateDoc(getUserProfileDocRef(currentUserId), {
            theme: currentTheme
        });
        console.log("Theme-Präferenz gespeichert:", currentTheme);
    } catch (e) {
        console.error("Fehler beim Speichern der Theme-Präferenz:", e);
    }
}

// --- 5. HAUPT-ROUTING UND UI-FUNKTIONEN ---

function unsubscribeAll() {
    if (overviewUnsubscribe) { overviewUnsubscribe(); overviewUnsubscribe = null; }
    if (calendarUnsubscribe) { calendarUnsubscribe(); calendarUnsubscribe = null; }
    if (quickViewUnsubscribe) { quickViewUnsubscribe(); quickViewUnsubscribe = null; }
}

function navigateTo(section) {
    // Liste aller Sektionen
    const sections = [loginForm, registerForm, mainMenu, bookingSection, overviewSection, calendarSection, profileSection, statisticSection];
    
    // Animation und Anzeige
    sections.forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active'); // Animation zurücksetzen
    });
    
    // Alle Nachrichten-Boxen zurücksetzen
    document.querySelectorAll('.message-box').forEach(el => el.style.display = 'none');
    
    // Listener beenden
    if (section !== 'overviewSection' && section !== 'calendarSection') {
        unsubscribeAll();
    }
    
    // User-Info nur anzeigen, wenn eingeloggt und nicht auf Login/Register
    userInfo.style.display = (currentUser && section !== 'loginForm' && section !== 'registerForm') ? 'flex' : 'none';

    const targetElement = document.getElementById(section);
    if(targetElement) {
        targetElement.style.display = 'block';
        // Fügt die Klasse nach einem kurzen Timeout hinzu, um die Animation auszulösen
        setTimeout(() => targetElement.classList.add('active'), 50); 
        
        // Auto-Fokus
        if (section === 'loginForm') {
            document.getElementById('login-identifier').focus();
        } else if (section === 'registerForm') {
            document.getElementById('register-username').focus();
        } else if (section === 'mainMenu') {
            // Lade die Quick View Buchungen, wenn das Menü angezeigt wird
            loadNextBookingsOverview(); 
        } else if (section === 'calendarSection') {
            // Lade den Kalender für den aktuellen Monat
            renderCalendar(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
            loadBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
        } else if (section === 'statisticSection') {
            // NEU: Lade die Statistikdaten
            loadStatistics();
        }
    }
}

function updateUserInfo(userData) {
    if (userData) {
        document.getElementById('current-username').textContent = userData.username || 'Unbekannt';
        userIsAdmin = !!userData.isAdmin;
        document.getElementById('current-role').textContent = userIsAdmin ? 'Administrator' : 'Nutzer';
        
        // NEU: Statistik-Button nur für Admins anzeigen
        statisticBtn.style.display = userIsAdmin ? 'block' : 'none';

        // Theme des Benutzers laden und setzen
        const userTheme = userData.theme || 'light';
        setTheme(userTheme);
        
    } else {
        userIsAdmin = false;
        statisticBtn.style.display = 'none'; // Button ausblenden
        // Standard-Theme setzen, wenn ausgeloggt
        setTheme('light'); 
    }
}

// --- 6. AUTHENTIFIZIERUNGS-FLOW ---

onAuthStateChanged(auth, async (user) => {
    // Initiales Ausblenden des Lade-Overlays
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';
    
    if (user) { 
        currentUserId = user.uid;
        try {
            const userDocSnap = await getDoc(getUserProfileDocRef(currentUserId));
            
            if (userDocSnap.exists()) {
                currentUser = userDocSnap.data();
                updateUserInfo(currentUser);
                navigateTo('mainMenu');
            } else {
                console.warn("Benutzerprofil in Firestore nicht gefunden. Abmeldung.");
                await signOut(auth); 
            }
        } catch (e) {
            console.error("Fehler beim Abrufen des Benutzerprofils:", e);
            await signOut(auth);
        }
    } else {
        unsubscribeAll();
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
        // Prüfen, ob der Benutzername bereits existiert
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
        } else if (err.code === 'auth/invalid-email') {
            errorMessage = 'Ungültiges E-Mail-Format.';
        }
        showMessage('register-error', errorMessage);
        console.error("Registrierungsfehler:", err);
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
        // onAuthStateChanged übernimmt die Navigation bei Erfolg

    } catch (err) {
        let errorMessage = "Login fehlgeschlagen: Benutzername/E-Mail oder Passwort ist falsch.";
        if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-email') {
            errorMessage = "Login fehlgeschlagen: Benutzername/E-Mail oder Passwort ist falsch.";
        }
        showMessage('login-error', errorMessage);
        console.error("Login-Fehler:", err);
    }
});
        
// --- 8. BUCHUNGSFUNKTIONEN ---
document.getElementById("book-submit").addEventListener("click", async () => {
    const date = document.getElementById("booking-date").value;
    const slot = document.getElementById("booking-slot").value;
    await performBooking(date, slot, 'booking-error', document.getElementById("book-submit"));
});

/**
 * Führt eine Buchung aus.
 * @param {string} date - Das Datum (YYYY-MM-DD).
 * @param {string} slot - Der Slot (z.B. '07:00-13:00').
 * @param {string} messageElementId - ID des DOM-Elements für Fehlermeldungen.
 * @param {HTMLElement} [buttonElement] - Optionaler Button für visuelles Feedback.
 * @returns {boolean} - True bei Erfolg, False bei Fehler.
 */
async function performBooking(date, slot, messageElementId, buttonElement = null) {
    if (!date || !slot) {
        showMessage(messageElementId, "Datum und Slot müssen ausgewählt werden!", 'error');
        return false;
    }
    if (!currentUser || !currentUserId) {
        showMessage(messageElementId, "Fehler: Sie sind nicht angemeldet. Bitte neu einloggen.", 'error');
        return false;
    }
    
    const bookingsColRef = getBookingsCollectionRef();
    
    try {
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
            bookedAt: new Date().toISOString()
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
        
        // Slot-Auswahl zurücksetzen in der Buchungs-Sektion
        if (messageElementId === 'booking-error') {
            document.getElementById("booking-slot").value = ''; 
            document.getElementById("booking-date").value = ''; 
        }

        return true;

    } catch (e) {
        showMessage(messageElementId, `Fehler beim Speichern der Buchung: ${e.message}`, 'error');
        console.error("Buchungsfehler:", e);
        return false;
    }
}

/**
 * Löscht eine Buchung.
 * @param {string} date - Das Datum (YYYY-MM-DD).
 * @param {string} slot - Der Slot (z.B. '07:00-13:00').
 * @param {string} messageElementId - ID des DOM-Elements für Fehlermeldungen.
 * @param {string} expectedUserId - Die ID des Benutzers, der die Löschung durchführt (aktueller Nutzer).
 * @returns {boolean} - True bei Erfolg, False bei Fehler.
 */
async function performDeletion(date, slot, messageElementId, expectedUserId) {
    if (!date || !slot || !currentUserId) return false;

    const bookingsColRef = getBookingsCollectionRef();
    let q;

    if (userIsAdmin) {
        // ADMIN-LOGIK: Der Admin darf jede Buchung an diesem Datum/Slot löschen.
        q = query(
            bookingsColRef, 
            where("date", "==", date), 
            where("slot", "==", slot)
        );
        console.log("Admin versucht, Buchung zu löschen...");
    } else {
        // NUTZER-LOGIK: Normale Nutzer dürfen nur ihre eigenen Buchungen löschen.
        q = query(
            bookingsColRef, 
            where("date", "==", date), 
            where("slot", "==", slot),
            where("userId", "==", expectedUserId) // Muss eigener Nutzer sein
        );
        console.log("Nutzer versucht, eigene Buchung zu löschen...");
    }
    
    try {
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            if (userIsAdmin) {
                // Dies sollte nur passieren, wenn die Buchung in der Zwischenzeit gelöscht wurde.
                showMessage(messageElementId, "Fehler: Die Buchung wurde nicht gefunden.", 'error');
            } else {
                showMessage(messageElementId, "Fehler: Sie können nur Ihre eigenen Buchungen löschen.", 'error');
            }
            return false;
        }

        // Es sollte nur eine Buchung pro Slot/Tag geben. Wir löschen die erste gefundene.
        const docToDelete = querySnapshot.docs[0];
        const bookingData = docToDelete.data();

        // Zusätzliche Sicherheitsprüfung für Nicht-Admins (falls sie versuchen, einen Button zu manipulieren)
        if (!userIsAdmin && bookingData.userId !== currentUserId) {
             showMessage(messageElementId, "Löschung fehlgeschlagen: Sie sind nicht berechtigt, diese Buchung zu löschen.", 'error');
             return false;
        }
        
        await deleteDoc(docToDelete.ref);
        
        showMessage(messageElementId, `Buchung von ${bookingData.partei || 'Unbekannt'} erfolgreich gelöscht.`, 'success');
        return true;

    } catch (e) {
        showMessage(messageElementId, `Fehler beim Löschen der Buchung: ${e.message}`, 'error');
        console.error("Löschfehler:", e);
        return false;
    }
}


// Globaler Listener für das Löschen meiner Buchungen aus dem QuickView
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
        // onSnapshot wird die Liste automatisch aktualisieren.
    }
});


// --- LÄDT DIE NÄCHSTEN 5 GESAMTBUCHUNGEN ALLER PARTEIEN (für Quick View) ---
async function loadNextBookingsOverview() {
    if (quickViewUnsubscribe) { quickViewUnsubscribe(); }
    
    const myBookingsList = document.getElementById('my-bookings-list');
    myBookingsList.innerHTML = '<p class="small-text">Lade die nächsten Buchungen...</p>';
    
    const today = formatDate(new Date());

    // Abfrage: Filtere ab heute, sortiere chronologisch (Datum, Slot), begrenze auf 5
    const q = query(
        getBookingsCollectionRef(),
        where("date", ">=", today), // Nur zukünftige Buchungen
        orderBy("date"),
        orderBy("slot"),
        limit(5) // Zeigt die nächsten 5 Buchungen
    );

    quickViewUnsubscribe = onSnapshot(q, (querySnapshot) => {
        myBookingsList.innerHTML = '';
        const bookings = [];
        querySnapshot.forEach(docSnap => bookings.push({id: docSnap.id, ...docSnap.data()}));

        if (bookings.length === 0) {
            myBookingsList.innerHTML = `<p class="small-text">Keine kommenden Buchungen gefunden.</p>`;
            return;
        }

        bookings.forEach(booking => {
            const bookingDate = new Date(booking.date + "T00:00:00");
            const formattedDate = bookingDate.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
            
            const item = document.createElement('div');
            item.className = 'my-booking-item';
            
            const isMyBooking = booking.userId === currentUserId;
            
            item.innerHTML = `
                <div>
                    <strong>${formattedDate}</strong> (${booking.slot})
                    <span class="small-text ml-10">${booking.partei}</span>
                </div>
                ${isMyBooking || userIsAdmin ? 
                    `<button class="button-small button-danger delete-my-booking-btn" 
                        data-id="${booking.id}" 
                        data-date="${booking.date}" 
                        data-slot="${booking.slot}">
                        Löschen
                    </button>` : ''}
            `;
            myBookingsList.appendChild(item);
        });
    }, (error) => {
        myBookingsList.innerHTML = `<p class="small-text" style="color: var(--error-color);">Fehler beim Laden der Buchungen.</p>`;
        console.error("QuickView Load Error:", error);
    });
}


// --- 9. KALENDER-LOGIK ---

/**
 * Holt alle Buchungen für den angegebenen Monat.
 * @param {number} year 
 * @param {number} monthIndex - 0-basiert
 */
function loadBookingsForMonth(year, monthIndex) {
    if (calendarUnsubscribe) { calendarUnsubscribe(); }
    
    const startOfMonth = new Date(year, monthIndex, 1);
    const endOfMonth = new Date(year, monthIndex + 1, 0); // Letzter Tag des Monats
    
    const startDateString = formatDate(startOfMonth);
    const endDateString = formatDate(endOfMonth);
    
    // Abfrage: alle Buchungen im aktuellen Monatsbereich
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
                slot: data.slot, 
                partei: data.partei, 
                userId: data.userId, 
                id: docSnap.id // Füge die Dokumenten-ID hinzu
            };
            
            if (!allBookingsForMonth[dateKey]) {
                allBookingsForMonth[dateKey] = [];
            }
            allBookingsForMonth[dateKey].push(bookingData);
        });
        
        // Kalender neu rendern mit den neuen Buchungsdaten
        renderCalendar(year, monthIndex);

        // Aktionen für den eventuell ausgewählten Tag aktualisieren
        if (selectedCalendarDate) {
            const selectedDateString = formatDate(selectedCalendarDate);
            updateCalendarDayActions(selectedDateString);
        }

    }, (error) => {
        console.error("Kalender Buchungs-Load Error:", error);
    });
}

/**
 * Rendert den Kalender für den angegebenen Monat.
 * @param {number} year 
 * @param {number} monthIndex - 0-basiert
 */
function renderCalendar(year, monthIndex) {
    const today = formatDate(new Date());
    const firstDayOfMonth = new Date(year, monthIndex, 1);
    const lastDayOfMonth = new Date(year, monthIndex + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    
    currentMonthDisplay.textContent = firstDayOfMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    calendarGrid.innerHTML = ''; // Vorherige Kalendereinträge löschen
    
    const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    dayNames.forEach(day => {
        const header = document.createElement('div');
        header.className = 'day-header';
        header.textContent = day;
        calendarGrid.appendChild(header);
    });

    // Füllt leere Zellen am Anfang (Montag = 1, Sonntag = 0 -> Sonntag = 7)
    let startDay = firstDayOfMonth.getDay();
    if (startDay === 0) startDay = 7; // Mache Sonntag zum 7. Tag
    
    for (let i = 1; i < startDay; i++) {
        const emptyDay = document.createElement('div');
        calendarGrid.appendChild(emptyDay);
    }
    
    // Erstellt die Tage des Monats
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthIndex, day);
        const dateString = formatDate(date);
        
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day clickable-day';
        dayEl.dataset.date = dateString;
        
        // Prüfen, ob der Tag heute oder in der Vergangenheit liegt
        const isPast = date < new Date(today + "T00:00:00"); 

        if (dateString === today) {
            dayEl.classList.add('is-today');
        }

        // Deaktiviert vergangene Tage für die Klick-Aktion
        if (isPast) {
            dayEl.classList.add('inactive');
        }

        // Setze den Tag als ausgewählt, wenn er es ist
        if (selectedCalendarDate && formatDate(selectedCalendarDate) === dateString) {
            dayEl.classList.add('selected-day');
        }

        dayEl.innerHTML = `<span class="day-number">${day}</span>`;

        // Fügt Buchungsindikatoren hinzu
        const bookings = allBookingsForMonth[dateString] || [];
        if (bookings.length > 0) {
            const indicatorContainer = document.createElement('div');
            indicatorContainer.className = 'booking-indicator-container';
            
            const slots = {
                '07:00-13:00': null,
                '13:00-19:00': null
            };
            bookings.forEach(b => slots[b.slot] = b.partei);
            
            Object.values(slots).forEach(partei => {
                const indicator = document.createElement('div');
                indicator.className = 'booking-indicator';
                if (partei && PARTEI_COLORS[partei]) {
                    indicator.style.backgroundColor = PARTEI_COLORS[partei];
                } else {
                    indicator.style.backgroundColor = 'transparent'; // Leerer Slot
                }
                indicatorContainer.appendChild(indicator);
            });
            dayEl.appendChild(indicatorContainer);
        }

        calendarGrid.appendChild(dayEl);
    }

    // Event Listener für die Tage hinzufügen
    document.querySelectorAll('.calendar-day.clickable-day').forEach(dayEl => {
        const dateString = dayEl.dataset.date;
        const date = new Date(dateString + "T00:00:00");
        const todayNoTime = new Date(today + "T00:00:00");
        
        // Nur zukünftige oder heutige Tage sind klickbar
        if (date >= todayNoTime) { 
            dayEl.addEventListener('click', () => {
                // Entferne die 'selected' Klasse von allen Tagen
                document.querySelectorAll('.calendar-day.selected-day').forEach(el => el.classList.remove('selected-day'));

                // Setze den neuen ausgewählten Tag
                selectedCalendarDate = date;
                dayEl.classList.add('selected-day');

                // Zeige Aktionen an
                updateCalendarDayActions(dateString);
            });
        }
    });

    // Legende aktualisieren
    renderCalendarLegend();
}

/**
 * Rendert die Legende für die Parteien und Farben.
 */
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

/**
 * Aktualisiert den Aktionsbereich für den ausgewählten Kalendertag (mit Admin-Logik).
 * @param {string} dateString - Das Datum (YYYY-MM-DD).
 */
function updateCalendarDayActions(dateString) {
    calendarActionMessage.style.display = 'none';
    calendarDayActions.style.display = 'block';
    
    const date = new Date(dateString + "T00:00:00");
    selectedDayTitle.textContent = `Aktionen für: ${date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    
    const bookings = allBookingsForMonth[dateString] || [];
    const today = formatDate(new Date());

    const slots = [
        { id: '07', slot: '07:00-13:00' },
        { id: '13', slot: '13:00-19:00' }
    ];

    slots.forEach(slotInfo => {
        const statusEl = document.getElementById(`slot-status-${slotInfo.id}`);
        const bookBtn = document.getElementById(`btn-book-${slotInfo.id}`);
        const deleteBtn = document.getElementById(`btn-delete-${slotInfo.id}`);

        statusEl.className = '';
        bookBtn.style.display = 'block';
        deleteBtn.style.display = 'none';
        
        const booking = bookings.find(b => b.slot === slotInfo.slot);

        if (booking) {
            // Slot ist belegt
            statusEl.textContent = `Gebucht (${booking.partei})`;
            statusEl.classList.add('booked');

            bookBtn.style.display = 'none'; // Buchen ist nicht möglich

            // Nur Eigene oder Admin dürfen löschen
            if (booking.userId === currentUserId) {
                statusEl.textContent = `Gebucht (Sie)`;
                statusEl.classList.add('booked-me');
                deleteBtn.style.display = 'block'; // Eigener Slot kann gelöscht werden
                deleteBtn.dataset.id = booking.id; 
            } else if (userIsAdmin) {
                // ADMIN-FALL: Darf fremde Buchung löschen
                deleteBtn.style.display = 'block'; 
                deleteBtn.dataset.id = booking.id;
            } else {
                // Fremder Slot, kein Admin
                deleteBtn.style.display = 'none';
            }
            
        } else {
            // Slot ist frei
            statusEl.textContent = `Verfügbar`;
            bookBtn.style.display = 'block'; // Buchen möglich
            deleteBtn.style.display = 'none'; // Löschen nicht nötig
        }
        
        // Deaktiviere alle Aktionen, wenn der Tag in der Vergangenheit liegt
        if (dateString < today) {
            statusEl.textContent = booking ? statusEl.textContent : 'Vergangen';
            bookBtn.style.display = 'none';
            deleteBtn.style.display = 'none';
        }
    });
}

// Globaler Event Listener für die Kalender-Aktions-Buttons
document.querySelectorAll('.calendar-action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        if (!selectedCalendarDate || !currentUserId) return;

        const action = e.target.dataset.action;
        const slot = e.target.dataset.slot;
        const dateString = formatDate(selectedCalendarDate);

        e.target.disabled = true;
        const originalText = e.target.textContent;
        e.target.textContent = action === 'book' ? 'Buche...' : 'Lösche...';

        let success = false;
        
        if (action === 'book') {
            success = await performBooking(dateString, slot, 'calendar-action-message');
        } else if (action === 'delete') {
            success = await performDeletion(dateString, slot, 'calendar-action-message', currentUserId);
        }
        
        // Nach der Aktion wird der onSnapshot-Listener den UI-Zustand automatisch aktualisieren.
        if (!success) {
             e.target.disabled = false;
             e.target.textContent = originalText;
        }
    });
});


// Navigation durch die Monate
document.getElementById('prev-month-btn').addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    // Zustand der Aktionsfelder zurücksetzen
    calendarDayActions.style.display = 'none'; 
    selectedCalendarDate = null;
    loadBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
});

document.getElementById('next-month-btn').addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    // Zustand der Aktionsfelder zurücksetzen
    calendarDayActions.style.display = 'none';
    selectedCalendarDate = null;
    loadBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth());
});


// --- 10. STATISTIK LOGIK ---

/**
 * Lädt alle Buchungsdaten und ruft die Chart-Renderer auf.
 */
async function loadStatistics() {
    if (!userIsAdmin) {
        showMessage('stats-message', 'Zugriff verweigert. Nur Administratoren dürfen die Statistik einsehen.', 'error');
        return;
    }
    
    showMessage('stats-message', 'Lade Statistikdaten...', 'success');
    
    try {
        // Lade alle Buchungen, sortiert nach Datum (optional)
        const q = query(getBookingsCollectionRef(), orderBy("bookedAt", "desc"));
        const querySnapshot = await getDocs(q);
        const allBookings = [];
        querySnapshot.forEach(doc => allBookings.push(doc.data()));

        if (allBookings.length === 0) {
            showMessage('stats-message', 'Keine Buchungsdaten zur Auswertung vorhanden.', 'error');
            document.getElementById('total-bookings-count').textContent = 'Gesamtzahl Buchungen: 0';
            return;
        }

        document.getElementById('total-bookings-count').textContent = `Gesamtzahl Buchungen: ${allBookings.length}`;
        document.getElementById('stats-message').style.display = 'none'; // Lade-Nachricht ausblenden

        // Datenverarbeitung
        const parteiCounts = {};
        const slotCounts = { '07:00-13:00': 0, '13:00-19:00': 0 };

        allBookings.forEach(b => {
            // Zähle Buchungen pro Partei
            parteiCounts[b.partei] = (parteiCounts[b.partei] || 0) + 1;
            
            // Zähle Buchungen pro Slot
            if (slotCounts.hasOwnProperty(b.slot)) {
                slotCounts[b.slot]++;
            }
        });

        // Rendere die Diagramme
        renderParteienChart(parteiCounts);
        renderSlotChart(slotCounts);

    } catch (e) {
        showMessage('stats-message', `Fehler beim Laden der Statistikdaten: ${e.message}`, 'error');
        console.error("Statistik Load Error:", e);
    }
}

/**
 * Rendert ein Kreisdiagramm (Doughnut) zur Verteilung der Buchungen pro Partei.
 * @param {Object} parteiCounts - Zählungen { parteiName: count }
 */
function renderParteienChart(parteiCounts) {
    if (parteiChart) parteiChart.destroy(); // Vorheriges Chart zerstören

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
            aspectRatio: 1, // Behält ein quadratisches Seitenverhältnis bei
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: document.body.style.getPropertyValue('--text-color') // Nutze Theme-Farbe
                    }
                },
                title: {
                    display: false
                }
            }
        }
    });
}

/**
 * Rendert ein Balkendiagramm zur Auslastung der Slots.
 * @param {Object} slotCounts - Zählungen { slot: count }
 */
function renderSlotChart(slotCounts) {
    if (slotChart) slotChart.destroy(); // Vorheriges Chart zerstören

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
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: document.body.style.getPropertyValue('--text-color'),
                        stepSize: 1 
                    },
                    grid: {
                         color: 'rgba(128, 128, 128, 0.1)' // Dezenteres Gitter
                    }
                },
                x: {
                    ticks: {
                        color: document.body.style.getPropertyValue('--text-color')
                    },
                    grid: {
                         color: 'rgba(128, 128, 128, 0.1)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });

    // Zusätzlicher Text für die Auslastung
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
    currentCalendarDate = new Date(); // Setzt auf den aktuellen Monat zurück
    calendarDayActions.style.display = 'none'; // Versteckt Aktionsfeld
    selectedCalendarDate = null;
    navigateTo('calendarSection');
});
// NEU: Statistik Button
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
// NEU: Zurück-Button Statistik
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
         // Bei 'auth/requires-recent-login' muss sich der Nutzer neu anmelden
         let msg = "Fehler beim Aktualisieren des Passworts. Bitte melden Sie sich neu an und versuchen Sie es erneut.";
         if (error.code === 'auth/weak-password') {
             msg = "Das neue Passwort ist zu schwach.";
         }
         showMessage('profile-message', msg, 'error');
         console.error("Passwort-Update-Fehler:", error);
    }
});

/**
 * Lade Buchungen für die ausgewählte KW (Wochenübersicht).
 */
function loadBookings(kwString) {
    if (overviewUnsubscribe) { overviewUnsubscribe(); }
    const bookingsListEl = document.getElementById("bookingsList");
    bookingsListEl.innerHTML = '<p class="small-text">Lade Wochenbuchungen...</p>';

    // Logik zur Berechnung des Datumsbereichs aus der KW-Zeichenkette
    const [yearStr, weekStr] = kwString.split('-W');
    const year = parseInt(yearStr);
    const week = parseInt(weekStr);
    
    // Ermittelt den Montag und Sonntag der KW
    const monday = getMonday(year, week);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const startDate = formatDate(monday);
    const endDate = formatDate(sunday);

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

            const isMyBooking = booking.userId === currentUserId;
            
            const item = document.createElement('div');
            item.className = 'booking-item';
            
            item.innerHTML = `
                <div>
                    <strong>${booking.slot}</strong> 
                    <span class="small-text ml-10">${booking.partei}</span>
                </div>
                ${isMyBooking || userIsAdmin ? 
                    `<button class="button-small button-danger delete-overview-btn" 
                        data-id="${booking.id}" 
                        data-date="${booking.date}" 
                        data-slot="${booking.slot}">
                        Löschen
                    </button>` : ''}
            `;
            bookingsListEl.appendChild(item);
        });

        // Füge Event-Listener für Lösch-Buttons in der Wochenübersicht hinzu
        document.querySelectorAll('.delete-overview-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const date = e.target.dataset.date;
                const slot = e.target.dataset.slot;
                
                e.target.disabled = true;
                e.target.textContent = 'Lösche...';

                await performDeletion(date, slot, 'overview-message', currentUserId);
            });
        });

    }, (error) => {
        bookingsListEl.innerHTML = `<p class="small-text" style="color: var(--error-color);">Fehler beim Laden der Wochenbuchungen.</p>`;
        console.error("Overview Load Error:", error);
    });
}

// Listener für KW-Auswahl in der Wochenübersicht
document.getElementById("kw-select").addEventListener('change', (e) => {
    loadBookings(e.target.value);
});