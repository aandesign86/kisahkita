const SPREADSHEET_ID = 'MASUKKAN_ID_SPREADSHEET_ANDA';
const SECRET_SALT = 'GANTI_KUNCI_RAHASIA_INI_2026';

function doGet(e) {
  try {
    const action = (e.parameter.action || '').trim();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    ensureSetup_(ss);

    if (action === 'getCatalog') {
      const rows = getRows_(ss, 'Templates').filter(t => String(t.status).toLowerCase() === 'aktif');
      return jsonOut_({ status: 'success', data: rows });
    }

    if (action === 'getInvitation') {
      const slug = sanitizeSlug_(e.parameter.slug || '');
      if (!slug) return jsonOut_({ status: 'error', message: 'Slug undangan kosong' });

      const order = getRows_(ss, 'Orders').find(o => sanitizeSlug_(o.slug_undangan) === slug);
      if (!order) return jsonOut_({ status: 'error', message: 'Undangan tidak ditemukan' });
      if (String(order.status_bayar).toLowerCase() !== 'lunas') {
        return jsonOut_({ status: 'error', message: 'Undangan menunggu aktivasi / konfirmasi pembayaran' });
      }

      const tpl = getRows_(ss, 'Templates').find(t => String(t.template_id) === String(order.template_id));
      const inv = getRows_(ss, 'Invitations_Data').find(r => sanitizeSlug_(r.slug_undangan) === slug) || {};

      return jsonOut_({
        status: 'success',
        data: {
          slug: order.slug_undangan,
          template_id: order.template_id,
          folder_path: tpl ? tpl.file_path : 'template-biru-marmer',
          invitation: safeParse_(inv.json_data, {}),
          ucapan: safeParse_(inv.ucapan_json, [])
        }
      });
    }

    return jsonOut_({ status: 'error', message: 'Endpoint GET tidak dikenali' });
  } catch (err) {
    return jsonOut_({ status: 'error', message: err.message });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const action = (payload.action || '').trim();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    ensureSetup_(ss);

    if (action === 'register') {
      const nama = (payload.nama || '').trim();
      const email = (payload.email || '').trim().toLowerCase();
      const password = String(payload.password || '');
      if (!nama || !email || password.length < 6) {
        return jsonOut_({ status: 'error', message: 'Lengkapi data dengan password minimal 6 karakter' });
      }
      const exists = getRows_(ss, 'Users').some(u => String(u.email).toLowerCase() === email);
      if (exists) return jsonOut_({ status: 'error', message: 'Email sudah terdaftar' });

      ss.getSheetByName('Users').appendRow([
        'USR-' + Date.now(),
        nama,
        email,
        hashPassword_(password),
        'user',
        'aktif',
        new Date().toISOString()
      ]);
      return jsonOut_({ status: 'success', message: 'Akun berhasil dibuat' });
    }

    if (action === 'login') {
      const email = (payload.email || '').trim().toLowerCase();
      const password = String(payload.password || '');
      const user = getRows_(ss, 'Users').find(u => String(u.email).toLowerCase() === email);

      if (!user || String(user.status).toLowerCase() !== 'aktif') {
        return jsonOut_({ status: 'error', message: 'Akun tidak ditemukan atau nonaktif' });
      }
      if (String(user.password_hash) !== hashPassword_(password)) {
        return jsonOut_({ status: 'error', message: 'Email atau password salah' });
      }

      return jsonOut_({
        status: 'success',
        data: {
          token: issueToken_(user),
          user_id: user.user_id,
          nama: user.nama,
          email: user.email,
          role: String(user.role).toLowerCase()
        }
      });
    }

    if (action === 'addUcapan') {
      const slug = sanitizeSlug_(payload.slug_undangan || '');
      const invSheet = ss.getSheetByName('Invitations_Data');
      const rows = getRows_(ss, 'Invitations_Data');
      const found = rows.find(r => sanitizeSlug_(r.slug_undangan) === slug);
      if (!found) return jsonOut_({ status: 'error', message: 'Undangan tidak ditemukan' });

      const list = safeParse_(found.ucapan_json, []);
      list.unshift({
        nama: String(payload.nama || 'Tamu').slice(0, 80),
        hadir: String(payload.hadir || 'Hadir').slice(0, 30),
        pesan: String(payload.pesan || '').slice(0, 500),
        waktu: new Date().toISOString().slice(0, 10)
      });
      updateByKey_(invSheet, 'slug_undangan', slug, { ucapan_json: JSON.stringify(list) });
      return jsonOut_({ status: 'success', message: 'Ucapan terkirim' });
    }

    // Proteksi Token
    const auth = verifyToken_(payload.token);
    if (!auth.valid) return jsonOut_({ status: 'error', message: 'Sesi berakhir, silakan login ulang' });

    if (action === 'getMyDashboard') {
      const orders = getRows_(ss, 'Orders').filter(o => String(o.user_id) === String(auth.user_id));
      const invs = getRows_(ss, 'Invitations_Data');
      const tpls = getRows_(ss, 'Templates');

      const data = orders.map(o => {
        const inv = invs.find(r => sanitizeSlug_(r.slug_undangan) === sanitizeSlug_(o.slug_undangan)) || {};
        const tpl = tpls.find(t => String(t.template_id) === String(o.template_id)) || {};
        return {
          ...o,
          nama_template: tpl.nama_template || o.template_id,
          folder_path: tpl.file_path || 'template-biru-marmer',
          invitation_data: safeParse_(inv.json_data, {}),
          ucapan: safeParse_(inv.ucapan_json, [])
        };
      });
      return jsonOut_({ status: 'success', data });
    }

    if (action === 'createOrder') {
      const templateId = String(payload.template_id || '').trim();
      const slug = sanitizeSlug_(payload.slug_undangan || '');
      if (!templateId || !slug) return jsonOut_({ status: 'error', message: 'Template dan slug wajib diisi' });

      const exists = getRows_(ss, 'Orders').some(o => sanitizeSlug_(o.slug_undangan) === slug);
      if (exists) return jsonOut_({ status: 'error', message: 'Slug sudah digunakan pelanggan lain' });

      ss.getSheetByName('Orders').appendRow([
        'ORD-' + Date.now(),
        auth.user_id,
        templateId,
        slug,
        'pending',
        '',
        new Date().toISOString()
      ]);
      ss.getSheetByName('Invitations_Data').appendRow([
        slug,
        templateId,
        JSON.stringify({}),
        JSON.stringify([])
      ]);
      return jsonOut_({ status: 'success', message: 'Pesanan berhasil dibuat' });
    }

    if (action === 'saveInvitation') {
      const slug = sanitizeSlug_(payload.slug_undangan || '');
      const order = getRows_(ss, 'Orders').find(o => sanitizeSlug_(o.slug_undangan) === slug);
      if (!order) return jsonOut_({ status: 'error', message: 'Pesanan tidak ditemukan' });
      if (auth.role !== 'admin' && String(order.user_id) !== String(auth.user_id)) {
        return jsonOut_({ status: 'error', message: 'Akses ditolak' });
      }
      updateByKey_(ss.getSheetByName('Invitations_Data'), 'slug_undangan', slug, {
        json_data: JSON.stringify(payload.json_data || {})
      });
      return jsonOut_({ status: 'success', message: 'Konten undangan tersimpan' });
    }

    // Khusus Admin
    if (action === 'adminOverview') {
      if (auth.role !== 'admin') return jsonOut_({ status: 'error', message: 'Akses khusus admin' });
      return jsonOut_({
        status: 'success',
        data: {
          orders: getRows_(ss, 'Orders'),
          templates: getRows_(ss, 'Templates'),
          users: getRows_(ss, 'Users').map(u => ({
            user_id: u.user_id, nama: u.nama, email: u.email, role: u.role, status: u.status
          }))
        }
      });
    }

    if (action === 'approveOrder') {
      if (auth.role !== 'admin') return jsonOut_({ status: 'error', message: 'Akses khusus admin' });
      updateByKey_(ss.getSheetByName('Orders'), 'order_id', payload.order_id, {
        status_bayar: payload.status_bayar || 'lunas'
      });
      return jsonOut_({ status: 'success', message: 'Status pembayaran diperbarui' });
    }

    if (action === 'saveTemplate') {
      if (auth.role !== 'admin') return jsonOut_({ status: 'error', message: 'Akses khusus admin' });
      ss.getSheetByName('Templates').appendRow([
        'TPL-' + Date.now(),
        payload.nama_template,
        payload.kategori || 'Modern',
        Number(payload.harga || 99000),
        payload.thumbnail_url || '',
        '',
        payload.file_path || 'template-biru-marmer',
        payload.status || 'aktif'
      ]);
      return jsonOut_({ status: 'success', message: 'Template berhasil ditambahkan' });
    }

    return jsonOut_({ status: 'error', message: 'Action POST tidak dikenal' });
  } catch (err) {
    return jsonOut_({ status: 'error', message: err.message });
  }
}

