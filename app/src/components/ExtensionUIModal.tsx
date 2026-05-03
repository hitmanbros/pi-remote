import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { PiWebSocket } from "../services/websocket";
import type { ExtensionUIRequest } from "../types";

interface Props {
  request: ExtensionUIRequest | null;
  onClose: () => void;
  ws: PiWebSocket;
  isDark: boolean;
}

export function ExtensionUIModal({ request, onClose, ws, isDark }: Props) {
  const [inputValue, setInputValue] = useState("");
  const visible = request !== null && !["setStatus", "setWidget", "setTitle", "set_editor_text"].includes(request?.method ?? "");

  useEffect(() => {
    if (request?.method === "input" || request?.method === "editor") {
      setInputValue(request.prefill ?? "");
    } else {
      setInputValue("");
    }
  }, [request]);

  if (!request || !visible) return null;

  const handleConfirm = (response?: Record<string, unknown>) => {
    ws.extensionUIResponse(request.id, response);
    onClose();
  };

  const handleCancel = () => {
    ws.extensionUIResponse(request.id, { cancelled: true });
    onClose();
  };

  const overlayBg = isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.4)";
  const cardBg = isDark ? "#2c2c2e" : "#ffffff";
  const textColor = isDark ? "#ffffff" : "#000000";
  const borderColor = isDark ? "#3a3a3c" : "#d1d1d6";
  const inputBg = isDark ? "#1c1c1e" : "#f2f2f7";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={[styles.overlay, { backgroundColor: overlayBg }]}>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          {request.title ? (
            <Text style={[styles.title, { color: textColor }]}>{request.title}</Text>
          ) : null}

          {request.method === "select" && (
            <>
              {request.message ? (
                <Text style={[styles.message, { color: isDark ? "#aeaeb2" : "#6e6e73" }]}>
                  {request.message}
                </Text>
              ) : null}
              <ScrollView style={styles.selectScroll}>
                {(request.options ?? []).map((opt, idx) => (
                  <TouchableOpacity
                    key={`${opt}-${idx}`}
                    style={[styles.optionBtn, { borderBottomColor: borderColor }]}
                    onPress={() => handleConfirm({ value: opt })}
                  >
                    <Text style={[styles.optionText, { color: textColor }]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
                <Text style={{ color: "#ff3b30", fontSize: 16, fontWeight: "600" }}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </>
          )}

          {request.method === "confirm" && (
            <>
              {request.message ? (
                <Text style={[styles.message, { color: isDark ? "#aeaeb2" : "#6e6e73" }]}>
                  {request.message}
                </Text>
              ) : null}
              <View style={styles.btnRow}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ff3b30" }]} onPress={() => handleConfirm({ confirmed: true })}>
                  <Text style={styles.actionBtnText}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? "#3a3a3c" : "#e5e5ea" }]} onPress={handleCancel}>
                  <Text style={[styles.actionBtnText, { color: isDark ? "#ffffff" : "#000000" }]}>
                    No
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {request.method === "input" && (
            <>
              <TextInput
                style={[
                  styles.dialogInput,
                  { backgroundColor: inputBg, color: textColor, borderColor },
                ]}
                value={inputValue}
                onChangeText={setInputValue}
                placeholder={request.placeholder ?? "Type here…"}
                placeholderTextColor={isDark ? "#8e8e93" : "#c7c7cc"}
                autoFocus
              />
              <View style={styles.btnRow}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? "#0a84ff" : "#007aff" }]} onPress={() => handleConfirm({ value: inputValue })}>
                  <Text style={styles.actionBtnText}>Submit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? "#3a3a3c" : "#e5e5ea" }]} onPress={handleCancel}>
                  <Text style={[styles.actionBtnText, { color: isDark ? "#ffffff" : "#000000" }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {request.method === "editor" && (
            <>
              <TextInput
                style={[
                  styles.dialogInput,
                  styles.editorInput,
                  { backgroundColor: inputBg, color: textColor, borderColor },
                ]}
                value={inputValue}
                onChangeText={setInputValue}
                placeholder={request.placeholder ?? "Type here…"}
                placeholderTextColor={isDark ? "#8e8e93" : "#c7c7cc"}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                autoFocus
              />
              <View style={styles.btnRow}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? "#0a84ff" : "#007aff" }]} onPress={() => handleConfirm({ value: inputValue })}>
                  <Text style={styles.actionBtnText}>Submit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? "#3a3a3c" : "#e5e5ea" }]} onPress={handleCancel}>
                  <Text style={[styles.actionBtnText, { color: isDark ? "#ffffff" : "#000000" }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxHeight: "80%",
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    marginBottom: 12,
    lineHeight: 20,
  },
  selectScroll: {
    maxHeight: 240,
    marginBottom: 8,
  },
  optionBtn: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    fontSize: 16,
  },
  cancelBtn: {
    alignSelf: "center",
    paddingVertical: 10,
  },
  dialogInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  editorInput: {
    minHeight: 120,
    paddingTop: 10,
  },
  btnRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
