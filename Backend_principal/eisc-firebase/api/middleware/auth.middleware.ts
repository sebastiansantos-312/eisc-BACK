import type { NextFunction, Request, Response } from "express";
import { admin } from "../config/firebaseAdmin.js";

const institutionalEmailDomain = "@correounivalle.edu.co";

const isInstitutionalEmail = (email: string | null | undefined) => {
  return Boolean(email?.trim().toLowerCase().endsWith(institutionalEmailDomain));
};

export const verifyToken = async (request: Request, response: Response, next: NextFunction) => {
  const header = request.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    response.status(401).json({ error: "No autorizado" });
    return;
  }

  try {
    const token = header.slice("Bearer ".length);
    const decoded = await admin.auth().verifyIdToken(token);
    const email = decoded.email ?? null;

    if (!isInstitutionalEmail(email)) {
      response.status(403).json({ error: `Usa tu correo institucional ${institutionalEmailDomain}.` });
      return;
    }

    request.user = {
      uid: decoded.uid,
      email,
    };

    next();
  } catch {
    response.status(401).json({ error: "No autorizado" });
  }
};
