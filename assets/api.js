const KisahAPI = {
  getBaseUrl() {
    return (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
  },

  isConfigured() {
    const url = this.getBaseUrl();
    return url && !url.includes('NAMA-WORKER-ANDA');
  },

  getSession() {
    try {
      return JSON.parse(localStorage.getItem('kisah_session') || 'null');
    } catch (e) {
      return null;
    }
  },

  setSession(session) {
    localStorage.setItem('kisah_session', JSON.stringify(session));
  },

  clearSession() {
    localStorage.removeItem('kisah_session');
  },

  requireAuth(requiredRole = null) {
    const session = this.getSession();
    if (!session || !session.token) {
      window.location.href = 'login.html';
      return null;
    }
    if (requiredRole && session.role !== requiredRole) {
      window.location.href = session.role === 'admin' ? 'admin.html' : 'dashboard.html';
      return null;
    }
    return session;
  },

  formatRupiah(angka) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(Number(angka || 0));
  },

  async get(params = {}) {
    if (!this.isConfigured()) {
      return this._demoFallbackGet(params);
    }
    const url = new URL(this.getBaseUrl());
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
    const res = await fetch(url.toString(), { method: 'GET' });
    return res.json();
  },

  async post(action, data = {}) {
    if (!this.isConfigured()) {
      return this._demoFallbackPost(action, data);
    }
    const session = this.getSession();
    const res = await fetch(this.getBaseUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        token: session ? session.token : '',
        ...data
      })
    });
    return res.json();
  },

  // Fallback otomatis agar preview lokal tetap jalan sebelum Worker/GAS diisi
  _demoFallbackGet(params) {
    if (params.action === 'getCatalog') {
      return Promise.resolve({
        status: 'success',
        data: [
          {
            template_id: 'TPL-01',
            nama_template: 'Royal Blue Marble',
            kategori: 'Modern',
            harga: 99000,
            thumbnail_url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
            file_path: 'template-biru-marmer',
            status: 'aktif'
          },
          {
            template_id: 'TPL-02',
            nama_template: 'Gold Classic Javanese',
            kategori: 'Adat',
            harga: 129000,
            thumbnail_url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=800&q=80',
            file_path: 'template-biru-marmer',
            status: 'aktif'
          },
          {
            template_id: 'TPL-03',
            nama_template: 'Minimalist Sage White',
            kategori: 'Minimalis',
            harga: 79000,
            thumbnail_url: 'https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=800&q=80',
            file_path: 'template-biru-marmer',
            status: 'aktif'
          }
        ]
      });
    }
    if (params.action === 'getInvitation') {
      return Promise.resolve({
        status: 'success',
        data: {
          slug: params.slug || 'demo-undangan',
          template_id: 'TPL-01',
          folder_path: 'template-biru-marmer',
          invitation: {
            pria_panggilan: 'Raka',
            pria_lengkap: 'Raka Pratama, S.Kom.',
            pria_ortu: 'Putra Bpk. Hendra & Ibu Sari',
            wanita_panggilan: 'Nadia',
            wanita_lengkap: 'Nadia Putri Lestari, S.E.',
            wanita_ortu: 'Putri Bpk. Ahmad & Ibu Ratna',
            tanggal_acara: '2026-12-20',
            waktu_akad: '08.00 - 10.00 WIB',
            waktu_resepsi: '11.00 - 14.00 WIB',
            tempat_nama: 'Grand Ballroom Hotel Mulia',
            tempat_alamat: 'Jl. Asia Afrika No. 8, Jakarta Pusat',
            maps_url: 'https://maps.google.com',
            cerita: 'Berawal dari pertemuan sederhana di bangku kuliah hingga akhirnya memantapkan hati membangun keluarga bersama.',
            bank_nama: 'BCA',
            bank_norek: '1234567890',
            bank_an: 'Raka Pratama',
            foto_cover: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=900&q=80',
            foto_pria: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=500&q=80',
            foto_wanita: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=500&q=80'
          },
          ucapan: [
            { nama: 'Budi Santoso', hadir: 'Hadir', pesan: 'Selamat menempuh hidup baru Raka & Nadia!', waktu: '2026-11-18' }
          ]
        }
      });
    }
    return Promise.resolve({ status: 'error', message: 'Mode demo: API_URL belum diatur di config.js' });
  },

  _demoFallbackPost(action, data) {
    if (action === 'login') {
      const isAdmin = String(data.email || '').includes('admin');
      return Promise.resolve({
        status: 'success',
        data: {
          token: 'demo-token-' + Date.now(),
          user_id: isAdmin ? 'ADM-01' : 'USR-01',
          nama: isAdmin ? 'Admin KisahKita' : 'Pelanggan Demo',
          email: data.email,
          role: isAdmin ? 'admin' : 'user'
        }
      });
    }
    return Promise.resolve({ status: 'error', message: 'Isi API_URL di config.js untuk menyimpan data ke database.' });
  }
};
