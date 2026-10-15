import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// SF Symbols on iOS, Ionicons everywhere else (web, Android)
function TabIcon({ sfSymbol, ionicon, color }: {
  sfSymbol: string;
  ionicon: IoniconName;
  color: string;
}) {
  if (Platform.OS === 'ios') {
    return <SymbolView name={sfSymbol} tintColor={color} size={20} />;
  }
  return <Ionicons name={ionicon} size={20} color={color} />;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#001430',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.1)',
          // No extra home-indicator padding on web; respect insets on device
          paddingBottom: Platform.OS === 'web' ? 6 : Math.max(insets.bottom, 16),
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarActiveTintColor: '#4a9eff',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.38)',
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            <TabIcon sfSymbol="square.grid.2x2.fill" ionicon="grid-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => (
            <TabIcon sfSymbol="map.fill" ionicon="map-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color }) => (
            <TabIcon sfSymbol="sparkles" ionicon="sparkles-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analysis"
        options={{
          title: 'Analysis',
          tabBarIcon: ({ color }) => (
            <TabIcon sfSymbol="chart.xyaxis.line" ionicon="bar-chart-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="devices"
        options={{
          title: 'Devices',
          tabBarIcon: ({ color }) => (
            <TabIcon sfSymbol="cpu" ionicon="hardware-chip-outline" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
