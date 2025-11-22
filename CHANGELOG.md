# Änderungsprotokoll (Changelog)

Hier werden alle wichtigen Änderungen an der Waschplan-App festgehalten.

## [2.8.1] - 2025-11-23

### 🐛 Bugfixes & Stabilität
Dieses Update behebt wichtige Fehler in der Navigation und im Admin-Bereich.

*** Live-Timer & Navigation:** Ein Fehler wurde behoben, der dazu führte, dass der Live-Timer und die Anzeige der aktuellen Buchung verschwanden, wenn man das Menü wechselte (z.B. ins Profil oder zum Admin-Bereich). Diese bleiben nun dauerhaft sichtbar.

*** Admin Test-Labor:** Die Funktionen "Test-Buchung erstellen" und "Check-in erzwingen" wurden repariert. Sie fangen nun Fehler ab (z.B. fehlende Datenbank-Indexe) und zeigen Warnmeldungen an, statt die App abstürzen zu lassen.

*** Push-Nachrichten:** Die Hintergrund-Verarbeitung für abgelaufene Timer wurde aktiviert. Ein Klick auf die Benachrichtigung öffnet oder fokussiert die App nun zuverlässig.

*** Datenbank-Sicherheit:** Ein Fehler in den Sicherheitsregeln (doppelte Einträge für Minigame-Scores), der das Hochladen der Regeln blockierte, wurde behoben.

## [2.8.0] - 2025-11-23

### 🚀 Große Funktions-Erweiterung: "Smart Wash"
Dieses Update bringt Intelligenz in den Waschkeller!

#### 📱 QR-Code Check-in & Check-out
* **Check-in:** Du kannst jetzt deinen Waschgang starten, indem du den QR-Code an der Maschine scannst (oder den Code eingibst). Das beweist, dass du vor Ort bist!
* **Check-out:** Bist du früher fertig? Checke aus, um den Slot für andere freizugeben und dir **+5 Karma Fairness-Bonus** zu sichern.
* **Auto-Checkout:** Falls du es vergisst, checkt dich das System nach Ablauf deiner Zeit automatisch aus.

#### 🛠️ Defekt-Melder
* Ist die Maschine kaputt oder dreckig? Melde es direkt über den neuen Button "Problem melden" im Hauptmenü.
* Der Admin wird benachrichtigt und kann den Status der Maschine auf "Wartung" setzen.

#### 👨‍💻 Neue Admin-Konsole
* Alles an einem Ort: Die Admin-Funktionen (Nutzer, Statistiken, Einstellungen) sind jetzt zentral in einer übersichtlichen Konsole zusammengefasst.
* **Ticket-System:** Admins sehen gemeldete Defekte und können sie als "Erledigt" markieren.
* **QR-Generator:** Admins können den Code für die Waschmaschine direkt in der App generieren.

#### 🎮 Minigame Updates
* **Ruhmeshalle:** In den Statistiken und im Leaderboard werden jetzt stolz die **Benutzernamen** der Highscore-Halter angezeigt. Zeig, wer der wahre Socken-Retter ist!

#### 💅 Technik & Design
* **Smoother:** Die App nutzt jetzt moderne Animationen (View Transitions) beim Wechseln der Seiten.
* **Kompakter:** Die Benutzer-Leiste oben wurde verkleinert, um mehr Platz für das Wesentliche zu schaffen.

## [1.8.0] - 2025-11-22

### 🎉 NEU: Minigame "Socken-Retter" 2.0
Das Wasch-Minigame wurde massiv erweitert!
* **Grafik-Update:** Hübscher 2.5D-Look mit 3D-Boden und Schatten.
* **Tag/Nacht-Zyklus:** Der Hintergrund ändert sich je nach Punktzahl (Tag -> Sonnenuntergang -> Nacht).
* **Lebendige Waschmaschine:** Eine animierte Maschine wackelt im Hintergrund.
* **Power-Ups:** Sammle den **Magneten** 🧲 (zieht Items an) oder den **Weichspüler** 🧴 (macht den Korb riesig).
* **Effekte:** "Squash & Stretch" Animationen für Items und Korb, Partikel-Effekte (Herzchen, Funken, Feuerwerk).
* **Sound:** Eigene Soundeffekte und Mute-Funktion.
* **Highscore:** Live-Anzeige bei neuem Rekord.

