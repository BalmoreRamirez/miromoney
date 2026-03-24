# MiroMoney

Aplicacion web de control financiero (ingresos y egresos) con React + TypeScript + Firebase.

## Local

1. Instala dependencias:

```bash
npm install
```

2. Crea archivo `.env` desde `.env.example` y completa valores.

3. Ejecuta en desarrollo:

```bash
npm run dev
```

## Produccion (Netlify)

Este repo incluye `netlify.toml` con:

- Build command: `npm run build`
- Publish directory: `dist`
- Redirect SPA a `index.html`

### Variables de entorno en Netlify

Configura estas variables en Site settings > Environment variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_DEFAULT_LOGIN_EMAIL`
- `VITE_DEFAULT_LOGIN_PASSWORD`

Despues haz `Clear cache and deploy site`.

## Firebase

### Authentication

1. Habilita proveedor Email/Password.
2. Crea el usuario de login por defecto (el mismo email/password definido en variables `VITE_DEFAULT_LOGIN_*`).
3. Agrega dominios autorizados:
   - `localhost`
   - tu dominio de Netlify (`*.netlify.app` o custom domain)

### Firestore Rules (solo usuarios autenticados)

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /transactions/{docId} {
      allow read, write: if request.auth != null;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```
