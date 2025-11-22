export function getFormattedDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

export function getMonday(year, week) {
    const date = new Date(year, 0, 1 + (week - 1) * 7);
    const startOfWeek = new Date(date);
    startOfWeek.setDate(startOfWeek.getDate() - (startOfWeek.getDay() || 7) + 1); 
    return startOfWeek;
}

export function formatDate(date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) 
        month = '0' + month;
    if (day.length < 2) 
        day = '0' + day;

    return [year, month, day].join('-');
}

export const today = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
})();

export const tomorrow = (() => {
    const t = new Date(today);
    t.setDate(today.getDate() + 1);
    return t;
})();

// ===== NEUE FUNKTION: iCal Export =====
export function createAndDownloadIcsFile(dateStr, slotStr) {
    // dateStr: "2025-11-20"
    // slotStr: "07:00-13:00"
    
    const [startHour, endHour] = slotStr.split('-'); // ["07:00", "13:00"]
    
    // Formatiere Datum ohne Bindestriche: 20251120
    const dateClean = dateStr.replace(/-/g, '');
    
    // Formatiere Zeit: 070000
    const startTimeClean = startHour.replace(':', '') + '00';
    const endTimeClean = endHour.replace(':', '') + '00';
    
    const startDateTime = `${dateClean}T${startTimeClean}`;
    const endDateTime = `${dateClean}T${endTimeClean}`;
    
    const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//WaschplanApp//DE',
        'BEGIN:VEVENT',
        `DTSTART:${startDateTime}`,
        `DTEND:${endDateTime}`,
        'SUMMARY:Waschküche gebucht',
        'DESCRIPTION:Dein Slot in der Waschplan App.',
        'LOCATION:Waschkeller',
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `waschplan_${dateStr}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
// ======================================