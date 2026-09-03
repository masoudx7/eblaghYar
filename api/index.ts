import app from "../server/app";

/**
 * Vercel Serverless Function Entrypoint
 * - maxDuration: 60s (allows sufficient time for Gemini AI judicial document analysis)
 */
export const config = {
  maxDuration: 60,
};

export default app;
