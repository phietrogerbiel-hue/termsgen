import * as v from './validations.js'
// Tema, botão Sair e menu lateral vêm de topo.js, igual às outras páginas.
import { irParaLogin } from './topo.js'

// Formulário da cautela de equipamento: um termo menor, só com entrega e
// devolução. Segue o mesmo desenho do formulário de termos (script.js).

const form = document.getElementById('form-cautela')
const mensagemGeral = document.getElementById('mensagem-geral')

const el = (id) => document.getElementById(id)

// assinatura eletrônica: o modal só abre se o servidor tiver o Clicksign configurado
let clicksignDisponivel = false
fetch('/api/config')
  .then(resp => {
    if (resp.status === 401) irParaLogin()
    return resp.json()
  })
  .then(({ versao, clicksign, clicksignAmbiente }) => {
    if (versao) el('rodape-versao').textContent = `Gerador de Termos v${versao}`
    clicksignDisponivel = clicksign
    if (clicksignAmbiente === 'sandbox') el('clicksign-ambiente').textContent = 'ambiente de testes'
  })
  .catch(() => { /* sem config: segue só com o PDF */ })

// ---------- hardwares ----------
// Cada produto é uma linha criada a partir do <template id="modelo-hardware">.
// Os ids levam o número da linha (produto-1, serial-1...), que nunca se repete,
// nem depois de remover uma linha: assim cada erro continua no campo certo.

const listaHardware = el('hardware-lista')
const modeloHardware = el('modelo-hardware')
const botaoAdicionar = el('hardware-adicionar')
let proximaLinha = 1

const linhasHardware = () => [...listaHardware.querySelectorAll('.hardware')].map(linha => linha.dataset.linha)

// O título segue a ordem na tela, e o Remover só aparece com mais de uma linha:
// pelo menos um produto é obrigatório. No limite, o botão de adicionar some.
function renumerarHardware() {
  const linhas = listaHardware.querySelectorAll('.hardware')
  linhas.forEach((linha, i) => {
    linha.querySelector('.hardware-titulo').textContent = `Item ${i + 1}`
    linha.querySelector('.hardware-remover').hidden = linhas.length === 1
  })
  botaoAdicionar.classList.toggle('hidden', linhas.length >= v.LIMITE_HARDWARES)
}

function adicionarHardware() {
  const n = proximaLinha++
  const linha = modeloHardware.content.firstElementChild.cloneNode(true)
  linha.dataset.linha = n

  linha.querySelectorAll('[data-campo]').forEach(campo => {
    const id = `${campo.dataset.campo}-${n}`
    const input = campo.querySelector('input')
    input.id = id
    input.name = id
    campo.querySelector('label').htmlFor = id
    campo.querySelector('.erro').dataset.erro = id
  })

  linha.querySelector('.hardware-remover').addEventListener('click', () => {
    linha.remove()
    renumerarHardware()
    atualizarProgresso()
    botaoAdicionar.focus()
  })

  listaHardware.append(linha)
  renumerarHardware()
  return linha
}

botaoAdicionar.addEventListener('click', () => {
  adicionarHardware().querySelector('input').focus()
  atualizarProgresso()
})
adicionarHardware()

// ---------- validação em tempo real ----------

function mostrarErro(campo, resultado) {
  const span = document.querySelector(`[data-erro="${campo}"]`)
  const input = el(campo)
  if (resultado === true || resultado === undefined) {
    if (span) span.textContent = ''
    if (input) input.removeAttribute('aria-invalid')
    return true
  }
  if (span) span.textContent = resultado
  if (input) input.setAttribute('aria-invalid', 'true')
  return false
}

// A foto 3 é opcional: vazia passa, mas se vier precisa ser imagem.
function validarFotoOpcional(campo) {
  const arquivo = el(campo).files[0]
  return arquivo ? v.validarExtensaoImagem(arquivo.name) : true
}

const validadoresFixos = {
  tipo: () => v.validarTipoCautela(el('tipo').value),
  dia: () => v.validarDia(el('dia').value),
  mes: () => v.validarMes(el('mes').value),
  name: () => v.validarName(el('name').value),
  usuario: () => v.validarUsuario(el('usuario').value),
  setor: () => v.validarSetor(el('setor').value),
  foto1: () => v.validarExtensaoImagem(el('foto1').files[0]?.name),
  foto2: () => v.validarExtensaoImagem(el('foto2').files[0]?.name),
  foto3: () => validarFotoOpcional('foto3'),
  descricao: () => v.validarDescricao(el('descricao').value),
}

