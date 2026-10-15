import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useData, formatRelativeTime } from '@/src/DataContext';
import type { MetricsState } from '@/src/DataContext';

// Source -> display label
const SOURCE_LABELS: Record<string, string> = {
  dissolved_oxygen: 'Dissolved Oxygen',
  temperature:      'Temperature',
  ph:               'pH Level',
  turbidity:        'Turbidity',
  water_depth:      'Water Depth',
};

function sourceLabel(src: string): string {
  return SOURCE_LABELS[src] ?? (src || 'Unknown Channel');
}

// Dynamic insight content per anomaly source
type InsightBlock = {
  patternTitle: string;
  patternValue: string;
  patternDetail: (m: MetricsState) => string;
  predictionTitle: string;
  predictionValue: string;
  predictionDetail: string;
  recommendations: string[];
  confidence: number;
  accent: string;
};

const ANOMALY_INSIGHTS: Record<string, InsightBlock> = {
  dissolved_oxygen: {
    patternTitle: 'Low dissolved oxygen',
    patternValue: 'Oxygen has dropped below its usual range',
    patternDetail: (m) =>
      `Spread (std dev): ${m.stdDO > 0 ? m.stdDO.toFixed(3) : 'high'}. Fish start to struggle below about 5 mg/L. Current reading: ${m.dissolvedOxygen}.`,
    predictionTitle: 'What could happen',
    predictionValue: 'Oxygen may keep falling if the cause continues',
    predictionDetail:
      'Common causes are warm, still water or a lot of decaying organic material, like runoff or algae.',
    recommendations: [
      'Check the reading again in a few minutes to rule out a sensor glitch',
      'Look for runoff, algae, or anything unusual near the sonde',
      'Watch the temperature too, since warmer water holds less oxygen',
    ],
    confidence: 73,
    accent: '#4a9eff',
  },

  turbidity: {
    patternTitle: 'Turbidity spike',
    patternValue: 'The water suddenly got cloudier',
    patternDetail: (m) =>
      `Spread (std dev): ${m.stdTurbidity > 0 ? m.stdTurbidity.toFixed(3) : 'high'}. Current reading: ${m.turbidity}.`,
    predictionTitle: 'What could happen',
    predictionValue: 'Cloudy water can stay cloudy for hours',
    predictionDetail:
      'Common causes are stormwater runoff, stirred-up sediment, or something being dumped into the water.',
    recommendations: [
      'Check for recent rain, construction, or runoff nearby',
      'Look at the water around the sonde for anything unusual',
      'Watch dissolved oxygen, which can drop after a turbidity spike',
    ],
    confidence: 71,
    accent: '#34d399',
  },

  water_depth: {
    patternTitle: 'Water level change',
    patternValue: 'The depth reading changed quickly',
    patternDetail: (m) =>
      `Spread (std dev): ${m.stdDepth > 0 ? m.stdDepth.toFixed(3) : 'high'}. Current reading: ${m.depth}.`,
    predictionTitle: 'What could happen',
    predictionValue: 'Heavy inflow can carry sediment and move the sonde',
    predictionDetail:
      'A fast change usually means a lot of water coming in, or that the sonde itself has shifted.',
    recommendations: [
      'Check that the sonde is still mounted where it should be',
      'Check for heavy rain or flooding upstream',
      'Watch turbidity, which often rises with a big inflow',
    ],
    confidence: 68,
    accent: '#60a5fa',
  },

  temperature: {
    patternTitle: 'Unusual temperature',
    patternValue: 'Water temperature is outside its usual range',
    patternDetail: (m) =>
      `Spread (std dev): ${m.stdTemp > 0 ? m.stdTemp.toFixed(3) : 'high'}. Current reading: ${m.temperature}.`,
    predictionTitle: 'What could happen',
    predictionValue: 'Warmer water holds less oxygen',
    predictionDetail:
      'A temperature change can come from the weather, sunlight on still water, or a warm discharge upstream.',
    recommendations: [
      'Compare with the air temperature and weather today',
      'Watch dissolved oxygen, which drops as water warms',
      'Note how long the change lasts',
    ],
    confidence: 69,
    accent: '#fbbf24',
  },

  ph: {
    patternTitle: 'pH change',
    patternValue: 'The water became more acidic or more basic than usual',
    patternDetail: (m) =>
      `Spread (std dev): ${m.stdPH > 0 ? m.stdPH.toFixed(3) : 'high'}. Most freshwater life does best between pH 6.5 and 8.5. Current reading: pH ${m.pH}.`,
    predictionTitle: 'What could happen',
    predictionValue: 'A lasting pH change can stress fish and plants',
    predictionDetail:
      'Possible causes include runoff, a chemical spill, or a pH probe that needs recalibrating.',
    recommendations: [
      'Check the pH probe, since a dirty or failing probe can drift',
      'Look for runoff or anything unusual near the sonde',
      'Take a separate pH reading to confirm',
    ],
    confidence: 70,
    accent: '#a78bfa',
  },
};

