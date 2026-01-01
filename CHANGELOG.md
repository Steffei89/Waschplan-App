# Änderungsprotokoll (Changelog)

Hier werden alle wichtigen Änderungen an der Waschplan-App festgehalten.

# [3.5.0] - 2026-01-01

### 🎨 Großes Design-Redesign ("Glassmorphism")
Die App hat einen komplett neuen, modernen Look erhalten!
* **Milchglas-Optik:** Elemente haben nun einen halbtransparenten Hintergrund, der die Umgebung durchschimmern lässt (Glassmorphism).
* **Neue Schriftart:** Wir nutzen jetzt "Nunito" für einen freundlicheren, runderen Look.
* **Formen & Farben:** Buttons sind jetzt komplett rund ("Pill-Shape"), Karten haben weichere Ecken und frische Farbverläufe (Blau/Türkis).
* **Schwebende Elemente:** Durch farbige, weiche Schatten wirken Buttons und Boxen, als würden sie schweben.

### 🛠️ Verbesserungen
* **Neuigkeiten-Popup:** Das Änderungsprotokoll (dieses Fenster) öffnet sich nun als elegantes Popup über der App und ist scrollbar.
* **Navigation:** Die Navigationsleiste unten wurde überarbeitet und schwebt nun über dem Inhalt.
* **Code-Bereinigung:** Interne Optimierungen für stabilere Performance.

---

# [3.2.1] - 2025-12-04

### 🌟 Großes Fairness & Eco Update

### 🌱 Eco-Wash (Wetter-Integration)
* **Sonne tanken:** Die App ist jetzt mit dem Wetterbericht verbunden!
* **Sparen:** Wenn für den Tag Sonne angesagt ist, werden die Slots automatisch zu **Eco-Slots**. Sie kosten nur noch **-5 Karma** (statt -10). Das lohnt sich für dich und die Umwelt! Achte auf das Blatt-Symbol 🌱.

### 🧾 Totale Transparenz
* **Preisschilder:** Du siehst jetzt überall (Kalender, Wochenliste, Buchung) *vor* dem Klick, was ein Slot kostet. Keine Überraschungen mehr.
* **Karma-Bilanz:** Im Profil gibt es jetzt einen detaillierten "Kassenbon". Er zeigt dir genau: Startguthaben (100) + Minigame-Gewinne - deine Buchungen = Dein aktueller Stand. Alles ist auf den Punkt genau nachvollziehbar.
* **Kulanz-Anzeige:** Falls der Admin dir Punkte geschenkt hat oder das System korrigiert wurde, wird dies nun transparent als "Fairness-Bonus" ausgewiesen.

### 🚀 Performance & Speed (Lazy Loading)
* **Blitzschneller Start:** Die App startet jetzt deutlich schneller! Große Bereiche wie das Minigame, der QR-Scanner und die Admin-Konsole werden erst geladen, wenn du sie wirklich anklickst ("Lazy Loading").
* **Offline-Turbo:** Der neue Service Worker (v6.0) speichert die App intelligent auf deinem Handy. Selbst bei schlechtem Netz ist sie beim zweiten Öffnen sofort da.
* **Flüssiger Aufbau:** Technische Optimierungen (`defer`) sorgen dafür, dass die Benutzeroberfläche nicht mehr blockiert wird, während im Hintergrund Daten geladen werden.

### 🔔 Komfort
* **Erinnerung:** Hast du für morgen gebucht? Die App schickt dir am Vorabend um 20:00 Uhr automatisch eine Push-Benachrichtigung, damit du deinen Termin nicht vergisst.

### ⚙️ Für Admins
* **Smart Reset:** Das System kann nun komplett neu kalibriert werden, ohne dass die Historie verloren geht. Es berechnet den fairen Punktestand für alle Parteien neu.

## [3.0.0] - 2025-12-01

### 🔒 Massive Sicherheits-Überarbeitung ("Fort Knox")
Die App wurde einer vollständigen Sicherheits-Auditierung unterzogen und massiv gehärtet. Dies ist das sicherste Update in der Geschichte der App.

* **Datenbank-Firewall (Firestore Rules):**
    * Ein komplett neues, strenges Regelwerk wurde implementiert.
    * **Identitäts-Schutz:** Es ist technisch nun unmöglich, Buchungen im Namen anderer Parteien zu erstellen oder fremde Buchungen zu löschen.
    * **Karma-Schutz:** Nutzer können sich nicht mehr selbst Karma ercheaten. Nur valide Aktionen (oder der Admin) dürfen den Punktestand ändern.
