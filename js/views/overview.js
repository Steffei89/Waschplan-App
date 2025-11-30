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
    // Back Button mit 'back' Parameter
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
            
            // --- SICHERHEITS-UPDATE: Elemente sicher erstellen (kein innerHTML String-Basteln) ---
            const item = document.createElement('div');
            item.className = 'booking-item';

            // Linker Teil: Slot und Partei
            const infoDiv = document.createElement('div');
            const slotStrong = document.createElement('strong');
            slotStrong.textContent = booking.slot;
            
            const parteiSpan = document.createElement('span');
            parteiSpan.className = 'small-text ml-10';
            parteiSpan.textContent = booking.partei; // Safe Text

            infoDiv.appendChild(slotStrong);
            infoDiv.appendChild(parteiSpan);

            // Rechter Teil: Buttons
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'booking-actions';

            if (isMyParteiBooking || userIsAdmin) {
                const delBtn = document.createElement('button');
                delBtn.className = 'button-small button-danger delete-overview-btn';
                delBtn.textContent = 'Löschen';
                // Daten sicher anhängen
                delBtn.dataset.date = booking.date;
                delBtn.dataset.slot = booking.slot;
                
                delBtn.onclick = async (e) => {
                    e.target.disabled = true;
                    e.target.textContent = 'Lösche...';
                    await performDeletion(booking.date, booking.slot, 'overview-message');
                };
                actionsDiv.appendChild(delBtn);

            } else {
                const hasDuplicate = myPartyBookedDates.has(booking.date);
                const swapBtn = document.createElement('button');
                swapBtn.className = `button-small ${hasDuplicate ? 'button-secondary' : 'button-primary'} swap-request-btn`;
                swapBtn.textContent = 'Slot anfragen';
                
                if (hasDuplicate) {
                    swapBtn.disabled = true;
                    swapBtn.title = "Ihre Partei hat an diesem Tag bereits gebucht.";
                }

                swapBtn.onclick = async (e) => {
                    e.target.disabled = true;
                    e.target.textContent = 'Angefragt...';
                    // Sicherer Aufruf mit Objekt-Daten
                    await handleSwapRequest({ 
                        id: booking.id, 
                        date: booking.date, 
                        slot: booking.slot, 
                        partei: booking.partei 
                    }, 'overview-message');
                    
                    setTimeout(() => {
                        if (e.target) { 
                            e.target.disabled = false;
                            e.target.textContent = 'Slot anfragen';
                        }
                    }, 3000); 
                };
                actionsDiv.appendChild(swapBtn);
            }

            item.appendChild(infoDiv);
            item.appendChild(actionsDiv);
            dom.bookingsList.appendChild(item);
        });

    }, (error) => {
        dom.bookingsList.innerHTML = `<p class="small-text" style="color: var(--error-color);">Fehler beim Laden der Wochenbuchungen.</p>`;
    });
    
    unsubscriberSetter('overview', unsubscribe);
}