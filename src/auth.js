import crypto from 'crypto'

// Login com uma credencial única, definida no .env:
//  - LOGIN_USUARIO: nome de usuário (ex: ti)
//  - LOGIN_SENHA_HASH: hash da senha, gerado com `npm run login:senha`
//    (a senha em si nunca fica gravada em lugar nenhum)
//  - LOGIN_SESSAO_HORAS: horas até a sessão expirar (padrão 8)
//  - LOGIN_COOKIE_SEGURO: 'true' quando o site estiver em HTTPS
//
// Sem LOGIN_USUARIO e LOGIN_SENHA_HASH ninguém entra: o sistema não fica aberto
// por esquecimento de configuração.

const COOKIE = 'termsgen_sessao'
const MAX_FALHAS = 5
const BLOQUEIO_MINUTOS = 5

// Caminhos que respondem sem login: a própria tela de login e o que ela carrega.
const CAMINHOS_LIVRES = new Set(['/login.html', '/js/login.js', '/css/style.css', '/api/login'])

function configuracao() {
  return {
    usuario: process.env.LOGIN_USUARIO?.trim() || '',
    hashSenha: process.env.LOGIN_SENHA_HASH?.trim() || '',
    sessaoHoras: Number(process.env.LOGIN_SESSAO_HORAS) || 8,
    cookieSeguro: process.env.LOGIN_COOKIE_SEGURO === 'true'
  }
}

export function loginConfigurado() {
  const { usuario, hashSenha } = configuracao()
  return !!usuario && hashSenha.startsWith('scrypt:')
}

// ---------- senha ----------

// Formato gravado no .env: scrypt:<sal em hex>:<hash em hex>. O sal é aleatório,
// então a mesma senha gera um hash diferente a cada vez.
export function gerarHashSenha(senha) {
  const sal = crypto.randomBytes(16)
  const hash = crypto.scryptSync(senha, sal, 64)
  return `scrypt:${sal.toString('hex')}:${hash.toString('hex')}`
}

function senhaConfere(senha, hashGravado) {
  const [algoritmo, salHex, hashHex] = hashGravado.split(':')
  if (algoritmo !== 'scrypt' || !salHex || !hashHex) return false
  const esperado = Buffer.from(hashHex, 'hex')
  const calculado = crypto.scryptSync(senha, Buffer.from(salHex, 'hex'), esperado.length)
  return crypto.timingSafeEqual(calculado, esperado)
}

// Compara em tempo constante para a resposta não denunciar quantas letras batem.
function textoConfere(a, b) {
  const resumo = (t) => crypto.createHash('sha256').update(t).digest()
  return crypto.timingSafeEqual(resumo(a), resumo(b))
}

// ---------- sessões ----------

// Sessões ficam na memória do servidor: token → horário em que expira.
// Reiniciar o serviço desconecta todo mundo, o que é aceitável aqui.
const sessoes = new Map()

function criarSessao() {
  const agora = Date.now()
  for (const [token, expiraEm] of sessoes) {
    if (expiraEm <= agora) sessoes.delete(token)
  }
  const token = crypto.randomBytes(32).toString('base64url')
  sessoes.set(token, agora + configuracao().sessaoHoras * 60 * 60 * 1000)
  return token
}

function tokenDaRequisicao(req) {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const [nome, ...valor] = parte.trim().split('=')
    if (nome === COOKIE) return valor.join('=')
  }
  return null
}

function sessaoValida(req) {
  const token = tokenDaRequisicao(req)
  const expiraEm = token && sessoes.get(token)
  if (!expiraEm) return false
  if (expiraEm <= Date.now()) {
    sessoes.delete(token)
    return false
  }
  return true
}