const STABLE_INSIGHT: InsightBlock = {
  patternTitle: 'Everything looks normal',
  patternValue: 'All readings are within their usual range',
  patternDetail: () =>
    'The autoencoder has not flagged anything, and all five sensors are reading normally.',
  predictionTitle: 'What to expect',
  predictionValue: 'No problems expected right now',
  predictionDetail:
    'Nothing in the recent readings suggests a change is coming.',
  recommendations: [
    'Check the trend charts now and then for slow drift',
    'Clean and recalibrate the probes about once a month',
  ],
  confidence: 94,
  accent: '#4ade80',
};

// Sub-components
function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <View style={styles.confBar}>
      <View style={[styles.confFill, { width: `${value}%` as any, backgroundColor: color }]} />
    </View>
  );
}

// Screen
export default function InsightsScreen() {
  const { currentMetrics, selectedSondeId, alarmLatchPerSonde, timeTick: _timeTick, devicesList } = useData();

  const latch = alarmLatchPerSonde[selectedSondeId] ?? null;
  const isLatched = latch !== null;
  const isAlarmActive = isLatched || currentMetrics.isAnomaly;

  const activeSource = (isLatched ? latch.source : currentMetrics.anomalySource) || '';
  const insight = isAlarmActive
    ? (ANOMALY_INSIGHTS[activeSource] ?? ANOMALY_INSIGHTS['dissolved_oxygen'])
    : STABLE_INSIGHT;

  const registeredDevice = devicesList.find((d) => d.sonde_id === selectedSondeId);
  const deviceDisplayName = (id: string) => {
    const m = id.match(/^sonde_(\w+)$/i);
    if (m) return `Sonde #${m[1]}`;
    return id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };
  const sondeName = registeredDevice
    ? `${registeredDevice.location_name} (${deviceDisplayName(selectedSondeId)})`
    : deviceDisplayName(selectedSondeId);

  return (
    <LinearGradient colors={['#001C44', '#003B80']} style={styles.gradient}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Insights</Text>
            <View style={styles.modelBadge}>
              <View style={[styles.modelDot, { backgroundColor: '#4a9eff' }]} />
              <Text style={styles.modelText}>Rule-based</Text>
            </View>
          </View>

          {/* Station + alarm state row */}
          <View style={styles.contextRow}>
            <Text style={styles.contextStation} numberOfLines={1}>{sondeName}</Text>
            {isAlarmActive ? (
              <View style={styles.alarmBadge}>
                <View style={styles.alarmDot} />
                <Text style={styles.alarmBadgeText}>
                  ALARM{latch ? ` · ${formatRelativeTime(latch.latchedAt, Date.now())}` : ''}
                </Text>
              </View>
            ) : (
              <View style={styles.stableBadge}>
                <Text style={styles.stableBadgeText}>STABLE</Text>
              </View>
            )}
          </View>

          {/* Anomaly source chip */}
          {isAlarmActive && activeSource ? (
            <View style={styles.sourceRow}>
              <View style={styles.sourceChip}>
                <Text style={styles.sourceChipLabel}>ANOMALY SOURCE</Text>
                <Text style={styles.sourceChipValue}>{sourceLabel(activeSource)}</Text>
              </View>
            </View>
          ) : null}

          {/* Pattern Card */}
          <View style={[styles.card, isAlarmActive ? styles.cardRed : styles.cardBlue]}>
            <View style={styles.tagRow}>
              <View style={[styles.tag, { backgroundColor: insight.accent + '22' }]}>
                <Text style={[styles.tagText, { color: insight.accent }]}>Detected Pattern</Text>
              </View>
            </View>
            <Text style={styles.cardTitle}>{insight.patternTitle}</Text>
            <Text style={styles.cardValue}>{insight.patternValue}</Text>
            <Text style={styles.cardDetail}>{insight.patternDetail(currentMetrics)}</Text>
          </View>

          {/* Prediction Card */}
          <View
            style={[
              styles.card,
              isAlarmActive ? styles.cardAmber : styles.cardGreen,
            ]}
          >
            <View style={styles.tagRow}>
              <View
                style={[
                  styles.tag,
                  {
                    backgroundColor: isAlarmActive
                      ? 'rgba(251,191,36,0.15)'
                      : 'rgba(74,222,128,0.12)',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tagText,
                    { color: isAlarmActive ? '#fbbf24' : '#4ade80' },
                  ]}
                >
                  Prediction
                </Text>
              </View>
            </View>
            <Text style={styles.cardTitle}>{insight.predictionTitle}</Text>
            <Text style={styles.cardValue}>{insight.predictionValue}</Text>
            <Text style={styles.cardDetail}>{insight.predictionDetail}</Text>
          </View>

          {/* Recommendations */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Recommendations</Text>
            {insight.recommendations.map((rec, i) => (
              <View key={i} style={styles.recRow}>
                <View style={[styles.recBullet, { backgroundColor: insight.accent }]} />
                <Text style={styles.recText}>{rec}</Text>
              </View>
            ))}
          </View>

          {/* Confidence */}
          <View style={styles.card}>
            <View style={styles.confHeader}>
              <Text style={styles.sectionLabel}>Confidence (preset)</Text>
              <Text style={[styles.confValue, { color: insight.accent }]}>
                {insight.confidence}%
              </Text>
            </View>
            <ConfidenceBar value={insight.confidence} color={insight.accent} />
            <Text style={styles.confCaption}>
              {isAlarmActive
                ? 'Based on edge autoencoder anomaly score and per-channel standard deviation correlations'
                : 'Based on 14-day rolling baseline and seasonal calibration dataset'}
            </Text>
          </View>

          <Text style={styles.footer}>
            Last reading: {currentMetrics.lastUpdate} · {sondeName}
          </Text>

        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// Styles
const CARD_BASE = {
  borderRadius: 16 as const,
  borderWidth: 1 as const,
  padding: 16 as const,
  marginBottom: 12 as const,
};

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 14,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
  modelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(74,158,255,0.12)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  modelDot: { width: 6, height: 6, borderRadius: 3 },
  modelText: { color: '#4a9eff', fontSize: 11, fontWeight: '600' },

  contextRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  contextStation: {
    fontSize: 13, color: 'rgba(255,255,255,0.55)',
    fontWeight: '600', flex: 1, marginRight: 10,
  },
  alarmBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderWidth: 1, borderColor: 'rgba(248,113,113,0.35)',
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
  },
  alarmDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f87171' },
  alarmBadgeText: { color: '#f87171', fontSize: 11, fontWeight: '700' },
  stableBadge: {
    backgroundColor: 'rgba(74,222,128,0.12)',
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)',
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
  },
  stableBadgeText: { color: '#4ade80', fontSize: 11, fontWeight: '700' },

  sourceRow: { marginBottom: 12 },
  sourceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
  },
  sourceChipLabel: {
    fontSize: 9, fontWeight: '700', color: 'rgba(248,113,113,0.6)',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  sourceChipValue: { fontSize: 13, fontWeight: '700', color: '#f87171' },

  card: {
    ...CARD_BASE,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.11)',
  },
  cardBlue:  { backgroundColor: 'rgba(74,158,255,0.08)',  borderColor: 'rgba(74,158,255,0.2)' },
  cardRed:   { backgroundColor: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.2)' },
  cardAmber: { backgroundColor: 'rgba(251,191,36,0.07)',  borderColor: 'rgba(251,191,36,0.2)' },
  cardGreen: { backgroundColor: 'rgba(74,222,128,0.07)',  borderColor: 'rgba(74,222,128,0.2)' },

  tagRow: { marginBottom: 10 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  tagText: { fontSize: 11, fontWeight: '700' },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff', marginBottom: 6, lineHeight: 22 },
  cardValue: {
    fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.75)',
    marginBottom: 8, lineHeight: 22,
  },
  cardDetail: { fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 20 },

  recRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10 },
  recBullet: { width: 6, height: 6, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  recText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 22, flex: 1 },

  confHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'baseline', marginBottom: 12,
  },
  confValue: { fontSize: 28, fontWeight: '800' },
  confBar: {
    height: 8, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4, overflow: 'hidden', marginBottom: 10,
  },
  confFill: { height: '100%', borderRadius: 4 },
  confCaption: { fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 18 },

  footer: {
    textAlign: 'center', fontSize: 12,
    color: 'rgba(255,255,255,0.3)', marginTop: 4,
  },
});
