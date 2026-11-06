import { NOVIDADES } from './novidades.js'

//
// Para criar uma opção, basta uma linha em OPCOES. Opção com "recurso" no lugar
// de "href" ganha o selo "Em breve" e abre a página em-desenvolvimento.html, que
// usa o rótulo daqui. O ícone é o atributo "d" de um <path> desenhado num quadro
// de 24×24, só com traço.

export const OPCOES = [
  {
    rotulo: 'Novo termo',
    href: '/',
    icone: 'M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5l-4-4ZM14 3.5v4h4M12 11v6M9 14h6'
  },
  {
    rotulo: 'Painel',
    href: 'painel.html',
    icone: 'M4 4h6v8H4zM14 4h6v5h-6zM14 13h6v7h-6zM4 16h6v4H4z'
  },
  {
    rotulo: 'Cautela de equipamento',
    href: 'cautela.html',
    icone: 'M9 5H7.5A1.5 1.5 0 0 0 6 6.5v13A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 5H15M10 3.5h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1ZM9.5 13.5l2 2 3.5-4'
  },
  {
    rotulo: 'Assinatura dupla',
    href: 'assinatura-dupla',
    icone: 'M12 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5M15 5.2a3 3 0 0 1 0 5.6M17 14.7c2 .6 3.5 2.3 3.5 4.8'
  },
  {
    rotulo: 'Multi fotos',
    recurso: 'multi-fotos',
    icone: 'M8 7V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H17M4 9.5A1.5 1.5 0 0 1 5.5 8h10A1.5 1.5 0 0 1 17 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-9ZM4.5 17.5 8 14l3 3 2-2 3.5 3.5'
  }
]

const ICONE_NOVIDADES = 'M12 3.5 13.9 9l5.6.2-4.4 3.5 1.6 5.4L12 15l-4.7 3.1 1.6-5.4L4.5 9.2 10.1 9 12 3.5Z'
const ICONE_NOTAS_TECNICAS = 'm8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13'
const ICONE_SETA = 'm6 9 6 6 6-6'
const ICONE_FECHAR = 'M6 6l12 12M18 6 6 18'

const botaoAbrir = document.getElementById('menu-abrir')
// só existe no formulário: a versão no rodapé também abre as novidades
const rodapeVersao = document.getElementById('rodape-versao')

// Tudo é montado com createElement e textContent, nunca innerHTML.
function criar(tag, classe, ...filhos) {
  const elemento = document.createElement(tag)
  if (classe) elemento.className = classe
  elemento.append(...filhos)
  return elemento
}

function icone(d, classe) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  if (classe) svg.setAttribute('class', classe)
  const traco = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  traco.setAttribute('d', d)
  svg.append(traco)
  return svg
}

// ---------- novidades ----------
// A versão mais recente que a pessoa já viu fica no navegador. Enquanto ela não
// vir a atual, o botão do menu e a versão no rodapé ganham um ponto, e a opção
// Novidades ganha o selo "Novo". Abrir as novidades ou as notas técnicas conta
// como "já vi".

const versaoAtual = NOVIDADES[0].versao

function lerVersaoVista() {
  try { return localStorage.getItem('novidades-vista') } catch (e) { return null }
}

const temNovidade = lerVersaoVista() !== versaoAtual

