# Rollout Checklist — Aplicar tudo que foi mergeado hoje

Esta sessão fechou 9 PRs em `develop`. Esse doc cobre os passos pra **levar todas as mudanças pra produção** + criar um ambiente staging real.

## 📦 O que está em `develop` (não em prod ainda)

| PR | Mudança | Como entra em prod |
|---|---|---|
| #32 | Fix prompt Bianca (relax CEP + condomínio + escalação limpa) | ✅ **Já aplicado** — SQL rodou direto no Supabase prod |
| #33 | Preflight no dispatcher (validação determinística) | ⏳ **Deploy do worker** |
| #34 | M3 runtime (skill loader gated) | ⏳ **Deploy do worker** + flag `M3_SKILLS_ENABLED=true` (já está) + schema |
| #36 | UI `/skills` (catálogo + install) | ⏳ **Deploy do painel** |
| #37 | Skill v1.1.0 alinhada | Vai junto com migration M3 |
| #38 | PostgREST self-hosted | ✅ **Já no ar** em `pg-staging.thribustech.com` |
| #39 | UI métricas + configurações com dados reais | ⏳ **Deploy do painel** |

## 🚀 Sequência de rollout

### 1. Deploy do worker em prod (5 min)

> **Quem faz:** você no Coolify

1. Abrir Coolify → **Thribus Tech** → **production** → **Thribus Agentes**
2. Clicar em **Redeploy**
3. Aguardar build + container subir (vai aparecer "Running healthy")
4. Validar via logs:
   ```bash
   ssh -i ~/.ssh/thribus_vps root@147.93.131.93 \
     "docker logs --tail 30 \$(docker ps -q --filter name=app-ew008gs00wk8gosgggwc408s)"
   ```
   Esperado: `Thribus Sales running on http://localhost:3000` + nenhum erro de auth.

**O que muda na Bianca prod após o deploy:**
- ✅ Preflight ativo: `consultar_viabilidade` recusa endereços insuficientes ANTES de chamar Geogrid
- ⏸️ M3 ainda no-op: a flag `M3_SKILLS_ENABLED=true` já está, mas o schema não — skill-loader degrada silenciosamente (esperado)

### 2. Deploy do painel admin (5 min)

> **Quem faz:** você (Netlify/Vercel/onde estiver hospedado)

Se o painel usa CI automático no merge: já está deployando.
Se manual: trigger build no provedor.

**O que muda no painel após o deploy:**
- `/analytics` agora mostra KPIs reais (custo LLM, top tools, gráfico 7d)
- `/settings` mostra workspace ativo + status de integrações + backup info
- `/skills` aparece no menu (catálogo das skills disponíveis)
- `/conversations` removido (não era usado)

### 3. M3 em prod — ativar skills (2 min)

> **Quem faz:** você no SQL Editor do Supabase managed

> ⚠️ **TOCA PROD**. Confirma comigo antes se quiser que eu acompanhe.

1. Abrir Supabase → SQL Editor → New Query
2. Colar o conteúdo de `scripts/sql/rollout-m3-prod.sql`
3. Run
4. Conferir o `status_final` no fim — deve dizer:
   ```
   ✅ M3 prod ATIVO — Bianca tem skill consulta-viabilidade-isp habilitada
   ```

**O que muda na Bianca prod:**
- Próximo turno (sem restart) já carrega o `prompt_fragment` da skill
- O `system_prompt` final fica: `[base prompt] + [stateReminder] + [skill fragment]`
- A skill **reforça as mesmas regras** que já estão no prompt base + adiciona o tratamento explícito de condomínio + retry 2x

**Rollback (se algo zoar):** 1 SQL desativa sem deletar:
```sql
update agent_skills set enabled = false
where agent_id = (select id from agents where name ilike 'bianca%' limit 1);
```

### 4. Bianca staging real (1-2h)

> **Quem faz:** nós dois — você roda os SQLs, eu acompanho

> ⚠️ **Trabalho mais grosso.** Pode deixar pra outra sessão se preferir manter foco em prod hoje.

1. Seguir `scripts/sql/clone-bianca-to-staging.sql` (4 etapas detalhadas no arquivo)
2. ETAPA 1: rodar no Supabase prod, copiar saída
3. ETAPA 2: rodar no thribus_staging via thribus-pg
4. ETAPA 3: instalar skill na Bianca staging
5. ETAPA 4: criar Service worker staging no Coolify apontando pra `pg-staging.thribustech.com`

**Ganho:** ambiente completo de homologação onde você pode testar M3 (e qualquer mudança futura) **sem afetar a Bianca prod**.

## 🔍 Validação pós-rollout

Após cada passo, rode esses smoke tests:

### Após deploy do worker
```bash
# Logs limpos?
ssh -i ~/.ssh/thribus_vps root@147.93.131.93 \
  "docker logs --tail 50 \$(docker ps -q --filter name=app-ew008gs00wk8gosgggwc408s) 2>&1 | grep -iE 'error|fail|preflight'"
```

### Após M3 em prod
- Mandar uma mensagem de teste pelo WhatsApp pra Bianca com endereço bom (ex: "Avenida X, 600, Maracanaú")
- Verificar que ela chama `consultar_viabilidade` direto sem pedir CEP
- Em caso de bom funcionamento, mandar endereço de condomínio ("Bloco 5 apto 12, Aracapé") — deve tentar 1x e escalar

### Verificação contínua (skill aplicada)
```sql
-- No Supabase managed, ver as skills habilitadas em cada agente
select a.name, s.slug, s.version, ag.enabled
from agent_skills ag
join agents a on a.id = ag.agent_id
join skills s on s.id = ag.skill_id
order by a.name;
```

## 🎯 Marcos do M3

- [x] Schema migrado em staging (thribus_staging)
- [ ] Schema migrado em prod (Supabase managed) — **passo 3 acima**
- [x] Worker code (skill-loader) em develop
- [ ] Worker deployado com skill-loader ativo — **passo 1 acima**
- [x] UI catálogo (`/skills`) em develop
- [ ] UI deployada — **passo 2 acima**
- [x] Skill `consulta-viabilidade-isp` v1.1.0 alinhada
- [ ] Skill instalada na Bianca prod — **passo 3 acima**
- [ ] Bianca staging real (clone) — **passo 4 acima** (opcional mas recomendado)

---

## 🔮 Pra próxima sessão

- **GoTrue** (auth de usuários) — sessão dedicada de 1-2h
- **Próximo cliente** — depende de qual cliente vem primeiro
- **Onboarding fluxo completo** — usar template + skill empacotada pra criar agent novo em 10min
- **Métricas avançadas** — dashboards com BI (cohort, funil de conversão)
