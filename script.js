let html5QrCode;
let activeTab = 'baru'; // default tab

const phoneAt = "6281362462327";
const waNumber = "628118500828";

function openTab(mode) {
    activeTab = mode;
    // Update UI Tab
    document.querySelectorAll('.tab-link').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    
    if(mode === 'baru') {
        document.getElementById('tab-baru').classList.add('active');
        document.getElementById('form-baru').style.display = 'block';
    } else {
        document.getElementById('tab-lama').classList.add('active');
        document.getElementById('form-lama').style.display = 'block';
    }
    updatePreview();
}

function startScanner() {
    document.getElementById('btn-scan').style.display = 'none';
    document.getElementById('btn-stop').style.display = 'block';

    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start(
        { facingMode: "environment" }, 
        { fps: 15, qrbox: { width: 280, height: 160 } },
        (decodedText) => {
            const code = decodedText.toUpperCase();
            
            if (activeTab === 'baru') {
                if (code.startsWith('F')) {
                    document.getElementById('sn_baru').value = code;
                } else {
                    document.getElementById('smcid_baru').value = code;
                }
            } else {
                // Di tab LAMA, semua hasil scan masuk ke SN Lama
                document.getElementById('sn_lama').value = code;
            }
            updatePreview();
        }
    ).catch(err => { console.error(err); stopScanner(); });
}

function stopScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            document.getElementById('btn-scan').style.display = 'block';
            document.getElementById('btn-stop').style.display = 'none';
        });
    }
}

function updatePreview() {
    let message = "";
    if (activeTab === 'baru') {
        const sn = document.getElementById('sn_baru').value || "[SN]";
        const smcid = document.getElementById('smcid_baru').value || "[SMCID]";
        message = `Reg AT#${phoneAt}#${sn}#${smcid}#mdn01`;
    } else {
        const snLama = document.getElementById('sn_lama').value || "[SN LAMA]";
        message = `Pilih ${snLama} gol07`;
    }
    document.getElementById('message-preview').innerText = message;
}

// Listeners
document.getElementById('sn_baru').addEventListener('input', updatePreview);
document.getElementById('smcid_baru').addEventListener('input', updatePreview);
document.getElementById('sn_lama').addEventListener('input', updatePreview);

function sendToWhatsApp() {
    let message = "";
    
    if (activeTab === 'baru') {
        const sn = document.getElementById('sn_baru').value;
        const smcid = document.getElementById('smcid_baru').value;
        if (!sn || !smcid) return alert("Isi data Optus Baru!");
        message = `Reg AT#${phoneAt}#${sn}#${smcid}#mdn01`;
    } else {
        const snLama = document.getElementById('sn_lama').value;
        if (!snLama) return alert("Isi SN Digital Lama!");
        message = `Pilih ${snLama} gol07`;
    }

    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`, '_blank');
}

// Jalankan preview saat pertama kali buka
updatePreview();
