// Firebase SDK Module Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
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
    deleteDoc 
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
let bookingToDelete = null; 
let currentCalendarDate = new Date(); // Für den Monatskalender

const loadingOverlay = document.getElementById("loadingOverlay");
const appContainer = document.getElementById("app");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const mainMenu = document.getElementById("mainMenu");
const bookingSection = document.getElementById("bookingSection");
const overviewSection = document.getElementById("overviewSection");
const calendarSection = document.getElementById("calendarSection"); // NEU
const bookingsList = document.getElementById("bookingsList");
const userInfo = document.getElementById("userInfo");
const confirmationModal = document.getElementById("confirmationModal");
const confirmText = document.getElementById("confirm-text");

// Farbzuweisung für Parteien (für Kalender-Punkte)
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
    confirmText.innerHTML = `Soll die Buchung von <strong>${booking.partei}</strong> am ${new Date(booking.date + "T00:00:00").toLocaleDateString('de-DE')} (${booking.slot}) wirklich gelöscht werden?`;
    confirmationModal.style.display = 'flex';
}

function hideConfirmation() {
    bookingToDelete = null;
    confirmationModal.style.display = 'none';
}

function getBookingsCollectionRef() {
    // Da wir keine App-ID und Nutzer-ID von außen haben, nutzen wir die Standard-Collection
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


// --- 5. HAUPT-ROUTING UND UI-FUNKTIONEN ---

function unsubscribeAll() {
    if (overviewUnsubscribe) { overviewUnsubscribe(); overviewUnsubscribe = null; }
    if (calendarUnsubscribe) { calendarUnsubscribe(); calendarUnsubscribe = null; }
}

function navigateTo(section) {
    // Alle Hauptsektionen ausblenden
    [loginForm, registerForm, mainMenu, bookingSection, overviewSection, calendarSection].forEach(el => el.style.display = 'none');
    
    // Alle Nachrichten-Boxen zurücksetzen
    document.querySelectorAll('.message-box').forEach(el => el.style.display = 'none');
    
    // Listener beenden, wenn die Ansicht gewechselt wird
    if (section !== 'overviewSection' && section !== 'calendarSection') {
        unsubscribeAll();
    }
    
    // User-Info nur anzeigen, wenn eingeloggt und nicht auf Login/Register
    userInfo.style.display = (currentUser && (section === 'mainMenu' || section === 'bookingSection' || section === 'overviewSection' || section === 'calendarSection')) ? 'flex' : 'none';

    const targetElement = document.getElementById(section);
    if(targetElement) targetElement.style.display = 'block';
}

function updateUserInfo(userData) {
    if (userData) {
        document.getElementById('current-username').textContent = userData.username || 'Unbekannt';
        userIsAdmin = !!userData.isAdmin;
        document.getElementById('current-role').textContent = userIsAdmin ? 'Administrator' : 'Nutzer';
    } else {
        userIsAdmin = false;
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

// --- 7. REGISTRIERUNG & LOGIN (Funktionen mit showMessage) ---
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
            isAdmin: false
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
    
    if (!date || !slot) {
        showMessage('booking-error', "Bitte Datum und Slot wählen!", 'error');
        return;
    }

    if (!currentUser || !currentUserId) {
        showMessage('booking-error', "Fehler: Sie sind nicht angemeldet. Bitte neu einloggen.", 'error');
        return;
    }

    const bookingsColRef = getBookingsCollectionRef();
    
    try {
        const q = query(bookingsColRef, where("date", "==", date), where("slot", "==", slot));
        const existingBookings = await getDocs(q);

        if (!existingBookings.empty) {
            showMessage('booking-error', "Dieser Slot ist bereits belegt!", 'error');
            return;
        }

        await addDoc(bookingsColRef, {
            date: date,
            slot: slot,
            partei: currentUser.partei, 
            userId: currentUserId, 
            bookedAt: new Date().toISOString()
        });

        // KEIN RÜCKSPRUNG MEHR ZUM HAUPTMENÜ
        showMessage('booking-error', "Buchung erfolgreich! Sie können weitere Buchungen vornehmen.", 'success');
        
        // Slot-Auswahl zurücksetzen (Datum bleibt zur Vereinfachung)
        document.getElementById("booking-slot").value = ''; 

    } catch (e) {
        showMessage('booking-error', `Fehler beim Speichern der Buchung: ${e.message}`, 'error');
        console.error("Buchungsfehler:", e);
    }
});

// Buchungen laden (Wochenübersicht)
function loadBookings(kwValue) {
    if (!currentUserId) return;

    if (overviewUnsubscribe) { overviewUnsubscribe(); }

    const [yearStr, kwStr] = kwValue.split('-W');
    const year = parseInt(yearStr);
    const week = parseInt(kwStr);

    if (isNaN(year) || isNaN(week)) return;

    const startOfWeek = getMonday(year, week);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    bookingsList.innerHTML = `<p class="small-text">Lade KW ${String(week).padStart(2, '0')}/${year}...</p>`;

    const q = getBookingsCollectionRef();

    overviewUnsubscribe = onSnapshot(q, (querySnapshot) => {
        bookingsList.innerHTML = "";
        let foundBookings = false;
        const currentBookings = [];

        querySnapshot.forEach((docSnap) => {
            const booking = docSnap.data();
            const bookingDate = new Date(booking.date + "T00:00:00");
            
            // Wichtig: Wir filtern hier auf das Datum in der Datenbank, da Firestore keinen Date-Range-Filter auf den Date-String erlaubt.
            // Die Datumsberechnung in JS ist präziser.
            if (bookingDate >= startOfWeek && bookingDate <= endOfWeek) {
                foundBookings = true;
                currentBookings.push({ id: docSnap.id, ...booking });
            }
        });

        currentBookings.sort((a, b) => {
            if (a.date !== b.date) {
                return a.date.localeCompare(b.date);
            }
            return a.slot.localeCompare(b.slot);
        });

        renderBookings(currentBookings);

        if (!foundBookings) {
            bookingsList.innerHTML = `<p class="small-text">Keine Buchungen für KW ${String(week).padStart(2, '0')}/${year} gefunden.</p>`;
        }
    }, (error) => {
        showMessage('overview-message', "Fehler beim Laden der Übersicht: " + error.message, 'error');
        console.error("Firestore onSnapshot error:", error);
    });
}

function renderBookings(bookings) {
    bookingsList.innerHTML = '';
    
    bookings.forEach(booking => {
        const item = document.createElement('div');
        item.className = 'booking-item';

        const details = document.createElement('div');
        details.className = 'booking-details';
        
        const bookingDate = new Date(booking.date + "T00:00:00");
        const formattedDate = bookingDate.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

        details.innerHTML = `
            <div class="font-semibold">${formattedDate} (${booking.slot})</div>
            <div class="small-text" style="text-align: left;">Gebucht von: <strong>${booking.partei}</strong></div>
        `;
        item.appendChild(details);

        const actions = document.createElement('div');
        actions.className = 'booking-actions';
        
        const isOwner = booking.userId === currentUserId;
        const canDelete = userIsAdmin || isOwner;

        if (canDelete) {
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Löschen';
            deleteBtn.className = 'button-danger';
            deleteBtn.addEventListener('click', () => showConfirmation(booking)); 
            actions.appendChild(deleteBtn);
        }
        
        item.appendChild(actions);
        bookingsList.appendChild(item);
    });
}

// Löschlogik
async function confirmDeleteBooking() {
    const booking = bookingToDelete;
    hideConfirmation();
    if (!booking) return;

    const docRef = doc(db, "bookings", booking.id);
    
    try {
        if (!userIsAdmin && booking.userId !== currentUserId) {
            showMessage('overview-message', "Sie haben keine Berechtigung, diese Buchung zu löschen.", 'error');
            return;
        }

        await deleteDoc(docRef);
        showMessage('overview-message', "Buchung erfolgreich gelöscht.", 'success');
        
    } catch (e) {
        showMessage('overview-message', `Fehler beim Löschen: ${e.message}`, 'error');
        console.error("Löschfehler:", e);
    }
}


// --- 9. MONATSKALENDER LOGIK (NEU) ---

function getMonthStartAndEnd(date) {
    // Liefert den 1. Tag des Monats
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    // Liefert den letzten Tag des Monats (setMonth erhöht den Monat, Tag 0 gibt den letzten Tag des Vormonats)
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0); 
    
    // Setzt die Uhrzeit auf Mitternacht für den Start des Monats und 23:59 für das Ende.
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    return { start, end };
}

