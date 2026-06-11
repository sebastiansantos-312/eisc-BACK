# eisc-real-time — Backend de Tiempo Real

Servidor Node.js / TypeScript que gestiona la presencia en sala, el chat en tiempo real y el **Signaling Server WebRTC** para las conexiones P2P de audio, video y pantalla compartida de **EISC Meet**.

Implementa las historias técnicas **TS-02** (WebSockets / modelado de salas y chat) y **TS-03** (Signaling WebRTC) del Mini-proyecto 2.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20 LTS |
| Lenguaje | TypeScript 5 |
| Transporte en tiempo real | Socket.io 4 |
| Autenticación de tokens | Firebase Admin SDK 13 |
| Persistencia de mensajes | Firestore (via Firebase Admin) |
| Documentación API | OpenAPI 3.0 + Swagger UI (en `/docs`) |
| Despliegue | Render |

---

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto basándote en `.env.example`:

```env
PORT=3000
ORIGIN=http://localhost:5173,https://tu-front.vercel.app

# Firebase Admin (cuenta de servicio)
FIREBASE_PROJECT_ID=tu-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@tu-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

> **Importante:** `FIREBASE_PRIVATE_KEY` debe incluir los saltos de línea como `\n` literales en el archivo `.env`.

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

## Endpoints HTTP

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Verifica que el servidor está activo |
| `GET` | `/docs` | Swagger UI con la documentación completa |
| `GET` | `/openapi.json` | Documento OpenAPI 3.0 en JSON |

---

## Autenticación de sockets

Todos los clientes **deben** enviar un Firebase ID Token en el handshake:

```js
const socket = io(SOCKET_URL, {
  auth: { token: await firebaseUser.getIdToken() }
});
```

El middleware del servidor verifica el token con `admin.auth().verifyIdToken()`. Si el token es inválido o el correo no pertenece al dominio `@correounivalle.edu.co`, la conexión se rechaza con el error `"No autorizado"`.

---

## Eventos Socket.io — Referencia completa

### Convenciones

- **Cliente → Servidor**: el cliente emite el evento.
- **Servidor → Cliente(s)**: el servidor emite el evento.
- `roomId`: ID de documento Firestore de la sala.
- Todos los eventos de sala validan que el usuario sea participante en Firestore **y** que el socket esté unido al room de Socket.io antes de proceder.

---

### Presencia global

#### `newUser` — Cliente → Servidor
Registra o actualiza al usuario en la lista global de conectados.

```ts
// Payload: ninguno
socket.emit("newUser");
```

#### `usersOnline` — Servidor → Todos los clientes
Emitido al conectar, desconectar o al emitir `newUser`.

```ts
// Payload
[{ socketId: string; userId: string }]
```

---

### Gestión de sala

#### `room:join` — Cliente → Servidor
Une el socket a la sala (validando acceso en Firestore) y notifica la lista actualizada de participantes.

```ts
socket.emit("room:join", {
  roomId: string;      // ID de la sala en Firestore
  displayName?: string; // Nombre a mostrar (máx. 80 chars)
  avatar?: string;      // Iniciales del avatar (máx. 8 chars)
});
```

#### `room:leave` — Cliente → Servidor
Saca al socket de la sala y notifica al resto.

```ts
socket.emit("room:leave", { roomId: string });
```

#### `room:users` — Servidor → Participantes de la sala
Emitido tras `room:join`, `room:leave`, `room:media-state` y desconexión. Lista todos los usuarios actualmente en la sala.

```ts
// Payload
{
  roomId: string;
  users: Array<{
    socketId: string;
    userId: string;
    displayName?: string;
    avatar?: string;
    isMuted: boolean;
    isVideoOff: boolean;
  }>;
}
```

#### `room:closed` — Cliente → Servidor (solo anfitrión)
El anfitrión notifica el cierre de sala. El servidor reemite `room:closed` a todos los participantes.

```ts
socket.emit("room:closed", { roomId: string });

// El servidor emite a todos en la sala:
// { roomId: string }
```

#### `room:error` — Servidor → Cliente
Error de operación de sala (acceso denegado, sala no encontrada, etc.).

```ts
// Payload
{ message: string }
```

#### `room:occupancy:watch` — Cliente → Servidor
Solicita el conteo de participantes activos para una lista de salas.

```ts
socket.emit("room:occupancy:watch", { roomIds: string[] });

