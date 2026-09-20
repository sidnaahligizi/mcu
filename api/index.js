import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let action;
    let payload = {};

    if (req.method === 'GET') { action = req.query.action; } 
    else if (req.method === 'POST') { action = req.body.action; payload = req.body; }

    if (action === 'readMCU') {
      const { rows } = await client.execute('SELECT payload FROM mcu');
      const data = rows.map(r => JSON.parse(r.payload));
      return res.status(200).json({ status: 'success', data });
    }

    if (action === 'readPasien') {
      const { rows } = await client.execute('SELECT payload FROM pasien');
      const data = rows.map(r => JSON.parse(r.payload));
      return res.status(200).json({ status: 'success', data });
    }

    if (action === 'readDokter') {
      const { rows } = await client.execute('SELECT nama, nip FROM dokter');
      return res.status(200).json({ status: 'success', data: rows });
    }

    if (action === 'login') {
      const { role, user, pass } = payload;
      if (role === 'Admin' || role === 'Petugas') {
        const { rows } = await client.execute({ sql: 'SELECT * FROM akun WHERE role = ? AND username = ? AND password = ?', args: [role, user, pass] });
        if (rows.length > 0) return res.status(200).json({ status: 'success', name: user, role: role });
        return res.status(400).json({ status: 'error', message: 'Username atau Password salah!' });
      } else if (role === 'Pasien') {
        const { rows } = await client.execute({ sql: 'SELECT id, payload FROM pasien WHERE username = ? AND password = ?', args: [user.toLowerCase(), pass] });
        if (rows.length > 0) {
          const pData = JSON.parse(rows[0].payload);
          return res.status(200).json({ status: 'success', name: pData.Nama, id: rows[0].id, role: role });
        }
        return res.status(400).json({ status: 'error', message: 'Akun Pasien tidak ditemukan / Password salah!' });
      }
    }

    if (action === 'savePasien') {
      const data = payload.data;
      const id = data.ID_Pasien || new Date().getTime().toString();
      data.ID_Pasien = id;
      await client.execute({
        sql: 'INSERT INTO pasien (id, username, password, payload) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET username=excluded.username, password=excluded.password, payload=excluded.payload',
        args: [id, data.Nama.toLowerCase(), data.Password, JSON.stringify(data)]
      });
      return res.status(200).json({ status: 'success', message: 'Data Pasien berhasil disimpan!' });
    }

    if (action === 'savePasienBatch') {
      const { data } = payload; 
      const stmts = data.map(p => {
        const id = p.ID_Pasien || (new Date().getTime().toString() + Math.floor(Math.random() * 1000));
        p.ID_Pasien = id;
        return {
          sql: 'INSERT INTO pasien (id, username, password, payload) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET username=excluded.username, password=excluded.password, payload=excluded.payload',
          args: [id, p.Nama.toLowerCase(), p.Password, JSON.stringify(p)]
        };
      });
      await client.batch(stmts, 'write');
      return res.status(200).json({ status: 'success', message: `${data.length} Data Pasien berhasil diupload!` });
    }

    if (action === 'saveMCU') {
      const data = payload.data;
      const id = data.ID || new Date().getTime().toString();
      data.ID = id;
      await client.execute({
        sql: 'INSERT INTO mcu (id, nama, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET nama=excluded.nama, payload=excluded.payload',
        args: [id, data.Nama, JSON.stringify(data)]
      });
      return res.status(200).json({ status: 'success', message: 'Data MCU berhasil disimpan!' });
    }

    if (action === 'deletePasien') {
      await client.execute({ sql: 'DELETE FROM pasien WHERE id = ?', args: [payload.id] });
      return res.status(200).json({ status: 'success', message: 'Data berhasil dihapus!' });
    }

    if (action === 'deleteMCU') {
      await client.execute({ sql: 'DELETE FROM mcu WHERE id = ?', args: [payload.id] });
      return res.status(200).json({ status: 'success', message: 'Data berhasil dihapus!' });
    }

    return res.status(400).json({ status: 'error', message: 'Aksi tidak valid' });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
}
