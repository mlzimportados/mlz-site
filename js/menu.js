// Menu de três barrinhas (cabeçalho das páginas públicas)
(function () {
  const p = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/index';
  const pag = p.split('/').pop() || 'index';
  const naHome = pag === 'index' || p === '/index';
  const h = (a) => naHome ? a : 'index.html' + a;
  const links = [
    ['Início', naHome ? '#' : 'index.html', 'index', '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'],
    ['Coleção', h('#colecao'), '', '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'],
    ['Aromas', h('#aromas'), '', '<path d="M12 3c3 4 6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 3-6 6-10z"/>'],
    ['Minha sacola', h('#sacola'), '', '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>'],
    ['Minha conta', 'conta.html', 'conta', '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'],
    ['Seja revendedor(a)', 'revenda.html', 'revenda', '<path d="M3 7h18v13H3z"/><path d="M8 7V4h8v3"/><path d="M3 12h18"/>'],
    ['Pagamento, entrega e trocas', 'politicas.html', 'politicas', '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>'],
    ['Fale com a gente no WhatsApp', 'https://wa.me/5542999636541', 'wa', '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9 9.5c.3 1.8 2.6 4.2 4.6 4.6l1.1-1.1 1.8.9-.4 1.4c-3.5.3-7.5-3.7-7.2-7.2l1.4-.4.9 1.8z"/>'],
  ];
  const css = `
.mzb{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;margin-left:-8px;border:0;background:none;color:inherit;cursor:pointer;border-radius:10px;flex:none}
.mzb:hover{background:rgba(255,255,255,.06)}
.mzb span{position:relative;width:20px;height:2px;background:currentColor;border-radius:2px}
.mzb span:before,.mzb span:after{content:"";position:absolute;left:0;width:20px;height:2px;background:currentColor;border-radius:2px}
.mzb span:before{top:-6px}.mzb span:after{top:6px}
.mzm{position:fixed;inset:0;z-index:200;visibility:hidden}
.mzm.on{visibility:visible}
.mzm .bg{position:absolute;inset:0;background:rgba(3,8,16,.6);opacity:0;transition:opacity .25s}
.mzm.on .bg{opacity:1}
.mzm .pn{position:absolute;top:0;left:0;bottom:0;width:min(320px,86vw);background:#0b1d33;border-right:1px solid rgba(201,162,39,.25);padding:18px 14px 24px;transform:translateX(-102%);transition:transform .28s cubic-bezier(.2,.8,.2,1);display:flex;flex-direction:column;overflow:auto;font-family:inherit}
.mzm.on .pn{transform:none}
.mzm .tp{display:flex;align-items:center;justify-content:space-between;padding:4px 6px 18px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:10px}
.mzm .tp img{height:20px}
.mzm .x{width:38px;height:38px;border:0;background:none;color:#cfd6df;font-size:26px;line-height:1;cursor:pointer;border-radius:10px}
.mzm .x:hover{background:rgba(255,255,255,.06)}
.mzm a.it{display:flex;align-items:center;gap:14px;padding:13px 12px;border-radius:12px;color:#e8ecf1;text-decoration:none;font-size:15px}
.mzm a.it:hover{background:rgba(255,255,255,.05)}
.mzm a.it.wa{margin-top:8px;border:1px solid rgba(201,162,39,.4);color:#e6c35c}
.mzm a.it.on{background:rgba(201,162,39,.12);color:#e6c35c}
.mzm a.it svg{width:20px;height:20px;fill:none;stroke:#c9a227;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}
@media(min-width:761px){.mzb{display:none}}
.mzm .rd{margin-top:auto;padding:18px 12px 0;font-size:12px;color:#8a97a8;border-top:1px solid rgba(255,255,255,.08)}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function montar() {
    const alvo = document.querySelector('header .wrap') || document.querySelector('body > .top');
    if (!alvo || document.querySelector('.mzb')) return;
    const b = document.createElement('button');
    b.className = 'mzb'; b.type = 'button'; b.setAttribute('aria-label', 'Abrir menu'); b.innerHTML = '<span></span>';
    alvo.insertBefore(b, alvo.firstChild);
    const m = document.createElement('div');
    m.className = 'mzm'; m.setAttribute('aria-hidden', 'true');
    m.innerHTML = `<div class="bg"></div><nav class="pn" aria-label="Menu">
      <div class="tp"><a href="${naHome ? '#' : 'index.html'}"><img src="img/logo_mlz_company.png" alt="MLZ Company"></a><button class="x" type="button" aria-label="Fechar menu">×</button></div>
      ${links.map(([t, u, k, ic]) => `<a class="it${k && k === pag ? ' on' : ''}${k === 'wa' ? ' wa' : ''}" href="${u}"${k === 'wa' ? ' target="_blank" rel="noopener"' : ''}><svg viewBox="0 0 24 24">${ic}</svg>${t}</a>`).join('')}
      <div class="rd">MLZ Company · importados originais</div></nav>`;
    document.body.appendChild(m);
    const syncWa = () => { const w = document.querySelector('#hWa[href*="wa.me"], a[href*="wa.me"]:not(.mzm a)'); const it = m.querySelector('a.it.wa'); if (w && it) it.href = w.href; };
    const abrir = () => { syncWa(); m.classList.add('on'); m.setAttribute('aria-hidden', 'false'); document.documentElement.style.overflow = 'hidden'; };
    const fechar = () => { m.classList.remove('on'); m.setAttribute('aria-hidden', 'true'); document.documentElement.style.overflow = ''; };
    b.onclick = abrir;
    m.querySelector('.bg').onclick = fechar;
    m.querySelector('.x').onclick = fechar;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
    m.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
      const u = a.getAttribute('href');
      fechar();
      if (naHome && u === '#sacola') { setTimeout(() => { const bb = document.getElementById('bagBtn'); if (bb) bb.click(); }, 50); return; }
      if (naHome && u === '#') { setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 30); }
    }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
