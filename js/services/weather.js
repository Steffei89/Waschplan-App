import * as dom from '../dom.js';
import { db, getDoc, doc } from '../firebase.js';

/**
 * Übersetzt den WMO-Wettercode in ein Icon und ein deutsches Label.
 */
function getWeatherDetails(code, isDay = true) {
    let icon, label;
    switch (code) {
        case 0: icon = isDay ? 'fa-sun' : 'fa-moon'; label = 'Klar'; break;
        case 1: case 2: icon = isDay ? 'fa-cloud-sun' : 'fa-cloud-moon'; label = 'Leicht bewölkt'; break;
        case 3: icon = 'fa-cloud'; label = 'Bewölkt'; break;
        case 45: case 48: icon = 'fa-smog'; label = 'Nebel'; break;
        case 51: case 53: case 55: icon = 'fa-cloud-rain'; label = 'Niesel'; break;
        case 61: case 63: case 65: icon = 'fa-cloud-showers-heavy'; label = 'Regen'; break;
        case 66: case 67: icon = 'fa-snowflake'; label = 'Eisregen'; break;
        case 71: case 73: case 75: case 77: icon = 'fa-snowflake'; label = 'Schnee'; break;
        case 80: case 81: case 82: icon = 'fa-cloud-showers-heavy'; label = 'Regenschauer'; break;
        case 85: case 86: icon = 'fa-snowflake'; label = 'Schneeschauer'; break;
        case 95: case 96: case 99: icon = 'fa-cloud-bolt'; label = 'Gewitter'; break;
        default: icon = 'fa-question-circle'; label = 'Unbekannt';
    }
    return { icon: `fa-solid ${icon}`, label };
}

/**
 * Analysiert die 3-Stunden-Prognose für die Trocken-Färbung (Rot/Grün).
 */
function getDryingIndicator(data) {
    try {
        const currentTime = new Date(data.current_weather.time);
        const precipitation = data.hourly.precipitation_probability;
        const hourIndex = data.hourly.time.findIndex(t => new Date(t) >= currentTime);
        if (hourIndex === -1) throw new Error("Aktuelle Zeit nicht in Prognose gefunden.");
        const isDay = data.current_weather.is_day === 1;
        const rainThreshold = 30;
        const prob1 = precipitation[hourIndex] || 0;
        const prob2 = precipitation[hourIndex + 1] || 0;
        const prob3 = precipitation[hourIndex + 2] || 0;
        const willRain = prob1 > rainThreshold || prob2 > rainThreshold || prob3 > rainThreshold;
        
        return { 
            isDry: !willRain, 
            icon: willRain ? 'fa-solid fa-cloud-showers-heavy' : (isDay ? 'fa-solid fa-sun' : 'fa-solid fa-moon'),
            label: willRain ? 'Regen' : 'Trocken'
        };
    } catch (e) {
        console.error("Fehler bei der Wetter-Analyse:", e);
        return { isDry: false, icon: 'fa-solid fa-question', label: 'Fehler' };
    }
}


// --- KOMPLETT ERSETZTE FUNKTION ---
/**
 * Wandelt eine PLZ (für Deutschland) in Koordinaten um.
 * Verwendet den Zippopotam.us Dienst.
 * @param {string} plz - Die deutsche Postleitzahl.
 * @returns {object|null} Ein Objekt {latitude, longitude, name} oder null.
 */
async function getCoordinatesForPlz(plz) {
    // Wir verwenden einen API-Dienst, der auf PLZ spezialisiert ist (hier für DE = Deutschland)
    const url = `https://api.zippopotam.us/DE/${plz}`;
    
    try {
        const response = await fetch(url);
        
        // Zippopotam.us gibt 404 zurück, wenn die PLZ nicht gefunden wird
        if (!response.ok) {
            if (response.status === 404) {
                 throw new Error(`PLZ ${plz} nicht gefunden.`);
            }
            throw new Error("Geocoding-Antwort nicht OK");
        }
        
        const data = await response.json();
        
        // Prüfen, ob Ergebnisse gefunden wurden
        if (data && data.places && data.places.length > 0) {
            const location = data.places[0];
            return {
                // Die API liefert Strings, wir wandeln sie in Zahlen um
                latitude: parseFloat(location.latitude),
                longitude: parseFloat(location.longitude),
                name: location["place name"] // z.B. "Schönau a. Königssee"
            };
        } else {
            throw new Error(`Keine Koordinaten für PLZ ${plz} gefunden (ungültige Antwort).`);
        }
    } catch (error) {
        console.error("Geocoding-Fehler:", error);
        // Wir geben den Fehler weiter, damit loadWeather ihn fangen kann
        throw error; 
    }
}
// --- ENDE DER ERSETZTEN FUNKTION ---


/**
 * Lädt das Wetter, setzt das aktuelle Icon/Label UND die 3-Stunden-Prognosefarbe.
 */
export async function loadWeather() {
    const widgetEl = dom.weatherWidget;
    const tempEl = document.getElementById('weather-temp'); 
    const labelEl = document.getElementById('weather-label');
    const iconEl = document.getElementById('weather-icon');

    if (!widgetEl || !labelEl || !iconEl || !tempEl) return; 

    // Reset-Zustand (Laden)
    widgetEl.className = '';
    iconEl.className = 'fa-solid fa-spinner fa-spin';
    labelEl.textContent = 'Lade...';
    tempEl.textContent = '--'; 
    widgetEl.title = 'Wetter wird geladen...';

    try {
        // 1. Gespeicherte PLZ aus Firestore holen
        const settingsRef = doc(db, 'app_settings', 'config');
        const settingsSnap = await getDoc(settingsRef);

        if (!settingsSnap.exists() || !settingsSnap.data().plz) {
            throw new Error("Kein Wetter-Standort (PLZ) vom Admin festgelegt.");
        }
        
        const plz = settingsSnap.data().plz;

        // 2. PLZ in Koordinaten umwandeln (mit der NEUEN Funktion)
        const coords = await getCoordinatesForPlz(plz);
        // (Wenn coords null wäre, hätte die Funktion bereits einen Fehler geworfen)

        // 3. Wetter mit den Koordinaten abrufen
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current_weather=true&hourly=precipitation_probability&timezone=auto&forecast_days=2`;
        
        const response = await fetch(weatherUrl);
        if (!response.ok) throw new Error('Wetterdaten-Antwort nicht ok');
        
        const data = await response.json();
        
        if (data && data.current_weather && data.hourly && data.hourly.precipitation_probability) {
            const cw = data.current_weather;

            // 4. Aktuelle Temperatur setzen
            tempEl.textContent = Math.round(cw.temperature);

            // 5. AKTUELLES Wetter (Icon & Label) setzen
            const { icon, label } = getWeatherDetails(cw.weathercode, cw.is_day === 1);
            labelEl.textContent = label;
            iconEl.className = icon; 
            widgetEl.title = `Aktuelles Wetter für ${coords.name} (${plz})`;

            // 6. 3-Stunden-Prognose (Farbe) setzen
            const forecast = getDryingIndicator(data);
            widgetEl.classList.add(forecast.isDry ? 'is-dry' : 'is-wet');
            
        } else {
            throw new Error("Unvollständige Wetterdaten erhalten.");
        }
    } catch (error) {
        console.error("Wetter-Widget-Fehler:", error);
        labelEl.textContent = "Fehler";
        tempEl.textContent = "!"; 
        iconEl.className = 'fa-solid fa-circle-xmark'; 
        widgetEl.classList.add('is-wet'); 
        widgetEl.title = error.message; 
    }
}