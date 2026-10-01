import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const publicPath = path.resolve(process.cwd(), "public");
  if (!fs.existsSync(publicPath)) {
    console.error(`[Static] Could not find public directory: ${publicPath}`);
  }

  app.use(express.static(publicPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
  });
}
