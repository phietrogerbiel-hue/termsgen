import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { gerarDocumentosWord } from './gerarTermo.js'
import { clicksignConfigurado, ambienteClicksign, pendenciasClicksign, enviarParaAssinatura } from './clicksign.js'
import { loginConfigurado, exigirLogin, limitarLogin, rotaLogin, rotaLogout } from './auth.js'
import { registrarEnvio, listarTermos, atualizarPendentes } from './painel.js'
import { SITUACOES } from './banco.js'
// As validações ficam em public/ porque o formulário também as usa no navegador.
import * as v from '../public/js/validations.js'

// Raiz do projeto (este arquivo fica em src/)
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = express()
// Sem o cabeçalho X-Powered-By, as respostas não anunciam que o servidor é Express.
app.disable('x-powered-by')
const PORT = process.env.PORT || 3000

// Versão exibida no rodapé: MAIOR.MENOR do package.json + quantidade de commits
// como último número (ex: 1.2.65). Calculada ao iniciar, então acompanha cada
// git pull sem precisar editar nada. Sem Git na máquina, usa a versão do package.json.
function versaoDoSistema() {
  const { version } = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'))
  const [maior, menor] = version.split('.')
  try {
    const commits = execSync('git rev-list --count HEAD', { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    return `${maior}.${menor}.${commits}`
  } catch {
    return version
  }
}
const VERSAO = versaoDoSistema()

// Pasta temporária pras fotos enviadas. O docxtemplater-image-module-free (versão free)
// precisa de um CAMINHO de arquivo com extensão pra reconhecer o formato da imagem —
// passar só o Buffer em memória faz a lib quebrar internamente ao tentar detectar o tipo.
// Por isso é gravado a foto aqui e apagamos o arquivo depois que o PDF é gerado.
const PASTA_TMP = path.join(RAIZ, 'uploads_tmp')
if (!fs.existsSync(PASTA_TMP)) fs.mkdirSync(PASTA_TMP, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PASTA_TMP),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
      cb(null, `${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`)
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB por foto
})

// O login vem antes de tudo, inclusive dos arquivos estáticos: sem sessão, nem
// o formulário é entregue.
app.use(exigirLogin)
// O limite de chamadas ao login vem antes do express.json: o excesso é recusado
// sem o corpo ser lido.
app.use('/api/login', limitarLogin)
app.use(express.json())
app.post('/api/login', rotaLogin)
app.post('/api/logout', rotaLogout)
app.use(express.static(path.join(RAIZ, 'public')))

// A assinatura dupla é o formulário de termos com um segundo colaborador: a mesma
// página, que mostra a etapa a mais quando é aberta por este endereço (script.js).
app.get('/assinatura-dupla', (req, res) => res.sendFile(path.join(RAIZ, 'public', 'index.html')))

const EMPRESAS_VALIDAS = new Set([
  'EMPRESA_A.docx', 'EMPRESA_A_dev.docx', 'EMPRESA_A_fer.docx',
  'EMPRESA_B.docx', 'EMPRESA_B_dev.docx', 'EMPRESA_B_fer.docx',
  'EMPRESA_C.docx', 'EMPRESA_C_dev.docx', 'EMPRESA_C_fer.docx',
  'EMPRESA_D.docx', 'EMPRESA_D_dev.docx', 'EMPRESA_D_fer.docx'
])

// Helper: roda uma função de validação e acumula erro se houver
function checar(erros, campo, resultado) {
  if (resultado !== true) erros[campo] = resultado
}

// O formulário consulta isto para mostrar a versão e (ou não) a opção de assinatura eletrônica.
app.get('/api/config', (req, res) => {
  res.json({
    versao: VERSAO,
    clicksign: clicksignConfigurado(),
    clicksignAmbiente: clicksignConfigurado() ? ambienteClicksign() : null
  })
})

