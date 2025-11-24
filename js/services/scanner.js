// js/services/scanner.js

// Variable muss null sein zu Beginn
let html5QrCode = null;

export function startScanner(onSuccess, onFailure) {
    const modal = document.getElementById('scannerModal');
    const closeBtn = document.getElementById('close-scanner-btn');
    
    if (!modal) return;
    
    // 1. Modal sofort anzeigen
    modal.style.display = 'flex';
    
    // 2. Timeout erhöht auf 400ms für Sicherheit bei Animationen
    setTimeout(() => {
        // Sicherheitscheck: Hat der User das Modal während des Wartens schon wieder geschlossen?
        if (modal.style.display === 'none') return;

        startCamera(onSuccess, onFailure);
    }, 400);

    // Abbrechen Button
    closeBtn.onclick = () => {
        stopScanner();
        if(onFailure) onFailure("cancelled");
    };
}

function startCamera(onSuccess, onFailure) {
    // A. Aufräumen: Falls noch eine alte Instanz existiert -> Zerstören!
    if (html5QrCode) {
        try {
            // Versuchen zu stoppen, falls er noch läuft
            html5QrCode.stop().then(() => {
                html5QrCode.clear();
            }).catch(() => {
                // Fehler ignorieren, Hauptsache clear
                html5QrCode.clear();
            });
        } catch (e) { console.warn("Cleanup Fehler:", e); }
        html5QrCode = null; // Variable leeren
    }

    // B. Neue Instanz erstellen (WICHTIG: Immer neu erstellen)
    try {
        html5QrCode = new window.Html5Qrcode("reader");

        const config = { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0, // Quadratisch erzwingen hilft iOS
            disableFlip: false 
        };
        
        // C. Starten
        html5QrCode.start(
            { facingMode: "environment" }, 
            config,
            (decodedText, decodedResult) => {
                // Erfolg
                stopScanner();
                onSuccess(decodedText);
            },
            (errorMessage) => {
                // Scan-Fehler im laufenden Betrieb ignorieren wir
            }
        ).catch(err => {
            console.error("Kamera-Start Fehler:", err);
            alert("Kamera konnte nicht gestartet werden. Bitte Seite neu laden.");
            stopScanner();
        });

    } catch (e) {
        console.error("Init Fehler:", e);
        alert("Fehler beim Initialisieren des Scanners.");
        stopScanner();
    }
}

function stopScanner() {
    const modal = document.getElementById('scannerModal');
    if(modal) modal.style.display = 'none';
    
    if (html5QrCode) {
        try {
            html5QrCode.stop().then(() => {
                html5QrCode.clear();
                html5QrCode = null; // WICHTIG: Instanz löschen
            }).catch(err => {
                console.warn("Stop Fehler:", err);
                // Trotzdem versuchen zu clearen
                try { html5QrCode.clear(); } catch(e){}
                html5QrCode = null;
            });
        } catch(e) {
            html5QrCode = null;
        }
    }
}