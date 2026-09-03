import app from "../server/app";

/**
 * Vercel Serverless Function entrypoint
 * maxDuration: 60s (ensures Gemini AI processing and multi-page document parsing have enough time)
 */
export const config = {
  maxDuration: 60,
  api: {
    bodyParser: false,
  },
};

export default function handler(req: any, res: any) {
  return app(req, res);
}

export { app };
