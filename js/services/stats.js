import { getDocs, query, orderBy, getBookingsCollectionRef, doc, setDoc, increment, db, collection, where } from '../firebase.js';
import * as dom from '../dom.js';
import { navigateTo } from '../ui.js';
import { getState } from '../state.js';
import { showMessage } from '../ui.js';
import { ALL_PARTEIEN, PARTEI_COLORS } from '../state.js';
import { KARMA_START } from '../config.js';
import { FEATURE_PUBLIC_HEATMAP, FEATURE_PUBLIC_USER_STATS, FEATURE_PUBLIC_GAME_STATS } from '../config.js';

let cachedAllBookings = null;
let chartInstances = {}; 

function destroyAllCharts() {
    Object.values(chartInstances).forEach(chart => {
        if (chart) chart.destroy();
    });
    chartInstances = {};
}

function filterBookings(allBookings, filter) {
    const now = new Date();
    switch (filter) {
        case 'ytd': 
            const currentYear = now.getFullYear();
            return allBookings.filter(b => new Date(b.date).getFullYear() === currentYear);
        case '6m': 
            const sixMonthsAgo = new Date(now.setMonth(now.getMonth() - 6));
            return allBookings.filter(b => new Date(b.date) >= sixMonthsAgo);
        case '30d': 
            const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
            return allBookings.filter(b => new Date(b.date) >= thirtyDaysAgo);
        case 'all': 
        default:
            return allBookings;
    }
}

export function initStatsView() {
    const filterSelect = document.getElementById('stats-filter');
    if (filterSelect) {
        filterSelect.addEventListener('change', () => {
            loadStatistics(true); 
        });
    }
}

export async function trackMenuClick(counterName) {
    try {
        const statsDocRef = doc(db, "usage_stats", "global_counters");
        await setDoc(statsDocRef, {
            [counterName]: increment(1),
            last_updated: new Date().toISOString()
        }, { merge: true });
    } catch (e) {
        console.warn("Tracking fehlgeschlagen:", e);
    }
}

function getChartColors() {
    const style = getComputedStyle(document.body);
    return {
        textColor: style.getPropertyValue('--text-color').trim() || '#333',
        gridColor: style.getPropertyValue('--border-color').trim() || 'rgba(128, 128, 128, 0.1)',
        tooltipBg: style.getPropertyValue('--card-background').trim() || 'white',
        primary: style.getPropertyValue('--primary-color').trim() || '#007AFF',
        success: style.getPropertyValue('--success-color').trim() || '#34c759',
        error: style.getPropertyValue('--error-color').trim() || '#ff3b30',
        primaryTransparent: style.getPropertyValue('--primary-color-transparent').trim() || 'rgba(0, 122, 255, 0.5)',
        secondary: '#8e8e93'
    };
}

export async function loadStatistics(useCachedData = false) {
    const { userIsAdmin } = getState();

    destroyAllCharts();

    if (!useCachedData) {
        showMessage('admin-message', 'Lade Statistikdaten...', 'success');
    }
    
    try {
        let allBookings;
        if (useCachedData && cachedAllBookings) {
            allBookings = cachedAllBookings;
        } else {
            const q = query(getBookingsCollectionRef(), orderBy("bookedAt", "desc"));
            const querySnapshot = await getDocs(q);
            allBookings = [];
            querySnapshot.forEach(doc => allBookings.push(doc.data()));
            cachedAllBookings = allBookings; 
        }

        await loadKarmaStats();
        await loadAdvancedStats(allBookings, userIsAdmin);

        if (allBookings.length === 0) {
            document.getElementById('kpi-total-bookings').textContent = '0';
            return;
        }

        const filterValue = document.getElementById('stats-filter').value;
        const filteredBookings = filterBookings(allBookings, filterValue);
        
        const msgBox = document.getElementById('admin-message');
        if(msgBox) msgBox.style.display = 'none';

        const { parteiCounts, slotCounts, monthCounts, dayOfWeekCounts } = processBookingData(filteredBookings, filterValue);
        
        renderKpis(filteredBookings, parteiCounts, dayOfWeekCounts);
        renderParteienChart(parteiCounts);
        renderSlotChart(slotCounts);
        renderBookingsOverTimeChart(monthCounts, filterValue);
        renderDayOfWeekChart(dayOfWeekCounts);

    } catch (e) {
        console.error("Statistik-Fehler:", e);
    }
}