app.post('/api/gerar-termo', upload.fields([
  { name: 'fotoFrente', maxCount: 1 },
  { name: 'fotoVerso', maxCount: 1 }
]), async (req, res) => {
  try {
    const b = req.body
    const erros = {}

    // validação e normalização no servidor: as mesmas regras do navegador
    if (!EMPRESAS_VALIDAS.has(b.empresa)) erros.empresa = 'EMPRESA/TEMPLATE INVÁLIDO'

    checar(erros, 'dia', v.validarDia(b.dia))
    checar(erros, 'mes', v.validarMes(b.mes))
    checar(erros, 'modelCel', v.validarModelCel(b.modelCel))
    checar(erros, 'eC', v.validarEstadoAparelho(b.eC))
    checar(erros, 'name', v.validarName(b.name))

    const regraPropria = v.temRegraPropria(b.empresa)
    const enviarClicksign = b.enviarClicksign === 'true'
    if (enviarClicksign && !clicksignConfigurado()) {
      erros.enviarClicksign = 'ASSINATURA ELETRÔNICA INDISPONÍVEL NESTE SERVIDOR'
    }

    if (!regraPropria) {
      checar(erros, 'setor', v.validarSetor(b.setor))
      checar(erros, 'email', v.validarEmail(b.email))
    }
    // O e-mail que recebe o link de assinatura é informado à parte e pode ser diferente do termo
    if (enviarClicksign) checar(erros, 'emailAssinatura', v.validarEmailAssinatura(b.emailAssinatura))

    // Assinatura dupla: um segundo colaborador entra no termo (modelos de
    // templates/duplaAssinatura/) e assina junto. Como no primeiro, o e-mail do
    // termo não existe para a empresa de regra própria e o de assinatura é pedido à parte.
    const assinaturaDupla = b.assinaturaDupla === 'true'
    if (assinaturaDupla) {
      checar(erros, 'name2', v.validarName(b.name2))
      if (!regraPropria) checar(erros, 'email2', v.validarEmail(b.email2))
      if (enviarClicksign) {
        checar(erros, 'emailAssinatura2', v.validarEmailAssinatura(b.emailAssinatura2))
        if (!erros.emailAssinatura2) {
          checar(erros, 'emailAssinatura2', v.validarEmailsDiferentes(b.emailAssinatura, b.emailAssinatura2))
        }
      }
    }

    checar(erros, 'serialNumber', v.validarSerialNumber(b.serialNumber))
    checar(erros, 'imei1', v.validarImei(b.imei1))
    checar(erros, 'imei2', v.validarImei(b.imei2))
    checar(erros, 'valor', v.validarValor(b.valor))

    const temEtiqueta = b.temEtiqueta === 'true'
    if (temEtiqueta) checar(erros, 'etiqueta', v.validarEtiqueta(b.etiqueta, b.empresa))

    const temChip = b.temChip === 'true'
    if (temChip && b.eCip) checar(erros, 'numeroTel', v.validarNumeroTel(b.numeroTel))

    const fotoFrente = req.files?.fotoFrente?.[0]
    const fotoVerso = req.files?.fotoVerso?.[0]
    checar(erros, 'fotoFrente', v.validarExtensaoImagem(fotoFrente?.originalname))
    checar(erros, 'fotoVerso', v.validarExtensaoImagem(fotoVerso?.originalname))

    // Como na cautela: termo recusado não deixa as fotos do colaborador no servidor.
    if (Object.keys(erros).length > 0) {
      limparTemp(fotoFrente?.path, fotoVerso?.path)
      return res.status(400).json({ erros })
    }

    // monta os dados no formato que as tags dos modelos esperam
    const CaboSincUsb = b.CaboSincUsb === 'true'
    const carregador = b.carregador === 'true'
    const capaEPelic = b.capaEPelic === 'true'
    const cordao = b.cordao === 'true'
    const chipComEstado = temChip && !!b.eCip

    const adicionalCapaEPelic = capaEPelic ? 20 : 0
    const adicionalChip = temChip ? 20 : 0

    const valorNumerico = parseFloat(v.filtrarValorParaExibicao(b.valor).replace(/[^\d,-]/g, '').replace('.', '').replace(',', '.'))
    const valorTotal = valorNumerico + adicionalCapaEPelic + adicionalChip

    const dadosFinais = {
      empresa: b.empresa,
      dia: v.filtrarDia(b.dia),
      mes: v.filtrarMes(b.mes),
      // Ano das datas dos modelos ({ano}), no fuso de FUSO_HORARIO.
      ano: anoCorrente(),
      modelCel: v.filtrarModelCel(b.modelCel),
      eC: v.letraEstado(b.eC),
      eCExtenso: v.extensoEstado(b.eC),
      name: v.filtrarName(b.name),
      setor: regraPropria ? undefined : v.filtrarSetor(b.setor),
      email: regraPropria ? undefined : v.filtrarEmail(b.email),
      name2: assinaturaDupla ? v.filtrarName(b.name2) : undefined,
      email2: assinaturaDupla && !regraPropria ? v.filtrarEmail(b.email2) : undefined,
      serialNumber: v.filtrarSerialNumber(b.serialNumber),
      imei1: v.filtrarImei(b.imei1),
      imei2: v.filtrarImei(b.imei2),
      valor: v.filtrarValorParaExibicao(b.valor),

      etiqueta: temEtiqueta ? b.etiqueta.trim() : 'SEM ETIQUETA',
      numeroTel: chipComEstado ? v.filtrarNumeroTel(b.numeroTel) : 'SEM NÚMERO',

      CaboSincUsb: CaboSincUsb ? 'X' : '',
      qtUsb: CaboSincUsb ? '01' : '00',
      eU: CaboSincUsb ? b.eU : '',

      carregador: carregador ? 'X' : '',
      qtCr: carregador ? '01' : '00',
      eCr: carregador ? b.eCr : '',

      capaEPelic: capaEPelic ? 'X' : '',
      qtCp: capaEPelic ? '01' : '00',
      eCp: capaEPelic ? b.eCp : '',

      // A linha do cordão fica dentro de {#temCordao}...{/temCordao} nos modelos:
      // sem cordão, ela some e o termo sai como antes. Não tem valor nem entra no total.
      temCordao: cordao,
      cordao: cordao ? 'X' : '',
      qtCord: cordao ? '01' : '00',
      eCord: cordao ? b.eCord : '',

      eCip: chipComEstado ? b.eCip : '',
      qtChip: temChip ? '01' : '00',

      valorECP: capaEPelic ? 'R$ 20,00' : '',
      valorChip: temChip ? 'R$ 20,00' : '',
      valorFinal: valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),

      fotoFrente: fotoFrente.path,
      fotoVerso: fotoVerso.path
    }

    // Cada termo tem o mesmo nome nas duas pastas: templates/termos/ (um
    // colaborador) e templates/duplaAssinatura/ (dois).
    const pasta = assinaturaDupla ? 'duplaAssinatura' : 'termos'
    const { caminhoPdf, pastaTemp, nomeArquivo } = await gerarDocumentosWord(dadosFinais, { modelo: `${pasta}/${b.empresa}` })

    // Uma falha no Clicksign não pode fazer o termo se perder: o PDF é baixado de
    // qualquer jeito e o resultado do envio vai nos cabeçalhos da resposta.
    if (enviarClicksign) {
      try {
        const signatarios = [{ nome: dadosFinais.name, email: v.filtrarEmail(b.emailAssinatura) }]
        if (assinaturaDupla) {
          signatarios.push({ nome: dadosFinais.name2, email: v.filtrarEmail(b.emailAssinatura2) })
        }
        const envio = await enviarParaAssinatura({ caminhoPdf, nomeArquivo, signatarios })
        res.set('X-Clicksign-Status', 'enviado')
        res.set('X-Clicksign-Envelope', envio.envelopeId)
        console.log(`✅ Termo enviado ao Clicksign (envelope ${envio.envelopeId})`)

        // O envio já aconteceu: uma falha ao gravar no painel só fica no log.
        try {
          registrarEnvio({ envio, signatarios, modelo: b.empresa })
        } catch (err) {
          console.error(`❌ Termo enviado, mas não registrado no painel (envelope ${envio.envelopeId}):`, err.message)
        }
      } catch (err) {
        // Só a mensagem técnica vai pro log: nome e e-mail do colaborador ficam fora (LGPD).
        console.error('❌ Falha ao enviar ao Clicksign:', err.message)
        res.set('X-Clicksign-Status', 'erro')
      }
    }

    res.download(caminhoPdf, nomeArquivo, (err) => {
      if (err) console.error('Erro ao enviar o PDF:', err)
      // O documento existe apenas durante o envio. Depois, ficam somente as cópias
      // baixadas pelo navegador; nenhum termo ou foto permanece no servidor.
      limparTemp(pastaTemp, fotoFrente?.path, fotoVerso?.path)
    })

  } catch (error) {
    console.error('❌ Erro ao gerar o documento:', error)
    limparTemp(req.files?.fotoFrente?.[0]?.path, req.files?.fotoVerso?.[0]?.path)
    res.status(500).json({ erro: error.message || 'Erro interno ao gerar o termo.' })
  }
})

