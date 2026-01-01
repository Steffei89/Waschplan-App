// js/dom.js - Version 3.5.0 (Minigame Fix)

// --- AUTH & FORMS ---
export const loginForm = document.getElementById('loginForm');
export const registerForm = document.getElementById('registerForm');
export const resetPasswordForm = document.getElementById('resetPasswordForm');
export const verifyEmailMessage = document.getElementById('verifyEmailMessage');

export const loginIdentifierInput = document.getElementById('login-identifier');
export const loginPasswordInput = document.getElementById('login-password');
export const registerEmailInput = document.getElementById('register-email');
export const registerPasswordInput = document.getElementById('register-password');
export const registerPasswordConfirmInput = document.getElementById('register-password-confirm');
export const registerInviteCodeInput = document.getElementById('register-invite-code');
export const registerParteiSelect = document.getElementById('register-partei-select');

export const loginBtn = document.getElementById('login-btn');
export const registerBtn = document.getElementById('register-btn');

// --- SECTIONS (CARDS) ---
export const mainMenu = document.getElementById('mainMenu');
export const bookingSection = document.getElementById('bookingSection');
export const overviewSection = document.getElementById('overviewSection');
export const calendarSection = document.getElementById('calendarSection');
export const profileSection = document.getElementById('profileSection');
export const adminSection = document.getElementById('adminSection');
export const minigameSection = document.getElementById('minigameSection');
export const maintenanceSection = document.getElementById('maintenanceSection');
export const liveTimerSection = document.getElementById('liveTimerSection');

// --- CONTAINERS & WRAPPERS ---
export const incomingRequestsContainer = document.getElementById('incomingRequestsContainer');
export const outgoingRequestsStatusContainer = document.getElementById('outgoingRequestsStatusContainer');
export const outgoingRequestsSuccessContainer = document.getElementById('outgoingRequestsSuccessContainer');
export const headerContainer = document.querySelector('.header-container');
export const adminUiWrapper = document.getElementById('admin-ui-wrapper');
export const userInfo = document.getElementById('userInfo');
export const bottomNav = document.getElementById('bottom-nav');

// --- MODALS ---
export const confirmationModal = document.getElementById('confirmationModal');
export const deleteAccountModal = document.getElementById('deleteAccountModal');
export const changelogModal = document.getElementById('changelogModal');
export const setupParteiModal = document.getElementById('setupParteiModal');
export const karmaGuideModal = document.getElementById('karmaGuideModal');
export const tutorialModal = document.getElementById('tutorialModal');
export const scannerModal = document.getElementById('scannerModal');

// --- BUTTONS (GLOBAL & MAIN) ---
export const bookSubmitBtn = document.getElementById('book-submit');
export const logoutBtn = document.getElementById('logout-btn'); 
export const logoutBtnProfile = document.getElementById('logout-btn-profile'); 
export const refreshAppBtn = document.getElementById('refresh-app-btn');
export const themeIcon = document.getElementById('theme-icon');
export const globalBackBtn = document.getElementById('global-back-btn');

// --- INPUTS (GLOBAL) ---
export const bookingDateInput = document.getElementById('booking-date');
export const bookingSlotSelect = document.getElementById('booking-slot');
export const dateValidationMessage = document.getElementById('date-validation-message');
export const kwSelect = document.getElementById('kw-select');

// --- LISTS ---
export const bookingsList = document.getElementById('bookingsList');
export const myBookingsList = document.getElementById('my-bookings-list');

// --- WIDGETS ---
export const weatherWidget = document.getElementById('weather-widget');
export const machineStatusWidget = document.getElementById('machine-status-widget');
export const loadingOverlay = document.getElementById('loadingOverlay');
export const appContainer = document.getElementById('app');

// --- SETUP ---
export const setupParteiSelect = document.getElementById('setup-partei-select');
export const setupParteiSaveBtn = document.getElementById('setup-partei-save-btn');

// --- CALENDAR SPECIFIC ---
export const calendarDayActions = document.getElementById('calendar-day-actions');
export const currentMonthDisplay = document.getElementById('current-month-display');
export const calendarGrid = document.getElementById('calendar-grid');
export const parteiLegend = document.getElementById('partei-legend');
export const selectedDayTitle = document.getElementById('selected-day-title');
export const calendarActionMessage = document.getElementById('calendar-action-message');

// --- PROFILE SPECIFIC ---
export const profileEmail = document.getElementById('profile-email');
export const profilePartei = document.getElementById('profile-partei');
export const cancelDeleteAccountBtn = document.getElementById('cancel-delete-account-btn');
export const confirmDeleteAccountBtn = document.getElementById('confirm-delete-account-btn');
export const deleteAccountPasswordInput = document.getElementById('delete-account-password');
export const changePasswordBtn = document.getElementById('change-password-btn');
export const passwordChangeContainer = document.getElementById('password-change-container');
export const newPasswordInput = document.getElementById('new-password');
export const newPasswordConfirmInput = document.getElementById('new-password-confirm');
export const saveNewPasswordBtn = document.getElementById('save-new-password-btn');
export const deleteAccountBtn = document.getElementById('delete-account-btn');
export const enableNotificationsBtn = document.getElementById('enable-notifications-btn');
export const showChangelogBtn = document.getElementById('show-changelog-btn');

// --- MINIGAME SPECIFIC (NEU HINZUGEFÜGT!) ---
export const gameCanvas = document.getElementById('gameCanvas');
export const gameStartScreen = document.getElementById('game-start-screen');
export const gameOverScreen = document.getElementById('game-over-screen');
export const gameContainer = document.getElementById('game-container');
export const gamePauseMenu = document.getElementById('game-pause-menu');
export const gamePauseBtn = document.getElementById('game-pause-btn');
export const gameMuteBtn = document.getElementById('game-mute-btn');
export const resumeGameBtn = document.getElementById('resume-game-btn');
export const restartGameBtnPause = document.getElementById('restart-game-btn-pause');
export const quitGameBtn = document.getElementById('quit-game-btn');
export const pauseScoreDisplay = document.getElementById('pause-score');
export const finalScoreDisplay = document.getElementById('final-score');
export const karmaWonDisplay = document.getElementById('karma-won');
export const leaderboardList = document.getElementById('minigame-leaderboard');
export const tutorialOverlay = document.getElementById('game-tutorial-overlay');
export const countdownDisplay = document.getElementById('countdown-display');

// --- CHANGELOG & OTHER ---
export const changelogContent = document.getElementById('changelogContent');
export const changelogCloseBtn = document.getElementById('changelogCloseBtn');