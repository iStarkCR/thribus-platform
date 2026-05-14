/**
 * Cortex Enterprise — Módulo Talki.
 *
 * Status: PREVIEW. Schema do banco está pronto (cortex_talki_threads/messages),
 * mas o runtime de chat real (real-time, presença, notificações) virá em
 * uma versão futura. Por ora, o módulo aparece registrado e a UI pode
 * mostrar como "em breve" / "preview disponível por API".
 */

import type { ModuleDefinition } from './types.js';

export const talkiModule: ModuleDefinition = {
  id: 'talki',
  name: 'Talki',
  slug: 'talki',
  description:
    'Chat colaborativo entre humanos e agentes IA. Threads, mensagens, attachments e bots integrados aos agentes Cortex.',
  category: 'comms',
  version: '0.1.0-preview',
  status: 'preview',
  icon: 'MessageSquare',
  tags: ['chat', 'colaboração', 'agentes'],
  // Sem buildRouter — UI mostra como preview.
};
