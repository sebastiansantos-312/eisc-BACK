import admin from "firebase-admin";

const normalizePrivateKey = (value?: string) => {
  if (!value) return undefined;

  return value
    .replace(/^"|"$/g, "")
    .replace(/^'|'$/g, "")
    .replace(/\\n/g, "\n")
    .trim();
};

const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
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

export { admin };
