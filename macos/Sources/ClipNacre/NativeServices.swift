import AppKit
import CoreGraphics
import CoreText
import ImageIO
import Vision
import Darwin

private enum NativeServiceError: LocalizedError {
    case permission, invalidImage, imageLimit, captureFailed, timeout, textLimit, unavailableLanguage, selfTest

    var errorDescription: String? {
        switch self {
        case .permission: return L("Allow Screen Recording in System Settings, then restart ClipNacre and try again.")
        case .invalidImage: return L("The image could not be read.")
        case .imageLimit: return L("The image exceeds the size limit.")
        case .captureFailed: return L("The screenshot could not be captured.")
        case .timeout: return L("Text recognition timed out.")
        case .textLimit: return L("The recognized text exceeds the size limit.")
        case .unavailableLanguage: return L("This text recognition language is unavailable on this Mac.")
        case .selfTest: return "Local OCR self-test failed."
        }
    }
}

private enum ServiceImage {
    static let maximumBytes = 32 * 1024 * 1024

    static func source(_ data: Data) throws -> CGImageSource {
        guard !data.isEmpty, data.count <= maximumBytes else { throw NativeServiceError.imageLimit }
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) > 0,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
              let height = properties[kCGImagePropertyPixelHeight] as? NSNumber else {
            throw NativeServiceError.invalidImage
        }
        let w = width.intValue, h = height.intValue
        guard w > 0, h > 0, w <= 8192, h <= 8192, w <= 16_000_000 / h else {
            throw NativeServiceError.imageLimit
        }
        return source
    }

    static func preview(_ data: Data) throws -> CGImage {
        let source = try self.source(data)
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 1024,
            kCGImageSourceShouldCacheImmediately: true
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            throw NativeServiceError.invalidImage
        }
        return image
    }

    static func png(_ image: CGImage) throws -> Data {
        let bytes = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(bytes, "public.png" as CFString, 1, nil) else {
            throw NativeServiceError.invalidImage
        }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { throw NativeServiceError.invalidImage }
        let data = bytes as Data
        guard data.count <= 8 * 1024 * 1024 else { throw NativeServiceError.imageLimit }
        return data
    }
}

/// Owns one screenshot attempt. Cleanup is called only after its process exits,
/// or when launch fails, so a cancelled process cannot recreate removed output.
private final class CaptureScratch {
    static let maximumBytes = 8 * 1024 * 1024
    private let directory: URL
    private let directoryFD: Int32
    private let cleanupLock = NSLock()
    private var cleaned = false
    private static let fileName = "capture.png"
    var path: String { directory.appendingPathComponent(Self.fileName).path }

    init() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("clipnacre-capture-" + UUID().uuidString, isDirectory: true)
        guard Darwin.mkdir(directory.path, mode_t(0o700)) == 0 else { throw NativeServiceError.captureFailed }
        guard Darwin.chmod(directory.path, mode_t(0o700)) == 0 else {
            Darwin.rmdir(directory.path)
            throw NativeServiceError.captureFailed
        }
        let directoryFD = Darwin.open(directory.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard directoryFD >= 0 else {
            Darwin.rmdir(directory.path)
            throw NativeServiceError.captureFailed
        }
        let fileFD = Darwin.openat(directoryFD, Self.fileName, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, mode_t(0o600))
        guard fileFD >= 0 else {
            Darwin.close(directoryFD)
            Darwin.rmdir(directory.path)
            throw NativeServiceError.captureFailed
        }
        let secured = Darwin.fchmod(fileFD, mode_t(0o600)) == 0
        Darwin.close(fileFD)
        guard secured else {
            Darwin.unlinkat(directoryFD, Self.fileName, 0)
            Darwin.close(directoryFD)
            Darwin.rmdir(directory.path)
            throw NativeServiceError.captureFailed
        }
        self.directory = directory
        self.directoryFD = directoryFD
    }

