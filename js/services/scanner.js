// js/services/scanner.js

let html5QrCode = null;

export function startScanner(onSuccess, onFailure) {
    const modal = document.getElementById('scannerModal');
    const closeBtn = document.getElementById('close-scanner-btn');
    
    if (!modal) return;
    
    // 1. Modal anzeigen
    modal.style.display = 'flex';
    
    // 2. Timeout geben, damit das DOM sicher bereit ist (iOS braucht das)
    setTimeout(() => {
        // Falls der User wild klickt und es schon wieder zu ist
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
    // A. Aufräumen alter Instanzen
    if (html5QrCode) {
        try {
            html5QrCode.stop().then(() => {
                html5QrCode.clear();
            }).catch(() => {
                html5QrCode.clear();
            });
        } catch (e) { console.warn("Cleanup:", e); }
        html5QrCode = null;
    }

    // B. Instanz erstellen (mit verbose=false für weniger Logs)
    try {
        html5QrCode = new window.Html5Qrcode("reader", false);

        // KONFIGURATION FÜR IOS OPTIMIERT
        const config = { 
            fps: 10,
            // Dynamische Box-Größe: Verhindert Fehler auf kleinen Screens
            qrbox: function(viewfinderWidth, viewfinderHeight) {
                const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                return {
                    width: Math.floor(minEdge * 0.7), // 70% der Breite
                    height: Math.floor(minEdge * 0.7)
                };
            },
            // WICHTIG: aspectRatio WEGLASSEN für iOS!
            // Nutzt native iOS Scanner Engine wenn verfügbar (schneller)
            experimentalFeatures: {
                useBarCodeDetectorIfSupported: true
            }
        };

        // C. Starten - Simple Methode (Beste Kompatibilität)
        html5QrCode.start(
            { facingMode: "environment" }, // Fordert explizit Rückkamera
            config,
            (decodedText) => {
                // Erfolg!
                stopScanner();
                onSuccess(decodedText);
            },
            (errorMessage) => {
                // Scannt gerade nichts... ignorieren.
            }
        ).catch(err => {
            // Fehler-Handling
            console.error("Start Error:", err);
            
            // Spezifische Meldung für den User extrahieren
            let msg = "Kamera-Fehler: " + err;
            if (err.name === "NotAllowedError" || err.toString().includes("Permission")) {
                msg = "Zugriff verweigert! Bitte erlaube den Kamera-Zugriff in den iOS Einstellungen (Safari > Kamera).";
            } else if (err.name === "NotFoundError") {
                msg = "Keine Rückkamera gefunden.";
            } else if (err.toString().includes("OverconstrainedError")) {
                msg = "Kamera-Auflösung nicht unterstützt.";
            }

            alert(msg);
            stopScanner();
        });

    } catch (e) {
        alert("Init-Fehler: " + e);
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
            }).catch(() => {
                try { html5QrCode.clear(); } catch(e){}
                html5QrCode = null;
            });
        } catch(e) {
            html5QrCode = null;
        }
    }
}