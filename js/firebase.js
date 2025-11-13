// Firebase SDK Module Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    updatePassword,
    // --- NEUE IMPORTE ---
    sendPasswordResetEmail,
    sendEmailVerification,
    EmailAuthProvider,
    reauthenticateWithCredential,
    deleteUser
    // --- ENDE NEU ---
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    collection, 
    getDocs, 
    query, 
    where, 
    getDoc, 
    onSnapshot, 
    addDoc, 
    deleteDoc,
    updateDoc, 
    orderBy, 
    limit,
    runTransaction 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- 1. FIREBASE KONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCvKdQa7No5TMehgIBS9Nh34kg8EqFJap0",
    authDomain: "waschplanapp.firebaseapp.com",
    projectId: "waschplanapp",
    storageBucket: "waschplanapp.firerostorage.app",
    messagingSenderId: "326700527135",
    appId: "1:326700527135:web:4b0c1d5e287d6ae1932f2a"
};

// --- 2. FIREBASE INITIALISIERUNG ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 3. EXPORTE ---
// Exportiere Dienste
export { auth, db };

// Exportiere alle Auth-Funktionen
export {
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    updatePassword,
    // --- NEUE EXPORTE ---
    sendPasswordResetEmail,
    sendEmailVerification,
    EmailAuthProvider,
    reauthenticateWithCredential,
    deleteUser
    // --- ENDE NEU ---
};

// Exportiere alle Firestore-Funktionen
export {
    doc, 
    setDoc, 
    collection, 
    getDocs, 
    query, 
    where, 
    getDoc, 
    onSnapshot, 
    addDoc, 
    deleteDoc,
    updateDoc, 
    orderBy, 
    limit,
    runTransaction
};

// Exportiere Referenz-Helfer
export function getBookingsCollectionRef() {
    return collection(db, "bookings");
}

export function getUserProfileDocRef(uid) {
    return doc(db, "users", uid);
}

export function getSwapRequestsCollectionRef() {
    return collection(db, "swap_requests");
}

export function getSettingsDocRef() {
    return doc(db, 'app_settings', 'config');
}