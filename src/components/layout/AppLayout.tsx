import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useAppStore } from '@/hooks/useAppStore';

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * Teclado no celular (iOS/WKWebView): o teclado não encolhe a janela — só a
 * viewport VISÍVEL (visualViewport). Sem isso o shell `fixed` do chat fica com a
 * altura cheia e o composer some atrás do teclado. Aqui o shell acompanha a área
 * visível (topo + altura). Só em toque; no desktop fica `inset-0`.
 */
function useVisibleViewportBox(enabled: boolean): CSSProperties | undefined {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    if (!enabled || !vv || !touch) { setBox(null); return; }
    // Ao focar o campo, o iOS rola os ancestrais `overflow:hidden` pra mostrar o
    // input — o que empurra o header do chat pra fora. Como o shell já encolheu
    // pra área visível, essa rolagem é desnecessária: desfaz.
    const unscrollAncestors = () => {
      let el = (document.activeElement as HTMLElement | null)?.parentElement ?? null;
      while (el && el !== document.body) {
        if (el.scrollTop && getComputedStyle(el).overflowY === 'hidden') el.scrollTop = 0;
        el = el.parentElement;
      }
    };
    let t: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      // Sempre segue a área visível: sem teclado é igual ao inset-0; com teclado,
      // topo = quanto o iOS rolou (offsetTop) e altura = o que sobrou visível.
      // (No Safari iOS 26 o innerHeight também encolhe, então não dá pra detectar
      // teclado comparando os dois.)
      setBox({ top: vv.offsetTop, height: vv.height });
      unscrollAncestors();
      clearTimeout(t);
      t = setTimeout(unscrollAncestors, 60); // o iOS rola de novo logo após o resize
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { clearTimeout(t); vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, [enabled]);
  return box ? { top: box.top, height: box.height, bottom: 'auto' } : undefined;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { pathname } = useLocation();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const mobileNavOpen = useAppStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen);

  // Fecha o drawer da nav ao trocar de rota (mobile).
  useEffect(() => { setMobileNavOpen(false); }, [pathname, setMobileNavOpen]);

  // Recolhe ao ENTRAR no chat e expande ao SAIR — só na transição, sem brigar
  // com o toggle manual. Na 1ª carga respeita a preferência salva (localStorage).
  const wasChat = useRef<boolean | null>(null);
  useEffect(() => {
    const isChat = pathname.startsWith('/talk');
    if (wasChat.current === null) { wasChat.current = isChat; return; }
    if (isChat !== wasChat.current) {
      setSidebarCollapsed(isChat);
      wasChat.current = isChat;
    }
  }, [pathname, setSidebarCollapsed]);

  // No chat (/talk) o shell é PINADO ao viewport VISÍVEL com `fixed inset-0` —
  // não `h-screen`. Em painel/webview (app Bukowiski) `100vh` pode ser MAIOR que
  // a área visível, jogando o composer abaixo da dobra (e, depois de rolar, o
  // header pra fora do topo). `fixed inset-0` casa exatamente com a janela: header
  // e composer sempre visíveis, zero scroll de documento. Demais páginas seguem
  // com padding + min-h-screen (rolam quando o conteúdo é longo).
  const isChat = pathname.startsWith('/talk');
  // Demandas (Kanban) é "altura cheia" como o chat: ocupa a viewport e rola por
  // dentro (colunas), sem scroll de página. Demais páginas rolam normalmente.
  const isBoard = pathname.startsWith('/demands');
  const isFull = isChat || isBoard;
  const kbBox = useVisibleViewportBox(isFull);
  return (
    <div className={isFull ? 'fixed inset-0 flex overflow-hidden' : 'flex min-h-screen'} style={kbBox}>
      <Sidebar />
      {/* Backdrop do drawer da nav (só mobile) */}
      {mobileNavOpen && (
        <div onClick={() => setMobileNavOpen(false)} className="fixed inset-0 bg-black/55 z-[55] md:hidden" />
      )}
      {/* Em mobile o conteúdo ocupa a tela toda (ml-0); margem só vale no desktop. */}
      {/* Sidebar flutua com 10px de margem no desktop → o conteúdo começa 10px depois da largura dela. */}
      <main className={`flex-1 min-w-0 flex flex-col transition-[margin] duration-200 ml-0 ${collapsed ? 'md:ml-[74px]' : 'md:ml-[254px]'} ${isFull ? 'h-full min-h-0 overflow-hidden' : 'min-h-screen'}`}>
        {/* Páginas não-chat: hamburger flutuante pra abrir a nav (o chat tem o seu no header). */}
        {!isChat && (
          <button onClick={() => setMobileNavOpen(true)} className="md:hidden fixed top-3 left-3 z-[45] w-9 h-9 rounded-lg bg-surface-2/90 border border-default text-creme-mute hover:text-creme backdrop-blur flex items-center justify-center shadow-lg" title="Menu">
            <Menu size={18} />
          </button>
        )}
        {/* Páginas do sistema (não-chat) ganham um zoom leve pra ficar legíveis como o
            chat — o chat já usa tipografia grande, então fica de fora.
            pt-16 (só celular) abre espaço pro hamburger flutuante não cobrir o título em mobile. */}
        {/* `key={pathname}` remonta o wrapper a cada rota → a entrada (.page-enter) toca de novo. */}
        <div key={isChat ? 'chat' : pathname} className={
          isChat ? 'flex-1 min-h-0 flex flex-col'
          : isBoard ? 'flex-1 min-h-0 flex flex-col overflow-hidden md:[zoom:1.1] page-enter'
          : 'flex-1 px-4 pt-16 pb-6 md:p-6 md:[zoom:1.1] page-enter'
        }>{children}</div>
      </main>
    </div>
  );
}
