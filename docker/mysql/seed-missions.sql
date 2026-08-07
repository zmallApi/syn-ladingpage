-- Seed/atualização MySQL para missão Cobrar Inadimplentes
USE erpclient;

SET @db := DATABASE();

-- Colunas de risco em clientes (ignora se já existirem)
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE clientes ADD COLUMN classif VARCHAR(32) NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'classif'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE clientes ADD COLUMN tendencia VARCHAR(32) NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'tendencia'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE clientes ADD COLUMN dias_atraso INT NOT NULL DEFAULT 0',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'dias_atraso'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE clientes ADD COLUMN score DECIMAL(8,2) NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'score'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE clientes ADD COLUMN cidade VARCHAR(120) NULL',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'cidade'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE clientes ADD COLUMN ativo TINYINT(1) NOT NULL DEFAULT 1',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'ativo'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

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
  preco_unitario DECIMAL(12, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recebimentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL,
  valor DECIMAL(12, 2) NOT NULL DEFAULT 0,
  forma_pagamento VARCHAR(32) NOT NULL DEFAULT 'pix',
  status VARCHAR(32) NOT NULL DEFAULT 'confirmado',
  recebido_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observacao VARCHAR(255) NULL
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
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

UPDATE clientes c
JOIN (
  SELECT 'ana@example.com' AS email, 'ok' AS classif, 'estavel' AS tendencia, 0 AS dias_atraso, 92.00 AS score
  UNION ALL SELECT 'bruno@example.com', 'risco', 'piora', 18, 41.00
  UNION ALL SELECT 'carla@example.com', 'alerta', 'piora', 7, 58.00
  UNION ALL SELECT 'diego@example.com', 'risco', 'piora', 45, 28.00
  UNION ALL SELECT 'elena@example.com', 'ok', 'melhora', 0, 88.00
) v ON c.email = v.email
SET c.classif = v.classif, c.tendencia = v.tendencia, c.dias_atraso = v.dias_atraso, c.score = v.score;

INSERT INTO clientes (nome, email, cidade, classif, tendencia, dias_atraso, score)
SELECT v.nome, v.email, v.cidade, v.classif, v.tendencia, v.dias_atraso, v.score
FROM (
  SELECT 'Ana Silva' AS nome, 'ana@example.com' AS email, 'São Paulo' AS cidade, 'ok' AS classif, 'estavel' AS tendencia, 0 AS dias_atraso, 92.00 AS score
  UNION ALL SELECT 'Bruno Costa', 'bruno@example.com', 'Curitiba', 'risco', 'piora', 18, 41.00
  UNION ALL SELECT 'Carla Dias', 'carla@example.com', 'Belo Horizonte', 'alerta', 'piora', 7, 58.00
  UNION ALL SELECT 'Diego Alves', 'diego@example.com', 'Recife', 'risco', 'piora', 45, 28.00
  UNION ALL SELECT 'Elena Rocha', 'elena@example.com', 'Porto Alegre', 'ok', 'melhora', 0, 88.00
) v
WHERE NOT EXISTS (SELECT 1 FROM clientes c WHERE c.email = v.email);

INSERT IGNORE INTO produtos (sku, nome, estoque, preco) VALUES
  ('SKU-001', 'Plano Starter', 100, 297.00),
  ('SKU-002', 'Plano Pro', 50, 797.00),
  ('SKU-003', 'Consultoria IA', 20, 2500.00),
  ('SKU-004', 'MCP Pack', 200, 149.00);

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE financeiro;
TRUNCATE TABLE recebimentos;
TRUNCATE TABLE itens_pedido_compra;
TRUNCATE TABLE pedidos_compra;
SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO pedidos_compra (fornecedor, total, status) VALUES
  ('Fornecedor Alpha Ltda', 3200.00, 'aberto'),
  ('Fornecedor Beta SA', 890.00, 'recebido'),
  ('Cloud Infra Brasil', 1500.00, 'aberto');

INSERT INTO itens_pedido_compra (pedido_compra_id, produto_id, quantidade, preco_unitario)
SELECT 1, id, 2, preco FROM produtos WHERE sku = 'SKU-003' LIMIT 1;

INSERT INTO recebimentos (cliente_id, valor, forma_pagamento, status, observacao)
SELECT c.id, v.valor, v.forma, v.status, v.obs
FROM (
  SELECT 'ana@example.com' AS email, 446.00 AS valor, 'pix' AS forma, 'confirmado' AS status, 'Pedido quitado' AS obs
  UNION ALL SELECT 'bruno@example.com', 200.00, 'boleto', 'confirmado', 'Pagamento parcial'
  UNION ALL SELECT 'elena@example.com', 797.00, 'cartao', 'confirmado', 'Renovação Pro'
) v
JOIN clientes c ON c.email = v.email;

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
) v
JOIN clientes c ON c.email = v.email;

SELECT 'financeiro' AS tabela, COUNT(*) AS linhas FROM financeiro
UNION ALL SELECT 'recebimentos', COUNT(*) FROM recebimentos
UNION ALL SELECT 'pedidos_compra', COUNT(*) FROM pedidos_compra
UNION ALL SELECT 'clientes', COUNT(*) FROM clientes;
