package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCallerAllowedRequiresThePinnedExtensionOrigin(t *testing.T) {
	if !callerAllowed([]string{extensionOrigin, "--parent-window=123"}) {
		t.Fatal("pinned Chrome extension origin should be accepted")
	}
	if callerAllowed([]string{"chrome-extension://another-id/", "--parent-window=123"}) {
		t.Fatal("another extension origin must be rejected")
	}
	if callerAllowed([]string{"--parent-window=123"}) {
		t.Fatal("missing extension origin must be rejected")
	}
	if callerAllowed([]string{extensionOrigin, "chrome-extension://another-id/"}) {
		t.Fatal("multiple extension origins must be rejected")
	}
}

func TestConfiguredPortReadsOnlyConfiguredEnvironmentKey(t *testing.T) {
	value, ok := envValue("# comment\nOTHER=1\nHABBLAUD_PORT= 5100 # local\n", "HABBLAUD_PORT")
	if !ok || value != "5100" {
		t.Fatalf("unexpected parsed port %q (%v)", value, ok)
	}
	value, ok = envValue("HABBLAUD_PORT='5050'\n", "HABBLAUD_PORT")
	if !ok || value != "5050" {
		t.Fatalf("unexpected quoted port %q (%v)", value, ok)
	}
}

func TestReadFrameUsesLittleEndianAndRejectsOversizedInput(t *testing.T) {
	payload := []byte(`{"v":1,"id":"a","action":"connect"}`)
	frame := make([]byte, 4+len(payload))
	binary.LittleEndian.PutUint32(frame[:4], uint32(len(payload)))
	copy(frame[4:], payload)
	decoded, err := readFrame(bytes.NewReader(frame), maxFrameBytes)
	if err != nil || string(decoded) != string(payload) {
		t.Fatalf("unexpected frame decode: %s, %v", decoded, err)
	}
	if _, err := readFrame(bytes.NewReader([]byte{1, 0, 16, 0}), maxFrameBytes); err == nil {
		t.Fatal("oversized frame should fail before allocating the body")
	}
}

func TestNativeRequestRejectsUnknownFieldsAndActions(t *testing.T) {
	valid, err := decodeRequest([]byte(`{"v":1,"id":"x","action":"connect"}`))
	if err != nil || valid.Action != "connect" {
		t.Fatalf("valid connect should pass: %#v, %v", valid, err)
	}
	message, err := decodeRequest([]byte(`{"v":1,"id":"m1","action":"agent-message","agentId":".codex:thread","text":"Revisar o build"}`))
	if err != nil || message.AgentID != ".codex:thread" {
		t.Fatalf("valid agent message should pass: %#v, %v", message, err)
	}
	for _, raw := range []string{
		`{"v":1,"id":"x","action":"run"}`,
		`{"v":1,"id":"x","action":"agent-message","agentId":"safe/../other","text":"run"}`,
		`{"v":1,"id":"x","action":"terminal-open","agentId":"safe\\..\\other"}`,
		`{"v":1,"id":"x","action":"agent-message","agentId":"safe","text":"   "}`,
		`{"v":1,"id":"x","action":"connect","path":"C:\\"}`,
		`{"v":1,"id":"x","action":"connect"}{"action":"stop"}`,
	} {
		if _, err := decodeRequest([]byte(raw)); err == nil {
			t.Fatalf("invalid request should be rejected: %s", raw)
		}
	}
}

func TestReadFrameRejectsTruncatedBody(t *testing.T) {
	_, err := readFrame(bytes.NewReader([]byte{3, 0, 0, 0, '{'}), maxFrameBytes)
	if err == nil || err == io.EOF {
		t.Fatalf("truncated body should fail, got %v", err)
	}
}

func TestDetectAppCapabilitiesRequiresBothLifecycleMarkers(t *testing.T) {
	temp := t.TempDir()
	appPath := filepath.Join(temp, "AIOffice.exe")
	resources := filepath.Join(temp, "resources")
	if err := os.MkdirAll(resources, 0o700); err != nil {
		t.Fatal(err)
	}
	archive := filepath.Join(resources, "app.asar")
	for _, test := range []struct {
		name     string
		contents string
		wantStop bool
	}{
		{name: "both markers", contents: "prefix " + backgroundFlag + " middle " + stopFlag, wantStop: true},
		{name: "background marker only", contents: backgroundFlag},
		{name: "stop marker only", contents: stopFlag},
		{name: "no archive markers", contents: "desktop main module"},
	} {
		t.Run(test.name, func(t *testing.T) {
			if err := os.WriteFile(archive, []byte(test.contents), 0o600); err != nil {
				t.Fatal(err)
			}
			got := detectAppCapabilities(appPath)
			if !got.Connect || !got.Open || got.Stop != test.wantStop {
				t.Fatalf("unexpected capabilities: %#v", got)
			}
		})
	}
}

func TestCapabilityMarkerScanHandlesChunkBoundaries(t *testing.T) {
	temp := t.TempDir()
	path := filepath.Join(temp, "app.asar")
	contents := strings.Repeat("x", 64*1024-len(backgroundFlag)+2) + backgroundFlag + stopFlag
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	if !fileContainsAllMarkers(path, backgroundFlag, stopFlag) {
		t.Fatal("markers split across the scanner's read boundary should be detected")
	}
}

