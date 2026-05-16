// maintenance.js

// Hjelpefunksjon for å unngå XSS
function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, function(m) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return map[m];
    });
}

async function initAdminPanel() {
    try {
        await HentMedlemmerAdmin();
        await HentVarslerPeriode();
        await HentVarslerSkap();
        await HentBordLogg();
    } catch (err) {
        console.error("Feil i initAdminPanel:", err);
    }
}

// 1. Henter medlemmer og tegner tabell
// maintenance.js - Oppdatert versjon av medlemsliste

async function HentMedlemmerAdmin() {
    const container = document.getElementById('admin-medlem-liste');
    showLoader(true);

    // Henter aktive medlemmer sortert på sist oppdatert for å se de nyeste først
    const { data, error } = await sb.from('medlemmer')
        .select('*')
        .eq('er_aktiv', true)
        .order('oppdatert_at', { ascending: false });

    if (error) {
        container.innerHTML = `<p>Feil ved henting: ${error.message}</p>`;
        showLoader(false);
        return;
    }

    // Vi deler dataen: De 5 første vises alltid, resten ligger i trekkspillet
    const top5 = data.slice(0, 5);
    const resten = data.slice(5);

    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h4 style="margin:0;">Medlemmer (${data.length})</h4>
            <button class="btn" style="background:var(--biljard-gronn); padding:10px 15px;" onclick="openMemberModal()">+ NYTT</button>
        </div>
        
        <input type="text" id="admin-search-input" onkeyup="filterAdminMedlemmer()" placeholder="Søk på navn...">

        <div class="admin-accordion" id="medlem-accordion">
            <div class="admin-accordion-content" style="display:block; padding:0;">
                <table style="width:100%; border-collapse:collapse; font-size:14px;">
                    <tbody id="admin-table-body">
                        ${generateTableRows(top5)}
                    </tbody>
                </table>
            </div>
            
            ${resten.length > 0 ? `
                <div class="admin-accordion-header" onclick="toggleMedlemListe()">
                    <span>Vis alle (${resten.length} flere)</span>
                    <span id="acc-arrow">▼</span>
                </div>
                <div class="admin-accordion-content" id="extra-members" style="padding:0;">
                    <table style="width:100%; border-collapse:collapse; font-size:14px;">
                        <tbody>
                            ${generateTableRows(resten)}
                        </tbody>
                    </table>
                </div>
            ` : ''}
        </div>
    `;

    container.innerHTML = html;
    showLoader(false);
}

// Hjelpefunksjon for å tegne radene med Emoji-ikoner
function generateTableRows(medlemmer) {
    return medlemmer.map(m => `
        <tr style="border-bottom:1px solid #eee;">
            <td style="padding:12px 8px;"><b>${escapeHtml(m.fornavn)}</b><br>${escapeHtml(m.etternavn)}</td>
            <td style="padding:8px; text-align:right;">
                <div class="admin-action-btns">
                    <button class="btn-icon" style="background:var(--marine);" onclick="openMemberModal('${m.id}')" title="Rediger">📝</button>
                    <button class="btn-icon" style="background:var(--advarsel);" onclick="deaktiverMedlem('${m.id}', '${m.fornavn}')" title="Slett">🗑️</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Funksjon for å åpne/lukke trekkspillet
function toggleMedlemListe() {
    const content = document.getElementById('extra-members');
    const arrow = document.getElementById('acc-arrow');
    const isOpen = content.style.display === 'block';
    
    content.style.display = isOpen ? 'none' : 'block';
    arrow.innerText = isOpen ? '▼' : '▲';
}

// 2. Modal-styring
function closeMemberModal() {
    document.getElementById('member-modal').style.display = 'none';
}

async function openMemberModal(id = null) {
    const title = document.getElementById('member-modal-title');
    const idField = document.getElementById('edit-member-id');
    const fNavn = document.getElementById('m-fornavn');
    const eNavn = document.getElementById('m-etternavn');

    if (id) {
        title.innerText = "Rediger medlem";
        idField.value = id;
        showLoader(true);
        const { data, error } = await sb.from('medlemmer').select('*').eq('id', id).single();
        if (data) {
            fNavn.value = data.fornavn;
            eNavn.value = data.etternavn;
        }
        showLoader(false);
    } else {
        title.innerText = "Nytt medlem";
        idField.value = "";
        fNavn.value = "";
        eNavn.value = "";
    }
    document.getElementById('member-modal').style.display = 'flex';
}

// 3. Lagre (Insert/Update)
let memberCallback = null; // Holder styr på om vi skal gjøre noe etter lagring

async function saveMember() {
    const id = document.getElementById('edit-member-id').value;
    const fornavn = document.getElementById('m-fornavn').value.trim();
    const etternavn = document.getElementById('m-etternavn').value.trim();

    if (!fornavn || !etternavn) {
        alert("Vennligst fyll ut navn");
        return;
    }

    showLoader(true);
    const memberData = { fornavn, etternavn, oppdatert_at: new Date() };

    let res;
    if (id) {
        res = await sb.from('medlemmer').update(memberData).eq('id', id).select();
    } else {
        memberData.er_aktiv = true;
        res = await sb.from('medlemmer').insert([memberData]).select();
    }

    if (res.error) {
        alert("Feil ved lagring: " + res.error.message);
    } else {
        const savedMember = res.data[0];
        closeMemberModal();
        
        // Hvis vi kom fra periodekort-modulen, hopp direkte til salg
        if (memberCallback) {
            memberCallback(savedMember);
            memberCallback = null; // Nullstill
        } else {
            await HentMedlemmerAdmin();
        }
    }
    showLoader(false);
}

// 4. Myk sletting
async function deaktiverMedlem(id, navn) {
    if (!confirm(`Er du sikker på at du vil slette ${navn}?`)) return;

    showLoader(true);
    const { error } = await sb.from('medlemmer')
        .update({ er_aktiv: false, oppdatert_at: new Date() })
        .eq('id', id);

    if (error) alert("Feil: " + error.message);
    else await HentMedlemmerAdmin();
    showLoader(false);
}

// Resten av dine funksjoner (HentVarslerPeriode, HentVarslerSkap, HentBordLogg, markerKontaktet) fortsetter her...

// Henter periodekort som utløper innen 9 dager
async function HentVarslerPeriode() {
    const container = document.getElementById('admin-varsel-periode');
    
    // Vi henter dagens dato i formatet YYYY-MM-DD uten å bry oss om tidssoner
    const idagStr = new Date().toISOString().split('T')[0];
    
    // Vi henter en grensedato 9 dager frem (vi bruker en enkel logikk her)
    const grenseDato = new Date();
    grenseDato.setDate(grenseDato.getDate() + 9);
    const grenseStr = grenseDato.toISOString().split('T')[0];

    const { data, error } = await sb
        .from('periodekort')
        .select('slutt_dato, medlemmer(fornavn, etternavn)')
        // Vi spør databasen: "Er sluttdatoen mellom i dag og 9 dager frem?"
        .gte('slutt_dato', idagStr)
        .lte('slutt_dato', grenseStr)
        .order('slutt_dato');

    if (error) {
        container.innerHTML = "Kunne ikke hente varsler.";
        return;
    }

    if (data.length === 0) {
        container.innerHTML = "<p style='color:green;'>Ingen kort utløper snart.</p>";
        return;
    }

    container.innerHTML = data.map(p => `
        <div style="font-size:12px; margin-bottom:5px; padding:5px; border-bottom:1px solid #eee;">
            <strong>${escapeHtml(p.medlemmer.fornavn)} ${escapeHtml(p.medlemmer.etternavn)}</strong><br>
            Utløper: ${p.slutt_dato.split('-').reverse().join('.')}
        </div>
    `).join('');
}

// Henter skapleie som utgår eller har utgått
 async function HentVarslerSkap() {
    const container = document.getElementById('admin-varsel-skap');
    const iDag = new Date();
    const om14Dager = new Date();
    om14Dager.setDate(iDag.getDate() + 14);

    const { data, error } = await sb
        .from('skapleie')
        .select('skap_nummer, til_dato, sist_kontaktet, medlemmer(fornavn, etternavn)')
        .eq('status', 'Opptatt')
        .lte('til_dato', om14Dager.toISOString().split('T')[0])
        .order('til_dato');

    if (error) {
        container.innerHTML = "Kunne ikke hente skap-varsler.";
        return;
    }

    if (!data || data.length === 0) {
        container.innerHTML = "<p style='color:green;'>Ingen skap krever oppfølging.</p>";
        return;
    }

    container.innerHTML = data.map(s => {
        const [y, m, d] = s.til_dato.split('-');
        const utlop = new Date(y, m - 1, d);
        const erUtlopt = utlop < iDag;
        const kontaktet = s.sist_kontaktet ? `(Kontaktet: ${new Date(s.sist_kontaktet).toLocaleDateString('no-NO')})` : "";
        const datoStreng = utlop.toLocaleDateString('no-NO');
        
        const farge = erUtlopt ? "red" : "#2980b9";
        const statusTekst = erUtlopt ? "⚠️ UTLØPT:" : "🕒 Utløper:";
        
        return `
            <div style="font-size:12px; margin-bottom:10px; padding:10px; border-bottom:1px solid #ddd; color:${farge}; font-weight:bold;">
                <strong>Skap ${s.skap_nummer} - ${s.medlemmer ? escapeHtml(s.medlemmer.fornavn) + ' ' + escapeHtml(s.medlemmer.etternavn) : 'Ukjent'}</strong><br>
                ${statusTekst} ${datoStreng} <br>
                <small style="color:gray;">${kontaktet}</small>
                <div style="margin-top:5px;">
                    <button class="btn" style="width:auto; padding:2px 8px; font-size:10px; background:var(--biljard-gronn)" onclick="fornySkap(${s.skap_nummer})">FORNY</button>
                    <button class="btn" style="width:auto; padding:2px 8px; font-size:10px; background:var(--marine)" onclick="markerKontaktet(${s.skap_nummer})">KONTAKTET</button>
                </div>
            </div>
        `;
    }).join('');
}


// maintenance.js - Oppdatert logikk for bordleie-logg

// Starter på 0, laster 10 av gangen
let loggOffset = 0;

async function HentBordLogg() {
    const container = document.getElementById('admin-bord-logg');
    
    // Henter siste 10 rader, sortert med nyeste øverst
    const { data, error } = await sb
        .from('bord_leie_historikk')
        .select('*')
        .order('slutt_tid', { ascending: false })
        .range(loggOffset, loggOffset + 9); // Henter 10 rader (0-9)

    if (error) {
        container.innerHTML = "Kunne ikke hente historikk.";
        return;
    }

    if (data.length === 0 && loggOffset === 0) {
        container.innerHTML = "<p>Ingen leiehistorikk funnet.</p>";
        return;
    }

    // Hjelpefunksjon for å formatere dato/tid
    const formaterDatoTid = (isoString) => {
        const date = new Date(isoString);
        const klokkeslett = date.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' });
        const dato = date.toLocaleDateString('no-NO', { day: '2-digit', month: '2-digit' });
        return { klokkeslett, dato };
    };

    // Bygger tabellen med nye kolonner
    let html = `
        <table style="width:100%; font-size:12px; border-collapse: collapse; margin-top:5px;">
            <thead>
                <tr style="border-bottom: 2px solid #ddd;">
                    <th style="padding:4px; text-align:left; width:1%;">Bord</th>
                    <th style="padding:4px; text-align:left;">Kunde</th>
                    <th style="padding:4px; text-align:center;">Tidsrom</th>
                    <th style="padding:4px; text-align:right;">Min</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.forEach(h => {
        const start = formaterDatoTid(h.start_tid);
        const slutt = formaterDatoTid(h.slutt_tid);
        
        html += `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:4px; text-align:center;">${h.bord_nummer}</td>
                <td style="padding:4px;">${escapeHtml(h.kunde_navn || 'Anonym')}</td>
                <td style="padding:4px; text-align:center; line-height:1.2;">
                    <div>${start.klokkeslett} - ${slutt.klokkeslett}</div>
                    <div style="color:#888; font-size:10px;">${slutt.dato}</div>
                </td>
                <td style="padding:4px; text-align:right; font-weight:bold;">${h.varighet_minutter}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    
    // Hvis loggOffset er 0, erstatt innhold, ellers legg til (ved "Se mer")
    if (loggOffset === 0) {
        container.innerHTML = html;
    } else {
        container.innerHTML += html;
    }
}

// Funksjon for "Se mer"-knappen - oppdatert til 10
function lastMerLogg() {
    loggOffset += 10;
    HentBordLogg();
}
async function markerKontaktet(nr) {
    const { error } = await sb.from('skapleie')
        .update({ sist_kontaktet: new Date().toISOString().split('T')[0] })
        .eq('skap_nummer', nr);
    if (!error) HentVarslerSkap();
}

function fornySkap(nr) {
    showModule('skap'); // Navigerer til skap-modulen
    selectLocker(nr);   // Velger skapet (krever at selectLocker er tilgjengelig globalt)
    showRenewalForm();  // Åpner fornyelse automatisk
}
// maintenance.js - Legg til denne nederst

// 5. Søkefunksjon for medlemstabellen i kontrollpanelet
// maintenance.js

// maintenance.js

function filterAdminMedlemmer() {
    const input = document.getElementById('admin-search-input');
    if (!input) return;
    
    const filter = input.value.toLowerCase();
    const container = document.getElementById('medlem-accordion');
    const extraContent = document.getElementById('extra-members');
    const arrow = document.getElementById('acc-arrow');
    
    if (!container) return;

    // 1. Åpne trekkspillet automatisk hvis man søker
    if (filter.length > 0 && extraContent) {
        extraContent.style.display = 'block';
        if (arrow) arrow.innerText = '▲';
    } else if (filter.length === 0 && extraContent) {
        // Valgfritt: Lukke det igjen når feltet tømmes? 
        // Vi lar det være åpent for nå så brukeren ikke mister fokus.
    }

    // 2. Filtrer alle rader
    const rows = container.getElementsByTagName("tr");
    for (let i = 0; i < rows.length; i++) {
        const tdNavn = rows[i].getElementsByTagName("td")[0];
        if (tdNavn) {
            const txtValue = tdNavn.textContent || tdNavn.innerText;
            rows[i].style.display = txtValue.toLowerCase().indexOf(filter) > -1 ? "" : "none";
        }
    }
}