async function loadAdvancedStats(allBookings, isAdmin) {
    const container = document.getElementById('advanced-stats-container');
    
    const showHeatmap = isAdmin || FEATURE_PUBLIC_HEATMAP;
    const showUserStats = isAdmin || FEATURE_PUBLIC_USER_STATS;
    const showGameStats = isAdmin || FEATURE_PUBLIC_GAME_STATS;

    if (!showHeatmap && !showUserStats && !showGameStats) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';

    if (showHeatmap) {
        document.getElementById('stats-heatmap-wrapper').style.display = 'block';
        renderHeatmap(allBookings);
    }

    if (showUserStats || showGameStats) {
        try {
            const sessionsSnap = await getDocs(collection(db, "analytics_sessions"));
            const sessions = [];
            sessionsSnap.forEach(d => sessions.push(d.data()));
            
            const gamesSnap = await getDocs(collection(db, "analytics_games"));
            const games = [];
            gamesSnap.forEach(d => games.push(d.data()));

            const usersSnap = await getDocs(collection(db, "users"));
            const userMap = {}; 
            usersSnap.forEach(doc => {
                const d = doc.data();
                userMap[doc.id] = d.username || d.email; 
            });

            if (showUserStats) {
                document.getElementById('stats-user-lists-wrapper').style.display = 'block';
                renderUserLists(allBookings, sessions, games, userMap);
            }

            if (showGameStats) {
                document.getElementById('stats-game-balancing-wrapper').style.display = 'block';
                renderGameBalancingChart(games);
            }

        } catch (e) {
            console.error("Fehler beim Laden der erweiterten Daten:", e);
        }
    }
}

function renderUserLists(bookings, sessions, games, userMap) {
    const bookingCounts = {};
    bookings.forEach(b => bookingCounts[b.partei] = (bookingCounts[b.partei] || 0) + 1);
    const sortedBookers = Object.entries(bookingCounts).sort((a,b) => b[1] - a[1]).slice(0,3);
    let htmlBookers = sortedBookers.map((entry, i) => `${i+1}. ${entry[0]} (${entry[1]})`).join('<br>');
    document.getElementById('list-top-washers').innerHTML = htmlBookers || '-';

    const sessionCounts = {};
    sessions.forEach(s => {
        if (s.userId) {
            sessionCounts[s.userId] = (sessionCounts[s.userId] || 0) + 1;
        } else {
            const key = s.email || s.partei;
            sessionCounts[key] = (sessionCounts[key] || 0) + 1;
        }
    });

    const sortedUsers = Object.entries(sessionCounts).sort((a,b) => b[1] - a[1]).slice(0,3);
    
    let htmlUsers = sortedUsers.map((entry, i) => {
        const idOrName = entry[0];
        let displayName = idOrName;
        if (userMap[idOrName]) displayName = userMap[idOrName];
        if (displayName.includes('@')) displayName = displayName.split('@')[0];
        return `${i+1}. ${displayName} (${entry[1]}x)`;
    }).join('<br>');
    document.getElementById('list-top-users').innerHTML = htmlUsers || '-';

    const userGameScores = {}; 
    games.forEach(g => {
        const uid = g.userId;
        if (!uid) return;
        if (!userGameScores[uid]) userGameScores[uid] = [];
        userGameScores[uid].push(g.score);
    });
    
    const avgScores = [];
    for (const [uid, scores] of Object.entries(userGameScores)) {
        if(scores.length < 3) continue; 
        const sum = scores.reduce((a,b) => a+b, 0);
        const avg = Math.round(sum / scores.length);
        let name = userMap[uid] || "Unbekannt";
        if (name === "Unbekannt") {
            const sampleGame = games.find(g => g.userId === uid);
            if (sampleGame && sampleGame.email) name = sampleGame.email;
        }
        if(name.includes('@')) name = name.split('@')[0];
        avgScores.push({ name, avg });
    }
    avgScores.sort((a,b) => b.avg - a.avg);
    let htmlGamers = avgScores.slice(0,3).map((e, i) => `${i+1}. <strong>${e.name}</strong> (Ø ${e.avg})`).join('<br>');
    document.getElementById('list-top-gamers').innerHTML = htmlGamers || '-';
}

