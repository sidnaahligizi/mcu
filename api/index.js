// Kembalikan ke import standar agar login berhasil
import { createClient } from '@libsql/client/web';

const client = createClient({
  // KUNCI: Vercel Env Var untuk URL ini WAJIB menggunakan awalan https://
  url: process.env.TURSO_DATABASE_URL, 
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { action } = req.query;
      
      if (action === 'readAll') {
        // Menggunakan batch untuk menarik 3 tabel dalam 1x request HTTP
        const results = await client.batch([
          'SELECT * FROM mcu',
          'SELECT * FROM pasien',
          'SELECT * FROM dokter'
        ]);
        
        return res.status(200).json({ 
          status: 'success', 
          data: { 
            mcu: results[0].rows || [], 
            pasien: results[1].rows || [], 
            dokter: results[2].rows || [] 
          } 
        });
      }
      return res.status(400).json({ status: 'error', message: 'Aksi GET tidak valid' });
    }

    if (req.method === 'POST') {
      const { action, data, role, user, pass, id } = req.body;

      if (action === 'login') {
        let isAuthenticated = false;
        let userData = {};

        if (role === 'Admin' || role === 'Petugas') {
          const result = await client.execute({ sql: 'SELECT * FROM akun WHERE role = ? AND username = ? AND password = ?', args: [role, user, pass] });
          if (result.rows.length > 0) { isAuthenticated = true; userData = { name: user, role: role, id: 'admin' }; }
        } else if (role === 'Pasien') {
          const result = await client.execute({ sql: 'SELECT * FROM pasien WHERE LOWER(Nama) = LOWER(?) AND Password = ?', args: [user, pass] });
          if (result.rows.length > 0) { isAuthenticated = true; userData = { name: result.rows[0].Nama, role: role, id: result.rows[0].ID_Pasien }; }
        }

        if (isAuthenticated) {
          return res.status(200).json({ status: 'success', name: userData.name, role: userData.role, id: userData.id });
        }
        return res.status(200).json({ status: 'error', message: 'Username atau Password salah!' });
      }

      if (action === 'savePasienBatch') {
         for(let i=0; i<data.length; i++) {
             const row = data[i];
             const p_id = row.ID_Pasien ? row.ID_Pasien.toString() : (new Date().getTime().toString() + i);
             
             await client.execute({ 
                 sql: `INSERT INTO pasien (ID_Pasien, Nama, TempatLahir, TglLahir, PosisiID, Gender, Bagian, Password) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
                       ON CONFLICT(ID_Pasien) DO UPDATE SET 
                       Nama=excluded.Nama, TempatLahir=excluded.TempatLahir, TglLahir=excluded.TglLahir, PosisiID=excluded.PosisiID, Gender=excluded.Gender, Bagian=excluded.Bagian, Password=excluded.Password`, 
                 args: [p_id, row.Nama, row.TempatLahir, row.TglLahir, row.PosisiID, row.Gender, row.Bagian, row.Password] 
             });
         }
         return res.status(200).json({ status: 'success', message: 'Batch Data Pasien berhasil disimpan & diupdate!' });
      }

      if (action === 'saveMCU') {
        const mcu_id = data.ID || new Date().getTime().toString();
        data.ID = mcu_id;
        const keys = Object.keys(data);
        const placeholders = keys.map(() => '?').join(', ');
        const updates = keys.map(k => `${k}=excluded.${k}`).join(', ');
        
        await client.execute({ sql: `INSERT INTO mcu (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(ID) DO UPDATE SET ${updates}`, args: Object.values(data) });
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
    return res.status(500).json({ status: 'error', message: error.message });
  }
}
