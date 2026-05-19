import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import "dotenv/config";

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
          "Socket.io usa este endpoint para handshake y transporte. Los eventos documentados son newUser, usersOnline, room:join, room:leave, room:users y chat:message.",
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

try {
  httpServer.listen(port);
  console.log(`Server is running on port ${port}`);
  }
 catch (error) {
  console.error(error);
}

type OnlineUser = { socketId: string; userId: string };
type ChatMessagePayload = {
  userId: string;
  message: string;
  timestamp?: string;
};
type RoomPayload = {
  roomId?: string;
  userId?: string;
};

let onlineUsers: OnlineUser[] = [];
const roomUsers = new Map<string, OnlineUser[]>();

const emitRoomUsers = (roomId: string) => {
  io.to(roomId).emit("room:users", {
    roomId,
    users: roomUsers.get(roomId) ?? [],
  });
};

io.on("connection", (socket: Socket) => {
  onlineUsers.push({ socketId: socket.id, userId: "" });
  io.emit("usersOnline", onlineUsers);
  console.log(
    "A user connected with id: ",
    socket.id,
    " there are now ",
    onlineUsers.length,
    " online users"
  );

  socket.on("newUser", (userId: string) => {
    if (!userId) {
      return;
    }

    const existingUserIndex = onlineUsers.findIndex(
      user => user.socketId === socket.id
    );

    if (existingUserIndex !== -1) {
      onlineUsers[existingUserIndex] = { socketId: socket.id, userId };
    } else if (!onlineUsers.some(user => user.userId === userId)) {
      onlineUsers.push({ socketId: socket.id, userId });
    } else {
      onlineUsers = onlineUsers.map(user =>
        user.userId === userId ? { socketId: socket.id, userId } : user
      );
    }

    io.emit("usersOnline", onlineUsers);
  });

  socket.on("chat:message", (payload: ChatMessagePayload) => {
    const trimmedMessage = payload?.message?.trim();

    if (!trimmedMessage) {
      return;
    }

    const sender =
      onlineUsers.find(user => user.socketId === socket.id) ?? null;

    const outgoingMessage = {
      userId: payload.userId || sender?.userId || socket.id,
      message: trimmedMessage,
      timestamp: payload.timestamp ?? new Date().toISOString()
    };

    io.emit("chat:message", outgoingMessage);
    console.log(
      "Relayed chat message from: ",
      outgoingMessage.userId,
      " message: ",
      outgoingMessage.message
    );
  });

  socket.on("room:join", (payload: RoomPayload) => {
    const roomId = payload?.roomId?.trim();
    const userId = payload?.userId?.trim();

    if (!roomId || !userId) {
      socket.emit("room:error", { message: "roomId and userId are required." });
      return;
    }

    socket.join(roomId);

    const currentRoomUsers = roomUsers.get(roomId) ?? [];
    const nextRoomUsers = [
      ...currentRoomUsers.filter(user => user.userId !== userId && user.socketId !== socket.id),
      { socketId: socket.id, userId },
    ];

    roomUsers.set(roomId, nextRoomUsers);
    emitRoomUsers(roomId);
    console.log("User joined room:", roomId, "user:", userId);
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

  socket.on("disconnect", () => {
    onlineUsers = onlineUsers.filter(user => user.socketId !== socket.id);
    for (const [roomId, users] of roomUsers.entries()) {
      const nextRoomUsers = users.filter(user => user.socketId !== socket.id);
      roomUsers.set(roomId, nextRoomUsers);
      emitRoomUsers(roomId);
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
