// Pagamento online MLZ Company via Checkout InfinitePay.
// Ações (POST JSON, campo "acao"):
//   criar     { nome, telefone, itens:[{id, qtd}] }  -> { url, order_nsu }
//   confirmar { order_nsu, transaction_nsu, slug }   -> { status }   (página de retorno)
//   webhook   corpo enviado pela InfinitePay (sem "acao", via ?webhook=1)
// O pagamento só é aceito depois de conferido no payment_check da InfinitePay.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const API = "https://api.checkout.infinitepay.io";
const API_KEY = (Deno.env.get("INFINITEPAY_API_KEY") || "").trim();
console.log("InfinitePay API key configurada:", API_KEY ? "sim" : "não");
const SITE_PADRAO = "https://mlzcompany.netlify.app";
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

async function criar(b: any, req: Request) {
  const nome = String(b.nome || "").trim().slice(0, 120), telefone = String(b.telefone || "").trim().slice(0, 30);
  if (!nome || telefone.replace(/\D/g, "").length < 10) return json({ erro: "Informe nome e WhatsApp com DDD." }, 400);
  const pedidos = (Array.isArray(b.itens) ? b.itens : []).map((i: any) => ({ id: +i.id, qtd: Math.max(1, Math.min(20, parseInt(i.qtd, 10) || 1)) })).filter((i: any) => i.id > 0);
  if (!pedidos.length) return json({ erro: "Sacola vazia." }, 400);
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
  const total = r2(itens.reduce((s, i) => s + i.quantidade * i.preco_unit, 0));
  const { data: ped, error: e2 } = await sb.from("pedidos").insert({ nome, telefone, itens, total }).select("id, order_nsu").single();
  if (e2) throw e2;
  const origem = req.headers.get("origin") || "";
  const site = /^https:\/\/([a-z0-9-]+\.)*netlify\.app$|^https?:\/\/localhost(:\d+)?$/.test(origem) ? origem : SITE_PADRAO;
  const tel = telefone.replace(/\D/g, "");
  let link: any;
  try { link = await ip("/links", {
    handle: tag,
    order_nsu: ped.order_nsu,
    items: itens.map((i) => ({ quantity: i.quantidade, price: Math.round(i.preco_unit * 100), description: i.descricao })),
    redirect_url: `${site}/obrigado.html`,
    webhook_url: `${SB_URL}/functions/v1/pagamento?webhook=1`,
    customer: { name: nome, phone_number: "+" + (tel.length <= 11 ? "55" + tel : tel) },
  }); } catch (e) {
    await sb.from("pedidos").update({ status: "cancelado", obs: String(e).slice(0, 300) }).eq("id", ped.id);
    throw e;
  }
  const url = link.url || link.checkout_url || link.link || link.payment_url;
  if (!url) throw new Error("InfinitePay não devolveu o link: " + JSON.stringify(link).slice(0, 300));
  await sb.from("pedidos").update({ checkout_url: url, invoice_slug: link.slug || link.invoice_slug || null }).eq("id", ped.id);
  return json({ url, order_nsu: ped.order_nsu });
}

// confere na InfinitePay e, se pago, registra a venda
async function conferir(order_nsu: string, transaction_nsu: string, slug: string) {
  if (!/^[0-9a-f-]{36}$/i.test(order_nsu || "")) return { status: "invalido" };
  const { data: ped } = await sb.from("pedidos").select("status").eq("order_nsu", order_nsu).maybeSingle();
  if (!ped) return { status: "invalido" };
  if (ped.status === "pago") return { status: "pago" };
  if (!transaction_nsu || !slug) return { status: ped.status };
  const chk = await ip("/payment_check", { handle: await handle(), order_nsu, transaction_nsu, slug });
  if (!chk.paid) return { status: "pendente" };
  const { error } = await sb.rpc("confirmar_pedido", { p_order_nsu: order_nsu, p_transaction_nsu: transaction_nsu, p_slug: slug,
    p_capture: chk.capture_method || null, p_installments: chk.installments || 1, p_paid: chk.paid_amount ? chk.paid_amount / 100 : null, p_receipt: chk.receipt_url || null });
  if (error) throw error;
  return { status: "pago" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    if (new URL(req.url).searchParams.get("webhook")) {
      const r = await conferir(b.order_nsu, b.transaction_nsu, b.invoice_slug || b.slug);
      // 400 faz a InfinitePay tentar de novo se ainda não conseguimos confirmar
      return json(r, r.status === "pago" ? 200 : 400);
    }
    if (b.acao === "criar") return await criar(b, req);
    if (b.acao === "confirmar") return json(await conferir(b.order_nsu, b.transaction_nsu, b.slug));
    return json({ erro: "ação inválida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ erro: "Não foi possível processar o pagamento agora. Tente de novo ou chame a gente no WhatsApp." }, 500);
  }
});
