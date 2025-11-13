// App-Zustand
let currentUser = null; 
let currentUserId = null;
let userIsAdmin = false;
let currentTheme = 'light';
let selectedCalendarDate = null; 
let allBookingsForMonth = {}; 
// --- NEU ---
let isRegistering = false; // Flag für den Registrierungsprozess
// --- ENDE NEU ---

// Listener-Unsubscriber
let overviewUnsubscribe = null; 
let calendarUnsubscribe = null;
let quickViewUnsubscribe = null;
let requestsUnsubscribe = null; 
let outgoingRequestsUnsubscribe = null;
let outgoingRequestsSuccessUnsubscribe = null;

// Chart-Instanzen
let parteiChart = null;
let slotChart = null;

// Konstanten
export const PARTEI_COLORS = {
    "Micha & Stefan": "#007AFF", 
    "Sarah & Florian": "#FF9500", 
    "Christa & Uli": "#34C759", 
};
export const ALL_PARTEIEN = Object.keys(PARTEI_COLORS);

// Getter und Setter
export const getState = () => ({
    currentUser,
    currentUserId,
    userIsAdmin,
    currentTheme,
    selectedCalendarDate,
    allBookingsForMonth,
    parteiChart,
    slotChart
});

// --- NEUE GETTER/SETTER ---
export const getIsRegistering = () => isRegistering;
export const setIsRegistering = (value) => { isRegistering = value; };
// --- ENDE NEU ---

export function setCurrentUser(user) {
    currentUser = user;
    currentUserId = user ? user.uid : null;
    userIsAdmin = user ? !!user.userData.isAdmin : false;
}

export function setTheme(theme) {
    currentTheme = theme;
}

export function setSelectedCalendarDate(date) {
    selectedCalendarDate = date;
}

export function setAllBookingsForMonth(bookings) {
    allBookingsForMonth = bookings;
}

export function setCharts(pChart, sChart) {
    parteiChart = pChart;
    slotChart = sChart;
}

export const getUnsubscribers = () => ({
    overviewUnsubscribe,
    calendarUnsubscribe,
    quickViewUnsubscribe,
    requestsUnsubscribe,
    outgoingRequestsUnsubscribe,
    outgoingRequestsSuccessUnsubscribe
});

export function setUnsubscriber(type, func) {
    switch (type) {
        case 'overview': overviewUnsubscribe = func; break;
        case 'calendar': calendarUnsubscribe = func; break;
        case 'quickView': quickViewUnsubscribe = func; break;
        case 'requests': requestsUnsubscribe = func; break;
        case 'outgoingRequests': outgoingRequestsUnsubscribe = func; break;
        case 'outgoingRequestsSuccess': outgoingRequestsSuccessUnsubscribe = func; break;
    }
}