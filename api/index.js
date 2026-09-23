import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDB() {
  try {
    await client.batch([
      "CREATE TABLE IF NOT EXISTS akun (role TEXT, username TEXT, password TEXT)",
      "CREATE TABLE IF NOT EXISTS dokter (ID INTEGER PRIMARY KEY AUTOINCREMENT, Nama TEXT, NIP TEXT)",
      "CREATE TABLE IF NOT EXISTS pasien (ID_Pasien TEXT PRIMARY KEY, Nama TEXT, TempatLahir TEXT, TglLahir TEXT, PosisiID TEXT, Gender TEXT, Bagian TEXT, Password TEXT)",
      "CREATE TABLE IF NOT EXISTS mcu (ID TEXT PRIMARY KEY, NoPeriksa TEXT, TglPeriksa TEXT, Nama TEXT, TempatLahir TEXT, TglLahir TEXT, PosisiID TEXT, Gender TEXT, Bagian TEXT, Kebersihan TEXT, KepalaMuka TEXT, Keluhan TEXT, RPenyakit TEXT, RKeluarga TEXT, RAlergi TEXT, TB TEXT, BB TEXT, IMT TEXT, Tensi TEXT, Nadi TEXT, Suhu TEXT, Icterus TEXT, Anemis TEXT, Cyanosis TEXT, ButaWarna TEXT, VisusTanpaKa TEXT, VisusTanpaKi TEXT, VisusKacaKa TEXT, VisusKacaKi TEXT, JulingKa TEXT, JulingKi TEXT, RadangKa TEXT, RadangKi TEXT, TelingaDengarKa TEXT, TelingaDengarKi TEXT, TelingaLiangKa TEXT, TelingaLiangKi TEXT, Gigi TEXT, Lidah TEXT, Tongsil TEXT, Leher TEXT, Nafas TEXT, AbdLingkar TEXT, AbdPeristaltik TEXT, Genetalia TEXT, Kulit TEXT, Tulang TEXT, ExtAtas TEXT, ExtBawah TEXT, Radiologi TEXT, EKG TEXT, Lab_Hb TEXT, Lab_Ht TEXT, Lab_Eritrosit TEXT, Lab_Trombosit TEXT, Lab_Lekosit TEXT, Lab_JenisLekosit TEXT, Lab_LED TEXT, Uri_pH TEXT, Uri_BJ TEXT, Uri_Protein TEXT, Uri_Glukosa TEXT, Uri_Bilirubin TEXT, Uri_Urobilinogen TEXT, Uri_Keton TEXT, Uri_Nitrit TEXT, Uri_Lekosit TEXT, Uri_Eritrosit TEXT, Sed_Eritrosit TEXT, Sed_Lekosit TEXT, Sed_Epitel TEXT, Sed_Kristal TEXT, Sed_Silinder TEXT, Sed_Lain TEXT, Mikro_BTA TEXT, Mikro_MH TEXT, Kim_GDP TEXT, Kim_GD2PP TEXT, Kim_GDA TEXT, Lemak_Chol TEXT, Lemak_Trig TEXT, Lemak_HDL TEXT, Lemak_LDL TEXT, Hati_SGOT TEXT, Hati_SGPT TEXT, Ginjal_Ureum TEXT, Ginjal_Kreatinin TEXT, Ginjal_AsamUrat TEXT, Sero_Hamil TEXT, Sero_GolDarah TEXT, Widal_TyphiO TEXT, Widal_TyphiH TEXT, Widal_ParaA TEXT, Widal_ParaB TEXT, Sero_HBsAg TEXT, Sero_Syphilis TEXT, Sero_HIV TEXT, Sero_HBsAb TEXT, Diagnosa TEXT, Kesimpulan TEXT, Saran TEXT, NamaDokter TEXT, NipDokter TEXT)"
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
    await initDB(); 

    if (req.method === 'GET') {
      const { action } = req.query;
      
      if (action === 'readAll') {
        const [mcuRes, pasienRes, dokterRes] = await Promise.all([
           client.execute('SELECT * FROM mcu'), client.execute('SELECT * FROM pasien'), client.execute('SELECT * FROM dokter')
        ]);
        return res.status(200).json({ status: 'success', data: { mcu: mcuRes.rows, pasien: pasienRes.rows, dokter: dokterRes.rows } });
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
          // Hanya kembalikan status login, JANGAN menyertakan seluruh data (dbData) di sini
          return res.status(200).json({ 
            status: 'success', name: userData.name, role: userData.role, id: userData.id
          });
        }
        return res.status(200).json({ status: 'error', message: 'Username atau Password salah!' });
      }

     if (action === 'savePasienBatch') {
         for(let i=0; i<data.length; i++) {
             const row = data[i];
             // Gunakan ID dari Excel jika diisi, jika kosong buat ID otomatis
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
