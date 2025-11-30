import * as dom from '../dom.js';
import { navigateTo } from '../ui.js';

let touchStartX = 0;
let touchStartY = 0;
let isInitialized = false;

export function initGestures() {
    if (isInitialized) return;
    isInitialized = true;

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        handleGesture(touchEndX, touchEndY);
    }, { passive: false });
    
    console.log("Gestensteuerung aktiviert.");
}

function handleGesture(endX, endY) {
    const xDiff = endX - touchStartX;
    const yDiff = endY - touchStartY;
    
    const threshold = 50;  // Mindeststrecke in Pixeln
    const yTolerance = 100; // Toleranz vertikal

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
    // 1. "Zurück"-Geste (Wisch vom linken Rand)
    if (startX < 60) {
        const activeCard = document.querySelector('.card.active');
        // Wenn wir nicht im Hauptmenü sind, gehen wir zurück
        if (activeCard && activeCard.id !== 'mainMenu') {
            if (navigator.vibrate) navigator.vibrate(10); 
            // Nutzt die neue 'back' Animation im ui.js
            navigateTo(dom.mainMenu, 'back');
        }
        return; 
    }

    // 2. Normale Navigation (Kalender / Übersicht blättern)
    // Wir nutzen hier das CSS-Bounce-Feedback, aber keine ViewTransition für das interne Element
    if (dom.calendarSection.classList.contains('active')) {
        const btn = document.getElementById('prev-month-btn');
        if(btn) {
            btn.click(); 
            animateCard('right'); // Visuelles Feedback
        }
    } 
    else if (dom.overviewSection.classList.contains('active')) {
        changeOverviewWeek(-1);
        animateCard('right'); // Visuelles Feedback
    }
}

function onSwipeLeft() {
    if (dom.calendarSection.classList.contains('active')) {
        const btn = document.getElementById('next-month-btn');
        if(btn) {
            btn.click(); 
            animateCard('left'); // Visuelles Feedback
        }
    } 
    else if (dom.overviewSection.classList.contains('active')) {
        changeOverviewWeek(1);
        animateCard('left'); // Visuelles Feedback
    }
}

function changeOverviewWeek(direction) {
    const select = dom.kwSelect;
    if (!select) return;

    const newIndex = select.selectedIndex + direction;
    
    if (newIndex >= 0 && newIndex < select.options.length) {
        select.selectedIndex = newIndex;
        select.dispatchEvent(new Event('change')); 
    }
}

// Diese Funktion fügt die CSS-Klassen für den "Bounce"-Effekt hinzu
function animateCard(direction) {
    const card = document.querySelector('.card.active');
    if(!card) return;
    
    // Alte Klassen entfernen, falls sie noch da sind (für schnelles Wischen)
    card.classList.remove('anim-swipe-left', 'anim-swipe-right');
    
    // Browser zwingen, den Style neu zu berechnen (damit die Animation neu startet)
    void card.offsetWidth; 
    
    // Richtige Klasse hinzufügen
    if (direction === 'left') {
        card.classList.add('anim-swipe-left');
    } else {
        card.classList.add('anim-swipe-right');
    }
    
    // Aufräumen: Klasse nach der Animation wieder entfernen
    setTimeout(() => {
        card.classList.remove('anim-swipe-left', 'anim-swipe-right');
    }, 400); // 400ms entspricht der Animationsdauer in CSS
}