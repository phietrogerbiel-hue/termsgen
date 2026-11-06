import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DatabaseSync } from 'node:sqlite'

// Banco local (SQLite, embutido no Node 22.13+) com os termos enviados ao
// Clicksign. Serve ao painel: busca, filtros e status sem consultar a API a cada
// tela. Fica em dados/termsgen.db, fora do Git e fora de public/.
//
// Guarda só o necessário para o painel (nome e e-mail de assinatura do
// colaborador, tipo de termo e datas). Nada de fotos, PDF ou dados do aparelho.
//
// Configuração opcional no .env:
//  - BANCO_ARQUIVO: caminho do arquivo (padrão dados/termsgen.db)

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARQUIVO = process.env.BANCO_ARQUIVO?.trim() || path.join(RAIZ, 'dados', 'termsgen.db')

fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true })
const db = new DatabaseSync(ARQUIVO)

// WAL + espera: o servidor e o script de importação podem usar o banco ao mesmo tempo.
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS termos (
    envelope_id    TEXT PRIMARY KEY,
    ambiente       TEXT NOT NULL,          -- sandbox | producao
    origem         TEXT NOT NULL,          -- termsgen | importado
    nome           TEXT NOT NULL,          -- colaborador (signatário)
    email          TEXT,                   -- e-mail que recebeu o link
    empresa        TEXT,                   -- EMPRESA_A, EMPRESA_B... (vazio nos importados)
    tipo           TEXT,                   -- Responsabilidade, Devolução, Férias
    documento      TEXT,                   -- nome do envelope no Clicksign
    status         TEXT NOT NULL,          -- draft | running | closed | canceled (do Clicksign)
    prazo_em       TEXT,                   -- ISO 8601
    criado_em      TEXT NOT NULL,
    movimentado_em TEXT,                   -- última alteração do envelope no Clicksign
    consultado_em  TEXT,                   -- última vez que o status foi conferido
    busca          TEXT NOT NULL           -- nome, e-mail e documento sem acento, em minúsculas
  );
  CREATE INDEX IF NOT EXISTS termos_ambiente_criado ON termos (ambiente, criado_em DESC);

  CREATE TABLE IF NOT EXISTS controle (
    chave TEXT PRIMARY KEY,
    valor TEXT
  );
