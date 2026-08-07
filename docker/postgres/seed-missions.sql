-- Aplica/atualiza schema + seeds de missão em volume já existente.
-- Uso: npm run db:seed  (ou docker exec -i synapsee-pg psql -U synapsee -d erpclient < este arquivo)

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS classif TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tendencia TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS dias_atraso INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS score NUMERIC(8, 2);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cidade TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS pedidos_compra (
  id SERIAL PRIMARY KEY,
  fornecedor TEXT NOT NULL,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aberto',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itens_pedido_compra (
  id SERIAL PRIMARY KEY,
  pedido_compra_id INTEGER NOT NULL REFERENCES pedidos_compra(id),
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  quantidade INTEGER NOT NULL DEFAULT 1,
  preco_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recebimentos (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  forma_pagamento TEXT NOT NULL DEFAULT 'pix',
  status TEXT NOT NULL DEFAULT 'confirmado',
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observacao TEXT
);

CREATE TABLE IF NOT EXISTS financeiro (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  pedido_id INTEGER REFERENCES pedidos(id),
  recebimento_id INTEGER REFERENCES recebimentos(id),
  descricao TEXT NOT NULL,
  valor_cobrado NUMERIC(12, 2) NOT NULL DEFAULT 0,
  valor_pago NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',
  dias_atraso INTEGER NOT NULL DEFAULT 0,
  data_vencimento DATE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE clientes SET
  classif = v.classif,
  tendencia = v.tendencia,
  dias_atraso = v.dias_atraso,
  score = v.score
FROM (VALUES
  ('ana@example.com', 'ok', 'estavel', 0, 92::numeric),
  ('bruno@example.com', 'risco', 'piora', 18, 41::numeric),
  ('carla@example.com', 'alerta', 'piora', 7, 58::numeric),
  ('diego@example.com', 'risco', 'piora', 45, 28::numeric),
  ('elena@example.com', 'ok', 'melhora', 0, 88::numeric)
) AS v(email, classif, tendencia, dias_atraso, score)
WHERE clientes.email = v.email;

INSERT INTO clientes (nome, email, cidade, classif, tendencia, dias_atraso, score)
SELECT v.nome, v.email, v.cidade, v.classif, v.tendencia, v.dias_atraso, v.score
FROM (VALUES
  ('Ana Silva', 'ana@example.com', 'São Paulo', 'ok', 'estavel', 0, 92::numeric),
  ('Bruno Costa', 'bruno@example.com', 'Curitiba', 'risco', 'piora', 18, 41::numeric),
  ('Carla Dias', 'carla@example.com', 'Belo Horizonte', 'alerta', 'piora', 7, 58::numeric),
  ('Diego Alves', 'diego@example.com', 'Recife', 'risco', 'piora', 45, 28::numeric),
  ('Elena Rocha', 'elena@example.com', 'Porto Alegre', 'ok', 'melhora', 0, 88::numeric)
) AS v(nome, email, cidade, classif, tendencia, dias_atraso, score)
WHERE NOT EXISTS (SELECT 1 FROM clientes c WHERE c.email = v.email);

INSERT INTO produtos (sku, nome, preco, estoque) VALUES
  ('SKU-001', 'Plano Starter', 297.00, 100),
  ('SKU-002', 'Plano Pro', 797.00, 50),
  ('SKU-003', 'Consultoria IA', 2500.00, 20),
  ('SKU-004', 'MCP Pack', 149.00, 200)
ON CONFLICT (sku) DO NOTHING;

TRUNCATE TABLE financeiro RESTART IDENTITY CASCADE;
TRUNCATE TABLE recebimentos RESTART IDENTITY CASCADE;
TRUNCATE TABLE itens_pedido_compra RESTART IDENTITY CASCADE;
TRUNCATE TABLE pedidos_compra RESTART IDENTITY CASCADE;

INSERT INTO pedidos_compra (fornecedor, total, status) VALUES
  ('Fornecedor Alpha Ltda', 3200.00, 'aberto'),
  ('Fornecedor Beta SA', 890.00, 'recebido'),
  ('Cloud Infra Brasil', 1500.00, 'aberto');

INSERT INTO itens_pedido_compra (pedido_compra_id, produto_id, quantidade, preco_unitario)
SELECT 1, id, 2, preco FROM produtos WHERE sku = 'SKU-003';

INSERT INTO recebimentos (cliente_id, valor, forma_pagamento, status, observacao)
SELECT c.id, v.valor, v.forma, v.status, v.obs
FROM (VALUES
  ('ana@example.com', 446.00, 'pix', 'confirmado', 'Pedido quitado'),
  ('bruno@example.com', 200.00, 'boleto', 'confirmado', 'Pagamento parcial'),
  ('elena@example.com', 797.00, 'cartao', 'confirmado', 'Renovação Pro')
) AS v(email, valor, forma, status, obs)
JOIN clientes c ON c.email = v.email;

INSERT INTO financeiro (
  cliente_id, descricao, valor_cobrado, valor_pago, status, dias_atraso, data_vencimento
)
SELECT c.id, v.descricao, v.valor_cobrado, v.valor_pago, v.status, v.dias_atraso, v.data_vencimento::date
FROM (VALUES
  ('bruno@example.com', 'Mensalidade Pro — fev/2026', 797.00, 200.00, 'atrasado', 18, CURRENT_DATE - 18),
  ('bruno@example.com', 'Taxa de setup', 149.00, 0.00, 'atrasado', 32, CURRENT_DATE - 32),
  ('carla@example.com', 'Consultoria IA — parcela 1', 1250.00, 0.00, 'pendente', 7, CURRENT_DATE - 7),
  ('diego@example.com', 'Plano Starter — jan/2026', 297.00, 0.00, 'inadimplente', 45, CURRENT_DATE - 45),
  ('diego@example.com', 'Multa contratual', 89.90, 0.00, 'vencido', 20, CURRENT_DATE - 20),
  ('ana@example.com', 'Plano Starter — mar/2026', 297.00, 297.00, 'pago', 0, CURRENT_DATE + 5),
  ('elena@example.com', 'Plano Pro — mar/2026', 797.00, 797.00, 'pago', 0, CURRENT_DATE + 10),
  ('carla@example.com', 'Consultoria IA — parcela 2', 1250.00, 0.00, 'aberto', 0, CURRENT_DATE + 15)
) AS v(email, descricao, valor_cobrado, valor_pago, status, dias_atraso, data_vencimento)
JOIN clientes c ON c.email = v.email;

SELECT 'financeiro' AS tabela, COUNT(*) AS linhas FROM financeiro
UNION ALL SELECT 'recebimentos', COUNT(*) FROM recebimentos
UNION ALL SELECT 'pedidos_compra', COUNT(*) FROM pedidos_compra
UNION ALL SELECT 'clientes', COUNT(*) FROM clientes;
