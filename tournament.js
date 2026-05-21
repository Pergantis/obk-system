// tournament.js - Turneringkalkulator for OBK
// Beregner fordeling av turneringsavgift med variable satser

let satsCounter = 3; // Starter med 3 satser
let sisteTurneringData = null; // Lagrer data for avstemming

// Hovedfunksjon - kalles når modulen vises
async function initTurnering() {
    const container = document.getElementById('turnering-container');
    if (!container) return;
    
    // Vent på at Supabase er klar
    if (!window.sb) {
        console.log('Venter på Supabase...');
        setTimeout(initTurnering, 100);
        return;
    }
    
    // Hent medlemmer for turneringsleder-søk
    await hentMedlemmerForSøk();
    
    // Render skjema
    renderTurneringSkjema();
}

// Henter medlemmer for søkefunksjon
async function hentMedlemmerForSøk() {
    console.log('Henter medlemmer...');
    const { data, error } = await window.sb
        .from('medlemmer')
        .select('id, fornavn, etternavn')
        .eq('er_aktiv', true);
    
    console.log('Resultat:', { data, error });
    
    if (!error && data) {
        window.turneringMedlemmer = data;
        console.log('Lagret', data.length, 'medlemmer');
    } else {
        console.log('Feil ved henting:', error);
    }
}

