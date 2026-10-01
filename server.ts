import "dotenv/config";
import express from "express";
import { createVercelApp } from "./server/_core/app";

// Keep the direct import in this entrypoint for Vercel's Express detector.
void express;
const app = createVercelApp();

export default app;
