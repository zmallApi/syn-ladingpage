-- Demo schema MySQL para Synapsee (erpclient)
CREATE USER IF NOT EXISTS 'synapsee'@'%' IDENTIFIED BY 'synapsee';
ALTER USER 'synapsee'@'%' IDENTIFIED BY 'synapsee';
GRANT ALL PRIVILEGES ON erpclient.* TO 'synapsee'@'%';
CREATE USER IF NOT EXISTS 'synapsee'@'localhost' IDENTIFIED BY 'synapsee';
ALTER USER 'synapsee'@'localhost' IDENTIFIED BY 'synapsee';
GRANT ALL PRIVILEGES ON erpclient.* TO 'synapsee'@'localhost';
FLUSH PRIVILEGES;

USE erpclient;

CREATE TABLE IF NOT EXISTS clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(200) NOT NULL,
  email VARCHAR(200) NULL,
  cidade VARCHAR(120) NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  classif VARCHAR(32) NULL,
  tendencia VARCHAR(32) NULL,
  dias_atraso INT NOT NULL DEFAULT 0,
  score DECIMAL(8, 2) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_clientes_email (email)
);

CREATE TABLE IF NOT EXISTS produtos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(64) NOT NULL,
  nome VARCHAR(200) NOT NULL,
  estoque INT NOT NULL DEFAULT 0,
  preco DECIMAL(12, 2) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_produtos_sku (sku)
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'aberto',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pedidos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id)
);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id INT NOT NULL,
  produto_id INT NOT NULL,
  quantidade INT NOT NULL DEFAULT 1,
  preco_unitario DECIMAL(12, 2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_itens_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos (id),
  CONSTRAINT fk_itens_produto FOREIGN KEY (produto_id) REFERENCES produtos (id)
);

CREATE TABLE IF NOT EXISTS pedidos_compra (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fornecedor VARCHAR(200) NOT NULL,
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'aberto',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS itens_pedido_compra (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pedido_compra_id INT NOT NULL,
  produto_id INT NOT NULL,
  quantidade INT NOT NULL DEFAULT 1,
  preco_unitario DECIMAL(12, 2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_ipc_pc FOREIGN KEY (pedido_compra_id) REFERENCES pedidos_compra (id),
  CONSTRAINT fk_ipc_prod FOREIGN KEY (produto_id) REFERENCES produtos (id)
);

CREATE TABLE IF NOT EXISTS recebimentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  valor DECIMAL(12, 2) NOT NULL DEFAULT 0,
  forma_pagamento VARCHAR(32) NOT NULL DEFAULT 'pix',
  status VARCHAR(32) NOT NULL DEFAULT 'confirmado',
  recebido_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observacao VARCHAR(255) NULL,
  CONSTRAINT fk_rec_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id)
);

CREATE TABLE IF NOT EXISTS financeiro (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  pedido_id INT NULL,
  recebimento_id INT NULL,
  descricao VARCHAR(255) NOT NULL,
  valor_cobrado DECIMAL(12, 2) NOT NULL DEFAULT 0,
  valor_pago DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'pendente',
  dias_atraso INT NOT NULL DEFAULT 0,
  data_vencimento DATE NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fin_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id)
);

INSERT INTO clientes (nome, email, cidade, classif, tendencia, dias_atraso, score)
SELECT * FROM (
  SELECT 'Ana Silva' AS nome, 'ana@example.com' AS email, 'São Paulo' AS cidade,
    'ok' AS classif, 'estavel' AS tendencia, 0 AS dias_atraso, 92.00 AS score
  UNION ALL SELECT 'Bruno Costa', 'bruno@example.com', 'Curitiba', 'risco', 'piora', 18, 41.00
  UNION ALL SELECT 'Carla Dias', 'carla@example.com', 'Belo Horizonte', 'alerta', 'piora', 7, 58.00
  UNION ALL SELECT 'Diego Alves', 'diego@example.com', 'Recife', 'risco', 'piora', 45, 28.00
  UNION ALL SELECT 'Elena Rocha', 'elena@example.com', 'Porto Alegre', 'ok', 'melhora', 0, 88.00
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM clientes LIMIT 1);