function ensureSetup_(ss) {
  const schemas = {
    Users: ['user_id', 'nama', 'email', 'password_hash', 'role', 'status', 'created_at'],
    Templates: ['template_id', 'nama_template', 'kategori', 'harga', 'thumbnail_url', 'demo_url', 'file_path', 'status'],
    Orders: ['order_id', 'user_id', 'template_id', 'slug_undangan', 'status_bayar', 'expired_date', 'created_at'],
    Invitations_Data: ['slug_undangan', 'template_id', 'json_data', 'ucapan_json']
  };
  Object.entries(schemas).forEach(([name, cols]) => {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.appendRow(cols);
    } else if (sh.getLastRow() === 0) {
      sh.appendRow(cols);
    }
  });

  // Seed akun admin & 1 katalog awal jika kosong
  const usersSh = ss.getSheetByName('Users');
  if (usersSh.getLastRow() === 1) {
    usersSh.appendRow(['ADM-01', 'Admin Utama', 'admin@kisahkita.id', hashPassword_('admin123'), 'admin', 'aktif', new Date().toISOString()]);
  }
  const tplSh = ss.getSheetByName('Templates');
  if (tplSh.getLastRow() === 1) {
    tplSh.appendRow([
      'TPL-01', 'Royal Blue Marble', 'Modern', 99000,
      'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
      '', 'template-biru-marmer', 'aktif'
    ]);
  }
}

