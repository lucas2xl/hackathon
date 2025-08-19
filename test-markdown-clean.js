// Teste para verificar se a limpeza de markdown está funcionando
// Execute com: node test-markdown-clean.js

// Exemplo de texto com markdown que seria problemático para TTS
const exampleMarkdown = `
## [ABERTURA]

Esta é uma **análise estratégica** de tendências importantes.

### [CENÁRIO 1] - Inteligência Artificial

* Primeiro ponto importante
* Segundo ponto relevante
- Terceiro item

**Implicações**: Esse cenário apresenta oportunidades...

### [CENÁRIO 2] - Tecnologia Financeira

1. Primeiro aspecto
2. Segundo aspecto

_Texto em itálico_ que deve ficar limpo.

\`Código\` que não deveria aparecer.

## [FECHAMENTO]

Esses foram os **principais insights** da semana.
`;

// Função de limpeza (copiada do AudioService para teste)
function cleanMarkdownForAudio(text) {
  let cleaned = text;

  // Remove marcações de markdown
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, ""); // Remove ## ### etc
  cleaned = cleaned.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1"); // Remove **bold** e *italic*
  cleaned = cleaned.replace(/\`([^\`]+)\`/g, "$1"); // Remove \`code\`
  cleaned = cleaned.replace(/\[([^\]]+)\]/g, "$1"); // Remove [texto] mantendo só o texto
  cleaned = cleaned.replace(/^\s*[-*+]\s+/gm, ""); // Remove bullets - * +
  cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, ""); // Remove numeração 1. 2. etc

  // Remove formatações especiais
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1"); // **texto**
  cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1"); // *texto*
  cleaned = cleaned.replace(/_([^_]+)_/g, "$1"); // _texto_

  // Remove quebras de linha extras e espaços
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n"); // Max 2 quebras seguidas
  cleaned = cleaned.replace(/\s{2,}/g, " "); // Max 1 espaço seguido

  // Remove caracteres especiais problemáticos para TTS
  cleaned = cleaned.replace(/[#*\`_~\[\]]/g, ""); // Remove #, *, \`, _, ~, [, ]
  cleaned = cleaned.replace(/^\s*[-=]{3,}\s*$/gm, ""); // Remove linhas separadoras

  // Limpa espaços no início e fim de linhas
  cleaned = cleaned
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  // Remove linhas vazias extras
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, "\n\n");

  return cleaned.trim();
}

console.log("=== TEXTO ORIGINAL ===");
console.log(exampleMarkdown);

console.log("\n=== TEXTO LIMPO PARA ÁUDIO ===");
const cleaned = cleanMarkdownForAudio(exampleMarkdown);
console.log(cleaned);

console.log("\n=== ESTATÍSTICAS ===");
console.log(`Tamanho original: ${exampleMarkdown.length} caracteres`);
console.log(`Tamanho limpo: ${cleaned.length} caracteres`);
console.log(
  `Redução: ${Math.round((1 - cleaned.length / exampleMarkdown.length) * 100)}%`
);

// Verificar se ainda há caracteres problemáticos
const problematicChars = cleaned.match(/[#*\`_~\[\]]/g);
if (problematicChars) {
  console.log(
    `\n⚠️ Ainda há caracteres problemáticos: ${problematicChars.join(", ")}`
  );
} else {
  console.log("\n✅ Texto está limpo para TTS!");
}
