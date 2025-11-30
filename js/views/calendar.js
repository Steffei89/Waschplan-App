import { 
    query, where, orderBy, onSnapshot,
    getBookingsCollectionRef
} from '../firebase.js';
import * as dom from '../dom.js';
import { navigateTo } from '../ui.js';
import { getState, setAllBookingsForMonth, setSelectedCalendarDate, ALL_PARTEIEN, PARTEI_COLORS, getUnsubscribers } from '../state.js';
import { formatDate } from '../utils.js';
import { performBooking, performDeletion } from '../services/booking.js';
import { handleSwapRequest } from '../services/swap.js';
import { showMessage } from '../ui.js'; 

let currentCalendarDate = new Date(); 

export function initCalendarView(unsubscriberSetter) {
    document.getElementById('prev-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        dom.calendarDayActions.style.display = 'none'; 
        setSelectedCalendarDate(null);
        loadBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), unsubscriberSetter);
    });

    document.getElementById('next-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        dom.calendarDayActions.style.display = 'none';
        setSelectedCalendarDate(null);
        loadBookingsForMonth(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), unsubscriberSetter);
    });

    document.querySelectorAll('.calendar-action-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            await onCalendarActionClick(e);
        });
    });

    // FIX: Back Button mit 'back' Parameter
    document.getElementById('back-to-menu-btn-3').addEventListener('click', () => navigateTo(dom.mainMenu, 'back'));
}

export function loadBookingsForMonth(year, monthIndex, unsubscriberSetter) {
    const unsubscribers = getUnsubscribers();
    if (unsubscribers && unsubscribers.calendar) {
        unsubscribers.calendar();
    }
    
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

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const newBookings = {};
        querySnapshot.forEach(docSnap => {
            const data = docSnap.data();
            const dateKey = data.date;
            const bookingData = { id: docSnap.id, ...data };
            
            if (!newBookings[dateKey]) newBookings[dateKey] = [];
            newBookings[dateKey].push(bookingData);
        });
        
        setAllBookingsForMonth(newBookings);
        renderCalendar(year, monthIndex);

        const { selectedCalendarDate } = getState();
        if (selectedCalendarDate) {
            updateCalendarDayActions(formatDate(selectedCalendarDate));
        }

    }, (error) => {
        console.error("Kalender Buchungs-Load Error:", error);
    });
    
    unsubscriberSetter('calendar', unsubscribe);
}

function renderCalendar(year, monthIndex) {
    const todayFormatted = formatDate(new Date());
    const firstDayOfMonth = new Date(year, monthIndex, 1);
    const lastDayOfMonth = new Date(year, monthIndex + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    
    dom.currentMonthDisplay.textContent = firstDayOfMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    dom.calendarGrid.innerHTML = ''; 
    
    const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    dayNames.forEach(day => {
        const header = document.createElement('div');
        header.className = 'day-header';
        header.textContent = day;
        dom.calendarGrid.appendChild(header);
    });

    let startDay = firstDayOfMonth.getDay();
    if (startDay === 0) startDay = 7; 
    
    for (let i = 1; i < startDay; i++) {
        dom.calendarGrid.appendChild(document.createElement('div'));
    }
    
    const { allBookingsForMonth, selectedCalendarDate } = getState();

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthIndex, day);
        const dateString = formatDate(date);
        
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day clickable-day';
        dayEl.dataset.date = dateString;
        
        const dateNoTime = new Date(dateString + "T00:00:00");
        const todayNoTime = new Date(todayFormatted + "T00:00:00"); 

        if (dateString === todayFormatted) dayEl.classList.add('is-today');
        if (dateNoTime < todayNoTime) dayEl.classList.add('inactive');
        if (selectedCalendarDate && formatDate(selectedCalendarDate) === dateString) {
            dayEl.classList.add('selected-day');
        }

        dayEl.innerHTML = `<span class="day-number">${day}</span>`;

        const bookings = allBookingsForMonth[dateString] || [];
        const indicatorContainer = document.createElement('div');
        indicatorContainer.className = 'booking-indicator-container';
        
        const slots = { '07:00-13:00': null, '13:00-19:00': null };
        bookings.forEach(b => {
            if (slots.hasOwnProperty(b.slot)) {
                slots[b.slot] = b.partei;
            }
        });
        
        Object.values(slots).forEach(partei => {
            const indicator = document.createElement('div');
            indicator.className = 'booking-indicator';
            indicator.style.backgroundColor = PARTEI_COLORS[partei] || 'transparent';
            indicatorContainer.appendChild(indicator);
        });
        dayEl.appendChild(indicatorContainer);

        dom.calendarGrid.appendChild(dayEl);

        if (dateNoTime >= todayNoTime) { 
            dayEl.addEventListener('click', () => {
                document.querySelectorAll('.calendar-day.selected-day').forEach(el => el.classList.remove('selected-day'));
                setSelectedCalendarDate(date);
                dayEl.classList.add('selected-day');
                updateCalendarDayActions(dateString);
            });
        }
    }
    renderCalendarLegend();
}

