import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth/auth.js";
import { accountRouter } from "./routes/account.js";
import { healthRouter } from "./routes/health.js";

export const app = express();

// Better Auth must be mounted before express.json().
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());
app.use("/api/health", healthRouter);
app.use("/api/account", accountRouter);