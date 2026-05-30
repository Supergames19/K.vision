// Baris 1 di index.js Anda
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    delay, 
    downloadContentFromMessage // Tambahkan ini di sini
} = require('@whiskeysockets/baileys');

const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ================= [ KONFIGURASI ] =================
const adminNumbers = ['6282367136420@s.whatsapp.net'];
const GEMINI_API_KEY = 'AIzaSyApdgJGcB--vxd-9tnnMie2W3vbMQpCwwU'; 
// ===================================================

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const chatMemory = {};
const offlineResponded = {}; // <--- Tambahkan ini untuk melacak status pesan offline
const spamTracker = {}; // [TAMBAHKAN INI] Untuk menghitung jumlah ping

// Tambahkan nomor yang ingin diabaikan di sini (Gunakan format @s.whatsapp.net)
const excludedNumbers = [
    '6281362917625@s.whatsapp.net',
    '6285264379161@s.whatsapp.net',
    '628126227155@s.whatsapp.net',
    '628116233888@s.whatsapp.net',
    '6282272147613@s.whatsapp.net',
    '6285275753004@s.whatsapp.net',
    '6281362488364@s.whatsapp.net',
    '6282168402348@s.whatsapp.net',
    '6285261880406@s.whatsapp.net',
    '6282267551369@s.whatsapp.net',
    '6282272111133@s.whatsapp.net',
    '6281376985858@s.whatsapp.net',
    '628118500828@s.whatsapp.net',
    '628@s.whatsapp.net',
    '628@s.whatsapp.net'
]; 


