import { 
    auth, db,
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    updatePassword,
    sendPasswordResetEmail,
    sendEmailVerification,
    EmailAuthProvider,
    reauthenticateWithCredential,
    deleteUser,
    deleteDoc,
    collection, query, where, getDocs, setDoc, doc,
    getUserProfileDocRef
} from '../firebase.js';
import { showMessage, navigateTo } from '../ui.js';
import * as dom from '../dom.js';
import { setIsRegistering, getIsRegistering } from '../state.js';
import { SECRET_INVITE_CODE } from '../config.js'; 

export async function handleRegister() {
    
    // 1. Daten aus den DOM-Feldern holen
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const confirmPassword = document.getElementById("register-password-confirm").value; 
    const partei = document.getElementById("register-partei").value;
    const inviteCode = document.getElementById("register-invite-code").value; 

    // 2. Validierung der Eingaben
    if (!email || !password ) {
        showMessage('register-error', "Bitte E-Mail und Passwörter ausfüllen!", 'error');
        return;
    }

    if (password.length < 6) {
        showMessage('register-error', "Passwort muss mind. 6 Zeichen lang sein!", 'error');
        return;
    }
    if (password !== confirmPassword) {
        showMessage('register-error', 'Die Passwörter stimmen nicht überein.', 'error');
        return;
    }
    if (inviteCode.trim() !== SECRET_INVITE_CODE) {
        showMessage('register-error', 'Der Einladungscode ist ungültig.', 'error');
        return;
    }
    if (!partei) {
        showMessage('register-error', 'Bitte wählen Sie eine Partei.', 'error');
        return;
    }

    // 3. Button & Flag setzen
    const registerBtn = document.getElementById('register-btn');
    registerBtn.disabled = true;
    registerBtn.textContent = 'Registriere...';
    
    setIsRegistering(true); 
    showMessage('register-error', '', 'error');

    try {
        // 4. Firebase-Benutzer erstellen
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        
        // 5. Verifizierungs-E-Mail senden
        try {
            await sendEmailVerification(userCredential.user);
        } catch (e) {
            console.error("Fehler beim Senden der Verifizierungs-E-Mail:", e);
        }
        
        // 6. Benutzerprofil in Firestore speichern
        await setDoc(getUserProfileDocRef(uid), {
            uid: uid,
            email: email,
            partei: partei,
            isAdmin: false,
            theme: 'light' 
        });
        
        // 7. Benutzer direkt wieder ausloggen
        await signOut(auth);

        // 8. Zur "Bitte bestätigen"-Seite navigieren
        const emailDisplay = document.getElementById('verify-email-address');
        if (emailDisplay) emailDisplay.textContent = email;
        
        showMessage('verify-email-success', 'Registrierung erfolgreich!', 'success');
        
        navigateTo(dom.verifyEmailMessage); 
        
    } catch (err) {
        // 9. Fehler-Handling
        let errorMessage = `Registrierungsfehler: ${err.message}`;
        if (err.code === 'auth/email-already-in-use') {
            errorMessage = 'Diese E-Mail-Adresse ist bereits registriert.';
        } else if (err.code === 'auth/weak-password') {
            errorMessage = 'Das Passwort ist zu schwach (mind. 6 Zeichen).';
        }
        showMessage('register-error', errorMessage);
        
        // WICHTIG: Flag bei Fehler zurücksetzen
        setIsRegistering(false);

    } finally {
        // 10. Button-Zustand nur zurücksetzen, WENN ein Fehler aufgetreten ist
        if (getIsRegistering() === false) { 
            registerBtn.disabled = false;
            registerBtn.textContent = 'Registrieren';
        }
    }
}


// Alle anderen Funktionen bleiben unverändert
export async function handleLogin() {
    const email = document.getElementById("login-identifier").value.trim();
    const password = document.getElementById("login-password").value;

    if(!email || !password){
        showMessage('login-error', "Bitte E-Mail und Passwort ausfüllen!");
        return;
    }
    
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        
        if (!userCredential.user.emailVerified) {
            try {
                await sendEmailVerification(userCredential.user);
            } catch(e) {
                console.error("Fehler beim erneuten Senden der E-Mail:", e);
            }
            
            showMessage('login-error', 'Login fehlgeschlagen: E-Mail-Adresse ist nicht bestätigt. Wir haben eine neue E-Mail gesendet (bitte Spam prüfen).', 'error', 8000);
            
            await signOut(auth); 
            return; 
        }

    } catch (err) {
        let errorMessage = "Login fehlgeschlagen: E-Mail oder Passwort ist falsch.";
        if (err.code === 'auth/invalid-email') {
            errorMessage = "Ungültiges E-Mail-Format.";
        }
        showMessage('login-error', errorMessage);
    }
}
        
export async function handleLogout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout-Fehler:", error);
    }
}