function issueToken_(user) {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const body = Utilities.base64EncodeWebSafe(JSON.stringify({ user_id: user.user_id, role: String(user.role).toLowerCase(), exp }));
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, SECRET_SALT));
  return body + '.' + sig;
}

function verifyToken_(token) {
  try {
    if (!token || !token.includes('.')) return { valid: false };
    const [body, sig] = token.split('.');
    const expected = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, SECRET_SALT));
    if (sig !== expected) return { valid: false };
    const data = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(body)).getDataAsString());
    if (!data.exp || Date.now() > data.exp) return { valid: false };
    return { valid: true, user_id: data.user_id, role: data.role };
  } catch (e) {
    return { valid: false };
  }
}

function hashPassword_(pw) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pw + ':' + SECRET_SALT);
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function sanitizeSlug_(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function safeParse_(str, fb) {
  try { return str ? JSON.parse(str) : fb; } catch (e) { return fb; }
}

function getRows_(ss, name) {
  const vals = ss.getSheetByName(name).getDataRange().getValues();
  if (vals.length < 2) return [];
  const headers = vals[0].map(h => String(h).trim());
  return vals.slice(1).filter(r => r.some(c => c !== '')).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i]; });
    return obj;
  });
}

function updateByKey_(sheet, keyCol, keyVal, updates) {
  const vals = sheet.getDataRange().getValues();
  if (vals.length < 2) return;
  const headers = vals[0].map(h => String(h).trim());
  const kIdx = headers.indexOf(keyCol);
  if (kIdx === -1) return;
  for (let r = 1; r < vals.length; r++) {
    if (String(vals[r][kIdx]) === String(keyVal)) {
      Object.entries(updates).forEach(([col, val]) => {
        const cIdx = headers.indexOf(col);
        if (cIdx !== -1) sheet.getRange(r + 1, cIdx + 1).setValue(val);
      });
      break;
    }
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
