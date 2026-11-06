import fs from 'fs'
import os from 'os'
import path from 'path'
import PizZIP from 'pizzip';
import DocxTemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import { execSync } from 'child_process';

// Função que converte via LibreOffice (para tabelas, bordas e imagens)
function converterComLibreOffice(caminhoDocx, pastaSaida) {
  // Procura o soffice dentro da pasta LibreOfficePortable no diretório do projeto
 // 1. Aponta para o soffice.com (executável para CLI no Windows)
const caminhoPortable = path.join(
  process.cwd(),
  'LibreOfficePortable',
  'App',
  'libreoffice',
  'program',
  'soffice.com'
);

const soffice = fs.existsSync(caminhoPortable) ? `"${caminhoPortable}"` : 'soffice';

// 2. Define uma pasta temporária de perfil para evitar bloqueios de permissão
const tempProfile = path.join(os.tmpdir(), 'lo_user_profile').replace(/\\/g, '/');

// 3. Executa a conversão com a flag de perfil
const cmd = `${soffice} "-env:UserInstallation=file:///${tempProfile}" --headless --convert-to pdf "${caminhoDocx}" --outdir "${pastaSaida}"`;

execSync(cmd);
}

function obterTipoTermo(nomeModelo) {
  if (nomeModelo.includes('_dev.')) return 'TERMO_DE_DEVOLUÇÃO'
  if (nomeModelo.includes('_fer.')) return 'TERMO_DE_FÉRIAS'
  return 'TERMO_DE_RESPONSABILIDADE'
}

/**
 * Gera o .docx a partir do template + dados e converte para PDF.
 * dadosColetados.fotoFrente / fotoVerso podem ser:
 *  - um Buffer (vindo do upload feito no formulário web), OU
 *  - uma string com caminho de arquivo no disco (é o que o server.js passa)
 *
 * Retorna { caminhoDocx, caminhoPdf, pastaTemp, nomeArquivo } em vez de abrir o PDF automaticamente,
 * para que o server.js decida o que fazer com o arquivo (ex: enviar para download no navegador).
 *
 * Sem opções, o modelo é dadosColetados.empresa (os termos). A cautela passa o
 * modelo (caminho dentro de templates/) e o tipo de documento que vai no nome do PDF.
 */
export async function gerarDocumentosWord(dadosColetados, { modelo = dadosColetados.empresa, tipoDocumento = obterTipoTermo(modelo) } = {}) {
  // 1. Carrega o template Word
  const nomeModelo = modelo
  const templatePath = path.resolve('templates', nomeModelo)

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template não encontrado: ${nomeModelo}. Verifique a pasta templates/.`)
  }

  const content = fs.readFileSync(templatePath, 'binary')
  const zip = new PizZIP(content);

  // 2. Configura as imagens (aceita Buffer direto ou caminho no disco)
  const imageOptions = {
    centered: true,
    getImage: (tagvalue) => Buffer.isBuffer(tagvalue) ? tagvalue : fs.readFileSync(tagvalue),
    getSize: () => [240, 320]
  }

  const imageModule = new ImageModule(imageOptions)

  // 3. Renderiza o Word
  const doc = new DocxTemplater(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true
  })

  doc.render(dadosColetados)

  // 4. Salva o .docx
  const buf = doc.getZip().generate({ type: 'nodebuffer' })
  // Na assinatura dupla o arquivo leva os dois nomes (FULANO_E_BELTRANO_TERMO_DE_...).
  const nomeColaborador = ([dadosColetados.name, dadosColetados.name2].filter(Boolean).join(' E ') || 'Colaborador')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
  const tipoTermo = tipoDocumento

  // Os documentos existem somente em uma pasta temporária do sistema durante a
  // conversão e o download. Nunca são armazenados na pasta do projeto.
  const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'termsgen-'))

  const nomeArquivo = `${nomeColaborador}_${tipoTermo}`
  const caminhoDocx = path.join(pastaTemp, `${nomeArquivo}.docx`)
  const caminhoPdf = path.join(pastaTemp, `${nomeArquivo}.pdf`)

  fs.writeFileSync(caminhoDocx, buf)

  // 5. Converte para PDF com layout 100% fiel
  converterComLibreOffice(caminhoDocx, pastaTemp);

  if (!fs.existsSync(caminhoPdf)) {
    throw new Error('A conversão para PDF falhou — verifique se o LibreOffice está instalado/acessível.')
  }

  return { caminhoDocx, caminhoPdf, pastaTemp, nomeArquivo: `${nomeArquivo}.pdf` }
}
