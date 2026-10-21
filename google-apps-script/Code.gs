/** Deploy as an institutional owner, accessible only to the Workspace organization. */
const PHOTO_KEYS = ["front", "rear", "right", "left", "dashboard", "seats"];
const EQUIPMENT_KEYS = ["spare", "wrench", "jack"];
const CONDITIONS = [
  "Presente e em bom estado",
  "Presente com avaria",
  "Ausente",
];

function authorize_() {
  const props = PropertiesService.getScriptProperties();
  const domain = (props.getProperty("ALLOWED_DOMAIN") || "")
    .trim()
    .toLowerCase();
  const allowed = (props.getProperty("ALLOWED_EMAILS") || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const email = Session.getActiveUser().getEmail().trim().toLowerCase();
  if (
    !domain ||
    !email ||
    email.split("@")[1] !== domain ||
    !allowed.includes(email)
  ) {
    throw new Error(
      "Acesso negado. Entre com uma conta institucional autorizada.",
    );
  }
  return email;
}

/** Run manually in the editor after configuring ALLOWED_DOMAIN and ALLOWED_EMAILS. */
function setupEnvironment_() {
  authorize_();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("SPREADSHEET_ID")) {
    const book = SpreadsheetApp.create("Frota — Controle de viaturas");
    const sheet = book.getSheets()[0];
    sheet.setName("Viaturas");
    sheet.appendRow([
      "ID",
      "Identificação",
      "Placa",
      "Odômetro inicial",
      "Dados JSON",
      "Criado por",
      "Criado em",
    ]);
    book
      .insertSheet("Emprestimos")
      .appendRow([
        "ID",
        "Viatura ID",
        "Nome",
        "Matrícula",
        "Retirada",
        "Devolução",
        "Km retirada",
        "Km devolução",
        "Dados JSON",
        "Última alteração por",
      ]);
    props.setProperty("SPREADSHEET_ID", book.getId());
  }
  if (!props.getProperty("PHOTO_FOLDER_ID")) {
    props.setProperty(
      "PHOTO_FOLDER_ID",
      DriveApp.createFolder("Frota — Fotos de vistorias").getId(),
    );
  }
  console.log(
    "Configuração concluída. Planilha e pasta privadas criadas na conta proprietária.",
  );
}

function doGet() {
  authorize_();
  return HtmlService.createHtmlOutputFromFile("Index").setTitle(
    "Frota • Controle de viaturas",
  );
}

function sheet_(name) {
  const id =
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id)
    throw new Error("Execute setupEnvironment_ no editor antes de usar o app.");
  const sheet = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sheet)
    throw new Error(
      "A estrutura da planilha foi alterada. Solicite suporte ao administrador.",
    );
  return sheet;
}

function state_() {
  function rows(name, index) {
    const sheet = sheet_(name);
    if (sheet.getLastRow() < 2) return [];
    return sheet
      .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
      .getValues()
      .map((row) => JSON.parse(row[index]));
  }
  const vehicles = rows("Viaturas", 4),
    loans = rows("Emprestimos", 8);
  for (const v of vehicles) {
    v.odometer = Math.max(
      v.odometer,
      ...loans
        .filter((l) => l.vehicleId === v.id)
        .map((l) => (l.returned ? l.returned.odometer : l.checkout.odometer)),
    );
  }
  const db = { vehicles, loans };
  const version = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify(db),
    ),
  );
  return { db, version };
}

function loadApp() {
  const email = authorize_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return { ...state_(), email };
  } finally {
    lock.releaseLock();
  }
}

function text_(value, max) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new Error("Campo obrigatório inválido.");
  return value.trim();
}
function km_(value, min) {
  if (!Number.isSafeInteger(value) || value < min)
    throw new Error("Odômetro inválido ou inferior ao último registro.");
  return value;
}
function cell_(value) {
  const str = String(value);
  return /^[=+\-@]/.test(str) ? "'" + str : str;
}
function validateCheck_(check, min) {
  if (!check || typeof check !== "object")
    throw new Error("Checklist obrigatório.");
  km_(check.odometer, min);
  for (const key of EQUIPMENT_KEYS) {
    if (!check.equipment || !CONDITIONS.includes(check.equipment[key]))
      throw new Error("Informe os três equipamentos.");
  }
  for (const key of PHOTO_KEYS) {
    const value = check.photos && check.photos[key];
    if (
      typeof value !== "string" ||
      value.length > 1200000 ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value)
    )
      throw new Error("Envie as seis fotos JPEG válidas (até 900 KB cada).");
  }
  if (typeof check.notes !== "string" || check.notes.length > 3000)
    throw new Error("Observações inválidas.");
}
function storeCheck_(check, email, created) {
  const folder = DriveApp.getFolderById(
    PropertiesService.getScriptProperties().getProperty("PHOTO_FOLDER_ID"),
  );
  const photos = {};
  for (const key of PHOTO_KEYS) {
    const bytes = Utilities.base64Decode(check.photos[key].split(",")[1]);
    if (
      bytes.length < 4 ||
      (bytes[0] & 255) !== 255 ||
      (bytes[1] & 255) !== 216
    )
      throw new Error("Imagem JPEG inválida.");
    const file = folder.createFile(
      Utilities.newBlob(
        bytes,
        "image/jpeg",
        Utilities.getUuid() + "-" + key + ".jpg",
      ),
    );
    created.push(file);
    photos[key] = file.getId();
  }
  return {
    odometer: check.odometer,
    equipment: Object.fromEntries(
      EQUIPMENT_KEYS.map((k) => [k, check.equipment[k]]),
    ),
    photos,
    notes: check.notes.trim(),
    recordedBy: email,
  };
}

