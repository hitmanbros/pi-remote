import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { PiWebSocket } from "../services/websocket";
import type { AppSettings, HostConfig } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Settings"> & {
  ws: PiWebSocket;
  connected: boolean;
  isDark: boolean;
  settings: AppSettings;
  setActiveHost: (hostId: string | null) => void;
  updateHosts: (hosts: HostConfig[]) => void;
  genId: () => string;
};

export function SettingsScreen({
  ws,
  connected,
  isDark,
  settings,
  setActiveHost,
  updateHosts,
  genId,
}: Props) {
  const [editingHost, setEditingHost] = useState<HostConfig | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [cwd, setCwd] = useState("");

  const bg = isDark ? "#0c0c0c" : "#ffffff";
  const cardBg = isDark ? "#1c1c1e" : "#f2f2f7";
  const textColor = isDark ? "#ffffff" : "#000000";
  const borderColor = isDark ? "#3a3a3c" : "#d1d1d6";
  const placeholderColor = isDark ? "#8e8e93" : "#c7c7cc";
  const secondaryText = isDark ? "#8e8e93" : "#6e6e73";

  const startAdd = useCallback(() => {
    setEditingHost(null);
    setIsAdding(true);
    setName("");
    setServerUrl("");
    setToken("");
    setSessionId("");
    setCwd("");
  }, []);

  const startEdit = useCallback((host: HostConfig) => {
    setEditingHost(host);
    setIsAdding(false);
    setName(host.name);
    setServerUrl(host.serverUrl);
    setToken(host.token);
    setSessionId(host.sessionId ?? "");
    setCwd(host.cwd ?? "");
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingHost(null);
    setIsAdding(false);
  }, []);

  const saveHost = useCallback(() => {
    if (!name.trim() || !serverUrl.trim()) {
      Alert.alert("Error", "Name and Server URL are required");
      return;
    }
    const host: HostConfig = {
      id: editingHost?.id ?? genId(),
      name: name.trim(),
      serverUrl: serverUrl.trim(),
      token: token.trim(),
      sessionId: sessionId.trim() || undefined,
      cwd: cwd.trim() || undefined,
    };

    const next = editingHost
      ? settings.hosts.map((h) => (h.id === editingHost.id ? host : h))
      : [...settings.hosts, host];

    updateHosts(next);
    if (!settings.activeHostId && next.length === 1) {
      setActiveHost(host.id);
    }
    cancelEdit();
  }, [name, serverUrl, token, sessionId, cwd, editingHost, settings, updateHosts, setActiveHost, cancelEdit, genId]);

  const deleteHost = useCallback((hostId: string) => {
    Alert.alert("Delete host?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (settings.activeHostId === hostId) {
            ws.disconnect();
          }
          updateHosts(settings.hosts.filter((h) => h.id !== hostId));
        },
      },
    ]);
  }, [settings, updateHosts, ws]);

  const selectHost = useCallback((hostId: string) => {
    setActiveHost(hostId);
  }, [setActiveHost]);

  const connect = useCallback(() => {
    const host = settings.hosts.find((h) => h.id === settings.activeHostId);
    if (host) {
      ws.switchHost(host);
    }
  }, [settings, ws]);

  const disconnect = useCallback(() => {
    ws.disconnect();
  }, [ws]);

  const isEditing = isAdding || editingHost !== null;

  return (
    <ScrollView style={[styles.container, { backgroundColor: bg }]} keyboardShouldPersistTaps="handled">
      {/* Host list */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: textColor }]}>Hosts</Text>
        {settings.hosts.length === 0 && (
          <Text style={[styles.emptyText, { color: secondaryText }]}>
            No hosts configured. Tap Add to create one.
          </Text>
        )}
        {settings.hosts.map((host) => {
          const isActive = host.id === settings.activeHostId;
          const isConnected = isActive && connected;
          return (
            <TouchableOpacity
              key={host.id}
              style={[
                styles.hostCard,
                { backgroundColor: cardBg, borderColor },
                isActive && { borderColor: isDark ? "#0a84ff" : "#007aff", borderWidth: 1.5 },
              ]}
              onPress={() => selectHost(host.id)}
              activeOpacity={0.7}
            >
              <View style={styles.hostRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isConnected ? "#34c759" : isActive ? "#ff9f0a" : "#8e8e93" },
                  ]}
                />
                <View style={styles.hostInfo}>
                  <Text style={[styles.hostName, { color: textColor }]}>{host.name}</Text>
                  <Text style={[styles.hostUrl, { color: secondaryText }]} numberOfLines={1}>
                    {host.serverUrl}
                  </Text>
                </View>
              </View>
              <View style={styles.hostActions}>
                <TouchableOpacity onPress={() => startEdit(host)} style={styles.iconBtn}>
                  <Text style={{ color: isDark ? "#0a84ff" : "#007aff", fontSize: 14 }}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteHost(host.id)} style={styles.iconBtn}>
                  <Text style={{ color: "#ff3b30", fontSize: 14 }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}

        {!isEditing && (
          <TouchableOpacity style={[styles.addBtn, { borderColor }]} onPress={startAdd}>
            <Text style={{ color: isDark ? "#0a84ff" : "#007aff", fontSize: 16, fontWeight: "600" }}>
              + Add Host
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Add / Edit form */}
      {isEditing && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>
            {isAdding ? "Add Host" : "Edit Host"}
          </Text>

          <Text style={[styles.label, { color: textColor }]}>Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
            value={name}
            onChangeText={setName}
            placeholder="My VPS"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.label, { color: textColor, marginTop: 12 }]}>Server URL</Text>
          <TextInput
            style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="ws://100.x.x.x:8765"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={[styles.label, { color: textColor, marginTop: 12 }]}>Auth Token</Text>
          <TextInput
            style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
            value={token}
            onChangeText={setToken}
            placeholder="your-token"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <Text style={[styles.label, { color: textColor, marginTop: 12 }]}>Session ID (optional)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
            value={sessionId}
            onChangeText={setSessionId}
            placeholder="Leave blank to continue most recent"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.label, { color: textColor, marginTop: 12 }]}>Working Directory (optional)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: cardBg, color: textColor, borderColor }]}
            value={cwd}
            onChangeText={setCwd}
            placeholder="/home/user/projects"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.formBtnRow}>
            <TouchableOpacity
              style={[styles.formBtn, { backgroundColor: isDark ? "#0a84ff" : "#007aff" }]}
              onPress={saveHost}
            >
              <Text style={styles.formBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formBtn, { backgroundColor: isDark ? "#3a3a3c" : "#e5e5ea" }]}
              onPress={cancelEdit}
            >
              <Text style={[styles.formBtnText, { color: isDark ? "#ffffff" : "#000000" }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Connection controls */}
      {!isEditing && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Connection</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDotLarge,
                { backgroundColor: connected ? "#34c759" : "#ff3b30" },
              ]}
            />
            <Text style={[styles.statusText, { color: textColor }]}>
              {connected ? "Connected" : "Disconnected"}
              {settings.activeHostId
                ? ` to ${settings.hosts.find((h) => h.id === settings.activeHostId)?.name ?? ""}`
                : ""}
            </Text>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: isDark ? "#0a84ff" : "#007aff" }]}
              onPress={connect}
            >
              <Text style={styles.btnText}>Connect</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: isDark ? "#3a3a3c" : "#e5e5ea" }]}
              onPress={disconnect}
            >
              <Text style={[styles.btnText, { color: isDark ? "#ffffff" : "#000000" }]}>
                Disconnect
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { marginHorizontal: 16, marginTop: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 20, fontWeight: "700", marginBottom: 10 },
  emptyText: { fontSize: 14, marginBottom: 12, fontStyle: "italic" },
  hostCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 8,
  },
  hostRow: { flexDirection: "row", alignItems: "center" },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  statusDotLarge: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  hostInfo: { flex: 1 },
  hostName: { fontSize: 16, fontWeight: "600" },
  hostUrl: { fontSize: 13, marginTop: 2 },
  hostActions: { flexDirection: "row", gap: 14, marginTop: 8 },
  iconBtn: { paddingVertical: 4 },
  addBtn: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 6 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  formBtnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  formBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  formBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  statusText: { fontSize: 15, fontWeight: "500" },
  btnRow: {
    flexDirection: "row",
    gap: 12,
  },
  btn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
});
