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
            html5QrCode.stop().then(() => {
                html5QrCode.clear();
            }).catch(() => {
                html5QrCode.clear();
            });
        } catch (e) { console.warn("Cleanup Fehler:", e); }
        html5QrCode = null; 
    }

    // B. Neue Instanz erstellen
    try {
        // "verbose: false" unterdrückt unnötige Konsolen-Logs
        html5QrCode = new window.Html5Qrcode("reader", false);

        const config = { 
            fps: 20, // Erhöht von 10 auf 20 für flüssigeres Scannen
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0, 
            disableFlip: false,
            // WICHTIG: Nutzt native Android/iOS Scanner-API (viel besser im Dunkeln!)
            experimentalFeatures: {
                useBarCodeDetectorIfSupported: true
            }
        };
        
        // C. Kamera-Einstellungen für bessere Qualität
        const constraints = { 
            facingMode: "environment",
            focusMode: "continuous", // Versucht Autofokus zu erzwingen
            // Bevorzugt HD-Auflösung für mehr Schärfe bei schlechtem Licht
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 }
        };
        
        // Starten
        html5QrCode.start(
            constraints, 
            config,
            (decodedText, decodedResult) => {
                // Erfolg
                stopScanner();
                onSuccess(decodedText);
            },
            (errorMessage) => {
                // Scan-Fehler ignorieren wir im Loop
            }
        ).catch(err => {
            console.error("Kamera-Start Fehler:", err);
            alert("Kamera konnte nicht gestartet werden. Bitte Berechtigung prüfen.");
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
                html5QrCode = null; 
            }).catch(err => {
                console.warn("Stop Fehler:", err);
                try { html5QrCode.clear(); } catch(e){}
                html5QrCode = null;
            });
        } catch(e) {
            html5QrCode = null;
        }
    }
}