* **Anti-Hacker Schutz (XSS):**
    * Sämtliche Text-Ausgaben in der App (Admin-Tickets, Wochenübersicht, Tauschanfragen, Minigame-Rangliste) wurden gegen Code-Injektion abgesichert.
    * Selbst wenn ein Angreifer versucht, Schadcode als Benutzernamen einzugeben, wird dieser nur als harmloser Text angezeigt.

### 🎮 Minigame Updates
* **Grafik-Fix:** Ein Fehler wurde behoben, durch den die fallenden Gegenstände (Socken, Rotwein) fälschlicherweise transparent dargestellt wurden. Die Grafik ist nun wieder kontrastreich und gut erkennbar.

## [2.9.1] - 2025-11-30

### 🔒 Kritisches Sicherheits-Update
Die Sicherheit der App wurde massiv verstärkt.
* **Invite-Code Schutz:** Der Einladungscode wird nicht mehr im App-Code ("Client-Side") gespeichert, sondern direkt sicher in der Datenbank ("Server-Side") geprüft. Man kann ihn nicht mehr auslesen.
* **Datenbank-Regeln:** Die "Türsteher"-Regeln der Datenbank wurden verschärft.
    * Nutzer können jetzt nur noch ihre **eigenen** Buchungen (oder die ihrer Partei) löschen. Fremde Buchungen sind geschützt.
    * Admin-Rechte und Profil-Daten sind vor Manipulation geschützt.

### 💅 UI & Animationen
Die App fühlt sich jetzt noch mehr wie eine echte "native" App an.
* **Intelligente Navigation:** Die App weiß jetzt, ob du "Vorwärts" oder "Zurück" gehst. Die Seiten wischen entsprechend von rechts oder links herein.
* **Gesten-Feedback:** Beim Wischen im Kalender oder der Wochenübersicht gibt es jetzt einen visuellen "Bounce"-Effekt, der die Aktion bestätigt.
* **Scrollbares Changelog:** Dieses Fenster hier ist jetzt scrollbar, damit der "Verstanden"-Button auch auf kleinen Bildschirmen immer erreichbar ist.

## [2.9.0] - 2025-11-23

### 🎨 Modernes Design & UI
Die App hat einen kompletten optischen Neuanstrich bekommen!
* **Neuer Look:** Statt Hintergrundbildern setzen wir jetzt auf moderne, saubere Farbverläufe (Gradients).
    * *Light Mode:* Ein frischer, heller "Clean & Airy" Look.
    * *Dark Mode:* Ein edler "Deep Midnight" Verlauf.
* **Admin-Konsole:** Das Design der Admin-Konsole wurde an das Hauptmenü angepasst (einheitlicher Look). Die Menüs sind nun standardmäßig eingeklappt.
* **Status-Widget:** Im Header gibt es jetzt eine kleine "Ampel" 👕, die sofort anzeigt, ob die Maschine gerade **Frei** (Grün) oder **Belegt** (Rot) ist.
* **Animationen:** Seitenwechsel wischen jetzt wie in einer nativen App herein ("Slide-Over"), und Listen bauen sich elegant auf.

### ⚖️ Fairness & Logik
* **Karma-Update beim Tauschen:** Eine Lücke wurde geschlossen. Wer einen Slot per Tausch übernimmt, muss nun auch die entsprechenden Karma-Punkte ("Kosten") dafür zahlen. Vorher war die Übernahme kostenlos.
* **Transaktionen:** Buchungen sind nun durch Datenbank-Transaktionen abgesichert, um Doppelbuchungen im Millisekunden-Bereich zu verhindern.

### 🎮 Minigame
* **Smoother Gameplay:** Die Steuerung des Wäschekorbs wurde komplett überarbeitet. Sie fühlt sich jetzt weicher an und ruckelt nicht mehr, da die Bewegung von der Eingabe entkoppelt wurde.

### 🐛 Bugfixes
* **Anzeige-Fehler:** Ein Fehler wurde behoben, bei dem die Buchungsliste verschwand, wenn man einen Eintrag löschte ("Selbstzerstörung" der Anzeige).
* **Datenbank-Regeln:** Ein kritischer Konflikt in den Sicherheitsregeln (`firestore.rules`) für das Minigame wurde bereinigt.