function getBookingsByDate(bookings) {
    // Gruppiert Buchungen nach Datum und Slot
    const map = {};
    bookings.forEach(b => {
        const dateKey = b.date; // YYYY-MM-DD
        if (!map[dateKey]) {
            map[dateKey] = [];
        }
        map[dateKey].push({
            partei: b.partei,
            slot: b.slot
        });
    });
    return map;
}

function loadCalendar(date) {
    if (!currentUserId) return;
    
    if (calendarUnsubscribe) { calendarUnsubscribe(); }

    const { start, end } = getMonthStartAndEnd(date);
    
    renderCalendarUI(date);

    // Buchungsdatenbank-Referenz
    const q = getBookingsCollectionRef();

    calendarUnsubscribe = onSnapshot(q, (querySnapshot) => {
        const allBookings = [];
        querySnapshot.forEach(docSnap => {
            const booking = docSnap.data();
            // Erstellt ein Date-Objekt aus dem YYYY-MM-DD String für den Vergleich
            const bookingDate = new Date(booking.date + "T00:00:00"); 

            // Filterung in JS: Nur Buchungen im angezeigten Monat verwenden
            if (bookingDate >= start && bookingDate <= end) {
                 allBookings.push(booking);
            }
        });
        
        const groupedBookings = getBookingsByDate(allBookings);
        renderCalendarGrid(date, groupedBookings);

    }, (error) => {
        console.error("Firestore Kalender error:", error);
    });
}

