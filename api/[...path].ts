import app from "../server/app";

/**
 * Vercel Serverless Function dynamic catch-all route for /api/*
 * Guarantees native matching on Vercel even without custom rewrite rules.
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