// ===== HIER BEGINNEN DIE ÄNDERUNGEN =====
export async function handleChangePassword() {
    // 1. Felder auslesen
    const newPassword = dom.newPasswordInput.value;
    const confirmPassword = document.getElementById('new-password-confirm').value;

    // 2. Validierung
    if (newPassword.length < 6) {
        showMessage('profile-message', "Das Passwort muss mindestens 6 Zeichen lang sein.", 'error');
        return;
    }
    if (newPassword !== confirmPassword) {
        showMessage('profile-message', 'Die Passwörter stimmen nicht überein.', 'error');
        return;
    }

    if (!auth.currentUser) {
        showMessage('profile-message', "Fehler: Nicht angemeldet.", 'error');
        return;
    }
    
    // 3. Firebase-Aktion
    try {
        await updatePassword(auth.currentUser, newPassword);
        showMessage('profile-message', "Passwort erfolgreich aktualisiert!", 'success');
        
        // 4. Felder zurücksetzen
        dom.newPasswordInput.value = '';
        document.getElementById('new-password-confirm').value = '';
        // Klassen entfernen
        dom.newPasswordInput.classList.remove('input-valid', 'input-invalid');
        document.getElementById('new-password-confirm').classList.remove('input-valid', 'input-invalid');

    } catch (error) {
         let msg = "Fehler beim Aktualisieren des Passworts. Bitte melden Sie sich neu an.";
         if (error.code === 'auth/weak-password') {
             msg = "Das neue Passwort ist zu schwach.";
         }
         showMessage('profile-message', msg, 'error');
    }
}
// ===== HIER ENDEN DIE ÄNDERUNGEN =====

export async function handlePasswordReset() {
    const emailInput = document.getElementById('reset-email');
    const email = emailInput.value.trim();

    if (!email) {
        showMessage('reset-message', 'Bitte geben Sie Ihre E-Mail-Adresse ein.', 'error');
        return;
    }

    const button = document.getElementById('reset-password-btn');
    button.disabled = true;
    button.textContent = 'Sende...';

    try {
        await sendPasswordResetEmail(auth, email);
        showMessage('reset-message', 'Link gesendet! Bitte überprüfen Sie Ihr E-Mail-Postfach (auch Spam).', 'success', 10000);
        emailInput.value = '';
    } catch (error) {
        let msg = 'Fehler beim Senden der E-Mail.';
        if (error.code === 'auth/user-not-found') {
            msg = 'Diese E-Mail-Adresse ist nicht in unserem System registriert.';
        } else if (error.code === 'auth/invalid-email') {
            msg = 'Ungültiges E-Mail-Format.';
        }
        showMessage('reset-message', msg, 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Link anfordern';
    }
}

export async function handleDeleteAccount(password) {
    const user = auth.currentUser;
    if (!user) {
        showMessage('delete-account-message', 'Fehler: Nicht angemeldet.', 'error');
        return;
    }
    
    if (!password) {
        showMessage('delete-account-message', 'Bitte geben Sie Ihr Passwort ein.', 'error');
        return;
    }

    const button = dom.confirmDeleteAccountBtn;
    button.disabled = true;
    button.textContent = 'Lösche...';

    try {
        // 1. Re-Authentifizierung (Sicherheitsprüfung)
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);

        // 2. Firestore-Dokument löschen (User-Profil)
        await deleteDoc(getUserProfileDocRef(user.uid));

        // 3. Auth-Konto löschen
        await deleteUser(user);
        
        dom.deleteAccountModal.style.display = 'none';

    } catch (error) {
        let msg = 'Ein Fehler ist aufgetreten.';
        if (error.code === 'auth/wrong-password') {
            msg = 'Falsches Passwort. Das Konto wurde nicht gelöscht.';
        } else if (error.code === 'auth/requires-recent-login') {
            msg = 'Sitzung abgelaufen. Bitte loggen Sie sich neu an und versuchen Sie es erneut.';
        } else {
            msg = `Fehler: ${error.message}`;
        }
        showMessage('delete-account-message', msg, 'error');
    } finally {
        button.disabled = false;
        button.textContent = 'Konto endgültig löschen';
    }
}

// ===== NEUE ADMIN-FUNKTION =====
/**
 * Sendet einen Passwort-Reset-Link an eine beliebige E-Mail (nur für Admins).
 * @param {string} email - Die Ziel-E-Mail.
 * @param {string} messageElementId - Die ID des Message-Elements für Feedback.
 */
export async function handleAdminPasswordReset(email, messageElementId) {
    if (!email) {
        showMessage(messageElementId, 'Keine E-Mail zum Zurücksetzen angegeben.', 'error');
        return false;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        showMessage(messageElementId, `Passwort-Reset-Link an ${email} gesendet!`, 'success', 7000);
        return true;
    } catch (error) {
        let msg = `Fehler beim Senden an ${email}.`;
        if (error.code === 'auth/user-not-found') {
            msg = `Fehler: Nutzer ${email} nicht in Firebase Auth gefunden.`;
        }
        showMessage(messageElementId, msg, 'error', 7000);
        return false;
    }
}