function renderCalendarUI(date) {
    const monthYear = date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    document.getElementById('current-month-display').textContent = monthYear;
    
    const legendEl = document.getElementById('partei-legend');
    legendEl.innerHTML = '';
    
    // Legende rendern
    ALL_PARTEIEN.forEach(partei => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <span class="legend-color" style="background-color: ${PARTEI_COLORS[partei]}"></span>
            ${partei}
        `;
        legendEl.appendChild(item);
    });
}

function renderCalendarGrid(date, groupedBookings) {
    const gridEl = document.getElementById('calendar-grid');
    gridEl.innerHTML = '';
    
    const daysOfWeek = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    daysOfWeek.forEach(day => {
        const header = document.createElement('div');
        header.className = 'day-header';
        header.textContent = day;
        gridEl.appendChild(header);
    });
    
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    // Der Wochentag des ersten Tages (1=Mo, ..., 7=So)
    let startingDay = firstDayOfMonth.getDay(); 
    startingDay = (startingDay === 0) ? 6 : startingDay - 1; // 0 (So) -> 6, 1 (Mo) -> 0

    // Fülltage am Anfang (für Mo-So Ausrichtung)
    for (let i = 0; i < startingDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day inactive';
        gridEl.appendChild(emptyDay);
    }

    // Tage des Monats
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
        const currentDate = new Date(date.getFullYear(), date.getMonth(), day);
        const dateKey = formatDate(currentDate);

        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        dayEl.innerHTML = `<span class="day-number">${day}</span>`;
        
        const bookingsForDay = groupedBookings[dateKey];
        
        const indicatorContainer = document.createElement('div');
        indicatorContainer.className = 'booking-indicator-container';

        // Wir definieren die Slots, um sicherzustellen, dass die Reihenfolge der Punkte immer gleich ist
        const slots = ["07:00-13:00", "13:00-19:00"];
        
        slots.forEach(slotKey => {
            let color = '#e0e0e0'; // Grau für frei
            
            if (bookingsForDay) {
                // Finde die Buchung für diesen Slot
                const booking = bookingsForDay.find(b => b.slot === slotKey);
                if (booking && PARTEI_COLORS[booking.partei]) {
                    color = PARTEI_COLORS[booking.partei];
                }
            }
            
            const indicator = document.createElement('div');
            indicator.className = 'booking-indicator';
            indicator.style.backgroundColor = color;
            indicatorContainer.appendChild(indicator);
        });
        
        dayEl.appendChild(indicatorContainer);
        gridEl.appendChild(dayEl);
    }
}

// --- 10. EVENT LISTENER ---

// Navigation
document.getElementById("show-register").addEventListener("click", () => navigateTo('registerForm'));
document.getElementById("show-login").addEventListener("click", () => navigateTo('loginForm'));
document.getElementById("book-btn").addEventListener("click", () => navigateTo('bookingSection'));

// --- 11. PROFILBEARBEITUNG ---
// Navigation zum Profilbereich
const profileSection = document.getElementById("profileSection");

document.getElementById("profile-btn").addEventListener("click", async () => {
    if (!currentUserId) return;

    navigateTo("profileSection");

    try {
        const userDocSnap = await getDoc(getUserProfileDocRef(currentUserId));
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            document.getElementById("profile-username").textContent = userData.username || "Unbekannt";
            document.getElementById("profile-email").textContent = userData.email || "-";
        }
    } catch (err) {
        console.error("Fehler beim Laden des Profils:", err);
        showMessage("profile-message", "Fehler beim Laden des Profils.", "error");
    }
});

// Zurück-Button im Profilbereich
document.getElementById("back-to-menu-btn-4").addEventListener("click", () => navigateTo("mainMenu"));

// Passwort ändern
import { updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

document.getElementById("change-password-btn").addEventListener("click", async () => {
    const newPassword = document.getElementById("new-password").value;

    if (!newPassword || newPassword.length < 6) {
        showMessage("profile-message", "Das Passwort muss mindestens 6 Zeichen lang sein.", "error");
        return;
    }

    try {
        const user = auth.currentUser;
        if (!user) {
            showMessage("profile-message", "Fehler: Kein Benutzer angemeldet.", "error");
            return;
        }

        await updatePassword(user, newPassword);
        showMessage("profile-message", "Passwort erfolgreich aktualisiert!", "success");
        document.getElementById("new-password").value = "";
    } catch (err) {
        console.error("Fehler beim Passwort-Update:", err);
        let message = "Fehler beim Aktualisieren des Passworts.";
        if (err.code === "auth/requires-recent-login") {
            message = "Bitte logge dich erneut ein, um dein Passwort zu ändern.";
        }
        showMessage("profile-message", message, "error");
    }
});

// Initialisiert das KW Dropdown, wenn die Übersichtsseite aufgerufen wird
document.getElementById("overview-btn").addEventListener("click", () => {
    navigateTo('overviewSection');
    setupWeekDropdown();
});

// Initialisiert den Monatskalender, wenn die Kalenderansicht aufgerufen wird
document.getElementById("calendar-btn").addEventListener("click", () => {
    navigateTo('calendarSection');
    // Setzt auf den 1. des aktuellen Monats zurück (um unnötige Seiteneffekte zu vermeiden)
    currentCalendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1); 
    loadCalendar(currentCalendarDate);
});


// Kalender Navigation
document.getElementById("prev-month-btn").addEventListener("click", () => {
    // Monat dekrementieren (setMonth handhabt Jahreswechsel korrekt)
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    loadCalendar(currentCalendarDate);
});

document.getElementById("next-month-btn").addEventListener("click", () => {
    // Monat inkrementieren
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    loadCalendar(currentCalendarDate);
});


// Listener für das Dropdown
document.getElementById("kw-select").addEventListener("change", (e) => loadBookings(e.target.value));

// Zurück-Buttons
document.getElementById("back-to-menu-btn-1").addEventListener("click", () => navigateTo('mainMenu'));
document.getElementById("back-to-menu-btn-2").addEventListener("click", () => navigateTo('mainMenu'));
document.getElementById("back-to-menu-btn-3").addEventListener("click", () => navigateTo('mainMenu')); // NEU

// Logout
document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
        await signOut(auth);
    } catch (e) {
        console.error("Logout Fehler:", e);
    }
});

// Modal-Aktionen
document.getElementById("confirm-cancel").addEventListener("click", hideConfirmation);
document.getElementById("confirm-delete").addEventListener("click", confirmDeleteBooking);