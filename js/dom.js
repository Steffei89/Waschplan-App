export const loadingOverlay = document.getElementById("loadingOverlay");
export const appContainer = document.getElementById("app");

// Formulare & Sektionen
export const loginForm = document.getElementById("loginForm");
export const registerForm = document.getElementById("registerForm");
export const mainMenu = document.getElementById("mainMenu");
export const bookingSection = document.getElementById("bookingSection");
export const overviewSection = document.getElementById("overviewSection");
export const calendarSection = document.getElementById("calendarSection"); 
export const profileSection = document.getElementById("profileSection");
export const statisticSection = document.getElementById("statisticSection");

// UI-Elemente
export const userInfo = document.getElementById("userInfo");
export const themeIcon = document.getElementById("theme-icon"); 
export const statisticBtn = document.getElementById("statistic-btn");
export const weatherWidget = document.getElementById('weather-widget');

// Container
export const incomingRequestsContainer = document.getElementById("incomingRequestsContainer"); 
export const outgoingRequestsStatusContainer = document.getElementById("outgoingRequestsStatusContainer");
// --- NEU ---
export const outgoingRequestsSuccessContainer = document.getElementById("outgoingRequestsSuccessContainer");
// --- ENDE NEU ---

// Kalender
export const calendarGrid = document.getElementById("calendar-grid");
export const currentMonthDisplay = document.getElementById("current-month-display");
export const calendarDayActions = document.getElementById("calendar-day-actions");
export const selectedDayTitle = document.getElementById("selected-day-title");
export const calendarActionMessage = document.getElementById("calendar-action-message");
export const parteiLegend = document.getElementById('partei-legend');

// Buchung
export const bookingDateInput = document.getElementById('booking-date');
export const dateValidationMessage = document.getElementById('date-validation-message');
export const bookingSlotSelect = document.getElementById('booking-slot');
export const bookSubmitBtn = document.getElementById('book-submit');

// Übersicht
export const kwSelect = document.getElementById("kw-select");
export const bookingsList = document.getElementById("bookingsList");
export const myBookingsList = document.getElementById('my-bookings-list');

// Profil
export const profileUsername = document.getElementById('profile-username');
export const profileEmail = document.getElementById('profile-email');
export const profilePartei = document.getElementById('profile-partei');
export const newPasswordInput = document.getElementById('new-password');
export const adminSettingsSection = document.getElementById('admin-settings-section');
export const weatherPlzInput = document.getElementById('weather-plz-input');

// Modal
export const confirmationModal = document.getElementById('confirmationModal');
export const confirmText = document.getElementById('confirm-text');

// Alle Sektionen für die Navigation
export const allSections = [
    loginForm, registerForm, mainMenu, bookingSection, 
    overviewSection, calendarSection, profileSection, statisticSection, 
    incomingRequestsContainer, outgoingRequestsStatusContainer,
    outgoingRequestsSuccessContainer
];