async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ['Mac OS', 'Chrome', '114.0.5735.199'],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: false // [TAMBAHKAN INI] Agar HP tetap bunyi
    });

    const sendTyping = async (jid, ms) => {
        await sock.sendPresenceUpdate('composing', jid);
        await delay(ms);
        await sock.sendPresenceUpdate('paused', jid);
    };

     async function bufferToGenerativePart(buffer, mimeType) {
    return {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType
        },
    };
}

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
           console.clear();
            console.log('⚠️ SCAN SEGERA (QR AKTIF 30 DETIK):');
            qrcode.generate(qr, { small: true });
        }

           if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();

           } else if (connection === 'open') {
            console.clear();
            console.log('✅ KONEKSI BERHASIL! Bot Teknisi SG KOMPUTER Online.');
        }
    });



      sock.ev.on('messages.upsert', async ({ messages }) => {
         const msg = messages[0];

          const sender = msg.key.remoteJid;

         // Cara paling aman membersihkan JID: ambil angka depannya saja, lalu pasang kembali domainnya
         // Contoh: 62812345:1@s.whatsapp.net -> 62812345@s.whatsapp.net
          const senderNumber = sender.split('@')[0].split(':')[0] + '@s.whatsapp.net';

          // Jika Anda (Admin) mengirim pesan, reset hitungan spam untuk orang tersebut
          if (msg.key.fromMe) {
              spamTracker[senderNumber] = 0;
              return;
          }

         // Validasi Dasar
         if (!msg.message || msg.key.fromMe);


         // Cek Pengecualian Nomor (Blacklist)
          if (excludedNumbers.includes(senderNumber)) {
              console.log(`[!] Nomor ${senderNumber} ada di pengecualian. Bot diam.`);
              return; // Bot berhenti di sini, tidak akan membalas teks maupun GAMBAR
          }

          // Filter Anti-Spam (Abaikan pesan lama saat bot baru aktif)
          const messageTimestamp = typeof msg.messageTimestamp === 'number' 
              ? msg.messageTimestamp
              : msg.messageTimestamp.low;
          const currentTimestamp = Math.floor(Date.now() / 1000);
          if ((currentTimestamp - messageTimestamp) > 60) return;


          // Abaikan grup
          if (sender.endsWith('@g.us')) return; 

          // Ambil isi pesan
          const isImage = msg.message.imageMessage;
          const body = (
              msg.message.conversation || 
              msg.message.extendedTextMessage?.text || 
              isImage?.caption || ""
          ).toLowerCase().trim();



           // =========================================================
          // [FITUR] LOGIKA SPAM: PING / P (URUTAN DIPERBAIKI)
          // =========================================================
          if (body === 'p' || body === 'ping') {
              spamTracker[senderNumber] = (spamTracker[senderNumber] || 0) + 1;

              if (spamTracker[senderNumber] < 3) {
                  console.log(`[!] ${senderNumber} kirim "${body}" ke-${spamTracker[senderNumber]}. Bot diam.`);
                  return;
              } else if (spamTracker[senderNumber] === 3) {
                  let teksSpam = `✨*Mohon Bersabar Kak!*\nPesan Kakak sudah kami terima. Admin sedang melayani pelanggan lain. Pesan akan dibalas sesuai urutan ya Kak. Terima kasih! 🤖`;
                  await sock.sendMessage(sender, { text: teksSpam }, { quoted: msg });
                  return;
              } else {
                  return;
              }
          }

          // Reset hitungan jika kirim pesan bermakna
          if (body.length > 5) spamTracker[senderNumber] = 0;


        const isOwner = adminNumbers.includes(sender);

        const deletePesan = async () => {
            try { await delay(1000); await sock.sendMessage(sender, { delete: msg.key }); } catch (e) {}
        };



       // --- [CERDAS 4] AUTO-AI UNTUK KELUHAN TEKNIS (FIXED) ---
       // Logika: Jika tidak pakai titik, panjang > 10, dan ada kata kunci teknis
      if (!body.startsWith('.') && body.length > 10) {
          const technicalKeywords = ['rusak', 'cara perbaiki', 'kenapa', 'error', 'bisa benerin', 'lemot', 'mati', 'layar biru', 'blank', 'servis', 'service'];

       // Gunakan body.toLowerCase() langsung agar aman dari typo variabel
      if (technicalKeywords.some(k => body.toLowerCase().includes(k))) {
          await sendTyping(sender, 3000); // Memberi efek mengetik

       // Inisialisasi memori jika belum ada
      if (!chatMemory[sender]) {
            chatMemory[sender] = [
                { role: "user", parts: [{ text: "Anda adalah teknisi Bot di SG KOMPUTER. Anda sangat pintar memperbaiki Laptop, Printer, CCTV, dan PlayStation. Jawablah dengan ramah, teknis, dan berikan estimasi solusi." }] },
                { role: "model", parts: [{ text: "Halo! Saya Bot Teknisi ahli dari SG KOMPUTER. Ada masalah apa dengan perangkat Kakak?" }] }
            ];
        }

        try {
            const chat = model.startChat({ history: chatMemory[sender] });
            const result = await chat.sendMessage(body); 
            const response = await result.response;
            const text = response.text();

            // Simpan ke memori chat
            chatMemory[sender].push({ role: "user", parts: [{ text: body }] });
            chatMemory[sender].push({ role: "model", parts: [{ text: text }] });
            if (chatMemory[sender].length > 10) chatMemory[sender].shift(); 

            await sock.sendMessage(sender, { 
                text: "🤖 *ANALISA OTOMATIS SG KOMPUTER* \n\n" + text + "\n\n_Pesan ini dijawab otomatis oleh AI. Ketik *.ai [tanya]* untuk konsultasi mendalam._" 
            }, { quoted: msg });

            return; // Penting: Agar tidak lanjut ke auto-reply jam kerja/salam
        } catch (e) {
            console.error("Gagal menjalankan Auto-AI:", e);
        }
    }
}



     // --- ANALISA GAMBAR CERDAS (AI VISION) ---
        if (isImage) {
            try {
                await sock.sendPresenceUpdate('composing', sender);
                const stream = await downloadContentFromMessage(isImage, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

                const prompt = `Anda adalah pakar teknisi dari SG KOMPUTER yang ramah. Analisis gambar ini. Jika kerusakan perangkat, beri saran. Jika bukan, sapa dengan hangat.`;
                const imagePart = await bufferToGenerativePart(buffer, "image/jpeg");
                const result = await model.generateContent([prompt, imagePart]);
                const responseText = (await result.response).text();

                await sock.sendPresenceUpdate('paused', sender);
                await sock.sendMessage(sender, { text: `📸 *HASIL ANALISA SG KOMPUTER*\n\n${responseText}` }, { quoted: msg });

                setTimeout(async () => {
                    const linkUlasan = "https://search.google.com/local/writereview?placeid=ChIJJf5_ZwChLTARPNtPcUfiHOA";
                    await sock.sendMessage(sender, { 
                        text: `💬 *Gimana Kak, membantu nggak?*\n\nYuk kasih Bintang 5 ⭐⭐⭐⭐⭐ di Google Maps kami:\n🔗 ${linkUlasan}`,
                        contextInfo: { externalAdReply: { title: "Bantu Kami Menilai Layanan ⭐", body: "Klik rating Bintang 5", thumbnailUrl: "https://supergames19.github.io/supergames/assets/images/SG.jpeg", sourceUrl: linkUlasan, mediaType: 1 }}
                    });
                }, 3000);
            } catch (err) {
                await sock.sendMessage(sender, { text: "Baik kak, terimakasih! Admin akan segera mengecek gambar ini secara manual.🤖" });
            }
            return;
        }



          // --- DATABASE OTOMATIS FILTER (FIXED) ---
          const dbPath = './database_kontak.json';
          const statusDbPath = './database_status.json'; // Pindahkan ke baris baru agar tidak jadi komen>

          if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify([]));
          if (!fs.existsSync(statusDbPath)) fs.writeFileSync(statusDbPath, JSON.stringify({}));

          let database = JSON.parse(fs.readFileSync(dbPath));

          // Simpan kontak baru jika bukan grup
          if (sender.endsWith('@s.whatsapp.net') && !database.includes(sender)) {
              database.push(sender);
              fs.writeFileSync(dbPath, JSON.stringify(database));
              console.log("âœ… Kontak baru tersimpan otomatis.");
          }




       // Logika Waktu
        const jam = new Date().getHours();
        const menit = new Date().getMinutes();
        const waktuDesimal = jam + menit / 60;
        let sapaan = (jam >= 5 && jam < 11) ? "Selamat Pagi" : (jam >= 11 && jam < 15) ? "Selamat Siang" : (jam >= 15 && jam < 18) ? "Selamat Sore" : "Selamat Malam";

        if (jam >= 5 && jam < 11) sapaan = "Selamat Pagi";
        else if (jam >= 11 && jam < 15) sapaan = "Selamat Siang";
        else if (jam >= 15 && jam < 18) sapaan = "Selamat Sore";
        else sapaan = "Selamat Malam";

         // --- PERBAIKAN: AUTO-REPLY LUAR JAM KERJA (SEKALI SAJA) ---
       const today = new Date().toDateString(); // Contoh: "Mon Jan 19 2026"
       if ((waktuDesimal < 8.5 || waktuDesimal > 17.5) && !body.startsWith('.')) {
         // Cek apakah user ini sudah dikirimi pesan offline hari ini
       if (!offlineResponded[sender] || offlineResponded[sender] !== today) { 
        await sock.sendMessage(sender, { 
            text: `🌙 *SG KOMPUTER - OFFLINE*\n\n${sapaan} Kak! Saat ini toko kami sudah *Tutup*.\n\n⏰ *Jam Operasional:* 08.30 - 17.30 WIB.\n\nKakak bisa gunakan fitur AI dengan *Mengirimkan Gambar Kerusakan*.\nUntuk melihat layanan kami kakak bisa mengetik *.menu*\nKarena Admin akan membalas besok pagi!🤖` 
        });

        // Tandai bahwa user ini sudah menerima pesan offline untuk hari ini
        offlineResponded[sender] = today;
    }
    // Jika sudah pernah dichat hari ini, bot akan diam (return/lanjut tanpa spam)
}

        const lowerBody = body.toLowerCase();

         // --- [CERDAS 2] DETEKSI KOMPLAIN (PRIORITAS) ---
        const kataKomplain = ['kecewa', 'rusak lagi', 'komplain', 'marah', 'tidak bisa', 'error terus', 'penipu', 'kecewa'];
        if (kataKomplain.some(kata => lowerBody.includes(kata))) {
            await sock.sendMessage(sender, { 
                text: `*LAPORAN DIPRIORITASKAN*\n\nHalo Kak, kami mohon maaf atas ketidaknyamanannya. Pesan Kakak telah kami tandai sebagai *Prioritas Utama*.\n\nAdmin atau Teknisi Senior akan segera menghubungi Kakak secara manual. Mohon tunggu sebentar ya Kak.🤖™`
            });
            // Notif ke Owner
            await sock.sendMessage(adminNumbers[0], { text: `🤖*URGENT KOMPLAIN!*\nSegera Cek Whatsapp Admin\nPesan: "_${body}_"` });
            return;
        }

        const keywords = {
            salam: ['assalamualaikum', 'pagi', 'siang', 'sore', 'malam', 'permisi'],
            harga: ['harga', 'biaya', 'berapa', 'ongkos'],
            lokasi: ['lokasi', 'alamat', 'dimana', 'toko'],
            waktu: ['jam berapa', 'buka jam', 'tutup jam'],
            garansi: ['garansi', 'jaminan'],
            thanks: [`tq`, `terimakasih`, `kamsya`, `thanks`]
        };



// --- PERBAIKAN PERINTAH .info ---
if (body === '.info') { // Gunakan if biasa, jangan else if yang tersambung ke .ai
    await sock.sendPresenceUpdate('composing', sender); 

    const infoText = `📍 *LOKASI TOKO SG KOMPUTER*
━━━━━━━━━━━━━━━━━

🏢 *Alamat:*
Jln. Imam Bonjol No.19, Rantau Prapat, SUMUT.
(Dekat Pusat Kota Rantau Prapat)

⏰ *Jam Operasional:*
• Senin - Minggu: 08.30 - 17.30 WIB
• Kita Buka Trus 

🔗 *Navigasi Google Maps:*
Klik link di bawah ini untuk panduan jalan langsung ke toko kami:
https://maps.google.com/?q=SG+Komputer+Rantau+Prapat
━━━━━━━━━━━━━━━━━
*SG KOMPUTER* - _Solusi IT_`; 

    await sock.sendMessage(sender, { 
        text: infoText, 
        contextInfo: { 
            externalAdReply: { 
                title: "SG KOMPUTER - Rantau Prapat", 
                body: "Klik untuk Buka Peta Lokasi 📍", 
                thumbnailUrl: "https://supergames19.github.io/supergames/assets/images/SG.jpeg",
                sourceUrl: "https://maps.google.com/?q=SG+Komputer+Rantau+Prapat",
                mediaType: 1, 
                showAdAttribution: true, 
                renderLargerThumbnail: true 
            } 
        } 
    });
    return; // Tambahkan return agar proses berhenti di sini
}



// --- [CERDAS 3] FITUR LOKASI REALTIME (VERSI LINK PRESISI) ---
if (lowerBody === '.lokasi') {
    await sock.sendPresenceUpdate('composing', sender);
    
    // Link Google Maps Berdasarkan Alamat Resmi
    const linkMaps = "https://maps.app.goo.gl/MWuzEqCcuxEyBxfv6";

    await sock.sendMessage(sender, { 
        text: `📍 *LOKASI TOKO SG KOMPUTER*\n━━━━━━━━━━━━━━━━━━━\n\n🏠 *Alamat:* \nJl. Imam Bonjol No.19, Rantauprapat, Kec. Rantau Utara, Kab. Labuhanbatu, Sumatera Utara 21411.\n\n👇 *Klik link di bawah ini untuk navigasi langsung:* \n${linkMaps}\n\nKami tunggu kehadirannya di toko ya, Kak! ✨🤖`,
        contextInfo: {
            externalAdReply: {
                title: "Petunjuk Arah SG KOMPUTER",
                body: "Klik untuk buka di Google Maps 📍",
                thumbnailUrl: "https://supergames19.github.io/supergames/assets/images/SG.jpeg",
                sourceUrl: linkMaps,
                mediaType: 1,
                renderLargerThumbnail: true
            }
        }
    }, { quoted: msg });
    return;
}


// 1. CEK STOK (READY)
if (lowerBody.includes('ready barangnya') || lowerBody.includes('ada barangnya')) {
    let teksStok = `👋 *${sapaan} Kak!* \n\nBarang yang ada di katalog umumnya *Ready Stock*. ✅\n\nAgar lebih pasti, silakan *Kirim Foto* produk atau *Sebutkan Tipenya* ya Kak, biar Admin kita langsung cek fisik di Toko!\nAtau dengan mengetik *.katalog* 📦🤖`;
    await sock.sendMessage(sender, { text: teksStok });
    return;
}

// 2. LOKASI & ONGKIR
if (lowerBody.includes('ongkir')) {
    let teksLokasi = `📍 *LOKASI TOKO SG KOMPUTER*\n━━━━━━━━━━━━━━━━━━━\n\n🏠 *Alamat:* Jln. Imam Bonjol, Rantau Prapat.\n🚚 *Ongkir:* Mohon infokan *Alamat Lengkap* atau *Share Location* Kakak agar kami bisa bantu hitung ongkir terbaiknya! ✨🤖`;
    await sock.sendMessage(sender, { text: teksLokasi });
    return;
}

// 3. SALAM / GREETING
if (keywords.salam.some(k => lowerBody === k)) {
    let teksMenu = `👋 *${sapaan} Kak!* Selamat datang di *SG KOMPUTER*.\n_Solusi perbaikan & kebutuhan IT Anda._\n\nSilakan ketik *.menu* untuk melihat layanan lengkap kami atau kirim foto kerusakan untuk analisa cepat! 🤖`;
    await sock.sendMessage(sender, { text: teksMenu });
    return;
}

// 4. HARGA / BIAYA
if (keywords.harga.some(k => lowerBody.includes(k))) {
    let teksHarga = `💰 *INFO BIAYA/HARGA*\n━━━━━━━━━━━━━━━━━━━\n\nUntuk estimasi biaya yang akurat, mohon tunggu sebentar ya Kak. *Admin* kami akan segera membalas chat Kakak.\n\nSambil menunggu, ada keluhan lain yang bisa kami bantu? 😊🤖`;
    await sock.sendMessage(sender, { text: teksHarga });
    return;
}

// 5. JAM OPERASIONAL
if (keywords.waktu.some(k => lowerBody.includes(k))) {
    let teksJam = `⏰ *JAM OPERASIONAL SG KOMPUTER*\n━━━━━━━━━━━━━━━━━━━\n\n📅 *Senin - Sabtu* \n🕘 *08.30 - 17.30 WIB*\n\nDitunggu kedatangannya ya Kak! Jangan lupa bawa unitnya juga ya kakak, biar kita cek secara langsung (Gratis Konsultasi!). ☕`;
    await sock.sendMessage(sender, { text: teksJam });
    return;
}

// 6. GARANSI
if (keywords.garansi.some(k => lowerBody.includes(k))) {
    let teksGaransi = `🛡️ *JAMINAN GARANSI*\n━━━━━━━━━━━━━━━━━━━\n\nTenang Kak! Semua produk dan jasa servis di *SG KOMPUTER* memiliki **Garansi Resmi**. Kepuasan dan keamanan perangkat Kakak adalah prioritas utama kami! ⭐⭐⭐⭐⭐`;
    await sock.sendMessage(sender, { text: teksGaransi });
   return;
}


// 7. OK
if (lowerBody.includes('ok') || lowerBody.includes('baik')) {
    let teksOk = `*ok Baik kakak*🤖.`;
    await sock.sendMessage(sender, { text: teksOk});
    return;
}

// 8. thanks
 if (keywords.thanks.some(k => lowerBody === k)) {
let teksThanks = `👋 *${sapaan} Kak!*\n *Terimakasih kembali kakak*🤖.`;
await sock.sendMessage(sender, { text: teksThanks });
    return;
}


      // MENU UTAMA (DASHBOARD)
if (body === '.menu') {
    await sock.sendPresenceUpdate('composing', sender);

    const menu = `✨ *DASHBOARD PELAYANAN SG KOMPUTER* ✨
_Solusi Teknologi Terintegrasi & Terpercaya_

*─── 🤖 ASISTEN AI ───*

└  *.reset* ➜ Hapus Memori Chat

*── 🛒 BELANJA & LAYANAN ──*
┌  *.katalog* ➜ Katalog Produk
│  *.promo* ➜ Penawaran Menarik
│  *.app* ➜ Pembuatan Aplikasi
└  *.order* ➜ Cara Pemesanan

*─── ℹ️ INFORMASI TOKO ───*
┌  *.info* ➜ Detail Layanan Toko
│  *.lokasi* ➜ Navigasi Maps
└  *.status* ➜ Cek Service (Nota)
━━━━━━━━━━━━━━━━━━━━
⌨️ *Tips:* Gunakan titik *( . )* di awal perintah.
📸 *Info:* Kirim foto kerusakan untuk analisa otomatis!

*SG KOMPUTER – Rantau Prapat*`;

    await sock.sendMessage(sender, { 
        text: menu,
        contextInfo: {
            externalAdReply: {
                title: "SG KOMPUTER - Solusi IT",
                body: "Pilih layanan kami di bawah ini",
                thumbnailUrl: "https://supergames19.github.io/supergames/assets/images/SG.jpeg", // Ganti dengan logo/banner toko
                sourceUrl: "https://supergames19.github.io/Data/",
                mediaType: 1,
                renderLargerThumbnail: false // Biarkan kecil agar fokus ke teks menu
            }
        }
    }, { quoted: msg });
}


// 2. CEK STATUS (Untuk Pelanggan & Admin)
if (body.toLowerCase().startsWith('.status')) {
    const args = body.split(" ");
    if (args.length < 2) {
        return await sock.sendMessage(sender, { text: `❌ *Format Salah!*\n\nKetik: *.status [Nomor_Nota]*\nContoh: *.status G21*` });
    }

    const notaId = args[1].toUpperCase().trim();
    
    if (!fs.existsSync(statusDbPath)) {
        return await sock.sendMessage(sender, { text: "⚠️ Database belum tersedia. Admin belum menginput data apapun." });
    }

    let statusDb = JSON.parse(fs.readFileSync(statusDbPath));

    if (!statusDb[notaId]) {
        return await sock.sendMessage(sender, { text: `⚠️ *DATA TIDAK DITEMUKAN*\n\nNota *#${notaId}* tidak terdaftar. Pastikan nomor nota benar atau hubungi admin.` });
    }

    const data = statusDb[notaId];
    const statusMsg = `🔍 *PELACAKAN SERVIS SG KOMPUTER*
━━━━━━━━━━━━━━━━━━━━

📌 *No. Nota:* #${notaId}
👤 *Pelanggan:* ${data.nama}
💻 *Perangkat:* ${data.perangkat}

🕒 *Status Saat Ini:*
*「 🛠️ ${data.status.toUpperCase()} 」*

📢 *Catatan Teknisi:*
"${data.catatan}"

📅 *Update:* ${data.waktu}
━━━━━━━━━━━━━━━━━━━━
_Unit yang sudah selesai bisa diambil dengan membawa nota fisik._`;

    await sock.sendMessage(sender, { 
        text: statusMsg,
        contextInfo: {
            externalAdReply: {
                title: `Status Servis: ${notaId}`,
                body: `Status: ${data.status}`,
                thumbnailUrl: "https://supergames19.github.io/supergames/assets/images/SG.jpeg",
                sourceUrl: "https://supergames19.github.io/Data/",
                mediaType: 1
            }
        }
    }, { quoted: msg });
    return; // Berhenti di sini
}


if (body === '.app') {
    await sock.sendPresenceUpdate('composing', sender);
    const linkApp = "https://supergames19.github.io/Data/promosi";

    const appMsg = `🚀 *JASA PEMBUATAN APLIKASI*
━━━━━━━━━━━━━━━━━━

Ingin punya aplikasi Android/iOS atau Website untuk bisnis Anda?
*SG KOMPUTER* siap membantu mewujudkannya!

✅ *Layanan Kami:*
• Web Company Profile
• Aplikasi Kasir / Inventori
• Landing Page UMKM
• Custom Software sesuai request

🔗 *Portofolio:* ${linkApp}

━━━━━━━━━━━━━━━━━━
_Konsultasi Gratis! Klik link di atas._`;

    await sock.sendMessage(sender, {
        text: appMsg,
        contextInfo: {
            externalAdReply: {
                title: "DEVELOPER SOLUTION - SG KOMPUTER",
                body: "Solusi Digital untuk Bisnis Anda 🚀",
                thumbnailUrl: "https://supergames19.github.io/supergames/assets/images/SG.jpeg",
                sourceUrl: linkApp,
                mediaType: 1,
                renderLargerThumbnail: true
            }
        }
    });
  return; // Tambahkan return agar proses berhenti di sini
}


 if (body === '.order') {
    const orderFormat = `📋 *FORMULIR PEMESANAN*
*SG KOMPUTER*

Halo Kak! Silakan lengkapi data di bawah ini untuk mempercepat proses order:

┌────────────────────
│ 👤 *Nama :*
│ 📱 *No. HP :*
│ 💻 *Barang :*
│ 📍 *Alamat (Jika Kirim) :*
└────────────────────

*Cara Order:*
1. Salin pesan diatas.
2. Isi data dengan lengkap.
3. Kirim kembali ke chat ini.

_Admin kami akan segera memproses pesanan Kakak setelah data diterima._ ✨`;

    await sock.sendMessage(sender, {
        text: orderFormat,
        // Menambahkan context info agar chat terlihat lebih premium
        contextInfo: {
            externalAdReply: {
                title: "SG KOMPUTER - Order System",
                body: "Layanan Cepat & Bergaransi",
                thumbnailUrl: "https://supergames19.github.io/supergames/assets/images/SG.jpeg", // Opsional: Tambahkan link foto logo toko
                sourceUrl: "https://instagram.com/supergamea19", // Opsional: Link sosmed
                mediaType: 1,
                renderLargerThumbnail: false
            }
        }
    });
  return; // Tambahkan return agar proses berhenti di sini
}



// 6. MENU LINK & INFORMASI (DENGAN PREVIEW CARD)
if (body === '.promo') {
    await sock.sendPresenceUpdate('composing', sender);
    const linkPromo = "https://supergames19.github.io/Data/promo/";
    const promoMsg = `🔥 *PROMO SPESIAL SG KOMPUTER* 🔥
━━━━━━━━━━━━━━━━━━

Saat ini kami sedang menyiapkan promo menarik khusus buat Kakak!
Pantau terus halaman promo kami agar tidak ketinggalan diskon Produk Kami!.

🔗 *Cek Promo:* ${linkPromo}

━━━━━━━━━━━━━━━━━━━━━
_Kami tunggu kedatangan kakak ya_`;

    await sock.sendMessage(sender, {
        text: promoMsg,
        contextInfo: {
            externalAdReply: {
                title: "PROMO TERBARU HARI INI 🎁",
                body: "Klik untuk melihat diskon servis & sparepart",
                thumbnailUrl: "https://supergames19.github.io/supergames/assets/images/SG.jpeg",
                sourceUrl: linkPromo,
                mediaType: 1,
                renderLargerThumbnail: true
            }
        }
    });
   return; // Tambahkan return agar proses berhenti di sini
}


    // 3. KATALOG PRODUK (DENGAN PREVIEW MEWAH)
   if (body === '.katalog') {
    await sock.sendPresenceUpdate('composing', sender);

    const linkKatalog = "https://supergames19.github.io/Data/";

    const teksKatalog = `📦 *KATALOG PRODUK SG KOMPUTER*
━━━━━━━━━━━━━━━━━━━

Halo Kak! Silakan jelajahi koleksi produk terbaik kami, mulai dari sparepart hingga unit laptop terbaru melalui tautan di bawah ini:

🔗 *Link Katalog:* ${linkKatalog}

━━━━━━━━━━━━━━━━━━━
*Cara Melihat:*
1. Klik tautan di atas.
2. Pilih kategori produk yang dicari.
3. Screenshoot barang & kirim ke admin untuk cek stok.

_Update stok setiap hari! Selamat berbelanja._ ✨`;

    await sock.sendMessage(sender, {
        text: teksKatalog,
        contextInfo: {
            externalAdReply: {
                title: "KATALOG DIGITAL SG KOMPUTER",
                body: "Cek Produk, Harga, & Spesifikasi Terbaru di Sini!",
                // Gunakan foto toko atau banner katalog Anda di sini
                thumbnailUrl: "https://supergames19.github.io/supergames/assets/images/SG.jpeg", 
                sourceUrl: linkKatalog,
                mediaType: 1,
                renderLargerThumbnail: true // Membuat preview gambar jadi besar & elegan
            }
        }
    }, { quoted: msg });
   return; // Tambahkan return agar proses berhenti di sini
}


  // 4. FITUR AI GEMINI DENGAN MEMORI (BRAIN)
        if (body.startsWith('.ai ')) {
            const promptUser = body.slice(4);
            await sendTyping(sender, 4000);

            if (!chatMemory[sender]) {
                chatMemory[sender] = [
                    { role: "user", parts: [{ text: "Anda adalah teknisi Bot di SG KOMPUTER. Anda sangat pintar memperbaiki Laptop, Printer, CCTV, dan PlayStation. Jawablah dengan ramah dan teknis." }] },
                    { role: "model", parts: [{ text: "Halo! Saya Bot Teknisi ahli. Siap membantu masalah perangkat Anda!" }] }
                ];
            }

            try {
                const chat = model.startChat({ history: chatMemory[sender] });
                const result = await chat.sendMessage(promptUser);
                const response = await result.response;
                const text = response.text();

                chatMemory[sender].push({ role: "user", parts: [{ text: promptUser }] });
                chatMemory[sender].push({ role: "model", parts: [{ text: text }] });
                if (chatMemory[sender].length > 16) chatMemory[sender].shift(); 

                await sock.sendMessage(sender, { text: "🤖 *Analisa Gemini AI:* \n\n" + text });


    // --- [BARU] PESAN PENUTUP ALA SHOPEE (REVIEW OTOMATIS) ---
        // Kita beri jeda 3 detik agar tidak muncul bersamaan
        setTimeout(async () => {
            const linkUlasan = "https://search.google.com/local/writereview?placeid=ChIJJf5_ZwChLTARPNtPcUfiHOA"; // Ganti link ulasan Anda
            const ulasanMsg = `💬 *Gimana Kak, membantu nggak?*

Semoga solusinya bermanfaat ya! Kalau Kakak puas dengan bantuan AI kami, yuk bantu kasih *Bintang 5* ⭐⭐⭐⭐⭐ di Google Maps kami:

🔗 ${linkUlasan}

Ulasan Kakak sangat berarti bagi kami. Terima kasih! 🥰✨`;

            await sock.sendMessage(sender, {
                text: ulasanMsg,
                contextInfo: {
                    externalAdReply: {
                        title: "Bantu Kami Menilai Layanan Ini ⭐",
                        body: "Klik untuk berikan rating Bintang 5",
                        thumbnailUrl: "https://supergames19.github.io/supergames/assets/images/SG.jpeg",
                        sourceUrl: linkUlasan,
                        mediaType: 1
                    }
                }
            });
        }, 4000); // 4000ms = 4 detik

            } catch (e) {
                await sock.sendMessage(sender, { text: "⚠️ AI sedang istirahat. Ketik (.reset) untuk mulai ulang." });
            }
        }



 // 5. RESET MEMORI AI (DENGAN FEEDBACK VISUAL)
 if (body === '.reset') {
    await sock.sendPresenceUpdate('composing', sender);
    delete chatMemory[sender];

    const resetMsg = `✨ *SISTEM DI-RESET* ✨
━━━━━━━━━━━━━━━

✅ *Berhasil!* Ingatan percakapan dengan AI telah dibersihkan.
🤖 Sekarang AI siap memulai topik pembahasan baru dengan Kakak.

_Ada lagi yang bisa saya bantu?_`;

    await sock.sendMessage(sender, { text: resetMsg });
}



       // Fitur Broadcast (Versi Final & Aman)
if (isOwner && body.startsWith('.bc ')) {
    const bcMsg = body.slice(4);
    await sock.sendMessage(sender, { text: `🚀 Memulai Broadcast ke ${database.length} kontak...\nEstimasi waktu: ±${Math.round((database.length * 5) / 60)} menit.` });

    let sukses = 0;
    let gagal = 0;

    for (const jid of database) {
        try {
            const randomDelay = Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000;
            await delay(randomDelay); 

            await sock.sendMessage(jid, { text: bcMsg });
            sukses++;
        } catch (e) {
            console.log(`Gagal kirim ke ${jid}`);
            gagal++;
        }
    }
    await sock.sendMessage(sender, { 
        text: `✅ *Broadcast Selesai!*\n\n📈 Laporan:\n- Sukses: ${sukses}\n- Gagal: ${gagal}\n- Total: ${database.length}` 
    });
}


        // Fitur Backup
        if (body === '.backup' && isOwner) {
            if (fs.existsSync(dbPath)) {
                await sock.sendMessage(sender, {
                    document: fs.readFileSync(dbPath),
                    mimetype: 'application/json',
                    fileName: 'database.json'
                });
            }
        }
    });
   sock.ev.on('creds.update', saveCreds);
}
startBot();

