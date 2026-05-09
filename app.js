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