function applyChange(change, expectedVersion) {
  const email = authorize_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const created = [];
  let committed = false;
  try {
    const current = state_();
    if (current.version !== expectedVersion)
      throw new Error(
        "Os registros foram atualizados por outra pessoa. Recarregue a página e tente novamente.",
      );
    const now = new Date().toISOString();
    if (change.type === "vehicle") {
      const input = change.vehicle;
      const name = text_(input.name, 100),
        plate = text_(input.plate, 12).toUpperCase().replace(/[\s-]/g, "");
      km_(input.odometer, 0);
      if (current.db.vehicles.some((v) => v.plate === plate))
        throw new Error("Placa já cadastrada.");
      const v = {
        id: Utilities.getUuid(),
        name,
        plate,
        odometer: input.odometer,
      };
      sheet_("Viaturas").appendRow([
        v.id,
        cell_(name),
        cell_(plate),
        v.odometer,
        JSON.stringify(v),
        email,
        now,
      ]);
      committed = true;
    } else if (change.type === "loan" || change.type === "return") {
      let loan, row;
      if (change.type === "loan") {
        const input = change.loan;
        const v = current.db.vehicles.find((v) => v.id === input.vehicleId);
        if (
          !v ||
          current.db.loans.some((l) => l.vehicleId === v.id && !l.returned)
        )
          throw new Error("Viatura indisponível.");
        const name = text_(input.name, 120),
          registration = text_(input.registration, 50);
        validateCheck_(input.checkout, v.odometer);
        loan = {
          id: Utilities.getUuid(),
          vehicleId: v.id,
          name,
          registration,
          started: now,
          checkout: storeCheck_(input.checkout, email, created),
          returned: null,
        };
      } else {
        const index = current.db.loans.findIndex((l) => l.id === change.loanId);
        loan = current.db.loans[index];
        if (!loan || loan.returned)
          throw new Error("Empréstimo não encontrado ou já devolvido.");
        validateCheck_(change.returned, loan.checkout.odometer);
        loan.returned = {
          ...storeCheck_(change.returned, email, created),
          at: now,
        };
        row = index + 2;
      }
      const values = [
        loan.id,
        loan.vehicleId,
        cell_(loan.name),
        cell_(loan.registration),
        loan.started,
        loan.returned ? loan.returned.at : "",
        loan.checkout.odometer,
        loan.returned ? loan.returned.odometer : "",
        JSON.stringify(loan),
        email,
      ];
      if (row)
        sheet_("Emprestimos")
          .getRange(row, 1, 1, values.length)
          .setValues([values]);
      else sheet_("Emprestimos").appendRow(values);
      committed = true;
    } else throw new Error("Operação inválida.");
    SpreadsheetApp.flush();
    return { ...state_(), email };
  } catch (error) {
    if (!committed)
      for (const file of created) {
        try {
          file.setTrashed(true);
        } catch (_) {}
      }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function loadPhotos(loanId) {
  authorize_();
  const loan = state_().db.loans.find((l) => l.id === loanId);
  if (!loan) throw new Error("Empréstimo não encontrado.");
  function hydrate(check) {
    if (!check) return null;
    const photos = {};
    for (const key of PHOTO_KEYS) {
      const file = DriveApp.getFileById(check.photos[key]);
      photos[key] =
        "data:image/jpeg;base64," +
        Utilities.base64Encode(file.getBlob().getBytes());
    }
    return { ...check, photos };
  }
  return {
    ...loan,
    checkout: hydrate(loan.checkout),
    returned: hydrate(loan.returned),
  };
}
