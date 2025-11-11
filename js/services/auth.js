import { 
    auth, db,
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    updatePassword,
    collection, query, where, getDocs, setDoc, doc,
    getUserProfileDocRef
} from '../firebase.js';
import { showMessage, navigateTo } from '../ui.js';
import * as dom from '../dom.js';

export async function handleRegister() {
    const username = document.getElementById("register-username").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const partei = document.getElementById("register-partei").value;

    if(!username || !email || !password || !partei){
        showMessage('register-error', "Bitte alle Felder ausfüllen!");
        return;
    }
    if (password.length < 6) {
        showMessage('register-error', "Passwort muss mind. 6 Zeichen lang sein!");
        return;
    }

    try {
        const usersCol = collection(db, "users");
        const qUsername = query(usersCol, where("username", "==", username));
        const usernameSnap = await getDocs(qUsername);
        if (!usernameSnap.empty) {
            showMessage('register-error', "Benutzername ist bereits vergeben!");
            return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        
        await setDoc(getUserProfileDocRef(uid), {
            uid: uid,
            username: username,
            email: email,
            partei: partei,
            isAdmin: false,
            theme: 'light' 
        });

        showMessage('register-error', "Registrierung erfolgreich! Bitte melden Sie sich an.", 'success');
        navigateTo(dom.loginForm);
        document.getElementById("login-identifier").value = email;
        document.getElementById("login-password").value = '';
    } catch (err) {
        let errorMessage = `Registrierungsfehler: ${err.message}`;
        if (err.code === 'auth/email-already-in-use') {
            errorMessage = 'Diese E-Mail-Adresse ist bereits registriert.';
        }
        showMessage('register-error', errorMessage);
    }
}

export async function handleLogin() {
    // 1. "identifier" wurde in "email" umbenannt
    const email = document.getElementById("login-identifier").value.trim();
    const password = document.getElementById("login-password").value;

    // 2. Fehlermeldung angepasst
    if(!email || !password){
        showMessage('login-error', "Bitte E-Mail und Passwort ausfüllen!");
        return;
    }
    
    try {
        // 3. Die Logik zur Überprüfung von "isEmail" und die Datenbankabfrage
        //    für den Benutzernamen wurden komplett entfernt.
        
        // 4. Direkter Login-Versuch nur mit E-Mail.
        await signInWithEmailAndPassword(auth, email, password);

    } catch (err) {
        // 5. Angepasste Fehlermeldung
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