    func readPNG() throws -> Data {
        // Resolve relative to our still-open private directory, without following
        // a symlink. NONBLOCK also prevents a substituted FIFO from blocking open.
        let descriptor = Darwin.openat(directoryFD, Self.fileName, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC)
        guard descriptor >= 0 else { throw NativeServiceError.captureFailed }
        defer { Darwin.close(descriptor) }
        var info = stat()
        guard Darwin.fstat(descriptor, &info) == 0,
              info.st_mode & mode_t(S_IFMT) == mode_t(S_IFREG),
              info.st_uid == Darwin.getuid(), info.st_nlink == 1 else { throw NativeServiceError.captureFailed }
        guard info.st_size > 0 else { throw CocoaError(.userCancelled) }
        guard info.st_size <= off_t(Self.maximumBytes) else { throw NativeServiceError.imageLimit }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 64 * 1024)
        while true {
            // Read one byte beyond the remaining budget to detect concurrent growth.
            let count = buffer.withUnsafeMutableBytes {
                Darwin.read(descriptor, $0.baseAddress, min($0.count, Self.maximumBytes - data.count + 1))
            }
            if count < 0 {
                if errno == EINTR { continue }
                throw NativeServiceError.captureFailed
            }
            if count == 0 { break }
            guard count <= Self.maximumBytes - data.count else { throw NativeServiceError.imageLimit }
            data.append(contentsOf: buffer.prefix(count))
        }
        let source = try ServiceImage.source(data)
        guard CGImageSourceGetStatus(source) == .statusComplete,
              CGImageSourceGetStatusAtIndex(source, 0) == .statusComplete else { throw NativeServiceError.invalidImage }
        if CGImageSourceGetType(source) as String? == "public.png" { return data }
        guard let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw NativeServiceError.invalidImage }
        return try ServiceImage.png(image)
    }

    func cleanup() {
        cleanupLock.lock()
        guard !cleaned else { cleanupLock.unlock(); return }
        cleaned = true
        cleanupLock.unlock()
        // These are the two exact app-created scratch paths. No recursive removal.
        // unlinkat removes only capture.png itself, including a substituted symlink.
        Darwin.unlinkat(directoryFD, Self.fileName, 0)
        var opened = stat(), named = stat()
        if Darwin.fstat(directoryFD, &opened) == 0,
           Darwin.lstat(directory.path, &named) == 0,
           opened.st_dev == named.st_dev, opened.st_ino == named.st_ino,
           named.st_mode & mode_t(S_IFMT) == mode_t(S_IFDIR) {
            Darwin.rmdir(directory.path) // Succeeds only if our directory is empty.
        }
        Darwin.close(directoryFD)
    }

    /// Exercises file ownership and byte limits without invoking capture or TCC.
    static func selfTest() throws {
        let scratch = try CaptureScratch()
        defer { scratch.cleanup() }
        var directoryInfo = stat(), fileInfo = stat()
        guard Darwin.fstat(scratch.directoryFD, &directoryInfo) == 0,
              Darwin.fstatat(scratch.directoryFD, fileName, &fileInfo, AT_SYMLINK_NOFOLLOW) == 0,
              directoryInfo.st_mode & mode_t(0o777) == mode_t(0o700),
              fileInfo.st_mode & mode_t(0o777) == mode_t(0o600) else { throw NativeServiceError.selfTest }
        do {
            _ = try scratch.readPNG()
            throw NativeServiceError.selfTest
        } catch let error as CocoaError where error.code == .userCancelled { }
        let file = Darwin.openat(scratch.directoryFD, fileName, O_WRONLY | O_NOFOLLOW | O_CLOEXEC)
        guard file >= 0 else { throw NativeServiceError.selfTest }
        defer { Darwin.close(file) }
        guard let context = CGContext(data: nil, width: 2, height: 2, bitsPerComponent: 8, bytesPerRow: 8,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
              let image = context.makeImage() else { throw NativeServiceError.selfTest }
        let png = try ServiceImage.png(image)
        let written = png.withUnsafeBytes { Darwin.write(file, $0.baseAddress, $0.count) }
        guard written == png.count, try scratch.readPNG() == png else { throw NativeServiceError.selfTest }
        guard Darwin.ftruncate(file, off_t(maximumBytes + 1)) == 0 else { throw NativeServiceError.selfTest }
        do {
            _ = try scratch.readPNG()
            throw NativeServiceError.selfTest
        } catch NativeServiceError.imageLimit { }
        guard Darwin.unlinkat(scratch.directoryFD, fileName, 0) == 0,
              Darwin.symlinkat("/dev/null", scratch.directoryFD, fileName) == 0 else { throw NativeServiceError.selfTest }
        do {
            _ = try scratch.readPNG()
            throw NativeServiceError.selfTest
        } catch NativeServiceError.captureFailed { }
    }
}

