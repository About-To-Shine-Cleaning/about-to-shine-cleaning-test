/* ======================================================
ATS Scheduler v1
Mobile-first weekly scheduler
Reads Apps Script backend via JSONP
====================================================== */

/* ================================
   CONFIG
================================ */

/* PASTE YOUR EXEC URL HERE */
const ATS_API =
"https://script.google.com/macros/s/AKfycbxxlswMSBSpXO9KqptzOULfDFCOmiu0dqGmMDDIY4IX-3EHqMkauIvAfNrUq0_rsbrN/exec";

/* ================================
   STATE
================================ */

let currentWeek = "this";
let weekData = {};
let cleaners = [];
let clients = [];

const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

/* ================================
   JSONP helper
================================ */

function api(action, params = {}) {

  return new Promise((resolve,reject)=>{

    const cb = "cb_" + Math.random().toString(36).substring(2);

    window[cb] = function(data){
      delete window[cb];
      resolve(data);
    };

    const query = new URLSearchParams({
      action,
      callback: cb,
      ...params
    });

    const s = document.createElement("script");
    s.src = ATS_API + "?" + query.toString();
    document.body.appendChild(s);

  });

}

/* ================================
   LOAD SCHEDULE
================================ */

async function loadSchedule() {

  const res = await api("schedule_week",{
    week: currentWeek
  });

  if(!res.ok){
    alert("Schedule load error");
    return;
  }

  weekData = res.days || {};

  renderSchedule();

}

/* ================================
   LOAD CLEANERS
================================ */

async function loadCleaners(){

  const res = await api("schedule_cleaners");

  if(res.ok){
    cleaners = res.cleaners;
  }

}

/* ================================
   LOAD CLIENTS
================================ */

async function loadClients(){

  const res = await api("schedule_clients");

  if(res.ok){
    clients = res.clients;
  }

}

/* ================================
   RENDER WEEK
================================ */

function renderSchedule(){

  const wrap = document.getElementById("scheduleDays");
  wrap.innerHTML = "";

  days.forEach(day=>{

    const card = document.createElement("div");
    card.className = "day-card";

    const head = document.createElement("div");
    head.className = "day-head";
    head.innerHTML = `<h3>${day}</h3>`;

    card.appendChild(head);

    const list = document.createElement("div");
    list.className = "assignment-list";

    const items = weekData[day] || [];

    if(items.length===0){
      list.innerHTML = `<div class="empty-day">No jobs</div>`;
    }

    items.forEach(item=>{
      const row = createAssignmentRow(day,item);
      list.appendChild(row);
    });

    card.appendChild(list);

    const addBtn = document.createElement("button");
    addBtn.className = "add-btn";
    addBtn.innerText = "Add Job";

    addBtn.onclick = ()=> openAddModal(day);

    card.appendChild(addBtn);

    wrap.appendChild(card);

  });

}

/* ================================
   ASSIGNMENT ROW
================================ */

function createAssignmentRow(day,item){

  const row = document.createElement("div");
  row.className = "assignment-item";

  const main = document.createElement("div");
  main.className = "assignment-main";

  main.innerHTML = `
    <div class="assignment-client">${item.client}</div>
    <div class="assignment-cleaner">${item.cleaner}</div>
  `;

  row.appendChild(main);

  const actions = document.createElement("div");
  actions.className = "assignment-actions";

  const btn = document.createElement("button");
  btn.className = "mini-btn";
  btn.innerText = "Edit";

  btn.onclick = ()=> openEditModal(day,item);

  actions.appendChild(btn);
  row.appendChild(actions);

  return row;

}

/* ================================
   ADD JOB
================================ */

function openAddModal(day){

  const client = prompt("Client name?");
  if(!client) return;

  const cleaner = prompt("Cleaner?");
  if(!cleaner) return;

  api("schedule_add",{
    day,
    client,
    cleaner
  }).then(loadSchedule);

}

/* ================================
   EDIT JOB
================================ */

function openEditModal(day,item){

  const action = prompt(
`Choose action:
1 Replace Cleaner
2 Move Day
3 Remove`
  );

  if(action==="1"){
    replaceCleaner(day,item);
  }

  if(action==="2"){
    reschedule(day,item);
  }

  if(action==="3"){
    removeJob(day,item);
  }

}

/* ================================
   REPLACE CLEANER
================================ */

function replaceCleaner(day,item){

  const cleaner = prompt("New Cleaner");

  api("schedule_replace",{
    day,
    client:item.client,
    cleaner
  }).then(loadSchedule);

}

/* ================================
   TEMP RESCHEDULE
================================ */

function reschedule(day,item){

  const newDay = prompt("Move to which day?");

  api("schedule_reschedule",{
    day,
    client:item.client,
    newDay
  }).then(loadSchedule);

}

/* ================================
   REMOVE
================================ */

function removeJob(day,item){

  api("schedule_remove",{
    day,
    client:item.client
  }).then(loadSchedule);

}

/* ================================
   WEEK SWITCH
================================ */

function setWeek(type){

  currentWeek = type;

  loadSchedule();

}

/* ================================
   INIT
================================ */

async function init(){

  await loadCleaners();
  await loadClients();
  await loadSchedule();

}

document.addEventListener("DOMContentLoaded",init);
