async function runSearch() {
    const input = document.getElementById('p-search-input').value.trim();
    if (input.length < 2) return;
    const { data } = await sb.from('medlemmer').select('*').or(`tlf_mobil.ilike.%${input}%,etternavn.ilike.%${input}%`).limit(5);
    const resDiv = document.getElementById('p-search-results');
    if (data.length === 0) {
        resDiv.innerHTML = `<button class="btn" style="background:var(--marine)" onclick="showNewMemberBox('${input}')">+ NYTT MEDLEM</button>`;
        return;
    }
    resDiv.innerHTML = data.map(m => `<div class="search-item" onclick="selectMemberForPass('${m.id}', '${m.fornavn} ${m.etternavn}', '${m.epost}', '${m.tlf_mobil}')"><strong>${m.fornavn} ${m.etternavn}</strong><br><small>📱 ${m.tlf_mobil}</small></div>`).join('');
}

async function selectMemberForPass(id, name, epost, tlf) {
    selectedMemberId = id;
    document.getElementById('p-new-member-box').style.display = 'none';
    document.getElementById('p-display-name').innerText = "👤 " + name;
    document.getElementById('p-edit-email').value = epost || "";
    document.getElementById('p-edit-phone').value = tlf || "";
    const { data } = await sb.from('periodekort').select('slutt_dato').eq('medlem_id', id).order('slutt_dato', { ascending: false }).limit(1);
    const st = document.getElementById('p-current-status');
    if (data && data.length > 0) {
        const ut = new Date(data[0].slutt_dato);
        st.innerText = "Kort utløper: " + ut.toLocaleDateString('no-NO');
        st.style.color = ut >= new Date() ? "green" : "red";
    } else { st.innerText = "Ingen aktive kort."; st.style.color = "#666"; }
    document.getElementById('p-form-box').style.display = 'block';
    document.getElementById('p-search-results').innerHTML = "";
}

async function saveMemberPassUpdate() {
    if (!selectedMemberId) return;
    const em = document.getElementById('p-edit-email').value, ph = document.getElementById('p-edit-phone').value, st = document.getElementById('p-start-date').value, sl = document.getElementById('p-end-date').value;
    showLoader(true);
    await sb.from('medlemmer').update({ epost: em, tlf_mobil: ph }).eq('id', selectedMemberId);
    if (st && sl) await sb.from('periodekort').insert({ medlem_id: selectedMemberId, start_dato: st, slutt_dato: sl });
    showLoader(false); cancelSelection(); loadActivePasses();
}

function showNewMemberBox(input) {
    document.getElementById('p-form-box').style.display = 'none';
    document.getElementById('p-new-member-box').style.display = 'block';
    if (!isNaN(input)) document.getElementById('n-phone').value = input;
}

async function registerBrandNewMember() {
    const fn = document.getElementById('n-fn').value, en = document.getElementById('n-en').value, ep = document.getElementById('n-email').value, ph = document.getElementById('n-phone').value;
    if (!fn || !en || !ep || !ph) { alert("Fyll ut alle felt!"); return; }
    showLoader(true);
    await sb.from('medlemmer').insert({ fornavn: fn, etternavn: en, epost: ep, tlf_mobil: ph });
    showLoader(false); cancelSelection();
}

async function loadActivePasses() {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await sb.from('periodekort').select('slutt_dato, medlemmer(fornavn, etternavn, tlf_mobil)').gte('slutt_dato', today).order('slutt_dato', { ascending: true });
    const tbody = document.getElementById('p-active-table-body');
    if (!data || data.length === 0) { tbody.innerHTML = "<tr><td colspan='4'>Ingen aktive.</td></tr>"; return; }
    tbody.innerHTML = data.map(p => {
        const dager = Math.ceil((new Date(p.slutt_dato) - new Date()) / 86400000);
        return `<tr><td><strong>${p.medlemmer.fornavn} ${p.medlemmer.etternavn}</strong></td><td>${p.medlemmer.tlf_mobil}</td><td>${new Date(p.slutt_dato).toLocaleDateString('no-NO')}</td><td class="${dager<=7?'dager-advarsel':'dager-ok'}">${dager} dager</td></tr>`;
    }).join('');
}

function cancelSelection() { document.getElementById('p-form-box').style.display = 'none'; document.getElementById('p-new-member-box').style.display = 'none'; }
