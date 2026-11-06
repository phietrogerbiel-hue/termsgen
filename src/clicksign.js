import fs from 'fs'

// Integração com a API v3 do Clicksign (envelopes).
// Documentação: https://developers.clicksign.com/docs/veja-como-funciona-na-pr%C3%A1tica
//
// Configuração por variáveis de ambiente (arquivo .env):
//  - CLICKSIGN_ACCESS_TOKEN: token gerado no painel do Clicksign (Configurações > API)
//  - CLICKSIGN_AMBIENTE: 'sandbox' (padrão) ou 'producao'
//  - CLICKSIGN_PRAZO_DIAS: dias até o envelope expirar (padrão 30)
//  - CLICKSIGN_PASTA_ID: ID da pasta onde os envelopes são criados (obrigatório em produção).
//    Para descobrir o ID: npm run clicksign:pastas
//  - CLICKSIGN_OBSERVADORES: e-mails que acompanham a assinatura, separados por vírgula
//    (obrigatório em produção)
//  - CLICKSIGN_OBSERVADOR_QUANDO: 'all_steps' (cada etapa, padrão) ou 'on_finished' (só ao final)
//  - CLICKSIGN_OBSERVADOR_RECEBE_DOCUMENTO: 'true' (padrão) ou 'false'
//
// O token nunca vai para o navegador nem para o log.

// Papel com que cada signatário assina o termo ("Responsável legal" no Clicksign).
// Na assinatura dupla, o segundo colaborador assina com o mesmo papel.
// Lista completa: https://developers.clicksign.com/docs/adicionar-requisito-de-qualificacao
const PAPEL_SIGNATARIO = 'legal_guardian'

// Assunto e mensagem do e-mail que os signatários recebem. Um assunto fixo e
// reconhecível ajuda a pessoa (e o filtro de e-mail) a identificar o envio.
const ASSUNTO_EMAIL = 'TERMO DE ATIVO ASSINAR'
const MENSAGEM_EMAIL = 'TERMO DE ATIVO ASSINAR'

const URLS_BASE = {
  sandbox: 'https://sandbox.clicksign.com/api/v3',
  producao: 'https://app.clicksign.com/api/v3'
}