// Cautela de equipamento: um modelo para cada tipo, em templates/cautela/.
const MODELOS_CAUTELA = {
  entrega: { modelo: 'cautela/CAUTELA.docx', tipoDocumento: 'CAUTELA_DE_ENTREGA' },
  devolucao: { modelo: 'cautela/CAUTELA_dev.docx', tipoDocumento: 'CAUTELA_DE_DEVOLUÇÃO' }
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// O formulário só pede dia e mês: o ano é o corrente no fuso de FUSO_HORARIO
// (padrão America/Sao_Paulo), e não o do relógio do servidor, que pode estar em UTC.
const FUSO_HORARIO = process.env.FUSO_HORARIO?.trim() || 'America/Sao_Paulo'

function anoCorrente() {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_HORARIO, year: 'numeric' }).format(new Date())
}

// Data no formato do modelo (22.10.2026).
function dataDaCautela(dia, mes) {
  const numeroMes = MESES.indexOf(v.filtrarMes(mes).toLowerCase()) + 1
  return `${String(v.filtrarDia(dia)).padStart(2, '0')}.${String(numeroMes).padStart(2, '0')}.${anoCorrente()}`
}

// Campos opcionais em branco saem como "S/N" (sem número), igual à cautela em papel.
function ouSemNumero(valor, filtrar) {
  return String(valor ?? '').trim() ? filtrar(valor) : 'S/N'
}