// Render hele skjemaet
function renderTurneringSkjema() {
    const container = document.getElementById('turnering-container');
    
    const html = `
        <div class="turnering-grid">
            <!-- Venstre: Skjema -->
            <div class="turnering-skjema">
                <div class="form-gruppe">
                    <label>📅 Dato</label>
                    <input type="date" id="tur-dato" value="${new Date().toISOString().split('T')[0]}">
                </div>
                
                <div class="form-gruppe">
                    <label>👤 Turneringsleder</label>
                    <div class="sok-container">
                        <input type="text" id="tur-leder-sok" placeholder="Søk etter medlem..." autocomplete="off">
                        <div id="tur-leder-boble" class="search-bubble hidden"></div>
                        <input type="hidden" id="tur-leder-id">
                        <input type="text" id="tur-leder-navn" readonly placeholder="Valgt leder vises her" class="readonly-felt">
                    </div>
                </div>
                
                <div class="form-gruppe">
                    <label>💰 Prosentfordeling (fast)</label>
                    <div class="prosent-visning">
                        <div class="prosent-boks">
                            <span class="prosent-tall">40%</span>
                            <span class="prosent-label">Klubb</span>
                        </div>
                        <div class="prosent-boks">
                            <span class="prosent-tall">60%</span>
                            <span class="prosent-label">Spillere</span>
                        </div>
                    </div>
                    <input type="hidden" id="tur-klubb-prosent" value="40">
                    <input type="hidden" id="tur-spiller-prosent" value="60">
                </div>
                
                <div class="form-gruppe">
                    <label>🏆 Avsetning til finale (kr per spiller)</label>
                    <input type="number" id="tur-avsetning" value="0" step="1">
                </div>
                
                <div class="form-gruppe">
                    <label>📊 Satser (legg til antall spillere og avgift)</label>
                    <div id="satser-container"></div>
                    <button type="button" class="btn btn-small" onclick="leggTilSats()">+ Legg til sats</button>
                </div>
                
                <!-- Avstemming og utbetalingsplan -->
                <div class="avstemming-container" style="margin-top: 30px;">
                    <h3>📊 Avstemming & Utbetaling</h3>
                    <div class="avstemming-grid">
                        <!-- Venstre kolonne - Avstemming -->
                        <div class="avstemming-input">
                            <h4>Avstemming</h4>
                            <div class="avstemming-rad">
                                <span>Sum innbetalt:</span>
                                <span id="avstem-sum-innbetalt">0 kr</span>
                            </div>
                            <div class="avstemming-rad">
                                <label>Vipps:</label>
                                <input type="number" id="avstem-vipps" value="0" step="100" class="avstem-input">
                            </div>
                            <div class="avstemming-rad">
                                <label>Kort:</label>
                                <input type="number" id="avstem-kort" value="0" step="100" class="avstem-input">
                            </div>
                            <div class="avstemming-rad">
                                <label>Kontant:</label>
                                <input type="number" id="avstem-kontant" value="0" step="100" class="avstem-input">
                            </div>
                            <div class="avstemming-rad avvik">
                                <span>Avvik:</span>
                                <span id="avstem-avvik">0 kr</span>
                            </div>
                        </div>
                        
                        <!-- Høyre kolonne - Utbetalingsplan -->
                        <div class="utbetalingsplan-input">
                            <h4>Utbetalingsplan</h4>
                            <div id="utbetalingsplan-innhold">
                                <div class="utbetalingsrad">
                                    <span>Premier utbetales via Vipps:</span>
                                    <span id="plan-vipps-premier">0 kr</span>
                                </div>
                                <div class="utbetalingsrad">
                                    <span>Rest Vipps til kassen:</span>
                                    <span id="plan-vipps-kasse">0 kr</span>
                                </div>
                                <div class="utbetalingsrad">
                                    <span>Kontant til kassen:</span>
                                    <span id="plan-kontant-kasse">0 kr</span>
                                </div>
                                <div class="utbetalingsrad">
                                    <span>Kort til kassen:</span>
                                    <span id="plan-kort-kasse">0 kr</span>
                                </div>
                                <div class="utbetalingsrad sum">
                                    <span>Sum:</span>
                                    <span id="plan-sum">0 kr</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Høyre: Resultat -->
            <div class="turnering-resultat">
                <h3>📊 Resultat</h3>
                
                <!-- Premieutbetalingsmodell -->
                <div class="premie-modell">
                    <label>🏆 Premiefordeling:</label>
                    <div class="radiogruppe">
                        <label class="radio-label">
                            <input type="radio" name="premiemodell" value="1" checked> Premie 1. til 3. plass: 1.=50%, 2.=25%, 3.=12,5% + 12,5%
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="premiemodell" value="2"> Premie 1. og 2. plass: 1.=66%, 2.=34%
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="premiemodell" value="3"> Premie 1. til 5. plass: 1.=36%, 2.=18%, 3.=12% + 12%, 5.=5,5% × 4 stk
                        </label>
                    </div>
                </div>
                
                <div id="beregning-visning">
                    <p>Fyll inn data for å se beregning</p>
                </div>
                
                <button class="btn btn-lagre" onclick="lagreTurnering()" style="margin-top:20px; width:100%;">💾 Lagre turnering</button>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    
    // Render satser
    renderSatser();
    
    // Sett opp event listeners for beregning
    setupBeregningsListenere();
    
    // Sett opp søk for turneringsleder
    setupLederSok();
    
    // Sett opp avstemming
    setupAvstemmingListenere();
    oppdaterAvstemming();
}

// Render satsene (3 som standard)
function renderSatser() {
    const container = document.getElementById('satser-container');
    if (!container) return;
    
    let html = '';
    for (let i = 1; i <= satsCounter; i++) {
        html += `
            <div class="sats-rad" id="sats-${i}">
                <div class="sats-navn">
                    <input type="text" value="Sats ${i}" placeholder="Navn" class="sats-navn-input">
                </div>
                <div class="sats-antall">
                    <label>Antall spillere</label>
                    <input type="number" value="0" min="0" class="sats-antall-input" data-sats="${i}">
                </div>
                <div class="sats-avgift">
                    <label>Avgift</label>
                    <input type="number" value="0" min="0" step="10" class="sats-avgift-input" data-sats="${i}">
                </div>
                <button class="btn-slett" onclick="fjernSats(${i})" title="Fjern">✖</button>
            </div>
        `;
    }
    container.innerHTML = html;
    
    // Legg til event listeners på nye inputs
    document.querySelectorAll('.sats-antall-input, .sats-avgift-input').forEach(input => {
        input.addEventListener('input', () => {
            beregnTurnering();
            oppdaterAvstemming();
        });
    });
    document.querySelectorAll('.sats-navn-input').forEach(input => {
        input.addEventListener('input', () => beregnTurnering());
    });
    
    beregnTurnering();
}

// Legg til ny sats
function leggTilSats() {
    satsCounter++;
    renderSatser();
}

// Fjern sats
function fjernSats(satsNr) {
    if (satsCounter <= 1) {
        visBeskjed('Feil', 'Du må ha minst én sats', 'error');
        return;
    }
    
    const element = document.getElementById(`sats-${satsNr}`);
    if (element) element.remove();
    
    // Re-index resterende satser og oppdater teller
    oppdaterSatsIndekser();
    satsCounter--;
    beregnTurnering();
}

// Oppdater indekser etter sletting
function oppdaterSatsIndekser() {
    const rader = document.querySelectorAll('.sats-rad');
    rader.forEach((rad, idx) => {
        const nyIndeks = idx + 1;
        rad.id = `sats-${nyIndeks}`;
        
        const antallInput = rad.querySelector('.sats-antall-input');
        const avgiftInput = rad.querySelector('.sats-avgift-input');
        if (antallInput) antallInput.dataset.sats = nyIndeks;
        if (avgiftInput) avgiftInput.dataset.sats = nyIndeks;
    });
    satsCounter = rader.length;
}

// Sett opp event listeners for avsetning
function setupBeregningsListenere() {
    const avsetning = document.getElementById('tur-avsetning');
    if (avsetning) avsetning.addEventListener('input', () => {
        beregnTurnering();
        oppdaterAvstemming();
    });
    
    setupPremieLytter();
}

// Setter opp lytter for premie-modell radioknapper
function setupPremieLytter() {
    const radioer = document.querySelectorAll('input[name="premiemodell"]');
    radioer.forEach(radio => {
        radio.addEventListener('change', () => beregnTurnering());
    });
}

// Beregner hvordan premiepotten fordeles basert på valgt modell
function beregnPremieFordeling(premiepott, modell) {
    const fordeling = [];
    
    if (modell === '1') {
        fordeling.push({ plass: '1. plass', prosent: 50, belop: (premiepott * 50) / 100 });
        fordeling.push({ plass: '2. plass', prosent: 25, belop: (premiepott * 25) / 100 });
        fordeling.push({ plass: '3. plass (A)', prosent: 12.5, belop: (premiepott * 12.5) / 100 });
        fordeling.push({ plass: '3. plass (B)', prosent: 12.5, belop: (premiepott * 12.5) / 100 });
    } 
    else if (modell === '2') {
        fordeling.push({ plass: '1. plass', prosent: 66, belop: (premiepott * 66) / 100 });
        fordeling.push({ plass: '2. plass', prosent: 34, belop: (premiepott * 34) / 100 });
    } 
    else if (modell === '3') {
        fordeling.push({ plass: '1. plass', prosent: 36, belop: (premiepott * 36) / 100 });
        fordeling.push({ plass: '2. plass', prosent: 18, belop: (premiepott * 18) / 100 });
        fordeling.push({ plass: '3. plass (A)', prosent: 12, belop: (premiepott * 12) / 100 });
        fordeling.push({ plass: '3. plass (B)', prosent: 12, belop: (premiepott * 12) / 100 });
        fordeling.push({ plass: '5. plass (A)', prosent: 5.5, belop: (premiepott * 5.5) / 100 });
        fordeling.push({ plass: '5. plass (B)', prosent: 5.5, belop: (premiepott * 5.5) / 100 });
        fordeling.push({ plass: '5. plass (C)', prosent: 5.5, belop: (premiepott * 5.5) / 100 });
        fordeling.push({ plass: '5. plass (D)', prosent: 5.5, belop: (premiepott * 5.5) / 100 });
    }
    
    return fordeling;
}

// Hovedberegning
function beregnTurnering() {
    const klubbProsent = 40;
    const spillerProsent = 60;
    const avsetningPerSpiller = parseInt(document.getElementById('tur-avsetning')?.value || 0);
    
    let totalSpillere = 0;
    let totalAvgiftInn = 0;
    let satsDetaljer = [];
    
    const rader = document.querySelectorAll('.sats-rad');
    rader.forEach(rad => {
        const navnInput = rad.querySelector('.sats-navn-input');
        const navn = navnInput ? navnInput.value : 'Ukjent';
        const antall = parseInt(rad.querySelector('.sats-antall-input')?.value || 0);
        const avgift = parseInt(rad.querySelector('.sats-avgift-input')?.value || 0);
        
        if (antall > 0 && avgift > 0) {
            totalSpillere += antall;
            totalAvgiftInn += antall * avgift;
            satsDetaljer.push({ navn, antall, avgift, sum: antall * avgift });
        }
    });
    
    if (totalSpillere === 0) {
        document.getElementById('beregning-visning').innerHTML = '<p>Legg til minst én spiller for å se beregning</p>';
        return;
    }
    
    const klubbAndel = (totalAvgiftInn * klubbProsent) / 100;
    const spillerPottForPremier = (totalAvgiftInn * spillerProsent) / 100;
    const totalAvsetning = totalSpillere * avsetningPerSpiller;
    const utbetalesNå = spillerPottForPremier - totalAvsetning;
    const tilKlubbenTotalt = klubbAndel + totalAvsetning;
    
    const valgtModell = document.querySelector('input[name="premiemodell"]:checked')?.value || '1';
    const premieFordeling = beregnPremieFordeling(utbetalesNå, valgtModell);
    
    let premieHtml = '<div class="resultat-seksjon"><h4>🏆 Premiefordeling (Modell ' + valgtModell + ')</h4>';
    premieFordeling.forEach(p => {
        premieHtml += `
            <div class="resultat-rad">
                <span>${p.plass} (${p.prosent}%):</span>
                <strong>${p.belop.toLocaleString('no-NO')} kr</strong>
            </div>
        `;
    });
    premieHtml += '</div>';
    
    const html = `
        <div class="resultat-oppsummering">
            <div class="resultat-rad">
                <span>👥 Totalt antall spillere:</span>
                <strong>${totalSpillere}</strong>
            </div>
            <div class="resultat-rad">
                <span>💰 Sum innbetalt:</span>
                <strong>${totalAvgiftInn.toLocaleString('no-NO')} kr</strong>
            </div>
            
            <div class="resultat-seksjon">
                <h4>🏢 Klubbens andel (${klubbProsent}%)</h4>
                <div class="resultat-rad">
                    <span>Grunnandel:</span>
                    <strong>${klubbAndel.toLocaleString('no-NO')} kr</strong>
                </div>
            </div>
            
            <div class="resultat-seksjon">
                <h4>🎯 Spillernes pott (${spillerProsent}%)</h4>
                <div class="resultat-rad">
                    <span>Premiepott:</span>
                    <strong>${spillerPottForPremier.toLocaleString('no-NO')} kr</strong>
                </div>
                <div class="resultat-rad">
                    <span>Avsetning til finale (${avsetningPerSpiller} kr/spiller):</span>
                    <strong class="avsetning">- ${totalAvsetning.toLocaleString('no-NO')} kr</strong>
                </div>
                <div class="resultat-rad utbetalt">
                    <span>💰 Utbetales til spillere nå:</span>
                    <strong>${utbetalesNå.toLocaleString('no-NO')} kr</strong>
                </div>
            </div>
            
            ${premieHtml}
            
            <div class="resultat-seksjon total-klubb">
                <h4>🏦 Til klubben totalt (nå)</h4>
                <div class="resultat-rad">
                    <span>Klubbandel + Avsetning:</span>
                    <strong>${tilKlubbenTotalt.toLocaleString('no-NO')} kr</strong>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('beregning-visning').innerHTML = html;
}

