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
    
    // Filtrer på de som utløper i dag eller innen 9 dager
    const idag = new Date();
    idag.setHours(0, 0, 0, 0);
    
    const om9Dager = new Date();
    om9Dager.setDate(idag.getDate() + 9);
    om9Dager.setHours(23, 59, 59, 999);
    
    const utlopende = unikeKort.filter(kort => {
        const sluttDato = new Date(kort.slutt_dato);
        return sluttDato >= idag && sluttDato <= om9Dager;
    });
    
    // Sorter stigende (nærmest først)
    utlopende.sort((a, b) => new Date(a.slutt_dato) - new Date(b.slutt_dato));
    
    if (utlopende.length === 0) {
        container.innerHTML = "<p style='color:green;'>Ingen kort utløper snart.</p>";
        return;
    }
    
    container.innerHTML = utlopende.map(kort => {
        const sluttDato = new Date(kort.slutt_dato);
        const daysLeft = Math.ceil((sluttDato - idag) / (1000 * 60 * 60 * 24));
        const isUrgent = daysLeft <= 7;
        
        return `
            <div style="font-size:12px; margin-bottom:5px; padding:5px; border-bottom:1px solid #eee; ${isUrgent ? 'font-weight:bold; color:black;' : ''}">
                <strong>${escapeHtml(kort.medlemmer.fornavn)} ${escapeHtml(kort.medlemmer.etternavn)}</strong><br>
                Utløper: ${kort.slutt_dato.split('-').reverse().join('.')} (${daysLeft} dager)
            </div>
        `;
    }).join('');
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
// Oppretter nytt medlem fra kontrollpanelet
async function adminOpprettMedlem() {
    const fornavn = document.getElementById('admin-fornavn').value.trim();
    const etternavn = document.getElementById('admin-etternavn').value.trim();
    
    if (!fornavn || !etternavn) {
        visBeskjed('Mangler', 'Fyll ut fornavn og etternavn', 'error');
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
        
        // Opprett nytt medlem
        const { data: newMember, error: memberError } = await sb
            .from('medlemmer')
            .insert([{ fornavn, etternavn, er_aktiv: true }])
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
        // Unngå "match alle" hvis input består av bare strippede spesialtegn
        if (!safe) return;
        const { data, error } = await sb
            .from('medlemmer')
            .select('id, fornavn, etternavn, tlf_mobil')
            .or(`fornavn.ilike.%${safe}%,etternavn.ilike.%${safe}%,tlf_mobil.ilike.%${safe}%`)
            .eq('er_aktiv', true)
            .limit(10);
        
        if (error) throw error;
        
       let bubble = document.getElementById('admin-search-bubble');
if (!bubble) {
    // Opprett boblen hvis den ikke finnes
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
            <div class="search-bubble-item" onclick="adminVelgMedlem('${member.id}', '${escapeHtml(member.fornavn)}', '${escapeHtml(member.etternavn)}', '${member.tlf_mobil || ''}')">
                <span class="search-bubble-name">${escapeHtml(member.fornavn)} ${escapeHtml(member.etternavn)}</span>
                <span class="search-bubble-phone">📱 ${member.tlf_mobil || 'Ingen telefon'}</span>
            </div>
        `).join('');
        
        bubble.style.display = 'block';
        
    } catch (err) {
        console.error("Søkefeil:", err);
    }
}

function adminVelgMedlem(id, fornavn, etternavn, mobil) {
    valgtAdminMedlem = { id, fornavn, etternavn, mobil };
    
    document.getElementById('admin-fornavn').value = fornavn;
    document.getElementById('admin-etternavn').value = etternavn;
    document.getElementById('admin-mobil').value = mobil || 'Ikke registrert';
    
    // Lukk boble
    const bubble = document.getElementById('admin-search-bubble');
    bubble.style.display = 'none';
    
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
    
    if (!fornavn || !etternavn) {
        visBeskjed('Feil', 'Fornavn og etternavn kan ikke være tomme', 'error');
        return;
    }
    
    showLoader(true);
    
    try {
        const { error } = await sb
            .from('medlemmer')
            .update({ fornavn, etternavn, oppdatert_at: new Date() })
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

async function adminSlettMedlem() {
    if (!valgtAdminMedlem) {
        visBeskjed('Feil', 'Søk opp og velg et medlem først', 'error');
        return;
    }
    
    visBekreftelse(
        'Bekreft sletting',
        `Er du sikker på at du vil slette ${valgtAdminMedlem.fornavn} ${valgtAdminMedlem.etternavn}?`,
        '🗑️',
        async () => {
            showLoader(true);
            try {
                const { error } = await sb
                    .from('medlemmer')
                    .update({ er_aktiv: false, oppdatert_at: new Date() })
                    .eq('id', valgtAdminMedlem.id);
                
                if (error) throw error;
                
                visBeskjed('Suksess', 'Medlemmet er slettet', 'success');
                adminAvbryt();
                
            } catch (err) {
                console.error('Feil ved sletting:', err);
                visBeskjed('Feil', 'Kunne ikke slette medlem', 'error');
            }
            showLoader(false);
        }
    );
}

// Oppdater adminAvbryt
function adminAvbryt() {
    valgtAdminMedlem = null;
    document.getElementById('admin-fornavn').value = '';
    document.getElementById('admin-etternavn').value = '';
    document.getElementById('admin-mobil').value = '';
    document.getElementById('admin-epost').value = '';
    document.getElementById('admin-member-search').value = '';
    document.getElementById('admin-search-bubble').style.display = 'none';
}