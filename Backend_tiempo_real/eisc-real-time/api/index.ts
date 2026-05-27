import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import "dotenv/config";
import { FieldValue } from "firebase-admin/firestore";
import { admin, db } from "./config/firebaseAdmin.js";

const defaultOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
];
const origins = (process.env.ORIGIN ? process.env.ORIGIN.split(",") : defaultOrigins)
  .map(s => s.trim())
  .filter(Boolean);

const port = Number(process.env.PORT ?? 3000);

const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "EISC Meet Back API Docs",
    version: "1.0.0",
    description:
      "Documentacion desplegada en Render para los flujos de Sprint 1 con Firebase Auth/Firestore y la infraestructura Socket.io de Sprint 2.",
  },
  servers: [
    { url: "https://eisc-back.onrender.com", description: "Render production" },
    { url: `http://localhost:${port}`, description: "Local development" },
  ],
  tags: [
    { name: "Health", description: "Estado del backend desplegado" },
    { name: "Auth", description: "Flujos documentados de Firebase Auth" },
    { name: "Firestore", description: "Modelos y colecciones de Firestore" },
    { name: "Rooms", description: "Flujos documentados de creacion y acceso a salas" },
    { name: "Sockets", description: "Eventos Socket.io para presencia, salas y chat" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Verifica que el backend esta activo",
        responses: {
          "200": {
            description: "Servidor activo",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    },
    "/openapi.json": {
      get: {
        tags: ["Health"],
        summary: "Documento OpenAPI usado por Swagger UI",
        responses: {
          "200": { description: "OpenAPI JSON" },
        },
      },
    },
    "/auth/register-manual": {
      post: {
        tags: ["Auth"],
        summary: "US-01 Registro manual",
        description:
          "Flujo documentado: el cliente crea usuario en Firebase Auth, valida username unico y guarda el perfil en Firestore users/{uid}.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterManualRequest" },
            },
          },
        },
        responses: {
          "201": { description: "Usuario creado y persistido en Firestore" },
          "409": { description: "Username o correo ocupado" },
        },
      },
    },
    "/auth/google": {
      post: {
        tags: ["Auth"],
        summary: "US-02 Registro/Login con Google",
        description:
          "Flujo documentado: Firebase autentica con Google; en primer ingreso se crea perfil base y se exige completar username.",
        responses: {
          "200": { description: "Perfil existente o perfil base creado" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "US-03 Inicio de sesion",
        description:
          "Flujo documentado: Firebase Auth valida credenciales y el front carga users/{uid} para permitir acceso al dashboard.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" },
            },
          },
        },
        responses: {
          "200": { description: "Sesion iniciada y perfil cargado" },
          "401": { description: "Credenciales invalidas" },
        },
      },
    },
    "/firestore/users/{uid}": {
      get: {
        tags: ["Firestore"],
        summary: "Modelo users/{uid}",
        parameters: [{ name: "uid", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Perfil de usuario",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UserData" },
              },
            },
          },
        },
      },
    },
    "/firestore/usernames/{username}": {
      get: {
        tags: ["Firestore"],
        summary: "Modelo usernames/{username}",
        description: "Indice usado para bloquear usernames duplicados.",
        parameters: [{ name: "username", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Reserva de username",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UsernameReservation" },
              },
            },
          },
        },
      },
    },
    "/rooms": {
      post: {
        tags: ["Rooms"],
        summary: "US-06 Crear sala de estudio",
        description:
          "Flujo documentado: el cliente crea rooms/{roomId}, genera roomCode, agrega ownerId a participantIds y registra rooms/{roomId}/participants/{uid}.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateRoomRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Sala creada",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Room" },
              },
            },
          },
          "401": { description: "Usuario no autenticado" },
        },
      },
      get: {
        tags: ["Rooms"],
        summary: "Listar salas donde participa el usuario",
        description:
          "Consulta Firestore rooms con participantIds array-contains uid para mostrar salas propias y salas unidas.",
        responses: {
          "200": {
            description: "Listado de salas",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Room" } },
              },
            },
          },
        },
      },
    },
    "/rooms/{roomIdOrCode}/join": {
      post: {
        tags: ["Rooms"],
        summary: "Unirse a sala por ID o codigo",
        description:
          "Flujo documentado: busca una sala por document ID o roomCode, valida cupo y agrega el uid a participantIds y participants/{uid}.",
        parameters: [{ name: "roomIdOrCode", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/JoinRoomRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Usuario unido a la sala",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Room" },
              },
            },
          },
          "404": { description: "Sala no encontrada" },
          "409": { description: "Sala llena" },
        },
      },
    },
    "/socket.io": {
      get: {
        tags: ["Sockets"],
        summary: "Endpoint tecnico de Socket.io",
        description:
          "Socket.io usa este endpoint para handshake y transporte. Los eventos documentados son newUser, usersOnline, room:join, room:leave, room:users, room:closed, chat:message, chat:error, webrtc:offer, webrtc:answer, webrtc:ice-candidate y webrtc:peer-left. chat:message requiere { roomId, message }, guarda el mensaje en Firestore y emite solo a los usuarios de la misma sala. room:closed notifica a los participantes cuando el anfitrion elimina/cierra la sala. Los eventos WebRTC transfieren ofertas SDP, respuestas SDP y candidatos ICE entre sockets de la misma sala.",
        responses: {
          "200": { description: "Handshake o transporte Socket.io" },
        },
      },
    },
  },
  components: {
    schemas: {
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "ok" },
          service: { type: "string", example: "eisc-real-time" },
          sockets: { type: "string", example: "enabled" },
        },
      },
      RegisterManualRequest: {
        type: "object",
        required: ["firstName", "lastName", "username", "email", "password"],
        properties: {
          firstName: { type: "string", example: "Sebastian" },
          lastName: { type: "string", example: "Lopez" },
          username: { type: "string", example: "sebas_lopez", pattern: "^[a-z0-9_]{3,20}$" },
          email: { type: "string", format: "email", example: "sebas@example.com" },
          password: { type: "string", minLength: 6, example: "secret123" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 6 },
        },
      },
      UserData: {
        type: "object",
        required: ["uid", "email"],
        properties: {
          uid: { type: "string" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          username: { type: "string" },
          name: { type: "string", nullable: true },
          email: { type: "string", nullable: true },
          photoURL: { type: "string", nullable: true },
          provider: { type: "string", enum: ["password", "google"] },
          profileCompleted: { type: "boolean" },
          bio: { type: "string" },
          university: { type: "string" },
          major: { type: "string" },
          year: { type: "string" },
          studyHours: { type: "number" },
          sessionsJoined: { type: "number" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      UsernameReservation: {
        type: "object",
        required: ["uid", "username"],
        properties: {
          uid: { type: "string" },
          username: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CreateRoomRequest: {
        type: "object",
        required: ["ownerId", "name", "subject", "maxParticipants"],
        properties: {
          ownerId: { type: "string" },
          name: { type: "string", example: "Repaso de estructuras de datos" },
          subject: { type: "string", example: "Ciencias de la computacion" },
          description: { type: "string", example: "Sesion para resolver ejercicios antes del parcial." },
          maxParticipants: { type: "number", minimum: 2, maximum: 50, example: 8 },
        },
      },
      JoinRoomRequest: {
        type: "object",
        required: ["uid"],
        properties: {
          uid: { type: "string" },
        },
      },
      Room: {
        type: "object",
        required: ["id", "roomCode", "ownerId", "name", "subject", "status", "maxParticipants", "participantIds"],
        properties: {
          id: { type: "string" },
          roomCode: { type: "string", example: "A1B2C3D4" },
          ownerId: { type: "string" },
          name: { type: "string" },
          subject: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["active", "scheduled"] },
          maxParticipants: { type: "number" },
          participantIds: { type: "array", items: { type: "string" } },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
};

const docsHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EISC Meet API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; background: #f8fafc; }
    .topbar { display: none; }
    .swagger-ui .info { margin: 32px 0; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.addEventListener("load", () => {
      SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout"
      });
    });
  </script>
</body>
</html>`;

const sendJson = (response: import("node:http").ServerResponse, statusCode: number, payload: unknown) => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  response.end(JSON.stringify(payload, null, 2));
};

const httpServer = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `localhost:${port}`}`);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/health") {
    sendJson(response, 200, { status: "ok", service: "eisc-real-time", sockets: "enabled" });
    return;
  }

  if (pathname === "/openapi.json") {
    sendJson(response, 200, openApiDocument);
    return;
  }

  if (pathname === "/" || pathname === "/docs") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(docsHtml);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

const io = new Server(httpServer, {
  cors: {
    origin: origins
  }
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token || typeof token !== "string") {
    next(new Error("No autorizado"));
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    socket.data.uid = decoded.uid;
    next();
  } catch {
    next(new Error("No autorizado"));
  }
});

try {
  httpServer.listen(port);
  console.log(`Server is running on port ${port}`);
  }
 catch (error) {
  console.error(error);
}

type OnlineUser = { socketId: string; userId: string; displayName?: string; avatar?: string; isMuted?: boolean; isVideoOff?: boolean };
type ChatMessagePayload = {
  roomId?: string;
  message: string;
  timestamp?: string;
};
type RoomPayload = {
  roomId?: string;
  displayName?: string;
  avatar?: string;
};
type RoomOccupancyWatchPayload = {
  roomIds?: string[];
};
type MediaStatePayload = {
  roomId?: string;
  isMuted?: boolean;
  isVideoOff?: boolean;
};
type WebRtcSignalPayload = {
  roomId?: string;
  targetSocketId?: string;
  offer?: unknown;
  answer?: unknown;
  candidate?: unknown;
};

let onlineUsers: OnlineUser[] = [];
const roomUsers = new Map<string, OnlineUser[]>();

const sanitizePresenceField = (value: unknown, maxLength: number) => {
  return typeof value === "string" ? value.trim().slice(0, maxLength) || undefined : undefined;
};

const emitRoomUsers = (roomId: string) => {
  const users = roomUsers.get(roomId) ?? [];

  io.to(roomId).emit("room:users", {
    roomId,
    users,
  });
  io.emit("room:occupancy", { roomId, count: users.length });
};

const getRoomOccupancySnapshot = (roomIds: string[]) => {
  return roomIds.reduce<Record<string, number>>((snapshot, roomId) => {
    snapshot[roomId] = roomUsers.get(roomId)?.length ?? 0;
    return snapshot;
  }, {});
};

io.on("connection", (socket: Socket) => {
  const uid = String(socket.data.uid ?? "");

  onlineUsers = [
    ...onlineUsers.filter(user => user.userId !== uid && user.socketId !== socket.id),
    { socketId: socket.id, userId: uid },
  ];
  io.emit("usersOnline", onlineUsers);
  console.log(
    "A user connected with id: ",
    socket.id,
    " there are now ",
    onlineUsers.length,
    " online users"
  );

  socket.on("newUser", () => {
    if (!uid) {
      return;
    }

    const existingUserIndex = onlineUsers.findIndex(
      user => user.socketId === socket.id
    );

    if (existingUserIndex !== -1) {
      onlineUsers[existingUserIndex] = { socketId: socket.id, userId: uid };
    } else if (!onlineUsers.some(user => user.userId === uid)) {
      onlineUsers.push({ socketId: socket.id, userId: uid });
    } else {
      onlineUsers = onlineUsers.map(user =>
        user.userId === uid ? { socketId: socket.id, userId: uid } : user
      );
    }

    io.emit("usersOnline", onlineUsers);
  });

  socket.on("chat:message", async (payload: ChatMessagePayload) => {
    const roomId = payload?.roomId?.trim();
    const trimmedMessage = payload?.message?.trim();

    if (!roomId || !trimmedMessage || !uid) {
      socket.emit("chat:error", { message: "roomId y message son requeridos." });
      return;
    }

    try {
      const roomRef = db.collection("rooms").doc(roomId);
      const roomSnapshot = await roomRef.get();

      if (!roomSnapshot.exists) {
        socket.emit("chat:error", { message: "Sala no encontrada." });
        return;
      }

      const room = roomSnapshot.data() ?? {};
      const participantIds = Array.isArray(room.participantIds) ? room.participantIds.map(String) : [];

      if (room.ownerId !== uid && !participantIds.includes(uid)) {
        socket.emit("chat:error", { message: "No tienes acceso a esta sala." });
        return;
      }

      const messageRef = roomRef.collection("messages").doc();
      const createdAt = FieldValue.serverTimestamp();

      await messageRef.set({
        roomId,
        senderId: uid,
        message: trimmedMessage,
        createdAt,
      });

      const savedMessage = await messageRef.get();
      const savedData = savedMessage.data() ?? {};
      const outgoingMessage = {
        id: savedMessage.id,
        roomId,
        senderId: uid,
        message: trimmedMessage,
        createdAt: savedData.createdAt?.toDate?.().toISOString?.() ?? new Date().toISOString(),
      };

      io.to(roomId).emit("chat:message", outgoingMessage);
      console.log("Relayed room chat message:", roomId, "from:", uid);
    } catch (error) {
      console.error("Unable to persist chat message:", error);
      socket.emit("chat:error", { message: "No se pudo enviar el mensaje." });
    }
  });

  socket.on("room:join", (payload: RoomPayload) => {
    const roomId = payload?.roomId?.trim();
    const displayName = sanitizePresenceField(payload?.displayName, 80);
    const avatar = sanitizePresenceField(payload?.avatar, 8);

    if (!roomId || !uid) {
      socket.emit("room:error", { message: "roomId is required." });
      return;
    }

    socket.join(roomId);

    const currentRoomUsers = roomUsers.get(roomId) ?? [];
    const nextRoomUsers = [
      ...currentRoomUsers.filter(user => user.userId !== uid && user.socketId !== socket.id),
      { socketId: socket.id, userId: uid, displayName, avatar, isMuted: true, isVideoOff: true },
    ];

    roomUsers.set(roomId, nextRoomUsers);
    emitRoomUsers(roomId);
    console.log("User joined room:", roomId, "user:", uid);
  });

  socket.on("room:occupancy:watch", (payload: RoomOccupancyWatchPayload) => {
    const roomIds = Array.isArray(payload?.roomIds) ? payload.roomIds.map(String).filter(Boolean) : [];
    socket.emit("room:occupancy:snapshot", { rooms: getRoomOccupancySnapshot(roomIds) });
  });

  socket.on("room:leave", (payload: RoomPayload) => {
    const roomId = payload?.roomId?.trim();

    if (!roomId) {
      return;
    }

    socket.leave(roomId);

    const nextRoomUsers = (roomUsers.get(roomId) ?? []).filter(user => user.socketId !== socket.id);
    roomUsers.set(roomId, nextRoomUsers);
    emitRoomUsers(roomId);
    console.log("User left room:", roomId, "socket:", socket.id);
  });

  socket.on("room:media-state", (payload: MediaStatePayload) => {
    const roomId = payload?.roomId?.trim();

    if (!roomId || !uid) {
      return;
    }

    const nextRoomUsers = (roomUsers.get(roomId) ?? []).map(user => {
      if (user.socketId !== socket.id) return user;

      return {
        ...user,
        isMuted: Boolean(payload.isMuted),
        isVideoOff: Boolean(payload.isVideoOff),
      };
    });

    roomUsers.set(roomId, nextRoomUsers);
    socket.to(roomId).emit("room:media-state", {
      roomId,
      fromSocketId: socket.id,
      fromUserId: uid,
      isMuted: Boolean(payload.isMuted),
      isVideoOff: Boolean(payload.isVideoOff),
    });
    emitRoomUsers(roomId);
  });

  socket.on("room:closed", async (payload: RoomPayload) => {
    const roomId = payload?.roomId?.trim();

    if (!roomId || !uid) {
      socket.emit("room:error", { message: "roomId is required." });
      return;
    }

    try {
      const roomSnapshot = await db.collection("rooms").doc(roomId).get();

      if (!roomSnapshot.exists) {
        socket.emit("room:error", { message: "Sala no encontrada." });
        return;
      }

      const room = roomSnapshot.data() ?? {};

      if (room.ownerId !== uid) {
        socket.emit("room:error", { message: "Solo el anfitrion puede cerrar esta sala." });
        return;
      }

      io.to(roomId).emit("room:closed", { roomId });
      roomUsers.delete(roomId);
      console.log("Room closed notification emitted:", roomId, "by:", uid);
    } catch (error) {
      console.error("Unable to emit room closed notification:", error);
      socket.emit("room:error", { message: "No se pudo notificar el cierre de la sala." });
    }
  });

  socket.on("webrtc:offer", (payload: WebRtcSignalPayload) => {
    const roomId = payload?.roomId?.trim();
    const targetSocketId = payload?.targetSocketId?.trim();

    if (!roomId || !targetSocketId || !payload.offer) {
      socket.emit("webrtc:error", { message: "Oferta WebRTC incompleta." });
      return;
    }

    socket.to(targetSocketId).emit("webrtc:offer", {
      roomId,
      fromSocketId: socket.id,
      fromUserId: uid,
      offer: payload.offer,
    });
  });

  socket.on("webrtc:answer", (payload: WebRtcSignalPayload) => {
    const roomId = payload?.roomId?.trim();
    const targetSocketId = payload?.targetSocketId?.trim();

    if (!roomId || !targetSocketId || !payload.answer) {
      socket.emit("webrtc:error", { message: "Respuesta WebRTC incompleta." });
      return;
    }

    socket.to(targetSocketId).emit("webrtc:answer", {
      roomId,
      fromSocketId: socket.id,
      fromUserId: uid,
      answer: payload.answer,
    });
  });

  socket.on("webrtc:ice-candidate", (payload: WebRtcSignalPayload) => {
    const roomId = payload?.roomId?.trim();
    const targetSocketId = payload?.targetSocketId?.trim();

    if (!roomId || !targetSocketId || !payload.candidate) {
      return;
    }

    socket.to(targetSocketId).emit("webrtc:ice-candidate", {
      roomId,
      fromSocketId: socket.id,
      fromUserId: uid,
      candidate: payload.candidate,
    });
  });

  socket.on("disconnect", () => {
    onlineUsers = onlineUsers.filter(user => user.socketId !== socket.id);
    for (const [roomId, users] of roomUsers.entries()) {
      const nextRoomUsers = users.filter(user => user.socketId !== socket.id);
      roomUsers.set(roomId, nextRoomUsers);
      emitRoomUsers(roomId);
      io.to(roomId).emit("webrtc:peer-left", { roomId, socketId: socket.id, userId: uid });
    }
    io.emit("usersOnline", onlineUsers);
    console.log(
      "A user disconnected with id: ",
      socket.id,
      " there are now ",
      onlineUsers.length,
      " online users"
    );
  });
});
