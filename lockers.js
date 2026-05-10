// --- SKAPLEIE LOGIKK ---
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

// Henter skapdata - og fyller tabellen hvis den er tom
async function loadLockers() {
    if (!document.getElementById('locker-box-1')) initLockerGrid();

    let { data, error } = await sb
        .from('skapleie')
        .select('*, medlemmer(fornavn, etternavn, tlf_mobil)')
        .order('skap_nummer');

    // SIKKERHETSMEKANISME: Hvis tabellen er helt tom, må vi opprette skapene
    if (data && data.length === 0) {
        console.log("Tabellen er tom. Oppretter skap 1-100...");
        const startupData = [];
        for (let i = 1; i <= 100; i++) {
            startupData.push({ skap_nummer: i, status: 'Ledig' });
        }
        await sb.from('skapleie').insert(startupData);
        // Hent data på nytt etter oppretting
        const retry = await sb.from('skapleie').select('*, medlemmer(fornavn, etternavn, tlf_mobil)').order('skap_nummer');
        data = retry.data;
    }

    if (error) return;
    lockerData = data;
    updateLockerVisuals();
}

function updateLockerVisuals() {
    const iDag = new Date(); iDag.setHours(0,0,0,0);

    for (let i = 1; i <= 100; i++) {
        const box = document.getElementById(`locker-box-${i}`);
        if (box) {
            box.className = "locker-box";
            if (selectedLockerNum === i) box.classList.add('selected');
        }
    }

    lockerData.forEach(skap => {
        const box = document.getElementById(`locker-box-${skap.skap_nummer}`);
        if (!box) return;
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
    const panel = document.getElementById('locker-panel');
    panel.style.display = 'block';
    document.getElementById('selected-locker-title').innerText = "Skap " + num;
    
    document.getElementById('locker-rent-form').style.display = 'none';
    document.getElementById('locker-info-panel').style.display = 'none';
    document.getElementById('locker-final-fields').style.display = 'none';
    document.getElementById('locker-search-results').innerHTML = '';
    document.getElementById('locker-search-input').value = '';

    if (!skap || skap.status === 'Ledig') {
        document.getElementById('locker-rent-form').style.display = 'block';
        const iDag = new Date();
        const nesteAar = new Date(); nesteAar.setFullYear(iDag.getFullYear() + 1);
        document.getElementById('locker-start').value = iDag.toISOString().split('T')[0];
        document.getElementById('locker-end').value = nesteAar.toISOString().split('T')[0];
    } else {
        document.getElementById('locker-info-panel').style.display = 'block';
        const m = skap.medlemmer;
        document.getElementById('locker-info-name').innerText = m ? `${m.fornavn} ${m.etternavn}` : 'Ukjent';
        document.getElementById('locker-info-phone').innerText = m ? `📱 ${m.tlf_mobil}` : '-';
        document.getElementById('locker-info-dates').innerText = `Utløper: ${new Date(skap.til_dato).toLocaleDateString('no-NO')}`;
        document.getElementById('locker-info-note').innerText = skap.notater || "Ingen notat.";
    }
    updateLockerVisuals();
}

async function searchMemberForLocker() {
    const q = document.getElementById('locker-search-input').value.trim();
    const resDiv = document.getElementById('locker-search-results');
    if (q.length < 2) return;
    
    const { data } = await sb.from('medlemmer')
        .select('*')
        .or(`tlf_mobil.ilike.%${q}%,etternavn.ilike.%${q}%`)
        .limit(3);
        
    if (data.length === 0) {
        resDiv.innerHTML = `
            <div class="alert-box alert-danger" style="margin-top:10px;">
                <p style="font-size:12px; margin-bottom:10px;">Ingen treff.</p>
                <button class="btn" style="background:var(--marine); font-size:11px;" onclick="goToMemberRegistration('${q}')">GÅ TIL REGISTRERING</button>
            </div>`;
        return;
    }

    resDiv.innerHTML = data.map(m => `
        <div class="search-result-item" onclick="prepareLockerLease('${m.id}', '${m.fornavn} ${m.etternavn}')">
            <div class="search-item-icon">👤</div>
            <div class="search-item-info">
                <strong>${m.fornavn} ${m.etternavn}</strong>
                <small>📱 ${m.tlf_mobil}</small>
            </div>
        </div>`).join('');
}

// Funksjon som sender brukeren til medlemsmodulen med søketeksten
function goToMemberRegistration(input) {
    showModule('medlem'); // Bytter fane
    const memberSearchInput = document.getElementById('p-search-input');
    memberSearchInput.value = input; // Setter inn søketeksten
    runSearch(); // Utfører søket der slik at "Registrer ny"-knappen dukker opp
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
        status: 'Opptatt',
        medlem_id: lockerTargetMemberId,
        fra_dato: document.getElementById('locker-start').value,
        til_dato: document.getElementById('locker-end').value,
        notater: document.getElementById('locker-note').value
    }).eq('skap_nummer', selectedLockerNum);

    if (error) alert("Feil: " + error.message);
    else {
        await loadLockers();
        selectLocker(selectedLockerNum);
    }
    showLoader(false);
}

async function releaseLocker() {
    if (!confirm(`Frigjøre skap ${selectedLockerNum}?`)) return;
    showLoader(true);
    await sb.from('skapleie').update({
        status: 'Ledig', medlem_id: null, fra_dato: null, til_dato: null, notater: null
    }).eq('skap_nummer', selectedLockerNum);
    await loadLockers();
    document.getElementById('locker-panel').style.display = 'none';
    document.getElementById('locker-msg').style.display = 'block';
    showLoader(false);
}

loadLockers();
