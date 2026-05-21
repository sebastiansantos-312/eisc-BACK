import type { NextFunction, Request, Response } from "express";
import { admin } from "../config/firebaseAdmin.js";

export const verifyToken = async (request: Request, response: Response, next: NextFunction) => {
  const header = request.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    response.status(401).json({ error: "No autorizado" });
    return;
  }

  try {
    const token = header.slice("Bearer ".length);
    const decoded = await admin.auth().verifyIdToken(token);

    request.user = {
      uid: decoded.uid,
      email: decoded.email ?? null,
    };

    next();
  } catch {
    response.status(401).json({ error: "No autorizado" });
  }
};
