import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

// Helper to mock Vercel's req/res
const createVercelReqRes = (req, res) => {
  return {
    req: {
      ...req,
      query: req.query,
      body: req.body,
      method: req.method,
      headers: req.headers,
    },
    res: {
      setHeader: res.setHeader.bind(res),
      status: (code) => {
        res.status(code);
        return {
          json: (data) => res.json(data),
          end: () => res.end(),
        };
      },
      json: (data) => res.json(data),
      end: () => res.end(),
    }
  };
};

// Auto-register all API routes
const apiDir = path.join(__dirname, 'api');
const files = fs.readdirSync(apiDir).filter(f => f.endsWith('.js') && !f.startsWith('_'));

for (const file of files) {
  const route = `/api/${file.replace('.js', '')}`;
  console.log(`Mapping ${route} -> api/${file}`);
  
  app.all(route, async (req, res) => {
    try {
      const module = await import(`./api/${file}`);
      const handler = module.default;
      const { req: vReq, res: vRes } = createVercelReqRes(req, res);
      await handler(vReq, vRes);
    } catch (err) {
      console.error(`Error in ${route}:`, err);
      res.status(500).json({ error: err.message });
    }
  });
}

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Local API Server running on http://localhost:${PORT}`);
  console.log('You can now log into the POS app with admin / admin123');
});
