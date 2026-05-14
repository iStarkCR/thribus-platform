# Casos Positivos — Bianca × Geogrid

> Registro de casos onde a Bianca consultou viabilidade via Geogrid e o sistema
> retornou cobertura confirmada. Usado como evidência de funcionamento da
> integração + pipeline pré-validado pra time comercial trabalhar.

---

## 📊 Resumo

| Métrica | Valor |
|---|---:|
| Total de casos registrados | 4 |
| Endereços com cobertura confirmada | 4 |
| Endereços com porta livre (atendíveis imediatos) | 1 |
| Endereços sem porta livre (demanda mapeada) | 3 |
| Endereços sem cobertura | 0 |

### Regiões com demanda reprimida (CTO sem capacidade)

| Bairro / Cidade | Casos | CTOs Identificadas |
|---|---:|---|
| Vicente Pinzon / Fortaleza | 1 | ELISABETH DE FRANCA DO NASCIMENTO |
| Caucaia (Jurema) | 1 | PT8289 |
| Caucaia (Potira) | 1 | PT7647 |

### Regiões com capacidade plena (atendimento imediato)

| Bairro / Cidade | Casos | CTOs Identificadas |
|---|---:|---|
| Próximo a Av. Osório de Paiva / Fortaleza | 1 | ESP PON2 CX10 (12 portas livres) |

---

## 🗂️ Histórico de casos

### Caso #1 — 14/05/2026 · Rua Do Tamarindo, 64

**Cliente:** Ana (lead capturado via WhatsApp, atendido pela Bianca)
**Telefone:** 558599340984
**Origem:** Canal `texnet-duall` (TexNet WhatsApp)
**Estado da conversa:** Coletou endereço e idade

#### Endereço fornecido pelo cliente
```
Rua Do Tamarindo, 64
Vicente Pinzon — Fortaleza/CE
CEP 60181-110
```

#### Consulta ao Geogrid

**Request enviado:**
```json
POST https://n8n.thribustech.com/webhook/consulta-viabilidade
{
  "query": "Rua Do Tamarindo, 64, Vicente Pinzon, CEP 60181-110"
}
```

**Response do Geogrid:**
```json
{
  "output": "COBERTURA DISPONÍVEL. 1 ponto(s). Mais próximo: ELISABETH DE FRANCA DO NASCIMENTO (PROVEDOR) a 117.03m com 0 porta(s) livre(s)."
}
```

#### Análise do resultado

| Item | Valor | Status |
|---|---|---|
| Cobertura na área | ✅ Sim | OK |
| CTO mais próxima | ELISABETH DE FRANCA DO NASCIMENTO | OK |
| Distância | 117,03 m | OK |
| **Portas livres na CTO** | **0** | ⚠️ Lotada |

#### Conclusão

- ✅ **Integração Bianca ↔ Geogrid funcionou corretamente** — consulta enviada, resposta recebida, dados extraídos
- ✅ **Endereço atendível tecnicamente** — rede óptica chega no local
- ⚠️ **Bloqueio operacional** — CTO mais próxima está sem porta livre (lotada). Instalação requer expansão de capacidade ou aguardar liberação de porta.

#### Próxima ação sugerida

Time comercial pode:
- Confirmar com cliente o interesse e cadastrar como lead qualificado em espera
- Solicitar análise de expansão de CTO no Vicente Pinzon (demanda mapeada)
- Acompanhar liberação de porta na CTO ELISABETH DE FRANCA DO NASCIMENTO

### Caso #2 — 14/05/2026 · Rua Jorge Guimarães Almeida, 179

**Cliente:** Geziane Silva (lead capturado via WhatsApp, atendido pela Bianca)
**Telefone:** 558588492174
**Origem:** Canal `texnet-duall` (TexNet WhatsApp)
**Estado da conversa:** Cliente perguntou se atende Caucaia, mandou endereço + CEP

#### Endereço fornecido pelo cliente
```
Rua Jorge Guimarães Almeida, 179, casa A
Caucaia/CE (Jurema)
CEP 61650-050
```

#### Consulta ao Geogrid

**Request enviado:**
```json
POST https://n8n.thribustech.com/webhook/consulta-viabilidade
{
  "query": "Rua Jorge Guimarães Almeida, 179, casa A, CEP 61650-050"
}
```

