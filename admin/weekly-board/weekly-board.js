const API =
  "YOUR_APPS_SCRIPT_WEBAPP_URL";

const boardEl = document.getElementById("weekBoard");
const weekLabel = document.getElementById("weekLabel");

const modal = document.getElementById("assignmentModal");
const modalTitle = document.getElementById("modalTitle");

const employeeSelect = document.getElementById("employeeSelect");
const clientSearch = document.getElementById("clientSearch");
const clientSuggestions = document.getElementById("clientSuggestions");

const assignmentList = document.getElementById("assignmentList");

let currentDay = null;
let selectedClient = null;

let employees = [];
let clients = [];
let assignments = [];

const DAYS = ["Saturday","Sunday","Monday","Tuesday","Wednesday","Thursday","Friday"];

init();

async function init(){
  await loadEmployees();
  await loadClients();

  buildWeekBoard();

  document.getElementById("closeModal")
    .addEventListener("click", closeModal);

  document.getElementById("btnAddAssignment")
    .addEventListener("click", addAssignment);

  clientSearch.addEventListener("input", handleClientSearch);

  document.getElementById("btnSaveWeek")
    .addEventListener("click", saveBoard);
}

function getWeekStart(){
  const d = new Date();

  while(d.getDay() !== 6){
    d.setDate(d.getDate()-1);
  }

  return d;
}

function formatDate(date){
  return date.toISOString().split("T")[0];
}

function buildWeekBoard(){

  boardEl.innerHTML = "";

  const start = getWeekStart();

  const end = new Date(start);
  end.setDate(end.getDate()+6);

  weekLabel.textContent =
    `${start.toLocaleDateString()} → ${end.toLocaleDateString()}`;

  DAYS.forEach((day,index)=>{

    const current = new Date(start);
    current.setDate(current.getDate()+index);

    const dateStr = formatDate(current);

    const card = document.createElement("div");
    card.className = "day-card";

    card.innerHTML = `
      <div class="day-header">
        <div>
          <div class="day-name">${day}</div>
          <div class="day-date">${dateStr}</div>
        </div>

        <button class="button button-small">
          Edit
        </button>
      </div>

      <div id="assignments-${dateStr}"></div>
    `;

    card.querySelector("button")
      .addEventListener("click",()=>openDay(dateStr,day));

    boardEl.appendChild(card);

    renderAssignments(dateStr);
  });
}

function openDay(dateStr,day){

  currentDay = dateStr;

  modalTitle.textContent =
    `${day} • ${dateStr}`;

  renderModalAssignments();

  modal.classList.add("open");
}

function closeModal(){
  modal.classList.remove("open");
}

function renderAssignments(dateStr){

  const container =
    document.getElementById(`assignments-${dateStr}`);

  if(!container) return;

  const rows =
    assignments.filter(x=>x.serviceDate === dateStr);

  container.innerHTML = "";

  rows.forEach(row=>{

    const div = document.createElement("div");
    div.className = "assignment";

    div.innerHTML = `
      <strong>${row.employeeName}</strong>
      ${row.clientName}
    `;

    container.appendChild(div);
  });
}

function renderModalAssignments(){

  const rows =
    assignments.filter(x=>x.serviceDate === currentDay);

  assignmentList.innerHTML = "";

  rows.forEach((row,index)=>{

    const div = document.createElement("div");
    div.className = "assignment";

    div.innerHTML = `
      <strong>${row.employeeName}</strong>
      ${row.clientName}

      <button class="button button-secondary">
        Remove
      </button>
    `;

    div.querySelector("button")
      .addEventListener("click",()=>{
        assignments.splice(index,1);
        renderModalAssignments();
        renderAssignments(currentDay);
      });

    assignmentList.appendChild(div);
  });
}

async function loadEmployees(){

  const data =
    await api("board_employees");

  employees = data.rows || [];

  employeeSelect.innerHTML =
    employees.map(emp=>`
      <option value="${emp.employeeId}">
        ${emp.employeeName}
      </option>
    `).join("");
}

async function loadClients(){

  const data =
    await api("board_clients");

  clients = data.rows || [];
}

function handleClientSearch(){

  const q =
    clientSearch.value.trim().toLowerCase();

  clientSuggestions.innerHTML = "";

  if(!q) return;

  const matches =
    clients
      .filter(x=>
        x.clientName.toLowerCase().includes(q)
      )
      .slice(0,8);

  matches.forEach(client=>{

    const div = document.createElement("div");
    div.className = "assignment";

    div.textContent =
      client.clientName;

    div.addEventListener("click",()=>{

      selectedClient = client;

      clientSearch.value =
        client.clientName;

      clientSuggestions.innerHTML = "";
    });

    clientSuggestions.appendChild(div);
  });
}

function addAssignment(){

  if(!selectedClient){
    alert("Select a client");
    return;
  }

  const employeeId =
    employeeSelect.value;

  const employee =
    employees.find(x=>x.employeeId === employeeId);

  assignments.push({
    serviceDate: currentDay,
    employeeId,
    employeeName: employee.employeeName,
    clientName: selectedClient.clientName
  });

  renderModalAssignments();
  renderAssignments(currentDay);

  clientSearch.value = "";
  selectedClient = null;
}

async function saveBoard(){

  try{

    await api("save_weekly_board",{
      assignments
    });

    alert("Weekly board saved");

  }catch(err){

    console.error(err);
    alert("Failed saving board");
  }
}

function api(action,payload={}){

  return new Promise((resolve,reject)=>{

    const cb =
      "cb_" + Date.now() + "_" + Math.random().toString(36).slice(2);

    window[cb] = function(data){

      delete window[cb];
      script.remove();

      resolve(data);
    };

    const script =
      document.createElement("script");

    const params =
      new URLSearchParams({
        action,
        callback: cb,
        payload: JSON.stringify(payload)
      });

    script.src =
      `${API}?${params.toString()}`;

    script.onerror = reject;

    document.body.appendChild(script);
  });
}
