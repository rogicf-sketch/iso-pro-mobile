import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { appAlert } from '@/src/lib/appDialog';
import { getAtendimentoSessaoGate } from '@/src/lib/atendimentoSessaoGate';
import { getConferenciaSessaoGate } from '@/src/lib/conferenciaSessaoGate';
import { getInventarioSessaoGate } from '@/src/lib/inventarioSessaoGate';

type TabNav = NavigationProp<ParamListBase>;

/**
 * `tabPress` corre no separador **destino**. Este listener deve existir em **todos** os separadores
 * (incl. atendimento e conferência) para intercetar mudanças a partir de qualquer ecrã.
 */
export function tabLeaveGuardTabListeners({ navigation }: { navigation: TabNav }) {
  return {
    tabPress: (e: { preventDefault: () => void; target?: string }) => {
      const state = navigation.getState();
      const current = state.routes[state.index];
      const targetKey = e.target;
      if (!targetKey || targetKey === current.key) return;

      const pressed = state.routes.find((r) => r.key === targetKey);
      if (!pressed) return;

      const gAt = getAtendimentoSessaoGate();
      if (current.name === 'atendimento' && gAt?.hasSessaoAberta()) {
        e.preventDefault();
        appAlert(
          'Atendimento em curso',
          'Ainda há uma sessão aberta: existem baixas neste atendimento que não foram encerradas com «Finalizar sessão — comprovante único». Os registos já estão na nuvem; pode voltar aqui depois para emitir o comprovante.\n\nDeseja mesmo sair deste ecrã?',
          [
            { text: 'Continuar o atendimento', style: 'cancel' },
            {
              text: 'Sair',
              style: 'destructive',
              onPress: () => {
                gAt.limparSessaoLocal();
                navigation.navigate(pressed.name as never);
              },
            },
          ],
        );
        return;
      }

      const gInv = getInventarioSessaoGate();
      if (current.name === 'inventario' && gInv?.temAlteracoesNaoGuardadasNaNuvem()) {
        e.preventDefault();
        appAlert(
          'Contagem incompleta',
          'Há quantidades contadas que ainda não foram guardadas na nuvem com «Guardar na nuvem». Um rascunho é guardado neste telemóvel automaticamente; pode continuar depois.\n\nO que deseja fazer?',
          [
            { text: 'Continuar a contar', style: 'cancel' },
            {
              text: 'Guardar na nuvem e sair',
              onPress: () => {
                void (async () => {
                  const ok = await gInv.guardarNaNuvem();
                  if (ok) navigation.navigate(pressed.name as never);
                })();
              },
            },
            {
              text: 'Sair sem gravar na nuvem',
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  await gInv.persistirRascunhoDispositivo();
                  navigation.navigate(pressed.name as never);
                })();
              },
            },
          ],
        );
        return;
      }

      const gConf = getConferenciaSessaoGate();
      if (current.name === 'conferencia' && gConf?.temAlteracoesNaoGuardadasNaNuvem()) {
        e.preventDefault();
        appAlert(
          'Conferência incompleta',
          'Há alterações nas quantidades que ainda não foram guardadas na nuvem com «Guardar quantidades conferidas». Um rascunho é guardado neste telemóvel automaticamente; pode continuar depois.\n\nO que deseja fazer?',
          [
            { text: 'Continuar a conferir', style: 'cancel' },
            {
              text: 'Guardar na nuvem e sair',
              onPress: () => {
                void (async () => {
                  const ok = await gConf.guardarNaNuvem();
                  if (ok) navigation.navigate(pressed.name as never);
                })();
              },
            },
            {
              text: 'Sair sem gravar na nuvem',
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  await gConf.persistirRascunhoDispositivo();
                  navigation.navigate(pressed.name as never);
                })();
              },
            },
          ],
        );
        return;
      }
    },
  };
}
