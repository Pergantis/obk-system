// --- PERIODEKORT LOGIKK ---

async function runSearch() {
    const input = document.getElementById('p-search-input').value.trim();
    const resDiv = document.getElementById('p-search-results');
    if (input.length < 2) return;
    
    resDiv.innerHTML = "Søker...";
    const { data, error } = await sb.from('medlemmer')
        .select('*')
        .or(`tlf_mobil.ilike.%${input}%,etternavn.ilike.%${input}%`)
        .limit(5);
    
    if (error) { resDiv.innerHTML = "Feil: " + error.message; return; }
    
    if (data.length === 0) {
        resDiv.innerHTML = `
            <div style="padding:10px; color:var(--advarsel); font-weight:bold;">Ingen funnet.</div>
            <button class="btn" style="background:var(--marine)" onclick="showNewMemberBox('${input}')">+ REGISTRER NYTT MEDLEM</button>
        `;
        return;
    }
    
    resDiv.innerHTML = data.map(m => `
        <div class="search-item" onclick="selectMemberForPass('${m.id}', '${m.fornavn} ${m.etternavn}', '${m.epost}', '${m.tlf_mobil}')">
            <strong>${m.fornavn} ${m.etternavn}</strong><br><small>📱 ${m.tlf_mobil} | 📧 ${m.epost}</small>
        </div>`).join('');
}

async function selectMemberForPass(id, name, epost, tlf) {
    selectedMemberId = id;
    document.getElementById('p-new-member-box').style.display = 'none';
    document.getElementById('p-display-name').innerText = "👤 " + name;
    document.getElementById('p-edit-email').value = epost || "";
    document.getElementById('p-edit-phone').value = tlf || "";

    // Sjekk nåværende status
    const { data } = await sb.from('periodekort')
        .select('slutt_dato')
        .eq('medlem_id', id)
        .order('slutt_dato', { ascending: false })
        .limit(1);

    const st = document.getElementById('p-current-status');
    if (data && data.length > 0) {
        const ut = new Date(data[0].slutt_dato);
        st.innerText = "Kort utløper: " + ut.toLocaleDateString('no-NO');
        st.style.color = ut >= new Date().setHours(0,0,0,0) ? "green" : "red";
    } else {
        st.innerText = "Ingen kort fra før.";
        st.style.color = "#666";
    }

    document.getElementById('p-start-date').value = "";
    document.getElementById('p-end-date').value = "";
    document.getElementById('p-form-box').style.display = 'block';
    document.getElementById('p-search-results').innerHTML = "";
}

async function saveMemberPassUpdate() {
    if (!selectedMemberId) { alert("Søk og velg person på nytt."); return; }
    
    const em = document.getElementById('p-edit-email').value.trim();
    const ph = document.getElementById('p-edit-phone').value.trim();
    const st = document.getElementById('p-start-date').value;
    const sl = document.getElementById('p-end-date').value;

    if (!em || !ph) { alert("E-post og mobil er obligatorisk."); return; }

    showLoader(true);
    try {
        await sb.from('medlemmer').update({ epost: em, tlf_mobil: ph }).eq('id', selectedMemberId);
        
        if (st && sl) {
            await sb.from('periodekort').insert({ medlem_id: selectedMemberId, start_dato: st, slutt_dato: sl });
            alert("Lagret!");
        } else {
            alert("Medlemsinfo oppdatert.");
        }
        cancelSelection();
        loadActivePasses();
    } catch (err) {
        alert("Feil: " + err.message);
    }
    showLoader(false);
}

function showNewMemberBox(input) {
    document.getElementById('p-form-box').style.display = 'none';
    document.getElementById('p-new-member-box').style.display = 'block';
    document.getElementById('p-search-results').innerHTML = "";
    if (!isNaN(input)) document.getElementById('n-phone').value = input;
    else document.getElementById('n-en').value = input;
}

async function registerBrandNewMember() {
    const fn = document.getElementById('n-fn').value.trim();
    const en = document.getElementById('n-en').value.trim();
    const ep = document.getElementById('n-email').value.trim();
    const ph = document.getElementById('n-phone').value.trim();
    const st = document.getElementById('n-start').value;
    const sl = document.getElementById('n-end').value;

    if (!fn || !en || !ep || !ph) { alert("Alle medlemsfelt må fylles ut."); return; }

    showLoader(true);
    const { data, error } = await sb.from('medlemmer').insert({ fornavn: fn, etternavn: en, epost: ep, tlf_mobil: ph }).select();
    
    if (!error && data && st && sl) {
        await sb.from('periodekort').insert({ medlem_id: data[0].id, start_dato: st, slutt_dato: sl });
    }
    
    if (error) alert("Feil: " + error.message);
    else alert("Medlem lagret!");

    showLoader(false);
    cancelSelection();
    loadActivePasses();
}

async function loadActivePasses() {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await sb.from('periodekort')
        .select('slutt_dato, medlemmer(fornavn, etternavn, tlf_mobil)')
        .gte('slutt_dato', today)
        .order('slutt_dato', { ascending: true });

    const tbody = document.getElementById('p-active-table-body');
    if (!tbody) return;
    
    if (error || !data || data.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4'>Ingen aktive kort.</td></tr>";
        return;
    }

    tbody.innerHTML = data.map(p => {
        const slutt = new Date(p.slutt_dato);
        const dager = Math.ceil((slutt - new Date().setHours(0,0,0,0)) / 86400000);
        let kl = dager <= 7 ? "dager-advarsel" : "dager-ok";
        if (dager <= 0) kl = "dager-utlopt";
        return `<tr>
            <td><strong>${p.medlemmer.fornavn} ${p.medlemmer.etternavn}</strong></td>
            <td>${p.medlemmer.tlf_mobil}</td>
            <td>${slutt.toLocaleDateString('no-NO')}</td>
            <td class="${kl}">${dager <= 0 ? 'Siste dag!' : dager + ' dager'}</td>
        </tr>`;
    }).join('');
}

function cancelSelection() {
    document.getElementById('p-form-box').style.display = 'none';
    document.getElementById('p-new-member-box').style.display = 'none';
    selectedMemberId = null;
    document.querySelectorAll('#p-new-member-box input').forEach(i => i.value = "");
}

// Auto-oppdatering av liste hvert 30. sekund
setInterval(loadActivePasses, 30000);
