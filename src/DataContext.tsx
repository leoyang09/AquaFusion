import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from './supabase';

// Show foreground notifications as a native dropdown banner
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Shared types
export type SondeId = string;

export type SensorRow = {
  id?: number;
  sonde_id: string;
  created_at?: string;
  temperature: number;
  water_depth: number;
  dissolved_oxygen: number;
  ph: number;
  turbidity: number;
  is_anomaly: boolean;
  // Expanded autoencoder payload
  anomaly_source?: string;
  std_dissolved_oxygen?: number;
  std_temperature?: number;
  std_ph?: number;
  std_turbidity?: number;
  std_water_depth?: number;
};

export type MetricsState = {
  // Formatted display strings
  temperature: string;
  dissolvedOxygen: string;
  depth: string;
  pH: string;
  turbidity: string;
  turbidityLevel: string;
  isAnomaly: boolean;
  doHistory: number[];
  lastUpdate: string;
  // Raw numeric values for threshold evaluation
  rawTemp: number;
  rawDO: number;
  rawDepth: number;
  rawPH: number;
  rawTurbidity: number;
  // Expanded autoencoder state
  anomalySource: string;
  stdDO: number;
  stdTemp: number;
  stdPH: number;
  stdTurbidity: number;
  stdDepth: number;
};

export type HistoricalPoint = {
  sonde_id: string;
  timestamp: number; // ms epoch
  dissolved_oxygen: number;
  temperature: number;
  ph: number;
  turbidity: number;
  water_depth: number;
  is_anomaly: boolean;
};

// Latched alarm: persists from first anomaly until manually cleared
export type AlarmLatch = {
  latchedAt: number; // ms epoch of the first anomalous row
  source: string;    // anomaly_source captured at latch time
} | null;

export type RegisteredDevice = {
  id?: number;
  sonde_id: string;
  location_name: string;
  battery_level?: number;
  signal?: string;
  firmware?: string;
  latitude?: number;
  longitude?: number;
  push_token?: string;
  created_at?: string;
};

type DataContextValue = {
  selectedSondeId: SondeId;
  setSelectedSondeId: (id: SondeId) => void;
  metricsPerSonde: Record<string, MetricsState>;
  currentMetrics: MetricsState;
  historicalData: HistoricalPoint[];
  lastSeenPerSonde: Record<string, number>;
  alarmLatchPerSonde: Record<string, AlarmLatch>;
  clearAlarmForSonde: (sondeId: SondeId) => void;
  timeTick: number;
  devicesList: RegisteredDevice[];
  addDevice: (device: RegisteredDevice) => void;
};

// Seed data
export const SONDE_SEEDS: Record<SondeId, MetricsState> = {
  sonde_12: {
    temperature: '12.4°C',
    dissolvedOxygen: '8.1 mg/L',
    depth: '1.42 m',
    pH: '7.3',
    turbidity: '7.9 NTU',
    turbidityLevel: 'Low',
    isAnomaly: false,
    doHistory: [6.8, 7.1, 7.4, 7.9, 8.1, 8.0, 7.7, 7.4, 7.1, 7.3, 7.6, 7.9],
    lastUpdate: 'Awaiting data...',
    rawTemp: 12.4,
    rawDO: 8.1,
    rawDepth: 1.42,
    rawPH: 7.3,
    rawTurbidity: 7.9,
    anomalySource: '',
    stdDO: 0,
    stdTemp: 0,
    stdPH: 0,
    stdTurbidity: 0,
    stdDepth: 0,
  },
  sonde_45: {
    temperature: '10.0°C',
    dissolvedOxygen: '7.1 mg/L',
    depth: '0.88 m',
    pH: '7.0',
    turbidity: '12.3 NTU',
    turbidityLevel: 'Moderate',
    isAnomaly: false,
    doHistory: [6.5, 6.8, 7.0, 7.2, 7.1, 6.9, 7.1, 7.3, 7.0, 6.8, 7.1, 7.2],
    lastUpdate: 'Awaiting data...',
    rawTemp: 10.0,
    rawDO: 7.1,
    rawDepth: 0.88,
    rawPH: 7.0,
    rawTurbidity: 12.3,
    anomalySource: '',
    stdDO: 0,
    stdTemp: 0,
    stdPH: 0,
    stdTurbidity: 0,
    stdDepth: 0,
  },
};