// El servidor responde con:
// "room:occupancy:snapshot" → { rooms: Record<string, number> }
```

#### `room:occupancy` — Servidor → Todos los clientes
Emitido cada vez que cambia la ocupación de una sala.

```ts
{ roomId: string; count: number }
```

---

### Chat en tiempo real

#### `chat:message` — Cliente → Servidor
Envía un mensaje de texto. El servidor lo persiste en Firestore (`rooms/{roomId}/messages`) y luego lo emite a todos los participantes de la sala.

```ts
socket.emit("chat:message", {
  roomId: string;  // ID de la sala
  message: string; // Texto (máx. 2000 caracteres)
});
```

**Restricciones:**
- Requiere que el socket esté en la sala (participante en Firestore).
- Mensajes vacíos o superiores a 2000 caracteres son rechazados.

#### `chat:message` — Servidor → Participantes de la sala
Mensaje persistido y retransmitido a todos en la sala.

```ts
// Payload emitido por el servidor
{
  id: string;         // ID del documento en Firestore
  roomId: string;
  senderId: string;   // UID del remitente
  message: string;
  createdAt: string;  // ISO 8601
}
```

#### `chat:error` — Servidor → Cliente
Error al enviar mensaje (acceso denegado, mensaje muy largo, fallo de persistencia).

```ts
{ message: string }
```

---

### Estados de audio/video

#### `room:media-state` — Cliente → Servidor
El cliente actualiza su estado de micrófono y cámara. El servidor actualiza el mapa interno y retransmite a los demás participantes de la sala.

```ts
socket.emit("room:media-state", {
  roomId: string;
  isMuted: boolean;    // true = micrófono apagado
  isVideoOff: boolean; // true = cámara apagada
});
```

#### `room:media-state` — Servidor → Otros participantes de la sala
Notifica el cambio de estado de un participante.

```ts
// Payload emitido por el servidor
{
  roomId: string;
  fromSocketId: string; // Socket del emisor
  fromUserId: string;   // UID del emisor
  isMuted: boolean;
  isVideoOff: boolean;
}
```

---

### WebRTC — Signaling Server (TS-03)

El servidor actúa como **intermediario de señalización**. No procesa ni interpreta las cargas útiles SDP/ICE; simplemente las valida y las reenvía al socket de destino.

#### Flujo de negociación P2P

```
Peer A                  Servidor               Peer B
  |                        |                      |
  |-- webrtc:offer ------->|-- webrtc:offer ------>|
  |                        |                      |
  |<------ webrtc:answer --|<-- webrtc:answer -----|
  |                        |                      |
  |-- webrtc:ice-candidate>|-- webrtc:ice-candidate>|
  |<-- webrtc:ice-candidate|<-- webrtc:ice-candidate|