### ⚙️ Optimierungen
* **Performance:** Das Spiel läuft jetzt flüssiger (Pre-Rendering) und verbraucht weniger Akku.
* **Gleichmäßige Bewegung:** Dank "Delta Time" läuft das Spiel auf allen Geräten gleich schnell.
* **Komfort:** Automatische Pause, wenn man die App verlässt.

### ⚖️ Balancing
* Die Schwierigkeit steigt jetzt dynamisch mit der Punktzahl (mehr Schmutz, höhere Geschwindigkeit).

## [1.7.0] - 2025-11-18

### 🎉 Großes Update: Das Wasch-Karma System!
* **Fairness zuerst:** Ab jetzt gibt es ein Punktesystem (Wasch-Karma). Jeder startet mit 100 Punkten.
* **Punkte:**
    * Jede Buchung kostet Punkte (Wochentags -10, Wochenende -20).
    * Jede Woche bekommst du automatisch +20 Punkte geschenkt (max. 150).
    * Wer Tauschanfragen annimmt, bekommt +15 Punkte Bonus!
    * Wer früh storniert, bekommt Bonuspunkte zurück. Wer zu spät storniert, zahlt Strafe.
* **Status:**
    * **VIP (>80 Punkte):** Du darfst 4 Wochen vorausbuchen und 2 Prime-Slots (Wochenende) halten.
    * **Standard (40-80 Punkte):** Du darfst 2 Wochen vorausbuchen und 1 Prime-Slot halten.
    * **Eingeschränkt (<40 Punkte):** Du darfst nur 1 Woche vorausbuchen und keine Prime-Slots (außer kurzfristig).
* **Anzeige:** Deinen aktuellen Karma-Stand siehst du jetzt direkt in deinem Profil.

## [1.6.0] - 2025-11-17

### 🎉 Neue Funktionen
* **Kalender-Export:** Du kannst deine gebuchten Wasch-Termine jetzt mit einem Klick in deinen persönlichen Kalender (Apple, Google, Outlook) exportieren. Klicke dazu einfach auf das Kalender-Symbol bei deinen Buchungen im Hauptmenü.

### 💅 Optische Verbesserungen
* **Schnelleres Ladegefühl:** Statt "Lade..."-Texten werden nun moderne Platzhalter (Skeleton Screens) angezeigt, während Daten abgerufen werden.

## [1.5.0] - 2025-11-17

### 🎉 Neue Funktionen
* **Pull-to-Refresh:** Du kannst die App jetzt auf dem Handy ganz einfach aktualisieren, indem du den Bildschirm nach unten ziehst (wie bei Instagram oder Mail).

## [1.4.0] - 2025-11-17

### 🎉 Neue Funktionen
* **Update-Benachrichtigung:** Die App zeigt jetzt nach einem Update automatisch dieses Fenster mit den wichtigsten Änderungen an.
* Die Meldung wird für jeden Nutzer nur einmal angezeigt, bis die nächste Version erscheint.

## [1.3.0] - 2025-11-16

### 🎉 Neue Funktionen
* **Nutzerverwaltung (Admin):** Eine neue Seite "Nutzerverwaltung" im Hauptmenü hinzugefügt, die nur für Admins sichtbar ist.
* Admins können jetzt:
    * Alle registrierten Nutzer und deren Partei/Admin-Status sehen.
    * Die Partei eines Nutzers ändern.
    * Anderen Nutzern Admin-Rechte erteilen oder entziehen.
    * Einen Passwort-Reset-Link an die E-Mail eines Nutzers senden.