// Placeholder used when a selected sonde has no sensor_logs rows yet
export const EMPTY_METRICS: MetricsState = {
  temperature: '---',
  dissolvedOxygen: '---',
  depth: '---',
  pH: '---',
  turbidity: '---',
  turbidityLevel: '---',
  isAnomaly: false,
  doHistory: [],
  lastUpdate: 'Waiting for initial hardware transmission...',
  rawTemp: 0,
  rawDO: 0,
  rawDepth: 0,
  rawPH: 0,
  rawTurbidity: 0,
  anomalySource: '',
  stdDO: 0,
  stdTemp: 0,
  stdPH: 0,
  stdTurbidity: 0,
  stdDepth: 0,
};

// Helpers
function getTurbidityLevel(ntu: number): string {
  if (ntu < 5) return 'Low';
  if (ntu < 20) return 'Moderate';
  return 'High';
}

function rowToMetrics(row: SensorRow, prev: MetricsState): MetricsState {
  return {
    temperature: `${row.temperature.toFixed(1)}°C`,
    dissolvedOxygen: `${row.dissolved_oxygen.toFixed(1)} mg/L`,
    depth: `${row.water_depth.toFixed(2)} m`,
    pH: `${row.ph.toFixed(1)}`,
    turbidity: `${row.turbidity.toFixed(1)} NTU`,
    turbidityLevel: getTurbidityLevel(row.turbidity),
    isAnomaly: row.is_anomaly,
    doHistory: [...prev.doHistory.slice(-11), row.dissolved_oxygen],
    lastUpdate: 'just now',
    rawTemp: row.temperature,
    rawDO: row.dissolved_oxygen,
    rawDepth: row.water_depth,
    rawPH: row.ph,
    rawTurbidity: row.turbidity,
    anomalySource: row.anomaly_source ?? '',
    stdDO: row.std_dissolved_oxygen ?? 0,
    stdTemp: row.std_temperature ?? 0,
    stdPH: row.std_ph ?? 0,
    stdTurbidity: row.std_turbidity ?? 0,
    stdDepth: row.std_water_depth ?? 0,
  };
}

const MAX_HISTORY = 200;

// Shared relative-time formatter
// Compact form used by the Insights badge and any other consumer.
// Pass a pre-captured `now` value from a ticker to keep strings reactive.
export function formatRelativeTime(tsMs: number, now: number = Date.now()): string {
  const diffSec = Math.floor((now - tsMs) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

// Push notification registration
async function registerForPushNotificationsAsync(sondeId: string): Promise<void> {
  if (!Device.isDevice) {
    if (__DEV__) console.warn('Push tokens require a physical device.');
    return;
  }

  // Android needs an explicit notification channel before requesting permissions
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'AquaFusion Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    if (__DEV__) console.warn('Notification permission not granted.');
    return;
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId: 'ad64e762-54f7-4b7c-8537-4035aa8d9e23',
  });

  const { error } = await supabase
    .from('registered_devices')
    .update({ push_token: token })
    .eq('sonde_id', sondeId);

  if (error && __DEV__) {
    console.warn('push_token save failed:', error.message);
  }
}

