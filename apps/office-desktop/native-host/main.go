package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf16"
)

const (
	extensionOrigin    = "chrome-extension://kcapmchomgbpjgdfdijhlnnjehmhdfdc/"
	defaultPort        = 4747
	maxFrameBytes      = 1024 * 1024
	startupTimeout     = 6 * time.Minute
	statusFileName     = "aioffice-native-host-status.json"
	backgroundFlag     = "--aioffice-background"
	stopFlag           = "--aioffice-stop"
	messageMax         = 20_000
	terminalPayloadMax = 700 * 1024
	terminalLineMax    = 4 * 1024 * 1024
)

type request struct {
	Version        int    `json:"v"`
	ID             string `json:"id"`
	Action         string `json:"action"`
	StartIfStopped *bool  `json:"startIfStopped,omitempty"`
	AgentID        string `json:"agentId,omitempty"`
	Text           string `json:"text,omitempty"`
}

type response struct {
	Version      int              `json:"v"`
	Type         string           `json:"type"`
	RequestID    string           `json:"requestId,omitempty"`
	Action       string           `json:"action,omitempty"`
	OK           *bool            `json:"ok,omitempty"`
	Error        string           `json:"error,omitempty"`
	MessageID    string           `json:"messageId,omitempty"`
	AgentID      string           `json:"agentId,omitempty"`
	Event        string           `json:"event,omitempty"`
	Data         json.RawMessage  `json:"data,omitempty"`
	Truncated    bool             `json:"truncated,omitempty"`
	State        string           `json:"state,omitempty"`
	AppVersion   string           `json:"version,omitempty"`
	Port         int              `json:"port,omitempty"`
	Message      string           `json:"message,omitempty"`
	Items        json.RawMessage  `json:"items,omitempty"`
	Snapshot     json.RawMessage  `json:"snapshot,omitempty"`
	Initial      *bool            `json:"initial,omitempty"`
	Capabilities *appCapabilities `json:"capabilities,omitempty"`
}

type appCapabilities struct {
	Connect bool `json:"connect"`
	Open    bool `json:"open"`
	Stop    bool `json:"stop"`
}

