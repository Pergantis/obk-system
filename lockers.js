// --- SKAPLEIE LOGIKK ---
let lockerData = [];
let selectedLockerNum = null;
let lockerTargetMemberId = null;

// Denne funksjonen tegner skapene med en gang programmet starter
function initLockerGrid() {
    const grid = document.getElementById('locker-grid-visual');
    if (!grid) return;

    let html = "";
    for (let i = 1; i <= 100; i++) {
        // Vi lager alle skapene grønne (ledige) som start-utgangspunkt
        html += `<div class="locker-box" id="locker-box-${i}" onclick="selectLocker(${i})">${i}</div>`;
    }
    grid.innerHTML = html;
    console.log("Skap-grid initialisert");
}

// Henter data fra databasen og oppdaterer fargene
async function loadLockers() {
    // Hvis grid-en ikke er tegnet ennå, gjør det nå
    if (!document.getElementById('locker-box-1')) {
        initLockerGrid();
    }

    console.log("Henter skapdata fra Supabase...");
    const { data, error } = await sb
        .from('skapleie')
        .select('*, medlemmer(fornavn, etternavn, tlf_mobil)')
        .order('skap_nummer');

    if (error) {
        console.error("Feil ved henting av skap:", error.message);
        return;
    }

    lockerData = data;
    updateLockerColors();
}

// Oppdaterer fargene på boksene basert på status i databasen
function updateLockerColors() {
    lockerData.forEach(skap => {
        const box = document.getElementById(`locker-box-${skap.skap_nummer}`);
        if (box) {
            if (skap.status === 'Opptatt') {
                box.classList.add('occupied');
            } else {
                box.classList.remove('occupied');
            }

            // Marker hvis dette skapet er det som er valgt akkurat nå
            if (selectedLockerNum === skap.skap_nummer) {
                box.classList.add('selected');
            } else {
                box.classList.remove('selected');
            }
        }
    });
}

function selectLocker(num) {
    selectedLockerNum = num;
    const skap = lockerData.find(s => s.skap_nummer === num);
    
    // Vis panelet
    document.getElementById('locker-msg').style.display = 'none';
    const panel = document.getElementById('locker-panel');
    panel.style.display = 'block';
    document.getElementById('selected-locker-title').innerText = "Skap " + num;
    
    // Nullstill søk og skjemaer
    document.getElementById('locker-rent-form').style.display = 'none';
    document.getElementById('locker-info-panel').style.display = 'none';
    document.getElementById('locker-final-fields').style.display = 'none';
    document.getElementById('locker-search-results').innerHTML = '';
    document.getElementById('locker-search-input').value = '';

    if (!skap || skap.status === 'Ledig') {
        document.getElementById('locker-rent-form').style.display = 'block';
        // Sett datoer (1 år frem)
        const iD = new Date();
        const nA = new Date(); nA.setFullYear(iD.getFullYear() + 1);
        document.getElementById('locker-start').value = iD.toISOString().split('T')[0];
        document.getElementById('locker-end').value = nA.toISOString().split('T')[0];
    } else {
        document.getElementById('locker-info-panel').style.display = 'block';
        document.getElementById('locker-info-name').innerText = skap.medlemmer ? skap.medlemmer.fornavn + ' ' + skap.medlemmer.etternavn : 'Ukjent';
        document.getElementById('locker-info-phone').innerText = 'Mobil: ' + (skap.medlemmer ? skap.medlemmer.tlf_mobil : '-');
        document.getElementById('locker-info-dates').innerText = 'Utløper: ' + new Date(skap.til_dato).toLocaleDateString('no-NO');
        document.getElementById('locker-info-note').innerText = skap.notater || "Ingen notat.";
    }
    
    updateLockerColors();
}

async function searchMemberForLocker() {
    const q = document.getElementById('locker-search-input').value.trim();
    if (q.length < 2) return;
    
    const { data } = await sb.from('medlemmer')
        .select('*')
        .or(`tlf_mobil.ilike.%${q}%,etternavn.ilike.%${q}%`)
        .limit(3);
        
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

async function saveLockerLease() {
    showLoader(true);
    const { error } = await sb.from('skapleie').update({
        status: 'Opptatt',
        medlem_id: lockerTargetMemberId,
        fra_dato: document.getElementById('locker-start').value,
        til_dato: document.getElementById('locker-end').value,
        notater: document.getElementById('locker-note').value
    }).eq('skap_nummer', selectedLockerNum);

    if (error) {
        alert("Lagringsfeil: " + error.message);
    } else {
        await loadLockers();
        selectLocker(selectedLockerNum);
    }
    showLoader(false);
}

async function releaseLocker() {
    if (!confirm("Tømme skapet og avslutte leien?")) return;
    showLoader(true);
    const { error } = await sb.from('skapleie').update({
        status: 'Ledig', medlem_id: null, fra_dato: null, til_dato: null, notater: null
    }).eq('skap_nummer', selectedLockerNum);

    if (error) {
        alert("Feil ved frigjøring: " + error.message);
    } else {
        await loadLockers();
        document.getElementById('locker-panel').style.display = 'none';
        document.getElementById('locker-msg').style.display = 'block';
        selectedLockerNum = null;
        updateLockerColors();
    }
    showLoader(false);
}

// Start grid med en gang filen lastes
initLockerGrid();
