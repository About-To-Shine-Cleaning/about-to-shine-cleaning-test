<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Weekly Assignment Board | ATS Admin</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow,noarchive" />

<link rel="stylesheet" href="/admin/admin-layout.css?v=6001" />
<link rel="icon" type="image/png" href="/assets/images/logo-v2.png" />
<link rel="apple-touch-icon" href="/assets/images/logo-v2.png" />

<script defer src="/admin/admin-nav.js?v=6001"></script>
<script defer src="/admin/weekly-board/weekly-board.js?v=3026"></script>

<style>
html,body{width:100%;max-width:100%;overflow-x:hidden!important}
body.ats-admin{min-height:100dvh;background-attachment:scroll!important}
body.ats-admin .ats-main{width:100%!important;overflow-x:hidden!important;background:transparent!important;padding:18px 0 34px!important}
body.ats-admin .ats-header-inner{max-width:none!important;width:100%!important;padding-left:clamp(14px,2vw,26px)!important;padding-right:clamp(14px,2vw,26px)!important}

.weekly-editor-container{width:100%;max-width:none;margin:0;padding:clamp(10px,1.4vw,22px);box-sizing:border-box}
.weekly-editor-shell{width:100%;max-width:none;overflow:visible;padding:clamp(14px,1.5vw,22px);border-radius:24px}

.weekly-editor-top{display:grid;grid-template-columns:minmax(0,1fr) minmax(290px,380px);gap:18px;align-items:start;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.10)}
.ats-eyebrow{color:rgba(255,255,255,.64);font-size:13px;font-weight:900;letter-spacing:.02em;margin-bottom:8px}
#weekLabel{margin:0;font-size:clamp(28px,3.4vw,48px);line-height:1.02;letter-spacing:-.035em}
.week-source-label{margin-top:10px;font-size:13px;font-weight:900;color:rgba(255,230,0,.86)}

.week-nav-actions{display:grid;grid-template-columns:1fr;gap:10px;justify-content:stretch}
.week-nav-actions .button{width:100%;min-height:48px}

#atsBoardGhostWrap{display:grid!important;grid-template-columns:minmax(0,4fr) minmax(290px,1fr)!important;gap:16px!important;align-items:start!important;margin-top:16px!important}

.week-board{display:grid!important;grid-template-columns:repeat(7,minmax(124px,1fr))!important;gap:12px!important;margin-top:0!important;width:100%!important;max-width:100%!important;align-items:stretch!important}

.day-card{min-height:420px;min-width:0!important;max-width:100%!important;padding:14px;display:flex;flex-direction:column;overflow:visible;border-radius:18px!important}
.day-header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:14px;flex:0 0 auto;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.08)}
.day-name{font-size:15px;font-weight:950}
.day-date{font-size:12px;color:rgba(255,255,255,.66);margin-top:4px}
.day-header .button,.button-small{width:auto!important;min-height:36px!important;padding:8px 12px!important;border-radius:10px!important;font-size:12px!important;white-space:nowrap}

.assignment{background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.10);border-radius:15px;padding:13px;margin-bottom:12px;max-width:100%;overflow-wrap:anywhere;transition:border-color .18s ease,background .18s ease}
.assignment:hover{border-color:rgba(255,230,0,.22);background:rgba(255,255,255,.04)}
.assignment strong{display:block;margin-bottom:8px;font-size:16px;line-height:1.2;font-weight:950;color:#fff;letter-spacing:.01em}
.assignment-client{line-height:1.52;overflow-wrap:anywhere;font-size:14px;color:rgba(255,255,255,.92)}
.assignment-address,.assignment-meta,.assignment-notes{display:block;margin-top:8px;font-size:13px;line-height:1.45;color:rgba(255,255,255,.70)}
.assignment-meta{color:rgba(255,230,0,.86);font-weight:850}
.assignment-notes{color:rgba(255,255,255,.76)}

#ghostSchedulerPanel{min-width:0!important;width:100%!important}
.ats-save-all-bar{position:sticky;top:76px;z-index:25}

.modal-backdrop{position:fixed!important;inset:0!important;background:rgba(0,0,0,.70);display:none;align-items:center!important;justify-content:center!important;z-index:9999;overflow:hidden!important;padding:14px!important}
.modal-backdrop.open{display:flex!important}
.modal{width:min(900px,96vw)!important;max-width:96vw!important;max-height:92dvh!important;border-radius:24px;padding:20px;overflow:hidden!important;display:flex!important;flex-direction:column!important;min-height:0!important}
.modal-top{flex:0 0 auto!important;display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}
.modal-top h2{margin:0;font-size:clamp(22px,3vw,34px)}
.modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;flex:0 0 auto!important}
.modal label{display:block;font-size:13px;font-weight:800;color:rgba(255,255,255,.78);margin-bottom:8px}
.modal input,.modal select,.modal textarea,.modal button{max-width:100%!important}
.modal input,.modal select,.modal textarea{width:100%}
.modal textarea{min-height:92px;resize:vertical}

