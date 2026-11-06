import { irParaLogin } from './topo.js'

// Painel de termos enviados. A lista vem do banco do servidor (rápida); logo
// depois, a tela pede para o servidor conferir no Clicksign os que ainda estão
// em andamento. O servidor só consulta de fato se já passou o intervalo mínimo.

const el = (id) => document.getElementById(id)
const POR_PAGINA = 25

const ROTULOS = {
  aguardando: 'Aguardando',
  vencido: 'Prazo vencido',
  assinado: 'Assinado',
  cancelado: 'Cancelado',
  rascunho: 'Rascunho'
}

// Datas no fuso do computador de quem abre, para baterem com o relógio dele
// (quem abre o painel pode estar em outro fuso que o servidor).
const formatoData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const formatoHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const data = (iso) => (iso ? formatoData.format(new Date(iso)) : '—')

// Filtros ficam na URL: recarregar a página ou mandar o link mantém a busca.
const parametros = new URLSearchParams(window.location.search)
const estado = {
  busca: parametros.get('busca') || '',
  situacao: parametros.get('situacao') || '',
  pagina: Math.max(1, Number(parametros.get('pagina')) || 1)
}

function gravarNaUrl() {
  const p = new URLSearchParams()
  if (estado.busca) p.set('busca', estado.busca)
  if (estado.situacao) p.set('situacao', estado.situacao)
  if (estado.pagina > 1) p.set('pagina', estado.pagina)
  const consulta = p.toString()
  history.replaceState(null, '', consulta ? `?${consulta}` : window.location.pathname)
}

// Resposta 401 em qualquer chamada: a sessão acabou.
async function pedir(url, opcoes) {
  const resp = await fetch(url, opcoes)
  if (resp.status === 401) {
    irParaLogin()
    throw new Error('sessão expirada')
  }
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(json.erro || 'Erro no servidor.')
  return json
}

// ---------- lista ----------

let ultimoPedido = 0

async function carregar() {
  gravarNaUrl()
  const pedido = ++ultimoPedido
  const p = new URLSearchParams({ busca: estado.busca, situacao: estado.situacao, pagina: estado.pagina })

  try {
    const resposta = await pedir(`/api/termos?${p}`)
    // Se a pessoa digitou de novo enquanto esperava, só a resposta mais nova vale.
    if (pedido !== ultimoPedido) return
    desenhar(resposta)
  } catch (err) {
    if (pedido !== ultimoPedido) return
    el('painel-linhas').replaceChildren()
    mostrarVazio(err.message === 'sessão expirada' ? '' : 'Não foi possível carregar os termos. Tente de novo.')
  }
}

function desenhar({ termos, total, contagem, ambiente, ultimaAtualizacao }) {
  el('painel-ambiente').hidden = ambiente !== 'sandbox'
  mostrarConferido(ultimaAtualizacao)

  const soma = Object.values(contagem).reduce((a, b) => a + b, 0)
  document.querySelector('[data-contagem="todos"]').textContent = soma
  for (const [situacao, quantidade] of Object.entries(contagem)) {
    const alvo = document.querySelector(`[data-contagem="${situacao}"]`)
    if (alvo) alvo.textContent = quantidade
  }
  for (const cartao of document.querySelectorAll('.resumo-cartao')) {
    cartao.setAttribute('aria-pressed', String(cartao.dataset.situacao === estado.situacao))
  }

  el('painel-linhas').replaceChildren(...termos.map(linhaDoTermo))

  if (termos.length === 0) {
    mostrarVazio(estado.busca || estado.situacao
      ? 'Nenhum termo encontrado com esses filtros.'
      : 'Nenhum termo enviado para assinatura ainda.')
  } else {
    el('painel-vazio').hidden = true
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  el('painel-paginas').hidden = total <= POR_PAGINA
  const inicio = (estado.pagina - 1) * POR_PAGINA + 1
  el('painel-intervalo').textContent = total
    ? `${inicio}–${Math.min(estado.pagina * POR_PAGINA, total)} de ${total}`
    : ''
  el('painel-anterior').disabled = estado.pagina <= 1
  el('painel-proxima').disabled = estado.pagina >= paginas
}

function mostrarVazio(texto) {
  el('painel-vazio').textContent = texto
  el('painel-vazio').hidden = !texto
}

// Montado com textContent, nunca innerHTML: nome e e-mail vêm de fora.
function celula(rotulo, ...conteudo) {
  const td = document.createElement('td')
  td.dataset.rotulo = rotulo
  td.append(...conteudo)
  return td
}

function texto(classe, valor) {
  const span = document.createElement('span')
  span.className = classe
  span.textContent = valor
  return span
}

function linhaDoTermo(t) {
  const tr = document.createElement('tr')
  const termo = [t.tipo || 'Termo', t.empresa].filter(Boolean).join(' · ')
  const selo = texto(`selo selo-${t.situacao}`, ROTULOS[t.situacao] || t.situacao)

  // O Clicksign não guarda a empresa: só os enviados pelo termsgen a conhecem.
  const celulaTermo = t.origem === 'importado' && !t.empresa
    ? celula('Termo', texto('termo-nome', termo), texto('termo-email', 'Importado, sem empresa'))
    : celula('Termo', termo)

  tr.append(
    celula('Colaborador', texto('termo-nome', t.nome), texto('termo-email', t.email || '')),
    celulaTermo,
    celula('Enviado em', data(t.criado_em)),
    celula('Prazo', data(t.prazo_em)),
    celula('Situação', selo)
  )
  return tr
}

// ---------- atualização com o Clicksign ----------

function mostrarConferido(iso) {
  if (!iso) {
    el('painel-conferido').textContent = 'Ainda não conferido no Clicksign'
    return
  }
  const quando = new Date(iso)
  const hoje = formatoData.format(new Date()) === formatoData.format(quando)
  el('painel-conferido').textContent = hoje
    ? `Conferido no Clicksign às ${formatoHora.format(quando)}`
    : `Conferido no Clicksign em ${formatoData.format(quando)} às ${formatoHora.format(quando)}`
}

async function atualizar(manual) {
  const botao = el('painel-atualizar')
  botao.disabled = true
  botao.textContent = 'Conferindo…'
  try {
    const r = await pedir('/api/termos/atualizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manual })
    })
    if (r.atualizado) await carregar()
    else if (manual) el('painel-conferido').textContent = 'Conferido há menos de 1 minuto'
    if (r.falhas > 0) el('painel-conferido').textContent = `${r.falhas} termo(s) não puderam ser conferidos agora`
  } catch (err) {
    if (err.message !== 'sessão expirada') el('painel-conferido').textContent = 'Não foi possível consultar o Clicksign agora'
  } finally {
    botao.disabled = false
    botao.textContent = 'Atualizar agora'
  }
}

// ---------- filtros ----------

el('painel-busca').value = estado.busca

let esperaDigitacao
el('painel-busca').addEventListener('input', (evento) => {
  clearTimeout(esperaDigitacao)
  esperaDigitacao = setTimeout(() => {
    estado.busca = evento.target.value.trim()
    estado.pagina = 1
    carregar()
  }, 300)
})

el('painel-resumo').addEventListener('click', (evento) => {
  const cartao = evento.target.closest('.resumo-cartao')
  if (!cartao) return
  estado.situacao = cartao.dataset.situacao
  estado.pagina = 1
  carregar()
})

el('painel-anterior').addEventListener('click', () => { estado.pagina--; carregar() })
el('painel-proxima').addEventListener('click', () => { estado.pagina++; carregar() })
el('painel-atualizar').addEventListener('click', () => atualizar(true))

await carregar()
atualizar(false)