function configuracao() {
  const token = process.env.CLICKSIGN_ACCESS_TOKEN?.trim()
  const ambiente = process.env.CLICKSIGN_AMBIENTE === 'producao' ? 'producao' : 'sandbox'
  const prazoDias = Number(process.env.CLICKSIGN_PRAZO_DIAS) || 30
  const pastaId = process.env.CLICKSIGN_PASTA_ID?.trim() || null
  const observadores = (process.env.CLICKSIGN_OBSERVADORES || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  const observadorQuando = process.env.CLICKSIGN_OBSERVADOR_QUANDO === 'on_finished' ? 'on_finished' : 'all_steps'
  const observadorRecebeDocumento = process.env.CLICKSIGN_OBSERVADOR_RECEBE_DOCUMENTO !== 'false'

  return {
    token, ambiente, urlBase: URLS_BASE[ambiente], prazoDias,
    pastaId, observadores, observadorQuando, observadorRecebeDocumento
  }
}

// Em produção todo termo precisa cair na pasta certa e ter observador. Sem isso,
// o envio é recusado antes de criar qualquer coisa no Clicksign.
function pendenciasDeProducao({ ambiente, pastaId, observadores }) {
  if (ambiente !== 'producao') return []
  const faltando = []
  if (!pastaId) faltando.push('CLICKSIGN_PASTA_ID')
  if (observadores.length === 0) faltando.push('CLICKSIGN_OBSERVADORES')
  return faltando
}

export function clicksignConfigurado() {
  return !!configuracao().token
}

export function ambienteClicksign() {
  return configuracao().ambiente
}

// Variáveis que faltam para poder enviar em produção (vazio se estiver tudo certo).
export function pendenciasClicksign() {
  return pendenciasDeProducao(configuracao())
}

// Faz uma chamada JSON:API e devolve o "data" da resposta.
async function chamar(metodo, caminho, corpo) {
  return (await requisicao(metodo, caminho, corpo)).data
}

// Devolve a resposta inteira (data, meta, links), para quem precisa da paginação.
// Em caso de erro, monta uma mensagem com os "errors" que o Clicksign devolve.
async function requisicao(metodo, caminho, corpo) {
  const { token, urlBase } = configuracao()

  const resp = await fetch(`${urlBase}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: token,
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json'
    },
    body: corpo ? JSON.stringify(corpo) : undefined
  })

  const texto = await resp.text()
  const json = texto ? JSON.parse(texto) : {}

  if (!resp.ok) {
    const detalhes = (json.errors || [])
      .map(e => e.detail || e.title)
      .filter(Boolean)
      .join('; ')
    throw new Error(`Clicksign ${metodo} ${caminho} → HTTP ${resp.status}${detalhes ? `: ${detalhes}` : ''}`)
  }

  return json
}

function requisito(documentoId, signatarioId, atributos) {
  return {
    data: {
      type: 'requirements',
      attributes: atributos,
      relationships: {
        document: { data: { type: 'documents', id: documentoId } },
        signer: { data: { type: 'signers', id: signatarioId } }
      }
    }
  }
}

/**
 * Cria um envelope no Clicksign com o PDF do termo, adiciona os signatários
 * (autenticação por token no e-mail + selfie dinâmica), ativa o envelope e
 * dispara o e-mail de assinatura.
 *
 * signatarios: [{ nome, email }]. No termo comum é só o colaborador; na
 * assinatura dupla vem também o segundo colaborador. Todos assinam ao mesmo
 * tempo, sem ordem.
 *
 * Retorna { envelopeId, ambiente }.
 */
export async function enviarParaAssinatura({ caminhoPdf, nomeArquivo, signatarios }) {
  if (!clicksignConfigurado()) {
    throw new Error('Clicksign não configurado: defina CLICKSIGN_ACCESS_TOKEN no .env.')
  }

  const config = configuracao()
  const { ambiente, prazoDias, pastaId } = config

  const faltando = pendenciasDeProducao(config)
  if (faltando.length > 0) {
    throw new Error(`Configuração de produção incompleta: defina ${faltando.join(' e ')} no .env.`)
  }

  const prazo = new Date(Date.now() + prazoDias * 24 * 60 * 60 * 1000)

  // 1. Envelope (dentro da pasta configurada, se houver)
  const envelope = await chamar('POST', '/envelopes', {
    data: {
      type: 'envelopes',
      attributes: {
        name: nomeArquivo.replace(/\.pdf$/i, ''),
        locale: 'pt-BR',
        auto_close: true,
        remind_interval: 3,
        block_after_refusal: true,
        deadline_at: prazo.toISOString(),
        default_subject: ASSUNTO_EMAIL,
        default_message: MENSAGEM_EMAIL
      },
      ...(pastaId && {
        relationships: { folder: { data: { type: 'folders', id: pastaId } } }
      })
    }
  })

  // 2. Documento (PDF em base64 com prefixo data URI)
  const base64 = fs.readFileSync(caminhoPdf).toString('base64')
  const documento = await chamar('POST', `/envelopes/${envelope.id}/documents`, {
    data: {
      type: 'documents',
      attributes: {
        filename: nomeArquivo,
        content_base64: `data:application/pdf;base64,${base64}`
      }
    }
  })

  for (const signatario of signatarios) {
    // 3. Signatário
    const signer = await chamar('POST', `/envelopes/${envelope.id}/signers`, {
      data: {
        type: 'signers',
        attributes: {
          name: signatario.nome,
          email: signatario.email,
          has_documentation: false,
          communicate_events: {
            signature_request: 'email',
            signature_reminder: 'email',
            document_signed: 'email'
          }
        }
      }
    })

    // 4. Requisitos: assinar como responsável legal + autenticar por token enviado ao
    //    e-mail + selfie dinâmica (liveness). A API aceita só a selfie, mas o token
    //    fica como segunda prova na trilha de auditoria (prova o acesso ao e-mail).
    await chamar('POST', `/envelopes/${envelope.id}/requirements`,
      requisito(documento.id, signer.id, { action: 'agree', role: PAPEL_SIGNATARIO }))
    await chamar('POST', `/envelopes/${envelope.id}/requirements`,
      requisito(documento.id, signer.id, { action: 'provide_evidence', auth: 'email' }))
    await chamar('POST', `/envelopes/${envelope.id}/requirements`,
      requisito(documento.id, signer.id, { action: 'provide_evidence', auth: 'liveness' }))
  }

  // 5. Observadores: acompanham a assinatura sem assinar
  for (const email of config.observadores) {
    await chamar('POST', `/envelopes/${envelope.id}/signature_watchers`, {
      data: {
        type: 'signature_watchers',
        attributes: {
          email,
          kind: config.observadorQuando,
          attach_documents_enabled: config.observadorRecebeDocumento
        }
      }
    })
  }

  // 6. Ativa o envelope
  await chamar('PATCH', `/envelopes/${envelope.id}`, {
    data: { id: envelope.id, type: 'envelopes', attributes: { status: 'running' } }
  })

  // 7. Dispara o e-mail de solicitação de assinatura
  await chamar('POST', `/envelopes/${envelope.id}/notifications`, {
    data: { type: 'notifications', attributes: {} }
  })

  return {
    envelopeId: envelope.id,
    ambiente,
    documento: envelope.attributes.name,
    criadoEm: envelope.attributes.created,
    prazoEm: envelope.attributes.deadline_at
  }
}

export function pastaConfigurada() {
  return configuracao().pastaId
}

// Situação atual de um envelope: { status, prazoEm, movimentadoEm }.
export async function consultarEnvelope(envelopeId) {
  const envelope = await chamar('GET', `/envelopes/${envelopeId}`)
  return {
    status: envelope.attributes.status,
    prazoEm: envelope.attributes.deadline_at,
    movimentadoEm: envelope.attributes.modified
  }
}

// ID da pasta do envelope, ou null se estiver na raiz. A rota não aparece na
// documentação, mas é o link "related" que a própria API devolve em
// relationships.folder (a listagem não tem filtro por pasta).
export async function pastaDoEnvelope(envelopeId) {
  const pasta = await chamar('GET', `/envelopes/${envelopeId}/folder`)
  return pasta?.id ?? null
}

export async function signatariosDoEnvelope(envelopeId) {
  const signatarios = await chamar('GET', `/envelopes/${envelopeId}/signers`)
  return signatarios.map(s => ({ nome: s.attributes.name, email: s.attributes.email }))
}

/**
 * Percorre todos os envelopes da conta, página por página (50 é o máximo da API).
 * desde: data AAAA-MM-DD opcional para pular os mais antigos.
 * Chama aoReceberPagina(envelopes, { pagina, total }) a cada página.
 */
export async function percorrerEnvelopes({ desde } = {}, aoReceberPagina) {
  const tamanho = 50
  // O filtro pede um intervalo; o fim fica bem à frente para incluir os de hoje.
  const filtro = desde ? `&filter[created]=${desde},2100-01-01` : ''
  for (let pagina = 1; ; pagina++) {
    const { data, meta } = await requisicao('GET', `/envelopes?page[number]=${pagina}&page[size]=${tamanho}${filtro}`)
    await aoReceberPagina(data, { pagina, total: meta?.record_count ?? 0 })
    if (data.length < tamanho) return
  }
}

/**
 * Lista todas as pastas da conta (todas as páginas), para descobrir o
 * CLICKSIGN_PASTA_ID. Retorna [{ id, nome, caminho }].
 */
export async function listarPastas() {
  const tamanho = 50
  const pastas = []
  for (let pagina = 1; ; pagina++) {
    const lote = await chamar('GET', `/folders?page[number]=${pagina}&page[size]=${tamanho}`)
    for (const p of lote) {
      pastas.push({ id: p.id, nome: p.attributes.name, caminho: p.attributes.path || '' })
    }
    if (lote.length < tamanho) return pastas
  }
}
