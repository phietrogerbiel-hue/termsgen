import * as v from './validations.js'
// Tema claro/escuro, botão Sair e menu lateral (com as novidades) ficam em
// topo.js e menu.js, compartilhados com o painel.
import { irParaLogin } from './topo.js'

const form = document.getElementById('form-termo')
const btnGerar = document.getElementById('btn-gerar')
const mensagemGeral = document.getElementById('mensagem-geral')

const el = (id) => document.getElementById(id)

// ---------- assinatura dupla ----------
// Mesmo formulário, aberto por /assinatura-dupla (rota no server.js). Ganha a
// etapa do segundo colaborador, que entra no PDF (modelos de
// templates/duplaAssinatura/) e assina o termo junto com o primeiro no Clicksign.
const assinaturaDupla = location.pathname === '/assinatura-dupla'

if (assinaturaDupla) {
  document.title = 'Assinatura Dupla — Gerador de Termos'
  document.querySelector('.topbar-title').textContent = 'Termo com Assinatura Dupla'
  document.querySelector('.page-intro p').textContent =
    'Preencha os dados do equipamento e dos dois colaboradores para gerar o PDF.'
  el('etapa-colaborador-titulo').textContent = 'Primeiro colaborador'
  el('rotulo-setor').textContent = 'Setor (dos dois colaboradores)'
  el('modal-texto-pergunta').textContent =
    'O PDF será baixado de qualquer forma. Se enviar, os dois colaboradores recebem o link por e-mail para assinar.'
  el('modal-texto-email').textContent =
    'Cada colaborador recebe o próprio link. Pode ser diferente do e-mail do termo: confira com eles antes de enviar.'
  el('modal-nota-quem').textContent = 'cada colaborador'
  el('modal-emails-segundo').classList.remove('hidden')
  el('etapa-segundo').classList.remove('hidden')
  // A etapa nova entra antes das fotos: os números seguem a ordem na tela.
  document.querySelectorAll('.step:not(.hidden) .step-num-valor').forEach((numero, i) => {
    numero.textContent = i + 1
  })
}

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

// O e-mail do termo não existe para a empresa de regra própria. O e-mail da
// assinatura é pedido à parte, no modal.
function precisaEmail() {
  return !v.temRegraPropria(el('empresa').value)
}

// campos que aparecem ou somem conforme as escolhas do formulário

function atualizarCondicionais() {
  const empresa = el('empresa').value
  const regraPropria = v.temRegraPropria(empresa)

  // setor / email não existem para a empresa de regra própria
  el('linha-setor-email').classList.toggle('hidden', regraPropria)
  el('setor').required = !regraPropria
  el('email').required = !regraPropria
  el('campo-email2').classList.toggle('hidden', regraPropria)

  // cabo USB
  const temUsb = el('CaboSincUsb').checked
  el('eU').classList.toggle('hidden', !temUsb)

  // carregador
  const temCarregador = el('carregador').checked
  el('eCr').classList.toggle('hidden', !temCarregador)

  // capa e película
  const temCapa = el('capaEPelic').checked
  el('eCp').classList.toggle('hidden', !temCapa)

  // cordão
  const temCordao = el('cordao').checked
  el('eCord').classList.toggle('hidden', !temCordao)

  // etiqueta
  const temEtiqueta = el('temEtiqueta').checked
  document.querySelector('.etiqueta-condicional').classList.toggle('hidden', !temEtiqueta)
  el('etiqueta').placeholder = regraPropria ?'Número da etiqueta (3 dígitos, ex: 123)' : 'Número da etiqueta (6 dígitos, ex: 000534)'

  // chip / número de telefone
  const temChip = el('temChip').checked
  el('eCip').classList.toggle('hidden', !temChip)
  const eCipValor = el('eCip').value
  document.querySelector('.numero-condicional').classList.toggle('hidden', !(temChip && eCipValor))
}

