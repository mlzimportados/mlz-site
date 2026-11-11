// Pagamento online MLZ Company via Checkout InfinitePay.
// Ações (POST JSON, campo "acao"):
//   criar     { nome, telefone, cpf, email?, itens:[{id, qtd}], entrega:"entrega"|"retirada", endereco? }  -> { url, order_nsu }
//   confirmar { order_nsu, transaction_nsu, slug }   -> { status }   (página de retorno)
//   frete     { cep, itens:[{id, qtd}] }              -> { cidade, uf, opcoes:[{id, nome, preco, prazo, combinar?}] }
//   webhook   corpo enviado pela InfinitePay (sem "acao", via ?webhook=1)
// O pagamento só é aceito depois de conferido no payment_check da InfinitePay.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const API = "https://api.checkout.infinitepay.io";
const API_KEY = (Deno.env.get("INFINITEPAY_API_KEY") || "").trim();
console.log("InfinitePay API key configurada:", API_KEY ? "sim" : "não");
const SITE_PADRAO = "https://mlzcompany.com";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const r2 = (n: number) => Math.round(n * 100) / 100;

async function handle(): Promise<string> {
  const { data } = await sb.from("config").select("valor").eq("chave", "infinitepay_handle").maybeSingle();
  return String(data?.valor || "").trim().replace(/^\$/, "");
}
async function ip(path: string, body: unknown) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) h["X-Api-Key"] = API_KEY;
  const r = await fetch(API + path, { method: "POST", headers: h, body: JSON.stringify(body) });
  const t = await r.text(); let d: any = {}; try { d = JSON.parse(t); } catch { d = { raw: t }; }
  if (!r.ok) throw new Error(`InfinitePay ${r.status}: ${t.slice(0, 300)}`);
  return d;
}