**Response do Geogrid:**
```json
{
  "output": "COBERTURA DISPONÍVEL. 1 ponto(s). Mais próximo: PT8289 a 85.05m com 0 porta(s) livre(s)."
}
```

#### Análise do resultado

| Item | Valor | Status |
|---|---|---|
| Cobertura na área | ✅ Sim | OK |
| CTO mais próxima (técnica) | PT8289 | OK |
| Distância | 85,05 m | OK |
| **Portas livres na CTO** | **0** | ⚠️ Lotada |

#### ⚠️ Nuance importante — Mapa visual vs Webhook

Ao abrir o **mapa do Geogrid** pra confirmar manualmente, aparece outra CTO marcada em **vermelho**:

- **Mapa visual** → mostra `PT30048` como ponto **geograficamente** mais próximo, marcado em vermelho com etiqueta "Sem viabilidade".
- **Webhook `consulta-viabilidade`** → ignora CTOs sem viabilidade e retorna a mais próxima COM cobertura técnica certificada: `PT8289` a 85m.

**Implicação operacional:**

> Quando o time humano receber escalação com motivo `"Verificar disponibilidade de porta — CTO sem capacidade no momento"`, **NÃO descartar como "Sem viabilidade" só de olhar o mapa**. O webhook já filtrou pelas CTOs atendíveis. O endereço **é atendível** — está aguardando liberação de porta na CTO retornada (PT8289 nesse caso).

#### Conclusão

- ✅ **Integração Bianca ↔ Geogrid funcionou corretamente** — consulta enviada, resposta recebida com a CTO atendível certa (não a mais próxima visualmente)
- ✅ **Endereço atendível tecnicamente** via PT8289 (rede óptica certificada)
- ⚠️ **Bloqueio operacional** — CTO PT8289 sem porta livre. Cliente vira demanda mapeada pra:
  - Liberação de porta (cancelamento/migração de outro cliente)
  - Expansão de capacidade da PT8289
  - Eventual nova CTO se a região continuar crescendo

#### Próxima ação sugerida

Time comercial pode:
- Cadastrar Geziane como lead qualificado em espera (Caucaia / Jurema)
- Somar com outros casos do bairro pra justificar expansão de capacidade
- Monitorar liberação de porta na CTO PT8289

### Caso #3 — 14/05/2026 · Rua Paracatu, 143

**Cliente:** "Deus é fiel 😇🙏" (lead WhatsApp, atendido pela Bianca)
**Telefone:** 558591877840
**Origem:** Canal `texnet-duall`
**Estado da conversa:** Cliente perguntou plano e mandou endereço

#### Endereço fornecido pelo cliente
```
Rua Paracatu, 143
Potira — Caucaia/CE
```

#### Consulta ao Geogrid — comportamento inconsistente por formatação

⚠️ **Bug observado:** o Geogrid retornou resultados diferentes dependendo da formatação da query:

| Formato da query | Output |
|---|---|
| `"Rua paracatu número 143 potira caucaia"` (literal do cliente) | `ENDERECO_NAO_LOCALIZADO` |
| `"Rua Paracatu, 143, Potira, Caucaia"` | `SEM COBERTURA` |
| `"Rua Paracatu, 143, Potira, Caucaia, CE"` | `COBERTURA DISPONÍVEL · 2 pontos · PT7647 a 192,4m · 0 porta(s) livre(s)` |
| `"Rua Paracatú, 143, Potira"` (com acento) | `ENDERECO_NAO_LOCALIZADO` |

**Resultado real (com query mais completa):**
```
COBERTURA DISPONÍVEL. 2 ponto(s).
Mais próximo: PT7647 a 192,4m com 0 porta(s) livre(s).
```

#### Análise do resultado

| Item | Valor | Status |
|---|---|---|
| Cobertura na área | ✅ Sim | OK |
| CTO mais próxima | PT7647 | OK |
| Distância | 192,4 m | OK |
| **Portas livres** | **0** | ⚠️ Lotada |
| **Inconsistência Geogrid** | Resposta varia por formatação da query | ⚠️ Bug |

#### Conclusão

- ✅ Endereço atendível tecnicamente via PT7647
- ⚠️ **Terceira CTO em Caucaia identificada sem porta livre** — confirma concentração de demanda na região, sugere expansão de rede
- 🐛 **Bug do Geogrid** — sensibilidade à formatação gera respostas conflitantes. Sugestão pra time TexNet: investigar normalização de query no webhook `consulta-viabilidade`

