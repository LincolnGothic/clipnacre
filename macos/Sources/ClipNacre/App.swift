// SPDX-License-Identifier: GPL-3.0-or-later
import AppKit
import ApplicationServices
import Carbon
import ImageIO
import UniformTypeIdentifiers
import Darwin
import ClipNacreCore

func L(_ source: String) -> String { Catalog.shared.translate(source) }

struct CharacterRecord: Decodable {
    let text: String
    let name: String
    let group: String
    let keywords: [String]
    let tones: [String]
}

final class Catalog {
    static let shared = Catalog()
    let languages = [("system", "Follow system"), ("en", "English"), ("zh_CN", "简体中文"),
                     ("zh_TW", "繁體中文"), ("ja", "日本語"), ("es", "Español"),
                     ("fr", "Français"), ("ko", "한국어")]
    var messages: [String: String] = [:]
    var localizedNames: [String: String] = [:]
    var localizedKeywords: [String: [String]] = [:]
    var emoji: [CharacterRecord] = []
    var kaomoji: [CharacterRecord] = []
    var symbols: [CharacterRecord] = []
    var language = "en"

    init() {
        if let bytes = resource("characters.json"),
           let records = try? JSONDecoder().decode([String: [CharacterRecord]].self, from: bytes) {
            emoji = records["emoji"] ?? []; kaomoji = records["kaomoji"] ?? []; symbols = records["symbols"] ?? []
        }
        reload()
    }

    func resource(_ name: String) -> Data? {
        guard let url = Bundle.main.resourceURL?.appendingPathComponent(name) else { return nil }
        return try? Data(contentsOf: url)
    }

    func reload() {
        let choice = UserDefaults.standard.string(forKey: "uiLanguage") ?? "system"
        let preferred = choice == "system" ? (Locale.preferredLanguages.first ?? "en") : choice
        if preferred.hasPrefix("zh") {
            language = preferred.contains("Hant") || preferred.contains("TW") || preferred.contains("HK") || preferred == "zh_TW" ? "zh_TW" : "zh_CN"
        } else { language = String(preferred.prefix(2)) }
        if !languages.contains(where: { $0.0 == language }) { language = "en" }
        messages = resource("messages-\(language).json").flatMap { try? JSONDecoder().decode([String: String].self, from: $0) } ?? [:]
        localizedNames = [:]; localizedKeywords = [:]
        if let bytes = resource("annotations-\(language).json"), let lookup = try? JSONSerialization.jsonObject(with: bytes) as? [String: [String: Any]] {
            for (character, record) in lookup {
                localizedNames[character] = record["name"] as? String
                localizedKeywords[character] = record["keywords"] as? [String]
            }
        }
    }

    func translate(_ source: String) -> String { messages[source] ?? source }
    func label(_ record: CharacterRecord) -> String { localizedNames[record.text] ?? L(record.name) }

}

// A clipboard write may only be consumed while that exact ownership generation remains.
struct ClipboardWrite {
    let changeCount: Int
    func stillCurrent(on board: NSPasteboard) -> Bool { board.changeCount == changeCount }
    @discardableResult func performIfCurrent(on board: NSPasteboard, _ action: () -> Void) -> Bool {
        guard stillCurrent(on: board) else { return false }; action(); return true
    }
    static func selfTest() throws {
        let board = NSPasteboard.withUniqueName()
        defer { board.releaseGlobally() }
        let initial = board.clearContents(); board.setString("selected", forType: .string)
        let write = ClipboardWrite(changeCount: initial)
        var pasted = false
        write.performIfCurrent(on: board) { pasted = true }
        guard pasted else { throw NSError(domain: "ClipNacre.ClipboardTest", code: 1) }
        board.clearContents(); board.setString("new unrelated copy", forType: .string)
        pasted = false; write.performIfCurrent(on: board) { pasted = true }
        guard !pasted else { throw NSError(domain: "ClipNacre.ClipboardTest", code: 2) }
        let emojiCount = board.clearContents(); board.setString("🙂", forType: .string)
        let emojiWrite = ClipboardWrite(changeCount: emojiCount)
        board.clearContents(); board.setString("🙂", forType: .string)
        var restored = false; emojiWrite.performIfCurrent(on: board) { restored = true }
        guard !restored else { throw NSError(domain: "ClipNacre.ClipboardTest", code: 3) }
    }
}

