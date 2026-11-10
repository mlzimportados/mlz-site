# MLZ Company — site catálogo + painel

- `index.html`: catálogo público (vitrine, filtro por aroma e por marca, detalhe com pirâmide de notas, pedido por WhatsApp/Instagram).
- `admin.html`: painel restrito a administradores (vendas por cliente, parcelas, caixa, a receber, estoque, ajustes).
- `js/api.js`: acesso ao Supabase (projeto `mlz-importados`). A chave do arquivo é a chave pública (anon); vendas, clientes e custos são protegidos por RLS e só aparecem para admins logados.
- `img/produtos/`: fotos dos produtos (fotos novas enviadas pelo painel vão para o Storage do Supabase).

Site estático, sem build. Publicado pelo Netlify a partir da branch `main`.
