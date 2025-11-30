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

// Wir importieren den Code NICHT mehr aus der Config!

export async function handleRegister() {
    
    // 1. Daten aus den DOM-Feldern holen
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const confirmPassword = document.getElementById("register-password-confirm").value; 
    const partei = document.getElementById("register-partei").value;
    const inviteCode = document.getElementById("register-invite-code").value.trim(); 

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
    // WICHTIG: Keine Client-seitige Prüfung des Codes mehr!
    if (!inviteCode) {
        showMessage('register-error', 'Bitte Einladungscode eingeben.', 'error');
        return;
    }
    if (!partei) {
        showMessage('register-error', 'Bitte wählen Sie eine Partei.', 'error');
        return;
    }

    // 3. Button & Flag setzen
    const registerBtn = document.getElementById('register-btn');
    registerBtn.disabled = true;
    registerBtn.textContent = 'Prüfe Code...';
    
    setIsRegistering(true); 
    showMessage('register-error', '', 'error');

    let userCredential = null;

    try {
        // 4. Firebase-Benutzer erstellen
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        
        // 5. Benutzerprofil in Firestore speichern (INKLUSIVE Code zur Prüfung)
        // Wenn der Code falsch ist, blockiert die Firestore-Regel diesen Schritt!
        try {
            await setDoc(getUserProfileDocRef(uid), {
                uid: uid,
                email: email,
                partei: partei,
                isAdmin: false,
                theme: 'light',
                inviteCode: inviteCode // Wird von firestore.rules geprüft
            });
        } catch (firestoreError) {
            // Falls Firestore den Zugriff verweigert, war der Code falsch.
            // Wir löschen den eben erstellten Auth-User sofort wieder.
            if (userCredential && userCredential.user) {
                await deleteUser(userCredential.user);
            }
            throw new Error("Der Einladungscode ist ungültig.");
        }
        
        // 6. Verifizierungs-E-Mail senden (nur wenn Code korrekt war)
        try {
            // Hinweis: Da wir userCredential.user evtl. neu holen müssten, nutzen wir auth.currentUser
            if (auth.currentUser) await sendEmailVerification(auth.currentUser);
        } catch (e) {
            console.error("Fehler beim Senden der Verifizierungs-E-Mail:", e);
        }
        
        // 7. Benutzer direkt wieder ausloggen
        await signOut(auth);

        // 8. Zur "Bitte bestätigen"-Seite navigieren
        const emailDisplay = document.getElementById('verify-email-address');
        if (emailDisplay) emailDisplay.textContent = email;
        
        showMessage('verify-email-success', 'Registrierung erfolgreich!', 'success');
        navigateTo(dom.verifyEmailMessage); 
        
    } catch (err) {
        // 9. Fehler-Handling
        console.error("Reg Error:", err);
        let errorMessage = `${err.message}`;
        
        if (err.code === 'auth/email-already-in-use') {
            errorMessage = 'Diese E-Mail-Adresse ist bereits registriert.';
        } else if (err.code === 'auth/weak-password') {
            errorMessage = 'Das Passwort ist zu schwach (mind. 6 Zeichen).';
        } else if (err.message.includes("Einladungscode")) {
            errorMessage = "Falscher Einladungscode! Zugriff verweigert.";
        } else if (err.code && err.code.includes("permission-denied")) {
             errorMessage = "Falscher Einladungscode! Zugriff verweigert.";
        }

        showMessage('register-error', errorMessage);
        
        setIsRegistering(false);

    } finally {
        if (getIsRegistering() === false) { 
            registerBtn.disabled = false;
            registerBtn.textContent = 'Registrieren';
        }
    }
}

// ... (Restliche Funktionen handleLogin, handleLogout etc. bleiben unverändert)
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
            } catch(e) { console.error(e); }
            showMessage('login-error', 'Login fehlgeschlagen: E-Mail-Adresse ist nicht bestätigt. Wir haben eine neue E-Mail gesendet.', 'error', 8000);
            await signOut(auth); 
            return; 
        }

    } catch (err) {
        let errorMessage = "Login fehlgeschlagen: E-Mail oder Passwort ist falsch.";
        if (err.code === 'auth/invalid-email') errorMessage = "Ungültiges E-Mail-Format.";
        showMessage('login-error', errorMessage);
    }
}
        
export async function handleLogout() {
    try { await signOut(auth); } catch (error) { console.error("Logout-Fehler:", error); }
}

export async function handleChangePassword() {
    const newPassword = dom.newPasswordInput.value;
    const confirmPassword = document.getElementById('new-password-confirm').value;

    if (newPassword.length < 6) { showMessage('profile-message', "Passwort zu kurz (min 6 Zeichen).", 'error'); return; }
    if (newPassword !== confirmPassword) { showMessage('profile-message', 'Passwörter stimmen nicht überein.', 'error'); return; }
    if (!auth.currentUser) { showMessage('profile-message', "Nicht angemeldet.", 'error'); return; }
    
    try {
        await updatePassword(auth.currentUser, newPassword);
        showMessage('profile-message', "Passwort erfolgreich aktualisiert!", 'success');
        dom.newPasswordInput.value = '';
        document.getElementById('new-password-confirm').value = '';
        dom.newPasswordInput.classList.remove('input-valid', 'input-invalid');
        document.getElementById('new-password-confirm').classList.remove('input-valid', 'input-invalid');
    } catch (error) {
         let msg = "Fehler beim Aktualisieren. Bitte neu anmelden.";
         if (error.code === 'auth/weak-password') msg = "Passwort zu schwach.";
         showMessage('profile-message', msg, 'error');
    }
}

export async function handlePasswordReset() {
    const emailInput = document.getElementById('reset-email');
    const email = emailInput.value.trim();
    if (!email) { showMessage('reset-message', 'Bitte E-Mail eingeben.', 'error'); return; }

    const button = document.getElementById('reset-password-btn');
    button.disabled = true; button.textContent = 'Sende...';

    try {
        await sendPasswordResetEmail(auth, email);
        showMessage('reset-message', 'Link gesendet! Bitte Postfach prüfen.', 'success', 10000);
        emailInput.value = '';
    } catch (error) {
        let msg = 'Fehler beim Senden.';
        if (error.code === 'auth/user-not-found') msg = 'E-Mail nicht bekannt.';
        showMessage('reset-message', msg, 'error');
    } finally {
        button.disabled = false; button.textContent = 'Link anfordern';
    }
}

export async function handleDeleteAccount(password) {
    const user = auth.currentUser;
    if (!user || !password) { showMessage('delete-account-message', 'Bitte Passwort eingeben.', 'error'); return; }

    const button = dom.confirmDeleteAccountBtn;
    button.disabled = true; button.textContent = 'Lösche...';

    try {
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
        await deleteDoc(getUserProfileDocRef(user.uid));
        await deleteUser(user);
        dom.deleteAccountModal.style.display = 'none';
    } catch (error) {
        let msg = 'Fehler.';
        if (error.code === 'auth/wrong-password') msg = 'Falsches Passwort.';
        else msg = error.message;
        showMessage('delete-account-message', msg, 'error');
    } finally {
        button.disabled = false; button.textContent = 'Konto endgültig löschen';
    }
}

export async function handleAdminPasswordReset(email, messageElementId) {
    if (!email) { showMessage(messageElementId, 'Keine E-Mail angegeben.', 'error'); return false; }
    try {
        await sendPasswordResetEmail(auth, email);
        showMessage(messageElementId, `Reset-Link an ${email} gesendet!`, 'success');
        return true;
    } catch (error) {
        showMessage(messageElementId, `Fehler: ${error.message}`, 'error');
        return false;
    }
}