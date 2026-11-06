// Histórico de novidades mostrado no menu lateral (js/menu.js): "itens" na
// opção Novidades e "tecnico" na opção Notas técnicas. A versão no rodapé do
// formulário também abre o menu nas novidades.
//
// - itens: para quem USA o formulário. O que mudou para a pessoa, em uma frase.
// - tecnico (opcional): para a TI. Configuração, comandos, estrutura. Trechos
//   entre crases (`assim`) aparecem como código. Nunca coloque valores do .env
//   aqui (token, IDs, e-mails): este arquivo é público para quem abre a página.
//
// A versão mais nova fica sempre em primeiro. Ao lançar uma versão nova:
//  1. suba o MAIOR.MENOR em "version" no package.json (ex: 1.2.0 -> 1.3.0);
//  2. adicione um bloco aqui no topo com a mesma versão (ex: '1.3').
// Quem ainda não viu a versão nova encontra um ponto no botão do menu e o selo
// "Novo" na opção Novidades.

export const NOVIDADES = [
  {
    versao: '1.5',
    data: '03/11/2026',
    itens: [
      'Nova opção "Assinatura dupla" no menu: o mesmo termo, para dois colaboradores responsáveis pelo mesmo aparelho. Os dois aparecem no termo e assinam no Clicksign, cada um com o próprio link.',
      'Na assinatura dupla, o e-mail de assinatura de cada colaborador é digitado duas vezes, e o sistema não aceita o mesmo e-mail para os dois.',
      'Novo acessório "Cordão", desmarcado por padrão: só entra no termo quando marcado.',
      'Termos de todas as empresas refeitos: logos, textos e fotos não saem mais do lugar com nome longo, linha a mais na tabela ou fotos nos anexos.',
      'Nos anexos, as fotos da frente e de trás ficam lado a lado.',
      'O PDF do termo fica pronto mais rápido.'
    ],
    tecnico: [
      'Modelos em `templates/termos/` (um colaborador) e `templates/duplaAssinatura/` (dois), com os mesmos nomes. A rota `/api/gerar-termo` escolhe a pasta; os modelos da raiz de `templates/` saíram.',
      'Modelos refeitos sem imagens flutuantes, caixas de texto nem parágrafos vazios: logos no cabeçalho, ícone no rodapé, tabelas de largura fixa e quebras de página fixas antes de Devolução, Férias e Anexos. Os arquivos caíram de até 16 MB para no máximo 100 KB, e a geração do PDF ficou de 21% a 41% mais rápida (medido na máquina de desenvolvimento).',
      'Novas tags: `{name2}` e `{email2}` (assinatura dupla), `{ano}` (ano corrente, no lugar do 2026 escrito no texto) e a linha `{#temCordao}{qtCord} {cordao} {eCord}{/temCordao}`, que some sem cordão.',
      'A assinatura dupla é o mesmo `index.html`, servido em `/assinatura-dupla`. O PDF sai como `NOME1_E_NOME2_TERMO_DE_...`.',
      '`enviarParaAssinatura` recebe uma lista de `signatarios`: cada um com os mesmos requisitos (responsável legal, código por e-mail e selfie dinâmica), assinando sem ordem. O painel grava os nomes e os e-mails separados por vírgula.',
      'Um termo recusado na validação (erro 400) agora também apaga as fotos de `uploads_tmp`, como a cautela já fazia.'
    ]
  },
  {
    versao: '1.4',
    data: '02/11/2026',
    itens: [
      'Nova opção "Cautela de equipamento" no menu: cautela de entrega e de devolução de equipamentos como notebook e carregador, sem escolher empresa.',
      'Até 6 produtos por cautela. Só o nome do produto é obrigatório; número de série, hostname e etiqueta vazios saem como "S/N".',
      'A tabela de produtos sempre mostra 6 linhas, como na cautela em papel; as que sobram ficam em branco.',
      'Duas fotos obrigatórias, uma terceira opcional e uma descrição opcional de até 500 caracteres.',
      'A cautela também pode ser enviada para assinatura no Clicksign, do mesmo jeito que o termo, e aparece no painel.'
    ],
    tecnico: [
      'Página `public/cautela.html` com `js/cautela.js` e rota `POST /api/gerar-cautela`. Os produtos chegam como JSON; os erros voltam como `hardware-<posição>-<campo>` e a tela os mostra na linha certa.',
      'Modelos em `templates/cautela/` (`CAUTELA.docx` e `CAUTELA_dev.docx`), feitos só com tabelas. Tags: `{name}`, `{usuario}`, `{setor}`, `{data}` (DD.MM.AAAA, ano corrente), os laços `{#hardwares}` e `{#vazios}`, `{%foto1}` a `{%foto3}` e `{#descricao}`.',
      'Limite de produtos em `LIMITE_HARDWARES` (`validations.js`), validado no navegador e no servidor.',
      'No painel, a cautela aparece como "Cautela de entrega" ou "Cautela de devolução", sem empresa.'
    ]
  },
  {
    versao: '1.3',
    data: '06/10/2026',
    itens: [
      'Agora é preciso entrar com usuário e senha para usar o sistema. O botão "Sair", no topo, encerra o acesso.',
      'Novo painel "Termos enviados", no topo: mostra os termos da pasta configurada no Clicksign e a situação de cada um (aguardando, prazo vencido, assinado ou cancelado).',
      'No painel, dá para buscar por nome, e-mail ou tipo de termo e filtrar pela situação clicando nos cartões de contagem.',
      'A situação é conferida no Clicksign ao abrir o painel. O botão "Atualizar agora" confere na hora.',
      'Tela de login renovada, com opção de mostrar a senha e aviso de Caps Lock ligado.'
    ],
    tecnico: [
      'Login com uma credencial única no `.env`: `LOGIN_USUARIO` e `LOGIN_SENHA_HASH`, gerado por `npm run login:senha`. A senha não fica gravada, só o hash `scrypt`. Sem essas variáveis, ninguém entra.',
      'Sessão em cookie `HttpOnly` e `SameSite=Strict`, guardada na memória do servidor: reiniciar o serviço desconecta todos. Cinco senhas erradas bloqueiam novas tentativas por 5 minutos. Código em `src/auth.js`.',
      'Opcionais: `LOGIN_SESSAO_HORAS` (padrão 8) e `LOGIN_COOKIE_SEGURO=true` quando o site estiver em HTTPS.',
      'Painel em `public/painel.html`, com banco SQLite embutido no Node 22.13+ em `dados/termsgen.db` (fora do Git, incluir no backup). Guarda nome e e-mail de assinatura, tipo, empresa e datas. Fotos e PDF continuam sem ficar no servidor.',
      'Status conferido sob demanda, só dos termos em andamento e no máximo a cada `PAINEL_INTERVALO_MINUTOS` (padrão 10). Sem webhook, que exigiria o servidor acessível pela internet.',
      '`npm run clicksign:importar` traz os termos que já estavam na pasta. A API não filtra por pasta: o comando percorre a conta e consulta `GET /envelopes/{id}/folder`, rota não documentada. Use `-- --desde=AAAA-MM-DD` para encurtar.',
      'Termos importados não têm empresa, porque o Clicksign não a guarda. Os enviados pelo formulário a partir da 1.3 têm.'
    ]
  },
  {
    versao: '1.2',
    data: '01/10/2026',
    itens: [
      'Envio do termo para assinatura eletrônica no Clicksign, direto do formulário: depois de clicar em "Gerar termo em PDF", escolha se quer enviar.',
      'O e-mail que recebe o link de assinatura pode ser diferente do e-mail do termo, e é digitado duas vezes para evitar erro.',
      'O colaborador confirma a identidade com um código enviado ao e-mail e uma selfie dinâmica.',
      'Os termos enviados ficam numa pasta própria do Clicksign, e a equipe de TI acompanha cada assinatura.',
      'O número da versão aparece no rodapé.'
    ],
    tecnico: [
      'Integração com a API v3 do Clicksign (envelopes) em `src/clicksign.js`, configurada pelo `.env` na raiz, que não vai para o Git.',
      '`CLICKSIGN_ACCESS_TOKEN`: token da API. Sem ele, o modal de assinatura não aparece e o sistema só gera o PDF.',
      '`CLICKSIGN_AMBIENTE`: `sandbox` (padrão) ou `producao`. Precisa combinar com a conta de onde o token veio.',
      '`CLICKSIGN_PASTA_ID` e `CLICKSIGN_OBSERVADORES`: pasta dos envelopes e e-mails que acompanham a assinatura. Obrigatórios em produção: sem eles, o envio é recusado e o servidor avisa ao iniciar.',
      '`CLICKSIGN_OBSERVADOR_QUANDO` (`all_steps` ou `on_finished`), `CLICKSIGN_OBSERVADOR_RECEBE_DOCUMENTO` e `CLICKSIGN_PRAZO_DIAS` têm valor padrão e são opcionais.',
      '`npm run clicksign:pastas` lista as pastas da conta com o ID de cada uma.',
      'Signatário com papel `legal_guardian` (responsável legal) e autenticação por `email` + `liveness` (selfie dinâmica).',
      'Projeto reorganizado: servidor em `src/`, front em `public/css` e `public/js`, modelos em `templates/`. Inicie com `npm start`; `node server.js` não existe mais.',
      'Versão do rodapé = `MAIOR.MENOR` do `package.json` + `git rev-list --count HEAD`, calculada ao iniciar o servidor.'
    ]
  },
  {
    versao: '1.1',
    data: '21/09/2026',
    itens: [
      'Visual do formulário renovado, com indicador de progresso das etapas.',
      'Tema claro e escuro, que acompanha o sistema ou pode ser trocado no botão do topo.',
      'Novas opções de estado do aparelho: "Bom" e "Regular" com marcas de uso.',
      'Termos de responsabilidade, devolução e férias de todas as empresas revisados e formatados.'
    ],
    tecnico: [
      'Nova tag `{eCExtenso}` nos templates, com o estado do aparelho por extenso. A sigla `{eC}` continua igual.',
      'Estados do aparelho definidos em `ESTADOS_APARELHO` (`validations.js`): para criar um, basta uma linha ali e uma opção no HTML.',
      'Tema guardado no `localStorage` e aplicado por um script no `<head>` antes de a página desenhar, para não piscar.'
    ]
  },
  {
    versao: '1.0',
    data: '09/09/2026',
    itens: [
      'Primeira versão web: o termo é preenchido no navegador e o PDF é gerado na hora.',
      'Termos de responsabilidade, devolução e férias de quatro empresas.'
    ],
    tecnico: [
      'Node + Express. Os templates `.docx` são preenchidos com docxtemplater e convertidos em PDF pelo LibreOffice (pasta `LibreOfficePortable/`, fora do Git).',
      'As mesmas regras de validação rodam no navegador e no servidor (`validations.js`).',
      'Nenhum termo ou foto fica guardado no servidor: tudo é apagado depois do download.'
    ]
  }
]
