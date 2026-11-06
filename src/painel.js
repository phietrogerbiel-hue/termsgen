import * as banco from './banco.js'
import {
  clicksignConfigurado, ambienteClicksign, pastaConfigurada,
  consultarEnvelope, pastaDoEnvelope, signatariosDoEnvelope, percorrerEnvelopes
} from './clicksign.js'

// Regras do painel de termos: o que gravar quando um termo é enviado, quando
// conferir o status no Clicksign e como importar os termos antigos.
//
// O Clicksign não avisa o servidor quando alguém assina (isso seria um webhook,
// que exige o servidor acessível pela internet). Então o painel confere, mas
// com economia:
//  - só envelopes em andamento; assinados e cancelados não mudam mais;
//  - só quando alguém abre o painel, e no máximo a cada PAINEL_INTERVALO_MINUTOS
//    (padrão 10). O botão "Atualizar agora" respeita um mínimo de 1 minuto.

const INTERVALO_AUTOMATICO_MIN = Number(process.env.PAINEL_INTERVALO_MINUTOS) || 10
const INTERVALO_MANUAL_MIN = 1

// "EMPRESA_A_dev.docx" → "EMPRESA_A". A cautela ("cautela/CAUTELA.docx") não é de
// uma empresa: fica sem.
function empresaDoModelo(modelo) {
  if (modelo.startsWith('cautela/')) return null
  return modelo.replace(/(_dev|_fer)?\.docx$/, '')
}

// Pelo nome do envelope ("Nome_TERMO_DE_FÉRIAS"), que o termsgen sempre monta igual.
function tipoDoDocumento(documento) {
  const nome = banco.normalizar(documento)
  if (nome.includes('cautela de entrega')) return 'Cautela de entrega'
  if (nome.includes('cautela de devolucao')) return 'Cautela de devolução'
  if (nome.includes('termo de devolucao')) return 'Devolução'
  if (nome.includes('termo de ferias')) return 'Férias'
  if (nome.includes('termo de responsabilidade')) return 'Responsabilidade'
  return null
}

// Chamado logo depois de o termo ser enviado ao Clicksign. Na assinatura dupla,
// os dois nomes e e-mails ficam juntos, separados por vírgula, como na importação.
export function registrarEnvio({ envio, signatarios, modelo }) {
  banco.registrarTermo({
    envelopeId: envio.envelopeId,
    ambiente: envio.ambiente,
    origem: 'termsgen',
    nome: signatarios.map(s => s.nome).join(', '),
    email: signatarios.map(s => s.email).join(', '),
    empresa: empresaDoModelo(modelo),
    tipo: tipoDoDocumento(envio.documento),
    documento: envio.documento,
    status: 'running',
    prazoEm: envio.prazoEm,
    criadoEm: envio.criadoEm || new Date().toISOString(),
    movimentadoEm: envio.criadoEm
  })
}

export function listarTermos(filtros) {
  const ambiente = ambienteClicksign()
  return {
    ...banco.listarTermos({ ambiente, ...filtros }),
    ambiente,
    ultimaAtualizacao: banco.lerControle(`ultima_atualizacao_${ambiente}`)
  }
}

// Se dois pedidos chegam juntos, os dois esperam a mesma atualização.
let atualizacaoEmAndamento = null

/**
 * Confere no Clicksign os envelopes em andamento, se já passou o intervalo mínimo.
 * Retorna { atualizado, ultimaAtualizacao, falhas }.
 */
export async function atualizarPendentes({ manual = false } = {}) {
  if (!clicksignConfigurado()) return { atualizado: false, ultimaAtualizacao: null, falhas: 0 }

  const ambiente = ambienteClicksign()
  const chave = `ultima_atualizacao_${ambiente}`
  const ultima = banco.lerControle(chave)
  const intervalo = (manual ? INTERVALO_MANUAL_MIN : INTERVALO_AUTOMATICO_MIN) * 60 * 1000
  if (ultima && Date.now() - Date.parse(ultima) < intervalo) {
    return { atualizado: false, ultimaAtualizacao: ultima, falhas: 0 }
  }

  atualizacaoEmAndamento ??= (async () => {
    let falhas = 0
    for (const envelopeId of banco.envelopesPendentes(ambiente)) {
      try {
        banco.atualizarStatus(envelopeId, await consultarEnvelope(envelopeId))
      } catch (err) {
        falhas++
        console.error(`❌ Não foi possível conferir o envelope ${envelopeId}:`, err.message)
      }
    }
    const agora = new Date().toISOString()
    banco.gravarControle(chave, agora)
    return { atualizado: true, ultimaAtualizacao: agora, falhas }
  })().finally(() => { atualizacaoEmAndamento = null })

  return atualizacaoEmAndamento
}

/**
 * Importa para o banco os envelopes que já estão na pasta configurada
 * (CLICKSIGN_PASTA_ID). A API não filtra por pasta, então percorre a conta toda e
 * pergunta a pasta de cada envelope ainda não registrado. Dos envelopes de outras
 * pastas nada é gravado.
 *
 * desde: AAAA-MM-DD opcional, para olhar só os criados a partir dessa data.
 * aoProgredir({ vistos, total, importados, falhas }) é chamado a cada página.
 *
 * Um envelope com problema é pulado e contado em "falhas" (rodar de novo tenta
 * outra vez). Só para tudo se várias falhas vierem seguidas, sinal de que o
 * problema é a API, não um envelope.
 */
const MAX_FALHAS_SEGUIDAS = 5

export async function importarDaPasta({ desde } = {}, aoProgredir = () => {}) {
  const pastaId = pastaConfigurada()
  if (!pastaId) throw new Error('Defina CLICKSIGN_PASTA_ID no .env para saber qual pasta importar.')

  const ambiente = ambienteClicksign()
  const resultado = { vistos: 0, total: 0, importados: 0, jaRegistrados: 0, falhas: 0 }
  let falhasSeguidas = 0

  await percorrerEnvelopes({ desde }, async (envelopes, { total }) => {
    resultado.total = total
    for (const envelope of envelopes) {
      resultado.vistos++
      if (banco.termoExiste(envelope.id)) {
        resultado.jaRegistrados++
        continue
      }
      try {
        if (await pastaDoEnvelope(envelope.id) === pastaId) {
          await importarEnvelope(envelope, ambiente)
          resultado.importados++
        }
        falhasSeguidas = 0
      } catch (err) {
        resultado.falhas++
        console.error(`\n❌ Envelope ${envelope.id} pulado:`, err.message)
        if (++falhasSeguidas >= MAX_FALHAS_SEGUIDAS) throw err
      }
    }
    aoProgredir(resultado)
  })

  return resultado
}

async function importarEnvelope(envelope, ambiente) {
  const signatarios = await signatariosDoEnvelope(envelope.id)
  const a = envelope.attributes
  // Envelopes criados à mão podem não ter signatário nem nome (ex: rascunho).
  const nomes = signatarios.map(s => s.nome).filter(Boolean).join(', ')
  const emails = signatarios.map(s => s.email).filter(Boolean).join(', ')
  banco.registrarTermo({
    envelopeId: envelope.id,
    ambiente,
    origem: 'importado',
    nome: nomes || a.name || 'Sem signatário',
    email: emails || null,
    tipo: tipoDoDocumento(a.name),
    documento: a.name,
    status: a.status,
    prazoEm: a.deadline_at,
    criadoEm: a.created,
    movimentadoEm: a.modified
  })
}
