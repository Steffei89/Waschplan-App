import { getDocs, query, orderBy, getBookingsCollectionRef } from '../firebase.js';
import { getState, setCharts, ALL_PARTEIEN, PARTEI_COLORS } from '../state.js';
import { showMessage } from '../ui.js';

let cachedAllBookings = null;

export async function loadStatistics(forceReloadChart = false) {
    const { userIsAdmin } = getState();
    if (!userIsAdmin) {
        showMessage('stats-message', 'Zugriff verweigert.', 'error');
        return;
    }
    if (!forceReloadChart) {
        showMessage('stats-message', 'Lade Statistikdaten...', 'success');
    }
    
    try {
        let allBookings;
        if (forceReloadChart && cachedAllBookings) {
            allBookings = cachedAllBookings;
        } else {
            const q = query(getBookingsCollectionRef(), orderBy("bookedAt", "desc"));
            const querySnapshot = await getDocs(q);
            allBookings = [];
            querySnapshot.forEach(doc => allBookings.push(doc.data()));
            cachedAllBookings = allBookings; 
        }

        if (allBookings.length === 0) {
            showMessage('stats-message', 'Keine Buchungsdaten vorhanden.', 'error');
            document.getElementById('total-bookings-count').textContent = 'Gesamtzahl Buchungen: 0';
            return;
        }

        document.getElementById('total-bookings-count').textContent = `Gesamtzahl Buchungen: ${allBookings.length}`;
        document.getElementById('stats-message').style.display = 'none'; 

        const parteiCounts = {};
        const slotCounts = { '07:00-13:00': 0, '13:00-19:00': 0 };

        allBookings.forEach(b => {
            parteiCounts[b.partei] = (parteiCounts[b.partei] || 0) + 1;
            if (slotCounts.hasOwnProperty(b.slot)) {
                slotCounts[b.slot]++;
            }
        });
        renderParteienChart(parteiCounts);
        renderSlotChart(slotCounts);
    } catch (e) {
        showMessage('stats-message', `Fehler beim Laden der Statistik: ${e.message}`, 'error');
    }
}

function renderParteienChart(parteiCounts) {
    let { parteiChart } = getState();
    if (parteiChart) parteiChart.destroy(); 

    const chartTextColor = getComputedStyle(document.body).getPropertyValue('--text-color') || '#333';
    const dataLabels = ALL_PARTEIEN.filter(p => parteiCounts[p] > 0 || p in parteiCounts);
    const dataValues = dataLabels.map(p => parteiCounts[p] || 0);
    const backgroundColors = dataLabels.map(p => PARTEI_COLORS[p]);
    const ctx = document.getElementById('parteiChart').getContext('2d');
    
    parteiChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: dataLabels,
            datasets: [{
                data: dataValues,
                backgroundColor: backgroundColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            aspectRatio: 1, 
            plugins: {
                legend: { position: 'top', labels: { color: chartTextColor } },
                tooltip: {
                    titleColor: chartTextColor,
                    bodyColor: chartTextColor,
                    backgroundColor: getComputedStyle(document.body).getPropertyValue('--card-background') || 'white', 
                    borderColor: chartTextColor,
                    borderWidth: 1
                }
            }
        }
    });
    setCharts(parteiChart, getState().slotChart);
}

function renderSlotChart(slotCounts) {
    let { slotChart } = getState();
    if (slotChart) slotChart.destroy(); 

    const chartTextColor = getComputedStyle(document.body).getPropertyValue('--text-color') || '#333';
    const chartGridColor = getComputedStyle(document.body).getPropertyValue('--border-color') || 'rgba(128, 128, 128, 0.1)';
    const labels = Object.keys(slotCounts);
    const dataValues = Object.values(slotCounts);
    const totalCount = dataValues.reduce((a, b) => a + b, 0);
    const ctx = document.getElementById('slotChart').getContext('2d');
    
    slotChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Anzahl Buchungen',
                data: dataValues,
                backgroundColor: ['rgba(0, 122, 255, 0.7)', 'rgba(255, 149, 0, 0.7)'],
                borderColor: ['#007AFF', '#FF9500'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, ticks: { color: chartTextColor, stepSize: 1 }, grid: { color: chartGridColor } },
                x: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    titleColor: chartTextColor,
                    bodyColor: chartTextColor,
                    backgroundColor: getComputedStyle(document.body).getPropertyValue('--card-background') || 'white', 
                    borderColor: chartTextColor,
                    borderWidth: 1
                }
            }
        }
    });
    setCharts(getState().parteiChart, slotChart);
    
    const textEl = document.getElementById('slot-stats-text');
    if (totalCount > 0) {
        const percent07 = ((slotCounts['07:00-13:00'] / totalCount) * 100).toFixed(1);
        const percent13 = ((slotCounts['13:00-19:00'] / totalCount) * 100).toFixed(1);
        textEl.innerHTML = `Der Früh-Slot (07-13 Uhr) wurde zu **${percent07}%** und der Spät-Slot (13-19 Uhr) zu **${percent13}%** gebucht (Gesamt: ${totalCount} Buchungen).`;
    } else {
         textEl.innerHTML = 'Keine Slot-Buchungen vorhanden.';
    }
}