['empresa', 'CaboSincUsb', 'carregador', 'capaEPelic', 'cordao', 'temEtiqueta', 'temChip', 'eCip'].forEach(id => {
  el(id).addEventListener('change', atualizarCondicionais)
})
atualizarCondicionais()

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

const validadoresSimples = {
  dia: () => v.validarDia(el('dia').value),
  mes: () => v.validarMes(el('mes').value),
  modelCel: () => v.validarModelCel(el('modelCel').value),
  name: () => v.validarName(el('name').value),
  serialNumber: () => v.validarSerialNumber(el('serialNumber').value),
  imei1: () => v.validarImei(el('imei1').value),
  imei2: () => v.validarImei(el('imei2').value),
  valor: () => v.validarValor(el('valor').value),
  ...(assinaturaDupla && {
    name2: () => v.validarName(el('name2').value),
  }),
}

Object.entries(validadoresSimples).forEach(([campo, validar]) => {
  el(campo).addEventListener('blur', () => mostrarErro(campo, validar()))
})

el('setor').addEventListener('blur', () => {
  if (v.temRegraPropria(el('empresa').value)) return
  mostrarErro('setor', v.validarSetor(el('setor').value))
})
el('email').addEventListener('blur', () => {
  if (!precisaEmail()) return
  mostrarErro('email', v.validarEmail(el('email').value))
})
el('email2').addEventListener('blur', () => {
  if (!assinaturaDupla || !precisaEmail()) return
  mostrarErro('email2', v.validarEmail(el('email2').value))
})
el('etiqueta').addEventListener('blur', () => {
  if (!el('temEtiqueta').checked) return
  mostrarErro('etiqueta', v.validarEtiqueta(el('etiqueta').value, el('empresa').value))
})
el('numeroTel').addEventListener('blur', () => {
  if (!(el('temChip').checked && el('eCip').value)) return
  mostrarErro('numeroTel', v.validarNumeroTel(el('numeroTel').value))
})
;['fotoFrente', 'fotoVerso'].forEach(campo => {
  el(campo).addEventListener('change', () => {
    const arquivo = el(campo).files[0]
    mostrarErro(campo, v.validarExtensaoImagem(arquivo?.name))
  })
})

//  preview do cartão de upload de foto 

document.querySelectorAll('[data-file-drop]').forEach(drop => {
  const input = drop.querySelector('input[type="file"]')
  const preview = drop.querySelector('.file-drop-preview')
  const filename = drop.querySelector('.file-drop-filename')

  input.addEventListener('change', () => {
    const arquivo = input.files[0]

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
  })
})

// ---------- indicador de progresso das etapas ----------

// Uma etapa é considerada completa quando todos os campos obrigatórios dela passam
// pelos MESMOS validadores usados no envio. A diferença é que aqui a checagem é
// silenciosa: só calculamos o estado, sem escrever mensagem de erro na tela — o
// usuário não pode ver campo em vermelho antes de ter tido a chance de preencher.
// Os campos condicionais entram na conta apenas quando estão realmente visíveis.
const checagensPorEtapa = {
  1: () => [
    !!el('empresa').value,
    v.validarDia(el('dia').value) === true,
    v.validarMes(el('mes').value) === true,
  ],
  2: () => [
    v.validarModelCel(el('modelCel').value) === true,
    v.validarEstadoAparelho(el('eC').value) === true,
    v.validarSerialNumber(el('serialNumber').value) === true,
    v.validarValor(el('valor').value) === true,
    v.validarImei(el('imei1').value) === true,
    v.validarImei(el('imei2').value) === true,
  ],
  3: () => {
    // Nenhum acessório é obrigatório: a etapa só fica pendente se algo marcado
    // exigir um dado extra (etiqueta ou número do chip) que ainda não é válido.
    const checagens = []
    if (el('temEtiqueta').checked) {
      checagens.push(v.validarEtiqueta(el('etiqueta').value, el('empresa').value) === true)
    }
    if (el('temChip').checked && el('eCip').value) {
      checagens.push(v.validarNumeroTel(el('numeroTel').value) === true)
    }
    return checagens
  },
  4: () => {
    const checagens = [v.validarName(el('name').value) === true]
    if (!v.temRegraPropria(el('empresa').value)) {
      checagens.push(v.validarSetor(el('setor').value) === true)
    }
    if (precisaEmail()) {
      checagens.push(v.validarEmail(el('email').value) === true)
    }
    return checagens
  },
  // só existe na assinatura dupla
  ...(assinaturaDupla && {
    segundo: () => {
      const checagens = [v.validarName(el('name2').value) === true]
      if (precisaEmail()) checagens.push(v.validarEmail(el('email2').value) === true)
      return checagens
    },
  }),
  5: () => [
    v.validarExtensaoImagem(el('fotoFrente').files[0]?.name) === true,
    v.validarExtensaoImagem(el('fotoVerso').files[0]?.name) === true,
  ],
}

