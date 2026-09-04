import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import app from "./api/app.js";

const PORT = 3000;

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Judicial Notice Analyzer dev server running on http://0.0.0.0:${PORT}`);
  });
}

// In local and container environments, boot server automatically
if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error("Failed to start dev server:", err);
  });
}

export default app;