function validadoresDaLinha(n) {
  const valor = (campo) => el(`${campo}-${n}`).value
  return {
    [`produto-${n}`]: () => v.validarProduto(valor('produto')),
    [`configuracao-${n}`]: () => v.validarConfiguracao(valor('configuracao')),
    [`serial-${n}`]: () => v.validarSerialOpcional(valor('serial')),
    [`hostname-${n}`]: () => v.validarHostname(valor('hostname')),
    [`etiqueta-${n}`]: () => v.validarEtiquetaOpcional(valor('etiqueta')),
  }
}

// As linhas de hardware mudam, então a lista completa é montada na hora.
function validadores() {
  return Object.assign({ ...validadoresFixos }, ...linhasHardware().map(validadoresDaLinha))
}

function validarCampo(campo) {
  const validar = validadores()[campo]
  if (validar) mostrarErro(campo, validar())
}

// Texto valida ao sair do campo; select e foto, ao mudar. Os eventos ficam no
// <form> para valerem também nas linhas de hardware criadas depois ('focusout'
// é o blur que sobe até o form).
form.addEventListener('focusout', (e) => {
  if (e.target.matches('input:not([type="file"]), textarea')) validarCampo(e.target.id)
})

// contador da descrição: o limite vem do maxlength do HTML
const descricao = el('descricao')
const contadorDescricao = el('descricao-contador')
function atualizarContador() {
  contadorDescricao.textContent = `${descricao.value.length}/${descricao.maxLength}`
}
descricao.addEventListener('input', atualizarContador)
form.addEventListener('change', (e) => {
  if (e.target.matches('select, input[type="file"]')) validarCampo(e.target.id)
})

//  preview do cartão de upload de foto

// Mostra no cartão a foto escolhida, ou o volta ao estado vazio. Também é
// chamada depois do envio, quando o formulário é limpo.
function atualizarCartao(drop) {
  const input = drop.querySelector('input[type="file"]')
  const preview = drop.querySelector('.file-drop-preview')
  const filename = drop.querySelector('.file-drop-filename')
  const remover = document.querySelector(`[data-remover="${input.id}"]`)
  const arquivo = input.files[0]
  if (remover) remover.hidden = !arquivo

  if (!arquivo) {
    drop.classList.remove('tem-arquivo')
    preview.hidden = true
    preview.removeAttribute('src')
    filename.textContent = ''
    return
  }

  filename.textContent = arquivo.name
  drop.classList.add('tem-arquivo')

  if (arquivo.type.startsWith('image/')) {
    const url = URL.createObjectURL(arquivo)
    preview.src = url
    preview.hidden = false
    preview.onload = () => URL.revokeObjectURL(url)
  }
}

document.querySelectorAll('[data-file-drop]').forEach(drop => {
  drop.querySelector('input[type="file"]').addEventListener('change', () => atualizarCartao(drop))
})

// Limpar o input não dispara 'change' sozinho: o evento é disparado à mão para
// o cartão, a mensagem de erro e o progresso acompanharem.
document.querySelectorAll('[data-remover]').forEach(botao => {
  botao.addEventListener('click', () => {
    const input = el(botao.dataset.remover)
    input.value = ''
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.focus()
  })
})

// ---------- indicador de progresso das etapas ----------

// Mesma regra do formulário de termos: a etapa fica completa quando todos os
// campos dela passam pelos validadores do envio, sem mostrar erro na tela.
const camposPorEtapa = {
  1: () => ['tipo', 'dia', 'mes'],
  2: () => ['name', 'usuario', 'setor'],
  3: () => linhasHardware().flatMap(n => Object.keys(validadoresDaLinha(n))),
  4: () => ['foto1', 'foto2', 'foto3', 'descricao'],
}

const barraProgresso = el('progresso-barra')
const textoProgresso = el('progresso-texto')