// Søk etter turneringsleder
function setupLederSok() {
    const søkInput = document.getElementById('tur-leder-sok');
    const boble = document.getElementById('tur-leder-boble');
    
    if (!søkInput) return;
    
    søkInput.addEventListener('input', async (e) => {
        const søkeord = e.target.value.toLowerCase();
        
        if (søkeord.length < 2) {
            boble.classList.add('hidden');
            return;
        }
        
        const medlemmer = window.turneringMedlemmer || [];
        const treff = medlemmer.filter(m => 
            m.fornavn.toLowerCase().includes(søkeord) || 
            m.etternavn.toLowerCase().includes(søkeord)
        ).slice(0, 8);
        
        if (treff.length === 0) {
            boble.innerHTML = '<div class="boble-item">Ingen treff</div>';
            boble.classList.remove('hidden');
            return;
        }
        
        boble.innerHTML = treff.map(m => `
            <div class="boble-item" onclick="velgTurneringsleder('${m.id}', '${escapeHtml(m.fornavn)} ${escapeHtml(m.etternavn)}')">
                <strong>${escapeHtml(m.fornavn)} ${escapeHtml(m.etternavn)}</strong>
            </div>
        `).join('');
        boble.classList.remove('hidden');
    });
    
    document.addEventListener('click', (e) => {
        if (!søkInput.contains(e.target) && !boble.contains(e.target)) {
            boble.classList.add('hidden');
        }
    });
}

