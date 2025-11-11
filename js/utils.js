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