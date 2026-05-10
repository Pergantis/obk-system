const SB_URL = "https://xsakmdmhpuqjebcqrony.supabase.co"; 
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzYWttZG1ocHVxamViY3Fyb255Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMzAzNzYsImV4cCI6MjA5MzkwNjM3Nn0.E6s11F_894jwxfaQoE4rfSX8oPtgi1DSeYOsyON1DB4";
const sb = window.supabase.createClient(SB_URL, SB_KEY);

let selectedMemberId = null;

function showModule(id) {
    document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('mod-' + id).classList.add('active');
    document.getElementById('btn-' + id).classList.add('active');
    if (id === 'bord') loadTables();
    if (id === 'medlem') loadActivePasses();
    if (id === 'skap') loadLockers();
}

function showLoader(show) { document.getElementById('sync-loader').style.display = show ? 'block' : 'none'; }
function showError(msg) { const el = document.getElementById('error-log'); el.innerText = msg; el.style.display = 'block'; }

window.addEventListener('load', () => {
    loadTables();
    loadActivePasses();
    loadLockers();
});
// --- VAKTPLAN PROTOTYPE LOGIKK ---

// Funksjon for å skifte mellom Låst og Åpen modus (Prototype)
function toggleEditMode() {
    const section = document.getElementById('mod-vaktplan');
    const btn = document.getElementById('btn-toggle-edit');
    const status = document.getElementById('lock-status-indicator');
    
    if (section.classList.contains('edit-locked')) {
        section.classList.remove('edit-locked');
        btn.innerText = "🔒 LÅS FOR REDIGERING";
        btn.classList.add('btn-gold');
        status.innerText = "🔓 REDIGERINGSMODUS AKTIV";
    } else {
        section.classList.add('edit-locked');
        btn.innerText = "🔓 ÅPNE FOR REDIGERING";
        btn.classList.remove('btn-gold');
        status.innerText = "🔒 VISNINGSMODUS (LÅST)";
    }
}

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
