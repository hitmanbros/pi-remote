import React, { useState, useEffect, useCallback } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PiWebSocket } from "./src/services/websocket";
import { ChatScreen } from "./src/screens/ChatScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import type { AppSettings, HostConfig } from "./src/types";

export type RootStackParamList = {
  Chat: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const STORAGE_KEY = "@pi_remote_settings_v2";

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const defaultSettings: AppSettings = {
  hosts: [],
  activeHostId: null,
};

export default function App() {
  const colorScheme = useColorScheme();
  const [ws] = useState(() => new PiWebSocket());
  const [connected, setConnected] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  // Load settings from storage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed: AppSettings = JSON.parse(raw);
          setSettings(parsed);
        }
      })
      .catch(() => {
        // ignore
      })
      .finally(() => setLoaded(true));
  }, []);

  // Persist settings when they change
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch(() => {});
  }, [settings, loaded]);

  // Track connection state
  useEffect(() => {
    const unsub = ws.onConnectionChange(setConnected);
    return unsub;
  }, [ws]);

  // On mount or when settings load, auto-connect to active host
  useEffect(() => {
    if (!loaded) return;
    const activeHost = settings.hosts.find((h) => h.id === settings.activeHostId);
    if (activeHost) {
      ws.switchHost(activeHost);
    }
  }, [loaded, settings.activeHostId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveHost = useCallback((hostId: string | null) => {
    setSettings((prev) => ({
      ...prev,
      activeHostId: hostId,
    }));
    const host = settings.hosts.find((h) => h.id === hostId) ?? null;
    ws.switchHost(host);
  }, [settings.hosts, ws]);

  const updateHosts = useCallback((hosts: HostConfig[]) => {
    setSettings((prev) => {
      // If active host was deleted, clear it
      const stillExists = hosts.some((h) => h.id === prev.activeHostId);
      return {
        hosts,
        activeHostId: stillExists ? prev.activeHostId : (hosts[0]?.id ?? null),
      };
    });
  }, []);

  const isDark = colorScheme === "dark";
  const navTheme = isDark ? DarkTheme : DefaultTheme;
  const contentStyle = { backgroundColor: isDark ? "#0c0c0c" : "#ffffff" };

  if (!loaded) return null;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: isDark ? "#1c1c1e" : "#f2f2f7" },
          headerTintColor: isDark ? "#ffffff" : "#000000",
          contentStyle,
        }}
      >
        <Stack.Screen name="Chat">
          {(props) => (
            <ChatScreen
              {...props}
              ws={ws}
              connected={connected}
              isDark={isDark}
              activeHost={settings.hosts.find((h) => h.id === settings.activeHostId) ?? null}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Settings">
          {(props) => (
            <SettingsScreen
              {...props}
              ws={ws}
              connected={connected}
              isDark={isDark}
              settings={settings}
              setActiveHost={setActiveHost}
              updateHosts={updateHosts}
              genId={genId}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