INSERT INTO produtos (sku, nome, estoque, preco)
SELECT * FROM (
  SELECT 'SKU-001' AS sku, 'Plano Starter' AS nome, 100 AS estoque, 297.00 AS preco
  UNION ALL SELECT 'SKU-002', 'Plano Pro', 50, 797.00
  UNION ALL SELECT 'SKU-003', 'Consultoria IA', 20, 2500.00
  UNION ALL SELECT 'SKU-004', 'MCP Pack', 200, 149.00
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM produtos LIMIT 1);

INSERT INTO pedidos (cliente_id, total, status)
SELECT 1, 446.00, 'pago' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM pedidos LIMIT 1);

INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
SELECT 1, 1, 1, 297.00 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM itens_pedido LIMIT 1);

INSERT INTO pedidos_compra (fornecedor, total, status)
SELECT * FROM (
  SELECT 'Fornecedor Alpha Ltda' AS fornecedor, 3200.00 AS total, 'aberto' AS status
  UNION ALL SELECT 'Fornecedor Beta SA', 890.00, 'recebido'
  UNION ALL SELECT 'Cloud Infra Brasil', 1500.00, 'aberto'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM pedidos_compra LIMIT 1);

INSERT INTO recebimentos (cliente_id, valor, forma_pagamento, status, observacao)
SELECT c.id, v.valor, v.forma, v.status, v.obs
FROM (
  SELECT 'ana@example.com' AS email, 446.00 AS valor, 'pix' AS forma, 'confirmado' AS status, 'Pedido quitado' AS obs
  UNION ALL SELECT 'bruno@example.com', 200.00, 'boleto', 'confirmado', 'Pagamento parcial'
  UNION ALL SELECT 'elena@example.com', 797.00, 'cartao', 'confirmado', 'Renovação Pro'
) AS v
JOIN clientes c ON c.email = v.email
WHERE NOT EXISTS (SELECT 1 FROM recebimentos LIMIT 1);

INSERT INTO financeiro (
  cliente_id, descricao, valor_cobrado, valor_pago, status, dias_atraso, data_vencimento
)
SELECT c.id, v.descricao, v.valor_cobrado, v.valor_pago, v.status, v.dias_atraso, v.data_vencimento
FROM (
  SELECT 'bruno@example.com' AS email, 'Mensalidade Pro — fev/2026' AS descricao,
    797.00 AS valor_cobrado, 200.00 AS valor_pago, 'atrasado' AS status, 18 AS dias_atraso,
    DATE_SUB(CURDATE(), INTERVAL 18 DAY) AS data_vencimento
  UNION ALL SELECT 'bruno@example.com', 'Taxa de setup', 149.00, 0.00, 'atrasado', 32, DATE_SUB(CURDATE(), INTERVAL 32 DAY)
  UNION ALL SELECT 'carla@example.com', 'Consultoria IA — parcela 1', 1250.00, 0.00, 'pendente', 7, DATE_SUB(CURDATE(), INTERVAL 7 DAY)
  UNION ALL SELECT 'diego@example.com', 'Plano Starter — jan/2026', 297.00, 0.00, 'inadimplente', 45, DATE_SUB(CURDATE(), INTERVAL 45 DAY)
  UNION ALL SELECT 'diego@example.com', 'Multa contratual', 89.90, 0.00, 'vencido', 20, DATE_SUB(CURDATE(), INTERVAL 20 DAY)
  UNION ALL SELECT 'ana@example.com', 'Plano Starter — mar/2026', 297.00, 297.00, 'pago', 0, DATE_ADD(CURDATE(), INTERVAL 5 DAY)
  UNION ALL SELECT 'elena@example.com', 'Plano Pro — mar/2026', 797.00, 797.00, 'pago', 0, DATE_ADD(CURDATE(), INTERVAL 10 DAY)
  UNION ALL SELECT 'carla@example.com', 'Consultoria IA — parcela 2', 1250.00, 0.00, 'aberto', 0, DATE_ADD(CURDATE(), INTERVAL 15 DAY)
) AS v
JOIN clientes c ON c.email = v.email
WHERE NOT EXISTS (SELECT 1 FROM financeiro LIMIT 1);
