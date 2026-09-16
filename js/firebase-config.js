/** Config pública de Firebase (apiKey y VAPID no son secretos de servidor). */
export const firebaseConfig = {
  apiKey: "AIzaSyCwLaj-3QQg9WmZAyXzNAz3JGcYkXiEz-M",
  authDomain: "coc-timers.firebaseapp.com",
  projectId: "coc-timers",
  storageBucket: "coc-timers.firebasestorage.app",
  messagingSenderId: "708377560257",
  appId: "1:708377560257:web:9f211ff4a3178394db0040",
};

export const vapidKey =
  "BGK5TRXEsx1T1Cd88X23AkANnclVBMvAXECi8PdvvXMTfZ5Sbt42A8qkzjS6BOHKxsUKBZf-MgdQikb248Vo89w";

export const syncAlertsUrl = "https://us-central1-coc-timers.cloudfunctions.net/syncAlerts";