function atualizarProgresso() {
  const total = Object.keys(camposPorEtapa).length
  const todos = validadores()
  let completas = 0

  for (const [etapa, campos] of Object.entries(camposPorEtapa)) {
    const completa = campos().every(campo => todos[campo]() === true)
    if (completa) completas++
    document.querySelector(`.step[data-step="${etapa}"]`).classList.toggle('completa', completa)
  }

  barraProgresso.style.width = `${(completas / total) * 100}%`
  textoProgresso.textContent = completas === total
    ? 'Tudo pronto para gerar a cautela'
    : `${completas} de ${total} etapas completas`
}

form.addEventListener('input', atualizarProgresso)
form.addEventListener('change', atualizarProgresso)
atualizarProgresso()

function validarTudoNoCliente() {
  let ok = true
  Object.entries(validadores()).forEach(([campo, validar]) => {
    if (!mostrarErro(campo, validar())) ok = false
  })
  return ok
}

// Depois de gerar: tudo vazio de novo, com uma linha de hardware só.
function limparFormulario() {
  form.reset()
  listaHardware.replaceChildren()
  adicionarHardware()
  document.querySelectorAll('[data-file-drop]').forEach(atualizarCartao)
  atualizarContador()
  atualizarProgresso()
}

// ---------- modal do Clicksign ----------
// O mesmo do formulário de termos (script.js), sem a parte da assinatura dupla.

const modal = el('modal-clicksign')
const etapaPergunta = el('modal-etapa-pergunta')
const formEmail = el('modal-etapa-email')
let resolverModal = null

function mostrarEtapaModal(etapa) {
  etapaPergunta.classList.toggle('hidden', etapa !== 'pergunta')
  formEmail.classList.toggle('hidden', etapa !== 'email')
  ;(etapa === 'email' ? el('emailAssinatura') : el('modal-quero-assinar')).focus()
}

// Resolve com { enviar: false } (só PDF), { enviar: true, email } ou null (cancelou).
function perguntarAssinatura() {
  formEmail.reset()
  mostrarErro('emailAssinatura', true)
  mostrarErro('emailAssinaturaConfirmacao', true)
  modal.showModal()
  mostrarEtapaModal('pergunta')
  return new Promise(resolve => { resolverModal = resolve })
}

function fecharModal(resultado) {
  resolverModal?.(resultado)
  resolverModal = null
  if (modal.open) modal.close()
}

el('modal-so-pdf').addEventListener('click', () => fecharModal({ enviar: false }))
el('modal-quero-assinar').addEventListener('click', () => mostrarEtapaModal('email'))
el('modal-voltar').addEventListener('click', () => mostrarEtapaModal('pergunta'))
el('modal-fechar').addEventListener('click', () => fecharModal(null))
// Esc fecha o <dialog> nativamente: conta como cancelar
modal.addEventListener('close', () => fecharModal(null))

const validarEmailAssinatura = () => v.validarEmailAssinatura(el('emailAssinatura').value)
const validarConfirmacao = () => v.validarConfirmacaoEmail(el('emailAssinaturaConfirmacao').value, el('emailAssinatura').value)
el('emailAssinatura').addEventListener('blur', () => mostrarErro('emailAssinatura', validarEmailAssinatura()))
el('emailAssinaturaConfirmacao').addEventListener('blur', () => mostrarErro('emailAssinaturaConfirmacao', validarConfirmacao()))

formEmail.addEventListener('submit', (e) => {
  e.preventDefault()
  const okEmail = mostrarErro('emailAssinatura', validarEmailAssinatura())
  const okConfirmacao = mostrarErro('emailAssinaturaConfirmacao', validarConfirmacao())
  if (!okEmail || !okConfirmacao) {
    formEmail.querySelector('[aria-invalid="true"]')?.focus()
    return
  }
  fecharModal({ enviar: true, email: el('emailAssinatura').value.trim() })
})

// ---------- envio ----------

function montarEnvio(assinatura) {
  const fd = new FormData()
  ;['tipo', 'dia', 'mes', 'name', 'usuario', 'setor', 'descricao'].forEach(campo => fd.append(campo, el(campo).value))
  const valor = (campo, n) => el(`${campo}-${n}`).value
  fd.append('hardwares', JSON.stringify(linhasHardware().map(n => ({
    produto: valor('produto', n),
    configuracao: valor('configuracao', n),
    serial: valor('serial', n),
    hostname: valor('hostname', n),
    etiqueta: valor('etiqueta', n),
  }))))
  ;['foto1', 'foto2', 'foto3'].forEach(campo => {
    const arquivo = el(campo).files[0]
    if (arquivo) fd.append(campo, arquivo)
  })
  fd.append('enviarClicksign', String(assinatura.enviar))
  if (assinatura.enviar) fd.append('emailAssinatura', assinatura.email)
  return fd
}

