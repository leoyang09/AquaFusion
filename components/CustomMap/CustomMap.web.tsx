// Web-only platform file - Metro selects this over CustomMap.tsx when bundling for web.
// react-native-maps is never referenced here, eliminating the native-module compile crash.
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useData } from '@/src/DataContext';
import type { RegisteredDevice } from '@/src/DataContext';

// Helpers
function sondeIdToName(id: string): string {
  const m = id.match(/^sonde_(\w+)$/i);
  if (m) return `Sonde #${m[1]}`;
  return id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Types
type Site = {
  sonde_id: string;
  deviceName: string;
  location_name: string;
  latitude: number;
  longitude: number;
  battery_level: number;
};

const FALLBACK_LAT = 47.6;
const FALLBACK_LNG = -122.3;

function registeredToSite(r: RegisteredDevice): Site {
  return {
    sonde_id: r.sonde_id,
    deviceName: sondeIdToName(r.sonde_id),
    location_name: r.location_name,
    latitude: r.latitude ?? FALLBACK_LAT,
    longitude: r.longitude ?? FALLBACK_LNG,
    battery_level: r.battery_level ?? 100,
  };
}

// Component
export default function CustomMap() {
  const { metricsPerSonde, devicesList } = useData();
  const sites = devicesList.map(registeredToSite);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sites.find((s) => s.sonde_id === selectedId) ?? sites[0] ?? null;

  const selectedMetrics = selected ? metricsPerSonde[selected.sonde_id] : undefined;
  const selectedIsAnomaly = !!selectedMetrics?.isAnomaly;

  const metricGrid = [
    { label: 'Temp',      value: selectedMetrics?.temperature      ?? '-' },
    { label: 'DO',        value: selectedMetrics?.dissolvedOxygen   ?? '-' },
    { label: 'pH',        value: selectedMetrics?.pH                ?? '-' },
    { label: 'Turbidity', value: selectedMetrics?.turbidity         ?? '-' },
    { label: 'Depth',     value: selectedMetrics?.depth             ?? '-' },
    { label: 'Battery',   value: selected ? `${selected.battery_level}%` : '-' },
  ];

  return (
    <LinearGradient colors={['#001C44', '#003B80']} style={styles.gradient}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Map View</Text>
          <View style={styles.webBadge}>
            <Text style={styles.webBadgeText}>Web</Text>
          </View>
        </View>

        {/* Embedded map - <iframe> is a valid DOM element in React Native Web */}
        <View style={styles.mapWrapper}>
          {/* @ts-ignore */}
          <iframe
            src="https://google.com"
            width="100%"
            height="100%"
            style={{ border: 0, borderRadius: 16 }}
            title="AquaFusion Deployment Map"
          />
        </View>

        {/* Selected-Site Detail Card */}
        {selected ? (
          <View style={styles.siteCard}>
            <View style={styles.siteCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.siteName} numberOfLines={1}>
                  {selected.deviceName} - {selected.location_name}
                </Text>
                <Text style={styles.siteSubtitle}>
                  {selectedMetrics ? `Updated ${selectedMetrics.lastUpdate}` : 'Awaiting data...'}
                </Text>
              </View>
              <View
                style={[
                  styles.siteStatusBadge,
                  selectedIsAnomaly ? styles.siteStatusWarning : styles.siteStatusActive,
                ]}
              >
                <View
                  style={[styles.siteStatusDot, { backgroundColor: selectedIsAnomaly ? '#f87171' : '#4ade80' }]}
                />
                <Text style={[styles.siteStatusText, { color: selectedIsAnomaly ? '#f87171' : '#4ade80' }]}>
                  {selectedIsAnomaly ? 'Anomaly' : 'Active'}
                </Text>
              </View>
            </View>

            <View style={styles.metricsGrid}>
              {metricGrid.map((m, i) => (
                <View key={m.label} style={[styles.metricCell, i < 3 && styles.metricCellBorderBottom]}>
                  <Text style={styles.metricCellLabel}>{m.label}</Text>
                  <Text style={styles.metricCellValue}>{m.value}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No devices registered yet.</Text>
            <Text style={styles.emptySubtext}>Add a device on the Devices tab to see it here.</Text>
          </View>
        )}

        {/* Site Selector Pills */}
        {sites.length > 0 && (
          <View style={styles.siteList}>
            {sites.map((site) => {
              const siteAnomaly = !!metricsPerSonde[site.sonde_id]?.isAnomaly;
              const isActive = selected?.sonde_id === site.sonde_id;
              return (
                <TouchableOpacity
                  key={site.sonde_id}
                  onPress={() => setSelectedId(site.sonde_id)}
                  style={[styles.sitePill, isActive && styles.sitePillActive]}
                  activeOpacity={0.75}
                >
                  <View style={[styles.pillDot, { backgroundColor: siteAnomaly ? '#f87171' : '#4ade80' }]} />
                  <Text style={[styles.sitePillText, isActive && styles.sitePillTextActive]}>
                    {site.deviceName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

      </SafeAreaView>
    </LinearGradient>
  );
}

// Styles
const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
  webBadge: {
    backgroundColor: 'rgba(74,158,255,0.15)', borderWidth: 1,
    borderColor: 'rgba(74,158,255,0.35)', paddingHorizontal: 10,
    paddingVertical: 3, borderRadius: 20,
  },
  webBadgeText: { color: '#4a9eff', fontSize: 11, fontWeight: '700' },

  mapWrapper: {
    flex: 1, marginHorizontal: 12,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,20,55,0.6)',
  },

  siteCard: {
    marginHorizontal: 12, marginTop: 10, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', padding: 14,
  },
  siteCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 12, gap: 10,
  },
  siteName: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
  siteSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  siteStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1,
  },
  siteStatusActive: {
    backgroundColor: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.3)',
  },
  siteStatusWarning: {
    backgroundColor: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.3)',
  },
  siteStatusDot: { width: 6, height: 6, borderRadius: 3 },
  siteStatusText: { fontSize: 11, fontWeight: '700' },

  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  metricCell: {
    width: '33.33%', paddingVertical: 8,
    paddingHorizontal: 2, alignItems: 'center',
  },
  metricCellBorderBottom: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  metricCellLabel: {
    fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3,
  },
  metricCellValue: { fontSize: 14, fontWeight: '700', color: '#4a9eff' },

  emptyCard: {
    marginHorizontal: 12, marginTop: 10, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    padding: 24, alignItems: 'center',
  },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  emptySubtext: { color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 4, textAlign: 'center' },

  siteList: {
    flexDirection: 'row', paddingHorizontal: 12,
    paddingBottom: 10, gap: 10, flexWrap: 'wrap',
  },
  sitePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sitePillActive: { backgroundColor: 'rgba(74,158,255,0.2)', borderColor: '#4a9eff' },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  sitePillText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  sitePillTextActive: { color: '#ffffff' },
});
