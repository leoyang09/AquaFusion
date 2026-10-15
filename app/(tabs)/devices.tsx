import {
  StyleSheet, ScrollView, View, Text, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import * as Location from 'expo-location';
import { useData } from '@/src/DataContext';
import type { RegisteredDevice } from '@/src/DataContext';
import { supabase } from '@/src/supabase';

// Types
type DeviceStatus = 'active' | 'warning' | 'offline';

type Device = {
  id: string;
  sondeId?: string;
  name: string;
  site: string;
  status: DeviceStatus;
  battery: number;
  signal: 'Strong' | 'Moderate' | 'Weak' | 'None';
  staticLastSeen: string;
  firmware: string;
};

// Helpers
function sondeIdToName(id: string): string {
  const m = id.match(/^sonde_(\w+)$/i);
  if (m) return `Sonde #${m[1]}`;
  return id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function registeredToDevice(r: RegisteredDevice): Device {
  const bat = r.battery_level ?? 100;
  return {
    id: r.sonde_id,
    sondeId: r.sonde_id,
    name: sondeIdToName(r.sonde_id),
    site: r.location_name,
    status: bat === 0 ? 'offline' : bat < 30 ? 'warning' : 'active',
    battery: bat,
    signal: (r.signal ?? 'Strong') as Device['signal'],
    staticLastSeen: 'Awaiting data...',
    firmware: r.firmware ?? 'v3.0.0',
  };
}

function formatLastSeen(tsMs: number, now: number): string {
  const diffMs = now - tsMs;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min${diffMin !== 1 ? 's' : ''} ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} hr${diffH !== 1 ? 's' : ''} ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD} day${diffD !== 1 ? 's' : ''} ago`;
}

const STATUS_CONFIG: Record<DeviceStatus, { label: string; color: string; bg: string; border: string }> = {
  active:  { label: 'Active',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.25)' },
  warning: { label: 'Warning', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.25)' },
  offline: { label: 'Offline', color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)' },
};

// Sub-components
function BatteryBar({ level, status }: { level: number; status: DeviceStatus }) {
  const color = status === 'active' ? '#4ade80' : status === 'warning' ? '#fbbf24' : '#f87171';
  return (
    <View style={styles.battBar}>
      <View style={[styles.battFill, { width: `${level}%` as any, backgroundColor: color }]} />
      <View style={styles.battNub} />
    </View>
  );
}

function SignalStrength({ signal }: { signal: Device['signal'] }) {
  const levels: Record<Device['signal'], number> = { None: 0, Weak: 1, Moderate: 2, Strong: 3 };
  const active = levels[signal];
  return (
    <View style={styles.signalContainer}>
      {[1, 2, 3].map((lvl) => (
        <View
          key={lvl}
          style={[
            styles.signalBar,
            { height: lvl * 5 + 4 },
            lvl <= active ? styles.signalBarActive : styles.signalBarInactive,
          ]}
        />
      ))}
    </View>
  );
}

// Screen
export default function DevicesScreen() {
  const { lastSeenPerSonde, timeTick: _timeTick, devicesList, addDevice } = useData();
  const devices = devicesList.map(registeredToDevice);

  const [modalVisible, setModalVisible] = useState(false);
  const [formSondeId, setFormSondeId] = useState('');
  const [formSite, setFormSite] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const counts = {
    active:  devices.filter((d) => d.status === 'active').length,
    warning: devices.filter((d) => d.status === 'warning').length,
    offline: devices.filter((d) => d.status === 'offline').length,
  };

  function handleClose() {
    if (formSubmitting) return;
    setFormSondeId('');
    setFormSite('');
    setFormError('');
    setModalVisible(false);
  }

  async function handleSubmit() {
    const sid = formSondeId.trim().toLowerCase().replace(/\s+/g, '_');
    const site = formSite.trim();

    if (!sid) { setFormError('Sonde ID is required.'); return; }
    if (!site) { setFormError('Deployment location is required.'); return; }

    setFormError('');
    setFormSubmitting(true);

    // Geocode the location string; fall back to area offsets if unresolvable
    let latitude = 47.6;
    let longitude = -122.3;
    try {
      const results = await Location.geocodeAsync(site);
      if (results.length > 0) {
        latitude = results[0].latitude;
        longitude = results[0].longitude;
      }
    } catch {
      // silently use fallback coordinates
    }

    try {
      const { data, error } = await supabase
        .from('registered_devices')
        .insert([{ sonde_id: sid, location_name: site, latitude, longitude }])
        .select()
        .single();

      if (error) throw error;

      // Append to context state immediately - realtime deduplication handles any subsequent event
      addDevice(data as RegisteredDevice);
      setFormSondeId('');
      setFormSite('');
      setModalVisible(false);
    } catch (err: any) {
      setFormError(err?.message ?? 'Insert failed. Please try again.');
    } finally {
      setFormSubmitting(false);
    }
  }

  return (
    <LinearGradient colors={['#001C44', '#003B80']} style={styles.gradient}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Devices</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{devices.length} Total</Text>
            </View>
          </View>

          {/* Fleet Summary */}
          <View style={styles.summaryRow}>
            {(Object.entries(counts) as [DeviceStatus, number][]).map(([status, count]) => {
              const cfg = STATUS_CONFIG[status];
              return (
                <View key={status} style={[styles.summaryCard, { borderColor: cfg.border, backgroundColor: cfg.bg }]}>
                  <Text style={[styles.summaryCount, { color: cfg.color }]}>{count}</Text>
                  <Text style={[styles.summaryLabel, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              );
            })}
          </View>

          {/* Device Cards */}
          {devices.map((device) => {
            const status = device.status;
            const cfg = STATUS_CONFIG[status];

            const liveTs = device.sondeId ? lastSeenPerSonde[device.sondeId] : undefined;
            const lastSeen = liveTs != null
              ? formatLastSeen(liveTs, Date.now())
              : device.staticLastSeen;
            const battTextColor = status !== 'active' ? cfg.color : 'rgba(255,255,255,0.75)';

            return (
              <TouchableOpacity key={device.id} activeOpacity={0.85} style={styles.deviceCard}>
                <View style={styles.deviceTop}>
                  <View style={styles.deviceIconBox}>
                    <View style={styles.deviceIconInner} />
                    <View style={styles.deviceIconBar} />
                  </View>
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{device.name}</Text>
                    <Text style={styles.deviceSite}>{device.site}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                    <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
                    <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.deviceStats}>
                  <View style={styles.statBlock}>
                    <Text style={styles.statLabel}>Battery</Text>
                    <View style={styles.battRow}>
                      <BatteryBar level={device.battery} status={status} />
                      <Text style={[styles.battPercent, { color: battTextColor }]}>{device.battery}%</Text>
                    </View>
                  </View>
                  <View style={styles.statBlock}>
                    <Text style={styles.statLabel}>Signal</Text>
                    <View style={styles.signalRow}>
                      <SignalStrength signal={device.signal} />
                      <Text style={styles.signalLabel}>{device.signal}</Text>
                    </View>
                  </View>
                  <View style={styles.statBlock}>
                    <Text style={styles.statLabel}>Last Seen</Text>
                    <Text style={[styles.statValue, liveTs ? styles.statValueLive : null]}>
                      {lastSeen}
                    </Text>
                  </View>
                </View>

                <Text style={styles.firmwareText}>FW {device.firmware}</Text>
              </TouchableOpacity>
            );
          })}

          {/* Empty state */}
          {devices.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No devices registered yet.</Text>
              <Text style={styles.emptySubtitle}>Tap below to add your first sonde.</Text>
            </View>
          )}

          {/* Add Device Button */}
          <TouchableOpacity
            style={styles.addBtn}
            activeOpacity={0.8}
            onPress={() => setModalVisible(true)}
          >
            <View style={styles.addBtnIcon}>
              <View style={styles.plusH} />
              <View style={styles.plusV} />
            </View>
            <Text style={styles.addBtnText}>Add New Device</Text>
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>

      {/* Add Device Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView
          style={styles.modalKAV}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Tap outside to dismiss */}
          <TouchableOpacity style={styles.modalDismiss} activeOpacity={1} onPress={handleClose} />

          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />

            <Text style={styles.sheetTitle}>Register New Device</Text>
            <Text style={styles.sheetSubtitle}>Device will appear as Active immediately on submission.</Text>

            <Text style={styles.inputLabel}>Device ID / Sonde ID</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. sonde_07"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={formSondeId}
              onChangeText={setFormSondeId}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!formSubmitting}
            />

            <Text style={styles.inputLabel}>Deployment Location Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. North Inlet"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={formSite}
              onChangeText={setFormSite}
              autoCorrect={false}
              editable={!formSubmitting}
            />

            {formError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            ) : null}

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleClose}
                activeOpacity={0.75}
                disabled={formSubmitting}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, formSubmitting && styles.submitBtnBusy]}
                onPress={handleSubmit}
                activeOpacity={0.8}
                disabled={formSubmitting}
              >
                {formSubmitting
                  ? <ActivityIndicator size="small" color="#ffffff" />
                  : <Text style={styles.submitBtnText}>Add Device</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </LinearGradient>
  );
}

// Styles
const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
  countBadge: {
    backgroundColor: 'rgba(74,158,255,0.15)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  countBadgeText: { color: '#4a9eff', fontSize: 12, fontWeight: '700' },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: {
    flex: 1, borderRadius: 16, borderWidth: 1,
    paddingVertical: 14, alignItems: 'center',
  },
  summaryCount: { fontSize: 26, fontWeight: '800' },
  summaryLabel: { fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'capitalize' },

  deviceCard: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    padding: 16, marginBottom: 12,
  },
  deviceTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  deviceIconBox: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: 'rgba(74,158,255,0.15)', borderWidth: 1,
    borderColor: 'rgba(74,158,255,0.25)', justifyContent: 'center',
    alignItems: 'center', gap: 4,
  },
  deviceIconInner: {
    width: 18, height: 12, borderRadius: 3,
    borderWidth: 2, borderColor: '#4a9eff',
  },
  deviceIconBar: { width: 8, height: 2, backgroundColor: '#4a9eff', borderRadius: 1 },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  deviceSite: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },

  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 14 },

  deviceStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  statBlock: { flex: 1 },
  statLabel: {
    fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
  },
  statValue: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  statValueLive: { color: '#4ade80' },

  battRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  battBar: {
    width: 40, height: 12, borderRadius: 3, borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)', overflow: 'visible', position: 'relative',
  },
  battFill: { height: '100%', borderRadius: 2 },
  battNub: {
    position: 'absolute', right: -5, top: 3,
    width: 3, height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 1,
  },
  battPercent: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },

  signalRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  signalContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  signalBar: { width: 5, borderRadius: 1 },
  signalBarActive: { backgroundColor: '#4ade80' },
  signalBarInactive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  signalLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },

  firmwareText: { fontSize: 10, color: 'rgba(255,255,255,0.25)', textAlign: 'right' },

  emptyState: { alignItems: 'center', paddingVertical: 36 },
  emptyTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '600' },
  emptySubtitle: { color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 4 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: 'rgba(74,158,255,0.4)', borderStyle: 'dashed',
    borderRadius: 16, paddingVertical: 16, marginTop: 4,
    backgroundColor: 'rgba(74,158,255,0.05)',
  },
  addBtnIcon: { width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  plusH: { position: 'absolute', width: 14, height: 2, backgroundColor: '#4a9eff', borderRadius: 1 },
  plusV: { position: 'absolute', width: 2, height: 14, backgroundColor: '#4a9eff', borderRadius: 1 },
  addBtnText: { color: '#4a9eff', fontSize: 15, fontWeight: '700' },

  // Modal
  modalKAV: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalDismiss: { flex: 1 },
  modalSheet: {
    backgroundColor: '#001233',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: 'rgba(74,158,255,0.2)',
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center', marginBottom: 20,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  sheetSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 24 },

  inputLabel: {
    fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: '#ffffff', fontSize: 15, marginBottom: 16,
  },
  errorBox: {
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12,
  },
  errorText: { color: '#f87171', fontSize: 13 },

  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  cancelBtnText: { color: 'rgba(255,255,255,0.55)', fontSize: 15, fontWeight: '600' },
  submitBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#1a5fb4',
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnBusy: { opacity: 0.6 },
  submitBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});
