import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import compileRouter from './routes/compile.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

// If deployed behind a proxy/load balancer (Render, Vercel, Cloudflare),
// trust X-Forwarded-For so rate-limit keys on the real client IP.
//
// Express treats the value's TYPE as meaning: a boolean/number is a hop config,
// a string is parsed as an IP/subnet list. Passing the raw env var meant
// TRUST_PROXY=true became the *string* "true" and was parsed as an IP list.
if (process.env.TRUST_PROXY) {
    const raw = process.env.TRUST_PROXY.trim();
    const hops = Number(raw);
    if (raw === 'true') app.set('trust proxy', true);
    else if (raw === 'false') app.set('trust proxy', false);
    else if (Number.isInteger(hops) && hops >= 0) app.set('trust proxy', hops);
    else app.set('trust proxy', raw); // explicit IP / subnet list
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
});
