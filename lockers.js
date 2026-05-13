// --- SKAPLEIE LOGIKK (OPPDATERT) ---
let lockerData = [];
let selectedLockerNum = null;
let lockerTargetMemberId = null;

function initLockerGrid() {
    const grid = document.getElementById('locker-grid-visual');
    if (!grid) return;
    let html = "";
    for (let i = 1; i <= 100; i++) {
        html += `<div class="locker-box" id="locker-box-${i}" onclick="selectLocker(${i})">${i}</div>`;
    }
    grid.innerHTML = html;
}

async function loadLockers() {
    if (!document.getElementById('locker-box-1')) initLockerGrid();
    let { data, error } = await sb.from('skapleie').select('*, medlemmer(*)').order('skap_nummer');

    if (data && data.length === 0) {
        const startup = [];
        for (let i = 1; i <= 100; i++) startup.push({ skap_nummer: i, status: 'Ledig' });
        await sb.from('skapleie').insert(startup);
        const retry = await sb.from('skapleie').select('*, medlemmer(*)').order('skap_nummer');
        data = retry.data;
    }
    lockerData = data;
    updateLockerVisuals();
}

function updateLockerVisuals() {
    const iDag = new Date(); iDag.setHours(0,0,0,0);
    lockerData.forEach(skap => {
        const box = document.getElementById(`locker-box-${skap.skap_nummer}`);
        if (!box) return;
        box.className = "locker-box";
        if (selectedLockerNum === skap.skap_nummer) box.classList.add('selected');
        if (skap.status === 'Opptatt') {
            const utlop = new Date(skap.til_dato);
            const dagerIgjen = Math.ceil((utlop - iDag) / 86400000);
            if (dagerIgjen < 14) box.classList.add('warning');
            else box.classList.add('occupied');
        }
    });
}

function selectLocker(num) {
    selectedLockerNum = num;
    const skap = lockerData.find(s => s.skap_nummer === num);
    document.getElementById('locker-msg').style.display = 'none';
    document.getElementById('locker-panel').style.display = 'block';
    document.getElementById('selected-locker-title').innerText = "Skap " + num;
    
    // Reset alle visninger i panelet
    document.getElementById('locker-rent-form').style.display = 'none';
    document.getElementById('locker-info-panel').style.display = 'none';
    document.getElementById('locker-final-fields').style.display = 'none';

    if (!skap || skap.status === 'Ledig') {
        document.getElementById('locker-rent-form').style.display = 'block';
        const start = new Date();
        const slutt = new Date(); slutt.setFullYear(start.getFullYear() + 1);
        document.getElementById('locker-start').value = start.toISOString().split('T')[0];
        document.getElementById('locker-end').value = slutt.toISOString().split('T')[0];
    } else {
        document.getElementById('locker-info-panel').style.display = 'block';
        const m = skap.medlemmer;
        document.getElementById('locker-info-name').innerText = m ? `${m.fornavn} ${m.etternavn}` : 'Ukjent';
        document.getElementById('locker-info-phone').innerText = m ? `📱 ${m.tlf_mobil}` : '-';
        document.getElementById('locker-info-dates').innerText = `Utløper: ${new Date(skap.til_dato).toLocaleDateString('no-NO')}`;
        document.getElementById('locker-info-note').innerText = skap.notater || "Ingen notat.";
        lockerTargetMemberId = skap.medlem_id;
    }
    updateLockerVisuals();
}

// --- NY FUNKSJON: FORLENGELSE ---
function showRenewalForm() {
    const skap = lockerData.find(s => s.skap_nummer === selectedLockerNum);
    if (!skap) return;

    // Gjør om panelet til et fornyelses-skjema
    document.getElementById('locker-info-panel').style.display = 'none';
    document.getElementById('locker-rent-form').style.display = 'block';
    document.getElementById('locker-final-fields').style.display = 'block';
    document.getElementById('locker-target-name').innerText = "Forlengelse for: " + skap.medlemmer.fornavn + " " + skap.medlemmer.etternavn;
    
    // Beregn nye datoer: Start er dagen etter gammelt utløp, slutt er +1 år
    const gammeltUtlop = new Date(skap.til_dato);
    const nyStart = new Date(gammeltUtlop); nyStart.setDate(nyStart.getDate() + 1);
    const nySlutt = new Date(nyStart); nySlutt.setFullYear(nySlutt.getFullYear() + 1);

    document.getElementById('locker-start').value = nyStart.toISOString().split('T')[0];
    document.getElementById('locker-end').value = nySlutt.toISOString().split('T')[0];
}

