import admin from "firebase-admin";

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

if (!admin.apps.length) {
  const credential = projectId && clientEmail && privateKey
    ? admin.credential.cert({ projectId, clientEmail, privateKey })
    : admin.credential.applicationDefault();

  admin.initializeApp({
    credential,
    projectId,
  });
}

const db = admin.firestore();

export { admin, db };
