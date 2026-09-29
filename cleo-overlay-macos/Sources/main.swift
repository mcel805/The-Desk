import AppKit
import ScreenCaptureKit
import CryptoKit

private struct LocalConfiguration: Decodable {
    let projectRoot: String
    let codexPath: String
}

private enum SessionMode {
    case stopped
    case running
    case paused
}

@MainActor
private final class CleoOverlay: NSObject, NSApplicationDelegate, NSTextFieldDelegate {
    private var window: NSWindow!
    private var sourcePicker: NSPopUpButton!
    private var permissionButton: NSButton!
    private var statusLabel: NSTextField!
    private var jevLabel: NSTextField!
    private var transcript: NSTextView!
    private var composer: NSTextField!
    private var startButton: NSButton!
    private var pauseButton: NSButton!
    private var endButton: NSButton!
    private var timer: Timer?
    private var mode: SessionMode = .stopped
    private var sessionID: String?
    private var lastMinuteKey = ""
    private var lastImage: URL?
    private var recentImages: [URL] = []
    private var lastCaptureAt: Date?
    private var priorAssessment: String?
    private var assessmentRunning = false
    private var availableWindows: [UInt32: SCWindow] = [:]
    private var selectedWindowID: UInt32?
    private var pendingQuestion: String?
    private var configuration: LocalConfiguration?

