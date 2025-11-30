import { 
    query, where, orderBy, onSnapshot, getDocs,
    getBookingsCollectionRef
} from '../firebase.js';
import * as dom from '../dom.js';
import { navigateTo } from '../ui.js';
import { getState } from '../state.js';
import { formatDate, getWeekNumber, getMonday } from '../utils.js';
import { performDeletion } from '../services/booking.js';
import { handleSwapRequest } from '../services/swap.js';

export function initOverviewView(unsubscriberSetter) {
    dom.kwSelect.addEventListener('change', (e) => {
        loadBookingsForWeek(e.target.value, unsubscriberSetter);
    });
    // FIX: Back Button mit 'back' Parameter
    document.getElementById('back-to-menu-btn-2').addEventListener('click', () => navigateTo(dom.mainMenu, 'back'));
}

export function setupWeekDropdown() {
    dom.kwSelect.innerHTML = '';
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
        if (i === 0) option.selected = true;
        
        dom.kwSelect.appendChild(option);
        current.setDate(current.getDate() + 7);
    }
}

export async function loadBookingsForWeek(kwString, unsubscriberSetter) {
    const unsubscribers = getState().unsubscribers;
    if (unsubscribers && unsubscribers.overview) {
        unsubscribers.overview();
    }
    
    // ===== SKELETON LOADING =====
    dom.bookingsList.innerHTML = `
        <div class="skeleton-item"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div>
        <div class="skeleton-item"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div>
        <div class="skeleton-item"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div>
    `;
    // ============================

    const [yearStr, weekStr] = kwString.split('-W');
    const monday = getMonday(parseInt(yearStr), parseInt(weekStr));
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const startDate = formatDate(monday);
    const endDate = formatDate(sunday);

    // Vorab-Check für Duplikate
    const myPartyBookedDates = new Set();
    const { currentUser } = getState();
    if (currentUser) {
        try {
            const myBookingsQuery = query(
                getBookingsCollectionRef(),
                where("partei", "==", currentUser.userData.partei),
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

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        dom.bookingsList.innerHTML = '';
        const bookings = [];
        querySnapshot.forEach(docSnap => bookings.push({id: docSnap.id, ...docSnap.data()}));

        if (bookings.length === 0) {
            dom.bookingsList.innerHTML = `<p class="small-text">In dieser Woche sind keine Buchungen vorhanden.</p>`;
            return;
        }
        
        const { currentUser, userIsAdmin } = getState();
        if (!currentUser) return;

        let currentDay = '';
        bookings.forEach(booking => {
            if (booking.date !== currentDay) {
                const dayHeader = document.createElement('h3');
                const bookingDate = new Date(booking.date + "T00:00:00");
                dayHeader.textContent = bookingDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
                dayHeader.style.marginTop = '15px';
                dayHeader.style.marginBottom = '5px';
                dom.bookingsList.appendChild(dayHeader);
                currentDay = booking.date;
            }

            const isMyParteiBooking = booking.partei === currentUser.userData.partei;
            let actionsHTML = '';

            if (isMyParteiBooking || userIsAdmin) {
                actionsHTML = `<button class="button-small button-danger delete-overview-btn" 
                                data-date="${booking.date}" data-slot="${booking.slot}">Löschen</button>`;
            } else {
                const hasDuplicate = myPartyBookedDates.has(booking.date);
                actionsHTML = `<button class="button-small ${hasDuplicate ? 'button-secondary' : 'button-primary'} swap-request-btn" 
                                data-id="${booking.id}" data-date="${booking.date}" data-slot="${booking.slot}" data-partei="${booking.partei}"
                                ${hasDuplicate ? 'disabled title="Ihre Partei hat an diesem Tag bereits gebucht."' : ''}>
                                Slot anfragen</button>`;
            }

            const item = document.createElement('div');
            item.className = 'booking-item';
            item.innerHTML = `
                <div><strong>${booking.slot}</strong> <span class="small-text ml-10">${booking.partei}</span></div>
                <div class="booking-actions">${actionsHTML}</div>
            `;
            dom.bookingsList.appendChild(item);
        });

        attachOverviewListeners();

    }, (error) => {
        dom.bookingsList.innerHTML = `<p class="small-text" style="color: var(--error-color);">Fehler beim Laden der Wochenbuchungen.</p>`;
    });
    
    unsubscriberSetter('overview', unsubscribe);
}

function attachOverviewListeners() {
    document.querySelectorAll('.delete-overview-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.target.disabled = true;
            e.target.textContent = 'Lösche...';
            await performDeletion(e.target.dataset.date, e.target.dataset.slot, 'overview-message');
        };
    });

    document.querySelectorAll('.swap-request-btn:not([disabled])').forEach(btn => {
        btn.onclick = async (e) => {
            e.target.disabled = true;
            e.target.textContent = 'Angefragt...';
            const { id, date, slot, partei } = e.target.dataset;
            await handleSwapRequest({ id, date, slot, partei }, 'overview-message');
            setTimeout(() => {
                if (e.target) { 
                    e.target.disabled = false;
                    e.target.textContent = 'Slot anfragen';
                }
            }, 3000); 
        };
    });
}