`)

// "João_da_Silva_TERMO_DE_FÉRIAS" e "joao da silva termo de ferias" viram o mesmo texto.
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim()
}

// Datas são comparadas como texto no SQL, então todas são gravadas em UTC
// ("...Z"). O Clicksign devolve com fuso ("-03:00"), que compararia errado.
function utc(data) {
  return data ? new Date(data).toISOString() : null
}

function textoDeBusca({ nome, email, documento }) {
  return [nome, email, documento].map(normalizar).join(' ')
}

// Insere ou, se o envelope já existir, atualiza só o que vem do Clicksign. Assim a
// importação pode rodar mais de uma vez sem duplicar nem apagar empresa/tipo.
export function registrarTermo(t) {
  db.prepare(`
    INSERT INTO termos (envelope_id, ambiente, origem, nome, email, empresa, tipo, documento,
                        status, prazo_em, criado_em, movimentado_em, consultado_em, busca)
    VALUES (:envelopeId, :ambiente, :origem, :nome, :email, :empresa, :tipo, :documento,
            :status, :prazoEm, :criadoEm, :movimentadoEm, :consultadoEm, :busca)
    ON CONFLICT (envelope_id) DO UPDATE SET
      status = excluded.status,
      prazo_em = excluded.prazo_em,
      movimentado_em = excluded.movimentado_em,
      consultado_em = excluded.consultado_em
  `).run({
    envelopeId: t.envelopeId,
    ambiente: t.ambiente,
    origem: t.origem,
    nome: t.nome,
    email: t.email ?? null,
    empresa: t.empresa ?? null,
    tipo: t.tipo ?? null,
    documento: t.documento ?? null,
    status: t.status,
    prazoEm: utc(t.prazoEm),
    criadoEm: utc(t.criadoEm),
    movimentadoEm: utc(t.movimentadoEm),
    consultadoEm: new Date().toISOString(),
    busca: textoDeBusca(t)
  })
}

export function termoExiste(envelopeId) {
  return !!db.prepare('SELECT 1 FROM termos WHERE envelope_id = ?').get(envelopeId)
}

export function atualizarStatus(envelopeId, { status, prazoEm, movimentadoEm }) {
  db.prepare(`
    UPDATE termos SET status = ?, prazo_em = ?, movimentado_em = ?, consultado_em = ?
    WHERE envelope_id = ?
  `).run(status, utc(prazoEm), utc(movimentadoEm), new Date().toISOString(), envelopeId)
}

// Envelopes que ainda podem mudar. Assinados e cancelados não mudam mais e nunca
// são consultados de novo.
export function envelopesPendentes(ambiente) {
  return db.prepare(`SELECT envelope_id FROM termos WHERE ambiente = ? AND status IN ('draft', 'running')`)
    .all(ambiente)
    .map(r => r.envelope_id)
}

// Situação mostrada no painel. "Vencido" não existe no Clicksign: é um envelope
// ainda em andamento cujo prazo já passou.
const CONDICOES_SITUACAO = {
  aguardando: `status = 'running' AND (prazo_em IS NULL OR prazo_em >= :agora)`,
  vencido: `status = 'running' AND prazo_em < :agora`,
  assinado: `status = 'closed'`,
  cancelado: `status = 'canceled'`,
  rascunho: `status = 'draft'`
}
export const SITUACOES = Object.keys(CONDICOES_SITUACAO)

// O SQLite do Node recusa parâmetro que não aparece na consulta; como os filtros
// variam, cada consulta recebe só os parâmetros que usa.
function soOsUsados(sql, parametros) {
  return Object.fromEntries(Object.entries(parametros).filter(([nome]) => sql.includes(`:${nome}`)))
}

function todas(sql, parametros) {
  return db.prepare(sql).all(soOsUsados(sql, parametros))
}

export function situacaoDe({ status, prazo_em }, agora = new Date().toISOString()) {
  if (status === 'closed') return 'assinado'
  if (status === 'canceled') return 'cancelado'
  if (status === 'draft') return 'rascunho'
  return prazo_em && prazo_em < agora ? 'vencido' : 'aguardando'
}

/**
 * Lista os termos de um ambiente, do mais recente ao mais antigo.
 * busca: trecho do nome, e-mail ou documento (sem diferença de acento/maiúscula).
 * situacao: uma de SITUACOES, ou vazio para todas.
 * Retorna { termos, total, contagem } — contagem é por situação, sem o filtro de situação.
 */
export function listarTermos({ ambiente, busca = '', situacao = '', pagina = 1, porPagina = 25 }) {
  const agora = new Date().toISOString()
  const filtros = ['ambiente = :ambiente']
  const parametros = { ambiente, agora }

  const termoBusca = normalizar(busca)
  if (termoBusca) {
    filtros.push(`busca LIKE :busca ESCAPE '\\'`)
    parametros.busca = `%${termoBusca.replace(/[\\%_]/g, '\\$&')}%`
  }

  const contagem = Object.fromEntries(SITUACOES.map(s => [s, 0]))
  for (const linha of todas(`SELECT status, prazo_em FROM termos WHERE ${filtros.join(' AND ')}`, parametros)) {
    contagem[situacaoDe(linha, agora)]++
  }

  if (CONDICOES_SITUACAO[situacao]) filtros.push(CONDICOES_SITUACAO[situacao])
  const onde = filtros.join(' AND ')

  const [{ total }] = todas(`SELECT COUNT(*) AS total FROM termos WHERE ${onde}`, parametros)
  const termos = todas(`
    SELECT envelope_id, origem, nome, email, empresa, tipo, documento, status,
           prazo_em, criado_em, movimentado_em
    FROM termos WHERE ${onde}
    ORDER BY criado_em DESC
    LIMIT :limite OFFSET :deslocamento
  `, { ...parametros, limite: porPagina, deslocamento: (pagina - 1) * porPagina })
    .map(t => ({ ...t, situacao: situacaoDe(t, agora) }))

  return { termos, total, contagem }
}

export function lerControle(chave) {
  return db.prepare('SELECT valor FROM controle WHERE chave = ?').get(chave)?.valor ?? null
}

export function gravarControle(chave, valor) {
  db.prepare(`
    INSERT INTO controle (chave, valor) VALUES (?, ?)
    ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor
  `).run(chave, valor)
}