func readRegularFile(_ url: URL, limit: Int) -> Data? {
    guard url.isFileURL else { return nil }
    let fd = open(url.path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
    guard fd >= 0 else { return nil }; defer { close(fd) }
    var info = stat()
    guard fstat(fd, &info) == 0, (info.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG), info.st_size >= 0, info.st_size <= Int64(limit) else { return nil }
    var data = Data(); var buffer = [UInt8](repeating: 0, count: 64 * 1024)
    while true {
        let count = buffer.withUnsafeMutableBytes { read(fd, $0.baseAddress, $0.count) }
        if count < 0 { if errno == EINTR { continue }; return nil }
        if count == 0 { return data }
        guard count <= limit - data.count else { return nil }
        data.append(contentsOf: buffer.prefix(count))
    }
}

enum AppError: LocalizedError {
    case invalidImage
    var errorDescription: String? { L("Could not read this image.") }
}

// Preflight every encoded representation before asking ImageIO to decode it.
func clipboardImage(_ board: NSPasteboard) -> Data? {
    for type in [NSPasteboard.PasteboardType.png, NSPasteboard.PasteboardType("public.jpeg"), .tiff] {
        guard let bytes = board.data(forType: type), bytes.count <= 8 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(bytes as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0, width <= 8192, height <= 8192, width * height <= 16_000_000 else { continue }
        if let valid = HistoryImageValidation.validatedImageData(bytes) { return valid }
        guard let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { continue }
        let result = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
        if let data = result, let valid = HistoryImageValidation.validatedImageData(data) { return valid }
    }
    if let urls = board.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL], urls.count == 1 {
        let url = urls[0]
        if let info = try? url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey]), info.isRegularFile == true, info.isSymbolicLink != true, let size = info.fileSize, size <= 8 * 1024 * 1024,
           let data = readRegularFile(url, limit: 8 * 1024 * 1024), let valid = HistoryImageValidation.validatedImageData(data) { return valid }
    }
    return nil
}

