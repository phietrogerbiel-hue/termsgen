// Regras de filtro e validação do formulário, escritas como funções puras para
// funcionar tanto no navegador (validação na hora) quanto no servidor
// (revalidação antes de gerar o documento).

export const mesesValidos = [
  'janeiro', 'fevereiro', 'março', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

export const extensoesValidas = ['.jpg', '.jpeg', '.png', '.webp'];

function limpar(input) {
  return (input ?? '').toString().trim();
}

function limparEspacos(input) {
  return limpar(input).replace(/\s+/g, ' ');
}

// A EMPRESA_D mostra como dar regras próprias a uma empresa: o termo dela não
// tem setor nem e-mail, e a etiqueta tem 3 dígitos em vez de 6. O valor do
// select é o nome do modelo (EMPRESA_D.docx, EMPRESA_D_dev.docx, EMPRESA_D_fer.docx).
const EMPRESA_REGRA_PROPRIA = 'EMPRESA_D';

export function temRegraPropria(empresaValue) {
  // "EMPRESA_D_dev.docx" → "EMPRESA_D"
  return !!empresaValue && empresaValue.replace(/(_dev|_fer)?\.docx$/, '') === EMPRESA_REGRA_PROPRIA;
}

// ---- dia ----
export function validarDia(input) {
  const v = limpar(input);
  if (!v) return 'CAMPO OBRIGATÓRIO';
  const dia = Number(v);
  if (Number.isInteger(dia) && dia >= 1 && dia <= 31) return true;
  return '❌ POR FAVOR, DIGITE UM NÚMERO VÁLIDO ENTRE 1 E 31!';
}
export function filtrarDia(input) {
  return parseInt(limpar(input), 10);
}

// ---- mês ----
export function validarMes(input) {
  const v = limparEspacos(input).toLowerCase();
  if (!v) return 'CAMPO OBRIGATÓRIO';
  if (!mesesValidos.includes(v)) {
    return '❌ Mês inválido! Digite um mês por extenso (ex: Janeiro, Fevereiro...).';
  }
  return true;
}
export function filtrarMes(input) {
  const v = limparEspacos(input).toLowerCase();
  if (v === 'marco') return 'Março';
  return v.charAt(0).toUpperCase() + v.slice(1);
}

// ---- modelo do celular ----
export function validarModelCel(input) {
  const v = limparEspacos(input).toUpperCase();
  if (!v) return 'CAMPO OBRIGATÓRIO';
  if (v.length < 5) return 'CARACTERES INSUFICIENTES PARA VALIDAÇÃO';
  const regex = /^[a-zA-Z]+(?:\s[a-zA-Z0-9-]+)*$/;
  if (!regex.test(v)) return 'O MODELO DO CELULAR NÂO DEVE CONTER CARACTERES ESPECIAIS OU LEETSPEAK!';
  return true;
}
export function filtrarModelCel(input) {
  return limparEspacos(input).toUpperCase();
}

//estado do aparelho
/*O termo mostra o estado em dois lugares, com formatos diferentes
por isso o select manda um código e é aqui que ele vira letra e texto
Para criar um estado, basta acrescentar uma linha no objeto a seguir e na opção no HTML. 
*/

export const ESTADOS_APARELHO = {
  N: {letra: 'N', extenso: 'NOVO'},
  B: {letra: 'B', extenso: 'BOM'},
  R: {letra: 'R', extenso: 'REGULAR'},
  BMU: {letra: 'B', extenso: 'BOM - COM MARCAS DE USO'},
  RMU: {letra: 'R', extenso: 'REGULAR - COM MARCAS DE USO'}
};

export function validarEstadoAparelho(input){
  const v = limpar(input).toUpperCase();
  if(!v) return 'CAMPO OBRIGATÓRIO';
  if(!ESTADOS_APARELHO[v]) return 'ESTADO DO APARELHO INVÁLIDO';
  return true;
};

export function letraEstado(input){
  return ESTADOS_APARELHO[limpar(input).toUpperCase()]?.letra ?? '';
};

export function extensoEstado(input){
  return ESTADOS_APARELHO[limpar(input).toUpperCase()]?.extenso ?? '';
}


// ---- nome completo ----
export function validarName(input) {
  const v = limparEspacos(input).toUpperCase();
  if (!v) return 'CAMPO OBRIGATÓRIO';
  if (v.length < 10) return 'CARACTERES INSUFICIENTES PARA VALIDAÇÃO';
  const regex = /^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/;
  if (!regex.test(v)) return 'O NOME NÃO DEVE TER NÚMERO OU CARACTERES ESPECIAIS!';
  return true;
}
export function filtrarName(input) {
  return limparEspacos(input).toUpperCase();
}

// ---- setor (não aparece para a empresa de regra própria) ----
export function validarSetor(input) {
  const v = limparEspacos(input).toUpperCase();
  if (!v) return 'CAMPO OBRIGATÓRIO';
  if (v.length < 4) return 'CARACTERES INSUFICIENTES PARA VALIDAÇÃO';
  const regex = /^[A-Za-zÀ-ÖØ-öø-ÿ12\s]+$/;
  if (!regex.test(v)) return 'O SETOR NÃO DEVE CONTER CARACTERES ESPECIAIS OU NÚMEROS (EXCETO 1 E 2)';
  return true;
}
export function filtrarSetor(input) {
  return limparEspacos(input).toUpperCase();
}

// ---- usuário (login do colaborador, usado na cautela) ----
export function validarUsuario(input) {
  const v = limpar(input);
  if (!v) return 'CAMPO OBRIGATÓRIO';
  if (/\s/.test(v)) return 'O USUÁRIO NÃO DEVE CONTER ESPAÇOS!';
  if (v.length < 3) return 'CARACTERES INSUFICIENTES PARA VALIDAÇÃO';
  const regex = /^[A-Za-z0-9._-]+$/;
  if (!regex.test(v)) return 'O USUÁRIO DEVE CONTER APENAS LETRAS, NÚMEROS, PONTO, HÍFEN OU SUBLINHADO';
  return true;
}
export function filtrarUsuario(input) {
  return limpar(input).toLowerCase();
}

// ---- tipo de cautela (só existem entrega e devolução) ----
export const TIPOS_CAUTELA = ['entrega', 'devolucao'];

export function validarTipoCautela(input) {
  const v = limpar(input);
  if (!v) return 'CAMPO OBRIGATÓRIO';
  if (!TIPOS_CAUTELA.includes(v)) return 'TIPO DE CAUTELA INVÁLIDO';
  return true;
}

// ---- hardwares da cautela: só o produto é obrigatório, o resto pode ficar vazio ----
// Seis é o que cabe na primeira página do modelo, junto com as assinaturas.
export const LIMITE_HARDWARES = 6;

const regexTextoHardware = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9\s.,\-–/+()"']+$/;
const sinaisHardware = '. , - / + ( ) " \'';

export function validarProduto(input) {
  const v = limparEspacos(input);
  if (!v) return 'CAMPO OBRIGATÓRIO';
  if (v.length < 3) return 'CARACTERES INSUFICIENTES PARA VALIDAÇÃO';
  if (v.length > 60) return 'O PRODUTO DEVE TER NO MÁXIMO 60 CARACTERES';
  if (!regexTextoHardware.test(v)) return `O PRODUTO DEVE CONTER APENAS LETRAS, NÚMEROS E OS SINAIS ${sinaisHardware}`;
  return true;
}
export function filtrarProduto(input) {
  return limparEspacos(input).toUpperCase();
}

export function validarConfiguracao(input) {
  const v = limparEspacos(input);
  if (!v) return true;
  if (v.length > 60) return 'A CONFIGURAÇÃO DEVE TER NO MÁXIMO 60 CARACTERES';
  if (!regexTextoHardware.test(v)) return `A CONFIGURAÇÃO DEVE CONTER APENAS LETRAS, NÚMEROS E OS SINAIS ${sinaisHardware}`;
  return true;
}
export function filtrarConfiguracao(input) {
  return limparEspacos(input);
}

export function validarHostname(input) {
  const v = limpar(input);
  if (!v) return true;
  if (v.length > 63) return 'O HOSTNAME DEVE TER NO MÁXIMO 63 CARACTERES';
  if (!/^[A-Za-z0-9-]+$/.test(v)) return 'O HOSTNAME DEVE CONTER APENAS LETRAS, NÚMEROS E HÍFEN (EX: EMPRESA-NOT016)';
  return true;
}
export function filtrarHostname(input) {
  return limpar(input).toUpperCase();
}

// ---- descrição opcional das fotos da cautela ----
// Texto livre: o docxtemplater já escapa o que for digitado. A quebra de linha
// conta como um caractere, igual ao maxlength do navegador (o envio a transforma
// em \r\n).
export const LIMITE_DESCRICAO = 500;

export function validarDescricao(input) {
  const v = limpar(input).replace(/\r\n/g, '\n');
  if (v.length > LIMITE_DESCRICAO) return `A DESCRIÇÃO DEVE TER NO MÁXIMO ${LIMITE_DESCRICAO} CARACTERES`;
  return true;
}
export function filtrarDescricao(input) {
  return limpar(input).replace(/\r\n/g, '\n');
}

// Número de série e etiqueta seguem as regras do termo, mas só quando preenchidos.
export function validarSerialOpcional(input) {
  return limpar(input) ? validarSerialNumber(input) : true;
}
export function validarEtiquetaOpcional(input) {
  return limpar(input) ? validarEtiqueta(input) : true;
}

// ---- email (não aparece para a empresa de regra própria) ----
export function validarEmail(input) {
  const v = limpar(input);
  if (!v) return 'CAMPO OBRIGATÓRIO';
  const regex = /^[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!regex.test(v)) return 'Digite um e-mail válido no padrão "nome.sobrenome@empresa.com".';
  return true;
}
export function filtrarEmail(input) {
  return limpar(input).toLowerCase();
}

// ---- e-mail para assinatura no Clicksign ----
// Pode ser diferente do e-mail do termo (ex: e-mail pessoal), por isso não exige
// o padrão nome.sobrenome — só um formato de e-mail válido.
export function validarEmailAssinatura(input) {
  const v = limpar(input);
  if (!v) return 'CAMPO OBRIGATÓRIO';
  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v)) return 'Digite um e-mail válido.';
  return true;
}
export function validarConfirmacaoEmail(confirmacao, email) {
  const v = limpar(confirmacao);
  if (!v) return 'CAMPO OBRIGATÓRIO';
  if (v.toLowerCase() !== limpar(email).toLowerCase()) return 'OS E-MAILS NÃO CONFEREM';
  return true;
}