.addon-toggle-row{grid-column:1/-1;display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 14px;border:1px solid rgba(255,230,0,.22);border-radius:18px;background:rgba(255,230,0,.045)}
.addon-toggle-row label{margin:0;display:flex;align-items:center;gap:10px;cursor:pointer}
.addon-toggle-row input{width:auto;accent-color:#ffe600}
.addon-fields{display:none;grid-column:1/-1;grid-template-columns:1fr;gap:16px;padding:14px;border:1px solid rgba(255,230,0,.22);border-radius:18px;background:rgba(255,230,0,.045)}
.addon-fields.open{display:grid}

#clientSuggestions{max-height:240px;overflow-y:auto;overflow-x:hidden;margin-top:10px;display:flex;flex-direction:column;gap:10px;padding-right:4px}
#btnAddAssignment,#btnUpdateDay{flex:0 0 auto!important;margin-top:16px}
#btnUpdateDay{border-color:rgba(255,230,0,.75)!important}
.assignment-list{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;padding-right:8px!important;margin-top:18px!important;overscroll-behavior:contain}
.assignment-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
.assignment-actions .button,.assignment-actions button{flex:1 1 150px;width:auto!important}

@media(max-width:1450px){
  .week-board{grid-template-columns:repeat(7,minmax(112px,1fr))!important;gap:10px!important}
  .assignment{padding:11px}
  .assignment strong{font-size:15px}
  .assignment-client{font-size:13px}
}

@media(max-width:1100px){
  .weekly-editor-top{grid-template-columns:1fr}
  .week-nav-actions{grid-template-columns:repeat(3,minmax(0,1fr))}
}

@media(max-width:980px){
  .weekly-editor-container{padding:10px}
  .weekly-editor-shell{padding:14px;border-radius:18px}
  #atsBoardGhostWrap{display:block!important;margin-top:14px!important}
  .week-board{grid-template-columns:1fr!important;gap:12px!important}
  .day-card{min-height:0}
  .ats-save-all-bar{top:auto;position:sticky;bottom:10px;z-index:40}
}

@media(max-width:760px){
  body.ats-admin .ats-main{padding-bottom:92px!important}
  #weekLabel{font-size:clamp(25px,8vw,34px)}
  .week-nav-actions{width:100%;grid-template-columns:1fr 1fr 1fr;gap:8px}
  .week-nav-actions .button{min-height:42px;padding:10px 8px;font-size:12px}
  .modal-backdrop.open{align-items:stretch!important;justify-content:center!important;padding:10px!important}
  .modal{width:100%!important;max-width:100%!important;max-height:calc(100dvh - 20px)!important;border-radius:18px!important;padding:16px!important}
  .modal-grid,.addon-fields.open{grid-template-columns:1fr!important}
  .assignment-actions .button,.assignment-actions button,.modal .button{width:100%!important;flex:1 1 100%;min-width:0!important}
}
</style>
</head>

<body class="ats-admin">
<header class="ats-header">
  <div class="ats-header-inner">
    <a class="ats-brand" href="/admin/" aria-label="Go to Home">
      <img src="/assets/images/logo-v2.png" alt="About To Shine Cleaning Logo" />
    </a>
    <div class="ats-header-actions">
      <a class="ats-live-btn" href="https://abouttoshinecleaning.com" target="_blank" rel="noopener">Go to Live Website</a>
      <button class="ats-burger" type="button" aria-label="Open menu" aria-haspopup="dialog" aria-controls="atsNavDrawer" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>

<main class="ats-main">
  <div class="weekly-editor-container">
    <section class="ats-card weekly-editor-shell" id="weeklyEditorShell">
      <div class="weekly-editor-top">
        <div>
          <div class="ats-eyebrow">Weekly Assignment Board</div>
          <h1 id="weekLabel">Loading week...</h1>
          <div id="weekSourceLabel" class="week-source-label"></div>
        </div>

        <div class="week-nav-actions">
          <button class="button button-secondary" id="btnPrevWeek" type="button">Previous Week</button>
          <button class="button" id="btnCurrentWeek" type="button">Current Week</button>
          <button class="button button-secondary" id="btnNextWeek" type="button">Next Week</button>
        </div>
      </div>

      <div class="week-board" id="weekBoard"></div>
    </section>
  </div>
</main>

<div class="modal-backdrop" id="assignmentModal">
  <div class="modal">
    <div class="modal-top">
      <h2 id="modalTitle">Assignments</h2>
      <button class="button button-secondary" id="closeModal" type="button">Close</button>
    </div>

    <div class="modal-grid">
      <div>
        <label for="employeeSelect">Employee</label>
        <select id="employeeSelect"></select>
      </div>

      <div>
        <label for="clientSearch">Client / Job</label>
        <input type="text" id="clientSearch" placeholder="Start typing client name or job..." autocomplete="off" />
        <div id="clientSuggestions"></div>
      </div>

      <div class="addon-toggle-row">
        <label for="isAddOnAssignment">
          <input type="checkbox" id="isAddOnAssignment" />
          Add-On Job
        </label>
        <span style="font-size:13px;color:rgba(255,255,255,.68);font-weight:800;">
          Use this for windows, oven, basement, carpet shampooing, extra work, etc.
        </span>
      </div>

      <div class="addon-fields" id="addOnFields">
        <div>
          <label for="addOnTypeInput">Add-On Job Name</label>
          <input type="text" id="addOnTypeInput" placeholder="Windows, oven, basement, carpet shampooing..." autocomplete="off" />
        </div>

        <div>
          <label for="addOnNotes">Add-On Notes</label>
          <textarea id="addOnNotes" placeholder="Optional notes for payroll/admin..."></textarea>
        </div>
      </div>
    </div>

    <button class="button" id="btnAddAssignment" type="button">Add Assignment</button>
    <div class="assignment-list" id="assignmentList"></div>
  </div>
</div>

</body>
</html>
