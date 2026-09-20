import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Fungsi untuk Auto-Create Table jika belum ada
async function initDB() {
  try {
    await client.batch([
      "CREATE TABLE IF NOT EXISTS akun (role TEXT, username TEXT, password TEXT)",
      "CREATE TABLE IF NOT EXISTS dokter (ID INTEGER PRIMARY KEY AUTOINCREMENT, Nama TEXT, NIP TEXT)",
      "CREATE TABLE IF NOT EXISTS pasien (ID_Pasien TEXT PRIMARY KEY, Nama TEXT, TTL TEXT, PosisiID TEXT, Gender TEXT, Bagian TEXT, Password TEXT)",
      "CREATE TABLE IF NOT EXISTS mcu (ID TEXT PRIMARY KEY, NoPeriksa TEXT, TglPeriksa TEXT, Nama TEXT, TTL TEXT, PosisiID TEXT, Gender TEXT, Bagian TEXT, Kebersihan TEXT, KepalaMuka TEXT, Keluhan TEXT, RPenyakit TEXT, RKeluarga TEXT, RAlergi TEXT, TB TEXT, BB TEXT, IMT TEXT, Tensi TEXT, Nadi TEXT, Suhu TEXT, Icterus TEXT, Anemis TEXT, Cyanosis TEXT, ButaWarna TEXT, VisusTanpaKa TEXT, VisusTanpaKi TEXT, VisusKacaKa TEXT, VisusKacaKi TEXT, JulingKa TEXT, JulingKi TEXT, RadangKa TEXT, RadangKi TEXT, TelingaDengarKa TEXT, TelingaDengarKi TEXT, TelingaLiangKa TEXT, TelingaLiangKi TEXT, Gigi TEXT, Lidah TEXT, Tongsil TEXT, Leher TEXT, Nafas TEXT, AbdLingkar TEXT, AbdPeristaltik TEXT, Genetalia TEXT, Kulit TEXT, Tulang TEXT, ExtAtas TEXT, ExtBawah TEXT, Radiologi TEXT, EKG TEXT, Lab_Hb TEXT, Lab_Ht TEXT, Lab_Eritrosit TEXT, Lab_Trombosit TEXT, Lab_Lekosit TEXT, Lab_JenisLekosit TEXT, Lab_LED TEXT, Uri_pH TEXT, Uri_BJ TEXT, Uri_Protein TEXT, Uri_Glukosa TEXT, Uri_Bilirubin TEXT, Uri_Urobilinogen TEXT, Uri_Keton TEXT, Uri_Nitrit TEXT, Uri_Lekosit TEXT, Uri_Eritrosit TEXT, Sed_Eritrosit TEXT, Sed_Lekosit TEXT, Sed_Epitel TEXT, Sed_Kristal TEXT, Sed_Silinder TEXT, Sed_Lain TEXT, Mikro_BTA TEXT, Mikro_MH TEXT, Kim_GDP TEXT, Kim_GD2PP TEXT, Kim_GDA TEXT, Lemak_Chol TEXT, Lemak_Trig TEXT, Lemak_HDL TEXT, Lemak_LDL TEXT, Hati_SGOT TEXT, Hati_SGPT TEXT, Ginjal_Ureum TEXT, Ginjal_Kreatinin TEXT, Ginjal_AsamUrat TEXT, Sero_Hamil TEXT, Sero_GolDarah TEXT, Widal_TyphiO TEXT, Widal_TyphiH TEXT, Widal_ParaA TEXT, Widal_ParaB TEXT, Sero_HBsAg TEXT, Sero_Syphilis TEXT, Sero_HIV TEXT, Sero_HBsAb TEXT, Diagnosa TEXT, Kesimpulan TEXT, Saran TEXT, NamaDokter TEXT, NipDokter TEXT)"
    ]);

    const checkAkun = await client.execute("SELECT * FROM akun LIMIT 1");
    if(checkAkun.rows.length === 0) {
       await client.batch([
          "INSERT INTO akun (role, username, password) VALUES ('Admin', 'admin', 'admin123')",
          "INSERT INTO akun (role, username, password) VALUES ('Petugas', 'petugas', 'petugas123')",
          "INSERT INTO dokter (Nama, NIP) VALUES ('Dr. Budi Santoso', '198001012005011001')"
       ]);
    }
  } catch(e) { console.error("DB Init Error: ", e); }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await initDB(); // Pastikan tabel selalu ada sebelum diakses

    if (req.method === 'GET') {
      const { action } = req.query;
      
      // ENDPOINT BARU: Tarik semua data sekaligus agar loading 3x lebih cepat
      if (action === 'readAll') {
        const [mcuRes, pasienRes, dokterRes] = await Promise.all([
           client.execute('SELECT * FROM mcu'),
           client.execute('SELECT * FROM pasien'),
           client.execute('SELECT * FROM dokter')
        ]);
        const mappedPasien = pasienRes.rows.map(r => ({
          ID_Pasien: r.ID_Pasien, Nama: r.Nama, 'Tempat/Tgl Lahir': r.TTL,
          'Posisi/ID': r.PosisiID, Gender: r.Gender, Bagian: r.Bagian, Password: r.Password
        }));
        return res.status(200).json({ status: 'success', data: { mcu: mcuRes.rows, pasien: mappedPasien, dokter: dokterRes.rows } });
      }
      
      if (action === 'readMCU') {
        const result = await client.execute('SELECT * FROM mcu');
        return res.status(200).json({ status: 'success', data: result.rows });
      } 
      else if (action === 'readPasien') {
        const result = await client.execute('SELECT * FROM pasien');
        const mappedData = result.rows.map(r => ({
          ID_Pasien: r.ID_Pasien, Nama: r.Nama, 'Tempat/Tgl Lahir': r.TTL,
          'Posisi/ID': r.PosisiID, Gender: r.Gender, Bagian: r.Bagian, Password: r.Password
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
          const result = await client.execute({ sql: 'SELECT * FROM akun WHERE role = ? AND username = ? AND password = ?', args: [role, user, pass] });
          if (result.rows.length > 0) return res.status(200).json({ status: 'success', name: user, role: role });
          return res.status(200).json({ status: 'error', message: 'Username atau Password salah!' });
        } else if (role === 'Pasien') {
          const result = await client.execute({ sql: 'SELECT * FROM pasien WHERE LOWER(Nama) = LOWER(?) AND Password = ?', args: [user, pass] });
          if (result.rows.length > 0) return res.status(200).json({ status: 'success', name: result.rows[0].Nama, id: result.rows[0].ID_Pasien, role: role });
          return res.status(200).json({ status: 'error', message: 'Akun Pasien tidak ditemukan / Password salah!' });
        }
      }

      if (action === 'savePasien') {
        const p_id = data.ID_Pasien || new Date().getTime().toString();
        await client.execute({
          sql: `INSERT INTO pasien (ID_Pasien, Nama, TTL, PosisiID, Gender, Bagian, Password) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(ID_Pasien) DO UPDATE SET Nama=excluded.Nama, TTL=excluded.TTL, PosisiID=excluded.PosisiID, Gender=excluded.Gender, Bagian=excluded.Bagian, Password=excluded.Password`,
          args: [p_id, data.Nama, data.TTL, data.PosisiID, data.Gender, data.Bagian, data.Password]
        });
        return res.status(200).json({ status: 'success', message: 'Data Pasien berhasil disimpan!' });
      }
      
      if (action === 'savePasienBatch') {
         for(let i=0; i<data.length; i++) {
             const row = data[i];
             const p_id = new Date().getTime().toString() + i;
             await client.execute({ sql: `INSERT INTO pasien (ID_Pasien, Nama, TTL, PosisiID, Gender, Bagian, Password) VALUES (?, ?, ?, ?, ?, ?, ?)`, args: [p_id, row.Nama, row.TTL, row.PosisiID, row.Gender, row.Bagian, row.Password] });
         }
         return res.status(200).json({ status: 'success', message: 'Batch Data Pasien berhasil disimpan!' });
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
    console.error(error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
}