app.post('/api/gerar-cautela', upload.fields([
  { name: 'foto1', maxCount: 1 },
  { name: 'foto2', maxCount: 1 },
  { name: 'foto3', maxCount: 1 }
]), async (req, res) => {
  const fotos = ['foto1', 'foto2', 'foto3'].map(campo => req.files?.[campo]?.[0])
  try {
    const b = req.body
    const erros = {}

    checar(erros, 'tipo', v.validarTipoCautela(b.tipo))
    checar(erros, 'dia', v.validarDia(b.dia))
    checar(erros, 'mes', v.validarMes(b.mes))
    checar(erros, 'name', v.validarName(b.name))
    checar(erros, 'usuario', v.validarUsuario(b.usuario))
    checar(erros, 'setor', v.validarSetor(b.setor))
    checar(erros, 'descricao', v.validarDescricao(b.descricao))

    // Assinatura eletrônica igual à do termo: mesmo e-mail pedido à parte, no modal.
    const enviarClicksign = b.enviarClicksign === 'true'
    if (enviarClicksign && !clicksignConfigurado()) {
      erros.enviarClicksign = 'ASSINATURA ELETRÔNICA INDISPONÍVEL NESTE SERVIDOR'
    }
    if (enviarClicksign) checar(erros, 'emailAssinatura', v.validarEmailAssinatura(b.emailAssinatura))

    // Os hardwares chegam como JSON. Os erros levam a posição do item na lista
    // (hardware-0-produto...), que o formulário traduz para a linha da tela.
    let hardwares = null
    try { hardwares = JSON.parse(b.hardwares ?? '') } catch { /* fica null */ }
    if (!Array.isArray(hardwares) || hardwares.length < 1 || hardwares.length > v.LIMITE_HARDWARES) {
      erros.hardwares = `INFORME DE 1 A ${v.LIMITE_HARDWARES} PRODUTOS`
      hardwares = []
    }
    hardwares.forEach((item, i) => {
      checar(erros, `hardware-${i}-produto`, v.validarProduto(item?.produto))
      checar(erros, `hardware-${i}-configuracao`, v.validarConfiguracao(item?.configuracao))
      checar(erros, `hardware-${i}-serial`, v.validarSerialOpcional(item?.serial))
      checar(erros, `hardware-${i}-hostname`, v.validarHostname(item?.hostname))
      checar(erros, `hardware-${i}-etiqueta`, v.validarEtiquetaOpcional(item?.etiqueta))
    })

    const [foto1, foto2, foto3] = fotos
    checar(erros, 'foto1', v.validarExtensaoImagem(foto1?.originalname))
    checar(erros, 'foto2', v.validarExtensaoImagem(foto2?.originalname))
    if (foto3) checar(erros, 'foto3', v.validarExtensaoImagem(foto3.originalname))

    if (Object.keys(erros).length > 0) {
      limparTemp(...fotos.map(foto => foto?.path))
      return res.status(400).json({ erros })
    }

    const dadosFinais = {
      name: v.filtrarName(b.name),
      usuario: v.filtrarUsuario(b.usuario),
      setor: v.filtrarSetor(b.setor),
      data: dataDaCautela(b.dia, b.mes),
      hardwares: hardwares.map(item => ({
        produto: v.filtrarProduto(item.produto),
        configuracao: v.filtrarConfiguracao(item.configuracao),
        serial: ouSemNumero(item.serial, v.filtrarSerialNumber),
        hostname: ouSemNumero(item.hostname, v.filtrarHostname),
        etiqueta: ouSemNumero(item.etiqueta, (etiqueta) => String(etiqueta).trim())
      })),
      // Linhas em branco que completam as 6 da cautela em papel.
      vazios: Array.from({ length: v.LIMITE_HARDWARES - hardwares.length }, () => ({})),
      descricao: v.filtrarDescricao(b.descricao),
      foto1: foto1.path,
      foto2: foto2.path,
      foto3: foto3?.path
    }

    const { modelo } = MODELOS_CAUTELA[b.tipo]
    const { caminhoPdf, pastaTemp, nomeArquivo } = await gerarDocumentosWord(dadosFinais, MODELOS_CAUTELA[b.tipo])

    // Mesmo comportamento do termo: o PDF é baixado de qualquer jeito e o
    // resultado do envio vai nos cabeçalhos da resposta.
    if (enviarClicksign) {
      try {
        const signatarios = [{ nome: dadosFinais.name, email: v.filtrarEmail(b.emailAssinatura) }]
        const envio = await enviarParaAssinatura({ caminhoPdf, nomeArquivo, signatarios })
        res.set('X-Clicksign-Status', 'enviado')
        res.set('X-Clicksign-Envelope', envio.envelopeId)
        console.log(`✅ Cautela enviada ao Clicksign (envelope ${envio.envelopeId})`)

        try {
          registrarEnvio({ envio, signatarios, modelo })
        } catch (err) {
          console.error(`❌ Cautela enviada, mas não registrada no painel (envelope ${envio.envelopeId}):`, err.message)
        }
      } catch (err) {
        // Só a mensagem técnica vai pro log: nome e e-mail do colaborador ficam fora (LGPD).
        console.error('❌ Falha ao enviar a cautela ao Clicksign:', err.message)
        res.set('X-Clicksign-Status', 'erro')
      }
    }

    res.download(caminhoPdf, nomeArquivo, (err) => {
      if (err) console.error('Erro ao enviar o PDF da cautela:', err)
      // Como nos termos: nada da cautela fica no servidor depois do download.
      limparTemp(pastaTemp, ...fotos.map(foto => foto?.path))
    })

  } catch (error) {
    console.error('❌ Erro ao gerar a cautela:', error)
    limparTemp(...fotos.map(foto => foto?.path))
    res.status(500).json({ erro: error.message || 'Erro interno ao gerar a cautela.' })
  }
})

