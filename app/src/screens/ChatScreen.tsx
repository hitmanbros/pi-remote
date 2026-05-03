import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  type ListRenderItem,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Markdown from "react-native-markdown-display";
import type { RootStackParamList } from "../../App";
import { PiWebSocket } from "../services/websocket";
import type { ChatMessage, AgentEvent, ExtensionUIRequest, HostConfig } from "../types";
import { ExtensionUIModal } from "../components/ExtensionUIModal";

type Props = NativeStackScreenProps<RootStackParamList, "Chat"> & {
  ws: PiWebSocket;
  connected: boolean;
  isDark: boolean;
  activeHost: HostConfig | null;
};

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function ChatScreen({ navigation, ws, connected, isDark, activeHost }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [extUI, setExtUI] = useState<ExtensionUIRequest | null>(null);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const assistantIdRef = useRef<string | null>(null);

  // Header setup
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRight}>
          {pendingCount > 0 && (
            <Text style={[styles.pendingText, { color: isDark ? "#ff9f0a" : "#ff9500" }]}>
              queue: {pendingCount}
            </Text>
          )}
          <View
            style={[
              styles.dot,
              { backgroundColor: connected ? "#34c759" : "#ff3b30" },
            ]}
          />
          <TouchableOpacity onPress={() => navigation.navigate("Settings")}>
            <Text style={{ color: isDark ? "#0a84ff" : "#007aff", fontSize: 16 }}>
              Settings
            </Text>
          </TouchableOpacity>
        </View>
      ),
      headerTitle: () => (
        <View style={styles.headerTitle}>
          <Text style={{ color: isDark ? "#fff" : "#000", fontWeight: "600", fontSize: 17 }}>
            {activeHost?.name ?? "pi-remote"}
          </Text>
          {activeHost && (
            <Text style={{ color: isDark ? "#8e8e93" : "#6e6e73", fontSize: 11, marginTop: 1 }} numberOfLines={1}>
              {activeHost.serverUrl}
            </Text>
          )}
        </View>
      ),
    });
  }, [navigation, connected, pendingCount, isDark]);

  // WebSocket events
  useEffect(() => {
    const unsub = ws.onEvent((event: AgentEvent) => {
      switch (event.type) {
        case "message_start": {
          const id = genId();
          assistantIdRef.current = id;
          const msg: ChatMessage = {
            id,
            role: "assistant",
            text: "",
            pending: true,
            createdAt: Date.now(),
          };
          setMessages((prev) => [...prev, msg]);
          break;
        }
        case "message_update": {
          const ame = (event as Record<string, unknown>).assistantMessageEvent as Record<string, unknown> | undefined;
          if (!ame) return;
          const id = assistantIdRef.current;
          if (!id) return;
          if (ame.type === "text_delta") {
            const delta = ame.delta as string;
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m)));
          }
          if (ame.type === "thinking_delta") {
            const delta = ame.delta as string;
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, thinking: (m.thinking ?? "") + delta } : m)));
          }
          break;
        }
        case "message_end": {
          const id = assistantIdRef.current;
          if (!id) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, pending: false } : m))
          );
          assistantIdRef.current = null;
          break;
        }
        case "agent_start":
          setIsStreaming(true);
          break;
        case "agent_end":
          setIsStreaming(false);
          break;
        case "tool_execution_start": {
          const toolName = (event as Record<string, unknown>).toolName as string | undefined;
          const msg: ChatMessage = {
            id: genId(),
            role: "tool",
            text: toolName ? `▶ ${toolName}` : "▶ tool",
            pending: true,
            createdAt: Date.now(),
          };
          setMessages((prev) => [...prev, msg]);
          break;
        }
        case "tool_execution_end": {
          const toolName = (event as Record<string, unknown>).toolName as string | undefined;
          const result = (event as Record<string, unknown>).result as Record<string, unknown> | undefined;
          const isError = (event as Record<string, unknown>).isError as boolean;
          const content = result?.content as Array<{ type: string; text?: string }> | undefined;
          const text = content?.map((c) => c.text).filter(Boolean).join("\n") ?? "";
          setMessages((prev) => {
            const rev = [...prev];
            for (let i = rev.length - 1; i >= 0; i--) {
              if (rev[i].role === "tool" && rev[i].pending) {
                rev[i] = {
                  ...rev[i],
                  text: `▶ ${toolName ?? "tool"}${text ? ": " + text.slice(0, 200) : ""}${isError ? " (error)" : ""}`,
                  pending: false,
                };
                break;
              }
            }
            return rev;
          });
          break;
        }
        case "queue_update": {
          const steering = (event as Record<string, unknown>).steering as string[] | undefined;
          const followUp = (event as Record<string, unknown>).followUp as string[] | undefined;
          const count = (steering?.length ?? 0) + (followUp?.length ?? 0);
          setPendingCount(count);
          break;
        }
        case "extension_ui_request": {
          const req = event as unknown as ExtensionUIRequest;
          if (req.method === "notify") {
            Alert.alert(req.title ?? "Notification", req.message ?? "");
          } else {
            setExtUI(req);
          }
          break;
        }
        case "system": {
          const text = (event as Record<string, unknown>).text as string | undefined;
          if (text) {
            const msg: ChatMessage = {
              id: genId(),
              role: "system",
              text,
              createdAt: Date.now(),
            };
            setMessages((prev) => [...prev, msg]);
          }
          break;
        }
        default:
          break;
      }
    });
    return unsub;
  }, [ws]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");

    if (text === "/new") {
      ws.newSession();
      const msg: ChatMessage = {
        id: genId(),
        role: "system",
        text: "Started new session.",
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
      return;
    }

    if (text.startsWith("/")) {
      // /resume, /name, etc - send as prompt for simplicity
      ws.prompt(text);
      const msg: ChatMessage = {
        id: genId(),
        role: "user",
        text,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
      return;
    }

    ws.prompt(text);
    const msg: ChatMessage = {
      id: genId(),
      role: "user",
      text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
  }, [input, ws]);

  const handleAbort = useCallback(() => {
    ws.abort();
    setIsStreaming(false);
  }, [ws]);

  const renderItem: ListRenderItem<ChatMessage> = useCallback(
    ({ item }) => {
      if (item.role === "user") {
        return (
          <View style={styles.userRow}>
            <View
              style={[
                styles.userBubble,
                { backgroundColor: isDark ? "#0a84ff" : "#007aff" },
              ]}
            >
              <Text style={styles.userText}>{item.text}</Text>
            </View>
          </View>
        );
      }
      if (item.role === "assistant") {
        return (
          <View style={styles.assistantRow}>
            <View
              style={[
                styles.assistantBubble,
                { backgroundColor: isDark ? "#2c2c2e" : "#e5e5ea" },
              ]}
            >
              {item.thinking ? (
                <View style={styles.thinkingBox}>
                  <Text style={[styles.thinkingLabel, { color: isDark ? "#8e8e93" : "#6e6e73" }]}>
                    thinking
                  </Text>
                  <Text style={[styles.thinkingText, { color: isDark ? "#aeaeb2" : "#8e8e93" }]}>
                    {item.thinking}
                  </Text>
                </View>
              ) : null}
              <Markdown
                style={{
                  body: {
                    color: isDark ? "#ffffff" : "#000000",
                    fontSize: 15,
                    lineHeight: 20,
                  },
                  code_inline: {
                    backgroundColor: isDark ? "#3a3a3c" : "#f2f2f7",
                    color: isDark ? "#ff9f0a" : "#c2410c",
                    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
                    paddingHorizontal: 4,
                    borderRadius: 4,
                  },
                  code_block: {
                    backgroundColor: isDark ? "#1c1c1e" : "#f2f2f7",
                    color: isDark ? "#ffffff" : "#000000",
                    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
                    padding: 10,
                    borderRadius: 8,
                    marginVertical: 4,
                  },
                  bullet_list: { marginVertical: 4 },
                  ordered_list: { marginVertical: 4 },
                  heading1: { fontSize: 18, fontWeight: "700", marginVertical: 4, color: isDark ? "#fff" : "#000" },
                  heading2: { fontSize: 16, fontWeight: "600", marginVertical: 4, color: isDark ? "#fff" : "#000" },
                  heading3: { fontSize: 15, fontWeight: "600", marginVertical: 2, color: isDark ? "#fff" : "#000" },
                  paragraph: { marginVertical: 2 },
                  link: { color: isDark ? "#0a84ff" : "#007aff" },
                }}
              >
                {item.text || " "}
              </Markdown>
              {item.pending ? (
                <Text style={[styles.pendingLabel, { color: isDark ? "#8e8e93" : "#6e6e73" }]}>
                  …
                </Text>
              ) : null}
            </View>
          </View>
        );
      }
      if (item.role === "tool") {
        return (
          <View style={styles.centerRow}>
            <Text style={[styles.toolText, { color: isDark ? "#8e8e93" : "#6e6e73" }]}>
              {item.text}
            </Text>
          </View>
        );
      }
      // system
      return (
        <View style={styles.centerRow}>
          <Text style={[styles.systemText, { color: isDark ? "#636366" : "#aeaeb2" }]}>
            {item.text}
          </Text>
        </View>
      );
    },
    [isDark]
  );

  const bg = isDark ? "#0c0c0c" : "#ffffff";
  const inputBg = isDark ? "#1c1c1e" : "#f2f2f7";
  const inputColor = isDark ? "#ffffff" : "#000000";

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <View style={[styles.inputBar, { backgroundColor: isDark ? "#1c1c1e" : "#f2f2f7", borderTopColor: isDark ? "#2c2c2e" : "#e5e5ea" }]}>
        <TextInput
          style={[
            styles.textInput,
            { backgroundColor: inputBg, color: inputColor, borderColor: isDark ? "#3a3a3c" : "#d1d1d6" },
          ]}
          value={input}
          onChangeText={setInput}
          placeholder="Message…"
          placeholderTextColor={isDark ? "#8e8e93" : "#c7c7cc"}
          multiline
          maxLength={4000}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        {isStreaming ? (
          <TouchableOpacity onPress={handleAbort} style={styles.sendBtn}>
            <Text style={{ color: "#ff3b30", fontWeight: "600", fontSize: 16 }}>
              Abort
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleSend} disabled={!input.trim()} style={styles.sendBtn}>
            <Text
              style={{
                color: input.trim() ? (isDark ? "#0a84ff" : "#007aff") : isDark ? "#48484a" : "#c7c7cc",
                fontWeight: "600",
                fontSize: 16,
              }}
            >
              Send
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ExtensionUIModal
        request={extUI}
        onClose={() => setExtUI(null)}
        ws={ws}
        isDark={isDark}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingVertical: 8, paddingHorizontal: 8 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerTitle: { flexDirection: "row", alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pendingText: { fontSize: 13, fontWeight: "500" },
  userRow: { flexDirection: "row", justifyContent: "flex-end", marginVertical: 4 },
  userBubble: {
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "80%",
  },
  userText: { color: "#ffffff", fontSize: 15, lineHeight: 20 },
  assistantRow: { flexDirection: "row", justifyContent: "flex-start", marginVertical: 4 },
  assistantBubble: {
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "85%",
  },
  thinkingBox: {
    marginBottom: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(120,120,128,0.12)",
  },
  thinkingLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", marginBottom: 2 },
  thinkingText: { fontSize: 13, fontStyle: "italic", lineHeight: 18 },
  pendingLabel: { fontSize: 13, marginTop: 4, fontWeight: "500" },
  centerRow: { alignItems: "center", marginVertical: 4, paddingHorizontal: 20 },
  toolText: { fontSize: 13, fontStyle: "italic" },
  systemText: { fontSize: 12, textAlign: "center" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  textInput: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 120,
    fontSize: 15,
    lineHeight: 20,
  },
  sendBtn: {
    marginLeft: 10,
    paddingHorizontal: 6,
    paddingVertical: 8,
    marginBottom: 2,
  },
});
