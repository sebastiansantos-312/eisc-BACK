import express from "express";
import cors from "cors";
import usersRouter from "./routes/users.route.js";
import roomsRouter from "./routes/rooms.route.js";

const defaultOrigins = ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"];
const origins = (process.env.ORIGIN ? process.env.ORIGIN.split(",") : defaultOrigins).map((origin) => origin.trim()).filter(Boolean);

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "EISC Meet Firebase API",
    version: "2.0.0",
    description: "Backend principal para validar Firebase ID tokens, perfiles, usernames y metadata de salas.",
  },
  paths: {
    "/health": { get: { summary: "Health check" } },
    "/api/users/me": {
      get: { summary: "Obtener perfil autenticado" },
      put: { summary: "Crear o actualizar perfil autenticado" },
      delete: { summary: "Eliminar perfil y cuenta autenticada" },
    },
    "/api/users/check-username": { post: { summary: "Validar disponibilidad de username" } },
    "/api/rooms": {
      get: { summary: "Listar salas del usuario autenticado" },
      post: { summary: "Crear sala" },
    },
    "/api/rooms/{roomId}": {
      get: { summary: "Obtener sala" },
      delete: { summary: "Cerrar sala" },
    },
    "/api/rooms/{roomId}/join": { post: { summary: "Unirse a sala por ID o codigo" } },
  },
};

const docsHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EISC Meet Firebase API</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #0f172a; color: #e5e7eb; }
    main { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
    a { color: #7dd3fc; }
    code, pre { background: #111827; border: 1px solid #334155; border-radius: 8px; }
    code { padding: 2px 6px; }
    pre { padding: 16px; overflow: auto; }
  </style>
</head>
<body>
  <main>
    <h1>EISC Meet Firebase API</h1>
    <p>Backend principal real para perfiles, usernames y metadata de salas.</p>
    <p><a href="/health">/health</a> · <a href="/openapi.json">/openapi.json</a></p>
    <pre id="spec"></pre>
  </main>
  <script>
    fetch('/openapi.json').then((r) => r.json()).then((json) => {
      document.getElementById('spec').textContent = JSON.stringify(json, null, 2);
    });
  </script>
</body>
</html>`;

export const app = express();

app.use(cors({ origin: origins }));
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "eisc-firebase" });
});

app.get("/openapi.json", (_request, response) => {
  response.json(openApiDocument);
});

app.get(["/", "/docs"], (_request, response) => {
  response.type("html").send(docsHtml);
});

app.use("/api/users", usersRouter);
app.use("/api/rooms", roomsRouter);

app.use((_request, response) => {
  response.status(404).json({ error: "Not found" });
});
