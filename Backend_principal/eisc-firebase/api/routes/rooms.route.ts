import { Router } from "express";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { db } from "../config/firebaseAdmin.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { mapDoc } from "../utils/firestore.js";

const router = Router();

const roomsCollection = db.collection("rooms");

const roomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const messagesLimit = 100;

const findRoomRef = async (roomIdOrCode: string) => {
  const directRef = roomsCollection.doc(roomIdOrCode);
  const directSnapshot = await directRef.get();

  if (directSnapshot.exists) return directRef;

  const codeSnapshot = await roomsCollection.where("roomCode", "==", roomIdOrCode.toUpperCase()).limit(1).get();
  const firstRoom = codeSnapshot.docs[0];

  return firstRoom?.ref ?? null;
};

const isParticipant = (room: DocumentData, uid: string) => {
  const participantIds = Array.isArray(room.participantIds) ? room.participantIds : [];
  return room.ownerId === uid || participantIds.includes(uid);
};

router.use(verifyToken);

router.post("/", async (request, response) => {
  const uid = request.user?.uid;

  if (!uid) {
    response.status(401).json({ error: "No autorizado" });
    return;
  }

  const name = String(request.body?.name ?? "").trim();
  const subject = String(request.body?.subject ?? "").trim();
  const description = String(request.body?.description ?? "").trim();
  const maxParticipants = Math.min(Math.max(Number(request.body?.maxParticipants) || 8, 2), 50);

  if (!name || !subject) {
    response.status(400).json({ error: "La sala necesita nombre y materia." });
    return;
  }

  const roomRef = roomsCollection.doc();
  const nextRoomCode = roomCode();

  await db.runTransaction(async (transaction) => {
    transaction.set(roomRef, {
      roomCode: nextRoomCode,
      ownerId: uid,
      name,
      subject,
      description,
      status: "active",
      maxParticipants,
      participantIds: [uid],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(roomRef.collection("participants").doc(uid), {
      uid,
      role: "owner",
      joinedAt: FieldValue.serverTimestamp(),
    });
  });

  const snapshot = await roomRef.get();
  response.status(201).json(mapDoc({ id: snapshot.id, data: () => snapshot.data() ?? {} }));
});

router.get("/", async (request, response) => {
  const uid = request.user?.uid;

  if (!uid) {
    response.status(401).json({ error: "No autorizado" });
    return;
  }

  const [ownedSnapshot, participatingSnapshot] = await Promise.all([
    roomsCollection.where("ownerId", "==", uid).get(),
    roomsCollection.where("participantIds", "array-contains", uid).get(),
  ]);
  const rooms = new Map<string, ReturnType<typeof mapDoc>>();

  [...ownedSnapshot.docs, ...participatingSnapshot.docs].forEach((snapshot) => {
    rooms.set(snapshot.id, mapDoc(snapshot));
  });

  response.json(
    [...rooms.values()]
      .filter((room) => room.status !== "closed")
      .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? ""))),
  );
});

router.get("/:roomId", async (request, response) => {
  const uid = request.user?.uid;

  if (!uid) {
    response.status(401).json({ error: "No autorizado" });
    return;
  }

  const roomRef = await findRoomRef(request.params.roomId);
  const snapshot = roomRef ? await roomRef.get() : null;

  if (!snapshot?.exists) {
    response.status(404).json({ error: "Sala no encontrada" });
    return;
  }

  const room = snapshot.data() ?? {};

  if (!isParticipant(room, uid)) {
    response.status(403).json({ error: "No tienes acceso a esta sala" });
    return;
  }

  response.json(mapDoc({ id: snapshot.id, data: () => room }));
});

