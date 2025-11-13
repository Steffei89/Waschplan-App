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
// --- NEUER IMPORT ---
import { setIsRegistering } from '../state.js';
// --- ENDE NEU ---

export async function handleRegister() {
    // BENUTZERNAME ENTFERNT
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const partei = document.getElementById("register-partei").value;

    if(!email || !password || !partei){
        showMessage('register-error', "Bitte alle Felder ausfüllen!");
        return;
    }
    if (password.length < 6) {
        showMessage('register-error', "Passwort muss mind. 6 Zeichen lang sein!");
        return;
    }

    // --- NEU: Flag setzen ---
    setIsRegistering(true);
    // --- ENDE NEU ---

    try {
        // BENUTZERNAME-PRÜFUNG ENTFERNT

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        
        try {
            await sendEmailVerification(userCredential.user);
        } catch (e) {
            console.error("Fehler beim Senden der Verifizierungs-E-Mail:", e);
        }
        
        await setDoc(getUserProfileDocRef(uid), {
            uid: uid,
            // username: username, // ENTFERNT
            email: email,
            partei: partei,
            isAdmin: false,
            theme: 'light' 
        });
        
        // Benutzer direkt wieder ausloggen
        await signOut(auth);

        const emailDisplay = document.getElementById('verify-email-address');
        if (emailDisplay) emailDisplay.textContent = email;
        
        showMessage('verify-email-success', 'Registrierung erfolgreich!', 'success');
        
        navigateTo(dom.verifyEmailMessage);
        
    } catch (err) {
        let errorMessage = `Registrierungsfehler: ${err.message}`;
        if (err.code === 'auth/email-already-in-use') {
            errorMessage = 'Diese E-Mail-Adresse ist bereits registriert.';
        }
        showMessage('register-error', errorMessage);
    } finally {
        // --- NEU: Flag zurücksetzen, egal was passiert ---
        setIsRegistering(false);
        // --- ENDE NEU ---
    }
}

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

export async function handleChangePassword() {
    const newPassword = dom.newPasswordInput.value;
    if (newPassword.length < 6) {
        showMessage('profile-message', "Das Passwort muss mindestens 6 Zeichen lang sein.", 'error');
        return;
    }
    if (!auth.currentUser) {
        showMessage('profile-message', "Fehler: Nicht angemeldet.", 'error');
        return;
    }
    try {
        await updatePassword(auth.currentUser, newPassword);
        showMessage('profile-message', "Passwort erfolgreich aktualisiert!", 'success');
        dom.newPasswordInput.value = '';
    } catch (error) {
         let msg = "Fehler beim Aktualisieren des Passworts. Bitte melden Sie sich neu an.";
         if (error.code === 'auth/weak-password') {
             msg = "Das neue Passwort ist zu schwach.";
         }
         showMessage('profile-message', msg, 'error');
    }
}

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