function renderGameBalancingChart(games) {
    const ctx = document.getElementById('gameBalancingChart').getContext('2d');
    const colors = getChartColors(); 
    
    const scatterData = games.map(g => ({
        x: g.duration_seconds || 0,
        y: g.score || 0
    })).filter(p => p.x > 5 && p.y > 0);

    chartInstances.gameBalancingChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Spielrunden',
                data: scatterData,
                backgroundColor: colors.primary 
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: { 
                    type: 'linear', position: 'bottom', 
                    title: { display: true, text: 'Dauer (Sek)', color: colors.textColor },
                    ticks: { color: colors.textColor },
                    grid: { color: colors.gridColor }
                },
                y: { 
                    title: { display: true, text: 'Score', color: colors.textColor },
                    ticks: { color: colors.textColor },
                    grid: { color: colors.gridColor }
                }
            },
            plugins: {
                legend: { labels: { color: colors.textColor } }
            }
        }
    });
}

function renderHeatmap(bookings) {
    const container = document.getElementById('heatmap-container');
    container.innerHTML = '';
    const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']; 
    const slots = ['07:00-13:00', '13:00-19:00'];
    const data = Array(2).fill(0).map(() => Array(7).fill(0));
    let maxVal = 1;

    bookings.forEach(b => {
        const date = new Date(b.date);
        let dayIdx = date.getDay() - 1; 
        if (dayIdx === -1) dayIdx = 6; 
        let slotIdx = -1;
        if (b.slot === '07:00-13:00') slotIdx = 0;
        if (b.slot === '13:00-19:00') slotIdx = 1;
        if (slotIdx > -1) {
            data[slotIdx][dayIdx]++;
            if (data[slotIdx][dayIdx] > maxVal) maxVal = data[slotIdx][dayIdx];
        }
    });

    const colors = getChartColors();

    let html = `<table style="width:100%; border-collapse: collapse; font-size: 0.85em; color: ${colors.textColor};">`;
    html += '<tr><th></th>' + days.map(d => `<th style="padding:5px;">${d}</th>`).join('') + '</tr>';

    slots.forEach((slotName, r) => {
        html += `<tr><td style="font-weight:bold; padding:5px;">${slotName.substr(0,5)}</td>`;
        for (let c = 0; c < 7; c++) {
            const val = data[r][c];
            const intensity = val / maxVal;
            const alpha = Math.max(0.1, intensity); 
            const color = `rgba(255, 59, 48, ${alpha})`; 
            html += `<td style="background:${color}; color:${intensity > 0.6 ? 'white' : colors.textColor}; text-align:center; padding:8px; border:1px solid ${colors.gridColor}; border-radius:4px;">
                        ${val > 0 ? val : ''}
                     </td>`;
        }
        html += '</tr>';
    });
    html += '</table>';
    container.innerHTML = html;
}

async function loadKarmaStats() {
    try {
        const partiesSnap = await getDocs(collection(db, "parties"));
        const karmaData = {};
        ALL_PARTEIEN.forEach(p => karmaData[p] = KARMA_START);
        partiesSnap.forEach(doc => {
            if (ALL_PARTEIEN.includes(doc.id)) karmaData[doc.id] = doc.data().karma;
        });
        renderKarmaChart(karmaData);
    } catch (e) { console.error(e); }
}

function renderKarmaChart(karmaData) {
    const colors = getChartColors();
    const ctx = document.getElementById('karmaChart').getContext('2d');
    const labels = ALL_PARTEIEN;
    const data = labels.map(p => karmaData[p]);
    const bgColors = labels.map(p => PARTEI_COLORS[p]);

    chartInstances.karmaChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Karma',
                data: data,
                backgroundColor: bgColors,
                borderWidth: 1, borderRadius: 5
            }]
        },
        options: {
            indexAxis: 'y', responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { 
                    grid: { color: colors.gridColor }, 
                    ticks: { color: colors.textColor }, 
                    suggestedMin: 0, suggestedMax: 150 
                },
                y: { 
                    grid: { display: false }, 
                    ticks: { color: colors.textColor } 
                }
            }
        }
    });
}

