"use strict";
const $ = (s) => document.querySelector(s),
  key = "frota-v1";
const cloud =
  typeof google !== "undefined" && google.script && google.script.run;
let version = null;
const rpc = (name, ...args) =>
  new Promise((resolve, reject) =>
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler(reject)
      [name](...args),
  );
let db = { vehicles: [], loans: [] };
try {
  const saved = cloud ? null : JSON.parse(localStorage.getItem(key));
  if (saved && Array.isArray(saved.vehicles) && Array.isArray(saved.loans))
    db = saved;
} catch {
  alert(
    "Não foi possível ler os dados locais. Exporte uma cópia antes de registrar novos dados.",
  );
}
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const date = (v) => new Date(v).toLocaleString("pt-BR");
const active = (id) => db.loans.find((l) => l.vehicleId === id && !l.returned);
const vehicle = (id) => db.vehicles.find((v) => v.id === id);
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").style.display = "block";
  setTimeout(() => ($("#toast").style.display = "none"), 4000);
}
async function save(next) {
  if (cloud) {
    let change;
    if (next.vehicles.length === db.vehicles.length + 1)
      change = {
        type: "vehicle",
        vehicle: next.vehicles[next.vehicles.length - 1],
      };
    else if (next.loans.length === db.loans.length + 1)
      change = { type: "loan", loan: next.loans[next.loans.length - 1] };
    else {
      const updated = next.loans.find(
        (l) => l.returned && !db.loans.find((old) => old.id === l.id)?.returned,
      );
      if (!updated) throw new Error("Operação inválida.");
      change = {
        type: "return",
        loanId: updated.id,
        returned: updated.returned,
      };
    }
    const result = await rpc("applyChange", change, version);
    db = result.db;
    version = result.version;
  } else {
    localStorage.setItem(key, JSON.stringify(next));
    db = next;
  }
  render();
}
function modal(title, content) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = content;
  $("#modal").showModal();
}
$("#close").onclick = () => $("#modal").close();
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll("[data-tab]")
        .forEach((x) => x.classList.toggle("active", x === b));
      $("#fleet").hidden = b.dataset.tab !== "fleet";
      $("#history").hidden = b.dataset.tab !== "history";
    }),
);
function render() {
  const busy = db.vehicles.filter((v) => active(v.id)).length;
  $("#stats").innerHTML = [
    ["Total de viaturas", db.vehicles.length],
    ["Disponíveis", db.vehicles.length - busy],
    ["Em uso", busy],
  ]
    .map(
      ([label, n]) =>
        `<div class="stat"><span>${label}</span><strong>${n}</strong></div>`,
    )
    .join("");
  const query = $("#search").value.toLowerCase();
  const list = db.vehicles.filter((v) =>
    (v.name + " " + v.plate).toLowerCase().includes(query),
  );
  $("#vehicles").innerHTML =
    list
      .map((v) => {
        const loan = active(v.id);
        return `<article class="card"><span class="badge ${loan ? "busy" : ""}">${loan ? "Em uso" : "Disponível"}</span><div class="vehicle-icon">🚙</div><h3>${esc(v.name)}</h3><div class="plate">${esc(v.plate)}</div><p>${v.odometer.toLocaleString("pt-BR")} km${loan ? ` · ${esc(loan.name)}` : ""}</p><button data-action="${loan ? "return" : "loan"}" data-id="${v.id}" class="${loan ? "secondary" : ""}">${loan ? "Registrar devolução" : "Registrar retirada"}</button></article>`;
      })
      .join("") ||
    `<div class="empty"><h3>${db.vehicles.length ? "Nenhuma viatura encontrada" : "Comece pela sua primeira viatura"}</h3><p>Cadastre a identificação, a placa e a quilometragem para registrar empréstimos.</p></div>`;
  $("#records").innerHTML =
    [...db.loans]
      .reverse()
      .map(
        (l) =>
          `<article class="record"><div><span class="badge ${l.returned ? "" : "busy"}">${l.returned ? "Devolvido" : "Em andamento"}</span><h3>${esc(vehicle(l.vehicleId)?.name)} · ${esc(vehicle(l.vehicleId)?.plate)}</h3><p>${esc(l.name)} · Matrícula ${esc(l.registration)}</p><p>Retirada: ${date(l.started)}${l.returned ? " · Devolução: " + date(l.returned.at) : ""}</p></div><button class="secondary" data-action="detail" data-id="${l.id}">Ver checklist</button></article>`,
      )
      .join("") ||
    '<div class="empty"><h3>Nenhum empréstimo registrado</h3><p>As retiradas e devoluções aparecerão aqui.</p></div>';
}
$("#search").oninput = render;
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  if (b.dataset.action === "detail") details(b.dataset.id);
  else checklist(b.dataset.id, b.dataset.action === "return");
});
$("#addVehicle").onclick = () => {
  modal(
    "Cadastrar viatura",
    `<form id="vehicleForm"><label>Identificação da viatura<input name="name" required maxlength="100" placeholder="Ex.: Viatura 01 — SUV"></label><label>Placa<input name="plate" required maxlength="12" placeholder="Ex.: ABC1D23"></label><label>Odômetro atual (km)<input name="odometer" type="number" min="0" step="1" required></label><p class="error" id="formError" role="alert"></p><div class="actions"><button>Cadastrar viatura</button></div></form>`,
  );
  $("#vehicleForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = f.get("name").trim(),
      plate = f.get("plate").trim().toUpperCase().replace(/\s|-/g, "");
    if (!name || !plate) return error("Preencha a identificação e a placa.");
    if (db.vehicles.some((v) => v.plate === plate))
      return error("Esta placa já está cadastrada.");
    try {
      e.target.querySelector("button").disabled = true;
      await save({
        ...db,
        vehicles: [
          ...db.vehicles,
          {
            id: crypto.randomUUID(),
            name,
            plate,
            odometer: Number(f.get("odometer")),
          },
        ],
      });
      $("#modal").close();
      toast("Viatura cadastrada.");
    } catch (err) {
      e.target.querySelector("button").disabled = false;
      error(
        cloud
          ? err.message
          : "Não foi possível salvar no navegador. Verifique o espaço disponível.",
      );
    }
  };
};
const photoNames = [
  ["front", "Frontal"],
  ["rear", "Traseira"],
  ["right", "Lateral direita"],
  ["left", "Lateral esquerda"],
  ["dashboard", "Painel"],
  ["seats", "Bancos"],
];
const equipment = [
  ["spare", "Pneu estepe"],
  ["wrench", "Chave de roda"],
  ["jack", "Macaco"],
];
function error(message) {
  $("#formError").textContent = message;
}
function checklist(id, isReturn) {
  const v = vehicle(id),
    loan = active(id);
  if (isReturn && !loan) return;
  const min = v.odometer;
  modal(
    isReturn ? "Registrar devolução" : "Registrar retirada",
    `<p class="note">${esc(v.name)} · ${esc(v.plate)} · Último registro: ${min.toLocaleString("pt-BR")} km</p><form id="checkForm"><div class="fields">${isReturn ? `<p class="full">Responsável: <strong>${esc(loan.name)}</strong> · Matrícula ${esc(loan.registration)}</p>` : '<label>Nome do locatário<input name="name" required maxlength="120" autocomplete="name"></label><label>Matrícula<input name="registration" required maxlength="50"></label>'}<label class="full">Odômetro ${isReturn ? "na devolução" : "na retirada"} (km)<input name="odometer" type="number" min="${min}" step="1" required value="${min}"></label></div><h3>Equipamentos obrigatórios</h3><div class="equipment">${equipment.map(([k, t]) => `<label>${t}<select name="${k}" required><option value="">Selecionar</option><option>Presente e em bom estado</option><option>Presente com avaria</option><option>Ausente</option></select></label>`).join("")}</div><h3>Fotos do checklist</h3><p>Todas as seis fotos são obrigatórias. Use a câmera ou selecione uma imagem.</p><div class="photos">${photoNames.map(([k, t]) => `<label class="photo">${t}<input type="file" name="${k}" accept="image/*" capture="environment" required><img hidden alt="Prévia: ${t}"></label>`).join("")}</div><label>Observações / avarias<textarea name="notes" rows="3" maxlength="3000" placeholder="Descreva riscos, danos ou equipamentos ausentes"></textarea></label><p class="error" id="formError" role="alert"></p><div class="actions"><button id="submitCheck">${isReturn ? "Confirmar devolução" : "Confirmar retirada"}</button></div></form>`,
  );
  document.querySelectorAll(".photo input").forEach(
    (input) =>
      (input.onchange = () => {
        const img = input.nextElementSibling;
        if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
        const file = input.files[0];
        img.hidden = !file;
        if (file) {
          const url = URL.createObjectURL(file);
          img.dataset.url = url;
          img.src = url;
        }
      }),
  );
  $("#checkForm").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target,
      f = new FormData(form),
      odometer = Number(f.get("odometer"));
    if (!Number.isSafeInteger(odometer) || odometer < min)
      return error("A quilometragem não pode ser inferior ao último registro.");
    if (!isReturn && (!f.get("name").trim() || !f.get("registration").trim()))
      return error("Preencha o nome e a matrícula.");
    $("#submitCheck").disabled = true;
    $("#submitCheck").textContent = "Salvando fotos…";
    try {
      const photos = {};
      for (const [k] of photoNames) photos[k] = await compress(f.get(k));
      const check = {
        odometer,
        equipment: Object.fromEntries(equipment.map(([k]) => [k, f.get(k)])),
        photos,
        notes: f.get("notes").trim(),
      };
      const now = new Date().toISOString();
      const loans = isReturn
        ? db.loans.map((l) =>
            l.id === loan.id ? { ...l, returned: { ...check, at: now } } : l,
          )
        : [
            ...db.loans,
            {
              id: crypto.randomUUID(),
              vehicleId: id,
              name: f.get("name").trim(),
              registration: f.get("registration").trim(),
              started: now,
              checkout: check,
              returned: null,
            },
          ];
      await save({
        ...db,
        vehicles: db.vehicles.map((x) =>
          x.id === id ? { ...x, odometer } : x,
        ),
        loans,
      });
      $("#modal").close();
      toast(
        isReturn
          ? "Devolução registrada. Viatura disponível."
          : "Retirada registrada.",
      );
    } catch (err) {
      error(
        cloud
          ? err.message
          : err.message === "image"
            ? "Não foi possível abrir uma das fotos. Escolha uma imagem JPEG, PNG ou WebP válida."
            : "Não foi possível salvar. O armazenamento pode estar cheio; exporte os registros para backup.",
      );
      $("#submitCheck").disabled = false;
      $("#submitCheck").textContent = "Tentar salvar novamente";
    }
  };
}
function compress(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.size || !file.type.startsWith("image/"))
      return reject(new Error("image"));
    const url = URL.createObjectURL(file),
      img = new Image();
    img.onload = () => {
      try {
        const ratio = Math.min(1, 1000 / Math.max(img.width, img.height)),
          canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      } catch {
        reject(new Error("image"));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}
async function details(id) {
  let l = db.loans.find((x) => x.id === id);
  if (cloud) {
    modal("Carregando checklist", "<p>Buscando fotos no Drive…</p>");
    try {
      l = await rpc("loadPhotos", id);
    } catch (err) {
      $("#modalBody").textContent = err.message;
      return;
    }
    $("#modal").close();
  }
  function block(title, c) {
    return `<h3>${title}</h3><p>Odômetro: ${c.odometer.toLocaleString("pt-BR")} km</p><dl>${equipment.map(([k, t]) => `<dt>${t}</dt><dd>${esc(c.equipment[k])}</dd>`).join("")}</dl><p>${esc(c.notes || "Sem observações.")}</p><div class="photos">${photoNames.map(([k, t]) => `<div class="photo"><strong>${t}</strong><img src="${esc(c.photos[k])}" alt="${t}"></div>`).join("")}</div>`;
  }
  modal(
    "Detalhes do empréstimo",
    `<p><strong>${esc(l.name)}</strong> · Matrícula ${esc(l.registration)}</p><p>${esc(vehicle(l.vehicleId)?.name)} · ${esc(vehicle(l.vehicleId)?.plate)}</p><p>Retirada: ${date(l.started)}</p>${block("Checklist de retirada", l.checkout)}${l.returned ? `<p>Devolução: ${date(l.returned.at)} · Percurso: ${l.returned.odometer - l.checkout.odometer} km</p>${block("Checklist de devolução", l.returned)}` : ""}`,
  );
}
$("#export").onclick = () => {
  const blob = new Blob(
      [
        JSON.stringify(
          { ...db, exportedAt: new Date().toISOString() },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download =
    "frota-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
render();
if (cloud) {
  document.querySelector("main").inert = true;
  document.querySelector(".local").hidden = false;
  document.querySelector(".local").textContent = "Conectando à instituição…";
  rpc("loadApp")
    .then((result) => {
      db = result.db;
      version = result.version;
      render();
      document.querySelector("main").inert = false;
      document.querySelector(".local").textContent = result.email;
      document.querySelector(".footnote").textContent =
        "Registros compartilhados na planilha institucional. Fotos privadas no Drive. A exportação JSON contém os registros e IDs das fotos; ela não substitui um backup dos arquivos do Drive.";
    })
    .catch((err) => {
      document.querySelector(".local").textContent = "Acesso indisponível";
      toast(err.message);
      document.querySelector(".footnote").textContent =
        "Não foi possível acessar os registros: " + err.message;
    });
}