// Painel de termos enviados ao Clicksign. A lista vem do banco local; a
// atualização com o Clicksign é pedida à parte pela tela, para a lista abrir na hora.
app.get('/api/termos', (req, res) => {
  const pagina = Math.max(1, Number.parseInt(req.query.pagina, 10) || 1)
  const situacao = SITUACOES.includes(req.query.situacao) ? req.query.situacao : ''
  const busca = String(req.query.busca ?? '').slice(0, 100)
  try {
    res.json(listarTermos({ busca, situacao, pagina }))
  } catch (err) {
    console.error('❌ Erro ao listar os termos:', err.message)
    res.status(500).json({ erro: 'Não foi possível carregar os termos.' })
  }
})

app.post('/api/termos/atualizar', async (req, res) => {
  try {
    res.json(await atualizarPendentes({ manual: req.body?.manual === true }))
  } catch (err) {
    console.error('❌ Erro ao atualizar os termos:', err.message)
    res.status(500).json({ erro: 'Não foi possível consultar o Clicksign.' })
  }
})

function limparTemp(...caminhos) {
  for (const caminho of caminhos) {
    if (caminho && fs.existsSync(caminho)) {
      fs.rm(caminho, { recursive: true, force: true }, (err) => {
        if (err) console.error('Não foi possível apagar o temporário:', caminho, err)
      })
    }
  }
}

app.listen(PORT, () => {
  console.log(`\n===GERADOR DE TERMO DE RESPONSABILIDADE (WEB) v${VERSAO}===`)
  console.log(`✅ Servidor rodando em http://localhost:${PORT}\n`)

  if (!loginConfigurado()) {
    console.warn('⚠️  Login não configurado: ninguém consegue entrar. Defina LOGIN_USUARIO e LOGIN_SENHA_HASH no .env (npm run login:senha).\n')
  }

  if (clicksignConfigurado()) {
    console.log(`Clicksign: ambiente ${ambienteClicksign()}`)
    const faltando = pendenciasClicksign()
    if (faltando.length > 0) {
      console.warn(`⚠️  Envios ao Clicksign serão recusados: defina ${faltando.join(' e ')} no .env.\n`)
    }
  }
})
