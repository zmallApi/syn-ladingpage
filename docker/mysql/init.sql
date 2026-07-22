-- Demo schema MySQL para Synapsee (erpclient-like)
-- Conexões do host Windows chegam como 172.x.x.x — precisa de user@'%'
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
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS produtos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(64) NOT NULL,
  nome VARCHAR(200) NOT NULL,
  estoque INT NOT NULL DEFAULT 0,
  preco DECIMAL(12, 2) NOT NULL DEFAULT 0
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
  CONSTRAINT fk_itens_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos (id),
  CONSTRAINT fk_itens_produto FOREIGN KEY (produto_id) REFERENCES produtos (id)
);

INSERT INTO clientes (nome, email)
SELECT * FROM (
  SELECT 'Ana Silva' AS nome, 'ana@example.com' AS email
  UNION ALL SELECT 'Bruno Costa', 'bruno@example.com'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM clientes LIMIT 1);

INSERT INTO produtos (sku, nome, estoque, preco)
SELECT * FROM (
  SELECT 'SKU-1' AS sku, 'Camiseta' AS nome, 40 AS estoque, 79.90 AS preco
  UNION ALL SELECT 'SKU-2', 'Boné', 15, 49.90
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM produtos LIMIT 1);

INSERT INTO pedidos (cliente_id, total, status)
SELECT 1, 129.80, 'pago' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM pedidos LIMIT 1);

INSERT INTO itens_pedido (pedido_id, produto_id, quantidade)
SELECT 1, 1, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM itens_pedido LIMIT 1);
