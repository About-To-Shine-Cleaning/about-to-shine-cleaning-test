const API =
  "YOUR_APPS_SCRIPT_WEBAPP_URL";

const searchInput =
  document.getElementById("clientSearch");

const resultsEl =
  document.getElementById("clientResults");

const clientCard =
  document.getElementById("clientCard");

let clients = [];

init();

async function init(){

  const data =
    await api("board_clients");

  clients = data.rows || [];

  searchInput.addEventListener(
    "input",
    handleSearch
  );
}

function handleSearch(){

  const q =
    searchInput.value
      .trim()
      .toLowerCase();

  resultsEl.innerHTML = "";

  if(!q) return;

  const matches =
    clients
      .filter(client =>
        (client.clientName || "")
          .toLowerCase()
          .includes(q)
      )
      .slice(0,10);

  matches.forEach(client=>{

    const div =
      document.createElement("div");

    div.className =
      "client-result";

    div.innerHTML = `
      <strong>${client.clientName}</strong>
      <div style="margin-top:4px;opacity:.8;">
        ${client.address || ""}
      </div>
    `;

    div.addEventListener(
      "click",
      ()=>showClient(client)
    );

    resultsEl.appendChild(div);
  });
}

function showClient(client){

  clientCard.classList.add("open");

  document.getElementById("clientName")
    .textContent =
      client.clientName || "—";

  document.getElementById("clientAddress")
    .textContent =
      client.address || "—";

  document.getElementById("clientFrequency")
    .textContent =
      client.frequency || "—";

  document.getElementById("clientPayout")
    .textContent =
      client.payout || "—";

  document.getElementById("clientSpecs")
    .textContent =
      client.specs || "—";

  document.getElementById("clientSpecialInfo")
    .textContent =
      client.specialInfo || "—";

  const mapLink =
    document.getElementById("mapLink");

  const addr =
    encodeURIComponent(
      client.address || ""
    );

  mapLink.href =
    `https://www.google.com/maps/search/?api=1&query=${addr}`;

  resultsEl.innerHTML = "";
}

function api(action,payload={}){

  return new Promise((resolve,reject)=>{

    const cb =
      "cb_" +
      Date.now() +
      "_" +
      Math.random()
        .toString(36)
        .slice(2);

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
