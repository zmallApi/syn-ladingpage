-- Synapsee demo schema (simulação local)
-- Nunca é importado pela plataforma — só introspecção + queries ao vivo.
-- Credenciais: synapsee / synapsee · DB: erpclient · host: localhost:5433

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT UNIQUE,
  cidade TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  -- sinais para Análise de risco / Fila de atenção
  classif TEXT,
  tendencia TEXT,
  dias_atraso INTEGER NOT NULL DEFAULT 0,
  score NUMERIC(8, 2),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS produtos (
  id SERIAL PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  preco NUMERIC(12, 2) NOT NULL DEFAULT 0,
  estoque INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS pedidos (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aberto',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id SERIAL PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  quantidade INTEGER NOT NULL DEFAULT 1,
  preco_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0
);

-- Pedidos de compra (lado fornecedor / compras)
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

-- Recebimentos (caixa / baixa de títulos)
CREATE TABLE IF NOT EXISTS recebimentos (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  forma_pagamento TEXT NOT NULL DEFAULT 'pix',
  status TEXT NOT NULL DEFAULT 'confirmado',
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observacao TEXT
);

-- Financeiro / ledger (títulos a receber) — usado por overdue_ledger / Cobrar Inadimplentes
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

-- Seeds (idempotente para reexecução parcial via seed-missions.sql)
INSERT INTO clientes (nome, email, cidade, classif, tendencia, dias_atraso, score) VALUES
  ('Ana Silva', 'ana@example.com', 'São Paulo', 'ok', 'estavel', 0, 92),
  ('Bruno Costa', 'bruno@example.com', 'Curitiba', 'risco', 'piora', 18, 41),
  ('Carla Dias', 'carla@example.com', 'Belo Horizonte', 'alerta', 'piora', 7, 58),
  ('Diego Alves', 'diego@example.com', 'Recife', 'risco', 'piora', 45, 28),
  ('Elena Rocha', 'elena@example.com', 'Porto Alegre', 'ok', 'melhora', 0, 88)
ON CONFLICT (email) DO UPDATE SET
  classif = EXCLUDED.classif,
  tendencia = EXCLUDED.tendencia,
  dias_atraso = EXCLUDED.dias_atraso,
  score = EXCLUDED.score;

INSERT INTO produtos (sku, nome, preco, estoque) VALUES
  ('SKU-001', 'Plano Starter', 297.00, 100),
  ('SKU-002', 'Plano Pro', 797.00, 50),
  ('SKU-003', 'Consultoria IA', 2500.00, 20),
  ('SKU-004', 'MCP Pack', 149.00, 200)
ON CONFLICT (sku) DO NOTHING;

INSERT INTO pedidos (cliente_id, total, status)
SELECT c.id, v.total, v.status
FROM (VALUES
  ('ana@example.com', 446.00, 'pago'),
  ('ana@example.com', 297.00, 'aberto'),
  ('bruno@example.com', 797.00, 'pago'),
  ('carla@example.com', 2649.00, 'pago'),
  ('diego@example.com', 149.00, 'cancelado')
) AS v(email, total, status)
JOIN clientes c ON c.email = v.email
WHERE NOT EXISTS (SELECT 1 FROM pedidos LIMIT 1);

INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
SELECT p.id, pr.id, 1, pr.preco
FROM pedidos p
JOIN produtos pr ON pr.sku = 'SKU-001'
WHERE p.id = 1 AND NOT EXISTS (SELECT 1 FROM itens_pedido LIMIT 1);

INSERT INTO pedidos_compra (fornecedor, total, status)
SELECT * FROM (VALUES
  ('Fornecedor Alpha Ltda', 3200.00, 'aberto'),
  ('Fornecedor Beta SA', 890.00, 'recebido'),
  ('Cloud Infra Brasil', 1500.00, 'aberto')
) AS v(fornecedor, total, status)
WHERE NOT EXISTS (SELECT 1 FROM pedidos_compra LIMIT 1);

INSERT INTO itens_pedido_compra (pedido_compra_id, produto_id, quantidade, preco_unitario)
SELECT pc.id, pr.id, 2, pr.preco
FROM pedidos_compra pc
CROSS JOIN produtos pr
WHERE pc.fornecedor = 'Fornecedor Alpha Ltda'
  AND pr.sku = 'SKU-003'
  AND NOT EXISTS (SELECT 1 FROM itens_pedido_compra LIMIT 1);

INSERT INTO recebimentos (cliente_id, valor, forma_pagamento, status, observacao)
SELECT c.id, v.valor, v.forma, v.status, v.obs
FROM (VALUES
  ('ana@example.com', 446.00, 'pix', 'confirmado', 'Pedido #1 quitado'),
  ('bruno@example.com', 200.00, 'boleto', 'confirmado', 'Pagamento parcial'),
  ('elena@example.com', 797.00, 'cartao', 'confirmado', 'Renovação Pro')
) AS v(email, valor, forma, status, obs)
JOIN clientes c ON c.email = v.email
WHERE NOT EXISTS (SELECT 1 FROM recebimentos LIMIT 1);

INSERT INTO financeiro (
  cliente_id, pedido_id, recebimento_id, descricao,
  valor_cobrado, valor_pago, status, dias_atraso, data_vencimento
)
SELECT c.id, NULL, NULL, v.descricao,
  v.valor_cobrado, v.valor_pago, v.status, v.dias_atraso, v.data_vencimento::date
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
JOIN clientes c ON c.email = v.email
WHERE NOT EXISTS (SELECT 1 FROM financeiro LIMIT 1);
