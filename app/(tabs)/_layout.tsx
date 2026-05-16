import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { tabLeaveGuardTabListeners } from '@/src/lib/tabLeaveGuardListeners';
import { useTheme } from '@/src/theme/ThemeContext';

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.tabBarBg, borderTopColor: colors.tabBarBorder },
        headerStyle: { backgroundColor: colors.headerBg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        listeners={tabLeaveGuardTabListeners}
        options={{
          title: 'Início',
          tabBarLabel: 'Início',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home-variant-outline" color={color} size={size ?? 22} />
          ),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="conferencia"
        listeners={tabLeaveGuardTabListeners}
        options={{
          title: 'Conferência',
          tabBarLabel: 'Conferência',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="clipboard-text-outline" color={color} size={size ?? 22} />
          ),
        }}
      />
      <Tabs.Screen
        name="atendimento"
        listeners={tabLeaveGuardTabListeners}
        options={{
          title: 'Atendimento',
          tabBarLabel: 'Atendimento',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="check-decagram-outline" color={color} size={size ?? 22} />
          ),
        }}
      />
      <Tabs.Screen
        name="consulta"
        listeners={tabLeaveGuardTabListeners}
        options={{
          title: 'Documentos',
          tabBarLabel: 'Documentos',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="file-document-multiple-outline" color={color} size={size ?? 22} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventario"
        listeners={tabLeaveGuardTabListeners}
        options={{
          title: 'Inventário',
          tabBarLabel: 'Inventário',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="clipboard-list-outline" color={color} size={size ?? 22} />
          ),
        }}
      />
    </Tabs>
  );
}