* **Firebase-Regeln:** Die Sicherheitsregeln für die `/users/`-Collection wurden aktualisiert, um Admins Schreibzugriff auf alle Profile zu gewähren.

### 💅 Optische Verbesserungen
* Das Hauptmenü wurde neu sortiert, um die Admin-Funktionen zu gruppieren.

## [1.2.2] - 2025-11-16

### 💅 Optische Verbesserungen & Layout
* **Header-Layout:** Das App-Logo wurde entfernt. Die Steuerelemente sind neu angeordnet: `[Refresh]` und `[Theme]` (linksbündig), `[Wetter]` (rechtsbündig).
* Ein funktionaler Refresh-Button wurde hinzugefügt.

### 🐛 Bugfixes
* **Timer-Start:** Der Live-Timer ist jetzt dank "Optimistic Update" sofort nach dem Klick auf "Start" sichtbar und erfordert keinen manuellen Refresh mehr.

## [1.2.1] - 2025-11-16

### 🐛 Bugfixes & Verbesserungen
* **Timer-UI (Bugfix):** Die Timer-Ansicht wird jetzt automatisch auf die Start-Buttons zurückgesetzt, sobald ein Timer abläuft. Ein manueller Refresh ist nicht mehr nötig.
* **Timer-UI (Design):** Die Timer-Leiste (Start-Buttons und Fortschrittsbalken) wurde optisch verkleinert (weniger Padding, kleinere Schrift), um kompakter zu wirken.

## [1.2.0] - 2025-11-16

### 🎉 Neue Funktionen
* **Timer-Benachrichtigungen:** Die App kann jetzt native Push-Benachrichtigungen senden, wenn ein Wasch-Timer abläuft.
* Die Berechtigung hierfür kann auf der Profil-Seite erteilt werden.
* Die Benachrichtigung funktioniert auch, wenn die App im Hintergrund ist (via Service Worker).

### 💅 Optische Verbesserungen
* Die Versionsnummer wird jetzt auch auf der Profil-Seite angezeigt.
* Versionsnummer auf 1.2.0 aktualisiert.

## [1.1.0] - 2025-11-16

### 🎉 Neue Funktionen
* **Live-Wasch-Timer:** Administratoren können jetzt Waschprogramme (z.B. "60°C Bunt") im Profil-Menü anlegen.
* Nutzer sehen diese Programme auf dem Hauptbildschirm und können sie als Live-Timer starten.
* Der laufende Timer (Fortschrittsbalken & Restzeit) ist für alle Mitglieder der eigenen Partei sichtbar.

### 🔒 Sicherheit & Registrierung
* **Einladungscode:** Die Registrierung ist jetzt durch einen geheimen Einladungscode geschützt, um die App privat zu halten.
* **Passwort-Bestätigung:** Ein zweites Passwortfeld bei der Registrierung und im Profil (Passwort ändern) verhindert Tippfehler. Die Felder färben sich live grün (bei Übereinstimmung) oder rot.
* **Dynamische UI:** Das "Partei auswählen"-Dropdown bei der Registrierung wird erst sichtbar, nachdem der korrekte Einladungscode eingegeben wurde.

### 💅 Optische Verbesserungen
* Die Timer-Leiste wurde für bessere Sichtbarkeit und ein kompakteres Design (runde Buttons) überarbeitet.
* Die Timer-Leiste befindet sich jetzt unter der Nutzer-Info-Leiste.
* Versionsnummer auf 1.1.0 aktualisiert.

## [1.0.0] - (Datum Ihrer ursprünglichen Veröffentlichung)

* Erste Veröffentlichung der App.
* Login, Registrierung, E-Mail-Verifizierung.
* Buchungssystem (Formular, Kalender, Wochenübersicht).
* Slot-Tausch-Funktion (Anfragen, Annehmen, Ablehnen).
* Admin-Statistik und Wetter-Widget.