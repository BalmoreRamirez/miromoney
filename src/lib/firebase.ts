import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseEnvConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
}

// Fallback config lets production run even when hosting env vars are not set.
const firebaseFallbackConfig = {
  apiKey: 'AIzaSyCZzqGnEVFE0Fdx41cRP10_zRSkYRsQ-1g',
  authDomain: 'miromoney-fa2ed.firebaseapp.com',
  projectId: 'miromoney-fa2ed',
  storageBucket: 'miromoney-fa2ed.firebasestorage.app',
  messagingSenderId: '373388406784',
  appId: '1:373388406784:web:ac68401ebade80b626a8e5',
}

const hasFullEnvConfig = Object.values(firebaseEnvConfig).every(
  (value) => typeof value === 'string' && value.length > 0,
)

const firebaseConfig = hasFullEnvConfig ? firebaseEnvConfig : firebaseFallbackConfig

const firebaseEnvMap: Record<string, string | undefined> = {
  VITE_FIREBASE_API_KEY: firebaseEnvConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseEnvConfig.authDomain,
  VITE_FIREBASE_PROJECT_ID: firebaseEnvConfig.projectId,
  VITE_FIREBASE_STORAGE_BUCKET: firebaseEnvConfig.storageBucket,
  VITE_FIREBASE_MESSAGING_SENDER_ID: firebaseEnvConfig.messagingSenderId,
  VITE_FIREBASE_APP_ID: firebaseEnvConfig.appId,
}

export const missingFirebaseEnvKeys = Object.entries(firebaseEnvMap)
  .filter(([, value]) => !value)
  .map(([key]) => key)

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (value) => typeof value === 'string' && value.length > 0,
)

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null

export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
