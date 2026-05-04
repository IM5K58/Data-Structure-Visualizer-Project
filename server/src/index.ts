import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import compileRouter from './routes/compile.js';
import { initializePCH } from './services/compiler.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

// If deployed behind a proxy/load balancer (Render, Vercel, Cloudflare),
// trust X-Forwarded-For so rate-limit keys on the real client IP.
if (process.env.TRUST_PROXY) {
    app.set('trust proxy', process.env.TRUST_PROXY);
}

// Middleware
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:4173',
    process.env.FRONTEND_URL?.replace(/\/+$/, ''),  // 끝 슬래시 제거
].filter(Boolean) as string[];

console.log('Allowed CORS origins:', allowedOrigins);

app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
}));
app.use(express.json({ limit: '1mb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────
// /api/compile is the expensive endpoint (compiles + runs arbitrary C++);
// the rest of /api is cheap (health check). Apply a stricter limit to compile
// and a looser one to the rest.
const compileLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? `${60_000}`), // 1 min
    limit:    parseInt(process.env.RATE_LIMIT_COMPILE   ?? '20'),         // 20 req/min/IP
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { type: 'runtime', message: 'Too many compile requests, slow down.' } },
});
const generalLimiter = rateLimit({
    windowMs: 60_000,
    limit:    parseInt(process.env.RATE_LIMIT_GENERAL ?? '120'),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});

// Apply specific limiter only to the compile endpoint, general to everything else.
app.use('/api/compile', compileLimiter);
app.use('/api', generalLimiter);

// Routes
app.use('/api', compileRouter);

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 Vierasion Compiler Server`);
    console.log(`   Server:  http://localhost:${PORT}`);
    console.log(`   Piston:  ${process.env.PISTON_URL || 'http://localhost:2000'}`);
    console.log(`   Health:  http://localhost:${PORT}/api/health\n`);
    // 서버 시작 직후 백그라운드에서 PCH 미리 컴파일
    initializePCH();
});
