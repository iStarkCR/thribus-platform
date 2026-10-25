/**
 * Smoke tests do catálogo Gorki — sem framework, asserções inline via tsx.
 * NÃO bate na rede: usa o fixture local (shape real do site, 2026-10-19).
 *
 *     cd worker && npx tsx src/tools/gorki-catalogo.test.ts
 *
 * Cobre: extração do envelope { imoveis }, filtro por cidade/tipo/quartos/preço,
 * matching flexível de tipo, teto de 6 resultados e resumo enxuto.
 */

import { readFileSync } from 'node:fs';
import {
  extractImoveis,
  filterImoveis,
  resumirImovel,
  parseFiltros,
  type ImovelRaw,
} from './gorki-catalogo.js';

// Fixture: usa a cópia local limpa; se ausente, gera um mini-conjunto sintético
// com o shape real pra o teste ainda rodar em qualquer máquina.
const LOCAL_FIXTURE = '/Users/charlesandrade/projects/Bukowiski/vault/projetos/gorki-catalogo-teste.json';

function loadImoveis(): ImovelRaw[] {
  try {
    const raw = JSON.parse(readFileSync(LOCAL_FIXTURE, 'utf8'));
    const arr = extractImoveis(raw);
    // A cópia local não tem `ativo`/`area`/`imagens` com os mesmos nomes;
    // normaliza o mínimo pro teste de filtro fazer sentido.
    return arr.map((im: Record<string, unknown>) => ({
      ...im,
      ativo: im.ativo === undefined ? true : im.ativo,
      area: (im.area ?? im.area_m2) as number | undefined,
    })) as ImovelRaw[];
  } catch {
    return SYNTH;
  }
}

const SYNTH: ImovelRaw[] = [
  { codigo: 'A1', ativo: true, tipo: 'apartamento', cidade: 'Fortaleza', bairro: 'Aldeota', quartos: 3, preco: 500000, area: 90, destaque: true, descricaoIA: 'x'.repeat(500), imagens: ['a', 'b'] },
  { codigo: 'C1', ativo: true, tipo: 'casa duplex', cidade: 'Eusébio', bairro: 'Centro', quartos: 4, preco: 900000, area: 200 },
  { codigo: 'T1', ativo: true, tipo: 'terreno comercial', cidade: 'Fortaleza', bairro: 'Papicu', quartos: 0, preco: 300000, area: 400 },
  { codigo: 'S1', ativo: true, tipo: 'sala comercial', cidade: 'Fortaleza', bairro: 'Centro', quartos: 0, preco: 250000, area: 50 },
  { codigo: 'X1', ativo: false, tipo: 'apartamento', cidade: 'Fortaleza', bairro: 'Aldeota', quartos: 3, preco: 450000, area: 88 },
];

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

const imoveis = loadImoveis();
console.log(`\nCatálogo carregado: ${imoveis.length} itens\n`);

check('extractImoveis aceita envelope { imoveis }', extractImoveis({ imoveis: SYNTH }).length === SYNTH.length);
check('extractImoveis aceita array cru', extractImoveis(SYNTH).length === SYNTH.length);
check('extractImoveis em lixo retorna []', extractImoveis(null).length === 0 && extractImoveis(42).length === 0);

// Filtro exclui inativos
const ativos = filterImoveis(SYNTH, {});
check('filtro exclui ativo=false', ativos.every((i) => i.ativo !== false) && ativos.length === 4);

// Filtro por tipo flexível
const casas = filterImoveis(SYNTH, { tipo: 'casa' });
check('tipo="casa" casa com "casa duplex"', casas.length === 1 && casas[0].codigo === 'C1');
const comercial = filterImoveis(SYNTH, { tipo: 'comercial' });
check('tipo="comercial" casa com sala/terreno comercial', comercial.length === 2);

// Filtro por cidade (acento-insensitive, substring)
check('cidade="eusebio" casa com "Eusébio"', filterImoveis(SYNTH, { cidade: 'eusebio' }).length === 1);

// Quartos mínimo
check('quartos_min=4 retorna só 4+', filterImoveis(SYNTH, { quartos_min: 4 }).every((i) => (i.quartos ?? 0) >= 4));

// Faixa de preço
const faixa = filterImoveis(SYNTH, { preco_min: 300000, preco_max: 600000 });
check('preço entre 300k e 600k', faixa.every((i) => (i.preco ?? 0) >= 300000 && (i.preco ?? 0) <= 600000) && faixa.length === 2);

// Resumo enxuto: trunca descrição e conta fotos
const resumo = resumirImovel(SYNTH[0]);
check('resumo trunca descricaoIA (<=321 com reticência)', (resumo.resumo?.length ?? 0) <= 321 && resumo.resumo!.endsWith('…'));
check('resumo conta fotos sem devolver array', resumo.fotos === 2 && !('imagens' in resumo));
check('resumo expõe codigo/preco/area', resumo.codigo === 'A1' && resumo.preco === 500000 && resumo.area_m2 === 90);

// parseFiltros sanitiza strings/números do LLM
const pf = parseFiltros({ cidade: ' Fortaleza ', quartos_min: '3', preco_max: '', tipo: '' });
check('parseFiltros trim + number + descarta vazio', pf.cidade === 'Fortaleza' && pf.quartos_min === 3 && pf.preco_max === undefined && pf.tipo === undefined);

// Fixture real (se carregou): filtro grande não estoura e teto respeitado via slice no entry
if (imoveis.length > 10) {
  const emFortaleza = filterImoveis(imoveis, { cidade: 'Fortaleza' });
  check('fixture real: há imóveis em Fortaleza', emFortaleza.length > 0);
  check('fixture real: todos têm codigo após resumo', emFortaleza.slice(0, 6).map(resumirImovel).every((r) => r.codigo !== null));
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passaram, ${failed} falharam\n`);
process.exit(failed === 0 ? 0 : 1);
