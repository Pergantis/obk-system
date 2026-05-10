// --- SKAPLEIE LOGIKK ---
let lockerData = [];
let selectedLockerNum = null;
let lockerTargetMemberId = null;

// Initialiserer rutenettet (1-100) med en gang siden lastes
function initLockerGrid() {
    const grid = document.getElementById('locker-grid-visual');
    if (!grid) return;
    let html = "";
    for (let i = 1; i <= 100; i++) {
        html += `<div class="locker-box" id="locker-box-${i}" onclick="selectLocker(${i})">${i}</div>`;
    }
    grid.innerHTML = html;
}

// Henter all skapdata fra Supabase inkludert medlemsinfo
async function loadLockers() {
    // Hvis grid-en ikke er tegnet ennå, gjør det nå
    if (!document.getElementById('locker-box-1')) initLockerGrid();

    const { data, error } = await sb
        .from('skapleie')
        .select('*, medlemmer(fornavn, etternavn, tlf_mobil)')
        .order('skap_nummer');

    if (error) {
        console.error("Feil ved henting av skap:", error.message);
        return;
    }

    lockerData = data;
    updateLockerVisuals();
}

// Oppdaterer fargene på alle 100 skap-boksene
function updateLockerVisuals() {
    const iDag = new Date();
    iDag.setHours(0,0,0,0);

    // Sett alle til ledig (grønn) først
    for (let i = 1; i <= 100; i++) {
        const box = document.getElementById(`locker-box-${i}`);
        if (box) {
            box.className = "locker-box"; // Reset klasser
            if (selectedLockerNum === i) box.classList.add('selected');
        }
    }

    // Oppdater basert på data fra databasen
    lockerData.forEach(skap => {
        const box = document.getElementById(`locker-box-${skap.skap_nummer}`);
        if (!box) return;

        if (skap.status === 'Opptatt') {
            const utlop = new Date(skap.til_dato);
            const dagerIgjen = Math.ceil((utlop - iDag) / (86400000));

            if (dagerIgjen < 14) {
                box.classList.add('warning'); // GUL (under 14 dager)
            } else {
                box.classList.add('occupied'); // RØD
            }
        }
    });
}

// Håndterer klikk på et skap
function selectLocker(num) {
    selectedLockerNum = num;
    const skap = lockerData.find(s => s.skap_nummer === num);
    
    // UI-oppdatering
    document.getElementById('locker-msg').style.display = 'none';
    const panel = document.getElementById('locker-panel');
    panel.style.display = 'block';
    document.getElementById('selected-locker-title').innerText = "Skap " + num;
    
    // Nullstill skjemaer
    document.getElementById('locker-rent-form').style.display = 'none';
    document.getElementById('locker-info-panel').style.display = 'none';
    document.getElementById('locker-final-fields').style.display = 'none';
    document.getElementById('locker-search-results').innerHTML = '';
    document.getElementById('locker-search-input').value = '';

    if (!skap || skap.status === 'Ledig') {
        // VIS SKJEMA FOR UTLEIE
        document.getElementById('locker-rent-form').style.display = 'block';
        
        // Sett standarddatoer (I dag til +365 dager)
        const iDag = new Date();
        const nesteAar = new Date(); 
        nesteAar.setFullYear(iDag.getFullYear() + 1);
        
        document.getElementById('locker-start').value = iDag.toISOString().split('T')[0];
        document.getElementById('locker-end').value = nesteAar.toISOString().split('T')[0];
    } else {
        // VIS INFO OM LEIETAKER
        document.getElementById('locker-info-panel').style.display = 'block';
        const m = skap.medlemmer;
        document.getElementById('locker-info-name').innerText = m ? `${m.fornavn} ${m.etternavn}` : 'Ukjent';
        document.getElementById('locker-info-phone').innerText = m ? `📱 ${m.tlf_mobil}` : '-';
        
        const utlop = new Date(skap.til_dato).toLocaleDateString('no-NO');
        document.getElementById('locker-info-dates').innerText = `Leie utløper: ${utlop}`;
        document.getElementById('locker-info-note').innerText = skap.notater || "Ingen notater registrert.";
    }
    
    updateLockerVisuals();
}

// Søkefunksjon inne i skap-modulen (gjenbruker stilen fra periodekort)
async function searchMemberForLocker() {
    const q = document.getElementById('locker-search-input').value.trim();
    if (q.length < 2) return;
    
    const { data } = await sb.from('medlemmer')
        .select('*')
        .or(`tlf_mobil.ilike.%${q}%,etternavn.ilike.%${q}%`)
        .limit(3);
        
    document.getElementById('locker-search-results').innerHTML = data.map(m => `
        <div class="search-result-item" onclick="prepareLockerLease('${m.id}', '${m.fornavn} ${m.etternavn}')">
            <div class="search-item-icon">👤</div>
            <div class="search-item-info">
                <strong>${m.fornavn} ${m.etternavn}</strong>
                <small>📱 ${m.tlf_mobil}</small>
            </div>
        </div>`).join('');
}

// Når man velger et medlem fra søket
function prepareLockerLease(id, name) {
    lockerTargetMemberId = id;
    document.getElementById('locker-target-name').innerText = "Valgt leietaker: " + name;
    document.getElementById('locker-final-fields').style.display = 'block';
    document.getElementById('locker-search-results').innerHTML = '';
}

// Lagrer utleie til Supabase
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
        alert("Feil ved lagring: " + error.message);
    } else {
        await loadLockers();
        selectLocker(selectedLockerNum); // Oppdaterer panelet til "Info-modus"
    }
    showLoader(false);
}

// Frigjør skapet
async function releaseLocker() {
    if (!confirm(`Er du sikker på at du vil frigjøre skap ${selectedLockerNum}?`)) return;
    
    showLoader(true);
    const { error } = await sb.from('skapleie').update({
        status: 'Ledig', 
        medlem_id: null, 
        fra_dato: null, 
        til_dato: null, 
        notater: null
    }).eq('skap_nummer', selectedLockerNum);

    if (error) {
        alert("Feil ved frigjøring: " + error.message);
    } else {
        await loadLockers();
        document.getElementById('locker-panel').style.display = 'none';
        document.getElementById('locker-msg').style.display = 'block';
        selectedLockerNum = null;
        updateLockerVisuals();
    }
    showLoader(false);
}

// Start grid med en gang
initLockerGrid();
