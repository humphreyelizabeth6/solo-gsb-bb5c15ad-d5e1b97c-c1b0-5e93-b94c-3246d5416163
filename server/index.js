import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MODES,
  evaluatePalette,
  suggestReplacement,
  normalizeHex,
} from './colorMath.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: '256kb' }));

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function parsePalette(body) {
  const errors = [];
  const raw = Array.isArray(body?.colors) ? body.colors : [];
  if (raw.length < 2 || raw.length > 8) {
    errors.push('调色板需包含 2 至 8 个颜色');
  }
  const colors = raw.map((c, i) => {
    const hex = normalizeHex(String(c?.hex ?? ''));
    if (!hex) errors.push(`第 ${i + 1} 个颜色无效: ${c?.hex}`);
    return { label: String(c?.label ?? `色 ${i + 1}`).slice(0, 40) || `色 ${i + 1}`, hex };
  });

  const threshold = Number(body?.threshold);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 100) {
    errors.push('阈值需为 0–100 之间的数字');
  }

  const modes = (Array.isArray(body?.modes) ? body.modes : []).filter((m) => MODES.includes(m));
  if (modes.length === 0) errors.push('至少选择一种视觉模式');

  return { colors, threshold, modes, errors };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
app.post('/api/evaluate', (req, res) => {
  const { colors, threshold, modes, errors } = parsePalette(req.body);
  if (errors.length) return res.status(400).json({ errors });
  res.json(evaluatePalette(colors, threshold, modes));
});

app.post('/api/suggest', (req, res) => {
  const { colors, threshold, modes, errors } = parsePalette(req.body);
  const replaceIndex = Number(req.body?.replaceIndex);
  if (!Number.isInteger(replaceIndex) || replaceIndex < 0 || replaceIndex >= colors.length) {
    errors.push('replaceIndex 无效');
  }
  if (errors.length) return res.status(400).json({ errors });
  res.json(suggestReplacement(colors, threshold, modes, replaceIndex));
});

// ---------------------------------------------------------------------------
// Static frontend (client build output)
// ---------------------------------------------------------------------------
const distDir = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res
      .status(503)
      .send('前端尚未构建：请先运行 `npm --prefix client run build`，或使用 `npm run dev:client` 启动开发服务器。')
  );
}

app.listen(PORT, () => {
  console.log(`CVD legend checker listening on http://localhost:${PORT}`);
});