function renderCalendarLegend() {
    dom.parteiLegend.innerHTML = '';
    ALL_PARTEIEN.forEach(partei => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <div class="legend-color" style="background-color: ${PARTEI_COLORS[partei]}"></div>
            <span>${partei}</span>
        `;
        dom.parteiLegend.appendChild(item);
    });
}

function updateCalendarDayActions(dateString) {
    const { currentUser, userIsAdmin, allBookingsForMonth } = getState();
    if (!currentUser) return; 
    
    dom.calendarActionMessage.style.display = 'none';
    dom.calendarDayActions.style.display = 'block';
    
    const date = new Date(dateString + "T00:00:00");
    dom.selectedDayTitle.textContent = `Aktionen für: ${date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    
    const bookingsOnDay = allBookingsForMonth[dateString] || [];
    const todayFormatted = formatDate(new Date());
    const hasDuplicateOnThisDay = bookingsOnDay.some(b => b.partei === currentUser.userData.partei);

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

            if (booking.partei === currentUser.userData.partei) {
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

async function onCalendarActionClick(e) {
    const { selectedCalendarDate, currentUserId, allBookingsForMonth } = getState();
    if (!selectedCalendarDate || !currentUserId) return;

    const action = e.target.dataset.action;
    const slot = e.target.dataset.slot;
    const dateString = formatDate(selectedCalendarDate);

    const button = e.target; 
    button.disabled = true;
    const originalText = button.textContent;
    
    let success = false;
    
    if (action === 'book') {
        button.textContent = 'Buche...';
        success = await performBooking(dateString, slot, 'calendar-action-message');
    } else if (action === 'delete') {
        button.textContent = 'Lösche...';
        success = await performDeletion(dateString, slot, 'calendar-action-message');
    } else if (action === 'request') {
        button.textContent = 'Angefragt...';
        
        const bookingId = button.dataset.id; 
        const booking = (allBookingsForMonth[dateString] || []).find(b => b.id === bookingId);
        
        if (booking) {
            await handleSwapRequest(booking, 'calendar-action-message');
            success = true; // 'handleSwapRequest' zeigt eigene Meldungen
        } else {
            showMessage('calendar-action-message', 'Fehler: Buchung nicht gefunden.', 'error');
            success = false;
        }
    }
    
    if (action === 'book' || action === 'delete') {
        
        if (success) {
            const successText = (action === 'book') ? 'Gebucht!' : 'Gelöscht!';
            button.textContent = successText;

            setTimeout(() => {
                if (button) { 
                    button.disabled = false;
                    button.textContent = originalText;
                }
            }, 2000); 

        } else {
            button.disabled = false;
            button.textContent = originalText;
        }

    } else if (action === 'request') {
        
        if (success) {
            setTimeout(() => {
                if(button) {
                    button.disabled = false;
                    button.textContent = originalText;
                }
            }, 3000);
        } else {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}