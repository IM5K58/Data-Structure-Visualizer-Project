import express from 'express';
import cors from 'cors';
import compileRouter from './routes/compile.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

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

// Routes
app.use('/api', compileRouter);

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 Vierasion Compiler Server`);
    console.log(`   Server:  http://localhost:${PORT}`);
    console.log(`   Piston:  ${process.env.PISTON_URL || 'http://localhost:2000'}`);
    console.log(`   Health:  http://localhost:${PORT}/api/health\n`);
});