// Velg turneringsleder
function velgTurneringsleder(id, navn) {
    document.getElementById('tur-leder-id').value = id;
    document.getElementById('tur-leder-navn').value = navn;
    document.getElementById('tur-leder-sok').value = '';
    document.getElementById('tur-leder-boble').classList.add('hidden');
}

// Beregn totalAvgiftInn og premier
function getTurneringBeregninger() {
    let totalSpillere = 0;
    let totalAvgiftInn = 0;
    
    const rader = document.querySelectorAll('.sats-rad');
    rader.forEach(rad => {
        const antall = parseInt(rad.querySelector('.sats-antall-input')?.value || 0);
        const avgift = parseInt(rad.querySelector('.sats-avgift-input')?.value || 0);
        if (antall > 0 && avgift > 0) {
            totalSpillere += antall;
            totalAvgiftInn += antall * avgift;
        }
    });
    
    const avsetningPerSpiller = parseInt(document.getElementById('tur-avsetning')?.value || 0);
    const spillerPott = (totalAvgiftInn * 60) / 100;
    const premier = spillerPott - (totalSpillere * avsetningPerSpiller);
    
    return { totalAvgiftInn, premier: premier > 0 ? premier : 0 };
}

// Sett opp event listeners for avstemming
function setupAvstemmingListenere() {
    const vipps = document.getElementById('avstem-vipps');
    const kort = document.getElementById('avstem-kort');
    const kontant = document.getElementById('avstem-kontant');
    
    if (vipps) vipps.addEventListener('input', () => oppdaterAvstemming());
    if (kort) kort.addEventListener('input', () => oppdaterAvstemming());
    if (kontant) kontant.addEventListener('input', () => oppdaterAvstemming());
}

