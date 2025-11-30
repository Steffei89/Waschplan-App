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

export async function handleRegister() {
    
    // 1. Daten holen (OHNE Partei!)
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const confirmPassword = document.getElementById("register-password-confirm").value; 
    const inviteCode = document.getElementById("register-invite-code").value.trim(); 

    // 2. Validierung
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
    if (!inviteCode) {
        showMessage('register-error', 'Bitte Einladungscode eingeben.', 'error');
        return;
    }

    // 3. Button & Flag
    const registerBtn = document.getElementById('register-btn');
    registerBtn.disabled = true;
    registerBtn.textContent = 'Prüfe Code...';
    
    setIsRegistering(true); 
    showMessage('register-error', '', 'error');

    let userCredential = null;

    try {
        // 4. Firebase User erstellen
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        
        // 5. Firestore Profil erstellen (OHNE Partei)
        // Die Datenbank prüft den Code hier!
        try {
            await setDoc(getUserProfileDocRef(uid), {
                uid: uid,
                email: email,
                isAdmin: false,
                theme: 'light',
                inviteCode: inviteCode, // Zur Prüfung
                partei: null // Explizit null, damit es später gesetzt werden darf
            });
        } catch (firestoreError) {
            // Code falsch -> User wieder löschen
            if (userCredential && userCredential.user) {
                await deleteUser(userCredential.user);
            }
            throw new Error("Der Einladungscode ist ungültig.");
        }
        
        // 6. E-Mail senden
        try {
            if (auth.currentUser) await sendEmailVerification(auth.currentUser);
        } catch (e) {
            console.error("Fehler beim Senden der Verifizierungs-E-Mail:", e);
        }
        
        // 7. Ausloggen
        await signOut(auth);

        const emailDisplay = document.getElementById('verify-email-address');
        if (emailDisplay) emailDisplay.textContent = email;
        
        showMessage('verify-email-success', 'Registrierung erfolgreich!', 'success');
        navigateTo(dom.verifyEmailMessage); 
        
    } catch (err) {
        console.error("Reg Error:", err);
        let errorMessage = `${err.message}`;
        if (err.code === 'auth/email-already-in-use') errorMessage = 'E-Mail ist bereits registriert.';
        else if (err.code === 'auth/weak-password') errorMessage = 'Passwort zu schwach.';
        else if (err.message.includes("Einladungscode") || (err.code && err.code.includes("permission-denied"))) {
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
            try { await sendEmailVerification(userCredential.user); } catch(e) {}
            showMessage('login-error', 'E-Mail nicht bestätigt. Neue E-Mail gesendet.', 'error', 8000);
            await signOut(auth); 
            return; 
        }
    } catch (err) {
        let errorMessage = "Login fehlgeschlagen.";
        if (err.code === 'auth/invalid-email') errorMessage = "Ungültiges E-Mail-Format.";
        showMessage('login-error', errorMessage);
    }
}
        
export async function handleLogout() {
    try { await signOut(auth); } catch (error) { console.error(error); }
}

export async function handleChangePassword() {
    const newPassword = dom.newPasswordInput.value;
    const confirmPassword = document.getElementById('new-password-confirm').value;
    if (newPassword.length < 6) { showMessage('profile-message', "Passwort zu kurz.", 'error'); return; }
    if (newPassword !== confirmPassword) { showMessage('profile-message', 'Passwörter stimmen nicht überein.', 'error'); return; }
    if (!auth.currentUser) { showMessage('profile-message', "Nicht angemeldet.", 'error'); return; }
    try {
        await updatePassword(auth.currentUser, newPassword);
        showMessage('profile-message', "Passwort aktualisiert!", 'success');
        dom.newPasswordInput.value = ''; document.getElementById('new-password-confirm').value = '';
    } catch (error) { showMessage('profile-message', "Fehler. Bitte neu anmelden.", 'error'); }
}

export async function handlePasswordReset() {
    const emailInput = document.getElementById('reset-email');
    const email = emailInput.value.trim();
    if (!email) { showMessage('reset-message', 'E-Mail eingeben.', 'error'); return; }
    const button = document.getElementById('reset-password-btn');
    button.disabled = true; button.textContent = 'Sende...';
    try {
        await sendPasswordResetEmail(auth, email);
        showMessage('reset-message', 'Link gesendet!', 'success');
        emailInput.value = '';
    } catch (error) { showMessage('reset-message', 'Fehler beim Senden.', 'error'); }
    finally { button.disabled = false; button.textContent = 'Link anfordern'; }
}

export async function handleDeleteAccount(password) {
    const user = auth.currentUser;
    if (!user || !password) { showMessage('delete-account-message', 'Passwort eingeben.', 'error'); return; }
    const button = dom.confirmDeleteAccountBtn;
    button.disabled = true; button.textContent = 'Lösche...';
    try {
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
        await deleteDoc(getUserProfileDocRef(user.uid));
        await deleteUser(user);
        dom.deleteAccountModal.style.display = 'none';
    } catch (error) { showMessage('delete-account-message', 'Fehler: ' + error.message, 'error'); }
    finally { button.disabled = false; button.textContent = 'Konto endgültig löschen'; }
}

export async function handleAdminPasswordReset(email, messageElementId) {
    if (!email) { showMessage(messageElementId, 'Keine E-Mail.', 'error'); return false; }
    try {
        await sendPasswordResetEmail(auth, email);
        showMessage(messageElementId, `Link an ${email} gesendet!`, 'success');
        return true;
    } catch (error) { showMessage(messageElementId, `Fehler: ${error.message}`, 'error'); return false; }
}