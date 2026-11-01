// Fake Google OAuth + Drive API for local testing: node scripts/mock-google.js
// Run the app with GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=y GOOGLE_AUTH_URL=http://localhost:8791/o/oauth2/v2/auth
//   GOOGLE_TOKEN_URL=http://localhost:8791/token GOOGLE_API_BASE=http://localhost:8791
import express from 'express';
const app = express();
app.use(express.json()); app.use(express.urlencoded({ extended: true }));
const PORT = process.env.MOCK_GOOGLE_PORT || 8791;
const files = new Map(); const shares = [];
let n = 0;
const link = f => ({
  'application/vnd.google-apps.document': `https://docs.google.com/document/d/${f.id}/edit`,
  'application/vnd.google-apps.spreadsheet': `https://docs.google.com/spreadsheets/d/${f.id}/edit`,
  'application/vnd.google-apps.presentation': `https://docs.google.com/presentation/d/${f.id}/edit`,
  'application/vnd.google-apps.folder': `https://drive.google.com/drive/folders/${f.id}`,
}[f.mimeType] || `https://drive.google.com/file/d/${f.id}/view`);

app.get('/o/oauth2/v2/auth', (req, res) => res.redirect(`${req.query.redirect_uri}?code=mockcode&state=${encodeURIComponent(req.query.state)}`));
app.post('/token', (req, res) => res.json({ access_token: 'at-' + Date.now(), expires_in: 3600, ...(req.body.grant_type === 'authorization_code' ? { refresh_token: 'rt-mock' } : {}) }));
app.get('/oauth2/v3/userinfo', (req, res) => res.json({ email: 'fernando.quijada@gmail.com' }));
app.post('/drive/v3/files', (req, res) => {
  const f = { id: 'mock' + (++n) + 'AbC', ...req.body };
  f.webViewLink = link(f); files.set(f.id, f); res.json(f);
});
app.get('/drive/v3/files/:id', (req, res) => files.has(req.params.id) ? res.json(files.get(req.params.id)) : res.status(404).json({ error: { message: 'File not found' } }));
app.post('/drive/v3/files/:id/permissions', (req, res) => { shares.push({ file: req.params.id, ...req.body }); res.json({ id: 'perm' + shares.length }); });
app.get('/__state', (req, res) => res.json({ files: [...files.values()], shares }));
app.listen(PORT, () => console.log(`Mock Google on http://localhost:${PORT}`));
