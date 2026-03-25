# Hotfix: Problema de "Sincronizando..." Infinito en Producción

## Problema Identificado
Al iniciar sesión en producción (Netlify), la aplicación mostraba "sincronizando..." continuamente con peticiones infinitas a Firebase, mientras que en desarrollo (local) funcionaba perfectamente.

## Causas Raíz

### 1. **Timeout muy corto (10 segundos)**
   - En producción con mayor latencia de red, las operaciones de Firestore pueden tardar más de 10 segundos
   - Esto causaba que se rechazaran las promesas prematuramente
   - El timeout ha sido aumentado a **30 segundos** (línea 397)

### 2. **Estado `isSyncingCloud` no se actualizaba en todos los casos**
   - La función `cleanup()` solo ejecutaba `setIsSyncingCloud(false)` si `isMounted` era `true`
   - En ciertos casos (cuando el efecto se limpiaba antes de completar), `isMounted` ya era `false`
   - Esto dejaba la UI mostrando "sincronizando..." indefinidamente
   - Ahora `cleanup()` **siempre** pone `isSyncingCloud = false` sin importar el estado de montaje (línea 385)

### 3. **Demasiadas peticiones paralelas al sembrardatos**
   - Cuando la colección estaba vacía, se hacían `Promise.all()` de todas las inserciones locales en paralelo
   - Con 100+ transacciones locales = 100+ peticiones simultáneas a Firebase
   - Esto podría causar rate limiting o timeouts
   - Ahora las inserciones se hacen en **lotes de 10** (línea 420)

## Cambios Realizados

### Archivo: `src/App.tsx`

#### Cambio 1: Aumentar timeout de sincronización
```typescript
// Antes: 10000ms
setTimeout(() => {
  reject(new Error('Timeout: La sincronización tardó más de 10 segundos'))
}, 10000)

// Después: 30000ms
setTimeout(() => {
  reject(new Error('Timeout: La sincronización tardó más de 30 segundos'))
}, 30000)
```

#### Cambio 2: Asegurar que `isSyncingCloud` siempre se ponga a false
```typescript
// Antes:
const cleanup = () => {
  if (syncTimeout) {
    clearTimeout(syncTimeout)
  }
  if (isMounted) {
    setIsSyncingCloud(false)
  }
}

// Después:
const cleanup = () => {
  if (syncTimeout) {
    clearTimeout(syncTimeout)
  }
  // Siempre poner isSyncingCloud a false, sin importar si está montado
  setIsSyncingCloud(false)
}
```

#### Cambio 3: Insertar datos en lotes para evitar saturar Firebase
```typescript
// Antes: Todas las inserciones en paralelo
const createdRefs = await Promise.all(
  seedSource.map((item) =>
    addDoc(transactionsCollection, { ... })
  ),
)

// Después: Inserciones en lotes de 10
const batchSize = 10
const allRefs: unknown[] = []

for (let i = 0; i < seedSource.length; i += batchSize) {
  const batch = seedSource.slice(i, i + batchSize)
  const createdRefs = await Promise.all(
    batch.map((item) =>
      addDoc(transactionsCollection, { ... })
    ),
  )
  allRefs.push(...createdRefs)
}
```

## Resultado Esperado
- ✅ La sincronización debería completarse sin mostrar "sincronizando..." indefinidamente
- ✅ Mayor tolerancia a latencia en producción
- ✅ Menos peticiones simultáneas a Firebase, reduciendo rate limiting
- ✅ El estado de la UI se actualiza correctamente después de completar

## Cómo Verificar

1. **En Producción (Netlify)**:
   - Inicia sesión normalmente
   - Verifica que dice "conectado" después de 1-2 segundos (no "sincronizando..." infinitamente)
   - Abre DevTools > Network y verifica que no hay peticiones infinitas

2. **En Local**:
   - `npm run dev`
   - Verifica que funciona como antes
   - Prueba crear/editar/eliminar transacciones

## Notas
- El cambio es completamente compatible con código existente
- No requiere cambios en la configuración de Firebase
- No afecta la lógica de negocio, solo la sincronización inicial