// ---------- e-mail de compra confirmada (Resend, secret RESEND_API_KEY) ----------
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_KEY = (Deno.env.get("RESEND_API_KEY") || "").trim();
const EMAIL_DE = (Deno.env.get("EMAIL_REMETENTE") || "MLZ Company <contato@mlzcompany.com>").trim();
const brl = (n: number) => "R$ " + (+n || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const h = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);
async function enviarEmail(para: string[], assunto: string, html: string, responder?: string) {
  const r = await fetch("https://api.resend.com/emails", { method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_DE, to: para, subject: assunto, html, ...(responder ? { reply_to: responder } : {}) }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`Resend ${r.status}: ${t.slice(0, 300)}`);
}
function htmlCompra(p: any, cfg: Record<string, string>, paraLoja: boolean) {
  const itens = (Array.isArray(p.itens) ? p.itens : []).map((i: any) => `<tr><td style="padding:8px 0;border-bottom:1px solid #1f2d44;color:#f2f4f8">${h(i.quantidade)}× ${h(i.descricao)}</td><td style="padding:8px 0;border-bottom:1px solid #1f2d44;text-align:right;white-space:nowrap;color:#f2f4f8">${brl(i.quantidade * i.preco_unit)}</td></tr>`).join("");
  const e = p.endereco || {};
  const entrega = p.entrega === "retirada"
    ? `<b>Retirada na loja</b><br>${h(cfg.retirada_endereco || "")}${cfg.retirada_horario ? `<br>${h(cfg.retirada_horario)}` : ""}`
    : `<b>Entrega${p.frete?.nome ? ` · ${h(p.frete.nome)}` : ""}</b>${p.frete?.prazo ? ` (${h(p.frete.prazo)})` : ""}<br>${h([e.rua, e.numero].filter(Boolean).join(", "))}${e.complemento ? ` · ${h(e.complemento)}` : ""}<br>${h([e.bairro, e.cidade, e.uf].filter(Boolean).join(" · "))}${e.cep ? ` · CEP ${h(e.cep)}` : ""}`;
  const forma = String(p.capture_method || "").toLowerCase().includes("pix") ? "Pix" : (p.capture_method ? `Cartão${p.installments > 1 ? ` em ${p.installments}x` : ""}` : "");
  const wa = String(cfg.whatsapp || "").replace(/\D/g, "");
  const topo = paraLoja
    ? `<p style="margin:0 0 6px;font-size:20px;font-weight:700">Nova venda no site · Pedido #${h(p.id)}</p><p style="margin:0 0 18px;color:#a9b3c4">${h(p.nome)} · ${h(p.telefone)} · CPF ${h(p.cpf || "")}${p.email ? ` · ${h(p.email)}` : ""}</p>`
    : `<p style="margin:0 0 6px;font-size:20px;font-weight:700">Compra confirmada!</p><p style="margin:0 0 18px;color:#a9b3c4">Olá, ${h(String(p.nome || "").split(" ")[0])}! Recebemos o pagamento do seu pedido <b>#${h(p.id)}</b>. Obrigado por comprar com a MLZ Company.</p>`;
  const rodape = paraLoja ? "" : `<p style="margin:22px 0 0;color:#a9b3c4">${p.entrega === "retirada" ? "Seu pedido já pode ser retirado no endereço acima." : "Vamos separar e enviar seu pedido. Mandamos o código de rastreio pelo WhatsApp assim que for postado."}</p>${wa ? `<p style="margin:12px 0 0"><a href="https://wa.me/${wa.length <= 11 ? "55" + wa : wa}" style="color:#d9b24c;font-weight:700">Falar com a gente no WhatsApp ${h(cfg.whatsapp)}</a></p>` : ""}`;
  return `<div style="background:#07111f;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#f2f4f8"><div style="max-width:560px;margin:0 auto;background:#0b1a2e;border-radius:12px;overflow:hidden">
<div style="background:#050c17;border-bottom:1px solid #2a3a52;padding:18px 24px;color:#d9b24c;font-weight:700;letter-spacing:.12em;font-size:18px">MLZ COMPANY</div>
<div style="padding:24px">${topo}
<table style="width:100%;border-collapse:collapse;font-size:14px;color:#f2f4f8">${itens}<tr><td style="padding:10px 0;font-weight:700;color:#d9b24c">Total pago</td><td style="padding:10px 0;font-weight:700;text-align:right;color:#d9b24c">${brl(p.paid_amount || p.total)}</td></tr></table>
${forma ? `<p style="margin:4px 0 0;color:#a9b3c4;font-size:14px">Pagamento: ${h(forma)}${p.receipt_url ? ` · <a href="${h(p.receipt_url)}" style="color:#d9b24c">ver comprovante</a>` : ""}</p>` : ""}
<div style="margin-top:18px;padding:14px;background:#10223a;border-radius:8px;font-size:14px;line-height:1.5">${entrega}</div>${rodape}
</div><div style="padding:14px 24px;background:#10223a;color:#7d889b;font-size:12px">MLZ Company · mlzcompany.com</div></div></div>`;
}
// manda uma vez só por pedido (marca email_enviado_em antes de enviar; erro fica em email_erro)
async function emailCompra(id: number) {
  if (!RESEND_KEY) return;
  try {
    const { data: p } = await sb.from("pedidos").update({ email_enviado_em: new Date().toISOString(), email_erro: null })
      .eq("id", id).eq("status", "pago").is("email_enviado_em", null).select("*").maybeSingle();
    if (!p) return;
    const { data: cs } = await sb.from("config").select("chave, valor").in("chave", ["email", "email_avisos", "whatsapp", "retirada_endereco", "retirada_horario"]);
    const cfg: Record<string, string> = Object.fromEntries((cs || []).map((c: any) => [c.chave, String(c.valor || "").trim()]));
    const loja = (cfg.email_avisos || cfg.email || "").split(/[,;\s]+/).filter((x) => EMAIL_OK.test(x));
    const erros: string[] = [];
    if (p.email && EMAIL_OK.test(p.email)) {
      try { await enviarEmail([p.email], `Compra confirmada · Pedido #${p.id} · MLZ Company`, htmlCompra(p, cfg, false), cfg.email || undefined); }
      catch (e) { erros.push("cliente: " + String(e)); }
    }
    if (loja.length) {
      try { await enviarEmail(loja, `Nova venda #${p.id} · ${p.nome} · ${brl(p.paid_amount || p.total)}`, htmlCompra(p, cfg, true), p.email || undefined); }
      catch (e) { erros.push("loja: " + String(e)); }
    }
    if (erros.length) { console.error("email compra", id, erros.join(" | ")); await sb.from("pedidos").update({ email_erro: erros.join(" | ").slice(0, 500) }).eq("id", id); }
    else console.log("email compra enviado", id);
  } catch (e) { console.error("email compra falhou", id, String(e)); }
}

