# eisc-firebase — Backend Principal

Servidor REST Node.js / TypeScript que gestiona la autenticación, perfiles de usuario y metadata de salas de **EISC Meet**, integrando Firebase Admin SDK con Firestore.

Implementa las historias técnicas **TS-01** (Firebase Auth / Perfiles Firestore) y parte de **TS-02** (modelado de salas y mensajes) del Mini-proyecto 2.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20 LTS |
| Lenguaje | TypeScript 5 |
| Framework HTTP | Express 5 |
| Autenticación | Firebase Admin SDK |
| Base de datos | Firestore (via Firebase Admin) |
| Documentación API | OpenAPI 3.0 (en `/openapi.json`) |
| Despliegue | Render |

---

## Variables de entorno

Crea un archivo `.env` basándote en `.env.example`:

```env
PORT=4000
ORIGIN=http://localhost:5173,https://tu-front.vercel.app

# Firebase Admin (cuenta de servicio)
FIREBASE_PROJECT_ID=tu-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@tu-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## Instalación y ejecución local

```bash
# Instalar dependencias
npm install

# Desarrollo con recarga automática
npm run dev

# Compilar a JavaScript
npm run build

# Ejecutar build compilado
npm start
```

---

## Autenticación

Todos los endpoints (excepto `/health` y `/openapi.json`) requieren un **Firebase ID Token** en la cabecera `Authorization`:

```
Authorization: Bearer <firebase-id-token>
```

El middleware `verifyToken` valida el token con `admin.auth().verifyIdToken()`. Si el token es inválido o está ausente, responde `401 No autorizado`.

---

## Referencia de la API REST

### Health

#### `GET /health`
Verifica que el servidor está activo.

**Respuesta 200:**
```json
{ "status": "ok", "service": "eisc-firebase" }
```

---

### Usuarios — `/api/users`

Todos los endpoints requieren `Authorization: Bearer <token>`.

#### `GET /api/users/me`
Obtiene el perfil del usuario autenticado desde Firestore.

**Respuesta 200:**
```json
{
  "uid": "abc123",
  "email": "user@correounivalle.edu.co",
  "firstName": "Sebastian",
  "lastName": "Lopez",
  "username": "sebas_lopez",
  "profileCompleted": true,
  "bio": "",
  "university": "Universidad del Valle",
  "major": "Ingeniería de Sistemas",
  "year": "2025",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

**Errores:**
- `401` — Token inválido o ausente
- `404` — Perfil no encontrado

---

#### `PUT /api/users/me`
Crea o actualiza el perfil del usuario autenticado. Usa merge, por lo que solo los campos enviados se actualizan.

**Restricciones de username:**
- Solo letras minúsculas, números y guión bajo (`^[a-z0-9_]{3,20}$`)
- Debe ser único en toda la plataforma (verificación atómica en Firestore)
- Si el username cambia, el anterior se libera automáticamente

**Body (todos los campos son opcionales):**
```json
{
  "firstName": "Sebastian",
  "lastName": "Lopez",
  "username": "sebas_lopez",
  "bio": "Estudiante de sistemas",
  "university": "Universidad del Valle",
  "major": "Ingeniería de Sistemas",
  "year": "2025",
  "photoURL": "https://..."
}
```

**Respuesta 200:** Perfil actualizado completo.

**Errores:**
- `400` — Username con formato inválido
- `401` — No autorizado
- `409` — Username ya está en uso por otro usuario

---

#### `DELETE /api/users/me`
Elimina el perfil de Firestore (`users/{uid}`) y la reserva del username (`usernames/{username}`), y borra la cuenta de Firebase Auth. Esta acción es **irreversible**.

**Respuesta 200:**
```json
{ "ok": true }
```

**Errores:**
- `401` — No autorizado

---

#### `POST /api/users/check-username`
Verifica si un username está disponible sin modificar datos. Útil para validación en tiempo real durante el registro.

**Body:**
```json
{ "username": "sebas_lopez" }
```

**Respuesta 200:**
```json
{ "available": true }
```
> `available: false` si el username ya pertenece a otro usuario. Si le pertenece al usuario autenticado, retorna `true`.

---

### Salas — `/api/rooms`

Todos los endpoints requieren `Authorization: Bearer <token>`.

#### `POST /api/rooms`
Crea una nueva sala de estudio. El creador queda como `ownerId` y se agrega a `participantIds`. Se genera un `roomCode` alfanumérico único de 6 caracteres.

**Body:**
```json
{
  "name": "Repaso de estructuras de datos",
  "subject": "Ciencias de la computación",
  "description": "Sesión para resolver ejercicios antes del parcial."
}
```

**Respuesta 201:** Sala creada completa.

**Errores:**
- `400` — `name` o `subject` vacíos
- `401` — No autorizado

---

#### `GET /api/rooms`
Lista todas las salas activas donde el usuario es participante (propias y unidas), ordenadas por fecha de creación descendente. Excluye salas con `status: "closed"`.

**Respuesta 200:**
```json
[
  {
    "id": "room123",
    "roomCode": "A1B2C3",
    "ownerId": "uid_owner",
    "name": "Sala de estudio",
    "subject": "Matemáticas",
    "status": "active",
    "participantIds": ["uid1", "uid2"],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
]
```

---

#### `GET /api/rooms/:roomId`
Obtiene los datos de una sala por su ID de Firestore. El usuario debe ser participante.

**Errores:**
- `401` — No autorizado
- `403` — El usuario no es participante de la sala
- `404` — Sala no encontrada

---

#### `PUT /api/rooms/:roomId`
Edita el nombre, materia y descripción de una sala. **Solo el `ownerId`** puede editar.

**Body:**
```json
{
  "name": "Nuevo nombre",
  "subject": "Nueva materia",
  "description": "Nueva descripción"
}
```

**Errores:**
- `400` — `name` o `subject` vacíos
- `401` — No autorizado
- `403` — El usuario no es el anfitrión
- `404` — Sala no encontrada
- `409` — La sala ya fue cerrada

---

#### `DELETE /api/rooms/:roomId`
Cierra la sala marcando `status: "closed"`. **Solo el `ownerId`** puede cerrarla. Esta acción es reversible a nivel de datos (los mensajes y participantes se conservan).

**Respuesta 200:**
```json
{ "ok": true }
```

**Errores:**
- `401` — No autorizado
- `403` — No es el dueño de la sala
- `404` — Sala no encontrada

---

#### `POST /api/rooms/:roomId/join`
Une al usuario autenticado a una sala existente por su ID de Firestore o por su `roomCode`. Si el usuario ya es participante, la operación es idempotente (no falla).

**Body:** ninguno requerido.

**Respuesta 200:** Sala actualizada.

**Errores:**
- `401` — No autorizado
- `404` — Sala no encontrada
- `409` — La sala no está activa (fue cerrada)

---

#### `GET /api/rooms/:roomId/messages`
Obtiene el historial de chat de una sala (últimos 100 mensajes, ordenados cronológicamente). El usuario debe ser participante.

**Respuesta 200:**
```json
[
  {
    "id": "msg123",
    "roomId": "room123",
    "senderId": "uid_sender",
    "message": "Hola a todos",
    "createdAt": "2026-01-01T10:00:00.000Z"
  }
]
```

**Errores:**
- `401` — No autorizado
- `403` — No es participante
- `404` — Sala no encontrada

---

## Modelo de datos Firestore

### `users/{uid}`
```ts
{
  uid: string;
  email: string | null;
  firstName?: string;
  lastName?: string;
  username?: string;
  name?: string | null;       // Nombre de Google (si aplica)
  photoURL?: string | null;
  provider: "password" | "google";
  profileCompleted: boolean;
  bio?: string;
  university?: string;
  major?: string;
  year?: string;
  studyHours?: number;
  sessionsJoined?: number;
  createdAt: string;          // ISO 8601
  updatedAt: string;
}
```

### `usernames/{username}`
Índice de unicidad de usernames (clave en minúsculas).
```ts
{
  uid: string;
  username: string;
  createdAt: string;
}
```

### `rooms/{roomId}`
```ts
{
  roomCode: string;           // Código alfanumérico de 6 chars
  ownerId: string;
  name: string;
  subject: string;
  description?: string;
  status: "active" | "closed";
  maxParticipants: number;
  participantIds: string[];   // UIDs de todos los participantes
  createdAt: Timestamp;
  updatedAt: Timestamp;
  closedAt?: Timestamp;
}
```

### `rooms/{roomId}/participants/{uid}`
```ts
{
  uid: string;
  role: "owner" | "member";
  joinedAt: Timestamp;
}
```

### `rooms/{roomId}/messages/{messageId}`
Gestionado por el backend de tiempo real (`eisc-real-time`).
```ts
{
  roomId: string;
  senderId: string;
  message: string;
  createdAt: Timestamp;
}
```

---

## Despliegue en Render

1. Crear un nuevo servicio **Web Service** en Render.
2. Build command: `npm install && npm run build`
3. Start command: `npm start`
4. Agregar las variables de entorno del `.env.example`.
5. El campo `ORIGIN` debe incluir la URL del frontend en Vercel.