```

**Regla de negociación**: el peer cuyo `socket.id` sea lexicográficamente menor inicia la oferta para evitar colisiones en conexiones simultáneas.

---

#### `webrtc:offer` — Cliente → Servidor
Envía una oferta SDP al peer de destino.

```ts
socket.emit("webrtc:offer", {
  roomId: string;         // Sala en la que ocurre la negociación
  targetSocketId: string; // socket.id del peer receptor
  offer: RTCSessionDescriptionInit; // Oferta SDP
});
```

**Validaciones del servidor:**
- `roomId`, `targetSocketId` y `offer` son requeridos.
- Tanto el emisor como el receptor deben estar en la misma sala (`roomId`).

**Evento emitido al receptor:**

```ts
// "webrtc:offer" → targetSocketId
{
  roomId: string;
  fromSocketId: string; // socket.id del emisor
  fromUserId: string;   // UID del emisor
  offer: RTCSessionDescriptionInit;
}
```

---

#### `webrtc:answer` — Cliente → Servidor
Responde a una oferta SDP recibida.

```ts
socket.emit("webrtc:answer", {
  roomId: string;
  targetSocketId: string; // socket.id del peer que hizo la oferta
  answer: RTCSessionDescriptionInit; // Respuesta SDP
});
```

**Evento emitido al receptor:**

```ts
// "webrtc:answer" → targetSocketId
{
  roomId: string;
  fromSocketId: string;
  fromUserId: string;
  answer: RTCSessionDescriptionInit;
}
```

---

#### `webrtc:ice-candidate` — Cliente → Servidor (bidireccional)
Intercambia candidatos ICE entre peers para establecer la ruta de conectividad.

```ts
socket.emit("webrtc:ice-candidate", {
  roomId: string;
  targetSocketId: string;
  candidate: RTCIceCandidateInit; // Candidato ICE
});
```

**Evento emitido al receptor:**

```ts
// "webrtc:ice-candidate" → targetSocketId
{
  roomId: string;
  fromSocketId: string;
  fromUserId: string;
  candidate: RTCIceCandidateInit;
}
```

> **Nota:** El cliente debe almacenar los candidatos ICE recibidos antes de que `remoteDescription` esté configurado y aplicarlos en orden una vez que la descripción remota sea establecida (patrón `pendingCandidates`).

---

#### `webrtc:peer-left` — Servidor → Participantes de la sala
Emitido automáticamente cuando un socket se desconecta, para que los peers cierren la `RTCPeerConnection` correspondiente.

```ts
// Payload emitido por el servidor a todos en la sala
{
  roomId: string;
  socketId: string; // Socket del peer que se fue
  userId: string;   // UID del peer que se fue
}
```

#### `webrtc:error` — Servidor → Cliente
Error de señalización (payload incompleto, peers no en la misma sala).

```ts
{ message: string }
```

---

### Resumen de todos los eventos

| Evento | Dirección | Descripción |
|---|---|---|
| `newUser` | C → S | Registrar usuario en lista global |
| `usersOnline` | S → Todos | Lista de usuarios conectados |
| `room:join` | C → S | Unirse a sala |
| `room:leave` | C → S | Salir de sala |
| `room:users` | S → Sala | Lista de participantes actuales |
| `room:closed` | C → S | Anfitrión cierra sala |
| `room:closed` | S → Sala | Notificación de cierre |
| `room:error` | S → C | Error de operación de sala |
| `room:occupancy:watch` | C → S | Solicitar conteo de ocupación |
| `room:occupancy:snapshot` | S → C | Snapshot de ocupación |
| `room:occupancy` | S → Todos | Cambio de ocupación |
| `chat:message` | C → S | Enviar mensaje de chat |
| `chat:message` | S → Sala | Mensaje persistido y emitido |
| `chat:error` | S → C | Error al enviar mensaje |
| `room:media-state` | C → S | Actualizar estado mic/cámara |
| `room:media-state` | S → Sala | Cambio de estado de otro participante |
| `webrtc:offer` | C → S → C | Oferta SDP entre peers |
| `webrtc:answer` | C → S → C | Respuesta SDP entre peers |
| `webrtc:ice-candidate` | C → S → C | Candidato ICE entre peers |
| `webrtc:peer-left` | S → Sala | Peer desconectado |
| `webrtc:error` | S → C | Error de señalización |

---

## Modelo de datos Firestore (referencia)

### `rooms/{roomId}`
```ts
{
  id: string;
  roomCode: string;        // Código legible (ej: "A1B2C3D4")
  ownerId: string;         // UID del creador
  name: string;
  subject: string;
  description?: string;
  status: "active" | "closed";
  maxParticipants: number;
  participantIds: string[]; // UIDs de todos los participantes
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `rooms/{roomId}/messages/{messageId}`
```ts
{
  roomId: string;
  senderId: string;   // UID del remitente
  message: string;
  createdAt: Timestamp;
}
```

---

## Documentación interactiva

El servidor expone Swagger UI automáticamente en la raíz y en `/docs`:

- **Local:** `http://localhost:3000/docs`
- **Producción:** `https://eisc-real-time.onrender.com/docs`

---

## Despliegue en Render

1. Crear un nuevo servicio **Web Service** en Render.
2. Configurar el build command: `npm install && npm run build`
3. Configurar el start command: `npm start`
4. Agregar las variables de entorno del `.env.example`.
5. El campo `ORIGIN` debe incluir la URL del frontend en Vercel.
