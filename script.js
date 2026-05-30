let html5QrCode;
const phoneAt = "6281362462327";
const waNumber = "628118500828";
const mdnCode = "mdn01";

function startScanner() {
    document.getElementById('btn-scan').style.display = 'none';
    document.getElementById('btn-stop').style.display = 'block';

    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 15, qrbox: { width: 280, height: 160 } };

    html5QrCode.start(
        { facingMode: "environment" }, 
        config, 
        (decodedText) => {
            // Auto-detect SN vs SMCID
            if (decodedText.toUpperCase().startsWith('F')) {
                document.getElementById('sn_code').value = decodedText.toUpperCase();
            } else if (decodedText.length >= 15) {
                document.getElementById('smcid_code').value = decodedText;
            } else {
                // Jika tidak yakin masuk ke mana, isi yang kosong
                if (!document.getElementById('sn_code').value) {
                    document.getElementById('sn_code').value = decodedText;
                } else {
                    document.getElementById('smcid_code').value = decodedText;
                }
            }
            updatePreview();
        }
    ).catch(err => {
        alert("Kamera error: " + err);
        stopScanner();
    });
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
    const sn = document.getElementById('sn_code').value || "[SN]";
    const smcid = document.getElementById('smcid_code').value || "[SMCID]";
    const message = `Reg AT#${phoneAt}#${sn}#${smcid}#${mdnCode}`;
    document.getElementById('message-preview').innerText = message;
}

// Input listener untuk manual typing
document.getElementById('sn_code').addEventListener('input', updatePreview);
document.getElementById('smcid_code').addEventListener('input', updatePreview);

function sendToWhatsApp() {
    const sn = document.getElementById('sn_code').value;
    const smcid = document.getElementById('smcid_code').value;

    if (!sn || !smcid) {
        alert("Mohon isi atau scan SN dan SMCID terlebih dahulu.");
        return;
    }

    const message = `Reg AT#${phoneAt}#${sn}#${smcid}#${mdnCode}`;
    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
    
    window.open(waUrl, '_blank');
}
