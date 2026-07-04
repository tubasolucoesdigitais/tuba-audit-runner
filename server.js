import express from "express";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BASE = process.env.APP_URL; // https://tubagestaoia.lovable.app
const EMAIL = process.env.MASTER_EMAIL;
const PASSWORD = process.env.MASTER_PASSWORD;

app.post("/run", async (req, res) => {
  const secret = req.headers["x-runner-secret"];
  if (secret !== process.env.RUNNER_SECRET) return res.status(401).send("nope");
  const { run_id } = req.body;
  res.json({ ok: true, run_id }); // responde já; roda em background

  const log = async (modulo, item, status, evidencia, causa) => {
    await sb.from("audit_findings").insert({
      run_id, modulo, item, status,
      evidencia, causa_raiz: causa, acao: "ui"
    });
  };

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/auth`);
    await page.fill('input[type=email]', EMAIL);
    await page.fill('input[type=password]', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL(/\/(dashboard|$)/, { timeout: 15000 });
    await log("UI/Login", "Login master via UI", "aprovado", { url: page.url() });

    // Exemplo: criar cliente pela UI
    await page.goto(`${BASE}/clientes`);
    await page.click('text=Novo cliente');
    await page.fill('input[name=nome]', `[UI-AUDIT] ${Date.now()}`);
    await page.click('button:has-text("Salvar")');
    const ok = await page.waitForSelector('text=/sucesso|salvo/i', { timeout: 5000 }).then(()=>true).catch(()=>false);
    await log("UI/Clientes", "Criar cliente via UI real", ok ? "aprovado" : "reprovado",
      { url: page.url() }, ok ? undefined : "Toast de sucesso não apareceu em 5s");

    // ... adicione mais roteiros por módulo aqui
  } catch (e) {
    await log("UI/Runner", "Execução do runner", "reprovado", { erro: e.message }, e.message);
  } finally {
    await browser.close();
  }
});

app.listen(process.env.PORT || 10000, () => console.log("runner up"));