// ---- assinatura dupla: cada colaborador assina com um e-mail só dele ----
export function validarEmailsDiferentes(emailColaborador, emailColaborador2) {
  if (limpar(emailColaborador).toLowerCase() === limpar(emailColaborador2).toLowerCase()) {
    return 'OS DOIS SIGNATÁRIOS NÃO PODEM USAR O MESMO E-MAIL';
  }
  return true;
}

// ---- número de série ----
export function validarSerialNumber(input) {
  const v = limpar(input);
  if (!v) return 'CAMPO OBRIGATÓRIO';
  if (/\s/.test(v)) return 'O NÚMERO DE SÉRIE NÃO DEVE CONTER ESPAÇOS!';
  const regex = /^[A-Za-z0-9]+$/;
  if (!regex.test(v)) return 'O NÚMERO DE SÉRIE DEVE CONTER APENAS LETRAS E NÚMEROS!';
  if (v.length < 6 || v.length > 20) return 'NÚMERO DE SÉRIE INVÁLIDO (DEVE TER ENTRE 6 E 20 CARACTERES)';
  return true;
}
export function filtrarSerialNumber(input) {
  return limpar(input).toUpperCase();
}

// ---- IMEI (usado para imei1 e imei2) ----
export function validarImei(input) {
  const v = limpar(input);
  if (!v) return 'CAMPO OBRIGATÓRIO';
  const regex = /^\d{15}$/;
  if (!regex.test(v)) return 'O IMEI DEVE CONTER EXATAMENTE 15 NÚMEROS';
  return true;
}
export function filtrarImei(input) {
  return limpar(input);
}

