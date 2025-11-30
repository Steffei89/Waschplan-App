import * as dom from '../dom.js';

let touchStartX = 0;
let touchStartY = 0;
let isInitialized = false;

export function initGestures() {
    if (isInitialized) return;
    isInitialized = true;

    // Wir hören auf den Start der Berührung
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: false });

    // Wir hören auf das Ende der Berührung (Loslassen)
    document.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        handleGesture(touchEndX, touchEndY);
    }, { passive: false });
    
    console.log("Gestensteuerung (Swipe) aktiv.");
}

function handleGesture(endX, endY) {
    const xDiff = endX - touchStartX;
    const yDiff = endY - touchStartY;
    
    // Mindeststrecke in Pixeln, damit es als Wischen zählt (verhindert Wischen beim Tippen)
    const threshold = 60; 
    // Toleranz für schräges Wischen (darf nicht zu vertikal sein, sonst ist es Scrollen)
    const yTolerance = 100;

    // Nur reagieren, wenn die Bewegung deutlich horizontaler als vertikal war
    if (Math.abs(xDiff) > Math.abs(yDiff) && Math.abs(yDiff) < yTolerance) {
        
        if (Math.abs(xDiff) > threshold) {
            if (xDiff > 0) {
                // Wisch nach RECHTS (->)
                onSwipeRight(touchStartX);
            } else {
                // Wisch nach LINKS (<-)
                onSwipeLeft();
            }
        }
    }
}

function onSwipeRight(startX) {
    // 1. "Zurück"-Geste (iOS Style Edge Swipe)
    // Wenn der Wisch ganz links am Rand beginnt (0-40px), ist es immer "Zurück"
    if (startX < 40) {
        const activeCard = document.querySelector('.card.active');
        if (activeCard) {
            // Wir suchen den existierenden "Zurück"-Button und klicken ihn simulativ
            const backBtn = activeCard.querySelector('.back-button');
            if (backBtn) {
                // Kleines Vibrieren als Feedback (wenn Gerät das unterstützt)
                if (navigator.vibrate) navigator.vibrate(10); 
                backBtn.click();
            }
        }
        return; // Fertig, keine weitere Aktion
    }

    // 2. Normale Navigation (Inhalt wechseln)
    
    // Kalender: Wisch nach Rechts -> Vorheriger Monat
    if (dom.calendarSection.classList.contains('active')) {
        const btn = document.getElementById('prev-month-btn');
        if(btn) {
            btn.click(); // Drückt den echten Button
            animateCard('right'); // Kleine visuelle Bestätigung
        }
    } 
    // Übersicht: Wisch nach Rechts -> Vorherige Woche
    else if (dom.overviewSection.classList.contains('active')) {
        changeOverviewWeek(-1);
    }
}

function onSwipeLeft() {
    // Kalender: Wisch nach Links -> Nächster Monat
    if (dom.calendarSection.classList.contains('active')) {
        const btn = document.getElementById('next-month-btn');
        if(btn) {
            btn.click(); // Drückt den echten Button
            animateCard('left');
        }
    } 
    // Übersicht: Wisch nach Links -> Nächste Woche
    else if (dom.overviewSection.classList.contains('active')) {
        changeOverviewWeek(1);
    }
}

function changeOverviewWeek(direction) {
    const select = dom.kwSelect;
    if (!select) return;

    // Wir ändern einfach den Wert im Dropdown, als hätte der Nutzer es getan
    const newIndex = select.selectedIndex + direction;
    
    if (newIndex >= 0 && newIndex < select.options.length) {
        select.selectedIndex = newIndex;
        // Event feuern, damit die App merkt, dass sich was geändert hat
        select.dispatchEvent(new Event('change')); 
        
        animateCard(direction > 0 ? 'left' : 'right');
    }
}

// Lässt die Karte kurz zucken, damit man merkt, dass der Wisch funktioniert hat
function animateCard(direction) {
    const card = document.querySelector('.card.active');
    if(!card) return;
    
    // Wisch-Animation simulieren
    const moveX = direction === 'left' ? '15px' : '-15px';
    
    // Kurz verschieben...
    card.style.transform = `translateX(${moveX})`;
    card.style.transition = 'transform 0.15s ease-out';
    
    // ... und sofort zurückfedern
    setTimeout(() => {
        card.style.transform = 'translateX(0)';
    }, 150);
}