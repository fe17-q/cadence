// A tiny fake Canvas server for local development and demos: node scripts/mock-canvas.js
import express from 'express';
const app = express();
const PORT = process.env.MOCK_PORT || 8790;
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(23, 59, 0, 0); return d.toISOString(); };
const base = `http://localhost:${PORT}`;

const courses = [
  { id: 4914, name: 'Senior Design I', course_code: 'EEL 4914', term: { name: 'Fall 2026' } },
  { id: 3123, name: 'Networks & Systems', course_code: 'EEL 3123', term: { name: 'Fall 2026' } },
];
let assignments = [
  { id: 1, name: 'Project Proposal & Divide and Conquer', due_at: day(2), points_possible: 100, published: true,
    description: `<p>Submit a <strong>10-page</strong> proposal describing your project, its motivation, and an initial block diagram.</p><h3>Requirements</h3><ul><li>Problem statement and motivation</li><li>Engineering specifications table (at least 5 specs)</li><li>House of Quality</li><li>Block diagram with owners for each block</li><li>Budget and milestone table</li></ul><p>Use the template: <a href="/courses/4914/files/901/download">D&amp;C Template.docx</a></p><p>See an example from last year: <a href="/courses/4914/files/902">Example Proposal.pdf</a></p><p>Rubric: <a href="/courses/4914/files/903">Proposal Rubric.pdf</a></p><p>Shared spec worksheet: <a href="https://docs.google.com/spreadsheets/d/1SpecSheetDemo/edit">Engineering Specs Worksheet</a></p>` },
  { id: 2, name: '60-Page Draft Senior Design I Documentation', due_at: day(9), points_possible: 150, published: true,
    description: '<p>Draft of the full documentation. Every member must author at least 15 pages.</p><p><a href="/courses/4914/files/910/download">Documentation Guidelines.pdf</a></p>' },
  { id: 3, name: 'Weekly Advisor Check-in #6', due_at: day(4), points_possible: 10, published: true, description: '<p>Meet with your advisor and upload signed meeting notes.</p>' },
  { id: 4, name: 'Standards & Constraints Research', due_at: day(15), points_possible: 50, published: true, description: '<p>Identify relevant IEEE/ANSI standards and realistic design constraints.</p>' },
  { id: 5, name: 'Team Contract', due_at: day(-12), points_possible: 20, published: true, description: '<p>Signed team contract.</p>' },
  { id: 6, name: 'Final Presentation Slides', due_at: day(34), points_possible: 100, published: true, description: '<p>15-minute presentation.</p><p><a href="/courses/4914/files/920">Presentation Rubric.pptx</a></p>' },
];
// calendar feed (no auth, like Canvas's private feed URL)
app.get('/feeds/calendars/user_demo.ics', (req, res) => {
  const fmt = iso => iso.replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = assignments.map(a => `BEGIN:VEVENT\r\nUID:event-assignment-${a.id}\r\nDTSTART:${fmt(a.due_at)}\r\nDTEND:${fmt(a.due_at)}\r\nSUMMARY:${a.name} [EEL 4914]\r\nURL:${base}/courses/4914/assignments/${a.id}\r\nEND:VEVENT`).join('\r\n');
  res.type('text/calendar').send(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:mock\r\n${ev}\r\nEND:VCALENDAR\r\n`);
});
app.use((req, res, next) => { if (!/^Bearer \S+/.test(req.headers.authorization || '')) return res.status(401).json({ errors: [{ message: 'Invalid access token.' }] }); next(); });
app.get('/api/v1/courses', (req, res) => res.json(courses));
app.get('/api/v1/courses/:id', (req, res) => res.json(courses.find(c => String(c.id) === req.params.id)));
app.get('/api/v1/courses/:id/assignments', (req, res) => res.json(req.params.id === '4914'
  ? assignments.map(a => ({ ...a, html_url: `${base}/courses/4914/assignments/${a.id}` })) : []));
// demo hook: simulate the professor posting a new assignment
app.post('/__add', (req, res) => {
  const a = { id: assignments.length + 1, name: 'Bill of Materials (BOM) Draft', due_at: day(6), points_possible: 25, published: true, description: '<p>Itemized parts list with costs and suppliers.</p>' };
  assignments.push(a); res.json(a);
});
app.listen(PORT, () => console.log(`Mock Canvas on ${base}`));
