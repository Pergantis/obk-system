// maintenance.js

async function initAdminPanel() {
    try {
        await HentVarslerPeriode();
        await HentVarslerSkap();
         initAdminSearch(); 
    } catch (err) {
        console.error("Feil i initAdminPanel:", err);
    }
}

// Henter periodekort som utløper innen 9 dager (kun seneste per medlem)
async function HentVarslerPeriode() {
    const container = document.getElementById('admin-varsel-periode');
    
    // Hent alle aktive periodekort
    const { data, error } = await sb
        .from('periodekort')
        .select('slutt_dato, medlem_id, medlemmer(fornavn, etternavn)')
        .order('slutt_dato', { ascending: false });
    
    if (error) {
        container.innerHTML = "Kunne ikke hente varsler.";
        return;
    }
    
    if (!data || data.length === 0) {
        container.innerHTML = "<p style='color:green;'>Ingen periodekort registrert.</p>";
        return;
    }
    
    // Behold kun seneste periodekort per medlem
    const senestePerMedlem = {};
    data.forEach(kort => {
        const medlemId = kort.medlem_id;
        if (!senestePerMedlem[medlemId]) {
            senestePerMedlem[medlemId] = kort;
        }
    });
    
    const unikeKort = Object.values(senestePerMedlem);
    
    // Filtrer på de som utløper i dag eller innen 9 dager. Bruk lokale
    // dato-strenger (YYYY-MM-DD) — new Date(slutt_dato) ville tolket DB-
    // verdien som UTC-midnatt, som er +1/+2 timer foran lokal midnatt og
    // gir off-by-one i daysLeft-beregningen rundt midnatt norsk tid.
    const idagStr = getTodayLocal();
    const om9DagerStr = addDaysLocal(idagStr, 9);

    const utlopende = unikeKort.filter(kort =>
        kort.slutt_dato >= idagStr && kort.slutt_dato <= om9DagerStr
    );

    // Sorter stigende (nærmest først) — string-compare på YYYY-MM-DD
    // tilsvarer kronologisk sortering.
    utlopende.sort((a, b) => a.slutt_dato.localeCompare(b.slutt_dato));

    if (utlopende.length === 0) {
        container.innerHTML = "<p style='color:green;'>Ingen kort utløper snart.</p>";
        return;
    }

    const idagDate = parseLocalDate(idagStr);
    container.innerHTML = utlopende.map(kort => {
        // Math.round i stedet for Math.ceil — DST-overganger gir 23-/25-
        // timersdøgn som ellers kunne skubbet beregningen én dag.
        const daysLeft = Math.round((parseLocalDate(kort.slutt_dato) - idagDate) / (1000 * 60 * 60 * 24));
        const isUrgent = daysLeft <= 7;

        return `
            <div style="font-size:12px; margin-bottom:5px; padding:5px; border-bottom:1px solid #eee; ${isUrgent ? 'font-weight:bold; color:black;' : ''}">
                <strong>${escapeHtml(kort.medlemmer.fornavn)} ${escapeHtml(kort.medlemmer.etternavn)}</strong><br>
                Utløper: ${formatDateForDisplay(kort.slutt_dato)} (${daysLeft} dager)
            </div>
        `;
    }).join('');
}

