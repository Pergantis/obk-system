let lockerData = [];
let selectedLockerNum = null;
let lockerTargetMemberId = null;

// --- HENTER ALLE SKAP FRA DATABASEN ---
async function loadLockers() {
    const { data, error } = await sb
        .from('skapleie')
        .select('*, medlemmer(fornavn, etternavn, tlf_mobil)')
        .order('skap_nummer');

    if (!error) {
        lockerData = data;
        renderVisualLockers();
    }
}

// --- TEGNER 10x10 GRID ---
function renderVisualLockers() {
    const grid = document.getElementById('locker-grid-visual');
    if (!grid) return;
    
    grid.innerHTML = lockerData.map(s => {
        const isOccupied = s.status === 'Opptatt';
        const isSelected = selectedLockerNum === s.skap_nummer;
        
        return `<div class="locker-box" 
                     style="background: ${isOccupied ? 'var(--advarsel)' : 'var(--biljard-gronn)'}; 
                            border: ${isSelected ? '2px solid black' : '2px solid transparent'};"
                     onclick="selectLocker(${s.skap_nummer})">
                     ${s.skap_nummer}
                </div>`;
    }).join('');
}

// --- NÅR MAN KLIKKER PÅ ET SKAP ---
function selectLocker(num) {
    selectedLockerNum = num;
    const skap = lockerData.find(s => s.skap_nummer === num);
    
    document.getElementById('locker-msg').style.display = 'none';
    const panel = document.getElementById('locker-panel');
    panel.style.display = 'block';
    document.getElementById('selected-locker-title').innerText = "Skap " + num;

    // Skjul begge under-paneler først
    document.getElementById('locker-rent-form').style.display = 'none';
    document.getElementById('locker-info-panel').style.display = 'none';
    document.getElementById('locker-final-fields').style.display = 'none';

    if (skap.status === 'Ledig') {
        document.getElementById('locker-rent-form').style.display = 'block';
        // Sett standarddatoer (1 år frem)
        const iDag = new Date();
        const nesteAar = new Date(); nesteAar.setFullYear(iDag.getFullYear() + 1);
        document.getElementById('locker-start').value = iDag.toISOString().split('T')[0];
        document.getElementById('locker-end').value = nesteAar.toISOString().split('T')[0];
    } else {
        document.getElementById('locker-info-panel').style.display = 'block';
        document.getElementById('locker-info-name').innerText = skap.medlemmer ? skap.medlemmer.fornavn + ' ' + skap.medlemmer.etternavn : 'Ukjent';
        document.getElementById('locker-info-phone').innerText = 'Mobil: ' + (skap.medlemmer ? skap.medlemmer.tlf_mobil : '-');
        document.getElementById('locker-info-dates').innerText = 'Utløper: ' + new Date(skap.til_dato).toLocaleDateString('no-NO');
        document.getElementById('locker-info-note').innerText = skap.notater || 'Ingen notater.';
    }
    renderVisualLockers(); // For å vise rammen rundt valgt boks
}

// --- SØK ETTER MEDLEM TIL SKAP ---
async function searchMemberForLocker() {
    const q = document.getElementById('locker-search-input').value.trim();
    if (q.length < 2) return;
    const { data } = await sb.from('medlemmer').select('*').or(`tlf_mobil.ilike.%${q}%,etternavn.ilike.%${q}%`).limit(3);
    
    document.getElementById('locker-search-results').innerHTML = data.map(m => `
        <div class="search-item" onclick="prepareLockerLease('${m.id}', '${m.fornavn} ${m.etternavn}')">
            <strong>${m.fornavn} ${m.etternavn}</strong><br><small>📱 ${m.tlf_mobil}</small>
        </div>`).join('');
}

function prepareLockerLease(id, name) {
    lockerTargetMemberId = id;
    document.getElementById('locker-target-name').innerText = "👤 " + name;
    document.getElementById('locker-final-fields').style.display = 'block';
    document.getElementById('locker-search-results').innerHTML = '';
}

// --- LAGRE UTLEIE ---
async function saveLockerLease() {
    showLoader(true);
    const { error } = await sb.from('skapleie').update({
        status: 'Opptatt',
        medlem_id: lockerTargetMemberId,
        fra_dato: document.getElementById('locker-start').value,
        til_dato: document.getElementById('locker-end').value,
        notater: document.getElementById('locker-note').value
    }).eq('skap_nummer', selectedLockerNum);

    if (error) alert(error.message);
    else {
        await loadLockers();
        selectLocker(selectedLockerNum);
    }
    showLoader(false);
}

// --- FRIGJØR SKAP ---
async function releaseLocker() {
    if (!confirm("Vil du tømme skapet og avslutte leien?")) return;
    showLoader(true);
    const { error } = await sb.from('skapleie').update({
        status: 'Ledig', medlem_id: null, fra_dato: null, til_dato: null, notater: null
    }).eq('skap_nummer', selectedLockerNum);

    if (error) alert(error.message);
    else {
        await loadLockers();
        document.getElementById('locker-panel').style.display = 'none';
        document.getElementById('locker-msg').style.display = 'block';
    }
    showLoader(false);
}

// Last skapdata hvert minutt
setInterval(loadLockers, 60000);
