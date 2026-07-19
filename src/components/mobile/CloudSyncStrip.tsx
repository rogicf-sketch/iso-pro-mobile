import { useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { formatarDataHoraLocal } from '@/src/lib/formatData';
import { buildMobileShellStyles } from '@/src/theme/buildMobileShellStyles';
import { useTheme } from '@/src/theme/ThemeContext';

type Props = {
  configured: boolean;
  loading?: boolean;
  error?: string | null;
  /** Rótulo quando há erro (ex.: falha ao carregar vs sincronizar). */
  errorLabel?: string;
  updatedAt?: string | null;
  pendingLabel?: string;
};

export function CloudSyncStrip({
  configured,
  loading,
  error,
  errorLabel = 'Erro ao sincronizar',
  updatedAt,
  pendingLabel,
}: Props) {
  const { colors } = useTheme();
  const shell = useMemo(() => buildMobileShellStyles(colors), [colors]);

  if (!configured) {
    return (
      <View style={shell.syncStrip}>
        <Text style={shell.syncError}>Supabase não configurado (EXPO_PUBLIC_SUPABASE_…).</Text>
      </View>
    );
  }

  const iconName = error ? 'cloud-alert-outline' : loading ? 'cloud-sync-outline' : updatedAt ? 'cloud-check-outline' : 'cloud-outline';
  const iconColor = error ? colors.err : loading ? colors.warn : colors.accent;

  return (
    <View style={shell.syncStrip}>
      <View style={shell.syncRow}>
        {loading ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : (
          <MaterialCommunityIcons name={iconName} size={20} color={iconColor} />
        )}
        <Text style={shell.syncLabel}>Nuvem</Text>
        <Text style={shell.syncValue}>
          {error
            ? errorLabel
            : loading
              ? pendingLabel ?? 'A carregar snapshot…'
              : updatedAt
                ? `Atualizado ${formatarDataHoraLocal(updatedAt)}`
                : 'Sem dados carregados'}
        </Text>
      </View>
      {error ? <Text style={shell.syncError}>{error}</Text> : null}
    </View>
  );
}