    func applicationDidFinishLaunching(_ notification: Notification) {
        configuration = loadConfiguration()
        buildWindow()
        refreshSources()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    private func loadConfiguration() -> LocalConfiguration? {
        guard let url = Bundle.main.url(forResource: "config", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(LocalConfiguration.self, from: data)
    }

    private func makeLabel(_ text: String, size: CGFloat = 12, color: NSColor = .secondaryLabelColor) -> NSTextField {
        let label = NSTextField(labelWithString: text)
        label.font = .systemFont(ofSize: size, weight: .medium)
        label.textColor = color
        label.lineBreakMode = .byWordWrapping
        label.maximumNumberOfLines = 0
        return label
    }

    private func makeButton(_ title: String, action: Selector) -> NSButton {
        let button = NSButton(title: title, target: self, action: action)
        button.bezelStyle = .rounded
        button.font = .systemFont(ofSize: 12, weight: .semibold)
        return button
    }

    private func buildWindow() {
        let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let width: CGFloat = 420
        let frame = NSRect(x: visible.maxX - width, y: visible.minY, width: width, height: visible.height)
        window = NSWindow(contentRect: frame, styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Cleo · Trading Session"
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.minSize = NSSize(width: 360, height: 520)
        window.isReleasedWhenClosed = false

        let root = NSView()
        root.wantsLayer = true
        root.layer?.backgroundColor = NSColor(calibratedRed: 0.055, green: 0.073, blue: 0.094, alpha: 1).cgColor
        window.contentView = root

        let title = makeLabel("CLEO", size: 21, color: NSColor(calibratedRed: 0.46, green: 0.86, blue: 0.78, alpha: 1))
        let subtitle = makeLabel("Chart context and paper trade review", size: 11)
        let titleStack = NSStackView(views: [title, subtitle])
        titleStack.orientation = .vertical
        titleStack.spacing = 2

        sourcePicker = NSPopUpButton(frame: .zero, pullsDown: false)
        sourcePicker.target = self
        sourcePicker.action = #selector(sourceChanged)
        let refreshButton = makeButton("Refresh windows", action: #selector(refreshClicked))
        let sourceRow = NSStackView(views: [sourcePicker, refreshButton])
        sourceRow.orientation = .horizontal
        sourceRow.spacing = 8
        sourcePicker.setContentHuggingPriority(.defaultLow, for: .horizontal)

        permissionButton = makeButton("Open Screen Recording settings", action: #selector(openCaptureSettings))
        permissionButton.isHidden = true

        startButton = makeButton("Start session", action: #selector(startClicked))
        pauseButton = makeButton("Pause", action: #selector(pauseClicked))
        endButton = makeButton("End", action: #selector(endClicked))
        let captureButton = makeButton("Capture now", action: #selector(captureClicked))
        let controls = NSStackView(views: [startButton, pauseButton, endButton, captureButton])
        controls.orientation = .horizontal
        controls.spacing = 5
        controls.distribution = .fillEqually

        statusLabel = makeLabel("Session stopped · no chart captured", size: 11)
        jevLabel = makeLabel("Jev: not connected · Cleo review: available after capture", size: 11,
                             color: NSColor(calibratedRed: 0.95, green: 0.75, blue: 0.39, alpha: 1))

        transcript = NSTextView()
        transcript.isEditable = false
        transcript.isSelectable = true
        transcript.font = .systemFont(ofSize: 13)
        transcript.textColor = .white
        transcript.backgroundColor = NSColor(calibratedRed: 0.075, green: 0.098, blue: 0.125, alpha: 1)
        transcript.textContainerInset = NSSize(width: 12, height: 12)
        transcript.string = "Cleo is ready. Choose the chart window and start a session. Captures stay in this Mac's Application Support folder.\n\n"
        let scroll = NSScrollView()
        scroll.documentView = transcript
        scroll.hasVerticalScroller = true
        scroll.borderType = .bezelBorder

        composer = NSTextField()
        composer.placeholderString = "Ask Cleo about this chart…"
        composer.delegate = self
        let sendButton = makeButton("Send", action: #selector(sendClicked))
        let composeRow = NSStackView(views: [composer, sendButton])
        composeRow.orientation = .horizontal
        composeRow.spacing = 8
        composer.setContentHuggingPriority(.defaultLow, for: .horizontal)

        let note = makeLabel("Screen observations are provisional. No broker orders are sent from this window.", size: 10)
        let top = NSStackView(views: [titleStack, sourceRow, controls, statusLabel, permissionButton, jevLabel])
        top.orientation = .vertical
        top.spacing = 10
        top.alignment = .leading
        top.translatesAutoresizingMaskIntoConstraints = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        composeRow.translatesAutoresizingMaskIntoConstraints = false
        note.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(top)
        root.addSubview(scroll)
        root.addSubview(composeRow)
        root.addSubview(note)

        NSLayoutConstraint.activate([
            top.topAnchor.constraint(equalTo: root.topAnchor, constant: 18),
            top.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 16),
            top.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -16),
            sourceRow.widthAnchor.constraint(equalTo: top.widthAnchor),
            controls.widthAnchor.constraint(equalTo: top.widthAnchor),
            statusLabel.widthAnchor.constraint(equalTo: top.widthAnchor),
            jevLabel.widthAnchor.constraint(equalTo: top.widthAnchor),
            scroll.topAnchor.constraint(equalTo: top.bottomAnchor, constant: 14),
            scroll.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 16),
            scroll.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -16),
            composeRow.topAnchor.constraint(equalTo: scroll.bottomAnchor, constant: 10),
            composeRow.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 16),
            composeRow.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -16),
            composeRow.bottomAnchor.constraint(equalTo: note.topAnchor, constant: -10),
            note.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 16),
            note.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -16),
            note.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -12),
        ])
        updateButtons()
    }

    private func append(_ line: String) {
        transcript.string += line + "\n\n"
        transcript.scrollToEndOfDocument(nil)
    }

    private func updateButtons() {
        startButton.isEnabled = mode != .running
        startButton.title = mode == .paused ? "Resume" : "Start session"
        pauseButton.isEnabled = mode == .running
        endButton.isEnabled = mode != .stopped
    }

    @objc private func refreshClicked() { refreshSources() }

    @objc private func openCaptureSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") {
            NSWorkspace.shared.open(url)
        }
    }

    private func refreshSources() {
        Task {
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
                let windows = content.windows.filter { candidate in
                    candidate.owningApplication?.bundleIdentifier != Bundle.main.bundleIdentifier &&
                    candidate.frame.width >= 300 && candidate.frame.height >= 250 &&
                    !(candidate.title ?? "").isEmpty
                }
                availableWindows = Dictionary(uniqueKeysWithValues: windows.map { ($0.windowID, $0) })
                sourcePicker.removeAllItems()
                for candidate in windows {
                    let appName = candidate.owningApplication?.applicationName ?? "Window"
                    sourcePicker.addItem(withTitle: "\(appName) · \(candidate.title ?? "")")
                    sourcePicker.lastItem?.tag = Int(candidate.windowID)
                }
                if let selectedWindowID, let index = windows.firstIndex(where: { $0.windowID == selectedWindowID }) {
                    sourcePicker.selectItem(at: index)
                } else {
                    selectedWindowID = windows.first?.windowID
                    if !windows.isEmpty { sourcePicker.selectItem(at: 0) }
                }
                if windows.isEmpty { statusLabel.stringValue = "No capturable windows found. Check Screen Recording permission." }
                permissionButton.isHidden = true
            } catch {
                statusLabel.stringValue = "Screen Recording access is needed to list chart windows."
                permissionButton.isHidden = false
            }
        }
    }

    @objc private func sourceChanged() {
        selectedWindowID = UInt32(sourcePicker.selectedItem?.tag ?? 0)
        if mode == .running { append("Source window changed. The next observation will use the new selection.") }
    }

    @objc private func startClicked() {
        guard selectedWindowID != nil else {
            statusLabel.stringValue = "Select a chart window first."
            return
        }
        if mode == .stopped {
            sessionID = UUID().uuidString
            lastMinuteKey = String(Int(Date().timeIntervalSince1970 / 60))
            lastImage = nil
            recentImages = []
            priorAssessment = nil
            append("Session started · \(Date().formatted(date: .abbreviated, time: .standard))")
        } else {
            append("Session resumed")
        }
        mode = .running
        updateButtons()
        statusLabel.stringValue = "Session running · waiting for the next minute"
        capture(reason: "session_start")
    }

    @objc private func pauseClicked() {
        mode = .paused
        updateButtons()
        statusLabel.stringValue = "Session paused · capture stopped"
        append("Session paused")
    }

    @objc private func endClicked() {
        mode = .stopped
        updateButtons()
        statusLabel.stringValue = "Session ended · captures saved locally"
        append("Session ended")
    }

    @objc private func captureClicked() { capture(reason: "manual") }

    private func tick() {
        guard mode == .running else { return }
        let now = Date()
        let second = Calendar.current.component(.second, from: now)
        guard second >= 2 else { return }
        let minuteKey = String(Int(now.timeIntervalSince1970 / 60))
        guard minuteKey != lastMinuteKey else { return }
        lastMinuteKey = minuteKey
        capture(reason: "minute_boundary")
    }

    private func sessionDirectory() throws -> URL {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let folder = support.appendingPathComponent("CleoOverlay/Sessions/\(sessionID ?? "manual")", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    private func capture(reason: String) {
        guard let selectedWindowID else {
            statusLabel.stringValue = "Select a chart window first."
            return
        }
        Task {
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
                guard let source = content.windows.first(where: { $0.windowID == selectedWindowID }) else {
                    statusLabel.stringValue = "Source window unavailable · session paused"
                    mode = .paused
                    updateButtons()
                    return
                }
                let filter = SCContentFilter(desktopIndependentWindow: source)
                let settings = SCStreamConfiguration()
                settings.width = max(1, Int(source.frame.width))
                settings.height = max(1, Int(source.frame.height))
                settings.showsCursor = false
                let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: settings)
                guard let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else {
                    throw NSError(domain: "CleoOverlay", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not encode screenshot"])
                }
                let stamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
                let folder = try sessionDirectory()
                let file = folder.appendingPathComponent("\(stamp).png")
                try png.write(to: file, options: .atomic)
                let record: [String: Any] = [
                    "captured_at": ISO8601DateFormatter().string(from: Date()),
                    "source_app": source.owningApplication?.applicationName ?? "unknown",
                    "source_window": source.title ?? "unknown",
                    "window_id": source.windowID,
                    "reason": reason,
                    "bar_complete": "unverified",
                    "image_file": file.lastPathComponent,
                    "sha256": SHA256.hash(data: png).map { String(format: "%02x", $0) }.joined(),
                ]
                let json = try JSONSerialization.data(withJSONObject: record, options: [.prettyPrinted, .sortedKeys])
                try json.write(to: file.deletingPathExtension().appendingPathExtension("json"), options: .atomic)
                lastImage = file
                recentImages.append(file)
                if recentImages.count > 5 { recentImages.removeFirst(recentImages.count - 5) }
                lastCaptureAt = Date()
                statusLabel.stringValue = "Captured \(Date().formatted(date: .omitted, time: .standard)) · \(source.owningApplication?.applicationName ?? "window")"
                append("Observation captured · \(reason) · \(file.lastPathComponent)")
                if mode == .running && reason == "minute_boundary" && Calendar.current.component(.minute, from: Date()) % 5 == 0 {
                    requestAssessment(question: nil, trigger: "five_minute")
                }
            } catch {
                statusLabel.stringValue = "Capture failed: \(error.localizedDescription)"
                append("Capture failed · \(error.localizedDescription)")
            }
        }
    }

    @objc private func sendClicked() {
        let question = composer.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty else { return }
        composer.stringValue = ""
        append("You · \(question)")
        requestAssessment(question: question, trigger: "manual_chat")
    }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        if commandSelector == #selector(NSResponder.insertNewline(_:)) { sendClicked(); return true }
        return false
    }

    private func requestAssessment(question: String?, trigger: String) {
        guard !assessmentRunning else {
            if let question { pendingQuestion = question; append("Cleo is reviewing. Your message is queued.") }
            return
        }
        guard let config = configuration, FileManager.default.isExecutableFile(atPath: config.codexPath) else {
            append("Cleo analysis unavailable: Codex CLI is not configured in this app build.")
            return
        }
        guard let image = lastImage else {
            append("Capture the chart before asking Cleo for a chart assessment.")
            return
        }
        assessmentRunning = true
        jevLabel.stringValue = "Jev: not connected · Cleo: reviewing \(trigger.replacingOccurrences(of: "_", with: " "))"
        let imagePaths = recentImages.isEmpty ? [image.path] : recentImages.map(\.path)
        let outputPath = (try? sessionDirectory().appendingPathComponent("cleo-\(UUID().uuidString).txt").path) ?? "/tmp/cleo-overlay-result.txt"
        let cutoff = lastCaptureAt?.formatted(.iso8601) ?? "unknown"
        let previous = priorAssessment ?? "No previous Cleo assessment in this session."
        let prompt = """
        You are Cleo, Mark's futures chart analyst. This is a paper/shadow assessment only. Never place or suggest that you placed an order. The attached images are the most recent selected chart-window captures, ordered oldest to newest. Latest machine capture: \(cutoff); chart bar completion is unverified. Do not invent exact OHLC or a live quote from pixels. Use the official TradingView MCP only if authenticated and available for relevant structured context; identify the actual symbol, interval, data cutoff and source if you use it. If MCP data cannot be retrieved, say so. Prior Cleo assessment: \(previous). Compare current evidence with that prior scenario. Lead with wait, conditional paper scenario, or review only. Explain material change and the next decision in a concise trading-desk voice. Trigger: \(trigger). Mark's question: \(question ?? "Review this chart for meaningful changes; if routine, set material false.")
        Return JSON only, with material (boolean) and message (string). For a scheduled five-minute scan, set material false when no meaningful change requires Mark's attention. For manual chat, answer Mark's question in message.
        """
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let task = Process()
            task.executableURL = URL(fileURLWithPath: config.codexPath)
            task.currentDirectoryURL = URL(fileURLWithPath: config.projectRoot)
            task.arguments = ["exec", "--ephemeral", "--sandbox", "read-only", "--cd", config.projectRoot,
                              "--image"] + imagePaths + ["--output-last-message", outputPath,
                              "--output-schema", Bundle.main.path(forResource: "analysis", ofType: "schema.json") ?? "",
                              "--model", "gpt-6-sol", "-c", "features.shell_tool=false",
                              "-c", "features.multi_agent=true", "-c", "mcp_servers.tradingview.enabled=true", prompt]
            task.standardOutput = FileHandle.nullDevice
            task.standardError = FileHandle.nullDevice
            let result: String
            do {
                try task.run()
                task.waitUntilExit()
                if task.terminationStatus == 0,
                   let reply = try? String(contentsOfFile: outputPath, encoding: .utf8), !reply.isEmpty {
                    result = reply.trimmingCharacters(in: .whitespacesAndNewlines)
                } else {
                    result = "Cleo review did not complete (Codex exit \(task.terminationStatus))."
                }
            } catch {
                result = "Cleo review could not start: \(error.localizedDescription)"
            }
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.assessmentRunning = false
                self.jevLabel.stringValue = "Jev: not connected · Cleo: last review finished"
                if let data = result.data(using: .utf8),
                   let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let message = object["message"] as? String,
                   let material = object["material"] as? Bool {
                    self.priorAssessment = message
                    if material || question != nil {
                        self.append("Cleo · \(message)")
                    } else {
                        self.append("Routine review complete · no material change")
                    }
                } else {
                    self.append("Cleo review · \(result)")
                }
                if let queued = self.pendingQuestion {
                    self.pendingQuestion = nil
                    self.requestAssessment(question: queued, trigger: "queued_chat")
                }
            }
        }
    }
}

@main
private enum Main {
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        let delegate = CleoOverlay()
        app.delegate = delegate
        app.run()
    }
}