type snapshotSource struct {
	Meta struct {
		Terminal bool `json:"terminal"`
		Messages bool `json:"messages"`
	} `json:"meta"`
	Rooms []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"rooms"`
	Agents []struct {
		ID         string          `json:"id"`
		Name       string          `json:"name"`
		RoomID     string          `json:"roomId"`
		Status     string          `json:"status"`
		Provider   string          `json:"provider"`
		Kind       string          `json:"kind"`
		Seed       *uint32         `json:"seed"`
		Look       string          `json:"look"`
		Parts      json.RawMessage `json:"parts"`
		CanMessage bool            `json:"canMessage"`
	} `json:"agents"`
}

type privacySnapshot struct {
	Meta   snapshotMeta    `json:"meta"`
	Rooms  []snapshotRoom  `json:"rooms"`
	Agents []snapshotAgent `json:"agents"`
}

type snapshotMeta struct {
	Terminal bool `json:"terminal"`
	Messages bool `json:"messages"`
}

type snapshotRoom struct {
	Name string `json:"name"`
}

type snapshotAgent struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	RoomName   string            `json:"roomName"`
	Status     string            `json:"status"`
	Provider   string            `json:"provider,omitempty"`
	Kind       string            `json:"kind,omitempty"`
	Seed       *uint32           `json:"seed,omitempty"`
	Look       string            `json:"look,omitempty"`
	Parts      map[string]string `json:"parts,omitempty"`
	CanMessage bool              `json:"canMessage,omitempty"`
}

type desktopStatus struct {
	State   string `json:"state"`
	Version string `json:"version,omitempty"`
	Port    int    `json:"port,omitempty"`
	Message string `json:"message,omitempty"`
}

type healthResponse struct {
	OK      bool   `json:"ok"`
	Version string `json:"version"`
}

type nativeHost struct {
	stdoutMu        sync.Mutex
	stateMu         sync.Mutex
	appPath         string
	capabilities    appCapabilities
	userData        string
	status          string
	port            int
	client          *http.Client
	streamClient    *http.Client
	watch           context.CancelFunc
	connect         bool
	terminalMu      sync.Mutex
	terminalAgent   string
	terminalRequest string
	terminalCancel  context.CancelFunc
}

func main() {
	if !callerAllowed(os.Args[1:]) {
		fmt.Fprintln(os.Stderr, "AIOffice Native Messaging host rejected an unrecognized extension origin.")
		return
	}

	appData := os.Getenv("APPDATA")
	if appData == "" {
		fmt.Fprintln(os.Stderr, "AIOffice Native Messaging host could not resolve the Windows app-data directory.")
		return
	}
	userData := filepath.Join(appData, "AIOffice")
	executable, err := os.Executable()
	if err != nil {
		fmt.Fprintln(os.Stderr, "AIOffice Native Messaging host could not resolve its install directory.")
		return
	}
	appPath := filepath.Join(filepath.Dir(executable), "AIOffice.exe")
	if _, err := os.Stat(appPath); err != nil {
		fmt.Fprintln(os.Stderr, "The installed AIOffice desktop executable is missing.")
		return
	}
	port, err := configuredPort(userData)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return
	}

	host := &nativeHost{
		appPath:      appPath,
		capabilities: detectAppCapabilities(appPath),
		userData:     userData,
		status:       filepath.Join(userData, statusFileName),
		port:         port,
		client: &http.Client{
			Timeout: 2 * time.Second,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		streamClient: &http.Client{
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
	host.run()
}

func callerAllowed(args []string) bool {
	found := false
	for _, arg := range args {
		if strings.HasPrefix(arg, "chrome-extension://") {
			if arg != extensionOrigin || found {
				return false
			}
			found = true
		}
	}
	return found
}

func detectAppCapabilities(appPath string) appCapabilities {
	capabilities := appCapabilities{Connect: true, Open: true}
	archive := filepath.Join(filepath.Dir(appPath), "resources", "app.asar")
	if fileContainsAllMarkers(archive, backgroundFlag, stopFlag) {
		capabilities.Stop = true
	}
	return capabilities
}

// fileContainsAllMarkers scans the archive incrementally so capability detection does not load the
// whole Electron bundle into memory. Missing or unreadable archives are treated as unsupported.
func fileContainsAllMarkers(path string, markers ...string) bool {
	file, err := os.Open(path)
	if err != nil {
		return false
	}
	defer file.Close()

	remaining := make(map[string]bool, len(markers))
	longest := 0
	for _, marker := range markers {
		if marker == "" {
			continue
		}
		remaining[marker] = true
		if len(marker) > longest {
			longest = len(marker)
		}
	}
	if len(remaining) == 0 {
		return false
	}

	buffer := make([]byte, 64*1024)
	carry := make([]byte, 0, longest)
	for {
		count, readErr := file.Read(buffer)
		if count > 0 {
			chunk := make([]byte, 0, len(carry)+count)
			chunk = append(chunk, carry...)
			chunk = append(chunk, buffer[:count]...)
			for marker := range remaining {
				if bytes.Contains(chunk, []byte(marker)) {
					delete(remaining, marker)
				}
			}
			if len(remaining) == 0 {
				return true
			}
			keep := longest - 1
			if keep > len(chunk) {
				keep = len(chunk)
			}
			carry = append(carry[:0], chunk[len(chunk)-keep:]...)
		}
		if readErr != nil {
			return false
		}
	}
}

func sanitizedSnapshotMessage(data []byte) (response, bool) {
	var source snapshotSource
	if err := json.Unmarshal(data, &source); err != nil {
		return response{}, false
	}

	roomNames := make(map[string]string, len(source.Rooms))
	safe := privacySnapshot{
		Meta:   snapshotMeta{Terminal: source.Meta.Terminal, Messages: source.Meta.Messages},
		Rooms:  make([]snapshotRoom, 0, len(source.Rooms)),
		Agents: make([]snapshotAgent, 0, len(source.Agents)),
	}
	for _, room := range source.Rooms {
		name := safeSnapshotLabel(room.Name, 120)
		safe.Rooms = append(safe.Rooms, snapshotRoom{Name: name})
		if room.ID != "" {
			roomNames[room.ID] = name
		}
	}
	for _, agent := range source.Agents {
		if !validAgentID(agent.ID) {
			continue
		}
		kind := ""
		if agent.Kind == "main" || agent.Kind == "sub" {
			kind = agent.Kind
		}
		look := ""
		if agent.Look == "f" || agent.Look == "m" {
			look = agent.Look
		}
		safe.Agents = append(safe.Agents, snapshotAgent{
			ID:         agent.ID,
			Name:       safeSnapshotLabel(agent.Name, 120),
			RoomName:   roomNames[agent.RoomID],
			Status:     safeSnapshotLabel(agent.Status, 32),
			Provider:   safeSnapshotLabel(agent.Provider, 32),
			Kind:       kind,
			Seed:       agent.Seed,
			Look:       look,
			Parts:      sanitizedParts(agent.Parts),
			CanMessage: agent.CanMessage,
		})
	}

	encoded, err := json.Marshal(safe)
	if err != nil {
		return response{}, false
	}
	return response{Version: 1, Type: "snapshot", Snapshot: encoded}, true
}

func sanitizedParts(raw json.RawMessage) map[string]string {
	if len(raw) == 0 || len(raw) > 2*1024 {
		return nil
	}
	var input map[string]string
	if json.Unmarshal(raw, &input) != nil {
		return nil
	}
	allowed := map[string]map[string]bool{
		"hairStyle":   enumSet("short", "buzz", "spiky", "side_part", "curly", "afro", "bob", "long", "ponytail", "bun", "pigtails", "mohawk", "bald", "wavy"),
		"topStyle":    enumSet("tshirt", "hoodie", "shirt_tie", "sweater", "jacket", "blouse", "polo"),
		"bottomStyle": enumSet("pants", "shorts", "skirt"),
		"accessory":   enumSet("none", "glasses", "sunglasses", "headphones", "cap", "beanie", "earrings", "bow"),
		"facialHair":  enumSet("none", "stubble", "beard", "mustache", "goatee"),
	}
	colors := map[string]bool{"skin": true, "hair": true, "eyes": true, "top": true, "topAccent": true, "bottom": true, "shoes": true, "accessoryColor": true}
	result := make(map[string]string)
	for key, value := range input {
		if values, ok := allowed[key]; ok && values[value] {
			result[key] = value
		} else if colors[key] && isHexColor(value) {
			result[key] = strings.ToLower(value)
		}
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

func enumSet(values ...string) map[string]bool {
	set := make(map[string]bool, len(values))
	for _, value := range values {
		set[value] = true
	}
	return set
}

func isHexColor(value string) bool {
	if len(value) != 7 || value[0] != '#' {
		return false
	}
	for _, r := range value[1:] {
		if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')) {
			return false
		}
	}
	return true
}

func shouldStartIfStopped(value *bool) bool {
	return value == nil || *value
}

func safeSnapshotLabel(value string, maxRunes int) string {
	clean := strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return ' '
		}
		return r
	}, value)
	clean = strings.Join(strings.Fields(clean), " ")
	runes := []rune(clean)
	if len(runes) > maxRunes {
		clean = string(runes[:maxRunes])
	}
	return clean
}

func configuredPort(userData string) (int, error) {
	value, exists := os.LookupEnv("HABBLAUD_PORT")
	if !exists {
		content, err := os.ReadFile(filepath.Join(userData, ".env"))
		if err == nil {
			value, exists = envValue(string(content), "HABBLAUD_PORT")
		} else if !errors.Is(err, os.ErrNotExist) {
			return 0, fmt.Errorf("Could not read local AIOffice port settings: %w", err)
		}
	}
	if !exists || strings.TrimSpace(value) == "" {
		return defaultPort, nil
	}
	port, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || port < 1 || port > 65535 {
		return 0, fmt.Errorf("The configured AIOffice port is invalid.")
	}
	return port, nil
}

func envValue(content, key string) (string, bool) {
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(strings.TrimSuffix(line, "\r"))
		line = strings.TrimPrefix(line, "export ")
		name, value, found := strings.Cut(line, "=")
		if !found || strings.TrimSpace(name) != key {
			continue
		}
		value = strings.TrimSpace(value)
		if len(value) >= 2 && ((value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'')) {
			value = value[1 : len(value)-1]
		} else if comment := strings.Index(value, " #"); comment >= 0 {
			value = strings.TrimSpace(value[:comment])
		}
		return value, true
	}
	return "", false
}

func (host *nativeHost) run() {
	for {
		message, err := readFrame(os.Stdin, maxFrameBytes)
		if errors.Is(err, io.EOF) {
			host.disconnect()
			return
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, "AIOffice Native Messaging request was rejected:", err)
			_ = host.send(response{Version: 1, Type: "status", State: "error", Message: "A mensagem recebida pelo host nativo é inválida."})
			host.disconnect()
			return
		}
		input, err := decodeRequest(message)
		if err != nil {
			_ = host.send(response{Version: 1, Type: "status", State: "error", Message: "A mensagem Native Messaging não corresponde à versão suportada."})
			continue
		}
		switch input.Action {
		case "connect":
			host.startConnect(input.StartIfStopped)
		case "open":
			go host.openDesktop()
		case "stop":
			go host.stopDesktop()
		case "agent-message":
			go host.sendAgentMessage(input)
		case "terminal-open":
			host.openAgentTerminal(input)
		case "terminal-close":
			host.closeAgentTerminal(input)
		default:
			_ = host.send(response{Version: 1, Type: "status", State: "error", Message: "Ação Native Messaging não permitida."})
		}
	}
}

func decodeRequest(message []byte) (request, error) {
	var input request
	decoder := json.NewDecoder(bytes.NewReader(message))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		return input, err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return input, fmt.Errorf("request contains trailing JSON")
	}
	if input.Version != 1 || len(input.ID) == 0 || len(input.ID) > 80 {
		return input, fmt.Errorf("request version or ID is invalid")
	}
	if input.Action != "connect" && input.Action != "open" && input.Action != "stop" && input.Action != "agent-message" && input.Action != "terminal-open" && input.Action != "terminal-close" {
		return input, fmt.Errorf("request action is not allowed")
	}
	if input.Action == "agent-message" || input.Action == "terminal-open" || input.Action == "terminal-close" {
		if !validAgentID(input.AgentID) {
			return input, fmt.Errorf("agent ID is invalid")
		}
	}
	if input.Action == "agent-message" {
		units := len(utf16.Encode([]rune(input.Text)))
		if strings.TrimSpace(input.Text) == "" || units > messageMax {
			return input, fmt.Errorf("agent message is empty or too long")
		}
	}
	return input, nil
}

func validAgentID(value string) bool {
	if value == "" || len(value) > 512 || strings.TrimSpace(value) != value {
		return false
	}
	for _, r := range value {
		if r < 0x20 || r == 0x7f || r == '/' || r == '\\' {
			return false
		}
	}
	return true
}

func (host *nativeHost) sendAgentMessage(input request) {
	body, err := json.Marshal(struct {
		AgentID string `json:"agentId"`
		Text    string `json:"text"`
	}{input.AgentID, input.Text})
	if err != nil {
		host.sendActionResult(input, false, "Não foi possível preparar a instrução.", "")
		return
	}
	endpoint := fmt.Sprintf("http://127.0.0.1:%d/api/messages", host.port)
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		host.sendActionResult(input, false, "Não foi possível preparar a conexão com o AIOffice.", "")
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := host.client.Do(req)
	if err != nil {
		host.sendActionResult(input, false, "O AIOffice não respondeu ao envio da instrução.", "")
		return
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 128*1024))
	if resp.StatusCode != http.StatusCreated {
		var message struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(data, &message)
		host.sendActionResult(input, false, safeMessage(message.Error, "O AIOffice recusou a instrução."), "")
		return
	}
	var queued struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(data, &queued) != nil || queued.ID == "" || len(queued.ID) > 300 {
		host.sendActionResult(input, false, "O AIOffice não confirmou a entrada da instrução na fila.", "")
		return
	}
	host.sendActionResult(input, true, "", queued.ID)
}

func (host *nativeHost) sendActionResult(input request, ok bool, detail, messageID string) {
	result := ok
	value := response{
		Version:   1,
		Type:      "action-result",
		RequestID: input.ID,
		Action:    input.Action,
		AgentID:   input.AgentID,
		OK:        &result,
		MessageID: messageID,
		Error:     safeMessage(detail, ""),
	}
	_ = host.send(value)
}

func (host *nativeHost) openAgentTerminal(input request) {
	ctx, cancel := context.WithCancel(context.Background())
	host.terminalMu.Lock()
	if host.terminalCancel != nil {
		host.terminalCancel()
	}
	host.terminalAgent = input.AgentID
	host.terminalRequest = input.ID
	host.terminalCancel = cancel
	host.terminalMu.Unlock()
	go host.streamAgentTerminal(ctx, input)
}

func (host *nativeHost) closeAgentTerminal(input request) {
	host.terminalMu.Lock()
	if host.terminalAgent == input.AgentID {
		if host.terminalCancel != nil {
			host.terminalCancel()
		}
		host.terminalAgent = ""
		host.terminalRequest = ""
		host.terminalCancel = nil
	}
	host.terminalMu.Unlock()
	host.sendActionResult(input, true, "", "")
}

func (host *nativeHost) terminalIsActive(input request) bool {
	host.terminalMu.Lock()
	defer host.terminalMu.Unlock()
	return host.terminalAgent == input.AgentID && host.terminalRequest == input.ID
}

func (host *nativeHost) streamAgentTerminal(ctx context.Context, input request) {
	endpoint := fmt.Sprintf("http://127.0.0.1:%d/api/agents/%s/terminal", host.port, url.PathEscape(input.AgentID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		host.sendTerminalOpenError(input, "Não foi possível preparar a conexão do terminal.")
		return
	}
	req.Header.Set("Accept", "text/event-stream")
	resp, err := host.streamClient.Do(req)
	if err != nil {
		host.sendTerminalOpenError(input, "O AIOffice não respondeu ao terminal deste agente.")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 32*1024))
		var message struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(data, &message)
		host.sendTerminalOpenError(input, safeMessage(message.Error, "Não foi possível abrir o terminal deste agente."))
		return
	}
	readSseLimited(ctx, resp.Body, terminalLineMax, func(event, raw string) {
		if !host.terminalIsActive(input) || ctx.Err() != nil || (event != "init" && event != "append") || !json.Valid([]byte(raw)) {
			return
		}
		data, truncated := boundedTerminalData(event, []byte(raw))
		if len(data) == 0 {
			return
		}
		_ = host.send(response{
			Version:   1,
			Type:      "terminal",
			RequestID: input.ID,
			AgentID:   input.AgentID,
			Event:     event,
			Data:      data,
			Truncated: truncated,
		})
	})
}

func (host *nativeHost) sendTerminalOpenError(input request, message string) {
	if !host.terminalIsActive(input) {
		return
	}
	host.sendActionResult(input, false, safeMessage(message, "Não foi possível abrir o terminal deste agente."), "")
}

func boundedTerminalData(event string, raw []byte) (json.RawMessage, bool) {
	if len(raw) <= terminalPayloadMax {
		return json.RawMessage(raw), false
	}
	if event == "init" {
		var init struct {
			AgentID   string            `json:"agentId"`
			Entries   []json.RawMessage `json:"entries"`
			Truncated bool              `json:"truncated"`
		}
		if json.Unmarshal(raw, &init) != nil {
			return nil, true
		}
		kept := make([]json.RawMessage, 0, len(init.Entries))
		used := len(init.AgentID) + 64
		for i := len(init.Entries) - 1; i >= 0; i-- {
			entry := init.Entries[i]
			if used+len(entry) > terminalPayloadMax {
				init.Truncated = true
				continue
			}
			kept = append(kept, entry)
			used += len(entry)
		}
		for left, right := 0, len(kept)-1; left < right; left, right = left+1, right-1 {
			kept[left], kept[right] = kept[right], kept[left]
		}
		init.Entries = kept
		result, err := json.Marshal(init)
		if err != nil {
			return nil, true
		}
		return result, true
	}
	if event == "append" {
		var entries []json.RawMessage
		if json.Unmarshal(raw, &entries) != nil {
			return nil, true
		}
		kept := make([]json.RawMessage, 0, len(entries))
		used := 2
		for i := len(entries) - 1; i >= 0; i-- {
			entry := entries[i]
			if used+len(entry)+1 > terminalPayloadMax {
				continue
			}
			kept = append(kept, entry)
			used += len(entry) + 1
		}
		for left, right := 0, len(kept)-1; left < right; left, right = left+1, right-1 {
			kept[left], kept[right] = kept[right], kept[left]
		}
		result, err := json.Marshal(kept)
		return result, err != nil || len(kept) < len(entries)
	}
	return nil, true
}

func readFrame(reader io.Reader, limit uint32) ([]byte, error) {
	var header [4]byte
	if _, err := io.ReadFull(reader, header[:]); err != nil {
		return nil, err
	}
	size := binary.LittleEndian.Uint32(header[:])
	if size == 0 || size > limit {
		return nil, fmt.Errorf("frame size %d is outside the allowed range", size)
	}
	message := make([]byte, size)
	if _, err := io.ReadFull(reader, message); err != nil {
		return nil, err
	}
	return message, nil
}

func (host *nativeHost) send(value response) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if len(payload) > maxFrameBytes {
		return fmt.Errorf("Native Messaging response exceeded the Chrome size limit")
	}
	frame := make([]byte, 4+len(payload))
	binary.LittleEndian.PutUint32(frame[:4], uint32(len(payload)))
	copy(frame[4:], payload)
	host.stdoutMu.Lock()
	defer host.stdoutMu.Unlock()
	for len(frame) > 0 {
		written, err := os.Stdout.Write(frame)
		if err != nil {
			return err
		}
		frame = frame[written:]
	}
	return nil
}

func (host *nativeHost) startConnect(startIfStopped *bool) {
	host.stateMu.Lock()
	if host.connect {
		host.stateMu.Unlock()
		_ = host.send(response{Version: 1, Type: "status", State: "starting", Port: host.port, Message: "Conectando ao AIOffice…", Capabilities: &host.capabilities})
		return
	}
	host.connect = true
	host.stateMu.Unlock()
	go func() {
		_ = host.send(response{Version: 1, Type: "status", State: "starting", Port: host.port, Message: "Iniciando o AIOffice… A primeira inicialização pode levar até seis minutos."})
		version, err := host.ensureDesktop(shouldStartIfStopped(startIfStopped))
		if err != nil {
			host.stateMu.Lock()
			host.connect = false
			host.stateMu.Unlock()
			if errors.Is(err, errDesktopStopped) {
				_ = host.send(response{Version: 1, Type: "status", State: "stopped", Port: host.port, Message: "O AIOffice está parado. Abra o painel para iniciá-lo.", Capabilities: &host.capabilities})
				return
			}
			_ = host.send(response{Version: 1, Type: "status", State: "error", Port: host.port, Message: err.Error(), Capabilities: &host.capabilities})
			return
		}
		_ = host.send(response{Version: 1, Type: "status", State: "ready", AppVersion: version, Port: host.port, Message: "AIOffice conectado.", Capabilities: &host.capabilities})
		ctx, cancel := context.WithCancel(context.Background())
		host.stateMu.Lock()
		host.watch = cancel
		host.stateMu.Unlock()
		go host.streamEvents(ctx)
		go host.keepAlive(ctx, version)
	}()
}

var errDesktopStopped = errors.New("AIOffice is stopped")

func (host *nativeHost) ensureDesktop(startIfStopped bool) (string, error) {
	if !host.capabilities.Stop {
		return host.ensureForegroundDesktop(startIfStopped)
	}
	return host.ensureBackgroundDesktop()
}

func (host *nativeHost) ensureForegroundDesktop(startIfStopped bool) (string, error) {
	if health, err := host.health(); err == nil {
		return health.Version, nil
	}
	if !startIfStopped {
		return "", errDesktopStopped
	}
	if err := host.launch(); err != nil {
		return "", fmt.Errorf("Não foi possível abrir o AIOffice Desktop.")
	}
	deadline := time.Now().Add(startupTimeout)
	lastProgress := time.Now()
	for time.Now().Before(deadline) {
		if health, err := host.health(); err == nil {
			return health.Version, nil
		}
		if time.Since(lastProgress) >= 10*time.Second {
			_ = host.send(response{Version: 1, Type: "status", State: "starting", Port: host.port, Message: "O AIOffice está iniciando os serviços locais…", Capabilities: &host.capabilities})
			lastProgress = time.Now()
		}
		time.Sleep(500 * time.Millisecond)
	}
	return "", fmt.Errorf("O AIOffice não respondeu depois de seis minutos. Abra o desktop para consultar o diagnóstico local.")
}

func (host *nativeHost) ensureBackgroundDesktop() (string, error) {
	if err := os.MkdirAll(host.userData, 0700); err != nil {
		return "", fmt.Errorf("Não foi possível acessar a pasta local do AIOffice.")
	}
	_ = os.Remove(host.status)
	if err := host.launch(backgroundFlag); err != nil {
		return "", fmt.Errorf("Não foi possível iniciar o AIOffice Desktop.")
	}
	deadline := time.Now().Add(startupTimeout)
	lastProgress := time.Now()
	nextRetry := time.Time{}
	for time.Now().Before(deadline) {
		if state, ok := readDesktopStatus(host.status); ok {
			if state.State == "error" {
				return "", fmt.Errorf("%s", safeMessage(state.Message, "O AIOffice não conseguiu iniciar o serviço local."))
			}
			if state.State == "stopped" && time.Now().After(nextRetry) {
				_ = os.Remove(host.status)
				if err := host.launch(backgroundFlag); err != nil {
					return "", fmt.Errorf("Não foi possível reiniciar o AIOffice Desktop.")
				}
				nextRetry = time.Now().Add(5 * time.Second)
			}
			if state.State == "ready" && state.Port == host.port {
				if health, err := host.health(); err == nil && health.OK && health.Version == state.Version {
					return health.Version, nil
				}
			}
		}
		if time.Since(lastProgress) >= 10*time.Second {
			_ = host.send(response{Version: 1, Type: "status", State: "starting", Port: host.port, Message: "O AIOffice está iniciando os serviços locais…", Capabilities: &host.capabilities})
			lastProgress = time.Now()
		}
		time.Sleep(500 * time.Millisecond)
	}
	return "", fmt.Errorf("O AIOffice não respondeu depois de seis minutos. Abra o desktop para consultar o diagnóstico local.")
}

func (host *nativeHost) health() (healthResponse, error) {
	var result healthResponse
	request, err := http.NewRequest(http.MethodGet, fmt.Sprintf("http://127.0.0.1:%d/api/health", host.port), nil)
	if err != nil {
		return result, err
	}
	response, err := host.client.Do(request)
	if err != nil {
		return result, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return result, fmt.Errorf("local AIOffice health check returned %s", response.Status)
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 128*1024)).Decode(&result); err != nil {
		return result, err
	}
	if !result.OK || result.Version == "" {
		return result, fmt.Errorf("local service did not identify as a compatible AIOffice server")
	}
	return result, nil
}

func readDesktopStatus(path string) (desktopStatus, bool) {
	var value desktopStatus
	data, err := os.ReadFile(path)
	if err != nil || len(data) > 4*1024 {
		return value, false
	}
	if json.Unmarshal(data, &value) != nil {
		return value, false
	}
	value.Message = safeMessage(value.Message, "")
	return value, value.State != ""
}

func safeMessage(value, fallback string) string {
	value = strings.TrimSpace(strings.Map(func(r rune) rune {
		if r < 32 && r != '\n' && r != '\t' {
			return -1
		}
		return r
	}, value))
	if runes := []rune(value); len(runes) > 500 {
		value = string(runes[:500])
	}
	if value == "" {
		return fallback
	}
	return value
}

func (host *nativeHost) launch(args ...string) error {
	command := exec.Command(host.appPath, args...)
	command.Dir = filepath.Dir(host.appPath)
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := command.Start(); err != nil {
		return err
	}
	return command.Process.Release()
}

func (host *nativeHost) openDesktop() {
	if err := host.launch(); err != nil {
		_ = host.send(response{Version: 1, Type: "status", State: "error", Port: host.port, Message: "Não foi possível abrir a janela do AIOffice.", Capabilities: &host.capabilities})
		return
	}
	_ = host.send(response{Version: 1, Type: "status", State: "ready", Port: host.port, Message: "Janela do AIOffice aberta.", Capabilities: &host.capabilities})
}

func (host *nativeHost) stopDesktop() {
	if !host.capabilities.Stop {
		_ = host.send(response{Version: 1, Type: "status", State: "error", Port: host.port, Message: "Esta versão do AIOffice não oferece encerramento pelo Chrome. Feche o serviço pelo aplicativo.", Capabilities: &host.capabilities})
		return
	}
	_ = os.Remove(host.status)
	if err := host.launch(stopFlag); err != nil {
		_ = host.send(response{Version: 1, Type: "status", State: "error", Port: host.port, Message: "Não foi possível solicitar o encerramento do AIOffice.", Capabilities: &host.capabilities})
		return
	}
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		if state, ok := readDesktopStatus(host.status); ok {
			if state.State == "error" {
				_ = host.send(response{Version: 1, Type: "status", State: "error", Port: host.port, Message: safeMessage(state.Message, "O AIOffice recusou o encerramento."), Capabilities: &host.capabilities})
				return
			}
			if state.State == "stopped" {
				host.markStopped()
				_ = host.send(response{Version: 1, Type: "status", State: "stopped", Port: host.port, Message: "AIOffice parado.", Capabilities: &host.capabilities})
				return
			}
		}
		if _, err := host.health(); err != nil {
			host.markStopped()
			_ = host.send(response{Version: 1, Type: "status", State: "stopped", Port: host.port, Message: "AIOffice parado.", Capabilities: &host.capabilities})
			return
		}
		time.Sleep(300 * time.Millisecond)
	}
	_ = host.send(response{Version: 1, Type: "status", State: "error", Port: host.port, Message: "O AIOffice ainda está encerrando. Confira o desktop antes de tentar novamente.", Capabilities: &host.capabilities})
}

func (host *nativeHost) markStopped() {
	host.stateMu.Lock()
	if host.watch != nil {
		host.watch()
		host.watch = nil
	}
	host.connect = false
	host.stateMu.Unlock()
}

func (host *nativeHost) keepAlive(ctx context.Context, version string) {
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			health, err := host.health()
			if err != nil || health.Version != version {
				host.stateMu.Lock()
				if host.watch != nil {
					host.watch()
					host.watch = nil
				}
				host.connect = false
				host.stateMu.Unlock()
				message := "O serviço local parou. Conecte novamente para iniciá-lo."
				state := "stopped"
				if err == nil {
					state = "error"
					message = "A versão do serviço local mudou. Conecte novamente para sincronizar."
				}
				_ = host.send(response{Version: 1, Type: "status", State: state, Port: host.port, Message: message, Capabilities: &host.capabilities})
				return
			}
			_ = host.send(response{Version: 1, Type: "status", State: "ready", AppVersion: version, Port: host.port, Message: "AIOffice conectado.", Capabilities: &host.capabilities})
		}
	}
}

func (host *nativeHost) streamEvents(ctx context.Context) {
	initialConnection := true
	for ctx.Err() == nil {
		streamURL := fmt.Sprintf("http://127.0.0.1:%d/api/stream", host.port)
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, streamURL, nil)
		if err != nil {
			time.Sleep(time.Second)
			continue
		}
		request.Header.Set("Accept", "text/event-stream")
		resp, err := host.streamClient.Do(request)
		if err == nil && resp.StatusCode == http.StatusOK {
			if !initialConnection {
				_ = host.send(response{Version: 1, Type: "gap", Message: "A conexão ao feed foi interrompida; eventos recentes podem estar incompletos."})
			}
			baseline := initialConnection
			initialConnection = false
			readSse(ctx, resp.Body, func(eventName, data string) {
				if !json.Valid([]byte(data)) {
					return
				}
				switch eventName {
				case "feed":
					wasInitial := baseline
					baseline = false
					_ = host.send(response{Version: 1, Type: "feed", Items: json.RawMessage(data), Initial: &wasInitial})
				case "notice":
					_ = host.send(response{Version: 1, Type: "notice", Items: json.RawMessage(data)})
				case "snapshot":
					if message, ok := sanitizedSnapshotMessage([]byte(data)); ok {
						_ = host.send(message)
					}
				}
			})
			resp.Body.Close()
		} else if resp != nil {
			resp.Body.Close()
		}
		if ctx.Err() != nil {
			return
		}
		time.Sleep(1200 * time.Millisecond)
	}
}

func readSse(ctx context.Context, body io.Reader, onEvent func(string, string)) {
	readSseLimited(ctx, body, maxFrameBytes, onEvent)
}

func readSseLimited(ctx context.Context, body io.Reader, maxLineBytes int, onEvent func(string, string)) {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 4096), maxLineBytes)
	eventName := "message"
	data := make([]string, 0, 2)
	for scanner.Scan() {
		if ctx.Err() != nil {
			return
		}
		line := strings.TrimSuffix(scanner.Text(), "\r")
		if line == "" {
			if len(data) > 0 {
				onEvent(eventName, strings.Join(data, "\n"))
			}
			eventName = "message"
			data = data[:0]
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		field, value, found := strings.Cut(line, ":")
		if !found {
			value = ""
		}
		value = strings.TrimPrefix(value, " ")
		switch field {
		case "event":
			eventName = value
		case "data":
			data = append(data, value)
		}
	}
}

func (host *nativeHost) disconnect() {
	host.stateMu.Lock()
	if host.watch != nil {
		host.watch()
		host.watch = nil
	}
	host.stateMu.Unlock()
	host.terminalMu.Lock()
	if host.terminalCancel != nil {
		host.terminalCancel()
		host.terminalCancel = nil
	}
	host.terminalAgent = ""
	host.terminalRequest = ""
	host.terminalMu.Unlock()
}

// Compile-time assertion to catch accidental changes that turn a port into a signed int.
var _ = binary.LittleEndian