function processBookingData(filteredBookings, filterValue) {
    const parteiCounts = {};
    const slotCounts = { '07:00-13:00': 0, '13:00-19:00': 0 };
    const monthCounts = {}; 
    const dayOfWeekCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }; 
    const monthLabels = getMonthLabels(filterValue);
    monthLabels.forEach(label => monthCounts[label] = 0); 
    filteredBookings.forEach(b => {
        parteiCounts[b.partei] = (parteiCounts[b.partei] || 0) + 1;
        if (slotCounts.hasOwnProperty(b.slot)) slotCounts[b.slot]++;
        const bookingDate = new Date(b.date);
        const monthKey = `${bookingDate.getFullYear()}-${String(bookingDate.getMonth() + 1).padStart(2, '0')}`;
        if (monthCounts.hasOwnProperty(monthKey)) monthCounts[monthKey]++;
        const dayIndex = bookingDate.getDay(); 
        dayOfWeekCounts[dayIndex]++;
    });
    return { parteiCounts, slotCounts, monthCounts, dayOfWeekCounts };
}

function renderKpis(filteredBookings, parteiCounts, dayOfWeekCounts) {
    document.getElementById('kpi-total-bookings').textContent = filteredBookings.length;
    const mostActivePartei = Object.keys(parteiCounts).reduce((a, b) => parteiCounts[a] > parteiCounts[b] ? a : b, 'N/A');
    document.getElementById('kpi-most-active').textContent = mostActivePartei;
    const dayLabels = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const mostPopularDayIndex = Object.keys(dayOfWeekCounts).reduce((a, b) => dayOfWeekCounts[a] > dayOfWeekCounts[b] ? a : b);
    document.getElementById('kpi-most-popular-day').textContent = dayLabels[mostPopularDayIndex];
}

function getMonthLabels(filter) {
    const labels = [];
    const now = new Date();
    let count = 0;
    if (filter === 'ytd') count = now.getMonth() + 1;
    else if (filter === '6m') count = 6;
    else if (filter === '30d') count = 1; 
    else if (filter === 'all') count = 12; 
    if (filter === '30d') count = 1;
    for (let i = count - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    if (filter === 'all' && labels.length === 0) labels.push(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    return labels;
}

function renderParteienChart(parteiCounts) {
    const colors = getChartColors();
    const dataLabels = ALL_PARTEIEN.filter(p => parteiCounts[p] > 0 || p in parteiCounts);
    const dataValues = dataLabels.map(p => parteiCounts[p] || 0);
    const backgroundColors = dataLabels.map(p => PARTEI_COLORS[p]);
    const ctx = document.getElementById('parteiChart').getContext('2d');
    chartInstances.parteiChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: dataLabels, datasets: [{ data: dataValues, backgroundColor: backgroundColors, borderWidth: 1, borderColor: colors.tooltipBg }] },
        options: { 
            responsive: true, aspectRatio: 1.5, 
            plugins: { 
                legend: { position: 'top', labels: { color: colors.textColor } } 
            } 
        }
    });
}

function renderSlotChart(slotCounts) {
    const colors = getChartColors();
    const labels = Object.keys(slotCounts);
    const dataValues = Object.values(slotCounts);
    const ctx = document.getElementById('slotChart').getContext('2d');
    
    chartInstances.slotChart = new Chart(ctx, {
        type: 'bar',
        data: { 
            labels: labels, 
            datasets: [{ 
                label: 'Anzahl Buchungen', 
                data: dataValues, 
                backgroundColor: [colors.primary, colors.secondary], 
                borderWidth: 1 
            }] 
        },
        options: { 
            responsive: true, 
            scales: { 
                y: { 
                    beginAtZero: true, 
                    ticks: { color: colors.textColor, stepSize: 1 }, 
                    grid: { color: colors.gridColor } 
                }, 
                x: { 
                    ticks: { color: colors.textColor }, 
                    grid: { color: colors.gridColor } 
                } 
            }, 
            plugins: { legend: { display: false } } 
        }
    });
    
    const textEl = document.getElementById('slot-stats-text');
    const totalCount = dataValues.reduce((a, b) => a + b, 0);
    if (totalCount > 0) {
        const percent07 = ((slotCounts['07:00-13:00'] / totalCount) * 100).toFixed(1);
        const percent13 = ((slotCounts['13:00-19:00'] / totalCount) * 100).toFixed(1);
        textEl.innerHTML = `Der Früh-Slot wurde zu **${percent07}%** und der Spät-Slot zu **${percent13}%** gebucht.`;
    } else { textEl.innerHTML = 'Keine Daten.'; }
}