// Trechos entre crases viram <code>.
function preencherTexto(destino, texto) {
  texto.split(/`([^`]+)`/).forEach((parte, i) => {
    if (!parte) return
    if (i % 2 === 0) {
      destino.append(parte)
    } else {
      const codigo = document.createElement('code')
      codigo.textContent = parte
      destino.append(codigo)
    }
  })
}

function blocoVersao({ versao, data }, itens) {
  const topo = criar('div', 'novidades-versao-topo',
    criar('span', 'novidades-versao-numero', `v${versao}`),
    criar('span', 'novidades-versao-data', data))

  const lista = criar('ul', 'novidades-lista')
  for (const item of itens) {
    const li = document.createElement('li')
    preencherTexto(li, item)
    lista.append(li)
  }

  return criar('section', 'novidades-versao', topo, lista)
}

// Lista um campo ("itens" ou "tecnico") de todas as versões que o tenham: a
// mais recente fica à vista, as anteriores recolhidas num <details>.
function listaDeVersoes(campo) {
  const [atual, ...anteriores] = NOVIDADES.filter(n => n[campo]?.length)
  const partes = [blocoVersao(atual, atual[campo])]
  if (anteriores.length > 0) {
    partes.push(criar('details', 'novidades-anteriores',
      criar('summary', '', 'Versões anteriores'),
      ...anteriores.map(n => blocoVersao(n, n[campo]))))
  }
  return partes
}

// ---------- montagem ----------

const paginaAtual = location.pathname.replace(/index\.html$/, '')

// Mesma página e, se o link tiver "?recurso=...", o mesmo recurso. Os outros
// parâmetros não contam: o painel continua marcado com a busca na URL.
function ehPaginaAtual(href) {
  const alvo = new URL(href, location.href)
  return alvo.pathname.replace(/index\.html$/, '') === paginaAtual &&
    (!alvo.search || alvo.search === location.search)
}

function itemDeOpcao({ rotulo, href, recurso, icone: d }) {
  const conteudo = [icone(d, 'menu-item-icone'), criar('span', 'menu-item-rotulo', rotulo)]
  if (recurso) {
    href = `em-desenvolvimento.html?recurso=${recurso}`
    conteudo.push(criar('span', 'menu-selo menu-selo-breve', 'Em breve'))
  }

  const link = criar('a', recurso ? 'menu-item menu-item-breve' : 'menu-item', ...conteudo)
  link.href = href
  if (ehPaginaAtual(href)) {
    link.setAttribute('aria-current', 'page')
    // Já está nesta página: recarregar apagaria o formulário preenchido.
    link.addEventListener('click', (e) => {
      e.preventDefault()
      menu.close()
    })
  }
  return criar('li', '', link)
}

function secaoRecolhida(id, rotulo, d, conteudo) {
  const corpo = criar('div', 'menu-expandido', ...conteudo)
  corpo.id = id
  corpo.hidden = true

  const botao = criar('button', 'menu-item',
    icone(d, 'menu-item-icone'),
    criar('span', 'menu-item-rotulo', rotulo),
    icone(ICONE_SETA, 'menu-item-seta'))
  botao.type = 'button'
  botao.setAttribute('aria-expanded', 'false')
  botao.setAttribute('aria-controls', id)

  return { botao, corpo }
}

const novidades = secaoRecolhida('menu-novidades', 'Novidades', ICONE_NOVIDADES, listaDeVersoes('itens'))
const notasTecnicas = secaoRecolhida('menu-notas-tecnicas', 'Notas técnicas', ICONE_NOTAS_TECNICAS, listaDeVersoes('tecnico'))

const seloNovo = criar('span', 'menu-selo menu-selo-novo', 'Novo')
seloNovo.hidden = !temNovidade
novidades.botao.lastChild.before(seloNovo)

const logo = criar('img', 'topbar-logo')
logo.src = 'assets/logo.png'
logo.alt = 'Termsgen'

const botaoFechar = criar('button', 'menu-fechar', icone(ICONE_FECHAR))
botaoFechar.type = 'button'
botaoFechar.setAttribute('aria-label', 'Fechar menu')

const menu = criar('dialog', 'menu-lateral',
  criar('div', 'menu-topo', logo, botaoFechar),
  criar('nav', 'menu-corpo',
    criar('p', 'menu-grupo', 'Termos'),
    criar('ul', 'menu-lista', ...OPCOES.map(itemDeOpcao)),
    criar('p', 'menu-grupo', 'Sobre o sistema'),
    criar('ul', 'menu-lista',
      criar('li', '', novidades.botao, novidades.corpo),
      criar('li', '', notasTecnicas.botao, notasTecnicas.corpo))))
menu.id = 'menu-lateral'
menu.setAttribute('aria-label', 'Menu')
document.body.append(menu)

// ---------- comportamento ----------

function marcarComoVista() {
  try { localStorage.setItem('novidades-vista', versaoAtual) } catch (e) { /* modo privado */ }
  seloNovo.hidden = true
  botaoAbrir.classList.remove('tem-novidade')
  rodapeVersao?.classList.remove('tem-novidade')
}

function expandir({ botao, corpo }, aberto) {
  botao.setAttribute('aria-expanded', String(aberto))
  corpo.hidden = !aberto
  if (aberto) marcarComoVista()
}

for (const secao of [novidades, notasTecnicas]) {
  secao.botao.addEventListener('click', () => expandir(secao, secao.corpo.hidden))
}

botaoAbrir.classList.toggle('tem-novidade', temNovidade)
rodapeVersao?.classList.toggle('tem-novidade', temNovidade)

// <dialog> modal: o resto da página fica inerte, o Esc fecha e o foco volta
// para o botão do topo ao fechar.
botaoAbrir.addEventListener('click', () => menu.showModal())
botaoFechar.addEventListener('click', () => menu.close())
// o conteúdo cobre o <dialog> inteiro, então um clique nele mesmo só pode ser no fundo escurecido
menu.addEventListener('click', (e) => {
  if (e.target === menu) menu.close()
})

rodapeVersao?.addEventListener('click', () => {
  menu.showModal()
  expandir(novidades, true)
  novidades.botao.focus()
})