final class CaptureService {
    private var process: Process?
    private var completion: ((Result<Data, Error>) -> Void)?
    private var generation = 0
    private var timeout: DispatchWorkItem?

    func capture(completion: @escaping (Result<Data, Error>) -> Void) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { self.capture(completion: completion) }
            return
        }
        cancel()
        guard CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess() else {
            completion(.failure(NativeServiceError.permission))
            return
        }
        let scratch: CaptureScratch
        do { scratch = try CaptureScratch() }
        catch { completion(.failure(error)); return }
        generation += 1
        let current = generation
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = ["-i", "-x", "-t", "png", scratch.path]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        self.process = process
        self.completion = completion
        process.terminationHandler = { [weak self] ended in
            DispatchQueue.main.async {
                // Every ended attempt cleans up, even if cancelled or superseded.
                guard let self = self, self.generation == current else { scratch.cleanup(); return }
                guard ended.terminationStatus == 0 else {
                    scratch.cleanup()
                    self.finish(.failure(CocoaError(.userCancelled)))
                    return
                }
                DispatchQueue.global(qos: .userInitiated).async {
                    let result: Result<Data, Error>
                    do { result = .success(try scratch.readPNG()) }
                    catch { result = .failure(error) }
                    scratch.cleanup()
                    DispatchQueue.main.async {
                        guard self.generation == current else { return }
                        self.finish(result)
                    }
                }
            }
        }
        do {
            try process.run()
            let deadline = DispatchWorkItem { [weak self] in
                guard let self = self, self.generation == current else { return }
                if process.isRunning { process.terminate() }
                // The termination handler owns cleanup; the process may still write.
                self.finish(.failure(NativeServiceError.captureFailed))
            }
            timeout = deadline
            DispatchQueue.main.asyncAfter(deadline: .now() + 120, execute: deadline)
        } catch {
            scratch.cleanup()
            finish(.failure(error))
        }
    }

    func cancel() {
        guard Thread.isMainThread else { DispatchQueue.main.async { self.cancel() }; return }
        generation += 1
        if let process = process, process.isRunning { process.terminate() }
        if completion != nil { finish(.failure(CocoaError(.userCancelled))) }
    }

    static func selfTest() throws { try CaptureScratch.selfTest() }

    private func finish(_ result: Result<Data, Error>) {
        generation += 1
        timeout?.cancel()
        timeout = nil
        process = nil
        let callback = completion
        completion = nil
        callback?(result)
    }
}

private final class PinPanel: NSPanel {
    var onClose: (() -> Void)?
    override var canBecomeKey: Bool { true }
    override func cancelOperation(_ sender: Any?) { close() }
    override func close() {
        let callback = onClose
        onClose = nil
        super.close()
        callback?()
    }
}

private final class PinImageView: NSImageView {
    var onZoom: ((CGFloat) -> Void)?
    override var acceptsFirstResponder: Bool { true }
    override func mouseDown(with event: NSEvent) { window?.performDrag(with: event) }
    override func scrollWheel(with event: NSEvent) {
        if abs(event.scrollingDeltaY) > 0 { onZoom?(event.scrollingDeltaY > 0 ? 1.1 : 1 / 1.1) }
    }
    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 { window?.close() } else { super.keyDown(with: event) }
    }
}

private final class PinContentView: NSView {
    let imageView = PinImageView()
    private var onCopy: () -> Void
    private let imageSize: CGSize
    private var scale: CGFloat = 1
    private var opacityIndex = 0
    private let opacityValues: [CGFloat] = [1, 0.75, 0.5, 0.25]
    private var buttons: [NSButton] = []