function renderBookingsOverTimeChart(monthCounts, filterValue) {
    const colors = getChartColors();
    const labels = Object.keys(monthCounts);
    const dataValues = Object.values(monthCounts);
    const container = document.getElementById('bookingsOverTimeChart').parentElement.parentElement;
    if (filterValue === '30d') { container.style.display = 'none'; return; }
    container.style.display = 'block';
    
    const ctx = document.getElementById('bookingsOverTimeChart').getContext('2d');
    chartInstances.bookingsOverTimeChart = new Chart(ctx, {
        type: 'line',
        data: { 
            labels: labels, 
            datasets: [{ 
                label: 'Buchungen pro Monat', 
                data: dataValues, 
                fill: false, 
                borderColor: colors.primary, 
                tension: 0.1 
            }] 
        },
        options: { 
            responsive: true, 
            scales: { 
                y: { 
                    beginAtZero: true, 
                    ticks: { color: colors.textColor }, 
                    grid: { color: colors.gridColor } 
                }, 
                x: { 
                    ticks: { color: colors.textColor }, 
                    grid: { color: colors.gridColor } 
                } 
            }, 
            plugins: { legend: { display: false } } 
        }
    });
}

function renderDayOfWeekChart(dayOfWeekCounts) {
    const colors = getChartColors();
    const labels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    const dataValues = [dayOfWeekCounts[1], dayOfWeekCounts[2], dayOfWeekCounts[3], dayOfWeekCounts[4], dayOfWeekCounts[5], dayOfWeekCounts[6], dayOfWeekCounts[0]];
    
    const ctx = document.getElementById('dayOfWeekChart').getContext('2d');
    chartInstances.dayOfWeekChart = new Chart(ctx, {
        type: 'bar',
        data: { 
            labels: labels, 
            datasets: [{ 
                label: 'Wochentage', 
                data: dataValues, 
                backgroundColor: colors.success, 
                borderWidth: 1 
            }] 
        },
        options: { 
            responsive: true, 
            scales: { 
                y: { 
                    beginAtZero: true, 
                    ticks: { color: colors.textColor }, 
                    grid: { color: colors.gridColor } 
                }, 
                x: { 
                    ticks: { color: colors.textColor }, 
                    grid: { color: colors.gridColor } 
                } 
            }, 
            plugins: { legend: { display: false } } 
        }
    });
}

// ========== GEÄNDERTE FUNKTION ==========
/**
 * Lädt die Statistik für die PARTEI des Users.
 * @param {string} parteiName - Der Name der Partei.
 * @returns {Promise<object>} Objekt mit { totalBookings, favoriteDay }
 */
export async function getPartyStats(parteiName) {
    if (!parteiName) return null;

    try {
        // HIER WURDE GEÄNDERT: 'where("partei", "==", parteiName)' statt 'userId'
        const q = query(collection(db, "bookings"), where("partei", "==", parteiName));
        const snapshot = await getDocs(q);
        const bookings = [];
        snapshot.forEach(d => bookings.push(d.data()));

        // Filter: Nur aktuelles Jahr
        const currentYear = new Date().getFullYear();
        const thisYearBookings = bookings.filter(b => new Date(b.date).getFullYear() === currentYear);

        // 1. Anzahl
        const totalCount = thisYearBookings.length;

        // 2. Lieblingstag ermitteln
        const dayCounts = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
        thisYearBookings.forEach(b => {
            const date = new Date(b.date);
            const day = date.getDay(); 
            dayCounts[day]++;
        });

        // Tag mit den meisten Buchungen finden
        let maxVal = -1;
        let favDayIndex = -1;
        for (let i = 0; i <= 6; i++) {
            if (dayCounts[i] > maxVal) {
                maxVal = dayCounts[i];
                favDayIndex = i;
            }
        }

        const dayNames = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
        const favoriteDay = maxVal > 0 ? dayNames[favDayIndex] : "-";

        return {
            totalBookings: totalCount,
            favoriteDay: favoriteDay
        };

    } catch (e) {
        console.error("Fehler beim Laden der Partei-Statistik:", e);
        return null;
    }
}