#### Próxima ação sugerida

- Time comercial: cadastrar como lead qualificado em espera (Caucaia / Potira)
- Time técnico: avaliar PT7647 pra possível expansão
- Time TexNet: investigar inconsistência do Geogrid por formatação

---

### Caso #4 — 14/05/2026 · Rua João Ramalho, 1191 ✅ ATENDÍVEL IMEDIATO

**Cliente:** Ana Jéssica (lead WhatsApp, atendido pela Bianca)
**Telefone:** 558599981961
**Origem:** Canal `texnet-duall`
**Estado da conversa:** Coletou CEP, número, rua, e finalidade de uso (jogos)

#### Endereço fornecido pelo cliente
```
Rua João Ramalho, 1191
Próximo à Av. Osório de Paiva
CEP 60730-290 — Fortaleza/CE
```

#### Consulta ao Geogrid

**Request:**
```json
POST https://n8n.thribustech.com/webhook/consulta-viabilidade
{
  "query": "Rua João Ramalho, 1191, CEP 60730-290, próximo a avenida Osório de Paiva"
}
```

**Response:**
```json
{
  "output": "COBERTURA DISPONÍVEL. 7 ponto(s). Mais próximo: ESP PON2 CX10 a 197.04m com 12 porta(s) livre(s)."
}
```

#### Análise do resultado

| Item | Valor | Status |
|---|---|---|
| Cobertura na área | ✅ Sim | OK |
| Pontos disponíveis | 7 | OK (alta densidade) |
| CTO mais próxima | ESP PON2 CX10 | OK |
| Distância | 197,04 m | OK |
| **Portas livres** | **12** | ✅ Disponível |

#### Conclusão

- 🎉 **PRIMEIRO CASO 100% ATENDÍVEL** do log — rede chega + CTO com capacidade plena
- ✅ Cliente pode ser cadastrada e agendar instalação imediata
- ✅ 7 pontos de cobertura na região indicam infraestrutura sólida
- ✅ 12 portas livres na CTO ESP PON2 CX10 — sem gargalo operacional

#### Próxima ação sugerida

Time comercial pode prosseguir com cadastro e agendamento **sem necessidade de validação técnica adicional**. Caso ideal: Bianca → cadastro → contrato → agendamento → instalação.

---

## 📝 Notas operacionais

- **Geogrid retorna "COBERTURA DISPONÍVEL" mesmo com 0 portas livres** — tecnicamente correto (rede chega), mas operacionalmente bloqueante. Time deve sempre verificar campo `porta(s) livre(s)` antes de confirmar instalação.

- **Bianca agora detecta `0 porta(s) livre(s)`** (fix aplicado em 14/05/2026, prompt v3.2): quando vier esse cenário, envia mensagem amigável ("capacidade reservada") e escala automático com motivo `"Verificar disponibilidade de porta — CTO sem capacidade no momento"`.

- **Mapa visual vs webhook podem mostrar CTOs diferentes** — o mapa mostra a mais próxima geograficamente (pode estar marcada "Sem viabilidade"); o webhook filtra e retorna a mais próxima COM viabilidade técnica. Sempre seguir o que o webhook retornou — é a CTO certificada pra atender o endereço.

- **Demanda mapeada vira inteligência comercial** — concentração de casos com "CTO sem porta" num bairro vira input pro time decidir onde priorizar expansão de rede.

- 🐛 **Bug do Geogrid — sensibilidade à formatação** (caso #3): pequenas variações na query (acento, ordem das palavras, presença de "CE/CEP") retornam resultados conflitantes (`SEM COBERTURA` ↔ `ENDERECO_NAO_LOCALIZADO` ↔ `COBERTURA DISPONÍVEL`). Sugestão pra time TexNet: investigar normalização no webhook `consulta-viabilidade` (lowercase + remover acentos + ordenar tokens) pra garantir resposta consistente.

- 📈 **Tendência observada (4 casos)** — 3/4 com CTO lotada (75%) indica que a Texnet está atendendo regiões onde infraestrutura está no limite. Demanda existe, é só viabilizar a expansão de capacidade. O 1 caso com 12 portas livres (Caso #4) mostra que **quando há infra, o funil flui sem fricção**.

---

*Documento gerado automaticamente · Thribus Tech Soluções Corporativas · Colaboradores Digitais*