// ---------- frete ----------
// Ponta Grossa (config frete_local_*) = taxa fixa; outras cidades = cotação da SuperFrete (secret SUPERFRETE_TOKEN)
// e do Melhor Envio (secret MELHORENVIO_TOKEN) juntas, ficando o menor preço de cada serviço
const SF_TOKEN = (Deno.env.get("SUPERFRETE_TOKEN") || "").trim();
const SF_API = (Deno.env.get("SUPERFRETE_URL") || "https://api.superfrete.com").replace(/\/$/, "");
const ME_TOKEN = (Deno.env.get("MELHORENVIO_TOKEN") || "").trim();
const ME_API = (Deno.env.get("MELHORENVIO_URL") || "https://melhorenvio.com.br").replace(/\/$/, "");
const semAcento = (t: string) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const num = (t: unknown) => { const n = parseFloat(String(t ?? "").replace(",", ".")); return isFinite(n) ? n : NaN; };
async function cfgs(chaves: string[]) {
  const { data } = await sb.from("config").select("chave, valor").in("chave", chaves);
  return Object.fromEntries((data || []).map((r: any) => [r.chave, String(r.valor ?? "").trim()]));
}
async function cotarFrete(cepIn: string, pedidos: { id: number; qtd: number }[]) {
  const cep = String(cepIn || "").replace(/\D/g, "");
  if (cep.length !== 8) throw new ErroCliente("Informe um CEP válido.");
  const { data: prods } = await sb.from("produtos").select("id,preco,preco_promo").in("id", pedidos.map((i) => i.id));
  const subtotal = r2(pedidos.reduce((s, i) => { const p: any = (prods || []).find((x: any) => x.id === i.id); if (!p) return s;
    const pr = (p.preco_promo && +p.preco_promo > 0 && +p.preco_promo < +p.preco) ? +p.preco_promo : +p.preco; return s + pr * i.qtd; }, 0));
  const c = await cfgs(["frete_local_cidade", "frete_local_valor", "frete_local_gratis_acima", "frete_local_prazo", "frete_cep_origem", "frete_peso_kg", "frete_dimensoes", "frete_empresas"]);
  let cidade = "", uf = "";
  try { const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`); const d = await r.json(); if (!d.erro) { cidade = d.localidade || ""; uf = d.uf || ""; } else throw new ErroCliente("CEP não encontrado."); }
  catch (e) { if (e instanceof ErroCliente) throw e; }
  const local = (c.frete_local_cidade || "Ponta Grossa").split(/[;,]/).map(semAcento).filter(Boolean);
  if (cidade && uf === "PR" && local.includes(semAcento(cidade))) {
    const v = num(c.frete_local_valor), gratis = num(c.frete_local_gratis_acima);
    const combinar = !(v >= 0);
    const preco = combinar ? 0 : (gratis > 0 && subtotal >= gratis ? 0 : r2(v));
    return { cidade, uf, subtotal, opcoes: [{ id: "local", nome: `Entrega em ${cidade}`, preco, prazo: c.frete_local_prazo || "", combinar }] };
  }
  if (!SF_TOKEN && !ME_TOKEN) return { cidade, uf, subtotal, opcoes: [{ id: "combinar", nome: "Frete combinado pelo WhatsApp", preco: 0, prazo: "", combinar: true }] };
  const [w, h, l] = (c.frete_dimensoes || "12x20x10").split(/[x×*,; ]+/).map(num);
  const peso = num(c.frete_peso_kg) > 0 ? num(c.frete_peso_kg) : 0.5;
  const qtd = pedidos.reduce((s, i) => s + i.qtd, 0);
  const origem = (c.frete_cep_origem || "84010020").replace(/\D/g, "");
  const W = w > 0 ? w : 12, H = h > 0 ? h : 20, L = l > 0 ? l : 10;
  const hdr = (tk: string) => ({ "Accept": "application/json", "Content-Type": "application/json", "Authorization": `Bearer ${tk}`, "User-Agent": "MLZ Company (contato@mlzcompany.com)" });
  const pedir = async (nomeApi: string, url: string, tk: string, body: unknown) => {
    const r = await fetch(url, { method: "POST", headers: hdr(tk), body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
    const t = await r.text(); let d: any; try { d = JSON.parse(t); } catch { d = null; }
    if (!r.ok || !Array.isArray(d)) { console.error(nomeApi, r.status, t.slice(0, 300)); throw new Error(nomeApi); }
    return d;
  };
  // as duas plataformas são consultadas juntas; para cada serviço fica o preço mais barato
  const consultas: Promise<any[]>[] = [];
  // SuperFrete: 1 PAC, 2 SEDEX, 17 Mini Envios, 3 Jadlog, 31 Loggi, 33 J&T (caixas empilhadas pela altura)
  if (SF_TOKEN) consultas.push(pedir("superfrete", `${SF_API}/api/v0/calculator`, SF_TOKEN, { from: { postal_code: origem }, to: { postal_code: cep }, services: "1,2,17,3,31,33",
    options: { own_hand: false, receipt: false, insurance_value: subtotal, use_insurance_value: false },
    package: { height: Math.min(100, H * qtd), width: W, length: L, weight: r2(peso * qtd) } }).then((d) => d.map((o: any) => ({ ...o, _src: "sf" }))));
  if (ME_TOKEN) consultas.push(pedir("melhor envio", `${ME_API}/api/v2/me/shipment/calculate`, ME_TOKEN, { from: { postal_code: origem }, to: { postal_code: cep },
    products: [{ id: "mlz", width: W, height: H, length: L, weight: peso, insurance_value: r2(subtotal / Math.max(1, qtd)), quantity: qtd }],
    options: { receipt: false, own_hand: false } }).then((d) => d.map((o: any) => ({ ...o, _src: "me" }))));
  const res = await Promise.allSettled(consultas);
  const d = res.flatMap((x) => x.status === "fulfilled" ? x.value : []);
  if (!res.some((x) => x.status === "fulfilled")) throw new ErroCliente("Não foi possível calcular o frete agora. Tente de novo em instantes.");
  // transportadoras preferidas (config frete_empresas, ex.: "J&T"); se nenhuma atende o CEP, mostra as outras
  const pref = (c.frete_empresas || "").split(/[;,]/).map(semAcento).filter(Boolean);
  const validas = d.filter((o: any) => !o.error && +(o.custom_price ?? o.price) > 0);
  const daPref = pref.length ? validas.filter((o: any) => pref.some((x) => semAcento(`${o.company?.name || ""} ${o.name || ""}`).includes(x))) : [];
  // por transportadora: o envio padrão (mais barato) e o expresso (mais rápido), cada um pela plataforma mais barata
  const porEmp = new Map<string, any[]>();
  for (const o of (daPref.length ? daPref : validas)) {
    const dias = +(o.custom_delivery_time ?? o.delivery_time) || 0;
    const emp = String(o.company?.name || ""), srv = String(o.name || "");
    const cap = (t: string) => t === t.toUpperCase() && t.length > 3 ? t.charAt(0) + t.slice(1).toLowerCase() : t;
    const nome = (semAcento(srv).includes(semAcento(emp)) ? cap(srv) : `${cap(emp)} ${cap(srv)}`).replace(/\s+(ponto|centralizado)\b/gi, "").trim();
    const op = { id: `${o._src}-${o.id}`, nome, via: o._src === "sf" ? "SuperFrete" : "Melhor Envio", dias, preco: r2(+(o.custom_price ?? o.price)), prazo: dias ? `${dias} dia${dias === 1 ? "" : "s"} úte${dias === 1 ? "il" : "is"} após o envio` : "" };
    const ke = semAcento(emp).replace(/\bexpress\b/g, "").replace(/[^a-z0-9]/g, "") || semAcento(nome);
    porEmp.set(ke, [...(porEmp.get(ke) || []), op]);
  }
  let opcoes: any[] = [];
  for (const lista of porEmp.values()) {
    const barata = [...lista].sort((a, b) => a.preco - b.preco || (a.dias || 99) - (b.dias || 99))[0];
    const rapida = [...lista].sort((a, b) => (a.dias || 99) - (b.dias || 99) || a.preco - b.preco)[0];
    opcoes.push(barata);
    if (rapida !== barata && (rapida.dias || 99) < (barata.dias || 99)) opcoes.push(rapida);
  }
  // mesmo prazo em transportadoras diferentes: fica só a mais barata
  const porPrazo = new Map<number, any>();
  for (const o of opcoes) { const k = o.dias || 99, a = porPrazo.get(k); if (!a || o.preco < a.preco) porPrazo.set(k, o); }
  opcoes = [...porPrazo.values()].sort((a: any, b: any) => a.preco - b.preco);
  if (!opcoes.length) throw new ErroCliente("Não encontramos frete para esse CEP. Chame a gente no WhatsApp.");
  return { cidade, uf, subtotal, opcoes };
}
class ErroCliente extends Error {}
const cpfValido = (d: string) => {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +d[9] && dv(10) === +d[10];
};
const lerItens = (arr: unknown) => (Array.isArray(arr) ? arr : []).map((i: any) => ({ id: +i.id, qtd: Math.max(1, Math.min(20, parseInt(i.qtd, 10) || 1)) })).filter((i: any) => i.id > 0);

async function criar(b: any, req: Request) {
  const nome = String(b.nome || "").trim().slice(0, 120), telefone = String(b.telefone || "").trim().slice(0, 30);
  if (!nome || telefone.replace(/\D/g, "").length < 10) return json({ erro: "Informe nome e WhatsApp com DDD." }, 400);
  const pedidos = lerItens(b.itens);
  if (!pedidos.length) return json({ erro: "Sacola vazia." }, 400);
  // CPF obrigatório em todo pedido (entrega ou retirada)
  const cpfD = String(b.cpf || "").replace(/\D/g, "");
  if (!cpfValido(cpfD)) return json({ erro: "Informe um CPF válido de quem vai receber ou retirar o pedido." }, 400);
  const cpf = `${cpfD.slice(0, 3)}.${cpfD.slice(3, 6)}.${cpfD.slice(6, 9)}-${cpfD.slice(9)}`;
  // e-mail para a confirmação da compra (a InfinitePay não devolve o e-mail de quem pagou)
  const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
  if (email && !EMAIL_OK.test(email)) return json({ erro: "Informe um e-mail válido para receber a confirmação da compra." }, 400);
  const entrega = b.entrega === "retirada" ? "retirada" : b.entrega === "entrega" ? "entrega" : null;
  let endereco: Record<string, string> | null = null;
  if (entrega === "entrega") {
    const e = b.endereco || {}, t = (k: string, n = 120) => String(e[k] || "").trim().slice(0, n);
    endereco = { cep: t("cep").replace(/\D/g, "").slice(0, 8), rua: t("rua"), numero: t("numero", 20), complemento: t("complemento"), bairro: t("bairro", 80), cidade: t("cidade", 80), uf: t("uf", 2).toUpperCase(), referencia: t("referencia", 160) };
    if (endereco.cep.length !== 8 || !endereco.rua || !endereco.numero || !endereco.bairro || !endereco.cidade || endereco.uf.length !== 2)
      return json({ erro: "Preencha o endereço completo para a entrega." }, 400);
    endereco.cep = endereco.cep.slice(0, 5) + "-" + endereco.cep.slice(5);
  }
  // cliente logado no site: liga o pedido à conta dele
  let user_id: string | null = null;
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (tok && tok.split(".").length === 3) {
    try { const { data } = await sb.auth.getUser(tok); user_id = data?.user?.id || null; } catch { /* visitante */ }
  }
  const tag = await handle(); if (!tag) return json({ erro: "Pagamento online ainda não está ativo. Chame a gente no WhatsApp." }, 503);
  const { data: prods, error } = await sb.from("produtos").select("id,nome,marca,preco,preco_promo,estoque,ativo").in("id", pedidos.map((i: any) => i.id));
  if (error) throw error;
  const itens = [];
  for (const i of pedidos) {
    const p = prods!.find((x: any) => x.id === i.id);
    if (!p || !p.ativo) return json({ erro: "Um produto da sacola não está mais disponível." }, 409);
    if (p.estoque < i.qtd) return json({ erro: `${p.nome}: só temos ${Math.max(0, p.estoque)} em estoque.` }, 409);
    const preco = (p.preco_promo && +p.preco_promo > 0 && +p.preco_promo < +p.preco) ? +p.preco_promo : +p.preco;
    if (!(preco > 0)) return json({ erro: `${p.nome} está sem preço. Chame a gente no WhatsApp.` }, 409);
    itens.push({ produto_id: p.id, descricao: [p.marca, p.nome].filter(Boolean).join(" "), quantidade: i.qtd, preco_unit: r2(preco) });
  }
  // frete recalculado aqui (não confia no valor vindo do navegador)
  let frete: any = null;
  if (entrega === "entrega") {
    const cot = await cotarFrete(endereco!.cep, pedidos);
    const op = cot.opcoes.find((o: any) => o.id === String(b.frete || "")) || cot.opcoes.find((o: any) => o.nome === String(b.frete_nome || "")) || (cot.opcoes.length === 1 ? cot.opcoes[0] : null);
    if (!op) return json({ erro: "Escolha uma opção de frete." }, 400);
    frete = op;
    if (op.preco > 0) itens.push({ produto_id: null, descricao: `Frete · ${op.nome}${op.via ? ` · ${op.via}` : ""}`, quantidade: 1, preco_unit: r2(op.preco) } as any);
  }
  const total = r2(itens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0));
  const { data: ped, error: e2 } = await sb.from("pedidos").insert({ nome, telefone, itens, total, entrega, endereco, user_id, frete, cpf, email: email || null }).select("id, order_nsu").single();
  if (e2) throw e2;
  const origem = req.headers.get("origin") || "";
  const site = /^https:\/\/([a-z0-9-]+\.)*(netlify\.app|pages\.dev|workers\.dev)$|^https:\/\/(www\.)?mlzcompany\.com$|^https?:\/\/localhost(:\d+)?$/.test(origem) ? origem : SITE_PADRAO;
  const tel = telefone.replace(/\D/g, "");
  let link: any;
  try { link = await ip("/links", {
    handle: tag,
    order_nsu: ped.order_nsu,
    items: itens.map((i, k) => ({ quantity: i.quantidade, price: Math.round(i.preco_unit * 100), description: (k ? "" : `Pedido #${ped.id} · `) + i.descricao })),
    redirect_url: `${site}/obrigado.html`,
    webhook_url: `${SB_URL}/functions/v1/pagamento?webhook=1`,
    customer: { name: nome, phone_number: "+" + (tel.length <= 11 ? "55" + tel : tel), ...(email ? { email } : {}) },
  }); } catch (e) {
    await sb.from("pedidos").update({ status: "cancelado", obs: String(e).slice(0, 300) }).eq("id", ped.id);
    throw e;
  }
  console.log("link criado", ped.id, JSON.stringify(link).slice(0, 500));
  const url = link.url || link.checkout_url || link.link || link.payment_url;
  if (!url) throw new Error("InfinitePay não devolveu o link: " + JSON.stringify(link).slice(0, 300));
  await sb.from("pedidos").update({ checkout_url: url, invoice_slug: link.slug || link.invoice_slug || null, link_resp: link,
    ip_order_nsu: (link.order_nsu && link.order_nsu !== ped.order_nsu) ? String(link.order_nsu) : null }).eq("id", ped.id);
  return json({ url, order_nsu: ped.order_nsu });
}