final class PickerWindow: NSWindow {
    var onEscape: (() -> Void)?
    var onCommand: ((NSEvent) -> Bool)?
    override func cancelOperation(_ sender: Any?) { onEscape?() }
    override func keyDown(with event: NSEvent) {
        if onCommand?(event) == true { return }
        super.keyDown(with: event)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, NSTableViewDataSource, NSTableViewDelegate, NSSearchFieldDelegate {
    let preferences = UserDefaults.standard
    var history = History()
    var persistence: HistoryPersistence?
    var statusItem: NSStatusItem?
    var window: PickerWindow!
    let table = NSTableView()
    let search = NSSearchField()
    let groups = NSPopUpButton()
    let tones = NSPopUpButton()
    let tabs = NSSegmentedControl(labels: ["Clipboard", "Emoji", "Kaomoji", "Symbols", "GIFs"], trackingMode: .selectOne, target: nil, action: nil)
    let status = NSTextField(labelWithString: "")
    var preferencesWindow: NSWindow?
    var displayedHistory: [HistoryItem] = []
    var displayedCharacters: [CharacterRecord] = []
    var displayedGIFs: [URL] = []
    var lastChange = NSPasteboard.general.changeCount
    var timer: Timer?
    var destination: NSRunningApplication?
    var destinationWindow: AXUIElement?
    var hotkeys: [EventHotKeyRef] = []
    var hotkeyHandler: EventHandlerRef?
    var observers: [NSObjectProtocol] = []
    var locked = false
    var sleeping = false
    var storageNeedsRecovery = false
    var capturing = false
    var pasteGeneration = 0
    var previousText: String?
    var temporaryCharacter: String?
    var temporaryWrite: ClipboardWrite?
    var editors: [ImageEditorController] = []
    let capture = CaptureService()
    lazy var pins = PinManager(onCopy: { [weak self] bytes in _ = self?.writeImage(bytes) }, onError: { [weak self] text in self?.inform(text) })
    var saveFailureShown = false

    override init() {
        super.init()
        preferences.register(defaults: ["capture": true, "persist": true, "autoPaste": true, "historyLimit": 100, "editScreenshot": true, "uiLanguage": "system", "gifFavorites": [String](), "excludedApps": "com.1password.1password,com.agilebits.onepassword7,com.bitwarden.desktop,org.keepassxc.keepassxc"])
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("ClipNacre", isDirectory: true)
            persistence = HistoryPersistence(directory: directory)
            if preferences.bool(forKey: "persist") { history = try persistence!.load() }
        } catch { storageNeedsRecovery = true; inform(L("Could not load saved history. The existing file has been preserved.")) }
        history.limit = preferences.integer(forKey: "historyLimit")
        makeMenus()
        makePicker()
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem?.button?.image = NSImage(systemSymbolName: "doc.on.clipboard", accessibilityDescription: "ClipNacre")
        statusItem?.button?.target = self; statusItem?.button?.action = #selector(togglePicker)
        registerHotkeys()
        timer = Timer.scheduledTimer(withTimeInterval: 0.6, repeats: true) { [weak self] _ in self?.pollClipboard() }
        observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.sessionDidResignActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.lockSession() })
        observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { [weak self] _ in self?.suspendForSleep() })
        observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.sessionDidBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.unlockSession() })
        observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in self?.wakeFromSleep() })
        observers.append(DistributedNotificationCenter.default().addObserver(forName: NSNotification.Name("com.apple.screenIsLocked"), object: nil, queue: .main) { [weak self] _ in self?.lockSession() })
        observers.append(DistributedNotificationCenter.default().addObserver(forName: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main) { [weak self] _ in self?.unlockSession() })
        if preferences.bool(forKey: "firstLaunchShown") == false {
            preferences.set(true, forKey: "firstLaunchShown"); togglePicker()
            status.stringValue = L("Copy something, then open ClipNacre with ⌘⇧V. History stays on this Mac.")
        }
    }

    static func selfTest() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("clipnacre-app-test-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        let file = folder.appendingPathComponent("history.json")
        defer { try? FileManager.default.removeItem(at: file); try? FileManager.default.removeItem(at: folder) }
        let corrupt = Data("preserve this invalid state".utf8); try corrupt.write(to: file)
        let owner = AppDelegate(); owner.persistence = HistoryPersistence(directory: folder); owner.storageNeedsRecovery = true
        _ = owner.history.addText("new session item"); owner.saveHistory()
        guard try Data(contentsOf: file) == corrupt else { throw NSError(domain: "ClipNacre.AppTest", code: 1) }
        owner.locked = true; owner.sleeping = true; owner.wakeFromSleep()
        guard owner.locked && !owner.sleeping else { throw NSError(domain: "ClipNacre.AppTest", code: 2) }
        guard readRegularFile(file, limit: 2) == nil, readRegularFile(file, limit: 100) == corrupt else { throw NSError(domain: "ClipNacre.AppTest", code: 3) }
    }

    func applicationWillTerminate(_ notification: Notification) { timer?.invalidate(); capture.cancel(); pins.closeAll(); saveHistory() }

    func makeMenus() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        let quitItem = NSMenuItem(title: L("Quit") + " ClipNacre", action: #selector(quit), keyEquivalent: "q"); quitItem.target = self; appMenu.addItem(quitItem)
        let editItem = NSMenuItem(); main.addItem(editItem); let editMenu = NSMenu(title: L("Edit")); editItem.submenu = editMenu
        for (title, action, key) in [("Undo", "undo:", "z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select all", "selectAll:", "a")] {
            editMenu.addItem(NSMenuItem(title: L(title), action: NSSelectorFromString(action), keyEquivalent: key))
        }
        NSApp.mainMenu = main
    }

    func makeButton(_ title: String, _ action: Selector) -> NSButton {
        let button = NSButton(title: L(title), target: self, action: action)
        button.bezelStyle = .rounded; button.setAccessibilityLabel(L(title)); return button
    }

    func makePicker() {
        window = PickerWindow(contentRect: NSRect(x: 0, y: 0, width: 740, height: 570), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "ClipNacre \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.2.0")"
        window.contentView?.wantsLayer = true; window.contentView?.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        window.minSize = NSSize(width: 560, height: 420); window.isReleasedWhenClosed = false; window.delegate = self
        window.onEscape = { [weak self] in self?.window.orderOut(nil) }
        window.onCommand = { [weak self] event in self?.handleKey(event) ?? false }
        let stack = NSStackView(); stack.orientation = .vertical; stack.spacing = 10; stack.edgeInsets = NSEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor), stack.bottomAnchor.constraint(equalTo: window.contentView!.bottomAnchor), stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor), stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor)])
        let header = NSStackView(views: [makeButton("Screenshot", #selector(takeScreenshot)), makeButton("Settings", #selector(openPreferences)), makeButton("Pause capture", #selector(toggleCapture)), makeButton("Quit", #selector(quit))]); header.spacing = 8
        stack.addArrangedSubview(header)
        tabs.target = self; tabs.action = #selector(changeTab); tabs.selectedSegment = 0
        for index in 0..<tabs.segmentCount { tabs.setLabel(L(["Clipboard", "Emoji", "Kaomoji", "Symbols", "GIFs"][index]), forSegment: index) }
        for index in 0..<tabs.segmentCount { tabs.setWidth(94, forSegment: index) }
        stack.addArrangedSubview(tabs)
        search.delegate = self; search.placeholderString = L("Search"); search.setAccessibilityLabel(L("Search")); stack.addArrangedSubview(search)
        groups.target = self; groups.action = #selector(refresh); groups.setAccessibilityLabel(L("Category"))
        tones.addItems(withTitles: [L("All skin tones"), L("Default"), "🏻", "🏼", "🏽", "🏾", "🏿"]); tones.target = self; tones.action = #selector(refresh)
        let filters = NSStackView(views: [groups, tones]); filters.spacing = 8; stack.addArrangedSubview(filters)
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("entry")); column.title = L("Clipboard history"); table.addTableColumn(column)
        table.headerView = nil; table.rowHeight = 55; table.delegate = self; table.dataSource = self
        table.target = self; table.doubleAction = #selector(choose); table.allowsEmptySelection = true
        let scroll = NSScrollView(); scroll.documentView = table; scroll.hasVerticalScroller = true; scroll.borderType = .bezelBorder; stack.addArrangedSubview(scroll)
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -24).isActive = true
        scroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 180).isActive = true
        search.widthAnchor.constraint(equalTo: scroll.widthAnchor).isActive = true
        let actions = NSStackView(views: [makeButton("Paste", #selector(choose)), makeButton("Pin / Unpin", #selector(pinSelected)), makeButton("Delete", #selector(deleteSelected)), makeButton("Edit image", #selector(editSelected)), makeButton("Restore clipboard", #selector(restoreClipboard))]); actions.spacing = 6
        stack.addArrangedSubview(actions)
        status.lineBreakMode = .byWordWrapping; status.maximumNumberOfLines = 2; status.font = .systemFont(ofSize: 11); stack.addArrangedSubview(status)
        window.center(); changeTab()
    }

    @objc func togglePicker() {
        guard !locked, !sleeping else { return }
        if window.isVisible { window.orderOut(nil); return }
        let front = NSWorkspace.shared.frontmostApplication
        if front?.processIdentifier != ProcessInfo.processInfo.processIdentifier {
            destination = front; destinationWindow = focusedWindow(front)
        }
        search.stringValue = ""; refresh(); window.center(); window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true); window.makeFirstResponder(search)
    }

    func focusedWindow(_ app: NSRunningApplication?) -> AXUIElement? {
        guard AXIsProcessTrusted(), let app = app else { return nil }
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(AXUIElementCreateApplication(app.processIdentifier), kAXFocusedWindowAttribute as CFString, &value) == .success,
              let result = value, CFGetTypeID(result) == AXUIElementGetTypeID() else { return nil }
        return (result as! AXUIElement)
    }

    @objc func changeTab() {
        groups.removeAllItems(); groups.addItem(withTitle: L("All"))
        let records = currentCharacters()
        for group in Array(Set(records.map(\.group))).sorted() { groups.addItem(withTitle: L(group)); groups.lastItem?.representedObject = group }
        if tabs.selectedSegment == 1 { groups.insertItem(withTitle: L("Recent"), at: 1); groups.item(at: 1)?.representedObject = "Recent" }
        groups.isHidden = records.isEmpty; tones.isHidden = tabs.selectedSegment != 1
        refresh()
    }

    func currentCharacters() -> [CharacterRecord] {
        switch tabs.selectedSegment { case 1: return Catalog.shared.emoji; case 2: return Catalog.shared.kaomoji; case 3: return Catalog.shared.symbols; default: return [] }
    }

    @objc func refresh() {
        guard window != nil else { return }
        let query = search.stringValue.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
        let historyQuery = search.stringValue.split(whereSeparator: \.isWhitespace).map { String($0).caseInsensitiveCompare(L("Image")) == .orderedSame ? "Image" : String($0) }.joined(separator: " ")
        displayedHistory = history.search(historyQuery)
        let selectedGroup = groups.selectedItem?.representedObject as? String
        let recent = preferences.stringArray(forKey: "recentCharacters") ?? []
        let tone = ["all", "default", "light", "medium-light", "medium", "medium-dark", "dark"][max(0, tones.indexOfSelectedItem)]
        displayedCharacters = currentCharacters().filter { record in
            let categoryMatches = selectedGroup == nil || selectedGroup == record.group || (selectedGroup == "Recent" && recent.contains(record.text))
            let toneMatches = tabs.selectedSegment != 1 || tone == "all" || (tone == "default" ? record.tones.isEmpty : record.tones.contains(tone))
            let haystack = "\(record.text) \(record.name) \(Catalog.shared.label(record)) \(record.group) \((record.keywords + (Catalog.shared.localizedKeywords[record.text] ?? [])).joined(separator: " "))".folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            return categoryMatches && toneMatches && query.split(whereSeparator: \.isWhitespace).allSatisfy { haystack.contains(String($0)) }
        }
        displayedGIFs = (preferences.stringArray(forKey: "gifFavorites") ?? []).map { URL(fileURLWithPath: $0) }.filter { query.isEmpty || $0.lastPathComponent.localizedCaseInsensitiveContains(query) }
        table.reloadData(); if table.numberOfRows > 0 { table.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false) }
        status.stringValue = preferences.bool(forKey: "capture") ? L("History stays on this Mac. Double-click or press Enter to paste.") : L("Clipboard capture is paused.")
    }

    func numberOfRows(in tableView: NSTableView) -> Int { tabs.selectedSegment == 0 ? displayedHistory.count : tabs.selectedSegment == 4 ? displayedGIFs.count : displayedCharacters.count }
    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let cell = NSTableCellView(); let label = NSTextField(labelWithString: ""); label.lineBreakMode = .byTruncatingTail; label.maximumNumberOfLines = 2
        let image = NSImageView(); image.imageScaling = .scaleProportionallyUpOrDown
        if tabs.selectedSegment == 0 {
            let item = displayedHistory[row]; label.stringValue = (item.pinned ? "★ " : "") + (item.imageData == nil ? item.preview : item.preview.replacingOccurrences(of: "Image", with: L("Image")))
            if let data = item.imageData { image.image = thumbnail(data) }
        } else if tabs.selectedSegment == 4 {
            let url = displayedGIFs[row]; label.stringValue = url.lastPathComponent
            if let data = validGIF(url) { image.image = thumbnail(data) }
        } else {
            let record = displayedCharacters[row]; label.stringValue = "\(record.text)   \(Catalog.shared.label(record))"
            label.font = .systemFont(ofSize: 19)
        }
        image.frame = NSRect(x: 5, y: 4, width: 48, height: 47); label.frame = NSRect(x: image.image == nil ? 8 : 64, y: 8, width: max(180, tableView.bounds.width - 75), height: 38)
        label.autoresizingMask = [.width]; cell.addSubview(image); cell.addSubview(label); cell.textField = label
        cell.setAccessibilityLabel(label.stringValue); return cell
    }

    func thumbnail(_ data: Data) -> NSImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 96, kCGImageSourceCreateThumbnailWithTransform: true] as CFDictionary) else { return nil }
        return NSImage(cgImage: image, size: .zero)
    }

    func controlTextDidChange(_ obj: Notification) { refresh() }
    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        if commandSelector == #selector(NSResponder.insertNewline(_:)) { choose(); return true }
        if commandSelector == #selector(NSResponder.moveDown(_:)) { moveSelection(1); return true }
        if commandSelector == #selector(NSResponder.moveUp(_:)) { moveSelection(-1); return true }
        if commandSelector == #selector(NSResponder.cancelOperation(_:)) { window.orderOut(nil); return true }
        return false
    }
    func moveSelection(_ delta: Int) { guard table.numberOfRows > 0 else { return }; let row = min(table.numberOfRows - 1, max(0, table.selectedRow + delta)); table.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false); table.scrollRowToVisible(row) }
    func handleKey(_ event: NSEvent) -> Bool {
        if event.keyCode == 36 { choose(); return true }
        if event.keyCode == 53 { window.orderOut(nil); return true }
        if event.keyCode == 51, window.firstResponder === table { deleteSelected(); return true }
        if event.modifierFlags.contains(.command), event.charactersIgnoringModifiers == "f" { window.makeFirstResponder(search); return true }
        if event.modifierFlags.contains(.control), event.keyCode == 48 { tabs.selectedSegment = (tabs.selectedSegment + (event.modifierFlags.contains(.shift) ? 4 : 1)) % 5; changeTab(); return true }
        return false
    }

    @objc func choose() {
        let row = table.selectedRow; guard row >= 0, row < table.numberOfRows else { return }
        var selectedWrite: ClipboardWrite?
        if tabs.selectedSegment == 0 {
            let item = displayedHistory[row]; previousText = nil; temporaryCharacter = nil; temporaryWrite = nil
            if let text = item.text { selectedWrite = writeText(text) } else if let data = item.imageData { selectedWrite = writeImage(data) }
        } else if tabs.selectedSegment == 4 {
            guard let data = validGIF(displayedGIFs[row]) else { inform(L("Could not read that GIF. Re-add it in Settings or choose another file.")); return }
            let count = NSPasteboard.general.clearContents(); if NSPasteboard.general.setData(data, forType: .init("com.compuserve.gif")), NSPasteboard.general.changeCount == count { selectedWrite = ClipboardWrite(changeCount: count) }; lastChange = NSPasteboard.general.changeCount
        } else {
            let character = displayedCharacters[row].text
            previousText = isPrivateClipboard(NSPasteboard.general) ? nil : NSPasteboard.general.string(forType: .string).flatMap { $0.utf8.count <= 16384 ? $0 : nil }
            temporaryCharacter = character; temporaryWrite = writeText(character); selectedWrite = temporaryWrite
            var recent = preferences.stringArray(forKey: "recentCharacters") ?? []; recent.removeAll { $0 == character }; recent.insert(character, at: 0); preferences.set(Array(recent.prefix(30)), forKey: "recentCharacters")
        }
        window.orderOut(nil); guardedPaste(selectedWrite)
    }

    @discardableResult func writeText(_ text: String) -> ClipboardWrite? {
        let board = NSPasteboard.general; let count = board.clearContents()
        let written = board.setString(text, forType: .string); lastChange = board.changeCount
        return written && lastChange == count ? ClipboardWrite(changeCount: count) : nil
    }
    @discardableResult func writeImage(_ bytes: Data) -> ClipboardWrite? {
        guard HistoryImageValidation.validatedImageData(bytes) != nil else { return nil }
        let board = NSPasteboard.general; let count = board.clearContents()
        let written = board.setData(bytes, forType: bytes.starts(with: [0xff, 0xd8]) ? .init("public.jpeg") : .png); lastChange = board.changeCount
        return written && lastChange == count ? ClipboardWrite(changeCount: count) : nil
    }
    @objc func restoreClipboard() {
        guard let text = previousText, let character = temporaryCharacter, let write = temporaryWrite, write.stillCurrent(on: NSPasteboard.general), !isPrivateClipboard(NSPasteboard.general), NSPasteboard.general.string(forType: .string) == character else { inform(L("Clipboard changed; the newer clipboard was preserved.")); return }
        write.performIfCurrent(on: NSPasteboard.general) { _ = writeText(text) }; previousText = nil; temporaryCharacter = nil; temporaryWrite = nil
    }

    func guardedPaste(_ write: ClipboardWrite?) {
        pasteGeneration += 1; let generation = pasteGeneration
        guard let write = write, write.stillCurrent(on: NSPasteboard.general), preferences.bool(forKey: "autoPaste"), AXIsProcessTrusted(), let app = destination, let originalWindow = destinationWindow, !app.isTerminated else { status.stringValue = L("Copied to clipboard. Use your application’s paste shortcut."); return }
        guard app.activate(options: [.activateIgnoringOtherApps]) else { return }
        func attempt(_ remaining: Int) {
            guard generation == self.pasteGeneration, !self.locked, !self.sleeping, !app.isTerminated, write.stillCurrent(on: NSPasteboard.general), !self.isPrivateClipboard(NSPasteboard.general) else { return }
            guard NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier else { return }
            guard let focused = self.focusedWindow(app), CFEqual(originalWindow, focused) else { return }
            if !NSEvent.modifierFlags.intersection([.command, .shift, .control, .option]).isEmpty {
                if remaining > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) { attempt(remaining - 1) } }
                return
            }
            guard let source = CGEventSource(stateID: .combinedSessionState), let down = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: true), let up = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: false) else { return }
            down.flags = .maskCommand; up.flags = .maskCommand; write.performIfCurrent(on: NSPasteboard.general) { down.post(tap: .cghidEventTap); up.post(tap: .cghidEventTap) }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { attempt(12) }
    }

    @objc func pinSelected() { guard tabs.selectedSegment == 0, table.selectedRow >= 0, table.selectedRow < displayedHistory.count else { return }; history.togglePin(displayedHistory[table.selectedRow].id); saveHistory(); refresh() }
    @objc func deleteSelected() {
        let row = table.selectedRow; guard row >= 0, row < table.numberOfRows else { return }
        if tabs.selectedSegment == 0 { history.remove(displayedHistory[row].id); pins.closeAll(); saveHistory() }
        else if tabs.selectedSegment == 4 { var paths = preferences.stringArray(forKey: "gifFavorites") ?? []; paths.removeAll { $0 == displayedGIFs[row].path }; preferences.set(paths, forKey: "gifFavorites") }
        refresh()
    }
    @objc func editSelected() { guard tabs.selectedSegment == 0, table.selectedRow >= 0, table.selectedRow < displayedHistory.count, let bytes = displayedHistory[table.selectedRow].imageData else { return }; edit(bytes) }
    func edit(_ bytes: Data) {
        guard let editor = ImageEditorController(data: bytes, onCopy: { [weak self] data in self?.writeImage(data); self?.addImage(data) }, onPin: { [weak self] data in self?.pins.pin(data) }) else { inform(L("Could not read this image.")); return }
        editors.removeAll { $0.window?.isVisible != true }; editors.append(editor); editor.showWindow(nil); NSApp.activate(ignoringOtherApps: true)
    }
    @objc func takeScreenshot() {
        guard !locked, !sleeping, !capturing else { return }; pasteGeneration += 1; window.orderOut(nil); capturing = true
        capture.capture { [weak self] result in
            guard let self = self else { return }; self.capturing = false; self.lastChange = NSPasteboard.general.changeCount
            guard !self.locked else { return }
            switch result { case .success(let bytes): self.writeImage(bytes); self.addImage(bytes); if self.preferences.bool(forKey: "editScreenshot") { self.edit(bytes) }
            case .failure(let error): if (error as? CocoaError)?.code != .userCancelled { self.inform(error.localizedDescription) } }
        }
    }

    func isPrivateClipboard(_ board: NSPasteboard) -> Bool {
        let privateTypes = Set(["org.nspasteboard.ConcealedType", "org.nspasteboard.TransientType", "org.nspasteboard.AutoGeneratedType", "com.agilebits.onepassword", "application/x-keepassxc", "application/x-bitwarden"])
        return (board.types ?? []).contains { privateTypes.contains($0.rawValue) }
    }
    func pollClipboard() {
        let board = NSPasteboard.general; guard board.changeCount != lastChange else { return }; lastChange = board.changeCount
        guard preferences.bool(forKey: "capture"), !locked, !sleeping, !capturing, !isPrivateClipboard(board) else { return }
        let front = NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? ""
        let excluded = preferences.string(forKey: "excludedApps")?.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) } ?? []
        guard !excluded.contains(front) else { return }
        let image = clipboardImage(board)
        let text = image == nil ? board.string(forType: .string) : nil
        guard board.changeCount == lastChange, NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? "" == front, !isPrivateClipboard(board) else { return }
        if let image = image { addImage(image) }
        else if let text = text, history.addText(text) != nil { saveHistory(); refresh() }
    }
    func addImage(_ data: Data) { if preferences.bool(forKey: "capture"), history.addImage(data) != nil { saveHistory(); refresh() } }
    func saveHistory() {
        guard let persistence = persistence, !storageNeedsRecovery else { return }
        do { if preferences.bool(forKey: "persist") { try persistence.save(history) } }
        catch { if !saveFailureShown { saveFailureShown = true; inform(L("Could not save history. This session remains in memory.")) } }
    }
    func lockSession() { locked = true; suspendContent() }
    func suspendForSleep() { sleeping = true; suspendContent() }
    func suspendContent() { pasteGeneration += 1; previousText = nil; temporaryCharacter = nil; temporaryWrite = nil; capture.cancel(); capturing = false; window?.orderOut(nil); preferencesWindow?.orderOut(nil); pins.closeAll(); editors.forEach { $0.close() }; editors.removeAll(); lastChange = NSPasteboard.general.changeCount }
    func wakeFromSleep() { sleeping = false; lastChange = NSPasteboard.general.changeCount }
    func unlockSession() { locked = false; lastChange = NSPasteboard.general.changeCount }

    func registerHotkeys() {
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let installed = InstallEventHandler(GetApplicationEventTarget(), { _, event, context -> OSStatus in
            guard let context = context, let event = event else { return OSStatus(eventNotHandledErr) }
            let owner = Unmanaged<AppDelegate>.fromOpaque(context).takeUnretainedValue()
            var identifier = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &identifier)
            if identifier.id == 1 { owner.togglePicker() } else { owner.takeScreenshot() }
            return noErr
        }, 1, &eventType, Unmanaged.passUnretained(self).toOpaque(), &hotkeyHandler)
        guard installed == noErr else { inform(L("Could not register global shortcuts. Use the menu-bar button.")); return }
        for (key, id) in [(kVK_ANSI_V, UInt32(1)), (kVK_ANSI_S, UInt32(2))] {
            var reference: EventHotKeyRef?
            let status = RegisterEventHotKey(UInt32(key), UInt32(cmdKey | shiftKey), EventHotKeyID(signature: 0x434e4143, id: id), GetApplicationEventTarget(), 0, &reference)
            if status == noErr, let reference = reference { hotkeys.append(reference) }
            else { inform(L("A ClipNacre shortcut is already in use. Use the menu-bar button or Screenshot button.")) }
        }
    }

    @objc func toggleCapture() { preferences.set(!preferences.bool(forKey: "capture"), forKey: "capture"); lastChange = NSPasteboard.general.changeCount; refresh() }
    @objc func quit() { NSApp.terminate(nil) }
    func inform(_ message: String) { let alert = NSAlert(); alert.messageText = "ClipNacre"; alert.informativeText = message; alert.addButton(withTitle: L("OK")); alert.runModal() }

    @objc func openPreferences() {
        if let existing = preferencesWindow { existing.makeKeyAndOrderFront(nil); return }
        let panel = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 580, height: 500), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        panel.title = L("Settings"); panel.isReleasedWhenClosed = false
        let stack = NSStackView(); stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 10; stack.frame = NSRect(x: 20, y: 20, width: 540, height: 460)
        panel.contentView!.addSubview(stack)
        for (key, title) in [("capture", "Capture clipboard history"), ("persist", "Remember after logout"), ("autoPaste", "Paste automatically"), ("editScreenshot", "Edit after taking a screenshot")] {
            let button = NSButton(checkboxWithTitle: L(title), target: self, action: #selector(changePreference(_:))); button.identifier = .init(key); button.state = preferences.bool(forKey: key) ? .on : .off; stack.addArrangedSubview(button)
        }
        let language = NSPopUpButton(); language.addItems(withTitles: Catalog.shared.languages.map { L($0.1) }); language.selectItem(at: Catalog.shared.languages.firstIndex { $0.0 == (preferences.string(forKey: "uiLanguage") ?? "system") } ?? 0); language.target = self; language.action = #selector(changeLanguage(_:)); stack.addArrangedSubview(language)
        let limit = NSTextField(string: String(preferences.integer(forKey: "historyLimit"))); limit.identifier = .init("historyLimit"); limit.target = self; limit.action = #selector(changeLimit(_:)); limit.widthAnchor.constraint(equalToConstant: 70).isActive = true
        stack.addArrangedSubview(NSStackView(views: [NSTextField(labelWithString: L("History limit (1–500)")), limit]))
        let excluded = NSTextField(string: preferences.string(forKey: "excludedApps") ?? ""); excluded.identifier = .init("excludedApps"); excluded.placeholderString = L("Excluded app bundle IDs, separated by commas"); excluded.target = self; excluded.action = #selector(changeExclusions(_:)); excluded.widthAnchor.constraint(equalToConstant: 530).isActive = true; stack.addArrangedSubview(excluded)
        stack.addArrangedSubview(makeButton("Enable automatic paste (Accessibility)", #selector(requestAccessibility)))
        stack.addArrangedSubview(makeButton("Add local GIF favorites", #selector(addGIFs)))
        stack.addArrangedSubview(makeButton("Clear unpinned", #selector(clearUnpinned)))
        stack.addArrangedSubview(makeButton("Erase all saved items", #selector(eraseHistory)))
        let privacy = NSTextField(wrappingLabelWithString: L("Everything stays on this Mac. Persistent history is plaintext in Application Support/ClipNacre. Password hints and excluded apps are best-effort safeguards.")); privacy.font = .systemFont(ofSize: 11); privacy.widthAnchor.constraint(equalToConstant: 530).isActive = true; stack.addArrangedSubview(privacy)
        panel.center(); panel.makeKeyAndOrderFront(nil); preferencesWindow = panel
    }
    @objc func changePreference(_ sender: NSButton) {
        guard let key = sender.identifier?.rawValue else { return }
        if key == "persist", sender.state == .off {
            guard confirm(L("Remove saved history from this Mac and keep this session in memory?")) else { sender.state = .on; return }
            do { try persistence?.erase(); storageNeedsRecovery = false } catch { inform(L("Could not erase saved history.")); sender.state = .on; return }
        }
        preferences.set(sender.state == .on, forKey: key); lastChange = NSPasteboard.general.changeCount; saveHistory(); refresh()
    }
    @objc func changeLanguage(_ sender: NSPopUpButton) {
        preferences.set(Catalog.shared.languages[sender.indexOfSelectedItem].0, forKey: "uiLanguage"); Catalog.shared.reload(); preferencesWindow?.close(); preferencesWindow = nil
        let wasVisible = window.isVisible; window.close(); makePicker(); if wasVisible { window.makeKeyAndOrderFront(nil) }; openPreferences()
    }
    @objc func changeLimit(_ sender: NSTextField) { let value = min(500, max(1, sender.integerValue)); sender.integerValue = value; preferences.set(value, forKey: "historyLimit"); history.limit = value; saveHistory(); refresh() }
    @objc func changeExclusions(_ sender: NSTextField) { preferences.set(sender.stringValue, forKey: "excludedApps") }
    @objc func requestAccessibility() { _ = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary) }
    @objc func clearUnpinned() { history.clear(includePinned: false); pins.closeAll(); saveHistory(); refresh() }
    @objc func eraseHistory() {
        guard confirm(L("Erase all clipboard history, pins and recent characters? This cannot be undone.")) else { return }
        history.clear(includePinned: true); previousText = nil; temporaryCharacter = nil; pasteGeneration += 1; capture.cancel(); pins.closeAll(); editors.forEach { $0.close() }; editors.removeAll(); preferences.removeObject(forKey: "recentCharacters")
        do { try persistence?.erase(); storageNeedsRecovery = false; saveHistory() } catch { inform(L("Could not erase saved history.")) }; refresh()
    }
    func confirm(_ question: String) -> Bool { let alert = NSAlert(); alert.messageText = "ClipNacre"; alert.informativeText = question; alert.addButton(withTitle: L("Erase")); alert.addButton(withTitle: L("Cancel")); return alert.runModal() == .alertFirstButtonReturn }
    func validGIF(_ url: URL) -> Data? {
        guard url.isFileURL, let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey]), values.isRegularFile == true, values.isSymbolicLink != true, let size = values.fileSize, size <= 8 * 1024 * 1024,
              let bytes = readRegularFile(url, limit: 8 * 1024 * 1024), bytes.count <= 8 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(bytes as CFData, [kCGImageSourceShouldCache: false] as CFDictionary), CGImageSourceGetType(source) as String? == "com.compuserve.gif",
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any], let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0, width <= 2048, height <= 2048 else { return nil }
        return bytes
    }
    @objc func addGIFs() {
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.gif]; panel.allowsMultipleSelection = true
        guard panel.runModal() == .OK else { return }; var paths = preferences.stringArray(forKey: "gifFavorites") ?? []
        for url in panel.urls where paths.count < 40 { if validGIF(url) != nil, !paths.contains(url.path) { paths.append(url.path) } }
        preferences.set(paths, forKey: "gifFavorites"); refresh()
    }
}

@main enum ClipNacreMain {
    static func main() {
        let application = NSApplication.shared; application.setActivationPolicy(.accessory)
        if CommandLine.arguments.contains("--self-test") {
            do {
                application.finishLaunching()
                try ClipboardWrite.selfTest(); try AppDelegate.selfTest(); try CaptureService.selfTest(); try ImageEditorController.selfTest(); try OCRService.selfTest()
                guard Catalog.shared.emoji.count >= 3900 else { throw NSError(domain: "ClipNacre", code: 1, userInfo: [NSLocalizedDescriptionKey: "Bundled character resources are missing"]) }
                let delegate = AppDelegate(); _ = delegate.history.addText("Welcome to ClipNacre — clipboard, screenshots and text, kept local."); delegate.makePicker()
                delegate.window.makeKeyAndOrderFront(nil)
                RunLoop.main.run(until: Date().addingTimeInterval(0.25))
                delegate.window.contentView?.layoutSubtreeIfNeeded()
                if let index = CommandLine.arguments.firstIndex(of: "--preview"), index + 1 < CommandLine.arguments.count, let view = delegate.window.contentView, let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) {
                    view.cacheDisplay(in: view.bounds, to: bitmap)
                    if let png = bitmap.representation(using: .png, properties: [:]) { try png.write(to: URL(fileURLWithPath: CommandLine.arguments[index + 1])) }
                }
                print("PASS: clipboard race guards, native editor export, local Vision OCR, bundled characters and AppKit picker smoke test")
                return
            } catch { fputs("Native self-test failed: \(error.localizedDescription)\n", stderr); exit(1) }
        }
        let delegate = AppDelegate(); application.delegate = delegate
        withExtendedLifetime(delegate) { application.run() }
    }
}
