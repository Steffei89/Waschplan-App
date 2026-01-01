import * as dom from '../dom.js';
import { db, getDoc, doc } from '../firebase.js';

let weatherCache = null;
let lastFetchTime = 0;
const CACHE_DURATION = 10 * 60 * 1000; 

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

function getDryingIndicator(data) {
    try {
        const currentTime = new Date();
        const precipitation = data.hourly.precipitation_probability;
        const timeArray = data.hourly.time;
        const hourIndex = timeArray.findIndex(t => new Date(t).getHours() === currentTime.getHours());
        
        if (hourIndex === -1) return { isDry: true, icon: 'fa-solid fa-sun', label: 'Trocken' };

        const isDay = data.current_weather.is_day === 1;
        const rainThreshold = 30;
        const prob1 = precipitation[hourIndex] || 0;
        const prob2 = precipitation[hourIndex + 1] || 0;
        const prob3 = precipitation[hourIndex + 2] || 0;
        const willRain = prob1 > rainThreshold || prob2 > rainThreshold || prob3 > rainThreshold;
        
        return { isDry: !willRain, icon: willRain ? 'fa-solid fa-cloud-showers-heavy' : (isDay ? 'fa-solid fa-sun' : 'fa-solid fa-moon'), label: willRain ? 'Regen' : 'Trocken' };
    } catch (e) {
        return { isDry: false, icon: 'fa-solid fa-question', label: 'Fehler' };
    }
}

async function getCoordinatesForPlz(plz) {
    const url = `https://api.zippopotam.us/DE/${plz}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) throw new Error(`PLZ ${plz} nicht gefunden.`);
            throw new Error("Geocoding-Antwort nicht OK");
        }
        const data = await response.json();
        if (data && data.places && data.places.length > 0) {
            const location = data.places[0];
            return { latitude: parseFloat(location.latitude), longitude: parseFloat(location.longitude), name: location["place name"] };
        } else { throw new Error(`Keine Koordinaten für PLZ ${plz} gefunden.`); }
    } catch (error) { throw error; }
}

async function fetchWeatherData() {
    if (weatherCache && (Date.now() - lastFetchTime < CACHE_DURATION)) { return weatherCache; }
    
    // Sicherer Zugriff auf Einstellungen
    try {
        const settingsRef = doc(db, 'app_settings', 'config');
        const settingsSnap = await getDoc(settingsRef);
        
        if (!settingsSnap.exists() || !settingsSnap.data().plz) { return null; }
        
        const plz = settingsSnap.data().plz;
        const coords = await getCoordinatesForPlz(plz);
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current_weather=true&hourly=precipitation_probability&daily=weathercode&timezone=auto&forecast_days=7`;
        const response = await fetch(weatherUrl);
        if (!response.ok) throw new Error('Wetterdaten-Antwort nicht ok');
        const data = await response.json();
        weatherCache = { data, coords, plz };
        lastFetchTime = Date.now();
        return weatherCache;
    } catch (e) {
        console.warn("Wetter-Datenbank Zugriff verweigert oder Fehler:", e.message);
        throw e; // Weiterwerfen, damit loadWeather es fangen kann
    }
}

export async function loadWeather() {
    const widgetEl = dom.weatherWidget;
    const tempEl = document.getElementById('weather-temp'); 
    const labelEl = document.getElementById('weather-label'); 
    const iconEl = document.getElementById('weather-icon');

    if (!widgetEl) return;

    widgetEl.style.display = 'flex';
    widgetEl.className = '';
    iconEl.className = 'fa-solid fa-spinner fa-spin';
    if(labelEl) labelEl.textContent = 'Lade...';
    tempEl.textContent = '--'; 
    widgetEl.title = 'Wetter wird geladen...';

    try {
        const result = await fetchWeatherData();
        if (!result) { 
            widgetEl.style.display = 'none'; // Verstecken wenn keine Daten
            return; 
        }

        const { data, coords, plz } = result;
        const cw = data.current_weather;

        tempEl.textContent = Math.round(cw.temperature);
        const { icon, label } = getWeatherDetails(cw.weathercode, cw.is_day === 1);
        if(labelEl) labelEl.textContent = label;
        iconEl.className = icon; 
        widgetEl.title = `Aktuelles Wetter für ${coords.name} (${plz})`;

        const forecast = getDryingIndicator(data);
        widgetEl.classList.add(forecast.isDry ? 'is-dry' : 'is-wet');

    } catch (error) {
        // Bei Fehler einfach Widget ausblenden statt Fehler anzuzeigen
        console.warn("Wetter Widget ausgeblendet wegen Fehler:", error);
        widgetEl.style.display = 'none'; 
    }
}

export async function isEcoDay(dateStr) {
    try {
        const result = await fetchWeatherData();
        if (!result || !result.data || !result.data.daily) return false;
        const daily = result.data.daily;
        const index = daily.time.indexOf(dateStr);
        if (index === -1) return false; 
        const code = daily.weathercode[index];
        return (code === 0 || code === 1 || code === 2);
    } catch (e) { return false; }
}