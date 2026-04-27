# Twilio Call Analysis Integration

## Goal

Add Twilio as a parallel data source alongside GHL so users can generate AI-powered reports from Twilio call recordings and metadata.

## Architecture

Parallel data source model: users add Twilio accounts (Account SID + Auth Token, encrypted) the same way they add GHL clients. When creating a report, they choose either GHL or Twilio as the source. The report generation pipeline branches based on source type — GHL uses the existing text-based conversation flow, Twilio fetches call logs + downloads recordings, transcribes them with OpenAI Whisper API ($0.006/min), then sends transcriptions as text to Claude for analysis.

## Data Model

### New Model: TwilioAccount

```prisma
model TwilioAccount {
  id         Int      @id @default(autoincrement())
  name       String
  accountSid String   // encrypted with AES-256-GCM
  authToken  String   // encrypted with AES-256-GCM
  userId     Int
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  reports    Report[]
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

### Modified Model: Report

```prisma
model Report {
  id                 Int             @id @default(autoincrement())
  title              String
  sourceType         String          @default("ghl")  // "ghl" or "twilio"
  ghlClientId        Int?            // now optional
  ghlClient          GHLClient?      @relation(fields: [ghlClientId], references: [id], onDelete: Cascade)
  twilioAccountId    Int?            // new
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

### Modified Model: User

Add relation:
```prisma
model User {
  // ... existing fields
  twilioAccounts TwilioAccount[]
}
```

## Backend: Twilio Service

### File: `server/src/services/twilioService.js`

**`fetchCalls(accountSid, authToken, dateFrom, dateTo, onProgress)`**
- Calls Twilio REST API: `GET /2010-04-01/Accounts/{SID}/Calls.json`
- Filters: `StartTime>=YYYY-MM-DD` and `StartTime<=YYYY-MM-DD`
- Paginates through ALL results (Twilio uses `NextPageUri` for pagination)
- Returns array of call objects with: sid, from, to, direction, duration, status, startTime, endTime
- Reports progress via `onProgress` callback

**`fetchRecording(accountSid, authToken, callSid)`**
- Calls `GET /2010-04-01/Accounts/{SID}/Calls/{CallSid}/Recordings.json`
- If recordings exist, downloads the first recording as MP3 via `GET /2010-04-01/Accounts/{SID}/Recordings/{RecordingSid}.mp3`
- Returns the audio buffer (Buffer) or null if no recording

**`fetchCallsWithRecordings(accountSid, authToken, dateFrom, dateTo, onProgress)`**
- Main function called by report controller
- Fetches all calls in date range
- For each call, attempts to download recording audio
- For each recording, transcribes audio using OpenAI Whisper API
- Returns array of structured call data:
  ```js
  {
    sid: string,
    from: string,
    to: string,
    direction: "inbound" | "outbound-dial" | "outbound-api",
    duration: number, // seconds
    status: string,
    startTime: string,
    endTime: string,
    recording: Buffer | null, // MP3 audio or null
    transcription: string | null // Whisper transcription or null
  }
  ```
- Calls `onProgress` with Spanish messages:
  - "Obteniendo llamadas de Twilio..."
  - "Se encontraron X llamadas. Descargando grabaciones..."
  - "Descargando y transcribiendo grabación (N/total)..."

**`transcribeRecording(audioBuffer)`**
- Sends MP3 buffer to OpenAI Whisper API (`POST /v1/audio/transcriptions`)
- Model: `whisper-1`
- Cost: ~$0.006/minute of audio
- Returns transcription text string
- Requires `OPENAI_API_KEY` environment variable

### Authentication

Twilio REST API uses HTTP Basic Auth: `username = accountSid`, `password = authToken`. Credentials encrypted at rest with existing AES-256-GCM encryption utility.

## Backend: Report Service Changes

### File: `server/src/services/reportService.js`

Add new function **`generateTwilioReport(calls, userPrompt, onProgress)`**:
- All calls (with or without transcription) formatted as text for Claude
- Call metadata (from, to, direction, duration, status, start/end time) always included
- Calls WITH transcriptions include the full transcription text
- Calls WITHOUT transcriptions include only metadata
- Chunks into batches of 20 calls (text-only, so larger batches than audio would allow)
- Merge strategy same as GHL: if multiple chunks, merge sub-reports into final report
- Max tokens: 4096 per chunk, 8192 for merge

**Formatted call structure sent to Claude:**
```
--- Call 1 ---
From: +1234567890
To: +0987654321
Direction: inbound
Duration: 245 seconds
Status: completed
Start: 2026-04-20T10:30:00Z
End: 2026-04-20T10:34:05Z
Transcription:
  [Full Whisper transcription text here]
```

Existing `generateReport` function stays unchanged for GHL flow.

## Backend: Twilio Account Controller & Routes

### File: `server/src/controllers/twilioAccountController.js`

Same CRUD pattern as `ghlClientController.js`:
- `list(req, res)` — list user's Twilio accounts (no credentials in response)
- `create(req, res)` — create with encrypted accountSid + authToken
- `get(req, res)` — get single account (no credentials)
- `update(req, res)` — update name and/or credentials
- `remove(req, res)` — delete account
- `testConnection(req, res)` — decrypt credentials, call Twilio API to list 1 call, return success/failure

### File: `server/src/routes/twilioAccounts.js`

```
GET    /api/twilio-accounts        → list
POST   /api/twilio-accounts        → create
GET    /api/twilio-accounts/:id    → get
PUT    /api/twilio-accounts/:id    → update
DELETE /api/twilio-accounts/:id    → remove
POST   /api/twilio-accounts/:id/test → testConnection
```

All routes behind `authMiddleware`.

## Backend: Report Controller Changes

### File: `server/src/controllers/reportController.js`

**`generate`** function updated:
- Accepts `sourceType` ("ghl" or "twilio") and `twilioAccountId` in request body
- Validates: if sourceType is "ghl", requires ghlClientId; if "twilio", requires twilioAccountId
- Creates report with `sourceType` and appropriate foreign key
- Branches on sourceType:
  - `"ghl"`: existing flow unchanged
  - `"twilio"`: decrypt Twilio credentials, call `fetchCallsWithRecordings`, then `generateTwilioReport`

**`listReports`** updated:
- Include `twilioAccount: { select: { name: true } }` alongside ghlClient
- Map `clientName` from whichever source exists

**`getReport`** updated:
- Include twilioAccount relation

## Frontend: API Service

### File: `client/src/services/api.js`

Add `twilioAPI`:
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

Update `reportsAPI.generate` — no change needed, it already sends arbitrary body data.

## Frontend: Twilio Accounts Page

### File: `client/src/pages/TwilioAccountsPage.jsx`

Same pattern as `ClientsPage.jsx`:
- List of Twilio accounts with name, created date
- Add form: name, Account SID, Auth Token
- Edit/delete per account
- "Probar conexion" button per account
- All text in Spanish

### Route: `/twilio-accounts`

## Frontend: Report New Page Changes

### File: `client/src/pages/ReportNewPage.jsx`

Add source type toggle at top of form:
- Two-button toggle: "GHL" | "Twilio"
- Default: "GHL" (preserves current behavior)
- When "GHL" selected: show GHL client dropdown + message type checkboxes (existing)
- When "Twilio" selected: show Twilio account dropdown, hide message type checkboxes
- Date range and prompt fields always visible
- Form submission includes `sourceType` and either `ghlClientId` or `twilioAccountId`

## Frontend: Other Page Changes

### Layout.jsx
- Add "Cuentas Twilio" sidebar link alongside "Clientes GHL"

### DashboardPage.jsx
- Add Twilio account count stat card
- Fetch from `/api/twilio-accounts` on load

### ReportViewPage.jsx
- Show source type in metadata: "Fuente: GHL — {clientName}" or "Fuente: Twilio — {accountName}"
- Display `clientName` from whichever source (ghlClient or twilioAccount)

### ReportsPage.jsx
- Show source type badge in report list items

### App.jsx
- Add route: `/twilio-accounts` → TwilioAccountsPage

## Dependencies

### New npm packages
- `openai` — OpenAI SDK for Whisper transcription API
- No Twilio SDK needed — Twilio REST API is simple HTTP with Basic Auth, use existing `axios`

### New environment variable
- `OPENAI_API_KEY` — required for Whisper transcription

## Error Handling

- Twilio API errors (401, 404, etc.) mapped to Spanish error messages in controller
- Recording download failures: skip recording, include call metadata only, log warning
- Transcription failures: skip transcription, include call metadata only, log warning
- Large recordings: Whisper API accepts up to 25MB per file; if a recording exceeds this, skip transcription and include metadata only
- Network timeouts: same pattern as GHL (try/catch per call, continue on failure)

## Migration Strategy

Since `ghlClientId` on Report changes from required to optional, this requires a migration:
1. Add `sourceType` column with default "ghl"
2. Add `twilioAccountId` column as optional
3. Make `ghlClientId` optional
4. Create TwilioAccount table
5. Add User.twilioAccounts relation

All existing reports keep `sourceType: "ghl"` and their `ghlClientId` intact.