func TestStartIfStoppedDefaultsToLegacyTrue(t *testing.T) {
	if !shouldStartIfStopped(nil) {
		t.Fatal("omitted startIfStopped should preserve legacy behavior")
	}
	no := false
	yes := true
	if shouldStartIfStopped(&no) {
		t.Fatal("explicit false should not start a stopped desktop")
	}
	if !shouldStartIfStopped(&yes) {
		t.Fatal("explicit true should start a stopped desktop")
	}
	requestWithoutOption, err := decodeRequest([]byte(`{"v":1,"id":"x","action":"connect"}`))
	if err != nil || !shouldStartIfStopped(requestWithoutOption.StartIfStopped) {
		t.Fatalf("legacy request should default to starting: %#v, %v", requestWithoutOption, err)
	}
	requestWithoutStart, err := decodeRequest([]byte(`{"v":1,"id":"x","action":"connect","startIfStopped":false}`))
	if err != nil || shouldStartIfStopped(requestWithoutStart.StartIfStopped) {
		t.Fatalf("explicit false should survive request decoding: %#v, %v", requestWithoutStart, err)
	}
}

func TestSanitizedSnapshotOnlyContainsApprovedFields(t *testing.T) {
	input := []byte(`{"rev":12,"meta":{"terminal":true,"messages":true,"build":"private"},"rooms":[{"id":"C:\\Users\\Ana\\Project","name":"Workspace","path":"C:\\Users\\Ana\\Project","seed":5}],"agents":[{"id":"agent-private","roomId":"C:\\Users\\Ana\\Project","name":"Marina","status":"working","provider":"codex","kind":"main","seed":73,"look":"f","parts":{"hair":"#d9dbe0","topStyle":"jacket","notAllowed":"leak"},"canMessage":true,"account":"user@example.com","sessionId":"transcript-private","activity":{"text":"secret task text"},"tasks":[{"title":"secret task"}]}],"accounts":[{"id":"account-private"}],"transcript":"secret transcript"}`)
	message, ok := sanitizedSnapshotMessage(input)
	if !ok {
		t.Fatal("valid snapshot should be sanitized")
	}
	encoded, err := json.Marshal(message)
	if err != nil {
		t.Fatal(err)
	}
	text := string(encoded)
	for _, forbidden := range []string{"C:\\Users", "user@example.com", "transcript-private", "secret task", "secret transcript", "account-private", "\"rev\"", "\"build\"", "\"path\""} {
		if strings.Contains(text, forbidden) {
			t.Errorf("snapshot response leaked %q: %s", forbidden, text)
		}
	}
	var got map[string]any
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatal(err)
	}
	snapshot := got["snapshot"].(map[string]any)
	if got["type"] != "snapshot" || len(snapshot) != 3 {
		t.Fatalf("unexpected sanitized response: %s", text)
	}
	rooms := snapshot["rooms"].([]any)
	agents := snapshot["agents"].([]any)
	if len(rooms) != 1 || len(agents) != 1 {
		t.Fatalf("unexpected snapshot lists: %#v", snapshot)
	}
	room := rooms[0].(map[string]any)
	if len(room) != 1 || room["name"] != "Workspace" {
		t.Fatalf("unexpected sanitized room: %#v", room)
	}
	agent := agents[0].(map[string]any)
	if len(agent) != 10 || agent["id"] != "agent-private" || agent["name"] != "Marina" || agent["roomName"] != "Workspace" || agent["status"] != "working" || agent["provider"] != "codex" || agent["kind"] != "main" || agent["seed"] != float64(73) || agent["look"] != "f" || agent["canMessage"] != true {
		t.Fatalf("unexpected sanitized agent: %#v", agent)
	}
	parts := agent["parts"].(map[string]any)
	if len(parts) != 2 || parts["hair"] != "#d9dbe0" || parts["topStyle"] != "jacket" {
		t.Fatalf("unexpected sanitized appearance: %#v", parts)
	}
	meta := snapshot["meta"].(map[string]any)
	if len(meta) != 2 || meta["terminal"] != true || meta["messages"] != true {
		t.Fatalf("unexpected sanitized capabilities: %#v", meta)
	}
}

func TestBoundedTerminalDataKeepsNewestEntriesAndMarksTruncation(t *testing.T) {
	large := strings.Repeat("x", terminalPayloadMax+1)
	input, err := json.Marshal(map[string]any{"agentId": "agent-1", "entries": []map[string]any{
		{"kind": "user", "id": "old", "text": "old"},
		{"kind": "assistant", "id": "new", "text": large},
	}, "truncated": false})
	if err != nil {
		t.Fatal(err)
	}
	got, truncated := boundedTerminalData("init", input)
	if !truncated || len(got) > terminalPayloadMax {
		t.Fatalf("terminal init should be bounded and marked truncated: %d bytes, %v", len(got), truncated)
	}
	var decoded struct {
		Entries   []map[string]any `json:"entries"`
		Truncated bool             `json:"truncated"`
	}
	if err := json.Unmarshal(got, &decoded); err != nil {
		t.Fatal(err)
	}
	if !decoded.Truncated || len(decoded.Entries) != 1 || decoded.Entries[0]["id"] != "old" {
		t.Fatalf("unexpected bounded terminal init: %#v", decoded)
	}
}

func TestSanitizedSnapshotRejectsInvalidJSON(t *testing.T) {
	if _, ok := sanitizedSnapshotMessage([]byte(`{"rooms":`)); ok {
		t.Fatal("invalid snapshot JSON should not be forwarded")
	}
}