const barraProgresso = el('progresso-barra')
const textoProgresso = el('progresso-texto')

function atualizarProgresso() {
  const total = Object.keys(checagensPorEtapa).length
  let completas = 0

  for (const [etapa, checar] of Object.entries(checagensPorEtapa)) {
    const completa = checar().every(Boolean)
    if (completa) completas++
    document.querySelector(`.step[data-step="${etapa}"]`).classList.toggle('completa', completa)
  }

  barraProgresso.style.width = `${(completas / total) * 100}%`
  textoProgresso.textContent = completas === total
    ? 'Tudo pronto para gerar o termo'
    : `${completas} de ${total} etapas completas`
}

// 'input' pega digitação; 'change' pega selects, checkboxes e arquivos.
// Ficam no <form> para capturar qualquer campo, inclusive os que aparecem depois.
form.addEventListener('input', atualizarProgresso)
form.addEventListener('change', atualizarProgresso)
atualizarProgresso()

function validarTudoNoCliente() {
  let ok = true
  Object.entries(validadoresSimples).forEach(([campo, validar]) => {
    if (!mostrarErro(campo, validar())) ok = false
  })
  if (!el('empresa').value) { mostrarErro('empresa', 'CAMPO OBRIGATÓRIO'); ok = false }

  if (!v.temRegraPropria(el('empresa').value)) {
    if (!mostrarErro('setor', v.validarSetor(el('setor').value))) ok = false
  }
  if (precisaEmail()) {
    if (!mostrarErro('email', v.validarEmail(el('email').value))) ok = false
  }
  if (assinaturaDupla && precisaEmail()) {
    if (!mostrarErro('email2', v.validarEmail(el('email2').value))) ok = false
  }
  if (el('temEtiqueta').checked) {
    if (!mostrarErro('etiqueta', v.validarEtiqueta(el('etiqueta').value, el('empresa').value))) ok = false
  }
  if (el('temChip').checked && el('eCip').value) {
    if (!mostrarErro('numeroTel', v.validarNumeroTel(el('numeroTel').value))) ok = false
  }
  ;['fotoFrente', 'fotoVerso'].forEach(campo => {
    const arquivo = el(campo).files[0]
    if (!mostrarErro(campo, v.validarExtensaoImagem(arquivo?.name))) ok = false
  })

  return ok
}

// ---------- modal do Clicksign ----------

const modal = el('modal-clicksign')
const etapaPergunta = el('modal-etapa-pergunta')
const formEmail = el('modal-etapa-email')
let resolverModal = null

function mostrarEtapaModal(etapa) {
  etapaPergunta.classList.toggle('hidden', etapa !== 'pergunta')
  formEmail.classList.toggle('hidden', etapa !== 'email')
  ;(etapa === 'email' ? el('emailAssinatura') : el('modal-quero-assinar')).focus()
}

