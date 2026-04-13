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

Configura estas reglas en Firestore Security Rules (Firebase Console > Firestore Database > Rules):

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /cards/{document=**} {
      allow read, write: if request.auth != null;
    }

    match /charges/{document=**} {
      allow read, write: if request.auth != null;
    }

    // Opcional: solo si mantienes datos de perfiles en users.
    match /users/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Importante:** Las reglas deben permitir `read` a usuarios autenticados. Si ves "sincronizando..." infinito en producción, verifica que:

1. Las reglas están publicadas (no en draft)
2. El usuario está autenticado (`request.auth != null`)
3. Las colecciones son exactamente `cards` y `charges`
4. No hay reglas más restrictivas superiores

## Troubleshooting

### "Aplicación: sincronizando..." infinitamente

**En Netlify/Producción:**

1. Abre DevTools (F12) > Console
2. Busca el error exacto que dice
3. Acciones según el error:
   - **"Missing or insufficient permissions"** → Actualiza las Firestore Rules (ver sección arriba)
   - **"Failed to get document because the client is offline"** → Revisa conexión a internet del navegador
   - **"Quota exceeded"** → El proyecto Firebase está en plan gratuito sin cuota. Sube a plan Blaze o verifica uso

**En local:**

- Verifica que `.env` tiene valores válidos de Firebase
- Que el usuario existe en Firebase Authentication
- Que las Firestore Rules permiten lectura

### "No configurado"

- Las variables de entorno `VITE_FIREBASE_*` no están definidas
- En local: crea `.env` desde `.env.example`
- En Netlify: agrega variables en Site settings > Environment variables


