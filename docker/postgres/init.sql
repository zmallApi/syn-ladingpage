-- Synapsee demo schema (simulação local)
-- Nunca é importado pela plataforma — só introspecção + queries ao vivo.

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT UNIQUE,
  cidade TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
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

INSERT INTO clientes (nome, email, cidade) VALUES
  ('Ana Silva', 'ana@example.com', 'São Paulo'),
  ('Bruno Costa', 'bruno@example.com', 'Curitiba'),
  ('Carla Dias', 'carla@example.com', 'Belo Horizonte'),
  ('Diego Alves', 'diego@example.com', 'Recife'),
  ('Elena Rocha', 'elena@example.com', 'Porto Alegre');

INSERT INTO produtos (sku, nome, preco, estoque) VALUES
  ('SKU-001', 'Plano Starter', 297.00, 100),
  ('SKU-002', 'Plano Pro', 797.00, 50),
  ('SKU-003', 'Consultoria IA', 2500.00, 20),
  ('SKU-004', 'MCP Pack', 149.00, 200);

INSERT INTO pedidos (cliente_id, total, status) VALUES
  (1, 446.00, 'pago'),
  (1, 297.00, 'aberto'),
  (2, 797.00, 'pago'),
  (3, 2649.00, 'pago'),
  (4, 149.00, 'cancelado');

INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario) VALUES
  (1, 1, 1, 297.00),
  (1, 4, 1, 149.00),
  (2, 1, 1, 297.00),
  (3, 2, 1, 797.00),
  (4, 2, 1, 797.00),
  (4, 3, 1, 2500.00),
  (5, 4, 1, 149.00);
