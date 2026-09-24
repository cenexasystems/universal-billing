export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, password } = req.body || {};
  
  const adminId = process.env.VITE_ADMIN_ID || 'admin';
  const adminPwd = process.env.VITE_ADMIN_PASSWORD || 'admin123';
  const staffId = process.env.VITE_STAFF_ID || 'staff';
  const staffPwd = process.env.VITE_STAFF_PASSWORD || 'staff123';

  if (id === adminId && password === adminPwd) {
    return res.status(200).json({ role: 'admin', name: 'Admin', id: adminId });
  }
  if (id === staffId && password === staffPwd) {
    return res.status(200).json({ role: 'staff', name: 'Staff', id: staffId });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
}