// ---- valor do telefone ----
export function validarValor(input) {
  const v = limpar(input).replace(',', '.');
  if (!v) return 'CAMPO OBRIGATÓRIO';
  const regex = /^\d+(\.\d{1,2})?$/;
  if (!regex.test(v)) return 'INSIRA UM VALOR VÁLIDO (EX: 1500 ou 1500,50)';
  return true;
}
export function filtrarValorParaExibicao(input) {
  const numero = Number(limpar(input).replace(',', '.'));
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ---- etiqueta (dígitos variam: 3 para a empresa de regra própria, 6 para as demais) ----
export function validarEtiqueta(input, empresaValue) {
  const v = limpar(input);
  if (!v) return 'CAMPO OBRIGATÓRIO';
  const regraPropria = temRegraPropria(empresaValue);
  const digitos = regraPropria ? 3 : 6;
  const regex = new RegExp(`^\\d{${digitos}}$`);
  if (!regex.test(v)) {
    const exemplo = regraPropria ? '123' : '000534';
    return `A ETIQUETA DA ${regraPropria ? 'EMPRESA D' : 'EMPRESA'} DEVE CONTER EXATAMENTE ${digitos} NÚMEROS (EX: ${exemplo})`;
  }
  return true;
}

// ---- número de telefone (chip) ----
export function validarNumeroTel(input) {
  const v = limparEspacos(input);
  if (!v) return 'CAMPO OBRIGATÓRIO';
  const regex = /^\d{2}\s?9\d{8}$/;
  if (!regex.test(v)) return 'NÚMERO INVÁLIDO! USE O FORMATO: 92 999999999 OU 92999999999';
  return true;
}
export function filtrarNumeroTel(input) {
  return limparEspacos(input);
}

// ---- foto (frente/verso) — checagem de extensão pelo nome do arquivo ----
export function getExtensao(nomeArquivo) {
  const nome = limpar(nomeArquivo).toLowerCase();
  const idx = nome.lastIndexOf('.');
  return idx === -1 ? '' : nome.slice(idx);
}
export function validarExtensaoImagem(nomeArquivo) {
  if (!nomeArquivo) return 'CAMPO OBRIGATÓRIO';
  const ext = getExtensao(nomeArquivo);
  if (!extensoesValidas.includes(ext)) {
    return `FORMATO INVÁLIDO! ENVIE UMA IMAGEM COM EXTENSÃO: ${extensoesValidas.join(', ')}`;
  }
  return true;
}
