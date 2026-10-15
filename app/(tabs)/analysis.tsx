import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '@/src/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useState, useMemo } from 'react';
import { LineChart } from 'react-native-gifted-charts';
import { useData } from '@/src/DataContext';
import type { HistoricalPoint } from '@/src/DataContext';

// Sonde display helpers
function sondeIdToName(id: string): string {
  const m = id.match(/^sonde_(\w+)$/i);
  if (m) return `Sonde #${m[1]}`;
  return id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Period filter
const PERIODS = ['24h', '7d', '30d', '90d'] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_MS: Record<Period, number> = {
  '24h':  86_400_000,
  '7d':   604_800_000,
  '30d':  2_592_000_000,
  '90d':  7_776_000_000,
};

const DOWNSAMPLE_THRESHOLD = 100;

// Sensor chart configs
type ChartConfig = {
  title: string;
  unit: string;
  color: string;
  fixedMax: number;
  extractor: (h: HistoricalPoint) => number;
  fallback: number[];
};

const CHART_CONFIGS: ChartConfig[] = [
  {
    title: 'Dissolved Oxygen',
    unit: 'mg/L',
    color: '#4a9eff',
    fixedMax: 14,
    extractor: (h) => h.dissolved_oxygen,
    fallback: [7.8, 7.3, 6.9, 7.2, 7.6, 8.1, 8.0, 7.7, 7.4, 7.1, 7.3, 7.6],
  },
  {
    title: 'Temperature',
    unit: '°C',
    color: '#fbbf24',
    fixedMax: 35,
    extractor: (h) => h.temperature,
    fallback: [11.0, 10.6, 11.2, 12.4, 13.0, 12.7, 12.2, 11.8, 12.1, 12.4, 12.6, 12.3],
  },
  {
    title: 'pH Level',
    unit: '',
    color: '#a78bfa',
    fixedMax: 14,
    extractor: (h) => h.ph,
    fallback: [7.2, 7.3, 7.1, 7.4, 7.3, 7.2, 7.1, 7.3, 7.4, 7.2, 7.3, 7.2],
  },
  {
    title: 'Turbidity',
    unit: 'NTU',
    color: '#34d399',
    fixedMax: 0, // computed dynamically
    extractor: (h) => h.turbidity,
    fallback: [7.9, 8.1, 8.5, 7.8, 7.6, 8.0, 8.3, 7.9, 7.7, 8.1, 8.4, 8.0],
  },
  {
    title: 'Water Depth',
    unit: 'm',
    color: '#60a5fa',
    fixedMax: 0, // computed dynamically
    extractor: (h) => h.water_depth,
    fallback: [1.42, 1.40, 1.41, 1.43, 1.44, 1.42, 1.41, 1.40, 1.42, 1.43, 1.44, 1.42],
  },
];

// Helpers
type GiftedPoint = { value: number; label?: string };

function formatTs(ts: number, periodMs: number): string {
  const date = new Date(ts);
  if (periodMs <= 86_400_000) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  if (periodMs <= 7 * 86_400_000) {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function downsampleAvg(arr: HistoricalPoint[], maxPts: number): HistoricalPoint[] {
  if (arr.length <= maxPts) return arr;
  const bucketSize = arr.length / maxPts;
  return Array.from({ length: maxPts }, (_, i) => {
    const start  = Math.floor(i * bucketSize);
    const end    = Math.min(arr.length, Math.floor((i + 1) * bucketSize));
    const bucket = arr.slice(start, end);
    const n      = bucket.length;
    return {
      sonde_id:         bucket[0].sonde_id,
      timestamp:        Math.round(bucket.reduce((s, h) => s + h.timestamp, 0) / n),
      dissolved_oxygen: bucket.reduce((s, h) => s + h.dissolved_oxygen, 0) / n,
      temperature:      bucket.reduce((s, h) => s + h.temperature, 0) / n,
      ph:               bucket.reduce((s, h) => s + h.ph, 0) / n,
      turbidity:        bucket.reduce((s, h) => s + h.turbidity, 0) / n,
      water_depth:      bucket.reduce((s, h) => s + h.water_depth, 0) / n,
      is_anomaly:       bucket.some((h) => h.is_anomaly),
    };
  });
}

function buildLiveData(
  slice: HistoricalPoint[],
  extractor: (h: HistoricalPoint) => number,
  periodMs: number,
): GiftedPoint[] {
  const thin = slice.length <= 8 ? 1 : slice.length <= 20 ? 2 : slice.length <= 48 ? 4 : 8;
  return slice.map((h, i) => ({
    value: parseFloat(extractor(h).toFixed(2)),
    label: i % thin === 0 ? formatTs(h.timestamp, periodMs) : '',
  }));
}

function buildFallbackData(values: number[]): GiftedPoint[] {
  const thin = values.length <= 8 ? 1 : 2;
  return values.map((v, i) => ({
    value: parseFloat(v.toFixed(2)),
    label: i % thin === 0 ? `${i}` : '',
  }));
}

function computeMax(values: number[], fixedMax: number): number {
  if (fixedMax > 0) return fixedMax;
  const max = Math.max(...values);
  return Math.ceil(max * 1.25) || 10;
}

function computeAvg(values: number[]): string {
  if (values.length === 0) return '-';
  return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
}

// Chart Card
function SensorChart({
  config,
  history,
  activePeriod,
  chartWidth,
  windowStart,
  windowEnd,
}: {
  config: ChartConfig;
  history: HistoricalPoint[];
  activePeriod: Period;
  chartWidth: number;
  windowStart: number;
  windowEnd: number;
}) {
  const periodMs = PERIOD_MS[activePeriod];
  const isLive = history.length >= 2;
  const slice = isLive ? downsampleAvg(history, DOWNSAMPLE_THRESHOLD) : [];
  const raw = isLive ? slice.map(config.extractor) : config.fallback;

  const chartPoints = isLive
    ? buildLiveData(slice, config.extractor, periodMs)
    : buildFallbackData(config.fallback);
  const maxVal = computeMax(raw, config.fixedMax);
  const avg = computeAvg(raw);

  // Fixed-window spacing: scale chart so all points map proportionally into [windowStart, windowEnd]
  let spacing: number;
  let endSpacing: number;
  if (isLive && slice.length > 1) {
    const totalMs = Math.max(1, windowEnd - windowStart);
    const dataSpanMs = Math.max(1, slice[slice.length - 1].timestamp - slice[0].timestamp);
    const dataPixels = chartWidth * (dataSpanMs / totalMs);
    spacing = Math.max(1, dataPixels / (slice.length - 1));
    endSpacing = Math.max(8, chartWidth * ((windowEnd - slice[slice.length - 1].timestamp) / totalMs));
  } else {
    const idealSpacing = raw.length > 1 ? (chartWidth - 10) / (raw.length - 1) : chartWidth;
    spacing = Math.max(20, Math.min(50, idealSpacing));
    endSpacing = 16;
  }

  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <View>
          <Text style={styles.chartTitle}>{config.title}</Text>
          {config.unit ? (
            <Text style={styles.chartSub}>{config.unit} · {isLive ? `${raw.length} readings` : 'Seed data'}</Text>
          ) : (
            <Text style={styles.chartSub}>{isLive ? `${raw.length} readings` : 'Seed data'}</Text>
          )}
        </View>
        <View style={[styles.avgBadge, { borderColor: config.color + '55', backgroundColor: config.color + '18' }]}>
          <Text style={[styles.avgBadgeText, { color: config.color }]}>
            Avg {avg}{config.unit ? ` ${config.unit}` : ''}
          </Text>
        </View>
      </View>

      <LineChart
        data={chartPoints}
        color={config.color}
        thickness={2.5}
        dataPointsRadius={raw.length <= 20 ? 4 : 0}
        dataPointsColor={config.color}
        hideDataPoints={raw.length > 20}
        noOfSections={4}
        maxValue={maxVal}
        yAxisColor="rgba(255,255,255,0.08)"
        xAxisColor="rgba(255,255,255,0.08)"
        rulesColor="rgba(255,255,255,0.05)"
        rulesType="solid"
        yAxisTextStyle={styles.yAxisText}
        xAxisLabelTextStyle={styles.xAxisText}
        backgroundColor="transparent"
        initialSpacing={4}
        endSpacing={endSpacing}
        spacing={spacing}
        width={chartWidth}
        height={110}
        yAxisLabelWidth={36}
        isAnimated
        formatYLabel={(v) => parseFloat(v).toFixed(1)}
      />
    </View>
  );
}

// Screen
export default function AnalysisScreen() {
  const { historicalData, selectedSondeId, setSelectedSondeId, devicesList } = useData();
  const [activePeriod, setActivePeriod] = useState<Period>('24h');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSharing,   setIsSharing]   = useState(false);
  const { width } = useWindowDimensions();
  const chartWidth = width - 64;

  const sondes = devicesList.map((device) => ({
    id: device.sonde_id,
    label: `${device.location_name} (${sondeIdToName(device.sonde_id)})`,
    site: device.location_name,
  }));

  const sonde = sondes.find((s) => s.id === selectedSondeId) ?? {
    id: selectedSondeId,
    label: sondeIdToName(selectedSondeId),
    site: sondeIdToName(selectedSondeId),
  };

  const sondeHistory = useMemo(
    () => historicalData.filter((h) => h.sonde_id === selectedSondeId),
    [historicalData, selectedSondeId],
  );

  const now = Date.now();
  const periodMs = PERIOD_MS[activePeriod];

  // Cap history to the selected period window so charts reflect the chosen range
  const periodHistory = useMemo(
    () => sondeHistory.filter((h) => h.timestamp >= now - periodMs),
    [sondeHistory, activePeriod],
  );

  const firstTs = periodHistory.length > 0 ? periodHistory[0].timestamp : now;
  const lastTs  = periodHistory.length > 0 ? periodHistory[periodHistory.length - 1].timestamp : now;
  const windowStart = firstTs;
  // Grows naturally from the first reading toward the full period, then freezes.
  // Math.max(lastTs, ...) guarantees the most recent point is never clipped.
  const windowEnd = Math.max(lastTs, Math.min(now, firstTs + periodMs));

  async function handleExport() {
    setIsExporting(true);
    try {
      const { data: logRows, error } = await supabase
        .from('sensor_logs')
        .select('created_at,dissolved_oxygen,temperature,ph,turbidity,water_depth,is_anomaly')
        .eq('sonde_id', selectedSondeId)
        .order('created_at', { ascending: true })
        .limit(2000);

      if (error) throw error;
      if (!logRows || logRows.length === 0) {
        Alert.alert('No Data', 'No sensor logs found for this device.');
        return;
      }

      const header = 'timestamp,dissolved_oxygen,temperature,ph,turbidity,water_depth,is_anomaly';
      const rows = logRows.map((row) =>
        `${row.created_at},${row.dissolved_oxygen},${row.temperature},${row.ph},${row.turbidity},${row.water_depth},${row.is_anomaly}`
      );
      const csv = [header, ...rows].join('\n');

      await Share.share({
        title: `AquaFusion_${sonde.site.replace(/\s+/g, '_')}_export.csv`,
        message: csv,
      });
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message ?? 'Could not fetch sensor data.');
      if (__DEV__) console.error('CSV export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleShare() {
    setIsSharing(true);
    try {
      const { data: reportRows, error } = await supabase
        .from('sensor_logs')
        .select('dissolved_oxygen,temperature,ph,turbidity,water_depth,is_anomaly,created_at')
        .eq('sonde_id', selectedSondeId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      const rows = reportRows ?? [];
      const numAvg = (key: 'dissolved_oxygen' | 'temperature' | 'ph' | 'turbidity' | 'water_depth') =>
        rows.length > 0
          ? (rows.reduce((sum, row) => sum + (row[key] as number), 0) / rows.length).toFixed(2)
          : '-';

      const anomalyCount = rows.filter((row) => row.is_anomaly).length;
      const firstReading = rows.length > 0 ? rows[rows.length - 1].created_at : 'N/A';
      const lastReading  = rows.length > 0 ? rows[0].created_at : 'N/A';

      await Share.share({
        title: 'AquaFusion - Water Quality Report',
        message:
          `AquaFusion Water Quality Report\n` +
          `Site: ${sonde.site}\n` +
          `Device: ${selectedSondeId}\n` +
          `Period: ${firstReading} -> ${lastReading}\n` +
          `Readings: ${rows.length}  |  Anomalies: ${anomalyCount}\n\n` +
          `Dissolved Oxygen Avg: ${numAvg('dissolved_oxygen')} mg/L\n` +
          `Temperature Avg:      ${numAvg('temperature')} °C\n` +
          `pH Avg:               ${numAvg('ph')}\n` +
          `Turbidity Avg:        ${numAvg('turbidity')} NTU\n` +
          `Water Depth Avg:      ${numAvg('water_depth')} m\n\n` +
          `Generated by AquaFusion Monitoring System`,
      });
    } catch (err: any) {
      Alert.alert('Share Failed', err?.message ?? 'Could not fetch report data.');
      if (__DEV__) console.error('Report share failed:', err);
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <LinearGradient colors={['#001C44', '#003B80']} style={styles.gradient}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Data Analysis</Text>
          </View>

          {/* Sonde Selector */}
          <View style={styles.selectorWrapper}>
            <TouchableOpacity
              style={styles.selectorBtn}
              onPress={() => setDropdownOpen((o) => !o)}
              activeOpacity={0.8}
            >
              <View style={styles.selectorDot} />
              <Text style={styles.selectorText} numberOfLines={1}>{sonde.label}</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{sondeHistory.length} records</Text>
              </View>
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
                      onPress={() => { setSelectedSondeId(s.id); setDropdownOpen(false); }}
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

          {/* Period selector */}
          <View style={styles.periodRow}>
            {PERIODS.map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => setActivePeriod(p)}
                style={[styles.periodBtn, activePeriod === p && styles.periodBtnActive]}
                activeOpacity={0.75}
              >
                <Text style={[styles.periodText, activePeriod === p && styles.periodTextActive]}>
                  {p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* No-data notice for newly registered devices */}
          {sondeHistory.length === 0 && (
            <View style={styles.noDataBanner}>
              <Text style={styles.noDataTitle}>Waiting for initial hardware transmission...</Text>
              <Text style={styles.noDataHint}>
                Charts below show reference seed values. Live data will populate once this sonde sends its first packet.
              </Text>
            </View>
          )}

          {/* 5 Sensor Charts */}
          {CHART_CONFIGS.map((cfg) => (
            <SensorChart
              key={cfg.title}
              config={cfg}
              history={periodHistory}
              activePeriod={activePeriod}
              chartWidth={chartWidth}
              windowStart={windowStart}
              windowEnd={windowEnd}
            />
          ))}

          {/* Export / Share */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnOutline, isExporting && styles.actionBtnDisabled]}
              onPress={handleExport}
              disabled={isExporting}
              activeOpacity={0.8}
            >
              {isExporting
                ? <ActivityIndicator size="small" color="#4a9eff" />
                : <Text style={styles.actionBtnTextOutline}>Export CSV</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnFill, isSharing && styles.actionBtnDisabled]}
              onPress={handleShare}
              disabled={isSharing}
              activeOpacity={0.8}
            >
              {isSharing
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <Text style={styles.actionBtnTextFill}>Share Report</Text>
              }
            </TouchableOpacity>
          </View>

        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// Styles
const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28 },

  header: { marginBottom: 10 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },

  selectorWrapper: { marginBottom: 14 },
  selectorBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
  },
  selectorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4a9eff', flexShrink: 0 },
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

  countBadge: {
    backgroundColor: 'rgba(74,158,255,0.15)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  countBadgeText: { color: '#4a9eff', fontSize: 11, fontWeight: '700' },

  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  periodBtnActive: { backgroundColor: 'rgba(74,158,255,0.25)', borderColor: '#4a9eff' },
  periodText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  periodTextActive: { color: '#ffffff' },

  chartCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    padding: 16, marginBottom: 12, overflow: 'hidden',
  },
  chartHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 14,
  },
  chartTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  chartSub: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  avgBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1,
  },
  avgBadgeText: { fontSize: 11, fontWeight: '700' },

  yAxisText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
  } as any,
  xAxisText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
  } as any,

  actionRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  actionBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  actionBtnOutline: {
    borderWidth: 1, borderColor: 'rgba(74,158,255,0.4)',
    backgroundColor: 'rgba(74,158,255,0.06)',
  },
  actionBtnFill: { backgroundColor: '#4a9eff' },
  actionBtnTextOutline: { color: '#4a9eff', fontSize: 14, fontWeight: '700' },
  actionBtnTextFill: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  actionBtnDisabled: { opacity: 0.55 },

  noDataBanner: {
    backgroundColor: 'rgba(74,158,255,0.07)',
    borderRadius: 14, borderWidth: 1,
    borderColor: 'rgba(74,158,255,0.2)',
    padding: 16, marginBottom: 12,
  },
  noDataTitle: { fontSize: 13, fontWeight: '700', color: '#4a9eff', marginBottom: 6 },
  noDataHint: { fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 17 },
});
