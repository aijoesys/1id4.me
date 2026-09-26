import "dotenv/config";
import { createVercelApp } from "./server/_core/app";

const app = createVercelApp();

export default app;
