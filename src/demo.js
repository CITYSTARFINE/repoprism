// Original illustrative source. No real credentials or copied repository code.
export function demoEntries() {
  const entries = [
    {
      path: 'README.md',
      content:
        '# Prism Demo\n\nAn illustrative collaborative workspace with authentication, boards and a small API.\n\n## Run\n\nnpm install\nnpm run dev\n\n## Architecture\n\nThe frontend lives in src/. The API lives in server/. Authentication uses signed sessions.\n',
    },
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: 'prism-demo',
          scripts: { dev: 'vite' },
          dependencies: { react: '^19.0.0', zod: '^3.24.0', express: '^5.0.0' },
        },
        null,
        2,
      ),
    },
    { path: '.gitignore', content: 'node_modules/\ndist/\n.env\n' },
    { path: '.env', content: 'DEMO_EXCLUDED=illustrative-only' },
    {
      path: 'src/main.tsx',
      content: `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { App } from './App';\nimport './styles/global.css';\n\ncreateRoot(document.getElementById('root')!).render(<App />);\n`,
    },
    {
      path: 'src/App.tsx',
      content: `import { Board } from './components/Board';\nimport { Login } from './components/Login';\nimport { useSession } from './hooks/useSession';\n\nexport function App() {\n  const session = useSession();\n  return session ? <Board /> : <Login />;\n}\n`,
    },
    {
      path: 'src/components/Login.tsx',
      content: `import { login } from '../lib/api';\nimport { Button } from './Button';\nimport { validateEmail } from '../lib/validation';\n\nexport function Login() {\n  async function submit(email: string, password: string) {\n    if (validateEmail(email)) await login(email, password);\n  }\n  return <form><input type="email" /><Button label="Sign in" /></form>;\n}\n`,
    },
    {
      path: 'src/components/Board.tsx',
      content: `import { Card } from './Card';\nimport { Button } from './Button';\nimport { useBoard } from '../hooks/useBoard';\nimport { formatDate } from '../lib/format';\n\nexport function Board() {\n  const board = useBoard();\n  return <main>{board.cards.map(card => <Card key={card.id} title={card.title} />)}<Button label="New card" /></main>;\n}\n`,
    },
    {
      path: 'src/components/Card.tsx',
      content: `import { formatDate } from '../lib/format';\nimport { Button } from './Button';\n\nexport function Card({ title }: { title: string }) {\n  return <article><h2>{title}</h2><Button label="Edit" /></article>;\n}\n`,
    },
    {
      path: 'src/components/Button.tsx',
      content: `export function Button({ label }: { label: string }) {\n  return <button className="button">{label}</button>;\n}\n`,
    },
    {
      path: 'src/hooks/useSession.ts',
      content: `import { getSession, logout } from '../lib/api';\nimport { sessionStore } from '../stores/session';\n\nexport function useSession() {\n  // TODO: refresh the session before it expires\n  // FIXME: handle clock skew on expiry checks\n  // TODO: invalidate the session across tabs\n  return sessionStore.get();\n}\n`,
    },
    {
      path: 'src/hooks/useBoard.ts',
      content: `import { getBoard } from '../lib/api';\nimport { boardStore } from '../stores/board';\n\nexport function useBoard() {\n  return boardStore.get();\n}\n`,
    },
    {
      path: 'src/lib/api.ts',
      content: `import { validateEmail } from './validation';\n\nconst base = '/api';\nexport async function login(email: string, password: string) {\n  return fetch(base + '/auth', { method: 'POST', body: JSON.stringify({ email, password }) });\n}\nexport async function getSession() { return fetch(base + '/session').then(r => r.json()); }\nexport async function logout() { return fetch(base + '/auth', { method: 'DELETE' }); }\nexport async function getBoard() { return fetch(base + '/boards').then(r => r.json()); }\n`,
    },
    {
      path: 'src/lib/validation.ts',
      content: `import { z } from 'zod';\n\nexport const emailSchema = z.string().email();\nexport function validateEmail(value: string) {\n  return emailSchema.safeParse(value).success;\n}\n`,
    },
    {
      path: 'src/lib/format.ts',
      content: `export function formatDate(value: string) {\n  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value));\n}\n`,
    },
    {
      path: 'src/stores/session.ts',
      content: `let session: { user: string; expiresAt: number } | null = null;\nexport const sessionStore = {\n  get: () => session,\n  set: (value: typeof session) => { session = value; },\n  clear: () => { session = null; },\n};\n`,
    },
    {
      path: 'src/stores/board.ts',
      content: `type Card = { id: string; title: string };\nlet cards: Card[] = [];\nexport const boardStore = { get: () => ({ cards }), set: (value: Card[]) => { cards = value; } };\n`,
    },
    {
      path: 'src/styles/global.css',
      content: `:root { color-scheme: dark; --accent: #a395ff; }\nbody { margin: 0; font-family: system-ui; background: #10131c; color: #eef; }\n.button { border: 0; padding: 12px 18px; background: var(--accent); border-radius: 8px; }\n`,
    },
    {
      path: 'server/index.ts',
      content: `import express from 'express';\nimport { authRouter } from './routes/auth';\nimport { boardRouter } from './routes/boards';\nimport { requestLogger } from './middleware/logger';\n\nconst app = express();\napp.use(express.json());\napp.use(requestLogger);\napp.use('/api', authRouter);\napp.use('/api', boardRouter);\napp.listen(3000);\n`,
    },
    {
      path: 'server/routes/auth.ts',
      content: `import { Router } from 'express';\nimport { createSession, validateSession } from '../services/session';\nimport { findUser } from '../db/users';\n\nexport const authRouter = Router();\nauthRouter.post('/auth', async (req, res) => {\n  const user = await findUser(req.body.email);\n  if (!user) return res.status(401).json({ error: 'Invalid credentials' });\n  const session = createSession(user.id);\n  res.cookie('session', session, { httpOnly: true, sameSite: 'strict', secure: true });\n  res.json({ ok: true });\n});\n`,
    },
    {
      path: 'server/routes/boards.ts',
      content: `import { Router } from 'express';\nimport { listBoards } from '../db/boards';\nimport { validateSession } from '../services/session';\n\nexport const boardRouter = Router();\nboardRouter.get('/boards', async (req, res) => {\n  if (!validateSession(req.cookies.session)) return res.status(401).end();\n  res.json(await listBoards());\n});\n`,
    },
    {
      path: 'server/services/session.ts',
      content: `import { randomUUID } from 'node:crypto';\n\nconst sessions = new Map<string, { user: string; expires: number }>();\nexport function createSession(user: string) {\n  const token = randomUUID();\n  sessions.set(token, { user, expires: Date.now() + 3600000 });\n  return token;\n}\nexport function validateSession(token: string) {\n  const session = sessions.get(token);\n  return session && session.expires > Date.now();\n}\n`,
    },
    {
      path: 'server/db/users.ts',
      content: `import { database } from './connection';\nexport async function findUser(email: string) {\n  return database.query('SELECT id FROM users WHERE email = ?', [email]);\n}\n`,
    },
    {
      path: 'server/db/boards.ts',
      content: `import { database } from './connection';\nexport async function listBoards() { return database.query('SELECT id, title FROM boards', []); }\n`,
    },
    {
      path: 'server/db/connection.ts',
      content: `export const database = {\n  async query(sql: string, args: unknown[]) { return []; },\n};\n`,
    },
    {
      path: 'server/middleware/logger.ts',
      content: `export function requestLogger(req: any, res: any, next: () => void) {\n  console.log(req.method, req.path);\n  next();\n}\n`,
    },
    {
      path: 'scripts/seed.py',
      content: `from pathlib import Path\nfrom fixtures import make_board\n\ndef seed():\n    boards = [make_board(i) for i in range(10)]\n    print(f"Created {len(boards)} demo boards")\n\nif __name__ == '__main__':\n    seed()\n`,
    },
    {
      path: 'scripts/fixtures.py',
      content: `def make_board(index):\n    return {"id": str(index), "title": f"Board {index}"}\n`,
    },
    {
      path: 'tests/session.test.ts',
      content: `import { createSession, validateSession } from '../server/services/session';\n\nconst token = createSession('demo-user');\nif (!validateSession(token)) throw new Error('Session should be valid');\nif (validateSession('unknown')) throw new Error('Unknown session should be invalid');\n`,
    },
    {
      path: 'docs/architecture.md',
      content: `# Architecture\n\n## Web app\nReact components talk to the API through src/lib/api.ts. State is stored in session and board stores.\n\n## Authentication\nThe server issues an HTTP-only session cookie. Sessions expire after one hour.\n\n## Data layer\nDatabase access is isolated in server/db. This demo uses a placeholder adapter.\n\nThese are illustrative files, not a runnable production application.\n`,
    },
    {
      path: 'docs/api.md',
      content: `# API\n\nPOST /api/auth — create a session\nGET /api/session — read the current user\nDELETE /api/auth — sign out\nGET /api/boards — list boards\n`,
    },
    {
      path: '.github/workflows/test.yml',
      content: `name: Test\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n`,
    },
  ];
  entries.push({
    path: 'server/services/legacy-import.ts',
    content:
      '// Illustrative large file: repeated handlers are deliberate demo data.\n' +
      Array.from(
        { length: 110 },
        (_, i) =>
          `export function parseRow${i}(row: string) {\n  return row.split(',').map(value => value.trim());\n}\n`,
      ).join('\n'),
  });
  // Construct an intentionally synthetic token to exercise masking, never a live key.
  entries.push({
    path: 'server/config.ts',
    content:
      '// Synthetic credential, intentionally included to demonstrate redaction.\nexport const api_key = "ghp_' +
      'SYNTHETICDEMOONLY00000000000000' +
      '";\n',
  });
  return entries;
}
