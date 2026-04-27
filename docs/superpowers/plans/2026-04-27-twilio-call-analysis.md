# Twilio Call Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Twilio as a parallel data source so users can generate AI reports from Twilio call recordings (transcribed via OpenAI Whisper).

**Architecture:** Parallel to existing GHL flow. New `TwilioAccount` model, `twilioService.js` for API calls + Whisper transcription, source type toggle in report form. Reports branch on `sourceType` field: "ghl" uses existing flow, "twilio" fetches calls, downloads recordings, transcribes with Whisper, sends text to Claude.

**Tech Stack:** Express.js, Prisma/PostgreSQL, Twilio REST API (via axios), OpenAI Whisper API (via `openai` SDK), React/Vite/Tailwind frontend.

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `server/src/services/twilioService.js` | Twilio REST API: fetch calls, download recordings, transcribe with Whisper |
| Create | `server/src/controllers/twilioAccountController.js` | CRUD + test connection for Twilio accounts |
| Create | `server/src/routes/twilioAccounts.js` | Route definitions for `/api/twilio-accounts` |
| Create | `client/src/pages/TwilioAccountsPage.jsx` | Twilio account management UI |
| Modify | `server/prisma/schema.prisma` | Add TwilioAccount model, modify Report + User |
| Modify | `server/src/index.js` | Register twilio account routes |
| Modify | `server/src/services/reportService.js` | Add `generateTwilioReport` function |
| Modify | `server/src/controllers/reportController.js` | Branch on sourceType, handle Twilio flow |
| Modify | `client/src/services/api.js` | Add `twilioAPI` export |
| Modify | `client/src/App.jsx` | Add `/twilio-accounts` route |
| Modify | `client/src/components/Layout.jsx` | Add sidebar link |
| Modify | `client/src/pages/DashboardPage.jsx` | Add Twilio stat card |
| Modify | `client/src/pages/ReportNewPage.jsx` | Source type toggle, conditional form |
| Modify | `client/src/pages/ReportViewPage.jsx` | Show source type in metadata |
| Modify | `client/src/pages/ReportsPage.jsx` | Show source badge in list |

---

### Task 1: Database Schema Migration

**Files:**
- Modify: `server/prisma/schema.prisma`

This task updates the Prisma schema to add the TwilioAccount model, make ghlClientId optional on Report, and add sourceType + twilioAccountId fields.

- [ ] **Step 1: Update the Prisma schema**

Replace the entire contents of `server/prisma/schema.prisma` with:

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id             Int              @id @default(autoincrement())
  email          String           @unique
  password       String
  name           String
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
  ghlClients     GHLClient[]
  twilioAccounts TwilioAccount[]
  reports        Report[]
}

