import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    if (req.method === 'GET') {
      const { action } = req.query;
      
      if (action === 'readMCU') {
        const result = await client.execute('SELECT * FROM mcu');
        return res.status(200).json({ status: 'success', data: result.rows });
      } 
      else if (action === 'readPasien') {
        const result = await client.execute('SELECT * FROM pasien');
        // Map kolom agar sesuai dengan format lama frontend (Tempat/Tgl Lahir dll)
        const mappedData = result.rows.map(r => ({
          ID_Pasien: r.ID_Pasien,
          Nama: r.Nama,
          'Tempat/Tgl Lahir': r.TTL,
          'Posisi/ID': r.PosisiID,
          Gender: r.Gender,
          Bagian: r.Bagian,
          Password: r.Password
        }));
        return res.status(200).json({ status: 'success', data: mappedData });
      }
      else if (action === 'readDokter') {
        const result = await client.execute('SELECT * FROM dokter');
        return res.status(200).json({ status: 'success', data: result.rows });
      }
      
      return res.status(400).json({ status: 'error', message: 'Aksi GET tidak valid' });
    }

    if (req.method === 'POST') {
      const payload = req.body;
      const { action, data, role, user, pass, id } = payload;

      if (action === 'login') {
        if (role === 'Admin' || role === 'Petugas') {
          const result = await client.execute({
            sql: 'SELECT * FROM akun WHERE role = ? AND username = ? AND password = ?',
            args: [role, user, pass]
          });
          if (result.rows.length > 0) {
            return res.status(200).json({ status: 'success', name: user, role: role });
          }
          return res.status(200).json({ status: 'error', message: 'Username atau Password salah!' });
        } else if (role === 'Pasien') {
          const result = await client.execute({
            sql: 'SELECT * FROM pasien WHERE LOWER(Nama) = LOWER(?) AND Password = ?',
            args: [user, pass]
          });
          if (result.rows.length > 0) {
            return res.status(200).json({ status: 'success', name: result.rows[0].Nama, id: result.rows[0].ID_Pasien, role: role });
          }
          return res.status(200).json({ status: 'error', message: 'Akun Pasien tidak ditemukan / Password salah!' });
        }
      }

      if (action === 'savePasien') {
        const p_id = data.ID_Pasien || new Date().getTime().toString();
        await client.execute({
          sql: `INSERT INTO pasien (ID_Pasien, Nama, TTL, PosisiID, Gender, Bagian, Password) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(ID_Pasien) DO UPDATE SET 
                Nama=excluded.Nama, TTL=excluded.TTL, PosisiID=excluded.PosisiID, Gender=excluded.Gender, Bagian=excluded.Bagian, Password=excluded.Password`,
          args: [p_id, data.Nama, data.TTL, data.PosisiID, data.Gender, data.Bagian, data.Password]
        });
        return res.status(200).json({ status: 'success', message: 'Data Pasien berhasil disimpan!' });
      }
      
      if (action === 'savePasienBatch') { // Endpoint khusus import Excel
         for(let i=0; i<data.length; i++) {
             const row = data[i];
             const p_id = new Date().getTime().toString() + i; // Generate unique ID
             await client.execute({
               sql: `INSERT INTO pasien (ID_Pasien, Nama, TTL, PosisiID, Gender, Bagian, Password) VALUES (?, ?, ?, ?, ?, ?, ?)`,
               args: [p_id, row.Nama, row.TTL, row.PosisiID, row.Gender, row.Bagian, row.Password]
             });
         }
         return res.status(200).json({ status: 'success', message: 'Batch Data Pasien berhasil disimpan!' });
      }

      if (action === 'saveMCU') {
        const mcu_id = data.ID || new Date().getTime().toString();
        // Generate Keys and Values dynamically
        data.ID = mcu_id;
        const keys = Object.keys(data);
        const placeholders = keys.map(() => '?').join(', ');
        const updates = keys.map(k => `${k}=excluded.${k}`).join(', ');
        
        await client.execute({
          sql: `INSERT INTO mcu (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(ID) DO UPDATE SET ${updates}`,
          args: Object.values(data)
        });
        return res.status(200).json({ status: 'success', message: 'Data MCU berhasil disimpan!' });
      }

      if (action === 'deletePasien') {
        await client.execute({ sql: 'DELETE FROM pasien WHERE ID_Pasien = ?', args: [id] });
        return res.status(200).json({ status: 'success', message: 'Data Pasien berhasil dihapus!' });
      }

      if (action === 'deleteMCU') {
        await client.execute({ sql: 'DELETE FROM mcu WHERE ID = ?', args: [id] });
        return res.status(200).json({ status: 'success', message: 'Data MCU berhasil dihapus!' });
      }
      
      return res.status(400).json({ status: 'error', message: 'Aksi POST tidak valid' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
}