router.put("/:roomId", async (request, response) => {
  const uid = request.user?.uid;
  const roomRef = roomsCollection.doc(request.params.roomId);
  const snapshot = await roomRef.get();

  if (!uid) {
    response.status(401).json({ error: "No autorizado" });
    return;
  }

  if (!snapshot.exists) {
    response.status(404).json({ error: "Sala no encontrada" });
    return;
  }

  const room = snapshot.data() ?? {};

  if (room.ownerId !== uid) {
    response.status(403).json({ error: "Solo el anfitrion puede editar esta sala." });
    return;
  }

  if (room.status === "closed") {
    response.status(409).json({ error: "Esta sala ya fue eliminada." });
    return;
  }

  const name = String(request.body?.name ?? "").trim();
  const subject = String(request.body?.subject ?? "").trim();
  const description = String(request.body?.description ?? "").trim();
  const maxParticipants = Math.min(Math.max(Number(request.body?.maxParticipants) || Number(room.maxParticipants ?? 8), 2), 50);

  if (!name || !subject) {
    response.status(400).json({ error: "La sala necesita nombre y materia." });
    return;
  }

  const participantIds = Array.isArray(room.participantIds) ? room.participantIds : [];

  if (maxParticipants < participantIds.length) {
    response.status(400).json({ error: "El maximo no puede ser menor que los participantes actuales." });
    return;
  }

  await roomRef.update({
    name,
    subject,
    description,
    maxParticipants,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const updatedSnapshot = await roomRef.get();
  response.json(mapDoc({ id: updatedSnapshot.id, data: () => updatedSnapshot.data() ?? {} }));
});

router.get("/:roomId/messages", async (request, response) => {
  const uid = request.user?.uid;
  const roomRef = roomsCollection.doc(request.params.roomId);
  const snapshot = await roomRef.get();

  if (!uid) {
    response.status(401).json({ error: "No autorizado" });
    return;
  }

  if (!snapshot.exists) {
    response.status(404).json({ error: "Sala no encontrada" });
    return;
  }

  const room = snapshot.data() ?? {};

  if (!isParticipant(room, uid)) {
    response.status(403).json({ error: "No tienes acceso a esta sala" });
    return;
  }

  const messagesSnapshot = await roomRef
    .collection("messages")
    .orderBy("createdAt", "desc")
    .limit(messagesLimit)
    .get();

  response.json(messagesSnapshot.docs.map(mapDoc).reverse());
});

router.post("/:roomId/join", async (request, response) => {
  const uid = request.user?.uid;

  if (!uid) {
    response.status(401).json({ error: "No autorizado" });
    return;
  }

  const roomRef = await findRoomRef(request.params.roomId);

  if (!roomRef) {
    response.status(404).json({ error: "Sala no encontrada" });
    return;
  }

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(roomRef);

    if (!snapshot.exists) throw new Error("ROOM_NOT_FOUND");

    const room = snapshot.data() ?? {};
    const participantIds = Array.isArray(room.participantIds) ? room.participantIds.map(String) : [];

    if (room.status !== "active") throw new Error("ROOM_CLOSED");
    if (participantIds.includes(uid)) return;
    if (participantIds.length >= Number(room.maxParticipants ?? 8)) throw new Error("ROOM_FULL");

    transaction.update(roomRef, {
      participantIds: FieldValue.arrayUnion(uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(roomRef.collection("participants").doc(uid), {
      uid,
      role: "member",
      joinedAt: FieldValue.serverTimestamp(),
    });
  }).catch((error) => {
    if (error instanceof Error && error.message === "ROOM_NOT_FOUND") {
      response.status(404).json({ error: "Sala no encontrada" });
      return;
    }

    if (error instanceof Error && error.message === "ROOM_CLOSED") {
      response.status(409).json({ error: "La sala no esta activa." });
      return;
    }

    if (error instanceof Error && error.message === "ROOM_FULL") {
      response.status(409).json({ error: "La sala ya alcanzo el maximo de participantes." });
      return;
    }

    throw error;
  });

  if (response.headersSent) return;

  const snapshot = await roomRef.get();
  response.json(mapDoc({ id: snapshot.id, data: () => snapshot.data() ?? {} }));
});

router.delete("/:roomId", async (request, response) => {
  const uid = request.user?.uid;
  const roomRef = roomsCollection.doc(request.params.roomId);
  const snapshot = await roomRef.get();

  if (!uid) {
    response.status(401).json({ error: "No autorizado" });
    return;
  }

  if (!snapshot.exists) {
    response.status(404).json({ error: "Sala no encontrada" });
    return;
  }

  if (snapshot.data()?.ownerId !== uid) {
    response.status(403).json({ error: "Solo el owner puede cerrar esta sala" });
    return;
  }

  await roomRef.update({
    status: "closed",
    updatedAt: FieldValue.serverTimestamp(),
    closedAt: FieldValue.serverTimestamp(),
  });

  response.json({ ok: true });
});

export default router;
