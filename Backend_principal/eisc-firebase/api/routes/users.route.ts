import { Router } from "express";
import { admin, db } from "../config/firebaseAdmin.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { isValidUsername, normalizeUsername, toJsonData } from "../utils/firestore.js";

const router = Router();

const userRef = (uid: string) => db.collection("users").doc(uid);
const usernameRef = (username: string) => db.collection("usernames").doc(normalizeUsername(username));

router.use(verifyToken);

router.get("/me", async (request, response) => {
  const uid = request.user?.uid;

  if (!uid) {
    response.status(401).json({ error: "No autorizado" });
    return;
  }

  const snapshot = await userRef(uid).get();

  if (!snapshot.exists) {
    response.status(404).json({ error: "Perfil no encontrado" });
    return;
  }

  response.json(toJsonData(snapshot.data()));
});

router.put("/me", async (request, response) => {
  const uid = request.user?.uid;
  const email = request.user?.email ?? null;

  if (!uid) {
    response.status(401).json({ error: "No autorizado" });
    return;
  }

  const now = new Date().toISOString();
  const incoming = { ...request.body };
  delete incoming.uid;
  delete incoming.createdAt;

  const currentSnapshot = await userRef(uid).get();
  const currentProfile = currentSnapshot.exists ? currentSnapshot.data() : null;
  const nextUsername = incoming.username ? normalizeUsername(incoming.username) : undefined;

  if (nextUsername && !isValidUsername(nextUsername)) {
    response.status(400).json({ error: "Username invalido" });
    return;
  }

  const payload = {
    ...incoming,
    uid,
    email: incoming.email ?? currentProfile?.email ?? email,
    updatedAt: now,
    ...(currentSnapshot.exists ? {} : { createdAt: now }),
    ...(nextUsername ? { username: nextUsername, profileCompleted: true } : {}),
  };

  await db.runTransaction(async (transaction) => {
    if (nextUsername && nextUsername !== currentProfile?.username) {
      const nextUsernameRef = usernameRef(nextUsername);
      const usernameSnapshot = await transaction.get(nextUsernameRef);

      if (usernameSnapshot.exists && usernameSnapshot.data()?.uid !== uid) {
        throw new Error("USERNAME_TAKEN");
      }

      if (currentProfile?.username && currentProfile.username !== nextUsername) {
        transaction.delete(usernameRef(currentProfile.username));
      }

      transaction.set(nextUsernameRef, {
        uid,
        username: nextUsername,
        createdAt: now,
      });
    }

    transaction.set(userRef(uid), payload, { merge: true });
  }).catch((error) => {
    if (error instanceof Error && error.message === "USERNAME_TAKEN") {
      response.status(409).json({ error: "Este username ya esta en uso." });
      return;
    }

    throw error;
  });

  if (response.headersSent) return;

  const updatedSnapshot = await userRef(uid).get();
  response.json(toJsonData(updatedSnapshot.data()));
});

router.delete("/me", async (request, response) => {
  const uid = request.user?.uid;

  if (!uid) {
    response.status(401).json({ error: "No autorizado" });
    return;
  }

  const snapshot = await userRef(uid).get();
  const profile = snapshot.data();

  await db.runTransaction(async (transaction) => {
    if (profile?.username) {
      transaction.delete(usernameRef(profile.username));
    }

    transaction.delete(userRef(uid));
  });

  await admin.auth().deleteUser(uid);
  response.json({ ok: true });
});

router.post("/check-username", async (request, response) => {
  const username = normalizeUsername(request.body?.username);
  const currentUid = request.user?.uid;

  if (!currentUid || !isValidUsername(username)) {
    response.json({ available: false });
    return;
  }

  const snapshot = await usernameRef(username).get();
  const ownerUid = snapshot.exists ? snapshot.data()?.uid : null;

  response.json({ available: !ownerUid || ownerUid === currentUid });
});

export default router;