// Henter skapleie som utgår eller har utgått
 async function HentVarslerSkap() {
    const container = document.getElementById('admin-varsel-skap');
    const iDagStr = getTodayLocal();
    const om14DagerStr = addDaysLocal(iDagStr, 14);

    const { data, error } = await sb
        .from('skapleie')
        .select('skap_nummer, til_dato, sist_kontaktet, medlemmer(fornavn, etternavn)')
        .eq('status', 'Opptatt')
        .lte('til_dato', om14DagerStr)
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
        // Strengsammenligning på YYYY-MM-DD = leksikografisk = kronologisk.
        const erUtlopt = s.til_dato < iDagStr;
        const kontaktet = s.sist_kontaktet ? `(Kontaktet: ${formatDateForDisplay(s.sist_kontaktet)})` : "";
        const datoStreng = formatDateForDisplay(s.til_dato);

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


async function markerKontaktet(nr) {
    const { error } = await sb.from('skapleie')
        .update({ sist_kontaktet: getTodayLocal() })
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
// Oppretter nytt medlem fra kontrollpanelet
async function adminOpprettMedlem() {
    const fornavn = document.getElementById('admin-fornavn').value.trim();
    const etternavn = document.getElementById('admin-etternavn').value.trim();
    const mobil = document.getElementById('admin-mobil').value.trim();
    const epost = document.getElementById('admin-epost').value.trim();
    
    if (!fornavn || !etternavn) {
        visBeskjed('Mangler', 'Fyll ut fornavn og etternavn', 'error');
        return;
    }
    
    // Valider mobil (obligatorisk)
    if (!validerMobil(mobil)) {
        visBeskjed('Feil', 'Mobilnummer må være 8 siffer (kun tall)', 'error');
        return;
    }
    
    // Valider e-post (valgfritt, men sjekk format hvis utfylt)
    if (!validerEpost(epost)) {
        visBeskjed('Feil', 'Ugyldig e-postadresse', 'error');
        return;
    }
    
    showLoader(true);
    
    try {
        // Sjekk om medlem finnes fra før
        const { data: eksisterende } = await sb
            .from('medlemmer')
            .select('id')
            .eq('fornavn', fornavn)
            .eq('etternavn', etternavn)
            .single();
        
        if (eksisterende) {
            visBeskjed('Feil', 'Medlem finnes allerede', 'error');
            showLoader(false);
            return;
        }
        
        // Opprett nytt medlem med mobil og epost
        const { data: newMember, error: memberError } = await sb
            .from('medlemmer')
            .insert([{ 
                fornavn, 
                etternavn, 
                tlf_mobil: mobil,
                epost: epost || null,
                er_aktiv: true 
            }])
            .select()
            .single();
        
        if (memberError) throw memberError;
        
        visBeskjed('Suksess', `Medlem ${fornavn} ${etternavn} opprettet`, 'success');
        
        // Nullstill skjema
        adminAvbryt();
        
    } catch (err) {
        console.error('Feil ved opprettelse:', err);
        visBeskjed('Feil', 'Kunne ikke opprette medlem', 'error');
    }
    
    showLoader(false);
}
 function adminAvbryt() {
    document.getElementById('admin-fornavn').value = '';
    document.getElementById('admin-etternavn').value = '';
    document.getElementById('admin-mobil').value = '';
    document.getElementById('admin-epost').value = '';
}
// Søk etter medlemmer (kontrollpanelet)
let adminSearchTimeout = null;
let valgtAdminMedlem = null;

function initAdminSearch() {
    const searchInput = document.getElementById('admin-member-search');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function(e) {
        const query = e.target.value.trim();
        const bubble = document.getElementById('admin-search-bubble');
        
        if (query.length < 3) {
            bubble.style.display = 'none';
            return;
        }
        
        if (adminSearchTimeout) clearTimeout(adminSearchTimeout);
        adminSearchTimeout = setTimeout(() => adminSokMedlemmer(query), 300);
    });
    
    // Lukk boble ved klikk utenfor
    document.addEventListener('click', function(e) {
        const bubble = document.getElementById('admin-search-bubble');
        const searchInput = document.getElementById('admin-member-search');
        if (bubble && !bubble.contains(e.target) && e.target !== searchInput) {
            bubble.style.display = 'none';
        }
    });
}

async function adminSokMedlemmer(query) {
    try {
        const safe = sanitizeSearchQuery(query);
        if (!safe) return;
        
        const { data, error } = await sb
            .from('medlemmer')
            .select('id, fornavn, etternavn, tlf_mobil, epost')
            .or(`fornavn.ilike.%${safe}%,etternavn.ilike.%${safe}%,tlf_mobil.ilike.%${safe}%`)
            .eq('er_aktiv', true)
            .limit(10);
        
        if (error) throw error;
        
        let bubble = document.getElementById('admin-search-bubble');
        if (!bubble) {
            const searchWrapper = document.querySelector('#mod-admin .search-wrapper');
            if (searchWrapper) {
                bubble = document.createElement('div');
                bubble.id = 'admin-search-bubble';
                bubble.className = 'search-bubble';
                bubble.style.display = 'none';
                searchWrapper.appendChild(bubble);
            }
        }
        
        if (!data || data.length === 0) {
            bubble.innerHTML = '<div class="search-bubble-item">Ingen medlemmer funnet</div>';
            bubble.style.display = 'block';
            return;
        }
        
        bubble.innerHTML = data.map(member => `
            <div class="search-bubble-item" onclick="adminVelgMedlem('${member.id}', '${escapeHtml(member.fornavn)}', '${escapeHtml(member.etternavn)}', '${member.tlf_mobil || ''}', '${member.epost || ''}')">
                <span class="search-bubble-name">${escapeHtml(member.fornavn)} ${escapeHtml(member.etternavn)}</span>
                <span class="search-bubble-phone">📱 ${member.tlf_mobil || 'Ingen telefon'}</span>
            </div>
        `).join('');
        
        bubble.style.display = 'block';
        
    } catch (err) {
        console.error("Søkefeil:", err);
    }
}

function adminVelgMedlem(id, fornavn, etternavn, mobil, epost) {
    valgtAdminMedlem = { id, fornavn, etternavn, mobil, epost };
    
    document.getElementById('admin-fornavn').value = fornavn;
    document.getElementById('admin-etternavn').value = etternavn;
    document.getElementById('admin-mobil').value = mobil || '';
    document.getElementById('admin-epost').value = epost || '';
    
    // Lukk boble
    const bubble = document.getElementById('admin-search-bubble');
    if (bubble) bubble.style.display = 'none';
    
    // Tøm søkefelt
    document.getElementById('admin-member-search').value = '';
}

async function adminRedigerMedlem() {
    if (!valgtAdminMedlem) {
        visBeskjed('Feil', 'Søk opp og velg et medlem først', 'error');
        return;
    }
    
    const fornavn = document.getElementById('admin-fornavn').value.trim();
    const etternavn = document.getElementById('admin-etternavn').value.trim();
    const mobil = document.getElementById('admin-mobil').value.trim();
    const epost = document.getElementById('admin-epost').value.trim();
    
    if (!fornavn || !etternavn) {
        visBeskjed('Feil', 'Fornavn og etternavn kan ikke være tomme', 'error');
        return;
    }
    
    // Valider mobil (obligatorisk)
    if (!validerMobil(mobil)) {
        visBeskjed('Feil', 'Mobilnummer må være 8 siffer (kun tall)', 'error');
        return;
    }
    
    // Valider e-post (valgfritt, men sjekk format hvis utfylt)
    if (!validerEpost(epost)) {
        visBeskjed('Feil', 'Ugyldig e-postadresse', 'error');
        return;
    }
    
    showLoader(true);
    
    try {
        const { error } = await sb
            .from('medlemmer')
            .update({ 
                fornavn, 
                etternavn, 
                tlf_mobil: mobil,
                epost: epost || null,
                oppdatert_at: new Date() 
            })
            .eq('id', valgtAdminMedlem.id);
        
        if (error) throw error;
        
        visBeskjed('Suksess', `Medlem oppdatert: ${fornavn} ${etternavn}`, 'success');
        adminAvbryt();
        
    } catch (err) {
        console.error('Feil ved redigering:', err);
        visBeskjed('Feil', 'Kunne ikke oppdatere medlem', 'error');
    }
    
    showLoader(false);
}

// Variabel for å lagre rapportdata til PDF
let sisteRapportData = [];

// Åpner modal og henter rapport
async function visUtloptRapportModal() {
    const modal = document.getElementById('utlopt-rapport-modal');
    const innhold = document.getElementById('utlopt-rapport-innhold');
    
    modal.style.display = 'flex';
    innhold.innerHTML = '<p style="text-align: center; padding: 40px;">Laster rapport...</p>';
    
    try {
        const rapportData = await hentUtloptRapport();
        sisteRapportData = rapportData;
        visRapportTabell(rapportData);
    } catch (err) {
        console.error('Feil ved henting av rapport:', err);
        innhold.innerHTML = '<p style="text-align: center; padding: 40px; color: red;">Feil ved henting av rapport</p>';
    }
}

// Henter data fra databasen
async function hentUtloptRapport() {
    const iDag = new Date();
    const iDagStr = iDag.toISOString().split('T')[0];
    
    // Beregn dato for 180 dager siden
    const for180DagerSiden = new Date();
    for180DagerSiden.setDate(iDag.getDate() - 180);
    const for180DagerSidenStr = for180DagerSiden.toISOString().split('T')[0];
    
    // Hent alle periodekort med medlemdata
    const { data, error } = await sb
        .from('periodekort')
        .select(`
            start_dato,
            slutt_dato,
            medlem_id,
            medlemmer (
                fornavn,
                etternavn,
                er_aktiv
            )
        `)
        .gte('slutt_dato', for180DagerSidenStr)
        .lte('slutt_dato', iDagStr)
        .order('slutt_dato', { ascending: false });
    
    if (error) throw error;
    
    if (!data || data.length === 0) return [];
    
    // Filtrer ut medlemmer som har aktivt kort (slutt_dato >= i dag)
    const { data: aktiveKort, error: aktivError } = await sb
        .from('periodekort')
        .select('medlem_id')
        .gte('slutt_dato', iDagStr);
    
    if (aktivError) throw aktivError;
    
    const aktiveMedlemmer = new Set(aktiveKort.map(k => k.medlem_id));
    
    // Filtrer: kun medlemmer UTEN aktivt kort
    const utloptData = data.filter(kort => !aktiveMedlemmer.has(kort.medlem_id));
    
    // Sorter: fornavn + etternavn stigende, deretter slutt_dato synkende
    utloptData.sort((a, b) => {
        const navnA = `${a.medlemmer.fornavn} ${a.medlemmer.etternavn}`;
        const navnB = `${b.medlemmer.fornavn} ${b.medlemmer.etternavn}`;
        if (navnA < navnB) return -1;
        if (navnA > navnB) return 1;
        // Samme navn – sorter på slutt_dato synkende
        return b.slutt_dato.localeCompare(a.slutt_dato);
    });
    
    return utloptData;
}

// Viser tabell i modal
function visRapportTabell(data) {
    const innhold = document.getElementById('utlopt-rapport-innhold');
    
    if (data.length === 0) {
        innhold.innerHTML = '<p style="text-align: center; padding: 40px;">✅ Ingen utløpte periodekort siste 180 dager</p>';
        return;
    }
    
    let html = `
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
                <tr style="background: var(--marine); color: white;">
                    <th style="padding: 10px; text-align: left;">Fornavn</th>
                    <th style="padding: 10px; text-align: left;">Etternavn</th>
                    <th style="padding: 10px; text-align: left;">Startdato</th>
                    <th style="padding: 10px; text-align: left;">Sluttdato</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    data.forEach(kort => {
        html += `
            <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px;">${escapeHtml(kort.medlemmer.fornavn)}</td>
                <td style="padding: 8px;">${escapeHtml(kort.medlemmer.etternavn)}</td>
                <td style="padding: 8px;">${formatDateForDisplay(kort.start_dato)}</td>
                <td style="padding: 8px;">${formatDateForDisplay(kort.slutt_dato)}</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
        <p style="margin-top: 15px; font-size: 12px; color: #666;">📊 Totalt: ${data.length} utløpte periodekort</p>
    `;
    
    innhold.innerHTML = html;
}

// Lukker modal
function lukkUtloptRapportModal() {
    document.getElementById('utlopt-rapport-modal').style.display = 'none';
}

// Genererer og laster ned PDF
function lastNedUtloptRapportPDF() {
    if (!sisteRapportData || sisteRapportData.length === 0) {
        visBeskjed('Ingen data', 'Det er ingen data å laste ned', 'error');
        return;
    }
    
    const iDag = new Date();
    const datoStr = iDag.toLocaleDateString('no-NO');
    const filnavn = `obk_utlopt_rapport_${iDag.toISOString().split('T')[0]}.pdf`;
    
    // Bygg HTML for PDF
    let tableRows = '';
    sisteRapportData.forEach(kort => {
        tableRows += `
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">${escapeHtml(kort.medlemmer.fornavn)}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${escapeHtml(kort.medlemmer.etternavn)}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${formatDateForDisplay(kort.start_dato)}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${formatDateForDisplay(kort.slutt_dato)}</td>
            </tr>
        `;
    });
    
    const pdfHtml = `
        <html>
        <head>
            <title>OBK - Utløpte periodekort</title>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                h1 { color: #1a2f3c; border-bottom: 2px solid #c9a84c; padding-bottom: 10px; }
                .dato { color: #666; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #1a2f3c; color: white; padding: 10px; text-align: left; }
                td { border: 1px solid #ddd; padding: 8px; }
                .footer { margin-top: 40px; font-size: 12px; color: #666; text-align: center; }
            </style>
        </head>
        <body>
            <h1>🎱 Oslo Biljardklubb</h1>
            <h2>Utløpte periodekort (siste 180 dager)</h2>
            <div class="dato">Rapport generert: ${datoStr}</div>
            
            <table>
                <thead>
                    <tr>
                        <th>Fornavn</th>
                        <th>Etternavn</th>
                        <th>Startdato</th>
                        <th>Sluttdato</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            
            <div class="footer">
                Totalt: ${sisteRapportData.length} utløpte periodekort<br>
                Rapporten er generert automatisk av OBK Administrasjonssystem.
            </div>
        </body>
        </html>
    `;
    
    // Bruk jsPDF og html2canvas (må lastes inn)
    const win = window.open();
    win.document.write(pdfHtml);
    win.document.close();
    win.print();
}

// Hjelpefunksjon for datoformat
function formatDateForDisplay(isoDate) {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

// Oppdater adminAvbryt
function adminAvbryt() {
    valgtAdminMedlem = null;
    document.getElementById('admin-fornavn').value = '';
    document.getElementById('admin-etternavn').value = '';
    document.getElementById('admin-mobil').value = '';
    document.getElementById('admin-epost').value = '';
    document.getElementById('admin-member-search').value = '';
    const bubble = document.getElementById('admin-search-bubble');
    if (bubble) bubble.style.display = 'none';
}
// Validerer mobilnummer (8 siffer, kun tall)
function validerMobil(mobil) {
    if (!mobil) return false;
    const mobilStr = String(mobil).trim();
    // Må være nøyaktig 8 siffer
    return /^\d{8}$/.test(mobilStr);
}

// Validerer e-post (må inneholde @ og . etter @, eller være tom)
function validerEpost(epost) {
    if (!epost || epost.trim() === '') return true; // Valgfritt
    const epostStr = epost.trim();
    // Sjekk @ og . etter @
    const atPos = epostStr.indexOf('@');
    if (atPos === -1) return false;
    const dotPos = epostStr.lastIndexOf('.');
    if (dotPos <= atPos + 1) return false;
    return true;
}