// Context
export const DataContext = createContext<DataContextValue>({
  selectedSondeId: 'device_1',
  setSelectedSondeId: () => {},
  metricsPerSonde: { ...SONDE_SEEDS },
  currentMetrics: EMPTY_METRICS,
  historicalData: [],
  lastSeenPerSonde: {},
  alarmLatchPerSonde: {},
  clearAlarmForSonde: () => {},
  timeTick: 0,
  devicesList: [],
  addDevice: () => {},
});

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [selectedSondeId, setSelectedSondeId] = useState<SondeId>('device_1');
  const [metricsPerSonde, setMetricsPerSonde] = useState<Record<string, MetricsState>>({
    ...SONDE_SEEDS,
  });
  const [historicalData, setHistoricalData] = useState<HistoricalPoint[]>([]);
  const [lastSeenPerSonde, setLastSeenPerSonde] = useState<Record<string, number>>({});
  const [alarmLatchPerSonde, setAlarmLatchPerSonde] = useState<Record<string, AlarmLatch>>({});
  const [timeTick, setTimeTick] = useState(0);
  const [devicesList, setDevicesList] = useState<RegisteredDevice[]>([]);

  function addDevice(device: RegisteredDevice) {
    setDevicesList((prev) => {
      const idx = prev.findIndex((d) => d.sonde_id === device.sonde_id);
      let next: RegisteredDevice[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = { ...prev[idx], ...device };
      } else {
        next = [...prev, device];
      }
      return next.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    });
  }

  function clearAlarmForSonde(sondeId: SondeId) {
    setAlarmLatchPerSonde((prev) => ({ ...prev, [sondeId]: null }));
    setMetricsPerSonde((prev) => {
      const current = prev[sondeId];
      if (!current) return prev;
      return { ...prev, [sondeId]: { ...current, isAnomaly: false, anomalySource: '' } };
    });
  }

  useEffect(() => {
    const timer = setInterval(() => setTimeTick((t) => t + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Register this phone's Expo push token and bind it to the active device profile
  useEffect(() => {
    registerForPushNotificationsAsync(selectedSondeId);
  }, []);

  useEffect(() => {
    supabase
      .from('registered_devices')
      .select('*')
      .order('id', { ascending: true })
      .then(({ data }) => {
        if (data) setDevicesList(data as RegisteredDevice[]);
      });

    const devChannel = supabase
      .channel('registered_devices_inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'registered_devices' },
        (payload) => {
          addDevice(payload.new as RegisteredDevice);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(devChannel); };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('sensor_logs_global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_logs' },
        (payload) => {
          const row = payload.new as SensorRow;
          const id = row.sonde_id;

          setMetricsPerSonde((prev) => {
            const prevMetrics =
              prev[id] ?? SONDE_SEEDS[id as SondeId] ?? SONDE_SEEDS['sonde_12'];
            return { ...prev, [id]: rowToMetrics(row, prevMetrics) };
          });

          const ts = row.created_at ? new Date(row.created_at).getTime() : Date.now();

          const point: HistoricalPoint = {
            sonde_id: row.sonde_id,
            timestamp: ts,
            dissolved_oxygen: row.dissolved_oxygen,
            temperature: row.temperature,
            ph: row.ph,
            turbidity: row.turbidity,
            water_depth: row.water_depth,
            is_anomaly: row.is_anomaly,
          };

          setHistoricalData((prev) => {
            const next = [...prev, point];
            return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
          });

          setLastSeenPerSonde((prev) => ({ ...prev, [id]: ts }));

          // Latch alarm on first anomaly - never auto-clears, only manual reset
          if (row.is_anomaly) {
            setAlarmLatchPerSonde((prev) => {
              if (prev[id] != null) return prev; // preserve original trigger time
              return { ...prev, [id]: { latchedAt: ts, source: row.anomaly_source ?? '' } };
            });
          }
        },
      )
      .subscribe((status) => {
        if (__DEV__) console.log('global channel', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const currentMetrics =
    metricsPerSonde[selectedSondeId] ?? SONDE_SEEDS[selectedSondeId] ?? EMPTY_METRICS;

  return (
    <DataContext.Provider
      value={{
        selectedSondeId,
        setSelectedSondeId,
        metricsPerSonde,
        currentMetrics,
        historicalData,
        lastSeenPerSonde,
        alarmLatchPerSonde,
        clearAlarmForSonde,
        timeTick,
        devicesList,
        addDevice,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  return useContext(DataContext);
}
