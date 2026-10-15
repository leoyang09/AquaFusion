import { StyleSheet, ScrollView, View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useData, EMPTY_METRICS } from '@/src/DataContext';
import type { SondeId, MetricsState } from '@/src/DataContext';

// Sonde display config
type SondeConfig = { id: string; label: string; site: string; device: string };

function sondeIdToName(id: string): string {
  const m = id.match(/^sonde_(\w+)$/i);
  if (m) return `Sonde #${m[1]}`;
  return id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Per-sensor threshold evaluation
type SensorStatus = { label: string; color: string; bg: string };

const STATUS_OK:   SensorStatus = { label: 'Optimal',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)' };
const STATUS_WARN: SensorStatus = { label: 'Marginal',  color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' };
const STATUS_CRIT: SensorStatus = { label: 'Critical',  color: '#f87171', bg: 'rgba(248,113,113,0.12)' };
const STATUS_NONE: SensorStatus = { label: 'No Data',   color: '#6b7280', bg: 'rgba(107,114,128,0.10)' };

function tempStatus(v: number | null | undefined): SensorStatus {
  if (v == null || !isFinite(v)) return { ...STATUS_NONE };
  if (v >= 22 && v <= 25) return { ...STATUS_OK };
  if (v >= 15 && v <= 28) return { ...STATUS_WARN, label: 'Marginal' };
  return { ...STATUS_CRIT, label: 'Out of Range' };
}
function doStatus(v: number | null | undefined): SensorStatus {
  if (v == null || !isFinite(v)) return { ...STATUS_NONE };
  if (v >= 5) return { ...STATUS_OK };
  if (v >= 3) return { ...STATUS_WARN, label: 'Low' };
  return { ...STATUS_CRIT, label: 'Hypoxic' };
}
function phStatus(v: number | null | undefined): SensorStatus {
  if (v == null || !isFinite(v)) return { ...STATUS_NONE };
  if (v >= 6.5 && v <= 8.5) return { ...STATUS_OK, label: 'Neutral' };
  if (v >= 5.5 && v <= 9.5) return { ...STATUS_WARN };
  return { ...STATUS_CRIT };
}
function turbStatus(v: number | null | undefined): SensorStatus {
  if (v == null || !isFinite(v)) return { ...STATUS_NONE };
  if (v <= 10) return { ...STATUS_OK, label: 'Clear' };
  if (v <= 25) return { ...STATUS_WARN, label: 'Moderate' };
  return { ...STATUS_CRIT, label: 'High' };
}
function depthStatus(_v: number | null | undefined): SensorStatus {
  return { ...STATUS_OK, label: 'Normal' };
}

// Diagnostic banner
type DiagStyle = 'alert' | 'info';

const DIAG_THEMES: Record<DiagStyle, { bannerBg: string; bannerBorder: string; iconBg: string; textColor: string }> = {
  alert: { bannerBg: 'rgba(248,113,113,0.12)', bannerBorder: 'rgba(248,113,113,0.35)', iconBg: 'rgba(248,113,113,0.3)', textColor: '#f87171' },
  info:  { bannerBg: 'rgba(74,158,255,0.1)',   bannerBorder: 'rgba(74,158,255,0.25)',  iconBg: 'rgba(74,158,255,0.2)', textColor: '#4a9eff' },
};

const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  dissolved_oxygen: 'Dissolved Oxygen',
  temperature:      'Temperature',
  ph:               'pH Level',
  turbidity:        'Turbidity',
  water_depth:      'Water Depth',
};

function statusPriority(s: SensorStatus): number {
  if (s.color === STATUS_CRIT.color) return 2;
  if (s.color === STATUS_WARN.color) return 1;
  return 0;
}

function resolveSourceName(source: string, m: MetricsState): string {
  if (source && SOURCE_DISPLAY_NAMES[source] && source !== 'water_depth') {
    return SOURCE_DISPLAY_NAMES[source];
  }
  const candidates = [
    { name: 'Temperature',      priority: statusPriority(tempStatus(m.rawTemp)) },
    { name: 'Dissolved Oxygen', priority: statusPriority(doStatus(m.rawDO)) },
    { name: 'pH',               priority: statusPriority(phStatus(m.rawPH)) },
    { name: 'Turbidity',        priority: statusPriority(turbStatus(m.rawTurbidity)) },
  ];
  return candidates.reduce((a, b) => (b.priority > a.priority ? b : a)).name;
}

function getDiagnosticInfo(
  m: MetricsState,
  isAlarmActive: boolean,
  device: string,
  latchSource: string,
): { text: string; style: DiagStyle } {
  if (isAlarmActive) {
    const sensorName = resolveSourceName(latchSource, m);
    return { text: `Critical ${sensorName} reading on ${device} - autoencoder flag triggered.`, style: 'alert' };
  }
  const sensorName = resolveSourceName('', m);
  return { text: `Alert: Minor changes in ${sensorName} detected on ${device}.`, style: 'info' };
}

function formatAlarmAge(latchedAtMs: number): string {
  const diffMs = Date.now() - latchedAtMs;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Happened just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Happened ${diffMin} min${diffMin !== 1 ? 's' : ''} ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Happened ${diffH} hr${diffH !== 1 ? 's' : ''} ago`;
  const diffD = Math.floor(diffH / 24);
  return `Happened ${diffD} day${diffD !== 1 ? 's' : ''} ago`;
}

// Metric Card
function MetricCard({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: SensorStatus;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricCardTop}>
        <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
          <View style={[styles.statusPillDot, { backgroundColor: status.color }]} />
          <Text style={[styles.statusPillText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>
      <Text style={styles.metricCardValue}>{value}</Text>
      <Text style={styles.metricCardLabel}>{label}</Text>
    </View>
  );
}

// Screen
export default function DashboardScreen() {
  const {
    currentMetrics, selectedSondeId, setSelectedSondeId,
    alarmLatchPerSonde, clearAlarmForSonde, timeTick, devicesList,
  } = useData();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isResetConfirming, setIsResetConfirming] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  // Cancel pending confirm timer and snap back whenever the selected sonde changes
  useEffect(() => {
    setIsResetConfirming(false);
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, [selectedSondeId]);

  function handleResetPress() {
    setIsResetConfirming(true);
    confirmTimerRef.current = setTimeout(() => {
      setIsResetConfirming(false);
      confirmTimerRef.current = null;
    }, 4000);
  }

  function handleConfirmReset() {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    clearAlarmForSonde(selectedSondeId);
    setIsResetConfirming(false);
  }

  const sondes: SondeConfig[] = devicesList.map((device) => ({
    id: device.sonde_id,
    label: `${device.location_name} (${sondeIdToName(device.sonde_id)})`,
    site: device.location_name,
    device: sondeIdToName(device.sonde_id),
  }));

  const sonde: SondeConfig = sondes.find((s) => s.id === selectedSondeId) ?? {
    id: selectedSondeId,
    label: sondeIdToName(selectedSondeId),
    site: sondeIdToName(selectedSondeId),
    device: sondeIdToName(selectedSondeId),
  };

  const statusIsNormal = !currentMetrics.isAnomaly;
  const isAwaitingFirstData = currentMetrics === EMPTY_METRICS;

  function handleSondeSelect(id: string) {
    setSelectedSondeId(id);
    setDropdownOpen(false);
  }

  const tempSt  = tempStatus(currentMetrics.rawTemp);
  const doSt    = doStatus(currentMetrics.rawDO);
  const phSt    = phStatus(currentMetrics.rawPH);
  const turbSt  = turbStatus(currentMetrics.rawTurbidity);
  const depthSt = depthStatus(currentMetrics.rawDepth);

  return (
    <LinearGradient colors={['#001C44', '#003B80']} style={styles.gradient}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={isDesktop ? styles.desktopInner : undefined}>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.dropIcon} />
              <Text style={styles.appTitle}>AquaFusion</Text>
            </View>
            <TouchableOpacity style={styles.avatarButton}>
              <Text style={styles.avatarText}>L</Text>
            </TouchableOpacity>
          </View>

          {/* Sonde Selector */}
          <View style={styles.selectorWrapper}>
            <TouchableOpacity
              style={styles.selectorBtn}
              onPress={() => setDropdownOpen((o) => !o)}
              activeOpacity={0.8}
            >
              <View style={[styles.selectorDot, statusIsNormal ? styles.dotNormal : styles.dotAnomaly]} />
              <Text style={styles.selectorText} numberOfLines={1}>
                {sonde.label}
              </Text>
              <View style={[styles.chevronBox, dropdownOpen && styles.chevronBoxOpen]}>
                <View style={styles.chevronLeft} />
                <View style={styles.chevronRight} />
              </View>
            </TouchableOpacity>

            {dropdownOpen && (
              <View style={styles.dropdownPanel}>
                {sondes.map((s, i) => {
                  const isActive = s.id === selectedSondeId;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[
                        styles.dropdownOption,
                        isActive && styles.dropdownOptionActive,
                        i < sondes.length - 1 && styles.dropdownOptionBorder,
                      ]}
                      onPress={() => handleSondeSelect(s.id)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.dropdownDot, isActive && styles.dropdownDotActive]} />
                      <View style={styles.dropdownOptionInner}>
                        <Text style={[styles.dropdownOptionText, isActive && styles.dropdownOptionTextActive]}>
                          {s.label}
                        </Text>
                        <Text style={styles.dropdownSite}>{s.site}</Text>
                      </View>
                      {isActive && <View style={styles.checkDot} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Location + Status */}
          <View style={styles.card}>
            <View style={styles.locationRow}>
              <View style={styles.pinIcon}>
                <View style={styles.pinDot} />
              </View>
              <Text style={styles.locationText}>{sonde.site}</Text>
            </View>
            <View style={styles.statusRow}>
              <View style={styles.stationBadge}>
                <Text style={styles.stationBadgeText}>{sonde.device}</Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  statusIsNormal ? styles.statusBadgeNormal : styles.statusBadgeAnomaly,
                ]}
              >
                <View style={[styles.statusDot, { backgroundColor: statusIsNormal ? '#4ade80' : '#f87171' }]} />
                <Text style={[styles.statusText, { color: statusIsNormal ? '#4ade80' : '#f87171' }]}>
                  {statusIsNormal ? 'All Systems Normal' : 'Anomaly Detected'}
                </Text>
              </View>
            </View>
          </View>

          {/* Individual Metric Cards */}
          <Text style={styles.sectionLabel}>Live Readings</Text>

          {isAwaitingFirstData ? (
            <View style={styles.waitingCard}>
              <View style={styles.waitingIconRow}>
                <View style={styles.waitingPulse} />
                <Text style={styles.waitingTitle}>No Data Yet</Text>
              </View>
              <Text style={styles.waitingMsg}>
                Waiting for initial hardware transmission...
              </Text>
              <Text style={styles.waitingHint}>
                This device will appear live once the sonde sends its first sensor packet.
              </Text>
            </View>
          ) : isDesktop ? (
            <>
              {/* Desktop: 3-col row 1, 2-col row 2 */}
              <View style={styles.row}>
                <MetricCard label="Temperature" value={currentMetrics.temperature} status={tempSt} />
                <MetricCard label="Dissolved O₂" value={currentMetrics.dissolvedOxygen} status={doSt} />
                <MetricCard label="pH Level" value={currentMetrics.pH} status={phSt} />
              </View>
              <View style={styles.row}>
                <MetricCard label="Turbidity" value={currentMetrics.turbidity} status={turbSt} />
                <MetricCard label="Water Depth" value={currentMetrics.depth} status={depthSt} />
              </View>
              <Text style={[styles.updateText, { marginBottom: 12 }]}>Updated {currentMetrics.lastUpdate}</Text>
            </>
          ) : (
            <>
              {/* Mobile: 2+2+full-width depth */}
              <View style={styles.row}>
                <MetricCard label="Temperature" value={currentMetrics.temperature} status={tempSt} />
                <MetricCard label="Dissolved O₂" value={currentMetrics.dissolvedOxygen} status={doSt} />
              </View>
              <View style={styles.row}>
                <MetricCard label="pH Level" value={currentMetrics.pH} status={phSt} />
                <MetricCard label="Turbidity" value={currentMetrics.turbidity} status={turbSt} />
              </View>
              <View style={styles.card}>
                <View style={[styles.metricCardTop, { justifyContent: 'space-between' }]}>
                  <Text style={styles.metricCardLabel}>Water Depth</Text>
                  <View style={[styles.statusPill, { backgroundColor: depthSt.bg }]}>
                    <View style={[styles.statusPillDot, { backgroundColor: depthSt.color }]} />
                    <Text style={[styles.statusPillText, { color: depthSt.color }]}>{depthSt.label}</Text>
                  </View>
                </View>
                <Text style={[styles.metricCardValue, styles.depthValue]}>{currentMetrics.depth}</Text>
                <Text style={styles.updateText}>Updated {currentMetrics.lastUpdate}</Text>
              </View>
            </>
          )}

          {/* Diagnostic Banner - suppressed until first packet arrives */}
          {!isAwaitingFirstData && (() => {
            const latch = alarmLatchPerSonde[selectedSondeId] ?? null;
            const isLatched = latch !== null;
            const isAlarmActive = isLatched || currentMetrics.isAnomaly;
            const alarmAge = isLatched ? formatAlarmAge(latch.latchedAt) : '';
            const diag = getDiagnosticInfo(
              currentMetrics, isAlarmActive, sonde.device, latch?.source ?? '',
            );
            const theme = DIAG_THEMES[diag.style];
            return (
              <View style={[styles.diagBanner, { backgroundColor: theme.bannerBg, borderColor: theme.bannerBorder }]}>
                <View style={styles.diagBannerRow}>
                  <View style={[styles.diagIconBox, { backgroundColor: theme.iconBg }]}>
                    <Text style={[styles.diagIconText, { color: theme.textColor }]}>!</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.diagText, { color: theme.textColor }]}>{diag.text}</Text>
                    {alarmAge ? (
                      <Text style={[styles.diagAgeText, { color: theme.textColor }]}>{alarmAge}</Text>
                    ) : null}
                  </View>
                </View>
                {isLatched && (
                  <TouchableOpacity
                    onPress={isResetConfirming ? handleConfirmReset : handleResetPress}
                    style={[
                      styles.clearAlarmBtn,
                      isResetConfirming && styles.clearAlarmBtnConfirm,
                    ]}
                    activeOpacity={0.7}
                  >
                    {isResetConfirming ? (
                      <View style={styles.clearAlarmInner}>
                        <Ionicons name="checkmark-circle" size={14} color="#fbbf24" />
                        <Text style={[styles.clearAlarmText, styles.clearAlarmTextConfirm]}>
                          Confirm Reset?
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.clearAlarmText}>Clear & Reset Alarm</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })()}

          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// Styles
const CARD_BASE = {
  backgroundColor: 'rgba(255,255,255,0.08)',
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.12)',
};

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dropIcon: { width: 10, height: 14, borderRadius: 5, backgroundColor: '#4a9eff' },
  appTitle: { fontSize: 22, fontWeight: '800', color: '#ffffff', letterSpacing: 0.3 },
  avatarButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(74,158,255,0.25)',
    borderWidth: 2, borderColor: '#4a9eff',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },

  selectorWrapper: { marginBottom: 14 },
  selectorBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
  },
  selectorDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  dotNormal: { backgroundColor: '#4a9eff' },
  dotAnomaly: { backgroundColor: '#f87171' },
  selectorText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#ffffff' },
  chevronBox: {
    width: 16, height: 10, flexDirection: 'row',
    alignItems: 'flex-start', justifyContent: 'center',
  },
  chevronBoxOpen: { transform: [{ scaleY: -1 }] },
  chevronLeft: {
    width: 8, height: 2, backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 1, transform: [{ rotate: '40deg' }, { translateY: 3 }],
  },
  chevronRight: {
    width: 8, height: 2, backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 1, transform: [{ rotate: '-40deg' }, { translateY: 3 }],
  },
  dropdownPanel: {
    marginTop: 4, backgroundColor: 'rgba(0,20,55,0.97)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  dropdownOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, gap: 12,
  },
  dropdownOptionActive: { backgroundColor: 'rgba(74,158,255,0.12)' },
  dropdownOptionBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  dropdownDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)', flexShrink: 0,
  },
  dropdownDotActive: { backgroundColor: '#4a9eff' },
  dropdownOptionInner: { flex: 1 },
  dropdownOptionText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.65)' },
  dropdownOptionTextActive: { color: '#ffffff' },
  dropdownSite: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
  checkDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4a9eff' },

  card: { ...CARD_BASE, padding: 14, marginBottom: 12 },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  pinIcon: {
    width: 16, height: 20, borderRadius: 8,
    borderWidth: 2, borderColor: '#4a9eff',
    justifyContent: 'center', alignItems: 'center',
  },
  pinDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#4a9eff' },
  locationText: { fontSize: 15, fontWeight: '700', color: '#ffffff', flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stationBadge: {
    backgroundColor: 'rgba(74,158,255,0.18)',
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20,
  },
  stationBadgeText: { color: '#4a9eff', fontSize: 11, fontWeight: '600' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20, gap: 5,
  },
  statusBadgeNormal: { backgroundColor: 'rgba(74,222,128,0.12)' },
  statusBadgeAnomaly: { backgroundColor: 'rgba(248,113,113,0.15)' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10, marginTop: 2,
  },

  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },

  // Individual metric card
  metricCard: {
    ...CARD_BASE,
    flex: 1,
    padding: 14,
  },
  metricCardTop: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 10,
  },
  metricCardValue: { fontSize: 22, fontWeight: '800', color: '#ffffff', marginBottom: 4 },
  metricCardLabel: {
    fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20,
  },
  statusPillDot: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: '700' },

  depthValue: { fontSize: 28, fontWeight: '800', marginBottom: 6 },
  updateText: { fontSize: 11, color: 'rgba(255,255,255,0.35)' },

  diagBanner: {
    borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 2,
  },
  diagBannerRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
  },
  diagIconBox: {
    width: 22, height: 22, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
  },
  diagIconText: { fontSize: 13, fontWeight: '800' },
  diagText: { fontSize: 13, fontWeight: '500', lineHeight: 20 },
  diagAgeText: { fontSize: 11, fontWeight: '600', marginTop: 4, opacity: 0.75 },
  clearAlarmBtn: {
    marginTop: 12, alignSelf: 'flex-end',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)',
  },
  clearAlarmText: { color: '#f87171', fontSize: 12, fontWeight: '700' },
  clearAlarmBtnConfirm: {
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderColor: 'rgba(251,191,36,0.4)',
  },
  clearAlarmInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clearAlarmTextConfirm: { color: '#fbbf24' },

  waitingCard: {
    backgroundColor: 'rgba(74,158,255,0.07)',
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(74,158,255,0.2)',
    padding: 24, alignItems: 'center', marginBottom: 12,
  },
  waitingIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  waitingPulse: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#4a9eff', opacity: 0.7,
  },
  waitingTitle: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  waitingMsg: {
    fontSize: 13, fontWeight: '600', color: '#4a9eff',
    textAlign: 'center', marginBottom: 8,
  },
  waitingHint: {
    fontSize: 11, color: 'rgba(255,255,255,0.35)',
    textAlign: 'center', lineHeight: 16,
  },
  desktopInner: {
    maxWidth: 1100,
    alignSelf: 'center',
    width: '100%',
  },
});
