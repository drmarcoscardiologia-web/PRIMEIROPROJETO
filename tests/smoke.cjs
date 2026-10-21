const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(process.env.APP_URL || "http://127.0.0.1:8000/main.html");
    await page.getByText("Cadastrar viatura", { exact: false }).first().click();
    await page.locator("[name=name]").fill("Viatura teste");
    await page.locator("[name=plate]").fill("ABC1D23");
    await page.locator("[name=odometer]").fill("100");
    await page.locator("#vehicleForm button").click();
    await page.getByText("Registrar retirada", { exact: true }).click();
    await page.locator("[name=name]").fill("Responsável teste");
    await page.locator("[name=registration]").fill("12345");
    const photo = await page.screenshot();
    const fillChecklist = async () => {
      for (const key of [
        "front",
        "rear",
        "right",
        "left",
        "dashboard",
        "seats",
      ]) {
        await page.locator(`[name=${key}]`).setInputFiles({
          name: "teste.png",
          mimeType: "image/png",
          buffer: photo,
        });
      }
      for (const key of ["spare", "wrench", "jack"]) {
        await page
          .locator(`[name=${key}]`)
          .selectOption({ label: "Presente e em bom estado" });
      }
    };
    await fillChecklist();
    await page.locator("#submitCheck").click();
    await page.getByText("Registrar devolução", { exact: true }).waitFor();
    await page.reload();
    await page.getByText("Registrar devolução", { exact: true }).click();
    await page.locator("[name=odometer]").fill("99");
    assert.equal(
      await page
        .locator("[name=odometer]")
        .evaluate((el) => el.validity.rangeUnderflow),
      true,
    );
    await page.locator("[name=odometer]").fill("125");
    await fillChecklist();
    await page.locator("#submitCheck").click();
    await page.getByText("Registrar retirada", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Histórico de empréstimos", exact: true })
      .click();
    await page.getByText("Ver checklist", { exact: true }).click();
    await page.getByText("Percurso: 25 km", { exact: false }).waitFor();
    assert.equal(await page.locator("#modalBody img").count(), 12);
    const data = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("frota-v1")),
    );
    assert.equal(data.loans.length, 1);
    assert.equal(data.loans[0].returned.odometer, 125);
    assert.equal(data.vehicles[0].odometer, 125);
    assert.deepEqual(errors, []);
    await page.locator("#close").click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByText("Exportar registros (JSON)", { exact: true }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^frota-backup-.*\.json$/);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Viaturas", exact: true }).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    console.log(
      "PASS cadastro, checklist com 6 fotos, persistência, odômetro mínimo, devolução, histórico com 12 fotos, exportação e layout móvel.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
