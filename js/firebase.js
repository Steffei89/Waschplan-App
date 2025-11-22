// Firebase SDK Module Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    updatePassword,
    sendPasswordResetEmail,
    sendEmailVerification,
    EmailAuthProvider,
    reauthenticateWithCredential,
    deleteUser
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
    runTransaction,
    writeBatch, 
    Timestamp,
    increment,
    serverTimestamp,
    deleteField,
    arrayUnion // <--- NEU
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging.js";

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
const messaging = getMessaging(app);

// --- 3. EXPORTE ---
export { auth, db, messaging };

export {
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    updatePassword,
    sendPasswordResetEmail,
    sendEmailVerification,
    EmailAuthProvider,
    reauthenticateWithCredential,
    deleteUser
};

export { getToken, onMessage }; 

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
    runTransaction,
    writeBatch, 
    Timestamp,
    increment,
    serverTimestamp,
    deleteField,
    arrayUnion // <--- NEU
};

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
export function getWashProgramsCollectionRef() {
    return collection(db, "wash_programs");
}

export function getWashProgramDocRef(docId) {
    return doc(db, "wash_programs", docId);
}

export function getActiveTimerDocRef(partei) {
    return doc(db, "active_timers", partei);
}