// HttpOnly: o JavaScript da página não lê o cookie. SameSite=Strict: outro site
// não consegue fazer o navegador mandar o cookie junto (proteção contra CSRF).
function gravarCookie(res, token, maxAgeSegundos) {
  const { cookieSeguro } = configuracao()
  const atributos = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSegundos}`,
    ...(cookieSeguro ? ['Secure'] : [])
  ]
  res.set('Set-Cookie', atributos.join('; '))
}

// ---------- limite de chamadas ----------

// Toda chamada a /api/login conta, com senha certa ou errada: no máximo
// LIMITE_POR_IP por minuto de cada IP e LIMITE_GERAL por minuto somando todos.
// Roda antes da leitura do corpo, então o excesso é recusado sem processar JSON
// nem chegar ao scrypt. O limite geral segura um ataque espalhado por muitos IPs.
// Como no bloqueio abaixo, atrás do proxy o IP de todos é o do proxy.
const JANELA_MS = 60 * 1000
const LIMITE_POR_IP = 10
const LIMITE_GERAL = 30

let inicioJanela = 0
let chamadasGerais = 0
let avisoNaJanela = false
const chamadasPorIp = new Map()

export function limitarLogin(req, res, next) {
  const agora = Date.now()
  if (agora - inicioJanela >= JANELA_MS) {
    inicioJanela = agora
    chamadasGerais = 0
    avisoNaJanela = false
    chamadasPorIp.clear()
  }

  const doIp = (chamadasPorIp.get(req.ip) || 0) + 1
  chamadasPorIp.set(req.ip, doIp)
  if (doIp <= LIMITE_POR_IP) {
    chamadasGerais++
    if (chamadasGerais <= LIMITE_GERAL) return next()
  }

  // Um aviso por minuto basta: numa enxurrada, um por chamada lotaria o log.
  if (!avisoNaJanela) {
    avisoNaJanela = true
    console.warn('⚠️  Limite de chamadas ao login atingido; recusando até o fim do minuto')
  }
  res.set('Retry-After', String(Math.ceil((inicioJanela + JANELA_MS - agora) / 1000)))
  res.status(429).json({ erro: 'Muitas tentativas. Aguarde um minuto e tente de novo.' })
}

// ---------- tentativas ----------

// Depois de MAX_FALHAS senhas erradas seguidas, o IP espera BLOQUEIO_MINUTOS.
// Atrás do proxy todos chegam com o IP do proxy, então o bloqueio vale para todos.
const falhasPorIp = new Map()

function minutosBloqueado(ip) {
  const registro = falhasPorIp.get(ip)
  if (!registro?.bloqueadoAte) return 0
  const restante = registro.bloqueadoAte - Date.now()
  if (restante <= 0) {
    falhasPorIp.delete(ip)
    return 0
  }
  return Math.ceil(restante / 60000)
}

function registrarFalha(ip) {
  const registro = falhasPorIp.get(ip) || { falhas: 0, bloqueadoAte: 0 }
  registro.falhas++
  if (registro.falhas >= MAX_FALHAS) {
    registro.falhas = 0
    registro.bloqueadoAte = Date.now() + BLOQUEIO_MINUTOS * 60 * 1000
  }
  falhasPorIp.set(ip, registro)
}

// ---------- rotas e middleware ----------

export function rotaLogin(req, res) {
  if (!loginConfigurado()) {
    return res.status(503).json({ erro: 'Login não configurado no servidor. Fale com a TI.' })
  }

  const bloqueio = minutosBloqueado(req.ip)
  if (bloqueio > 0) {
    return res.status(429).json({ erro: `Muitas tentativas. Tente de novo em ${bloqueio} min.` })
  }

  const usuario = String(req.body?.usuario ?? '').trim()
  const senha = String(req.body?.senha ?? '')
  const { usuario: usuarioCerto, hashSenha, sessaoHoras } = configuracao()

  // As duas comparações rodam sempre, para o tempo de resposta não indicar se o
  // usuário existe.
  const usuarioOk = textoConfere(usuario.toLowerCase(), usuarioCerto.toLowerCase())
  const senhaOk = senhaConfere(senha, hashSenha)

  if (!usuarioOk || !senhaOk) {
    registrarFalha(req.ip)
    console.warn('Tentativa de login recusada')
    return res.status(401).json({ erro: 'Usuário ou senha incorretos.' })
  }

  falhasPorIp.delete(req.ip)
  gravarCookie(res, criarSessao(), sessaoHoras * 60 * 60)
  res.status(204).end()
}

export function rotaLogout(req, res) {
  const token = tokenDaRequisicao(req)
  if (token) sessoes.delete(token)
  gravarCookie(res, '', 0)
  res.status(204).end()
}

// Fica antes de tudo no server.js: sem sessão válida, páginas redirecionam para
// o login e chamadas da API recebem 401.
export function exigirLogin(req, res, next) {
  const logado = sessaoValida(req)

  if (req.path === '/login.html' && logado) return res.redirect('/')
  if (CAMINHOS_LIVRES.has(req.path) || req.path.startsWith('/assets/') || logado) return next()

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' })
  }
  res.redirect('/login.html')
}
