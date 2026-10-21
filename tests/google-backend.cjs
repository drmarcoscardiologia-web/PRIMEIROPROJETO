const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const crypto = require("node:crypto");
const props = new Map([
  ["ALLOWED_DOMAIN", "example.org"],
  ["ALLOWED_EMAILS", "owner@example.org,operator@example.org"],
]);
let email = "owner@example.org";
const books = new Map(),
  files = new Map();
class Sheet {
  constructor(book, name) {
    this.book = book;
    this.name = name;
    this.rows = [];
  }
  setName(name) {
    this.book.sheets.delete(this.name);
    this.name = name;
    this.book.sheets.set(name, this);
  }
  appendRow(row) {
    this.rows.push([...row]);
  }
  getLastRow() {
    return this.rows.length;
  }
  getLastColumn() {
    return this.rows[0].length;
  }
  getRange(row, col, rows, cols) {
    return {
      getValues: () =>
        this.rows
          .slice(row - 1, row - 1 + rows)
          .map((r) => r.slice(col - 1, col - 1 + cols)),
      setValues: (values) => {
        values.forEach((value, i) => {
          this.rows[row - 1 + i] = [...value];
        });
      },
    };
  }
}
const context = {
  console,
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => props.get(k) || null,
      setProperty: (k, v) => props.set(k, v),
    }),
  },
  Session: { getActiveUser: () => ({ getEmail: () => email }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  SpreadsheetApp: {
    create: () => {
      const id = crypto.randomUUID();
      const book = {
        sheets: new Map(),
        getId: () => id,
        getSheets() {
          return [...this.sheets.values()];
        },
        insertSheet(name) {
          const s = new Sheet(this, name);
          this.sheets.set(name, s);
          return s;
        },
        getSheetByName(name) {
          return this.sheets.get(name);
        },
      };
      book.insertSheet("Sheet1");
      books.set(id, book);
      return book;
    },
    openById: (id) => books.get(id),
    flush() {},
  },
  DriveApp: {
    createFolder: () => ({ getId: () => "folder" }),
    getFolderById: () => ({
      createFile: (blob) => {
        const id = crypto.randomUUID();
        const file = {
          getId: () => id,
          getBlob: () => ({ getBytes: () => blob.bytes }),
          setTrashed: () => files.delete(id),
        };
        files.set(id, file);
        return file;
      },
    }),
    getFileById: (id) => files.get(id),
  },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    DigestAlgorithm: { SHA_256: "sha256" },
    computeDigest: (alg, value) =>
      crypto.createHash(alg).update(value).digest(),
    base64EncodeWebSafe: (value) => Buffer.from(value).toString("base64url"),
    base64Encode: (value) => Buffer.from(value).toString("base64"),
    base64Decode: (value) => [...Buffer.from(value, "base64")],
    newBlob: (bytes) => ({ bytes }),
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("google-apps-script/Code.gs", "utf8"), context);
context.setupEnvironment_();
const bookId = props.get("SPREADSHEET_ID");
context.setupEnvironment_();
assert.equal(props.get("SPREADSHEET_ID"), bookId);
let state = context.loadApp();
email = "external@elsewhere.org";
assert.throws(() => context.loadApp(), /Acesso negado/);
email = "unknown@example.org";
assert.throws(() => context.loadApp(), /Acesso negado/);
email = "";
assert.throws(() => context.loadApp(), /Acesso negado/);
email = "operator@example.org";
state = context.applyChange(
  {
    type: "vehicle",
    vehicle: { name: "Viatura teste", plate: "ABC1D23", odometer: 100 },
  },
  state.version,
);
assert.throws(
  () =>
    context.applyChange(
      {
        type: "vehicle",
        vehicle: { name: "Duplicada", plate: "ABC1D23", odometer: 100 },
      },
      state.version,
    ),
  /Placa já/,
);
const image =
  "data:image/jpeg;base64," +
  Buffer.from([255, 216, 255, 217]).toString("base64");
const check = {
  odometer: 100,
  equipment: {
    spare: "Presente e em bom estado",
    wrench: "Presente e em bom estado",
    jack: "Ausente",
  },
  photos: Object.fromEntries(
    ["front", "rear", "right", "left", "dashboard", "seats"].map((k) => [
      k,
      image,
    ]),
  ),
  notes: "Dado fictício",
};
const loan = {
  vehicleId: state.db.vehicles[0].id,
  name: "Pessoa teste",
  registration: "123",
  checkout: check,
};
assert.throws(
  () =>
    context.applyChange(
      { type: "loan", loan: { ...loan, checkout: { ...check, photos: {} } } },
      state.version,
    ),
  /seis fotos/,
);
const oldVersion = state.version;
state = context.applyChange({ type: "loan", loan }, state.version);
assert.equal(files.size, 6);
assert.equal(state.db.loans[0].checkout.recordedBy, email);
assert.throws(
  () => context.applyChange({ type: "loan", loan }, oldVersion),
  /atualizados/,
);
assert.throws(
  () => context.applyChange({ type: "loan", loan }, state.version),
  /indisponível/,
);
const loanId = state.db.loans[0].id;
assert.throws(
  () =>
    context.applyChange(
      { type: "return", loanId, returned: { ...check, odometer: 99 } },
      state.version,
    ),
  /Odômetro/,
);
state = context.applyChange(
  { type: "return", loanId, returned: { ...check, odometer: 125 } },
  state.version,
);
assert.equal(state.db.vehicles[0].odometer, 125);
assert.equal(files.size, 12);
assert.equal(context.loadPhotos(loanId).returned.photos.front, image);
assert.throws(
  () =>
    context.applyChange(
      { type: "return", loanId, returned: { ...check, odometer: 125 } },
      state.version,
    ),
  /já devolvido/,
);
assert.throws(() => context.loadPhotos("missing"), /não encontrado/);
console.log(
  "PASS backend simulado: autorização, setup repetível, placa única, fotos obrigatórias, conflito de versão, retirada exclusiva, odômetro, devolução e leitura de fotos autenticada.",
);