function mostrarMensagem(texto, classe) {
  mensagemGeral.textContent = texto
  if (classe) mensagemGeral.classList.add(classe)
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  mensagemGeral.textContent = ''
  mensagemGeral.className = 'mensagem-geral'

  if (!validarTudoNoCliente()) {
    mostrarMensagem('Revise os campos destacados antes de gerar a cautela.', 'erro-geral')
    document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }

  // Sem Clicksign configurado no servidor, o fluxo segue direto para o PDF.
  const assinatura = clicksignDisponivel ? await perguntarAssinatura() : { enviar: false }
  if (!assinatura) return

  const btnGerar = el('btn-gerar')
  const rotuloBotao = btnGerar.querySelector('.btn-label')
  btnGerar.disabled = true
  btnGerar.classList.add('carregando')
  rotuloBotao.textContent = 'Gerando…'
  mostrarMensagem(assinatura.enviar
    ? 'Gerando o PDF e enviando ao Clicksign, aguarde…'
    : 'Gerando o documento e convertendo para PDF, aguarde…')

  try {
    const resp = await fetch('/api/gerar-cautela', { method: 'POST', body: montarEnvio(assinatura) })

    if (resp.status === 400) {
      const { erros } = await resp.json()
      // O servidor numera os hardwares pela posição na lista (hardware-0-produto);
      // na tela, cada linha tem o próprio número (produto-3).
      const linhas = linhasHardware()
      Object.entries(erros).forEach(([campo, msg]) => {
        const hardware = campo.match(/^hardware-(\d+)-(\w+)$/)
        mostrarErro(hardware ? `${hardware[2]}-${linhas[hardware[1]]}` : campo, msg)
      })
      mostrarMensagem(erros.hardwares || erros.enviarClicksign || 'Revise os campos destacados antes de gerar a cautela.', 'erro-geral')
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    // Sessão expirou com o formulário preenchido: não redireciona, senão os dados
    // e as fotos se perdem. A pessoa entra em outra aba e tenta de novo.
    if (resp.status === 401) {
      mostrarMensagem('Sua sessão expirou. Entre de novo em outra aba (/login.html) e clique em gerar outra vez; o formulário continua preenchido.', 'erro-geral')
      return
    }

    // Um proxy na frente do servidor (ex: nginx) pode recusar envios grandes antes
    // de chegarem aqui.
    if (resp.status === 413) {
      mostrarMensagem('As fotos passaram do tamanho aceito pelo servidor. Tente fotos menores.', 'erro-geral')
      return
    }

    if (!resp.ok) {
      const { erro } = await resp.json().catch(() => ({}))
      mostrarMensagem(erro || 'Erro ao gerar a cautela.', 'erro-geral')
      return
    }

    // sucesso: baixa o PDF e abre em uma nova aba
    const blob = await resp.blob()
    const nomeArquivo = resp.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'cautela.pdf'
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')

    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivo
    a.click()

    const statusClicksign = resp.headers.get('X-Clicksign-Status')
    if (statusClicksign === 'erro') {
      // O PDF foi gerado e baixado; só o envio para assinatura falhou.
      mostrarMensagem('PDF baixado, mas o envio ao Clicksign falhou. Envie a cautela manualmente pelo painel do Clicksign.', 'erro-geral')
    } else if (statusClicksign === 'enviado') {
      mostrarMensagem('Cautela gerada e enviada para assinatura no Clicksign. O colaborador receberá o link por e-mail.', 'sucesso')
    } else {
      mostrarMensagem('Cautela gerada com sucesso — o PDF foi baixado e aberto em uma nova aba.', 'sucesso')
    }
    limparFormulario()

  } catch (err) {
    console.error(err)
    mostrarMensagem('Não foi possível conectar ao servidor. Tente novamente.', 'erro-geral')
  } finally {
    btnGerar.disabled = false
    btnGerar.classList.remove('carregando')
    rotuloBotao.textContent = 'Gerar cautela em PDF'
  }
})
