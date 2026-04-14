import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = Number(process.env.PORT || 4173);
const WEB_DIR = path.join(__dirname, 'web');
const EX_DIR = path.join(__dirname, 'ex');
const OUTPUT_DIR = path.join(__dirname, 'output');
const TEMP_DIR = path.join(__dirname, '.tmp');
const SCRIPT_PATH = path.join(__dirname, 'scripts', 'html-voxels-to-bbmodel.mjs');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.bbmodel': 'application/json; charset=utf-8',
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(text);
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

function safeName(name, fallback) {
  return (name || fallback)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || fallback;
}

async function listExamples() {
  try {
    const entries = await fs.readdir(EX_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /\.html?$/i.test(entry.name))
      .map((entry) => ({
        name: entry.name,
        path: path.join(EX_DIR, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function runConverter(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, ...args], {
      cwd: __dirname,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error((stderr || stdout || `Converter exited with code ${code}`).trim()));
    });
  });
}

async function handleConvert(request, response) {
  const body = await readRequestJson(request);
  const format = body.format === 'java_block' ? 'java_block' : 'modded_entity';
  const maxEdge = Number(body.maxEdge);
  const hasMaxEdge = Number.isFinite(maxEdge) && maxEdge > 0;

  await fs.mkdir(TEMP_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let inputPath = '';
  let cleanupPath = null;

  if (body.exampleName) {
    const examples = await listExamples();
    const picked = examples.find((item) => item.name === body.exampleName);
    if (!picked) {
      sendJson(response, 404, { error: 'Example not found.' });
      return;
    }
    inputPath = picked.path;
  } else if (typeof body.htmlContent === 'string' && body.htmlContent.trim()) {
    const baseName = safeName(body.sourceName, 'scene');
    const tempName = `${baseName}-${crypto.randomUUID()}.html`;
    cleanupPath = path.join(TEMP_DIR, tempName);
    await fs.writeFile(cleanupPath, body.htmlContent, 'utf8');
    inputPath = cleanupPath;
  } else {
    sendJson(response, 400, { error: 'Please upload an HTML file or choose an example.' });
    return;
  }

  const outputBaseName = `${safeName(body.outputName || path.basename(inputPath), 'scene')}-${format}`;
  const outputPath = path.join(OUTPUT_DIR, `${outputBaseName}.bbmodel`);
  const args = [inputPath, outputPath, '--format', format];

  if (hasMaxEdge) {
    args.push('--max-edge', String(maxEdge));
  }

  try {
    const result = await runConverter(args);
    const stats = await fs.stat(outputPath);
    sendJson(response, 200, {
      ok: true,
      format,
      outputName: path.basename(outputPath),
      outputUrl: `/api/download/${encodeURIComponent(path.basename(outputPath))}`,
      sizeBytes: stats.size,
      log: result.stdout.trim(),
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Conversion failed.',
    });
  } finally {
    if (cleanupPath) {
      await fs.rm(cleanupPath, { force: true });
    }
  }
}

async function serveStatic(response, filePath) {
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(content);
  } catch {
    sendText(response, 404, 'Not found');
  }
}

function createAppServer({ host = DEFAULT_HOST, port = DEFAULT_PORT } = {}) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`);

      if (request.method === 'GET' && url.pathname === '/api/examples') {
        const examples = await listExamples();
        sendJson(response, 200, { examples: examples.map((item) => item.name) });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/convert') {
        await handleConvert(request, response);
        return;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/download/')) {
        const fileName = decodeURIComponent(url.pathname.replace('/api/download/', ''));
        const filePath = path.join(OUTPUT_DIR, fileName);
        if (path.dirname(filePath) !== OUTPUT_DIR) {
          sendText(response, 400, 'Invalid file path');
          return;
        }
        response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        await serveStatic(response, filePath);
        return;
      }

      const staticPath = url.pathname === '/'
        ? path.join(WEB_DIR, 'index.html')
        : path.join(WEB_DIR, url.pathname.replace(/^\/+/, ''));

      if (!staticPath.startsWith(WEB_DIR)) {
        sendText(response, 400, 'Invalid path');
        return;
      }

      await serveStatic(response, staticPath);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : 'Unexpected server error.',
      });
    }
  });

  return server;
}

export function startServer(options = {}) {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const server = createAppServer({ host, port });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      const resolvedPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        server,
        host,
        port: resolvedPort,
        url: `http://${host}:${resolvedPort}`,
      });
    });
  });
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  startServer().then(({ url }) => {
    console.log(`Converter UI running at ${url}`);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
