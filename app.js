window.sb = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.KEY);

let selectedMemberId = null;

function showModule(id) {
    document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    // Fjern alle bobler når man bytter modul
    // Fjern bobler kun fra den modulen som skjules
document.querySelectorAll('.module').forEach(module => {
    if (!module.classList.contains('active')) {
        const bobler = module.querySelectorAll('.search-bubble');
        bobler.forEach(b => b.remove());
    }
});
    
    document.getElementById('mod-' + id).classList.add('active');
    document.getElementById('btn-' + id).classList.add('active');
    
    // Spesifikke lastinger per modul
    if (id === 'bord') loadTables();
    if (id === 'medlem') updateMemberModule();
    if (id === 'skap') {
    loadLockers();
    }
    if (id === 'turnering') initTurnering();
    if (id === 'vaktplan') initVaktplan();
    if (id === 'admin') initAdminPanel(); 
}

function showLoader(show) { document.getElementById('sync-loader').style.display = show ? 'block' : 'none'; }
function showError(msg) { const el = document.getElementById('error-log'); el.innerText = msg; el.style.display = 'block'; }

// Fjerner tegn som kan bryte PostgREST-filter eller utvide ilike-wildcard.
// Brukes på fritekst-input før den interpoleres inn i .or()/.ilike()-filter.
// NB: apostrof ' og bindestrek - er bevisst IKKE i strippe-settet — de finnes i
// legitime navn (O'Brien, Anne-Marie). Supabase-klienten URL-encoder dem.
function sanitizeSearchQuery(query) {
    if (!query) return '';
    return String(query).replace(/[,():%_*\\"\r\n]/g, '');
}

// Escaper HTML-spesialtegn — bruk før innsetting i innerHTML eller value="...".
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

// --- DATO-HJELPERE (LOKAL TIDSSONE) ---
// Norge er UTC+1/+2 — bruk disse i stedet for toISOString().split('T')[0]
// for å unngå off-by-one nær midnatt.

function getTodayLocal() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

function addDaysLocal(dateStr, days) {
    const date = parseLocalDate(dateStr);
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateForDisplay(isoDate) {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

window.addEventListener('load', () => {
    loadTables();
    updateMemberModule();
    loadLockers();
});
// --- VAKTPLAN PROTOTYPE LOGIKK ---



// Genererer en test-kalender for Mai 2026
function renderVaktplanPrototype() {
    const tbody = document.getElementById('vakt-body-prototype');
    if (!tbody) return;
    
    tbody.innerHTML = "";
    // Vi lager 5 uker for mai (forenklet prototype)
    const uker = [18, 19, 20, 21, 22];
    let datoTeller = 1;

    uker.forEach((uke, index) => {
        let tr = document.createElement('tr');
        
        // Uke-nummer kolonne
        tr.innerHTML = `<td style="background:#f1efe7; font-weight:bold; text-align:center; width:55px;">${uke}</td>`;
        
        for (let dag = 1; dag <= 7; dag++) {
            let td = document.createElement('td');
            if (dag > 5) td.classList.add('td-weekend');

            // Vi starter 1. mai på en fredag (dag 5) i denne prototypen
            if ((index === 0 && dag < 5) || datoTeller > 31) {
                td.innerHTML = `<div style="color:#ccc; text-align:center;">—</div>`;
            } else {
                // Mock data: fyller inn noen navn
                let navn1 = ""; let navn2 = "";
                if (dag === 1 || dag === 2 || dag === 5) navn1 = "Pergantis";
                if (dag === 6 || dag === 7) { navn1 = "Maria"; navn2 = "Ekstra"; }
                if (dag === 3 || dag === 4) navn1 = "Hoved";

                td.innerHTML = `
                    <div class="vakt-cell">
                        <div class="vakt-date">${datoTeller}.</div>
                        <input type="text" class="vakt-input" value="${navn1}" placeholder="Hoved">
                        <input type="text" class="vakt-input" value="${navn2}" placeholder="Ekstra">
                    </div>`;
                datoTeller++;
            }
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    });
}

// Sørg for at prototypen tegnes når man går inn på modulen
const originalShowModule = showModule;
showModule = function(id) {
    originalShowModule(id);
    if (id === 'vaktplan') renderVaktplanPrototype();
};
// --- MOBIL-MENY LOGIKK ---

/**
 * Åpner eller lukker hovedmenyen på mobil.
 * @param {string} action - Hvis 'close', vil menyen alltid lukkes.
 */
function toggleMenu(action) {
    const nav = document.getElementById('main-nav');
    if (!nav) return;

    if (action === 'close') {
        // Lukker menyen (brukes når man klikker på en modul-knapp)
        nav.classList.remove('open');
    } else {
        // Skifter mellom åpen og lukket
        nav.classList.toggle('open');
    }
}
// Lukk meny når man klikker utenfor på mobil
document.addEventListener('click', function(e) {
    const nav = document.getElementById('main-nav');
    const menuBtn = document.querySelector('.menu-btn');
    
    // Sjekk om menyen er åpen på mobil (window width < 1024px)
    if (window.innerWidth < 1024 && nav && nav.classList.contains('open')) {
        // Sjekk om klikket er utenfor menyen OG utenfor menyknappen
        if (!nav.contains(e.target) && !menuBtn?.contains(e.target)) {
            toggleMenu('close');
        }
    }
});
// --- PIN-LÅS SYSTEM ---
const PINKODE = "19891989";
let pinTimer = null;
let pinTimeout = null;

function visPinModal() {
    // Fjern eksisterende modal hvis den finnes
    const eksisterende = document.getElementById('pin-overlay');
    if (eksisterende) eksisterende.remove();
    
    const modal = document.createElement('div');
    modal.id = 'pin-overlay';
    modal.className = 'pin-overlay';
    modal.innerHTML = `
        <div class="pin-modal">
            <div class="pin-logo">
                <img src="logoobk.png" alt="OBK Logo" onerror="this.src='https://placehold.co/120x80?text=OBK'">
            </div>
            <div class="pin-title">Bak Disken system</div>
            <div class="pin-subtitle">Låst - Skriv inn PIN-kode</div>
            
            <div class="pin-input-wrapper">
                <input type="password" id="pin-input" class="pin-input" maxlength="8" placeholder="········" autocomplete="off">
            </div>
            
            <button class="show-pin-btn" id="show-pin-toggle">👁 Vis PIN</button>
            <button class="unlock-btn" id="unlock-btn">🔓 LÅS OPP</button>
            
            <div id="pin-error" class="pin-error" style="display: none;">❌ Feil PIN-kode. Prøv igjen.</div>
            
            <div class="pin-contact">
                📞 Ved tilgangsproblemer, kontakt Pergantis på <a href="tel:92641953">92641953</a>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.classList.add('pin-active');
    document.body.classList.remove('pin-inactive');
    
    const pinInput = document.getElementById('pin-input');
    const unlockBtn = document.getElementById('unlock-btn');
    const showPinToggle = document.getElementById('show-pin-toggle');
    const errorDiv = document.getElementById('pin-error');
    
    pinInput.focus();
    
    // Vis/skjul PIN
    showPinToggle.addEventListener('click', () => {
        if (pinInput.type === 'password') {
            pinInput.type = 'text';
            showPinToggle.innerHTML = '🙈 Skjul PIN';
        } else {
            pinInput.type = 'password';
            showPinToggle.innerHTML = '👁 Vis PIN';
        }
    });
    
    // Enter-tast
    pinInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sjekkPin(pinInput.value, errorDiv);
        }
    });
    
    unlockBtn.addEventListener('click', () => {
        sjekkPin(pinInput.value, errorDiv);
    });
}

function sjekkPin(verdi, errorDiv) {
    if (verdi === PINKODE) {
        // Riktig PIN
        document.getElementById('pin-overlay').remove();
        document.body.classList.remove('pin-active');
        document.body.classList.add('pin-inactive');
        startPinSession();
        visStatusBar();
    } else {
        errorDiv.style.display = 'block';
        document.getElementById('pin-input').value = '';
        document.getElementById('pin-input').focus();
    }
}

function startPinSession() {
    // Fjern eventuelle gamle timere
    if (pinTimer) clearInterval(pinTimer);
    if (pinTimeout) clearTimeout(pinTimeout);
    
    // Lagre i sessionStorage
    sessionStorage.setItem('pin_auth', 'true');
    sessionStorage.setItem('pin_expiry', Date.now() + (2 * 60 * 60 * 1000));
    
    oppdaterNedtelling();
    
    // Start nedtelling
    pinTimer = setInterval(oppdaterNedtelling, 1000);
    
    // Auto-lås etter 2 timer
    pinTimeout = setTimeout(() => {
        lockSystem();
    }, 2 * 60 * 60 * 1000);
}

function oppdaterNedtelling() {
    const expiry = sessionStorage.getItem('pin_expiry');
    if (!expiry) return;
    
    const igjen = parseInt(expiry) - Date.now();
    if (igjen <= 0) {
        lockSystem();
        return;
    }
    
    const timer = document.getElementById('session-timer');
    if (timer) {
        const min = Math.floor(igjen / 60000);
        const sek = Math.floor((igjen % 60000) / 1000);
        timer.innerText = `⏱ ${min}:${sek.toString().padStart(2, '0')} igjen`;
    }
}

function visStatusBar() {
    // Fjern eksisterende
    const eksisterende = document.getElementById('status-bar');
    if (eksisterende) eksisterende.remove();
    
    const statusBar = document.createElement('div');
    statusBar.id = 'status-bar';
    statusBar.className = 'status-bar';
    statusBar.innerHTML = `
        <div class="status-badge">
            🟢 Bak disken
        </div>
        <div class="status-timer" id="session-timer">⏱ 2:00 igjen</div>
        <button class="logout-btn" id="logout-btn">🔒 Logg ut</button>
    `;
    
    document.body.insertBefore(statusBar, document.body.firstChild);
    
    document.getElementById('logout-btn').addEventListener('click', () => {
        lockSystem();
    });
    
    oppdaterNedtelling();
}

function lockSystem() {
    // Rydd opp
    if (pinTimer) clearInterval(pinTimer);
    if (pinTimeout) clearTimeout(pinTimeout);
    
    // Fjern session
    sessionStorage.removeItem('pin_auth');
    sessionStorage.removeItem('pin_expiry');
    
    // Fjern statusbar
    const statusBar = document.getElementById('status-bar');
    if (statusBar) statusBar.remove();
    
    // Vis PIN-modal igjen
    visPinModal();
}

function sjekkEksisterendeSession() {
    const auth = sessionStorage.getItem('pin_auth');
    const expiry = sessionStorage.getItem('pin_expiry');
    
    if (auth === 'true' && expiry && parseInt(expiry) > Date.now()) {
        // Økten er gyldig
        document.body.classList.remove('pin-active');
        document.body.classList.add('pin-inactive');
        startPinSession();
        visStatusBar();
    } else {
        // Ingen gyldig økt
        sessionStorage.removeItem('pin_auth');
        sessionStorage.removeItem('pin_expiry');
        visPinModal();
    }
}
// Enkel og pen beskjed i stedet for stygg alert()
function showToast(message, type = 'success') {
    // Fjern gammel toast hvis den finnes
    const oldToast = document.querySelector('.toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = (type === 'success' ? '✅ ' : '⚠️ ') + message;
    
    document.body.appendChild(toast);

    // Vis den (liten delay for at animasjonen skal starte)
    setTimeout(() => toast.classList.add('show'), 10);

    // Fjern den etter 3 sekunder
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}
// START-Funksjon for å vise vår egen stilinge alert
window.visBeskjed = function(tittel, melding, type = 'success') {
    const modal = document.getElementById('custom-alert');
    const tittelFelt = document.getElementById('alert-title');
    const meldingFelt = document.getElementById('alert-message');
    const innhold = document.querySelector('.c-modal-content');
    
    tittelFelt.innerText = tittel.toUpperCase();
    meldingFelt.innerText = melding;
    
    // Tilpass farge etter type
    if (type === 'error') {
        innhold.style.borderColor = 'red';
    } else {
        innhold.style.borderColor = 'var(--biljard-gronn)';
    }

    modal.style.display = 'flex';
};

// Funksjon for å lukke
window.lukkBeskjed = function() {
    document.getElementById('custom-alert').style.display = 'none';
};
// SLUTT-Funksjon for å vise vår egen stilinge alert
// Start systemet
sjekkEksisterendeSession();

// --- BEKREFTELSESMODAL (JA/NEI) ---
let confirmCallback = null;

window.visBekreftelse = function(tittel, melding, emoji, onConfirm, onCancel) {
    const modal = document.getElementById('custom-confirm');
    const tittelFelt = document.getElementById('confirm-title');
    const meldingFelt = document.getElementById('confirm-message');
    const iconFelt = document.getElementById('confirm-icon');
    const jaKnapp = document.getElementById('confirm-yes');
    const neiKnapp = document.getElementById('confirm-no');
    
    // Sett innhold
    tittelFelt.innerText = tittel.toUpperCase();
    meldingFelt.innerText = melding;
    iconFelt.innerText = emoji || '🤔';
    
    // Lagre callbacks
    confirmCallback = { onConfirm, onCancel };
    
    // Fjern gamle event listeners for å unngå duplikater
    const newJaKnapp = jaKnapp.cloneNode(true);
    const newNeiKnapp = neiKnapp.cloneNode(true);
    jaKnapp.parentNode.replaceChild(newJaKnapp, jaKnapp);
    neiKnapp.parentNode.replaceChild(newNeiKnapp, neiKnapp);
    
    // Legg til nye event listeners
    newJaKnapp.addEventListener('click', () => {
        modal.style.display = 'none';
        if (confirmCallback && confirmCallback.onConfirm) {
            confirmCallback.onConfirm();
        }
        confirmCallback = null;
    });
    
    newNeiKnapp.addEventListener('click', () => {
        modal.style.display = 'none';
        if (confirmCallback && confirmCallback.onCancel) {
            confirmCallback.onCancel();
        }
        confirmCallback = null;
    });
    
    // Vis modalen
    modal.style.display = 'flex';
};
