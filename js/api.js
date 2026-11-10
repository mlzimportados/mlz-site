// Camada de dados MLZ — fala com o Supabase.
// A chave abaixo é PÚBLICA (anon): ela só lê o catálogo. Vendas, clientes e
// custos ficam protegidos por login de admin (regras no próprio banco).
const MLZ_SUPABASE_URL = 'https://qcjvxxzkpvydwawkpbrq.supabase.co';
const MLZ_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjanZ4eHprcHZ5ZHdhd2twYnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxODg4NjAsImV4cCI6MjEwOTc2NDg2MH0.8K8M7LmjbK9qMqbndj_Skt7oe1aGQzAtNREHPf0gsIg';

// pagamento online (função no servidor que fala com a InfinitePay)
async function mlzPagamento(body) {
  if (window.MLZ_MOCK && window.MLZ_MOCK.pagamento) return window.MLZ_MOCK.pagamento(body);
  const r = await fetch(MLZ_SUPABASE_URL + '/functions/v1/pagamento', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: MLZ_SUPABASE_KEY, Authorization: 'Bearer ' + MLZ_SUPABASE_KEY }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Não foi possível iniciar o pagamento.');
  return d;
}
const PROD_PUBLICO = 'id,nome,marca,categoria_id,tipo,descricao,familia,preco,preco_promo,estoque,imagem,ativo,destaque';

function criarApi() {
  if (window.MLZ_MOCK) return window.MLZ_MOCK;
  const sb = window.supabase.createClient(MLZ_SUPABASE_URL, MLZ_SUPABASE_KEY);
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  return {
    sb,
    // público
    config: async () => Object.fromEntries(ok(await sb.from('config').select('chave,valor')).map(r => [r.chave, r.valor])),
    categorias: async () => ok(await sb.from('categorias').select('id,nome,ordem').order('ordem')),
    produtosPublicos: async () => ok(await sb.from('produtos').select(PROD_PUBLICO).eq('ativo', true).order('destaque', { ascending: false }).order('nome')),
    // auth
    sessao: async () => (await sb.auth.getSession()).data.session,
    entrar: async (email, senha) => ok(await sb.auth.signInWithPassword({ email, password: senha })),
    sair: async () => sb.auth.signOut(),
    trocarSenha: async (senha) => ok(await sb.auth.updateUser({ password: senha })),
    souAdmin: async () => { const s = (await sb.auth.getSession()).data.session; if (!s) return false; return ok(await sb.from('admins').select('user_id').eq('user_id', s.user.id)).length > 0; },
    // admin
    produtos: async () => ok(await sb.from('produtos').select('*').order('nome')),
    salvarProduto: async (p) => { const { id, ...d } = p; return id ? ok(await sb.from('produtos').update(d).eq('id', id).select().single()) : ok(await sb.from('produtos').insert(d).select().single()); },
    excluirProduto: async (id) => ok(await sb.from('produtos').delete().eq('id', id)),
    enviarFoto: async (file) => {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const caminho = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      ok(await sb.storage.from('produtos').upload(caminho, file, { upsert: false, contentType: file.type }));
      return sb.storage.from('produtos').getPublicUrl(caminho).data.publicUrl;
    },
    clientes: async () => ok(await sb.from('clientes').select('*').order('nome')),
    salvarCliente: async (c) => { const { id, ...d } = c; return id ? ok(await sb.from('clientes').update(d).eq('id', id).select().single()) : ok(await sb.from('clientes').insert(d).select().single()); },
    excluirCliente: async (id) => ok(await sb.from('clientes').delete().eq('id', id)),
    vendas: async () => ok(await sb.from('vendas').select('*, venda_itens(*), parcelas(*)').order('data', { ascending: false }).order('id', { ascending: false })),
    registrarVenda: async (v) => ok(await sb.rpc('registrar_venda', v)),
    excluirVenda: async (id) => ok(await sb.from('vendas').delete().eq('id', id)),
    marcarParcela: async (id, pagoEm) => ok(await sb.from('parcelas').update({ pago_em: pagoEm }).eq('id', id)),
    salvarEntrega: async (id, d) => ok(await sb.from('vendas').update(d).eq('id', id)),
    salvarParcela: async ({ id, ...d }) => ok(await sb.from('parcelas').update(d).eq('id', id)),
    pedidos: async () => ok(await sb.from('pedidos').select('*').order('criado_em', { ascending: false }).limit(50)),
    salvarConfig: async (obj) => ok(await sb.from('config').upsert(Object.entries(obj).map(([chave, valor]) => ({ chave, valor })))),
    investidores: async () => ok(await sb.from('investidores').select('*, aportes(*), repasses(*), lotes(*)').order('nome')),
    salvarInvestidor: async (x) => { const { id, ...d } = x; return id ? ok(await sb.from('investidores').update(d).eq('id', id).select().single()) : ok(await sb.from('investidores').insert(d).select().single()); },
    excluirInvestidor: async (id) => ok(await sb.from('investidores').delete().eq('id', id)),
    salvarAporte: async (x) => ok(await sb.from('aportes').insert(x)),
    excluirAporte: async (id) => ok(await sb.from('aportes').delete().eq('id', id)),
    salvarRepasse: async (x) => ok(await sb.from('repasses').insert(x)),
    excluirRepasse: async (id) => ok(await sb.from('repasses').delete().eq('id', id)),
    salvarLote: async (x) => ok(await sb.from('lotes').insert(x)),
    excluirLote: async (id) => ok(await sb.from('lotes').delete().eq('id', id)),
    salvarCategoria: async (c) => { const { id, ...d } = c; return id ? ok(await sb.from('categorias').update(d).eq('id', id)) : ok(await sb.from('categorias').insert(d)); },
    excluirCategoria: async (id) => ok(await sb.from('categorias').delete().eq('id', id)),
  };
}

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const dataBR = (iso) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';
