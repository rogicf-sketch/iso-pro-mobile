import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Tone = 'pending' | 'blocked' | 'brand';

type Props = {
  tone: Tone;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  textColor: string;
};

const toneColors: Record<Tone, { ring: string; icon: string; bg: string }> = {
  pending: { ring: '#f59e0b', icon: '#fbbf24', bg: 'rgba(245, 158, 11, 0.12)' },
  blocked: { ring: '#ef4444', icon: '#f87171', bg: 'rgba(239, 68, 68, 0.12)' },
  brand: { ring: '#38bdf8', icon: '#7dd3fc', bg: 'rgba(56, 189, 248, 0.1)' },
};

export function StatusHero({ tone, icon, title, textColor }: Props) {
  const c = toneColors[tone];
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <View style={[styles.ring, { borderColor: c.ring, backgroundColor: c.bg }]}>
        <MaterialCommunityIcons name={icon} size={40} color={c.icon} />
      </View>
      <Text style={[styles.heading, { color: textColor }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginBottom: 18, gap: 14 },
  ring: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
});