// Resolve com { enviar: false } (só PDF), { enviar: true, email, email2 } ou null
// (cancelou). email2 só existe na assinatura dupla.
function perguntarAssinatura() {
  formEmail.reset()
  ;['emailAssinatura', 'emailAssinaturaConfirmacao', 'emailAssinatura2', 'emailAssinatura2Confirmacao']
    .forEach(campo => mostrarErro(campo, true))
  // Na dupla, o rótulo leva o nome de cada um para os e-mails não serem trocados.
  if (assinaturaDupla) {
    el('rotulo-email-assinatura').textContent = `E-mail de ${v.filtrarName(el('name').value)}`
    el('rotulo-email-assinatura2').textContent = `E-mail de ${v.filtrarName(el('name2').value)}`
  }
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

// Cada campo do modal e o seu validador. Na assinatura dupla entram os e-mails
// do segundo colaborador, que não pode repetir o do primeiro.
const validadoresModal = {
  emailAssinatura: () => v.validarEmailAssinatura(el('emailAssinatura').value),
  emailAssinaturaConfirmacao: () => v.validarConfirmacaoEmail(el('emailAssinaturaConfirmacao').value, el('emailAssinatura').value),
  ...(assinaturaDupla && {
    emailAssinatura2: () => {
      const resultado = v.validarEmailAssinatura(el('emailAssinatura2').value)
      if (resultado !== true) return resultado
      return v.validarEmailsDiferentes(el('emailAssinatura').value, el('emailAssinatura2').value)
    },
    emailAssinatura2Confirmacao: () => v.validarConfirmacaoEmail(el('emailAssinatura2Confirmacao').value, el('emailAssinatura2').value),
  }),
}
Object.entries(validadoresModal).forEach(([campo, validar]) => {
  el(campo).addEventListener('blur', () => mostrarErro(campo, validar()))
})

formEmail.addEventListener('submit', (e) => {
  e.preventDefault()
  const resultados = Object.entries(validadoresModal).map(([campo, validar]) => mostrarErro(campo, validar()))
  if (!resultados.every(Boolean)) {
    formEmail.querySelector('[aria-invalid="true"]')?.focus()
    return
  }
  fecharModal({
    enviar: true,
    email: el('emailAssinatura').value.trim(),
    email2: assinaturaDupla ? el('emailAssinatura2').value.trim() : undefined
  })
})

// envio

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  mensagemGeral.textContent = ''
  mensagemGeral.className = 'mensagem-geral'

  if (!validarTudoNoCliente()) {
    mensagemGeral.textContent = 'Revise os campos destacados antes de gerar o termo.'
    mensagemGeral.classList.add('erro-geral')
    document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }

  // Sem Clicksign configurado no servidor, o fluxo segue direto para o PDF.
  const assinatura = clicksignDisponivel ? await perguntarAssinatura() : { enviar: false }
  if (!assinatura) return

  const fd = new FormData()
  fd.append('empresa', el('empresa').value)
  fd.append('dia', el('dia').value)
  fd.append('mes', el('mes').value)
  fd.append('modelCel', el('modelCel').value)
  fd.append('eC', el('eC').value)
  fd.append('CaboSincUsb', String(el('CaboSincUsb').checked))
  fd.append('eU', el('eU').value)
  fd.append('carregador', String(el('carregador').checked))
  fd.append('eCr', el('eCr').value)
  fd.append('capaEPelic', String(el('capaEPelic').checked))
  fd.append('eCp', el('eCp').value)
  fd.append('cordao', String(el('cordao').checked))
  fd.append('eCord', el('eCord').value)
  fd.append('name', el('name').value)
  fd.append('setor', el('setor').value)
  fd.append('email', el('email').value)
  fd.append('serialNumber', el('serialNumber').value)
  fd.append('imei1', el('imei1').value)
  fd.append('imei2', el('imei2').value)
  fd.append('valor', el('valor').value)
  fd.append('temEtiqueta', String(el('temEtiqueta').checked))
  fd.append('etiqueta', el('etiqueta').value)
  fd.append('temChip', String(el('temChip').checked))
  fd.append('eCip', el('eCip').value)
  fd.append('numeroTel', el('numeroTel').value)
  fd.append('enviarClicksign', String(assinatura.enviar))
  if (assinatura.enviar) fd.append('emailAssinatura', assinatura.email)
  fd.append('assinaturaDupla', String(assinaturaDupla))
  if (assinaturaDupla) {
    fd.append('name2', el('name2').value)
    fd.append('email2', el('email2').value)
    if (assinatura.enviar) fd.append('emailAssinatura2', assinatura.email2)
  }
  fd.append('fotoFrente', el('fotoFrente').files[0])
  fd.append('fotoVerso', el('fotoVerso').files[0])

  const rotuloBotao = btnGerar.querySelector('.btn-label')
  btnGerar.disabled = true
  btnGerar.classList.add('carregando')
  rotuloBotao.textContent = 'Gerando…'
  mensagemGeral.textContent = assinatura.enviar
    ? 'Gerando o PDF e enviando ao Clicksign, aguarde…'
    : 'Gerando o documento e convertendo para PDF, aguarde…'

  try {
    const resp = await fetch('/api/gerar-termo', { method: 'POST', body: fd })

    if (resp.status === 400) {
      const { erros } = await resp.json()
      Object.entries(erros).forEach(([campo, msg]) => mostrarErro(campo, msg))
      mensagemGeral.textContent = 'Revise os campos destacados antes de gerar o termo.'
      mensagemGeral.classList.add('erro-geral')
      return
    }

    // Sessão expirou com o formulário preenchido: não redireciona, senão os dados
    // e as fotos se perdem. A pessoa entra em outra aba e tenta de novo.
    if (resp.status === 401) {
      mensagemGeral.textContent = 'Sua sessão expirou. Entre de novo em outra aba (/login.html) e clique em gerar outra vez; o formulário continua preenchido.'
      mensagemGeral.classList.add('erro-geral')
      return
    }

    if (!resp.ok) {
      const { erro } = await resp.json().catch(() => ({ erro: 'Erro ao gerar o termo.' }))
      mensagemGeral.textContent = erro || 'Erro ao gerar o termo.'
      mensagemGeral.classList.add('erro-geral')
      return
    }

    // sucesso: baixa o PDF e abre em uma nova aba
    const blob = await resp.blob()
    const nomeArquivo = resp.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'termo.pdf'
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')

    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivo
    a.click()

    const statusClicksign = resp.headers.get('X-Clicksign-Status')
    if (statusClicksign === 'erro') {
      // O PDF foi gerado e baixado; só o envio para assinatura falhou.
      mensagemGeral.textContent = 'PDF baixado, mas o envio ao Clicksign falhou. Envie o termo manualmente pelo painel do Clicksign.'
      mensagemGeral.classList.add('erro-geral')
    } else if (statusClicksign === 'enviado') {
      mensagemGeral.textContent = assinaturaDupla
        ? 'Termo gerado e enviado para assinatura no Clicksign. Os dois colaboradores receberão o link por e-mail.'
        : 'Termo gerado e enviado para assinatura no Clicksign. O colaborador receberá o link por e-mail.'
      mensagemGeral.classList.add('sucesso')
    } else {
      mensagemGeral.textContent = 'Termo gerado com sucesso — o PDF foi baixado e aberto em uma nova aba.'
      mensagemGeral.classList.add('sucesso')
    }
    form.reset()
    atualizarCondicionais()
    atualizarProgresso()

  } catch (err) {
    console.error(err)
    mensagemGeral.textContent = 'Não foi possível conectar ao servidor. Tente novamente.'
    mensagemGeral.classList.add('erro-geral')
  } finally {
    btnGerar.disabled = false
    btnGerar.classList.remove('carregando')
    rotuloBotao.textContent = 'Gerar termo em PDF'
  }
})