// --- NY FUNKSJON: PDF/PRINT ---
function generateExpiryPDF() {
    const iDag = new Date(); iDag.setHours(0,0,0,0);
    const toUkerFrem = new Date(iDag); toUkerFrem.setDate(toUkerFrem.getDate() + 14);

    // Filtrer ut skap som går ut innen 14 dager eller har gått ut
    const utlopsListe = lockerData.filter(s => {
        if (s.status !== 'Opptatt') return false;
        const utlop = new Date(s.til_dato);
        return utlop <= toUkerFrem;
    }).sort((a, b) => new Date(a.til_dato) - new Date(b.til_dato));

    if (utlopsListe.length === 0) {
        alert("Ingen skap utløper i løpet av de neste 14 dagene.");
        return;
    }

    // Lag et midlertidig utskriftsvindu
    const printWindow = window.open('', '_blank');
    let html = `
        <html><head><title>Utløpsliste Skap - OBK</title>
        <link rel="stylesheet" href="style.css">
        <style>
            body { background: white; padding: 40px; }
            .print-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .print-table th, .print-table td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            .print-header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1a2f3c; padding-bottom: 10px; }
        </style>
        </head><body>
        <div class="print-header">
            <h1>Oslo Biljardklubb - Utløpsliste Skap</h1>
            <p>Generert: ${new Date().toLocaleDateString('no-NO')} | Filter: Utløp innen 14 dager</p>
        </div>
        <table class="print-table">
            <thead>
                <tr>
                    <th>Skap</th>
                    <th>Navn</th>
                    <th>Mobilnummer</th>
                    <th>Utløpsdato</th>
                    <th>Dager igjen</th>
                </tr>
            </thead>
            <tbody>`;

    utlopsListe.forEach(s => {
        const utlop = new Date(s.til_dato);
        const dager = Math.ceil((utlop - iDag) / 86400000);
        html += `
            <tr>
                <td><strong>${s.skap_nummer}</strong></td>
                <td>${s.medlemmer ? s.medlemmer.fornavn + ' ' + s.medlemmer.etternavn : 'Ukjent'}</td>
                <td>${s.medlemmer ? s.medlemmer.tlf_mobil : '-'}</td>
                <td>${utlop.toLocaleDateString('no-NO')}</td>
                <td style="color: ${dager < 0 ? 'red' : 'black'}">${dager < 0 ? 'UTLØPT' : dager + ' dager'}</td>
            </tr>`;
    });

    html += `</tbody></table>
        <p style="margin-top: 40px; font-size: 10px; color: #666;">Dette dokumentet er generert fra OBK Admin System.</p>
        <script>setTimeout(() => { window.print(); window.close(); }, 500);</script>
        </body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();
}

// ... resten av de eksisterende funksjonene (search, prepare, save, release) ...
async function searchMemberForLocker() {
    const q = document.getElementById('locker-search-input').value.trim();
    const resDiv = document.getElementById('locker-search-results');
    if (q.length < 2) return;
    const { data } = await sb.from('medlemmer')
        .select('*')
       .or(`tlf_mobil.ilike.%${q}%,etternavn.ilike.%${q}%,fornavn.ilike.%${q}%`)
        .limit(8);
    if (data.length === 0) {
        resDiv.innerHTML = `<div class="alert-box alert-danger">Ingen treff. <button class="btn" style="background:var(--marine)" onclick="goToMemberRegistration('${q}')">REGISTRER NY</button></div>`;
        return;
    }
    resDiv.innerHTML = data.map(m => `
        <div class="search-result-item" onclick="prepareLockerLease('${m.id}', '${m.fornavn} ${m.etternavn}')">
            <div class="search-item-icon">👤</div>
            <div class="search-item-info"><strong>${m.fornavn} ${m.etternavn}</strong><small>📱 ${m.tlf_mobil}</small></div>
        </div>`).join('');
}

function goToMemberRegistration(input) {
    showModule('medlem');
    document.getElementById('p-search-input').value = input;
    runSearch();
}

function prepareLockerLease(id, name) {
    lockerTargetMemberId = id;
    document.getElementById('locker-target-name').innerText = "Valgt: " + name;
    document.getElementById('locker-final-fields').style.display = 'block';
    document.getElementById('locker-search-results').innerHTML = '';
}

async function saveLockerLease() {
    showLoader(true);
    const { error } = await sb.from('skapleie').update({
        status: 'Opptatt', medlem_id: lockerTargetMemberId,
        fra_dato: document.getElementById('locker-start').value,
        til_dato: document.getElementById('locker-end').value,
        notater: document.getElementById('locker-note').value
    }).eq('skap_nummer', selectedLockerNum);
    if (error) alert("Feil: " + error.message);
    else { await loadLockers(); selectLocker(selectedLockerNum); }
    showLoader(false);
}

async function releaseLocker() {
    if (!confirm(`Frigjøre skap ${selectedLockerNum}?`)) return;
    showLoader(true);
    await sb.from('skapleie').update({ status: 'Ledig', medlem_id: null, fra_dato: null, til_dato: null, notater: null }).eq('skap_nummer', selectedLockerNum);
    await loadLockers();
    document.getElementById('locker-panel').style.display = 'none';
    document.getElementById('locker-msg').style.display = 'block';
    showLoader(false);
}

loadLockers();
