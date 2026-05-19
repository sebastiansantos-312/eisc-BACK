import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3001);

const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "EISC Meet Firebase/Auth API Docs",
    version: "1.0.0",
    description:
      "Documentacion Sprint 1 para Firebase Auth, Firestore users y validacion de usernames. La ejecucion real de Auth ocurre desde eisc-meet contra Firebase.",
  },
  servers: [{ url: `http://localhost:${port}`, description: "Local docs server" }],
  tags: [
    { name: "Auth", description: "Flujos de registro/login en Firebase Auth" },
    { name: "Firestore", description: "Colecciones principales de Sprint 1" },
    { name: "Rooms", description: "Modelo y flujos base de salas de Sprint 2" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Firestore"],
        summary: "Health check del backend principal de documentacion",
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
        tags: ["Firestore"],
        summary: "Documento OpenAPI del Sprint 1",
        responses: { "200": { description: "OpenAPI JSON" } },
      },
    },
    "/auth/register-manual": {
      post: {
        tags: ["Auth"],
        summary: "Flujo documentado de registro manual",
        description:
          "Cliente crea usuario en Firebase Auth y reserva username unico en Firestore usernames/{username}; luego guarda users/{uid}.",
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
          "409": { description: "Username ocupado" },
        },
      },
    },
    "/auth/google": {
      post: {
        tags: ["Auth"],
        summary: "Flujo documentado de registro/login Google",
        description:
          "Primer ingreso crea users/{uid} con profileCompleted=false; luego el cliente exige completar username.",
        responses: {
          "200": { description: "Perfil existente o base inicial cargada" },
        },
      },
    },
    "/auth/complete-profile": {
      post: {
        tags: ["Auth"],
        summary: "Completar perfil con username unico",
        description:
          "Reserva usernames/{username} y actualiza users/{uid} con profileCompleted=true.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CompleteProfileRequest" },
            },
          },
        },
        responses: {
          "200": { description: "Perfil completado" },
          "409": { description: "Username ocupado" },
        },
      },
    },
    "/firestore/users/{uid}": {
      get: {
        tags: ["Firestore"],
        summary: "Documento de perfil de usuario",
        parameters: [{ name: "uid", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Perfil de usuario",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UserData" } } },
          },
        },
      },
    },
    "/firestore/usernames/{username}": {
      get: {
        tags: ["Firestore"],
        summary: "Indice de unicidad de username",
        parameters: [{ name: "username", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Documento que apunta al uid propietario",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UsernameReservation" } } },
          },
        },
      },
    },
    "/rooms": {
      post: {
        tags: ["Rooms"],
        summary: "Crear sala de estudio",
        description: "Cliente autenticado crea rooms/{roomId} en Firestore con ownerId, nombre, materia, descripcion y cupo maximo.",
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
            content: { "application/json": { schema: { $ref: "#/components/schemas/Room" } } },
          },
          "401": { description: "Usuario no autenticado" },
        },
      },
      get: {
        tags: ["Rooms"],
        summary: "Listar salas propias",
        description: "Consulta Firestore rooms filtrando por ownerId igual al uid autenticado.",
        responses: {
          "200": {
            description: "Listado de salas del usuario",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Room" } },
              },
            },
          },
        },
      },
    },
    "/rooms/{roomId}": {
      get: {
        tags: ["Rooms"],
        summary: "Obtener sala por ID",
        parameters: [{ name: "roomId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Detalle de sala",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Room" } } },
          },
          "404": { description: "Sala inexistente" },
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
          service: { type: "string", example: "eisc-firebase" },
        },
      },
      RegisterManualRequest: {
        type: "object",
        required: ["firstName", "lastName", "username", "email", "password"],
        properties: {
          firstName: { type: "string", example: "Jane" },
          lastName: { type: "string", example: "Smith" },
          username: { type: "string", example: "jane_smith", pattern: "^[a-z0-9_]{3,20}$" },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 6 },
        },
      },
      CompleteProfileRequest: {
        type: "object",
        required: ["firstName", "lastName", "username"],
        properties: {
          firstName: { type: "string" },
          lastName: { type: "string" },
          username: { type: "string", pattern: "^[a-z0-9_]{3,20}$" },
        },
      },
      UserData: {
        type: "object",
        required: ["uid", "email", "profileCompleted"],
        properties: {
          uid: { type: "string" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          username: { type: "string" },
          name: { type: "string", nullable: true },
          email: { type: "string", nullable: true },
          photoURL: { type: "string", nullable: true },
          profileCompleted: { type: "boolean" },
          bio: { type: "string" },
          university: { type: "string" },
          major: { type: "string" },
          year: { type: "string" },
          gpa: { type: "string" },
          studyHours: { type: "number" },
          sessionsJoined: { type: "number" },
          allowStudyInvites: { type: "boolean" },
          enableEmailNotifications: { type: "boolean" },
          showStudyHoursPublic: { type: "boolean" },
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
          name: { type: "string", example: "Data Structures Review" },
          subject: { type: "string", example: "Computer Science" },
          description: { type: "string", example: "Review linked lists and trees before the quiz." },
          maxParticipants: { type: "number", minimum: 2, maximum: 50, example: 8 },
        },
      },
      Room: {
        type: "object",
        required: ["id", "ownerId", "name", "subject", "status", "maxParticipants", "participantIds"],
        properties: {
          id: { type: "string" },
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
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EISC Meet API Docs</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #0f172a; color: #e5e7eb; }
    main { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
    h1, h2 { color: #ffffff; }
    a { color: #7dd3fc; }
    code, pre { background: #111827; border: 1px solid #334155; border-radius: 8px; }
    code { padding: 2px 6px; }
    pre { padding: 16px; overflow: auto; }
    section { margin-top: 28px; }
  </style>
</head>
<body>
  <main>
    <h1>EISC Meet Firebase/Auth Docs</h1>
    <p>Backend principal de documentacion para Sprint 1. La app real de Auth corre desde <code>eisc-meet</code> contra Firebase Auth y Firestore.</p>
    <p><a href="/health">/health</a> · <a href="/openapi.json">/openapi.json</a></p>
    <section>
      <h2>Colecciones Firestore</h2>
      <ul>
        <li><code>users/{uid}</code>: perfil persistente del usuario.</li>
        <li><code>usernames/{username}</code>: indice para bloquear usernames duplicados.</li>
        <li><code>rooms/{roomId}</code>: salas creadas por usuarios autenticados.</li>
      </ul>
    </section>
    <section>
      <h2>Flujos Sprint 1</h2>
      <ul>
        <li>Registro manual: Firebase Auth + reserva username + <code>users/{uid}</code>.</li>
        <li>Google: crea perfil base y exige completar username.</li>
        <li>Login: carga perfil y protege rutas privadas.</li>
        <li>Salas Sprint 2: crear sala, listar salas propias y abrir sala por ID.</li>
      </ul>
    </section>
    <section>
      <h2>OpenAPI</h2>
      <pre id="spec"></pre>
    </section>
  </main>
  <script>
    fetch('/openapi.json').then((r) => r.json()).then((json) => {
      document.getElementById('spec').textContent = JSON.stringify(json, null, 2);
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

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `localhost:${port}`}`);

  if (url.pathname === "/health") {
    sendJson(response, 200, { status: "ok", service: "eisc-firebase" });
    return;
  }

  if (url.pathname === "/openapi.json") {
    sendJson(response, 200, openApiDocument);
    return;
  }

  if (url.pathname === "/" || url.pathname === "/docs") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(docsHtml);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(port, () => {
  console.log(`EISC Firebase docs server running on http://localhost:${port}/docs`);
});