// acha o pedido do site: a InfinitePay pode devolver um order_nsu próprio dela
const UUID = /^[0-9a-f-]{36}$/i;
async function acharPedido(ip_nsu: string, local: string, itens: any[]) {
  const sel = "id, order_nsu, ip_order_nsu, status, total";
  if (UUID.test(ip_nsu || "")) {
    const { data } = await sb.from("pedidos").select(sel).eq("order_nsu", ip_nsu).maybeSingle(); if (data) return data;
  }
  if (ip_nsu) {
    const { data } = await sb.from("pedidos").select(sel).eq("ip_order_nsu", ip_nsu).maybeSingle(); if (data) return data;
  }
  const m = (Array.isArray(itens) ? itens : []).map((i: any) => String(i?.description || "").match(/Pedido #(\d+)/)).find(Boolean);
  if (m) {
    const { data } = await sb.from("pedidos").select(sel).eq("id", +m[1]).maybeSingle(); if (data) return data;
  }
  if (UUID.test(local || "")) {
    const { data } = await sb.from("pedidos").select(sel).eq("order_nsu", local).maybeSingle(); if (data) return data;
  }
  return null;
}

// confere na InfinitePay e, se pago, registra a venda
async function conferir(ip_nsu: string, transaction_nsu: string, slug: string, local = "", itens: any[] = []) {
  const ped: any = await acharPedido(ip_nsu, local, itens);
  if (!ped) return { status: "invalido" };
  if (ped.status === "pago") { await emailCompra(ped.id); return { status: "pago" }; }
  if (!transaction_nsu || !slug || !ip_nsu) return { status: ped.status };
  const chk = await ip("/payment_check", { handle: await handle(), order_nsu: ip_nsu, transaction_nsu, slug });
  console.log("payment_check", ped.id, JSON.stringify({ success: chk.success, paid: chk.paid, amount: chk.amount, paid_amount: chk.paid_amount, capture_method: chk.capture_method }));
  if (!chk.paid) return { status: "pendente" };
  const pago = chk.paid_amount ? chk.paid_amount / 100 : (chk.amount ? chk.amount / 100 : null);
  // Pix com desconto configurado na InfinitePay: aceita até o % de config.pix_desconto a menos
  let minimo = +ped.total;
  if (String(chk.capture_method || "").toLowerCase().includes("pix")) {
    const { data: cd } = await sb.from("config").select("valor").eq("chave", "pix_desconto").maybeSingle();
    const d = parseFloat(String(cd?.valor || "0").replace(",", "."));
    if (d > 0 && d < 50) minimo = r2(+ped.total * (100 - d) / 100);
  }
  if (pago !== null && pago + 0.019 < minimo) { console.error("valor pago menor que o pedido", ped.id, pago, ped.total); return { status: "pendente" }; }
  if (!ped.ip_order_nsu && ip_nsu !== ped.order_nsu) await sb.from("pedidos").update({ ip_order_nsu: ip_nsu }).eq("id", ped.id);
  const { error } = await sb.rpc("confirmar_pedido", { p_order_nsu: ped.order_nsu, p_transaction_nsu: transaction_nsu, p_slug: slug,
    p_capture: chk.capture_method || null, p_installments: chk.installments || 1, p_paid: pago, p_receipt: chk.receipt_url || null });
  if (error) throw error;
  await emailCompra(ped.id);
  return { status: "pago" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    if (new URL(req.url).searchParams.get("webhook")) {
      console.log("webhook", JSON.stringify({ keys: Object.keys(b), order_nsu: b.order_nsu, transaction_nsu: b.transaction_nsu, slug: b.invoice_slug || b.slug, paid_amount: b.paid_amount, capture_method: b.capture_method }));
      const r = await conferir(b.order_nsu, b.transaction_nsu, b.invoice_slug || b.slug, "", b.items);
      console.log("webhook resultado", JSON.stringify(r));
      // 400 faz a InfinitePay tentar de novo se ainda não conseguimos confirmar
      return json(r, r.status === "pago" ? 200 : 400);
    }
    if (b.acao === "frete") return json(await cotarFrete(String(b.cep || ""), lerItens(b.itens)));
    if (b.acao === "criar") return await criar(b, req);
    if (b.acao === "confirmar") return json(await conferir(String(b.order_nsu || ""), b.transaction_nsu, b.slug, String(b.local || "")));
    return json({ erro: "ação inválida" }, 400);
  } catch (e) {
    if (e instanceof ErroCliente) return json({ erro: e.message }, 400);
    console.error(e);
    return json({ erro: "Não foi possível processar o pagamento agora. Tente de novo ou chame a gente no WhatsApp." }, 500);
  }
});