// Oppdaterer avstemming og utbetalingsplan
function oppdaterAvstemming() {
    const vipps = parseInt(document.getElementById('avstem-vipps')?.value) || 0;
    const kort = parseInt(document.getElementById('avstem-kort')?.value) || 0;
    const kontant = parseInt(document.getElementById('avstem-kontant')?.value) || 0;
    
    const sumMottatt = vipps + kort + kontant;
    const { totalAvgiftInn, premier } = getTurneringBeregninger();
    
    const avvik = totalAvgiftInn - sumMottatt;
    
    // Oppdater avstemming-visning
    document.getElementById('avstem-sum-innbetalt').innerText = totalAvgiftInn.toLocaleString('no-NO') + ' kr';
    const avvikEl = document.getElementById('avstem-avvik');
    avvikEl.innerText = avvik.toLocaleString('no-NO') + ' kr';
    avvikEl.style.color = avvik === 0 ? 'green' : 'var(--advarsel)';
    
    // Beregn utbetalingsplan
    let vippsPremier = 0;
    let vippsKasse = 0;
    let kontantKasse = 0;
    let kortKasse = 0;
    let bankMangel = 0;
    
    if (vipps >= premier) {
        // Situasjon A
        vippsPremier = premier;
        vippsKasse = vipps - premier;
        kontantKasse = kontant;
        kortKasse = kort;
        bankMangel = 0;
    } else if (vipps + kontant >= premier) {
        // Situasjon B
        vippsPremier = vipps;
        const restKontant = premier - vipps;
        vippsKasse = 0;
        kontantKasse = kontant - restKontant;
        kortKasse = kort;
        bankMangel = 0;
    } else {
        // Situasjon C
        vippsPremier = vipps;
        kontantKasse = 0;
        kortKasse = kort;
        bankMangel = premier - (vipps + kontant);
    }
    
    // Oppdater utbetalingsplan-visning
    if (bankMangel > 0) {
        document.getElementById('plan-vipps-premier').innerHTML = `${vippsPremier.toLocaleString('no-NO')} kr <span style="color:red;">(mangler ${bankMangel.toLocaleString('no-NO')} kr via bank)</span>`;
    } else {
        document.getElementById('plan-vipps-premier').innerText = vippsPremier.toLocaleString('no-NO') + ' kr';
    }
    
    document.getElementById('plan-vipps-kasse').innerText = vippsKasse.toLocaleString('no-NO') + ' kr';
    document.getElementById('plan-kontant-kasse').innerText = kontantKasse.toLocaleString('no-NO') + ' kr';
    document.getElementById('plan-kort-kasse').innerText = kortKasse.toLocaleString('no-NO') + ' kr';
    
    const sumPlan = vippsPremier + vippsKasse + kontantKasse + kortKasse;
    document.getElementById('plan-sum').innerText = sumPlan.toLocaleString('no-NO') + ' kr';
}

