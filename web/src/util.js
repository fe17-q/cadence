const DAY = 864e5;
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

export function dayDiff(iso, now = new Date()) {
  return Math.round((startOfDay(iso) - startOfDay(now)) / DAY);
}

export function relDue(iso, now = new Date()) {
  if (!iso) return 'No due date';
  const ms = new Date(iso) - now;
  const d = dayDiff(iso, now);
  const time = new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (ms < 0) {
    if (d === 0) return `Was due today, ${time}`;
    if (d === -1) return 'Was due yesterday';
    return `Was due ${new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }
  if (ms < 3600e3) return `Due in ${Math.max(1, Math.round(ms / 60e3))} min`;
  if (d === 0) return `Due today, ${time}`;
  if (d === 1) return `Due tomorrow, ${time}`;
  if (d < 7) return `Due ${new Date(iso).toLocaleDateString([], { weekday: 'long' })}, ${time}`;
  return `Due ${new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

export function countdown(iso, now = new Date()) {
  const ms = new Date(iso) - now;
  if (ms <= 0) return { value: 'Now', unit: '' };
  const h = ms / 3600e3;
  if (h < 1) return { value: Math.ceil(ms / 60e3), unit: 'minutes left' };
  if (h < 48) return { value: Math.floor(h), unit: Math.floor(h) === 1 ? 'hour left' : 'hours left' };
  const days = Math.floor(h / 24);
  return { value: days, unit: 'days left' };
}

export function urgency(iso, done = false, now = new Date()) {
  if (!iso || done) return 'calm';
  const h = (new Date(iso) - now) / 3600e3;
  if (h < 0) return 'late';
  if (h < 48) return 'soon';
  return 'calm';
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function bucket(iso, now = new Date()) {
  if (!iso) return 'Someday';
  const d = dayDiff(iso, now);
  if (new Date(iso) < now) return 'Past';
  if (d <= 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d < 7) return 'This week';
  if (d < 14) return 'Next week';
  return 'Later';
}

export const firstName = n => (n || '').trim().split(/\s+/)[0];
export const initials = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase()).join('');

// datetime-local <-> ISO
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d - off * 60e3).toISOString().slice(0, 16);
}
export const fromLocalInput = v => (v ? new Date(v).toISOString() : null);

export function fileKind(name = '') {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['pdf'].includes(ext)) return 'PDF';
  if (['doc', 'docx'].includes(ext)) return 'DOC';
  if (['ppt', 'pptx'].includes(ext)) return 'PPT';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'XLS';
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return 'IMG';
  if (['zip'].includes(ext)) return 'ZIP';
  return 'FILE';
}