model GHLClient {
  id          Int      @id @default(autoincrement())
  name        String
  bearerToken String
  locationId  String
  userId      Int
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  reports     Report[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model TwilioAccount {
  id         Int      @id @default(autoincrement())
  name       String
  accountSid String
  authToken  String
  userId     Int
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  reports    Report[]
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model Report {
  id                 Int             @id @default(autoincrement())
  title              String
  sourceType         String          @default("ghl")
  ghlClientId        Int?
  ghlClient          GHLClient?      @relation(fields: [ghlClientId], references: [id], onDelete: Cascade)
  twilioAccountId    Int?
  twilioAccount      TwilioAccount?  @relation(fields: [twilioAccountId], references: [id], onDelete: Cascade)
  userId             Int
  user               User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  dateFrom           DateTime
  dateTo             DateTime
  conversationTypes  Json            @default("[]")
  prompt             String
  result             String?
  totalConversations Int             @default(0)
  status             String          @default("pending")
  progressMessage    String?
  error              String?
  createdAt          DateTime        @default(now())
}
```

- [ ] **Step 2: Create and apply the migration**

Run from the project root:

```bash
cd server && npx prisma migrate dev --name add-twilio-integration
```

This will:
- Create the TwilioAccount table
- Add `sourceType` column (default "ghl") to Report
- Add `twilioAccountId` column (nullable) to Report
- Make `ghlClientId` nullable on Report
- All existing reports keep ghlClientId intact and get sourceType="ghl"

Expected: Migration applies successfully, Prisma Client regenerated.

- [ ] **Step 3: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat: add TwilioAccount model and sourceType to Report schema"
```

---

### Task 2: Install OpenAI SDK

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install the openai package**

```bash
cd server && npm install openai
```

- [ ] **Step 2: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "feat: add openai SDK dependency for Whisper transcription"
```

---

### Task 3: Twilio Service

**Files:**
- Create: `server/src/services/twilioService.js`

This service handles all Twilio REST API calls and Whisper transcription. Twilio uses HTTP Basic Auth (accountSid:authToken). The API base is `https://api.twilio.com`.

- [ ] **Step 1: Create `server/src/services/twilioService.js`**

```js
import axios from 'axios';
import OpenAI from 'openai';

const TWILIO_BASE = 'https://api.twilio.com/2010-04-01';

function twilioAuth(accountSid, authToken) {
  return { username: accountSid, password: authToken };
}

/**
 * Transcribe an audio buffer using OpenAI Whisper API.
 * Returns transcription text or null on failure.
 */
async function transcribeRecording(audioBuffer, filename) {
  try {
    const openai = new OpenAI();
    const file = new File([audioBuffer], filename, { type: 'audio/mpeg' });
    const response = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
    });
    return response.text;
  } catch (err) {
    console.error(`[Twilio] Transcription failed for ${filename}:`, err.message);
    return null;
  }
}

/**
 * Fetch all calls from Twilio within a date range.
 * Paginates through all results using NextPageUri.
 */
export async function fetchCalls(accountSid, authToken, dateFrom, dateTo, onProgress) {
  const calls = [];
  let url = `${TWILIO_BASE}/Accounts/${accountSid}/Calls.json`;
  const params = {
    'StartTime>': dateFrom,
    'StartTime<': dateTo,
    PageSize: 100,
  };
  let page = 0;

  if (onProgress) onProgress('Obteniendo llamadas de Twilio...');

  while (url) {
    page++;
    if (onProgress && page > 1) {
      onProgress(`Obteniendo llamadas de Twilio (página ${page}, ${calls.length} encontradas)...`);
    }

    const response = await axios.get(url, {
      auth: twilioAuth(accountSid, authToken),
      params: page === 1 ? params : undefined,
    });

    const data = response.data;
    if (data.calls && data.calls.length > 0) {
      calls.push(...data.calls);
    }

    url = data.next_page_uri ? `https://api.twilio.com${data.next_page_uri}` : null;
  }

  return calls;
}

/**
 * Download recording MP3 for a given call SID.
 * Returns { buffer, recordingSid } or null if no recording.
 */
export async function fetchRecording(accountSid, authToken, callSid) {
  try {
    const listUrl = `${TWILIO_BASE}/Accounts/${accountSid}/Calls/${callSid}/Recordings.json`;
    const listRes = await axios.get(listUrl, {
      auth: twilioAuth(accountSid, authToken),
    });

    const recordings = listRes.data.recordings;
    if (!recordings || recordings.length === 0) return null;

    const recordingSid = recordings[0].sid;
    const mp3Url = `${TWILIO_BASE}/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`;
    const mp3Res = await axios.get(mp3Url, {
      auth: twilioAuth(accountSid, authToken),
      responseType: 'arraybuffer',
    });

    return { buffer: Buffer.from(mp3Res.data), recordingSid };
  } catch (err) {
    console.error(`[Twilio] Failed to fetch recording for call ${callSid}:`, err.message);
    return null;
  }
}

/**
 * Fetch all calls with recordings and transcriptions.
 * Main entry point called by reportController.
 */
export async function fetchCallsWithRecordings(accountSid, authToken, dateFrom, dateTo, onProgress) {
  const calls = await fetchCalls(accountSid, authToken, dateFrom, dateTo, onProgress);
  const total = calls.length;

  if (onProgress) onProgress(`Se encontraron ${total} llamadas. Descargando grabaciones...`);

  const results = [];

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    if (onProgress) onProgress(`Descargando y transcribiendo grabación (${i + 1}/${total})...`);

    let transcription = null;
    let hasRecording = false;

    if (parseInt(call.duration) > 0) {
      const recording = await fetchRecording(accountSid, authToken, call.sid);
      if (recording) {
        hasRecording = true;
        if (recording.buffer.length <= 25 * 1024 * 1024) {
          transcription = await transcribeRecording(
            recording.buffer,
            `${call.sid}.mp3`
          );
        } else {
          console.warn(`[Twilio] Recording for call ${call.sid} exceeds 25MB, skipping transcription`);
        }
      }
    }

    results.push({
      sid: call.sid,
      from: call.from_formatted || call.from,
      to: call.to_formatted || call.to,
      direction: call.direction,
      duration: parseInt(call.duration) || 0,
      status: call.status,
      startTime: call.start_time,
      endTime: call.end_time,
      hasRecording,
      transcription,
    });
  }

  console.log(`[Twilio] Processed ${results.length} calls, ${results.filter(r => r.transcription).length} with transcriptions`);
  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/services/twilioService.js
git commit -m "feat: add Twilio service with call fetching and Whisper transcription"
```

---

### Task 4: Twilio Account Controller & Routes

**Files:**
- Create: `server/src/controllers/twilioAccountController.js`
- Create: `server/src/routes/twilioAccounts.js`
- Modify: `server/src/index.js`

- [ ] **Step 1: Create `server/src/controllers/twilioAccountController.js`**

```js
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { encrypt, decrypt } from '../utils/encryption.js';

const prisma = new PrismaClient();
const TWILIO_BASE = 'https://api.twilio.com/2010-04-01';

export async function list(req, res) {
  try {
    const accounts = await prisma.twilioAccount.findMany({
      where: { userId: req.userId },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(accounts);
  } catch (err) {
    console.error('List Twilio accounts error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function create(req, res) {
  try {
    const { name, accountSid, authToken } = req.body;
    if (!name || !accountSid || !authToken) {
      return res.status(400).json({ error: 'Nombre, Account SID y Auth Token son requeridos' });
    }
    const encryptedSid = encrypt(accountSid);
    const encryptedToken = encrypt(authToken);
    const account = await prisma.twilioAccount.create({
      data: { name, accountSid: encryptedSid, authToken: encryptedToken, userId: req.userId },
      select: { id: true, name: true, createdAt: true },
    });
    res.status(201).json(account);
  } catch (err) {
    console.error('Create Twilio account error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function get(req, res) {
  try {
    const account = await prisma.twilioAccount.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
    if (!account) return res.status(404).json({ error: 'Cuenta Twilio no encontrada' });
    res.json(account);
  } catch (err) {
    console.error('Get Twilio account error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function update(req, res) {
  try {
    const existing = await prisma.twilioAccount.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Cuenta Twilio no encontrada' });

    const data = {};
    if (req.body.name) data.name = req.body.name;
    if (req.body.accountSid) data.accountSid = encrypt(req.body.accountSid);
    if (req.body.authToken) data.authToken = encrypt(req.body.authToken);

    const updated = await prisma.twilioAccount.update({
      where: { id: existing.id },
      data,
      select: { id: true, name: true, updatedAt: true },
    });
    res.json(updated);
  } catch (err) {
    console.error('Update Twilio account error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function remove(req, res) {
  try {
    const existing = await prisma.twilioAccount.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Cuenta Twilio no encontrada' });
    await prisma.twilioAccount.delete({ where: { id: existing.id } });
    res.json({ message: 'Eliminado' });
  } catch (err) {
    console.error('Delete Twilio account error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

export async function testConnection(req, res) {
  try {
    const account = await prisma.twilioAccount.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!account) return res.status(404).json({ error: 'Cuenta Twilio no encontrada' });

    const accountSid = decrypt(account.accountSid);
    const authToken = decrypt(account.authToken);

    await axios.get(`${TWILIO_BASE}/Accounts/${accountSid}/Calls.json`, {
      auth: { username: accountSid, password: authToken },
      params: { PageSize: 1 },
    });
    res.json({ success: true, message: 'Conexion exitosa' });
  } catch (err) {
    const status = err.response?.status;
    console.error('Twilio test connection error:', status, err.message);
    if (status === 401) {
      return res.json({ success: false, message: 'Credenciales invalidas (401)' });
    }
    res.json({ success: false, message: `Conexion fallida (${status || 'network'}): ${err.message}` });
  }
}
```

- [ ] **Step 2: Create `server/src/routes/twilioAccounts.js`**

```js
import { Router } from 'express';
import { list, create, get, update, remove, testConnection } from '../controllers/twilioAccountController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);
router.get('/', list);
router.post('/', create);
router.get('/:id', get);
router.put('/:id', update);
router.delete('/:id', remove);
router.post('/:id/test', testConnection);

export default router;
```

- [ ] **Step 3: Register routes in `server/src/index.js`**

Add after the existing import of `reportRoutes` (line 15):

```js
import twilioAccountRoutes from './routes/twilioAccounts.js';
```

Add after `app.use('/api/reports', reportRoutes);` (line 33):

```js
app.use('/api/twilio-accounts', twilioAccountRoutes);
```

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/twilioAccountController.js server/src/routes/twilioAccounts.js server/src/index.js
git commit -m "feat: add Twilio account CRUD controller and routes"
```

---

### Task 5: Report Service — Twilio Report Generation

**Files:**
- Modify: `server/src/services/reportService.js`

Add a `generateTwilioReport` function that formats call data + transcriptions as text and sends to Claude, using the same chunk/merge pattern as GHL reports.

- [ ] **Step 1: Add the Twilio report functions to `server/src/services/reportService.js`**

Add the following after the existing `generateReport` function (after line 99), before the closing of the file:

```js
const TWILIO_CHUNK_SIZE = 20;

function formatCallsForAnalysis(calls) {
  return calls.map((call, idx) => {
    return `--- Llamada ${idx + 1} ---
De: ${call.from}
A: ${call.to}
Direccion: ${call.direction}
Duracion: ${call.duration} segundos
Estado: ${call.status}
Inicio: ${call.startTime || 'N/A'}
Fin: ${call.endTime || 'N/A'}
Grabacion: ${call.hasRecording ? 'Si' : 'No'}
Transcripcion:
${call.transcription ? `  ${call.transcription}` : '  (sin transcripcion disponible)'}`;
  }).join('\n\n');
}

async function analyzeTwilioChunk(calls, userPrompt, chunkIndex, totalChunks) {
  const formatted = formatCallsForAnalysis(calls);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `You are analyzing phone calls from Twilio.

Here are ${calls.length} calls (batch ${chunkIndex + 1} of ${totalChunks}):

${formatted}

---

User's analysis request: "${userPrompt}"

Provide a detailed analysis based on the user's request. Use markdown formatting. Include specific examples and quotes from call transcriptions where relevant. Be thorough and insightful.`,
    }],
  });

  return response.content[0].text;
}

async function mergeTwilioReports(subReports, userPrompt, totalCalls) {
  const combined = subReports.map((report, i) => `## Lote ${i + 1}\n\n${report}`).join('\n\n---\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: `You previously analyzed ${totalCalls} Twilio phone calls in ${subReports.length} batches. Here are the batch analyses:

${combined}

---

The original analysis request was: "${userPrompt}"

Now merge all batch analyses into ONE cohesive, well-structured final report. Use markdown formatting with clear sections, headings, bullet points, and highlights. Eliminate redundancy, synthesize patterns across batches, and provide actionable insights. Include a summary section at the top and detailed findings below.

Total calls analyzed: ${totalCalls}`,
    }],
  });

  return response.content[0].text;
}

export async function generateTwilioReport(calls, userPrompt, onProgress) {
  if (calls.length === 0) {
    return 'No se encontraron llamadas en el rango de fechas seleccionado.';
  }

  if (calls.length <= TWILIO_CHUNK_SIZE) {
    if (onProgress) onProgress('Analizando llamadas...');
    return await analyzeTwilioChunk(calls, userPrompt, 0, 1);
  }

  const chunks = [];
  for (let i = 0; i < calls.length; i += TWILIO_CHUNK_SIZE) {
    chunks.push(calls.slice(i, i + TWILIO_CHUNK_SIZE));
  }

  const subReports = [];
  for (let i = 0; i < chunks.length; i++) {
    if (onProgress) onProgress(`Analizando lote ${i + 1} de ${chunks.length}...`);
    const subReport = await analyzeTwilioChunk(chunks[i], userPrompt, i, chunks.length);
    subReports.push(subReport);
  }

  if (onProgress) onProgress('Combinando resultados en el reporte final...');
  return await mergeTwilioReports(subReports, userPrompt, calls.length);
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/services/reportService.js
git commit -m "feat: add generateTwilioReport function for call analysis"
```

---

### Task 6: Report Controller — Twilio Branch

**Files:**
- Modify: `server/src/controllers/reportController.js`

Update the generate, listReports, and getReport functions to handle both GHL and Twilio sources.

- [ ] **Step 1: Update imports at top of `server/src/controllers/reportController.js`**

Replace lines 1-4:

```js
import { PrismaClient } from '@prisma/client';
import { decrypt } from '../utils/encryption.js';
import { fetchConversationsWithMessages } from '../services/ghlService.js';
import { generateReport } from '../services/reportService.js';
```

With:

```js
import { PrismaClient } from '@prisma/client';
import { decrypt } from '../utils/encryption.js';
import { fetchConversationsWithMessages } from '../services/ghlService.js';
import { fetchCallsWithRecordings } from '../services/twilioService.js';
import { generateReport, generateTwilioReport } from '../services/reportService.js';
```

- [ ] **Step 2: Replace the `generate` function (lines 8-81)**

Replace the entire `generate` function with:

```js
export async function generate(req, res) {
  try {
    const { sourceType, ghlClientId, twilioAccountId, title, dateFrom, dateTo, conversationTypes, prompt } = req.body;
    const source = sourceType || 'ghl';

    if (!dateFrom || !dateTo || !prompt) {
      return res.status(400).json({ error: 'Rango de fechas y prompt son requeridos' });
    }

    if (source === 'ghl') {
      if (!ghlClientId) return res.status(400).json({ error: 'Cliente GHL es requerido' });
      const client = await prisma.gHLClient.findFirst({
        where: { id: ghlClientId, userId: req.userId },
      });
      if (!client) return res.status(404).json({ error: 'Cliente GHL no encontrado' });

      const report = await prisma.report.create({
        data: {
          title: title || `Reporte - ${new Date().toLocaleDateString()}`,
          sourceType: 'ghl',
          ghlClientId,
          userId: req.userId,
          dateFrom: new Date(dateFrom),
          dateTo: new Date(dateTo),
          conversationTypes: conversationTypes || [],
          prompt,
          status: 'processing',
          progressMessage: 'Obteniendo conversaciones de GHL...',
        },
      });

      res.status(201).json({ id: report.id, status: 'processing' });

      try {
        const token = decrypt(client.bearerToken);
        const conversations = await fetchConversationsWithMessages(
          token, client.locationId, dateFrom, dateTo, conversationTypes || [],
          async (message) => {
            await prisma.report.update({ where: { id: report.id }, data: { progressMessage: message } });
          }
        );

        await prisma.report.update({
          where: { id: report.id },
          data: { totalConversations: conversations.length },
        });

        const result = await generateReport(conversations, prompt, async (message) => {
          await prisma.report.update({ where: { id: report.id }, data: { progressMessage: message } });
        });

        await prisma.report.update({
          where: { id: report.id },
          data: { result, status: 'completed', progressMessage: null },
        });
      } catch (err) {
        console.error('GHL report generation error:', err);
        await prisma.report.update({
          where: { id: report.id },
          data: { status: 'failed', error: err.message, progressMessage: null },
        });
      }

    } else if (source === 'twilio') {
      if (!twilioAccountId) return res.status(400).json({ error: 'Cuenta Twilio es requerida' });
      const account = await prisma.twilioAccount.findFirst({
        where: { id: twilioAccountId, userId: req.userId },
      });
      if (!account) return res.status(404).json({ error: 'Cuenta Twilio no encontrada' });

      const report = await prisma.report.create({
        data: {
          title: title || `Reporte - ${new Date().toLocaleDateString()}`,
          sourceType: 'twilio',
          twilioAccountId,
          userId: req.userId,
          dateFrom: new Date(dateFrom),
          dateTo: new Date(dateTo),
          conversationTypes: [],
          prompt,
          status: 'processing',
          progressMessage: 'Obteniendo llamadas de Twilio...',
        },
      });

      res.status(201).json({ id: report.id, status: 'processing' });

      try {
        const accountSid = decrypt(account.accountSid);
        const authToken = decrypt(account.authToken);

        const calls = await fetchCallsWithRecordings(
          accountSid, authToken, dateFrom, dateTo,
          async (message) => {
            await prisma.report.update({ where: { id: report.id }, data: { progressMessage: message } });
          }
        );

        await prisma.report.update({
          where: { id: report.id },
          data: { totalConversations: calls.length },
        });

        const result = await generateTwilioReport(calls, prompt, async (message) => {
          await prisma.report.update({ where: { id: report.id }, data: { progressMessage: message } });
        });

        await prisma.report.update({
          where: { id: report.id },
          data: { result, status: 'completed', progressMessage: null },
        });
      } catch (err) {
        console.error('Twilio report generation error:', err);
        await prisma.report.update({
          where: { id: report.id },
          data: { status: 'failed', error: err.message, progressMessage: null },
        });
      }

    } else {
      return res.status(400).json({ error: 'Tipo de fuente invalido' });
    }
  } catch (err) {
    console.error('Generate report error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}
```

- [ ] **Step 3: Update `listReports` function**

Replace the entire `listReports` function with:

```js
export async function listReports(req, res) {
  try {
    const reports = await prisma.report.findMany({
      where: { userId: req.userId },
      include: {
        ghlClient: { select: { name: true } },
        twilioAccount: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(reports.map(r => ({
      ...r,
      clientName: r.ghlClient?.name || r.twilioAccount?.name || 'N/A',
      ghlClient: undefined,
      twilioAccount: undefined,
      result: undefined,
    })));
  } catch (err) {
    console.error('List reports error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}
```

- [ ] **Step 4: Update `getReport` function**

Replace the entire `getReport` function with:

```js
export async function getReport(req, res) {
  try {
    const report = await prisma.report.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
      include: {
        ghlClient: { select: { name: true } },
        twilioAccount: { select: { name: true } },
      },
    });
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });
    res.json({
      ...report,
      clientName: report.ghlClient?.name || report.twilioAccount?.name || 'N/A',
    });
  } catch (err) {
    console.error('Get report error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/reportController.js
git commit -m "feat: update report controller to support GHL and Twilio sources"
```

---

### Task 7: Frontend API Service

**Files:**
- Modify: `client/src/services/api.js`

- [ ] **Step 1: Add `twilioAPI` export to `client/src/services/api.js`**

Add after the `reportsAPI` export (after line 42), before the `export default api;` line:

```js
export const twilioAPI = {
  list: () => api.get('/twilio-accounts'),
  create: (data) => api.post('/twilio-accounts', data),
  get: (id) => api.get(`/twilio-accounts/${id}`),
  update: (id, data) => api.put(`/twilio-accounts/${id}`, data),
  delete: (id) => api.delete(`/twilio-accounts/${id}`),
  test: (id) => api.post(`/twilio-accounts/${id}/test`),
};
```

- [ ] **Step 2: Commit**

```bash
git add client/src/services/api.js
git commit -m "feat: add twilioAPI to frontend API service"
```

---

### Task 8: Twilio Accounts Page

**Files:**
- Create: `client/src/pages/TwilioAccountsPage.jsx`

Same pattern as `ClientsPage.jsx` but with Twilio-specific fields (Account SID and Auth Token instead of Bearer Token and Location ID).

- [ ] **Step 1: Create `client/src/pages/TwilioAccountsPage.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { twilioAPI } from '../services/api';
import { Plus, Trash2, TestTube, Pencil, X, Loader2 } from 'lucide-react';

export default function TwilioAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', accountSid: '', authToken: '' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');

  const fetchAccounts = async () => {
    try {
      const res = await twilioAPI.list();
      setAccounts(res.data);
    } catch {
      setError('Error al cargar las cuentas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAccounts(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await twilioAPI.update(editingId, form);
      } else {
        await twilioAPI.create(form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ name: '', accountSid: '', authToken: '' });
      fetchAccounts();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar la cuenta');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (account) => {
    setEditingId(account.id);
    setForm({ name: account.name, accountSid: '', authToken: '' });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta cuenta? Todos los reportes asociados tambien se eliminaran.')) return;
    try {
      await twilioAPI.delete(id);
      fetchAccounts();
    } catch {
      setError('Error al eliminar la cuenta');
    }
  };

  const handleTest = async (id) => {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await twilioAPI.test(id);
      setTestResult({ id, ...res.data });
    } catch {
      setTestResult({ id, success: false, message: 'Error en la prueba' });
    } finally {
      setTesting(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" size={32} /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Cuentas Twilio</h1>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', accountSid: '', authToken: '' }); }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Agregar Cuenta
        </button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg mb-4">{error}</div>}

      {showForm && (
        <div className="glass p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">{editingId ? 'Editar Cuenta' : 'Agregar Nueva Cuenta'}</h2>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-gray-400 hover:text-gray-200"><X size={20} /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nombre de la Cuenta</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="ej. Mi Cuenta Twilio" required />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Account SID {editingId && '(dejar vacio para mantener el actual)'}</label>
              <input type="password" value={form.accountSid} onChange={(e) => setForm({ ...form, accountSid: e.target.value })} className="input-field" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" required={!editingId} />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Auth Token {editingId && '(dejar vacio para mantener el actual)'}</label>
              <input type="password" value={form.authToken} onChange={(e) => setForm({ ...form, authToken: e.target.value })} className="input-field" placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" required={!editingId} />
            </div>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Guardando...' : editingId ? 'Actualizar Cuenta' : 'Agregar Cuenta'}
            </button>
          </form>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="glass p-12 text-center text-gray-500">
          <p>Aun no hay cuentas Twilio registradas.</p>
          <p className="text-sm mt-1">Haz clic en "Agregar Cuenta" para comenzar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div key={account.id} className="glass p-4 flex items-center justify-between">
              <div>
                <h3 className="font-medium">{account.name}</h3>
                <p className="text-sm text-gray-500">Creada: {new Date(account.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                {testResult?.id === account.id && (
                  <span className={`text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                    {testResult.message}
                  </span>
                )}
                <button onClick={() => handleTest(account.id)} disabled={testing === account.id} className="btn-secondary flex items-center gap-1 text-sm">
                  {testing === account.id ? <Loader2 size={14} className="animate-spin" /> : <TestTube size={14} />}
                  Probar
                </button>
                <button onClick={() => handleEdit(account)} className="btn-secondary flex items-center gap-1 text-sm">
                  <Pencil size={14} /> Editar
                </button>
                <button onClick={() => handleDelete(account.id)} className="text-red-400 hover:text-red-300 p-2">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/TwilioAccountsPage.jsx
git commit -m "feat: add Twilio accounts management page"
```

---

### Task 9: Frontend Routing & Layout

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Layout.jsx`

- [ ] **Step 1: Add route and import in `client/src/App.jsx`**

Add import after line 11 (`import ReportsPage from './pages/ReportsPage';`):

```js
import TwilioAccountsPage from './pages/TwilioAccountsPage';
```

Add route after the `/clients` route (after line 21):

```jsx
          <Route path="/twilio-accounts" element={<ProtectedRoute><Layout><TwilioAccountsPage /></Layout></ProtectedRoute>} />
```

- [ ] **Step 2: Update sidebar links in `client/src/components/Layout.jsx`**

Add `Phone` to the lucide-react import (line 3):

Replace:
```js
import { LayoutDashboard, Users, FilePlus, FileText, LogOut } from 'lucide-react';
```

With:
```js
import { LayoutDashboard, Users, Phone, FilePlus, FileText, LogOut } from 'lucide-react';
```

Replace the `links` array (lines 5-10):

```js
const links = [
  { to: '/', label: 'Panel', icon: LayoutDashboard },
  { to: '/clients', label: 'Clientes GHL', icon: Users },
  { to: '/twilio-accounts', label: 'Cuentas Twilio', icon: Phone },
  { to: '/reports/new', label: 'Nuevo Reporte', icon: FilePlus },
  { to: '/reports', label: 'Historial', icon: FileText },
];
```

- [ ] **Step 3: Commit**

```bash
git add client/src/App.jsx client/src/components/Layout.jsx
git commit -m "feat: add Twilio accounts route and sidebar link"
```

---

### Task 10: Dashboard — Twilio Stats

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx`

- [ ] **Step 1: Update DashboardPage to include Twilio stats**

Add `twilioAPI` to the import on line 3:

Replace:
```js
import { clientsAPI, reportsAPI } from '../services/api';
```

With:
```js
import { clientsAPI, reportsAPI, twilioAPI } from '../services/api';
```

Add `Phone` to lucide imports on line 5:

Replace:
```js
import { Users, FileText, Sparkles, Loader2, CheckCircle, Clock, XCircle } from 'lucide-react';
```

With:
```js
import { Users, Phone, FileText, Sparkles, Loader2, CheckCircle, Clock, XCircle } from 'lucide-react';
```

Update the state and data fetch. Replace line 9:
```js
  const [stats, setStats] = useState({ clients: 0, reports: [] });
```
With:
```js
  const [stats, setStats] = useState({ clients: 0, twilioAccounts: 0, reports: [] });
```

Replace the `Promise.all` block (lines 13-17):
```js
    Promise.all([clientsAPI.list(), reportsAPI.list()])
      .then(([clientsRes, reportsRes]) => {
        setStats({ clients: clientsRes.data.length, reports: reportsRes.data });
      })
      .finally(() => setLoading(false));
```
With:
```js
    Promise.all([clientsAPI.list(), twilioAPI.list(), reportsAPI.list()])
      .then(([clientsRes, twilioRes, reportsRes]) => {
        setStats({
          clients: clientsRes.data.length,
          twilioAccounts: twilioRes.data.length,
          reports: reportsRes.data,
        });
      })
      .finally(() => setLoading(false));
```

Update the stats grid. Replace `<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">` (line 42) with:
```jsx
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
```

Add a Twilio stat card after the GHL clients card (after line 49, closing `</div>` of the GHL card):

```jsx
        <div className="glass p-6 flex items-center gap-4">
          <Phone size={28} style={{ color: '#E8792F' }} />
          <div>
            <p className="text-2xl font-bold">{stats.twilioAccounts}</p>
            <p className="text-sm text-gray-500">Cuentas Twilio</p>
          </div>
        </div>
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/DashboardPage.jsx
git commit -m "feat: add Twilio account stats to dashboard"
```

---

### Task 11: Report New Page — Source Type Toggle

**Files:**
- Modify: `client/src/pages/ReportNewPage.jsx`

This is the most complex frontend change. Add a source type toggle at the top, conditionally show GHL or Twilio options, and adjust form submission.

- [ ] **Step 1: Rewrite `client/src/pages/ReportNewPage.jsx`**

Replace the entire file contents with:

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clientsAPI, twilioAPI, reportsAPI } from '../services/api';
import { Loader2, Sparkles } from 'lucide-react';

const MESSAGE_TYPES = [
  { value: 'TYPE_SMS', label: 'SMS' },
  { value: 'TYPE_EMAIL', label: 'Correo electronico' },
  { value: 'TYPE_CALL', label: 'Llamadas telefonicas' },
  { value: 'TYPE_FB', label: 'Facebook Messenger' },
  { value: 'TYPE_INSTAGRAM', label: 'Instagram' },
  { value: 'TYPE_WHATSAPP', label: 'WhatsApp' },
  { value: 'TYPE_LIVE_CHAT', label: 'Chat en vivo' },
  { value: 'TYPE_GMB', label: 'Google Business' },
];

const PROMPT_EXAMPLES = [
  'Analiza el sentimiento de los clientes en todas las conversaciones. Identifica quejas comunes, puntos positivos y tendencias de satisfaccion general.',
  'Encuentra todas las conversaciones sin resolver donde el ultimo mensaje fue del cliente. Enumeralas con contexto.',
  'Identifica las principales objeciones que plantean los clientes y sugiere mejoras para manejar cada una.',
  'Crea un reporte de rendimiento: tiempos de respuesta, resolucion de conversaciones y areas de mejora.',
];

export default function ReportNewPage() {
  const [sourceType, setSourceType] = useState('ghl');
  const [ghlClients, setGhlClients] = useState([]);
  const [twilioAccounts, setTwilioAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({
    ghlClientId: '',
    twilioAccountId: '',
    title: '',
    dateFrom: '',
    dateTo: '',
    conversationTypes: [],
    prompt: '',
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([clientsAPI.list(), twilioAPI.list()])
      .then(([ghlRes, twilioRes]) => {
        setGhlClients(ghlRes.data);
        setTwilioAccounts(twilioRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleType = (type) => {
    setForm((prev) => ({
      ...prev,
      conversationTypes: prev.conversationTypes.includes(type)
        ? prev.conversationTypes.filter((t) => t !== type)
        : [...prev.conversationTypes, type],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (sourceType === 'ghl' && !form.ghlClientId) {
      setError('Por favor selecciona un cliente GHL');
      return;
    }
    if (sourceType === 'twilio' && !form.twilioAccountId) {
      setError('Por favor selecciona una cuenta Twilio');
      return;
    }
    if (!form.dateFrom || !form.dateTo || !form.prompt) {
      setError('Por favor completa todos los campos requeridos');
      return;
    }

    setGenerating(true);
    try {
      const payload = {
        sourceType,
        title: form.title,
        dateFrom: form.dateFrom,
        dateTo: form.dateTo,
        prompt: form.prompt,
      };
      if (sourceType === 'ghl') {
        payload.ghlClientId = parseInt(form.ghlClientId);
        payload.conversationTypes = form.conversationTypes;
      } else {
        payload.twilioAccountId = parseInt(form.twilioAccountId);
      }
      const res = await reportsAPI.generate(payload);
      navigate(`/reports/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar el reporte');
      setGenerating(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-orange-500" size={32} /></div>;

  const noSources = ghlClients.length === 0 && twilioAccounts.length === 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Generar Reporte</h1>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg mb-4">{error}</div>}

      {noSources ? (
        <div className="glass p-12 text-center text-gray-500">
          <p>No hay fuentes de datos registradas.</p>
          <p className="text-sm mt-2">
            Agrega un <a href="/clients" className="text-orange-400 hover:underline">Cliente GHL</a> o una <a href="/twilio-accounts" className="text-orange-400 hover:underline">Cuenta Twilio</a> para comenzar.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="glass p-6">
            <h2 className="text-lg font-semibold mb-4">1. Fuente de Datos</h2>
            <div className="flex gap-2 mb-4">
              <button type="button" onClick={() => setSourceType('ghl')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${sourceType === 'ghl' ? 'bg-orange-500/20 border border-orange-500/40 text-orange-400' : 'bg-white/5 border border-white/10 text-gray-400 hover:text-gray-200'}`}>
                GHL
              </button>
              <button type="button" onClick={() => setSourceType('twilio')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${sourceType === 'twilio' ? 'bg-orange-500/20 border border-orange-500/40 text-orange-400' : 'bg-white/5 border border-white/10 text-gray-400 hover:text-gray-200'}`}>
                Twilio
              </button>
            </div>

            {sourceType === 'ghl' ? (
              ghlClients.length === 0 ? (
                <p className="text-sm text-gray-500">No hay clientes GHL. <a href="/clients" className="text-orange-400 hover:underline">Agregar uno</a></p>
              ) : (
                <select value={form.ghlClientId} onChange={(e) => setForm({ ...form, ghlClientId: e.target.value })} className="input-field">
                  <option value="">Elige un cliente GHL...</option>
                  {ghlClients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.locationId})</option>
                  ))}
                </select>
              )
            ) : (
              twilioAccounts.length === 0 ? (
                <p className="text-sm text-gray-500">No hay cuentas Twilio. <a href="/twilio-accounts" className="text-orange-400 hover:underline">Agregar una</a></p>
              ) : (
                <select value={form.twilioAccountId} onChange={(e) => setForm({ ...form, twilioAccountId: e.target.value })} className="input-field">
                  <option value="">Elige una cuenta Twilio...</option>
                  {twilioAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )
            )}
          </div>

          <div className="glass p-6">
            <h2 className="text-lg font-semibold mb-4">2. Rango de Fechas</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Desde</label>
                <input type="date" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Hasta</label>
                <input type="date" value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} className="input-field" required />
              </div>
            </div>
          </div>

          {sourceType === 'ghl' && (
            <div className="glass p-6">
              <h2 className="text-lg font-semibold mb-2">3. Tipos de Mensaje</h2>
              <p className="text-sm text-gray-500 mb-4">Filtra por tipo de mensaje. Deja todos sin marcar para incluir todos los mensajes.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {MESSAGE_TYPES.map(({ value, label }) => (
                  <label key={value} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${
                    form.conversationTypes.includes(value) ? 'bg-orange-500/20 border border-orange-500/40' : 'bg-white/5 border border-white/10'
                  }`}>
                    <input type="checkbox" checked={form.conversationTypes.includes(value)} onChange={() => toggleType(value)} className="accent-orange-500" />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="glass p-6">
            <h2 className="text-lg font-semibold mb-4">{sourceType === 'ghl' ? '4' : '3'}. Prompt de Analisis</h2>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Titulo del Reporte (opcional)</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field mb-4" placeholder="ej. Analisis Semanal de Sentimiento" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Que quieres analizar?</label>
              <textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} className="input-field h-32 resize-y" placeholder="Describe el reporte que deseas..." required />
            </div>
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-2">Ejemplos de prompts:</p>
              <div className="space-y-1">
                {PROMPT_EXAMPLES.map((example, i) => (
                  <button key={i} type="button" onClick={() => setForm({ ...form, prompt: example })} className="block text-left text-xs text-gray-400 hover:text-orange-400 transition-colors">
                    &bull; {example}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button type="submit" disabled={generating} className="btn-primary flex items-center gap-2 text-lg px-6 py-3">
            {generating ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
            {generating ? 'Iniciando...' : 'Generar Reporte'}
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/ReportNewPage.jsx
git commit -m "feat: add source type toggle (GHL/Twilio) to report creation form"
```

---

### Task 12: Report View & List Pages — Source Display

**Files:**
- Modify: `client/src/pages/ReportViewPage.jsx`
- Modify: `client/src/pages/ReportsPage.jsx`

- [ ] **Step 1: Update `client/src/pages/ReportViewPage.jsx`**

In the metadata bar section (around line 62), replace:

```jsx
        <div><span className="text-gray-500">Cliente:</span> {report.clientName}</div>
```

With:

```jsx
        <div><span className="text-gray-500">Fuente:</span> {report.sourceType === 'twilio' ? 'Twilio' : 'GHL'} — {report.clientName}</div>
```

Also replace the label "Conversaciones" with a dynamic label (around line 65):

```jsx
        <div><span className="text-gray-500">Conversaciones:</span> {report.totalConversations}</div>
```

With:

```jsx
        <div><span className="text-gray-500">{report.sourceType === 'twilio' ? 'Llamadas' : 'Conversaciones'}:</span> {report.totalConversations}</div>
```

- [ ] **Step 2: Update `client/src/pages/ReportsPage.jsx`**

In the report list item (around line 59-61), replace:

```jsx
                  <p className="text-sm text-gray-500">
                    {r.clientName} &bull; {new Date(r.dateFrom).toLocaleDateString()} — {new Date(r.dateTo).toLocaleDateString()} &bull; {r.totalConversations} conversaciones
                  </p>
```

With:

```jsx
                  <p className="text-sm text-gray-500">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs mr-1 ${r.sourceType === 'twilio' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>{r.sourceType === 'twilio' ? 'Twilio' : 'GHL'}</span>
                    {r.clientName} &bull; {new Date(r.dateFrom).toLocaleDateString()} — {new Date(r.dateTo).toLocaleDateString()} &bull; {r.totalConversations} {r.sourceType === 'twilio' ? 'llamadas' : 'conversaciones'}
                  </p>
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/ReportViewPage.jsx client/src/pages/ReportsPage.jsx
git commit -m "feat: show source type (GHL/Twilio) in report views and list"
```

---

### Task 13: Deploy

**Files:** None (deployment step)

- [ ] **Step 1: Add OPENAI_API_KEY to Railway environment variables**

In the Railway dashboard, add:
- `OPENAI_API_KEY` = your OpenAI API key

- [ ] **Step 2: Push to deploy**

```bash
git push
```

- [ ] **Step 3: Run migration on Railway**

After deploy, the migration should run automatically via Prisma. If not, run:

```bash
railway run npx prisma migrate deploy
```

- [ ] **Step 4: Verify**

- Visit the app, check sidebar shows "Cuentas Twilio" link
- Add a Twilio account, test connection
- Create a report with Twilio source
- Verify report generates with transcribed calls
