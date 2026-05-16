import { Alert } from 'react-native';

/** Compatível com o 3.º argumento de `Alert.alert`. */
export type AppDialogButton = {
  text?: string;
  onPress?: () => void | Promise<void>;
  style?: 'default' | 'cancel' | 'destructive';
};

export type AppDialogPayload = {
  title: string;
  message: string;
  buttons: AppDialogButton[];
};

type ShowFn = (p: AppDialogPayload) => void;

let showImpl: ShowFn | null = null;

export function registerAppDialog(impl: ShowFn | null) {
  showImpl = impl;
}

/**
 * Diálogo alinhado ao tema da app (substitui o `Alert` nativo cinzento).
 * Se o anfitrião ainda não montou, faz fallback para `Alert.alert`.
 */
export function appAlert(title: string, message?: string, buttons?: AppDialogButton[]): void {
  const normalized: AppDialogButton[] =
    buttons && buttons.length > 0
      ? buttons.map((b) => ({
          text: b.text ?? 'OK',
          onPress: b.onPress,
          style: b.style ?? 'default',
        }))
      : [{ text: 'OK', style: 'default' }];

  if (showImpl) {
    showImpl({ title, message: message ?? '', buttons: normalized });
    return;
  }

  Alert.alert(
    title,
    message,
    normalized.map((b) => ({
      text: b.text,
      onPress: b.onPress,
      style: b.style,
    })),
  );
}