// Lagre turnering i databasen
async function lagreTurnering() {
    // Sjekk at vi har turneringsdata
    const lederId = document.getElementById('tur-leder-id')?.value;
    
    if (!lederId) {
        visBeskjed('Mangler', 'Velg en turneringsleder', 'error');
        return;
    }
    
    // Hent data for validering
    const { totalAvgiftInn, premier, harSatser, avvik } = getTurneringValidering();
    
    if (!harSatser) {
        visBeskjed('Mangler', 'Legg til minst én sats med spillere og avgift', 'error');
        return;
    }
    
    if (avvik !== 0) {
        visBeskjed('Avvik-Kan ikke lagre turneringen', `Sum mottatt (${(totalAvgiftInn - avvik).toLocaleString('no-NO')} kr) er ikke lik turneringsavgift (${totalAvgiftInn.toLocaleString('no-NO')} kr). Avvik: ${avvik.toLocaleString('no-NO')} kr`, 'error');
        return;
    }
    
    if (premier <= 0) {
        visBeskjed('Ingen premier', 'Premiepotten er 0 – kan ikke lagre turnering uten premier', 'error');
        return;
    }
    
    // Vis bekreftelse før lagring
    visBekreftelse(
        'Lagre turnering?',
        `Er du sikker på at du vil lagre denne turneringen?\n\nSum turneringsavgift: ${totalAvgiftInn.toLocaleString('no-NO')} kr\nPremier: ${premier.toLocaleString('no-NO')} kr`,
        '💾',
        async () => {
            // OK - utfør lagring
            await utførLagring();
        },
        () => {
            // Avbryt - gjør ingenting
            console.log('Lagring avbrutt');
        }
    );
}