    init(image: CGImage, onCopy: @escaping () -> Void) {
        self.onCopy = onCopy
        let ratio = min(1, min(520 / CGFloat(image.width), 380 / CGFloat(image.height)))
        imageSize = CGSize(width: max(160, CGFloat(image.width) * ratio), height: max(80, CGFloat(image.height) * ratio))
        super.init(frame: NSRect(origin: .zero, size: CGSize(width: imageSize.width, height: imageSize.height + 38)))
        imageView.image = NSImage(cgImage: image, size: NSSize(width: CGFloat(image.width), height: CGFloat(image.height)))
        imageView.imageScaling = .scaleProportionallyUpOrDown
        imageView.onZoom = { [weak self] factor in self?.zoom(factor) }
        addSubview(imageView)
        let specs: [(String, Selector)] = [("−", #selector(smaller)), ("+", #selector(larger)),
                                          (L("Opacity"), #selector(opacity)), (L("Copy"), #selector(copyImage)),
                                          (L("Close"), #selector(closePin))]
        for (title, action) in specs {
            let button = NSButton(title: title, target: self, action: action)
            button.bezelStyle = .rounded
            buttons.append(button)
            addSubview(button)
        }
    }

    required init?(coder: NSCoder) { nil }
    override var acceptsFirstResponder: Bool { true }
    override func mouseDown(with event: NSEvent) { window?.performDrag(with: event) }
    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 { window?.close() } else { super.keyDown(with: event) }
    }
    override func layout() {
        super.layout()
        imageView.frame = NSRect(x: 0, y: 0, width: bounds.width, height: max(1, bounds.height - 38))
        let width = max(1, (bounds.width - 8) / CGFloat(buttons.count))
        for (index, button) in buttons.enumerated() {
            button.frame = NSRect(x: 4 + CGFloat(index) * width, y: bounds.height - 34, width: width, height: 28)
        }
    }
    private func zoom(_ factor: CGFloat) {
        scale = min(3, max(0.4, scale * factor))
        window?.setContentSize(NSSize(width: max(260, imageSize.width * scale), height: imageSize.height * scale + 38))
    }
    @objc private func smaller() { zoom(1 / 1.2) }
    @objc private func larger() { zoom(1.2) }
    @objc private func opacity() {
        opacityIndex = (opacityIndex + 1) % opacityValues.count
        window?.alphaValue = opacityValues[opacityIndex]
    }
    @objc private func copyImage() { onCopy() }
    @objc private func closePin() { window?.close() }
}

final class PinManager {
    private struct Pin {
        let id: UUID
        let panel: PinPanel
        let byteCount: Int
    }
    private var pins: [Pin] = []
    private let onCopy: (Data) -> Void
    private let onError: (String) -> Void

    init(onCopy: @escaping (Data) -> Void, onError: @escaping (String) -> Void) {
        self.onCopy = onCopy
        self.onError = onError
    }

    func pin(_ data: Data) {
        guard Thread.isMainThread else { DispatchQueue.main.async { self.pin(data) }; return }
        guard pins.count < 5, data.count <= ServiceImage.maximumBytes - pins.reduce(0, { $0 + $1.byteCount }) else {
            onError(L("Floating pins are limited to five images and 32 MiB."))
            return
        }
        do {
            let image = try ServiceImage.preview(data)
            let id = UUID()
            let content = PinContentView(image: image, onCopy: { [weak self] in self?.onCopy(data) })
            let panel = PinPanel(contentRect: content.frame, styleMask: [.titled, .closable, .resizable, .utilityWindow, .nonactivatingPanel], backing: .buffered, defer: false)
            panel.title = L("Pinned image")
            panel.contentView = content
            panel.minSize = NSSize(width: 260, height: 140)
            panel.level = .floating
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            panel.hidesOnDeactivate = false
            panel.isReleasedWhenClosed = false
            panel.isMovableByWindowBackground = true
            panel.onClose = { [weak self] in self?.pins.removeAll { $0.id == id } }
            pins.append(Pin(id: id, panel: panel, byteCount: data.count))
            panel.center()
            panel.setFrameOrigin(NSPoint(x: panel.frame.origin.x + CGFloat(pins.count - 1) * 24,
                                         y: panel.frame.origin.y - CGFloat(pins.count - 1) * 24))
            panel.makeKeyAndOrderFront(nil)
            panel.makeFirstResponder(content.imageView)
        } catch { onError(error.localizedDescription) }
    }

    func closeAll() {
        guard Thread.isMainThread else { DispatchQueue.main.async { self.closeAll() }; return }
        let panels = pins.map { $0.panel }
        for panel in panels { panel.close() }
    }
}

/// Vision coordinates: normalized to the oriented image, with a bottom-left origin.
/// A result is a whole line if Vision cannot supply distinct, trustworthy word boxes.
struct OCRWord {
    let text: String
    let rect: CGRect
}

private final class OCRTask {
    private let lock = NSLock()
    private var cancelled = false
    private var request: VNRecognizeTextRequest?
    let completion: (Result<[OCRWord], Error>) -> Void
    var timeout: DispatchWorkItem?

    init(completion: @escaping (Result<[OCRWord], Error>) -> Void) { self.completion = completion }
    func check() throws {
        lock.lock()
        let stopped = cancelled
        lock.unlock()
        if stopped { throw CocoaError(.userCancelled) }
    }
    func attach(_ request: VNRecognizeTextRequest) throws {
        lock.lock()
        let stopped = cancelled
        if !stopped { self.request = request }
        lock.unlock()
        if stopped { throw CocoaError(.userCancelled) }
    }
    func cancel() {
        lock.lock()
        cancelled = true
        let request = self.request
        lock.unlock()
        request?.cancel()
    }
}

final class OCRService {
    private let queue = DispatchQueue(label: "app.clipnacre.ocr", qos: .userInitiated)
    private var active: OCRTask?

    static func supportedLanguages() -> [String] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        return (try? request.supportedRecognitionLanguages()) ?? []
    }

    func recognize(_ data: Data, language: String?, completion: @escaping (Result<[OCRWord], Error>) -> Void) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { self.recognize(data, language: language, completion: completion) }
            return
        }
        cancel()
        let task = OCRTask(completion: completion)
        active = task
        let deadline = DispatchWorkItem { [weak self, weak task] in
            guard let self = self, let task = task, self.active === task else { return }
            task.cancel()
            self.finish(task, result: .failure(NativeServiceError.timeout))
        }
        task.timeout = deadline
        DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: deadline)
        queue.async { [weak self] in
            let result: Result<[OCRWord], Error>
            do {
                try task.check()
                let source = try ServiceImage.source(data)
                guard let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
                    throw NativeServiceError.invalidImage
                }
                let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
                let value = (properties?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
                let orientation = CGImagePropertyOrientation(rawValue: value) ?? .up
                result = .success(try Self.perform(image: image, orientation: orientation, language: language, task: task))
            } catch { result = .failure(error) }
            DispatchQueue.main.async { self?.finish(task, result: result) }
        }
    }

    func cancel() {
        guard Thread.isMainThread else { DispatchQueue.main.async { self.cancel() }; return }
        guard let task = active else { return }
        task.cancel()
        finish(task, result: .failure(CocoaError(.userCancelled)))
    }

    private func finish(_ task: OCRTask, result: Result<[OCRWord], Error>) {
        guard active === task else { return }
        active = nil
        task.timeout?.cancel()
        task.timeout = nil
        task.completion(result)
    }

    private static func perform(image: CGImage, orientation: CGImagePropertyOrientation, language: String?, task: OCRTask) throws -> [OCRWord] {
        try task.check()
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        let supported = try request.supportedRecognitionLanguages()
        var languages: [String] = []
        if let language = language, !language.isEmpty {
            guard supported.contains(language) else { throw NativeServiceError.unavailableLanguage }
            languages.append(language)
        } else {
            for preferred in Locale.preferredLanguages {
                if let match = supported.first(where: { $0 == preferred || $0.split(separator: "-").first == preferred.split(separator: "-").first }),
                   !languages.contains(match) { languages.append(match) }
            }
        }
        if let english = supported.first(where: { $0 == "en-US" }) ?? supported.first(where: { $0.hasPrefix("en") }),
           !languages.contains(english) { languages.append(english) }
        if !languages.isEmpty { request.recognitionLanguages = languages }
        request.automaticallyDetectsLanguage = language == nil || language?.isEmpty == true
        try task.attach(request)
        // Vision performs recognition locally; no capture, permissions, network or cloud service.
        try VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:]).perform([request])
        try task.check()
        var words: [OCRWord] = []
        var byteCount = 0
        var tokenCount = 0
        for observation in request.results ?? [] {
            try task.check()
            guard let text = observation.topCandidates(1).first, !text.string.isEmpty else { continue }
            byteCount += text.string.utf8.count + 1
            guard byteCount <= 64 * 1024 else { throw NativeServiceError.textLimit }
            var ranges: [Range<String.Index>] = []
            var start: String.Index?
            for index in text.string.indices {
                if text.string[index].isWhitespace {
                    if let beginning = start { ranges.append(beginning..<index); start = nil }
                } else if start == nil { start = index }
            }
            if let start = start { ranges.append(start..<text.string.endIndex) }
            tokenCount += ranges.count
            guard tokenCount <= 4096 else { throw NativeServiceError.textLimit }
            var lineWords: [OCRWord] = []
            for range in ranges {
                guard let box = try? text.boundingBox(for: range),
                      let rect = normalized(box.boundingBox) else { lineWords.removeAll(); break }
                lineWords.append(OCRWord(text: String(text.string[range]), rect: rect))
            }
            // Some Vision revisions return a whole-line box for every requested word.
            // Report one truthful line rectangle in that case, never fabricated word positions.
            let repeatedLineBox = lineWords.count > 1 && lineWords.dropFirst().allSatisfy {
                abs($0.rect.minX - lineWords[0].rect.minX) < 0.0001 &&
                abs($0.rect.minY - lineWords[0].rect.minY) < 0.0001 &&
                abs($0.rect.width - lineWords[0].rect.width) < 0.0001 &&
                abs($0.rect.height - lineWords[0].rect.height) < 0.0001
            }
            if lineWords.count == ranges.count && !lineWords.isEmpty && !repeatedLineBox {
                words.append(contentsOf: lineWords)
            } else if let rect = normalized(observation.boundingBox) {
                words.append(OCRWord(text: text.string, rect: rect))
            }
        }
        return words
    }

    private static func normalized(_ rect: CGRect) -> CGRect? {
        guard rect.minX.isFinite, rect.minY.isFinite, rect.width.isFinite, rect.height.isFinite else { return nil }
        let clipped = rect.intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
        return clipped.isNull || clipped.isEmpty ? nil : clipped
    }

    static func selfTest() throws {
        let width = 1000, height = 180
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                                      bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            throw NativeServiceError.selfTest
        }
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.textMatrix = .identity
        context.textPosition = CGPoint(x: 36, y: 65)
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: "CLIPNACRE 12345", attributes: [
            NSAttributedString.Key(kCTFontAttributeName as String): CTFontCreateWithName("Helvetica" as CFString, 56, nil),
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: 0, alpha: 1)
        ]))
        CTLineDraw(line, context)
        guard let image = context.makeImage() else { throw NativeServiceError.selfTest }
        let semaphore = DispatchSemaphore(value: 0)
        let box = OCRTestResult()
        let task = OCRTask(completion: { _ in })
        DispatchQueue.global(qos: .userInitiated).async {
            do { box.set(.success(try Self.perform(image: image, orientation: .up, language: "en-US", task: task))) }
            catch { box.set(.failure(error)) }
            semaphore.signal()
        }
        guard semaphore.wait(timeout: .now() + 30) == .success else {
            task.cancel()
            throw NativeServiceError.timeout
        }
        guard let result = box.get() else { throw NativeServiceError.selfTest }
        let words = try result.get()
        let text = words.map { $0.text }.joined(separator: " ").uppercased()
        guard text.contains("CLIPNACRE"), text.contains("12345"), !words.isEmpty,
              words.allSatisfy({ normalized($0.rect) == $0.rect }) else { throw NativeServiceError.selfTest }
    }
}

private final class OCRTestResult {
    private let lock = NSLock()
    private var result: Result<[OCRWord], Error>?
    func set(_ value: Result<[OCRWord], Error>) { lock.lock(); result = value; lock.unlock() }
    func get() -> Result<[OCRWord], Error>? { lock.lock(); defer { lock.unlock() }; return result }
}
