// js/services/scanner.js

let html5QrcodeScanner = null;

export function startScanner(onSuccess, onFailure) {
    const modal = document.getElementById('scannerModal');
    const closeBtn = document.getElementById('close-scanner-btn');
    
    if (!modal) return;
    
    modal.style.display = 'flex';
    
    // Initialisiere den Scanner, falls noch nicht geschehen
    if (!html5QrcodeScanner) {
        // Greife auf die globale Variable zu, die durch das Script-Tag in index.html geladen wurde
        html5QrcodeScanner = new window.Html5Qrcode("reader");
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    // Kamera starten
    html5QrcodeScanner.start(
        { facingMode: "environment" }, // Rückkamera bevorzugen
        config,
        (decodedText, decodedResult) => {
            // Erfolg!
            stopScanner();
            onSuccess(decodedText);
        },
        (errorMessage) => {
            // Fehler beim Scannen (passiert ständig beim Suchen, ignorieren wir meistens)
            // onFailure(errorMessage); 
        }
    ).catch(err => {
        console.error("Kamera-Fehler:", err);
        alert("Kamera konnte nicht gestartet werden. Bitte Berechtigung prüfen.");
        stopScanner();
    });

    // Abbrechen Button
    closeBtn.onclick = () => {
        stopScanner();
        if(onFailure) onFailure("cancelled");
    };
}

function stopScanner() {
    const modal = document.getElementById('scannerModal');
    if(modal) modal.style.display = 'none';
    
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            // Gestoppt
        }).catch(err => {
            console.error("Fehler beim Stoppen:", err);
        });
    }
}