// Henter valideringsdata fra skjemaet
function getTurneringValidering() {
    let totalSpillere = 0;
    let totalAvgiftInn = 0;
    let harSatser = false;
    
    const rader = document.querySelectorAll('.sats-rad');
    rader.forEach(rad => {
        const antall = parseInt(rad.querySelector('.sats-antall-input')?.value || 0);
        const avgift = parseInt(rad.querySelector('.sats-avgift-input')?.value || 0);
        if (antall > 0 && avgift > 0) {
            harSatser = true;
            totalSpillere += antall;
            totalAvgiftInn += antall * avgift;
        }
    });
    
    const avsetning = parseInt(document.getElementById('tur-avsetning')?.value || 0);
    const spillerPott = (totalAvgiftInn * 60) / 100;
    const premier = spillerPott - (totalSpillere * avsetning);
    
    const vipps = parseInt(document.getElementById('avstem-vipps')?.value || 0);
    const kort = parseInt(document.getElementById('avstem-kort')?.value || 0);
    const kontant = parseInt(document.getElementById('avstem-kontant')?.value || 0);
    const sumMottatt = vipps + kort + kontant;
    const avvik = totalAvgiftInn - sumMottatt;
    
    return { totalAvgiftInn, premier, harSatser, avvik };
}

// Utfører selve lagringen til database
async function utførLagring() {
    const dato = document.getElementById('tur-dato')?.value;
    const lederId = document.getElementById('tur-leder-id')?.value;
    const avsetning = parseInt(document.getElementById('tur-avsetning')?.value) || 0;
    const premiemodell = parseInt(document.querySelector('input[name="premiemodell"]:checked')?.value || '1');
    
    // Hent satser
    const satser = [];
    const rader = document.querySelectorAll('.sats-rad');
    let totalAvgiftInn = 0;
    
    rader.forEach(rad => {
        const navn = rad.querySelector('.sats-navn-input')?.value;
        const antall = parseInt(rad.querySelector('.sats-antall-input')?.value || 0);
        const avgift = parseInt(rad.querySelector('.sats-avgift-input')?.value || 0);
        if (antall > 0 && avgift > 0) {
            satser.push({ navn, antall, avgift });
            totalAvgiftInn += antall * avgift;
        }
    });
    
    // Hent mottatte beløp
    const vipps = parseInt(document.getElementById('avstem-vipps')?.value || 0);
    const kort = parseInt(document.getElementById('avstem-kort')?.value || 0);
    const kontant = parseInt(document.getElementById('avstem-kontant')?.value || 0);
    
    // Beregn premier
    let totalSpillere = 0;
    satser.forEach(s => totalSpillere += s.antall);
    const spillerPott = (totalAvgiftInn * 60) / 100;
    const premier = spillerPott - (totalSpillere * avsetning);
    
    // Data for database
    const turneringData = {
        dato,
        turneringsleder_id: lederId,
        avsetning_per_spiller: avsetning,
        premiemodell: premiemodell,
        satser: satser,
        total_avgift_inn: totalAvgiftInn,
        premier: premier,
        mottatt_vipps: vipps,
        mottatt_kort: kort,
        mottatt_kontant: kontant
    };
    
    console.log('Lagrer turnering:', turneringData);
    
    // Lagre til Supabase
    const { data, error } = await window.sb
        .from('turneringer')
        .insert([turneringData])
        .select();
    
    if (error) {
        console.error('Feil ved lagring:', error);
        visBeskjed('Feil ved lagring', error.message, 'error');
    } else {
        console.log('Lagret:', data);
        visBeskjed('✅ Turnering lagret!', `Turneringen er lagret i databasen.\nID: ${data[0].id}`, 'success');
        
        // Last om siden etter 1.5 sekund
        setTimeout(() => {
            window.location.reload();
        }, 1500);
    }
}
