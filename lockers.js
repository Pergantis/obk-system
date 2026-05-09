let lockerData = [];
let selectedLockerNum = null;
let lockerTargetMemberId = null;

async function loadLockers() {
    const { data, error } = await sb.from('skapleie').select('*, medlemmer(fornavn, etternavn, tlf_mobil)').order('skap_nummer');
    if (!error) { lockerData = data; renderVisualLockers(); }
}

function renderVisualLockers() {
    const grid = document.getElementById('locker-grid-visual');
    if (!grid) return;
    grid.innerHTML = lockerData.map(s => {
        const isOcc = s.status === 'Opptatt';
        return `<div class="locker-box ${isOcc ? 'occupied' : ''} ${selectedLockerNum===s.skap_nummer?'selected':''}" onclick="selectLocker(${s.skap_nummer})">${s.skap_nummer}</div>`;
    }).join('');
}

function selectLocker(num) {
    selectedLockerNum = num;
    const skap = lockerData.find(s => s.skap_nummer === num);
    document.getElementById('locker-msg').style.display = 'none';
    document.getElementById('locker-panel').style.display = 'block';
    document.getElementById('selected-locker-title').innerText = "Skap " + num;
    
    document.getElementById('locker-rent-form').style.display = skap.status === 'Ledig' ? 'block' : 'none';
    document.getElementById('locker-info-panel').style.display = skap.status === 'Opptatt' ? 'block' : 'none';

    if (skap.status === 'Opptatt') {
        document.getElementById('locker-info-name').innerText = skap.medlemmer.fornavn + " " + skap.medlemmer.etternavn;
        document.getElementById('locker-info-phone').innerText = skap.medlemmer.tlf_mobil;
        document.getElementById('locker-info-dates').innerText = "Til: " + new Date(skap.til_dato).toLocaleDateString('no-NO');
        document.getElementById('locker-info-note').innerText = skap.notater || "Ingen notat.";
    }
    renderVisualLockers();
}

async function searchMemberForLocker() {
    const q = document.getElementById('locker-search-input').value;
    if (q.length < 2) return;
    const { data } = await sb.from('medlemmer').select('*').or(`tlf_mobil.ilike.%${q}%,etternavn.ilike.%${q}%`).limit(3);
    document.getElementById('locker-search-results').innerHTML = data.map(m => `<div class="search-item" onclick="prepareLockerLease('${m.id}', '${m.fornavn} ${m.etternavn}')"><strong>${m.fornavn} ${m.etternavn}</strong></div>`).join('');
}

function prepareLockerLease(id, name) {
    lockerTargetMemberId = id;
    document.getElementById('locker-target-name').innerText = "👤 " + name;
    document.getElementById('locker-final-fields').style.display = 'block';
    const iD = new Date(); const nA = new Date(); nA.setFullYear(iD.getFullYear()+1);
    document.getElementById('locker-start').value = iD.toISOString().split('T')[0];
    document.getElementById('locker-end').value = nA.toISOString().split('T')[0];
}

async function saveLockerLease() {
    showLoader(true);
    await sb.from('skapleie').update({ status:'Opptatt', medlem_id: lockerTargetMemberId, fra_dato: document.getElementById('locker-start').value, til_dato: document.getElementById('locker-end').value, notater: document.getElementById('locker-note').value }).eq('skap_nummer', selectedLockerNum);
    showLoader(false); loadLockers();
}

async function releaseLocker() {
    if (!confirm("Tømme skapet?")) return;
    showLoader(true);
    await sb.from('skapleie').update({ status:'Ledig', medlem_id: null, fra_dato: null, til_dato: null, notater: null }).eq('skap_nummer', selectedLockerNum);
    showLoader(false); loadLockers();
}
