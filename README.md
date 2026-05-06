# Thribus Agents — Colaboradores Digitais

Painel de gestão dos Colaboradores Digitais da Thribus Tech.

## Stack

- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS 3** (design tokens Thribus)
- **Zustand** (estado global)
- **Lucide React** (ícones SVG)
- **React Router 6** (navegação SPA)

## Setup

```bash
git clone <repo-url>
cd thribus-agents
npm install
cp .env.example .env
npm run dev
```

Acesse `http://localhost:3100`

## Estrutura

```
src/
├── components/
│   ├── layout/        # Sidebar, Header, AppLayout
│   ├── agents/        # AgentCard, modais de CRUD
│   ├── shared/        # Modal, ToastContainer
│   └── tools/         # (futuro)
├── pages/             # Páginas de rota
├── services/          # API layer (integração backend)
├── hooks/             # Zustand store
├── types/             # TypeScript interfaces
├── lib/               # Seed data, helpers
└── styles/            # Tailwind globals
```

## Integração com Backend

Todos os endpoints estão centralizados em `src/services/api.ts`.
Cada método tem um `// TODO:` indicando a chamada real.

Para conectar ao backend, basta:
1. Definir `VITE_API_URL` no `.env`
2. Descomentar as chamadas `request<T>()` em `api.ts`
3. Remover os retornos de seed data

## Próximos passos

- [ ] Conectar API real (Supabase Edge Functions ou servidor dedicado)
- [ ] Página de Conversas (integração Talki/Chatwoot)
- [ ] Analytics com dados reais
- [ ] Logs de execução com replay
- [ ] Gestão de Clientes
- [ ] Auth + multi-tenancy
