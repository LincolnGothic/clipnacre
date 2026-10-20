import AppKit
import ImageIO
import UniformTypeIdentifiers

// Native smoke tests exercise the same renderer used by copy, save and pin.
extension ImageEditorController {
    static func selfTest() throws {
        func require(_ condition: Bool, _ message: String) throws {
            if !condition { throw NSError(domain: "ClipNacre.EditorTest", code: 1,
                                          userInfo: [NSLocalizedDescriptionKey: message]) }
        }
        let source = CGContext(data: nil, width: 40, height: 30, bitsPerComponent: 8,
                               bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        source.setFillColor(NSColor.red.cgColor)
        source.fill(CGRect(x: 0, y: 0, width: 40, height: 30))
        let original = source.makeImage()!
        var state = EditorState(crop: CGRect(x: 5, y: 5, width: 20, height: 15))
        state.marks = [EditorMark(tool: .mosaic, points: [CGPoint(x: 5, y: 5), CGPoint(x: 25, y: 20)])]
        let rendered = EditorRenderer.render(original, state: state)!
        try require(rendered.width == 20 && rendered.height == 15, "Crop dimensions")
        let sample = NSBitmapImageRep(cgImage: rendered).colorAt(x: 10, y: 7)!.usingColorSpace(.deviceRGB)!
        try require(abs(sample.redComponent - sample.greenComponent) < 0.02 && sample.alphaComponent > 0.99,
                    "Redaction must replace original pixels with opaque gray")
        var fractional = EditorState(crop: CGRect(x: 0, y: 0, width: 40, height: 30))
        fractional.marks = [EditorMark(tool: .mosaic, points: [CGPoint(x: 5.25, y: 6.75), CGPoint(x: 24.25, y: 23.25)])]
        let redacted = NSBitmapImageRep(cgImage: EditorRenderer.render(original, state: fractional)!)
        // The symmetric vertical interval covers the same bitmap rows in either orientation.
        for y in 6..<24 {
            for x in 5..<25 {
                let pixel = redacted.colorAt(x: x, y: y)!.usingColorSpace(.deviceRGB)!
                try require(abs(pixel.redComponent - pixel.greenComponent) < 0.02 &&
                            abs(pixel.greenComponent - pixel.blueComponent) < 0.02 && pixel.alphaComponent > 0.99,
                            "Fractional redaction must fully replace every boundary pixel")
            }
        }
        let outside = redacted.colorAt(x: 4, y: 6)!.usingColorSpace(.deviceRGB)!
        try require(outside.redComponent > 0.95 && outside.greenComponent < 0.05,
                    "Redaction must preserve pixels outside its integral coverage")
        let png = EditorRenderer.png(rendered)!
        try require(CGImageSourceCreateWithData(png as CFData, nil) != nil, "PNG round trip")
        var arrowState = EditorState(crop: CGRect(x: 0, y: 0, width: 40, height: 30))
        arrowState.marks = [EditorMark(tool: .rectangle, points: [CGPoint(x: 2, y: 2), CGPoint(x: 38, y: 28)], color: .blue)]
        let marked = EditorRenderer.render(original, state: arrowState)!
        try require(EditorRenderer.png(marked) != EditorRenderer.png(original), "Annotations must affect export")
        var grayState = EditorState(crop: CGRect(x: 0, y: 0, width: 40, height: 30))
        grayState.marks = [EditorMark(tool: .grayscale, points: [.zero, CGPoint(x: 40, y: 30)])]
        let gray = NSBitmapImageRep(cgImage: EditorRenderer.render(original, state: grayState)!)
            .colorAt(x: 20, y: 15)!.usingColorSpace(.deviceRGB)!
        try require(abs(gray.redComponent - gray.greenComponent) < 0.02 && abs(gray.greenComponent - gray.blueComponent) < 0.02,
                    "Grayscale must affect exported pixels")
        try require(EditorRenderer.validatedImage(Data([0, 1, 2])) == nil, "Reject malformed image")
    }
}

private enum EditorTool: String, CaseIterable {
    case select = "Select", crop = "Crop", arrow = "Arrow", rectangle = "Rectangle"
    case highlight = "Highlight", pen = "Pen", text = "Text", mosaic = "Mosaic"
    case grayscale = "Grayscale", number = "Number", ocr = "OCR selection", pan = "Pan"
}

private struct EditorMark {
    var tool: EditorTool
    var points: [CGPoint]
    var text = ""
    var color = NSColor.systemRed
    var width: CGFloat = 4
    var bounds: CGRect {
        let xs = points.map(\.x), ys = points.map(\.y)
        return CGRect(x: xs.min() ?? 0, y: ys.min() ?? 0,
                      width: max(1, (xs.max() ?? 0) - (xs.min() ?? 0)),
                      height: max(1, (ys.max() ?? 0) - (ys.min() ?? 0)))
    }
    mutating func translate(_ delta: CGPoint) {
        points = points.map { CGPoint(x: $0.x + delta.x, y: $0.y + delta.y) }
    }
}

private struct EditorState {
    var crop: CGRect
    var marks: [EditorMark] = []
}

private enum EditorRenderer {
    static func validatedImage(_ data: Data) -> CGImage? {
        guard !data.isEmpty, data.count <= 8 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
              let height = properties[kCGImagePropertyPixelHeight] as? NSNumber else { return nil }
        let w = width.intValue, h = height.intValue
        guard w > 0, h > 0, w <= 8192, h <= 8192, w * h <= 16_000_000 else { return nil }
        // Thumbnail creation applies EXIF orientation while keeping the validated dimensions bounded.
        return CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: max(w, h),
            kCGImageSourceShouldCacheImmediately: true
        ] as CFDictionary)
    }

    static func png(_ image: CGImage) -> Data? {
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, nil)
        return CGImageDestinationFinalize(destination) ? data as Data : nil
    }

    static func render(_ image: CGImage, state: EditorState) -> CGImage? {
        let crop = state.crop.integral.intersection(CGRect(x: 0, y: 0, width: CGFloat(image.width), height: CGFloat(image.height)))
        guard crop.width >= 1, crop.height >= 1,
              let context = CGContext(data: nil, width: Int(crop.width), height: Int(crop.height),
                                      bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.translateBy(x: -crop.minX, y: -crop.minY)
        draw(image, state: state, in: context)
        return context.makeImage()
    }

    static func draw(_ image: CGImage, state: EditorState, in context: CGContext) {
        context.saveGState()
        context.clip(to: state.crop)
        let imageRect = CGRect(x: 0, y: 0, width: CGFloat(image.width), height: CGFloat(image.height))
        context.draw(image, in: imageRect)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
        for mark in state.marks {
            guard let first = mark.points.first, let last = mark.points.last else { continue }
            let rect = mark.bounds
            context.saveGState()
            context.setStrokeColor(mark.color.cgColor)
            context.setFillColor(mark.color.cgColor)
            context.setLineWidth(mark.width)
            context.setLineCap(.round)
            context.setLineJoin(.round)
            switch mark.tool {
            case .arrow:
                context.move(to: first); context.addLine(to: last); context.strokePath()
                let angle = atan2(last.y - first.y, last.x - first.x), length = max(12, mark.width * 4)
                context.move(to: last)
                context.addLine(to: CGPoint(x: last.x - length * cos(angle - .pi / 6), y: last.y - length * sin(angle - .pi / 6)))
                context.addLine(to: CGPoint(x: last.x - length * cos(angle + .pi / 6), y: last.y - length * sin(angle + .pi / 6)))
                context.closePath(); context.fillPath()
            case .rectangle: context.stroke(rect)
            case .highlight:
                context.setFillColor(mark.color.withAlphaComponent(0.3).cgColor); context.fill(rect)
            case .pen:
                context.addLines(between: mark.points); context.strokePath()
            case .mosaic:
                // Opaque replacement, not a reversible blur of sensitive pixels.
                let redaction = rect.integral
                context.setShouldAntialias(false)
                context.setBlendMode(.copy)
                context.clip(to: redaction)
                context.setFillColor(NSColor(white: 0.88, alpha: 1).cgColor); context.fill(redaction)
                context.setFillColor(NSColor(white: 0.97, alpha: 1).cgColor)
                for x in stride(from: redaction.minX, to: redaction.maxX, by: CGFloat(10)) {
                    for y in stride(from: redaction.minY, to: redaction.maxY, by: CGFloat(10)) where (Int((x - redaction.minX) / 10) + Int((y - redaction.minY) / 10)) % 2 == 0 {
                        context.fill(CGRect(x: x, y: y, width: 10, height: 10))
                    }
                }
            case .grayscale:
                // Desaturate the composed content, preserving earlier redactions and annotations.
                context.setBlendMode(.saturation)
                context.setFillColor(NSColor(white: 0.5, alpha: 1).cgColor)
                context.fill(rect)
            case .text, .number:
                if mark.tool == .number { context.fillEllipse(in: rect) }
                let fontSize = mark.tool == .number ? max(12, min(rect.width, rect.height) * 0.55) : max(12, min(72, rect.height * 0.7))
                let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.boldSystemFont(ofSize: fontSize),
                    .foregroundColor: mark.tool == .number ? NSColor.white : mark.color]
                let text = mark.text as NSString
                let size = text.size(withAttributes: attributes)
                text.draw(at: CGPoint(x: rect.minX + (mark.tool == .number ? (rect.width - size.width) / 2 : 0),
                                      y: rect.minY + (rect.height - size.height) / 2), withAttributes: attributes)
            default: break
            }
            context.restoreGState()
        }
        NSGraphicsContext.restoreGraphicsState()
        context.restoreGState()
    }
}

final class ImageEditorController: NSWindowController, NSWindowDelegate {
    private let canvas: EditorCanvas
    private let onCopy: (Data) -> Void
    private let onPin: (Data) -> Void
    private let ocr = OCRService()
    private let resultView = NSTextView()
    private let language = NSPopUpButton()
    private let status = NSTextField(labelWithString: "")
    private let toolPopup = NSPopUpButton()
    private let zoomLabel = NSTextField(labelWithString: "100%")
    private var ocrGeneration = 0
    private var closed = false

    init?(data: Data, onCopy: @escaping (Data) -> Void, onPin: @escaping (Data) -> Void) {
        guard let image = EditorRenderer.validatedImage(data) else { return nil }
        canvas = EditorCanvas(image: image)
        self.onCopy = onCopy
        self.onPin = onPin
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1160, height: 760),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = L("Image editor")
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 850, height: 560)
        super.init(window: window)
        window.delegate = self
        buildUI(window)
        canvas.onChange = { [weak self] in self?.ocrGeneration += 1; self?.ocr.cancel() }
        canvas.onOCRSelection = { [weak self] text in self?.resultView.string = text }
        canvas.onZoom = { [weak self] zoom in self?.zoomLabel.stringValue = "\(Int(zoom * 100))%" }
        window.center()
        canvas.setZoom(min(1, min(800 / CGFloat(image.width), 600 / CGFloat(image.height))))
        window.makeFirstResponder(canvas)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    private func button(_ title: String, _ selector: Selector, key: String = "") -> NSButton {
        let button = NSButton(title: L(title), target: self, action: selector)
        button.bezelStyle = .rounded
        button.toolTip = L(title)
        button.setAccessibilityLabel(L(title))
        if !key.isEmpty {
            button.keyEquivalent = key.lowercased()
            button.keyEquivalentModifierMask = key == "Z" ? [.command, .shift] : [.command]
        }
        return button
    }

    private func buildUI(_ window: NSWindow) {
        let root = NSStackView()
        root.orientation = .vertical; root.spacing = 8
        root.edgeInsets = NSEdgeInsets(top: 10, left: 10, bottom: 10, right: 10)
        root.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(root)
        NSLayoutConstraint.activate([
            root.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor),
            root.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor),
            root.topAnchor.constraint(equalTo: window.contentView!.topAnchor),
            root.bottomAnchor.constraint(equalTo: window.contentView!.bottomAnchor)
        ])
        toolPopup.addItems(withTitles: EditorTool.allCases.map { L($0.rawValue) })
        toolPopup.target = self; toolPopup.action = #selector(changeTool)
        toolPopup.setAccessibilityLabel(L("Annotation tool"))
        toolPopup.toolTip = L("Select a tool. Drag to draw; select a mark to move it or drag its square handle to resize.")
        let color = NSColorWell(frame: NSRect(x: 0, y: 0, width: 42, height: 26))
        color.color = .systemRed; color.target = self; color.action = #selector(changeColor(_:))
        color.setAccessibilityLabel(L("Annotation color")); color.toolTip = L("Annotation color")
        let width = NSSlider(value: 4, minValue: 1, maxValue: 20, target: self, action: #selector(changeWidth(_:)))
        width.widthAnchor.constraint(equalToConstant: 80).isActive = true
        width.setAccessibilityLabel(L("Stroke width")); width.toolTip = L("Stroke width")
        let toolbar = NSStackView(views: [toolPopup, color, width,
            button("Undo", #selector(undoEdit), key: "z"), button("Redo", #selector(redoEdit), key: "Z"),
            button("Delete", #selector(deleteMark)), button("−", #selector(zoomOut)), zoomLabel,
            button("+", #selector(zoomIn)), button("Fit", #selector(fit))])
        toolbar.spacing = 6
        root.addArrangedSubview(toolbar)
        let actions = NSStackView(views: [button("Copy image", #selector(copyImage), key: "c"),
            button("Save PNG", #selector(saveImage), key: "s"), button("Pin image", #selector(pinImage)),
            button("Recognize text", #selector(recognize)), language, button("Copy text", #selector(copyText)), status])
        actions.spacing = 6
        language.addItem(withTitle: L("Automatic"))
        language.addItems(withTitles: OCRService.supportedLanguages())
        language.setAccessibilityLabel(L("Recognition language")); language.toolTip = L("Recognition language")
        root.addArrangedSubview(actions)
        let scroll = NSScrollView()
        scroll.hasHorizontalScroller = true; scroll.hasVerticalScroller = true
        scroll.autohidesScrollers = true; scroll.borderType = .bezelBorder
        scroll.documentView = canvas
        canvas.setAccessibilityLabel(L("Image annotation canvas"))
        canvas.toolTip = L("Drag to annotate. Delete removes a selected mark. Command-Z undoes. Command-scroll zooms.")
        let resultScroll = NSScrollView()
        resultScroll.hasVerticalScroller = true; resultScroll.borderType = .bezelBorder
        resultScroll.documentView = resultView
        resultView.isRichText = false; resultView.isEditable = true; resultView.font = .systemFont(ofSize: 14)
        resultView.allowsUndo = true
        resultView.isVerticallyResizable = true
        resultView.autoresizingMask = [.width]
        resultView.textContainer?.widthTracksTextView = true
        resultView.setAccessibilityLabel(L("Recognized text, editable"))
        resultView.toolTip = L("Edit recognized text. Use OCR selection to click or drag over words in the image.")
        let body = NSStackView(views: [scroll, resultScroll])
        body.distribution = .fill; body.spacing = 8
        root.addArrangedSubview(body)
        NSLayoutConstraint.activate([
            body.widthAnchor.constraint(equalTo: root.widthAnchor, constant: -20),
            resultScroll.widthAnchor.constraint(equalToConstant: 250),
            scroll.heightAnchor.constraint(equalTo: body.heightAnchor),
            resultScroll.heightAnchor.constraint(equalTo: body.heightAnchor)
        ])
    }

    @objc private func changeTool() { canvas.tool = EditorTool.allCases[toolPopup.indexOfSelectedItem]; window?.makeFirstResponder(canvas) }
    @objc private func changeColor(_ sender: NSColorWell) { canvas.color = sender.color }
    @objc private func changeWidth(_ sender: NSSlider) { canvas.strokeWidth = CGFloat(sender.doubleValue) }
    @objc private func undoEdit() {
        if NSApp.currentEvent?.type == .keyDown, window?.firstResponder === resultView { resultView.undoManager?.undo() }
        else { canvas.undoEdit() }
    }
    @objc private func redoEdit() {
        if NSApp.currentEvent?.type == .keyDown, window?.firstResponder === resultView { resultView.undoManager?.redo() }
        else { canvas.redoEdit() }
    }
    @objc private func deleteMark() { canvas.deleteSelection() }
    @objc private func zoomIn() { canvas.setZoom(canvas.zoom * 1.25) }
    @objc private func zoomOut() { canvas.setZoom(canvas.zoom / 1.25) }
    @objc private func fit() {
        guard let size = canvas.enclosingScrollView?.contentSize else { return }
        canvas.setZoom(min(size.width / canvas.state.crop.width, size.height / canvas.state.crop.height))
    }
    private func output() -> Data? {
        guard !closed else { return nil }
        guard let image = EditorRenderer.render(canvas.image, state: canvas.state), let data = EditorRenderer.png(image) else {
            showError(L("The image could not be exported.")); return nil
        }
        guard data.count <= 8 * 1024 * 1024 else { showError(L("The exported image exceeds 8 MiB. Crop the image and try again.")); return nil }
        return data
    }
    @objc private func copyImage() {
        guard !closed else { return }
        if NSApp.currentEvent?.type == .keyDown, window?.firstResponder === resultView { resultView.copy(nil); return }
        guard let data = output() else { return }
        onCopy(data); status.stringValue = L("Image copied")
    }
    @objc private func pinImage() { if let data = output() { onPin(data) } }
    @objc private func saveImage() {
        guard let window = window, let data = output() else { return }
        let panel = NSSavePanel(); panel.allowedContentTypes = [.png]; panel.nameFieldStringValue = "ClipNacre.png"
        panel.beginSheetModal(for: window) { [weak self, weak panel] response in
            guard let self = self, !self.closed, response == .OK, let url = panel?.url else { return }
            do { try data.write(to: url, options: .atomic); self.status.stringValue = L("Image saved") }
            catch { self.showError(L("The image could not be saved.")) }
        }
    }
    @objc private func copyText() {
        guard !closed else { return }
        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(resultView.string, forType: .string)
        status.stringValue = L("Text copied")
    }
    @objc private func recognize() {
        guard let data = output() else { return }
        ocrGeneration += 1
        let generation = ocrGeneration, crop = canvas.state.crop
        status.stringValue = L("Recognizing text…")
        let selectedLanguage = language.indexOfSelectedItem > 0 ? language.titleOfSelectedItem : nil
        ocr.recognize(data, language: selectedLanguage) { [weak self] result in
            DispatchQueue.main.async {
                guard let self = self, self.ocrGeneration == generation else { return }
                switch result {
                case .success(let words):
                    self.canvas.words = words.map { word in
                        (word.text, CGRect(x: crop.minX + word.rect.minX * crop.width,
                                           y: crop.minY + word.rect.minY * crop.height,
                                           width: word.rect.width * crop.width, height: word.rect.height * crop.height))
                    }
                    self.canvas.selectedWords = Set(words.indices)
                    self.resultView.string = words.map(\.text).joined(separator: "\n")
                    self.status.stringValue = words.isEmpty ? L("No text found") : L("Select words in the image or edit the text")
                    self.canvas.tool = .ocr
                    self.toolPopup.selectItem(at: EditorTool.allCases.firstIndex(of: .ocr)!)
                    self.canvas.needsDisplay = true
                case .failure: self.status.stringValue = L("Text recognition failed")
                }
            }
        }
    }
    private func showError(_ message: String) {
        guard !closed else { return }
        let alert = NSAlert(); alert.messageText = message
        if let window = window { alert.beginSheetModal(for: window) }
    }
    private func cleanUp() {
        guard !closed else { return }
        closed = true
        ocrGeneration += 1; ocr.cancel()
        canvas.cancelPendingEditing()
        if let window = window, let sheet = window.attachedSheet {
            window.endSheet(sheet, returnCode: .cancel)
            sheet.orderOut(nil)
        }
    }
    override func close() { cleanUp(); super.close() }
    func windowWillClose(_ notification: Notification) { cleanUp() }
}

private final class EditorCanvas: NSView {
    let image: CGImage
    var state: EditorState
    var tool: EditorTool = .select
    var color = NSColor.systemRed
    var strokeWidth: CGFloat = 4
    private(set) var zoom: CGFloat = 1
    var words: [(String, CGRect)] = []
    var selectedWords: Set<Int> = []
    var onChange: (() -> Void)?
    var onOCRSelection: ((String) -> Void)?
    var onZoom: ((CGFloat) -> Void)?
    private var past: [EditorState] = []
    private var future: [EditorState] = []
    private var selected: Int?
    private var start = CGPoint.zero
    private var beforeDrag: EditorState?
    private var draft: EditorMark?
    private var resizing = false
    private var dragRect: CGRect?
    private var panOrigin = CGPoint.zero
    private var panStart = CGPoint.zero
    private var textAlert: NSAlert?
    private var editGeneration = 0
    private var closed = false

    init(image: CGImage) {
        let rect = CGRect(x: 0, y: 0, width: CGFloat(image.width), height: CGFloat(image.height))
        self.image = image
        state = EditorState(crop: rect)
        super.init(frame: rect)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    override var acceptsFirstResponder: Bool { true }
    func setZoom(_ value: CGFloat) {
        zoom = max(0.05, min(8, value))
        setFrameSize(NSSize(width: state.crop.width * zoom, height: state.crop.height * zoom))
        onZoom?(zoom); needsDisplay = true
    }
    private func point(_ event: NSEvent) -> CGPoint {
        let p = convert(event.locationInWindow, from: nil)
        return CGPoint(x: max(state.crop.minX, min(state.crop.maxX, p.x / zoom + state.crop.minX)),
                       y: max(state.crop.minY, min(state.crop.maxY, p.y / zoom + state.crop.minY)))
    }
    private func rectangle(_ a: CGPoint, _ b: CGPoint) -> CGRect {
        CGRect(x: min(a.x, b.x), y: min(a.y, b.y), width: abs(a.x - b.x), height: abs(a.y - b.y))
    }
    private func commit(_ previous: EditorState) {
        guard !closed else { return }
        editGeneration += 1
        past.append(previous); if past.count > 50 { past.removeFirst() }
        future.removeAll(); words.removeAll(); selectedWords.removeAll()
        onChange?(); setZoom(zoom)
    }
    func undoEdit() {
        guard !closed, let old = past.popLast() else { return }
        editGeneration += 1
        future.append(state); state = old; selected = nil; words.removeAll(); onChange?(); setZoom(zoom)
    }
    func redoEdit() {
        guard !closed, let next = future.popLast() else { return }
        editGeneration += 1
        past.append(state); state = next; selected = nil; words.removeAll(); onChange?(); setZoom(zoom)
    }
    func deleteSelection() {
        guard !closed, let index = selected, state.marks.indices.contains(index) else { return }
        let previous = state; state.marks.remove(at: index); selected = nil; commit(previous)
    }
    override func draw(_ dirtyRect: NSRect) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        context.saveGState(); context.scaleBy(x: zoom, y: zoom)
        context.translateBy(x: -state.crop.minX, y: -state.crop.minY)
        var display = state
        if let draft = draft { display.marks.append(draft) }
        EditorRenderer.draw(image, state: display, in: context)
        context.setLineWidth(1 / zoom)
        for (index, word) in words.enumerated() {
            context.setFillColor((selectedWords.contains(index) ? NSColor.systemBlue : NSColor.systemYellow).withAlphaComponent(0.22).cgColor)
            context.fill(word.1); context.setStrokeColor(NSColor.systemBlue.cgColor); context.stroke(word.1)
        }
        if let index = selected, state.marks.indices.contains(index) {
            let rect = state.marks[index].bounds
            context.setStrokeColor(NSColor.systemBlue.cgColor); context.stroke(rect.insetBy(dx: -3 / zoom, dy: -3 / zoom))
            context.setFillColor(NSColor.systemBlue.cgColor)
            context.fill(CGRect(x: rect.maxX - 4 / zoom, y: rect.maxY - 4 / zoom, width: 8 / zoom, height: 8 / zoom))
        }
        if let rect = dragRect {
            context.setStrokeColor(NSColor.systemBlue.cgColor); context.setLineDash(phase: 0, lengths: [5 / zoom, 3 / zoom]); context.stroke(rect)
        }
        context.restoreGState()
    }
    override func mouseDown(with event: NSEvent) {
        guard !closed else { return }
        window?.makeFirstResponder(self)
        start = point(event); beforeDrag = state; draft = nil; dragRect = nil; resizing = false
        if tool == .pan {
            panOrigin = enclosingScrollView?.contentView.bounds.origin ?? .zero
            panStart = event.locationInWindow
            return
        }
        if tool == .ocr || tool == .crop { return }
        if tool == .select {
            if let index = selected, state.marks.indices.contains(index) {
                let rect = state.marks[index].bounds
                if hypot(start.x - rect.maxX, start.y - rect.maxY) < 12 / zoom { resizing = true; return }
            }
            selected = state.marks.indices.reversed().first { state.marks[$0].bounds.insetBy(dx: -6 / zoom, dy: -6 / zoom).contains(start) }
            needsDisplay = true; return
        }
        guard state.marks.count < 1000 else { NSSound.beep(); return }
        draft = EditorMark(tool: tool, points: [start, start], color: color, width: strokeWidth)
        if tool == .number {
            let size: CGFloat = 36
            draft?.points = [start, CGPoint(x: start.x + size, y: start.y + size)]
            draft?.text = String(state.marks.filter { $0.tool == .number }.count + 1)
        }
    }
    override func mouseDragged(with event: NSEvent) {
        guard !closed else { return }
        let current = point(event)
        if tool == .pan, let scroll = enclosingScrollView {
            let p = event.locationInWindow
            scroll.contentView.scroll(to: CGPoint(x: panOrigin.x + panStart.x - p.x, y: panOrigin.y + panStart.y - p.y))
            scroll.reflectScrolledClipView(scroll.contentView); return
        }
        if tool == .crop || tool == .ocr { dragRect = rectangle(start, current); needsDisplay = true; return }
        if tool == .select, let index = selected, let previous = beforeDrag, previous.marks.indices.contains(index) {
            var mark = previous.marks[index]
            if resizing {
                if mark.tool == .arrow, mark.points.count == 2 {
                    mark.points[1] = current
                } else {
                    let rect = mark.bounds
                    let sx = max(1, current.x - rect.minX) / rect.width, sy = max(1, current.y - rect.minY) / rect.height
                    mark.points = mark.points.map { CGPoint(x: rect.minX + ($0.x - rect.minX) * sx, y: rect.minY + ($0.y - rect.minY) * sy) }
                }
            } else { mark.translate(CGPoint(x: current.x - start.x, y: current.y - start.y)) }
            state.marks[index] = mark; needsDisplay = true; return
        }
        if tool == .pen {
            if (draft?.points.count ?? 0) < 10_000 { draft?.points.append(current) }
        } else if tool != .number { draft?.points = [start, current] }
        needsDisplay = true
    }
    override func mouseUp(with event: NSEvent) {
        defer { draft = nil; beforeDrag = nil; dragRect = nil; needsDisplay = true }
        guard !closed, let previous = beforeDrag else { return }
        if tool == .ocr {
            let rect = dragRect
            if !event.modifierFlags.contains(.command) { selectedWords.removeAll() }
            if let rect = rect, rect.width > 2 / zoom, rect.height > 2 / zoom {
                for (index, word) in words.enumerated() where word.1.intersects(rect) { selectedWords.insert(index) }
            } else if let index = words.indices.first(where: { words[$0].1.contains(point(event)) }) {
                if selectedWords.contains(index) { selectedWords.remove(index) } else { selectedWords.insert(index) }
            }
            onOCRSelection?(words.enumerated().filter { selectedWords.contains($0.offset) }.map { $0.element.0 }.joined(separator: "\n")); return
        }
        if tool == .crop {
            if let rect = dragRect?.integral.intersection(state.crop), rect.width >= 2, rect.height >= 2 { state.crop = rect; selected = nil; commit(previous) }
            return
        }
        if tool == .select {
            if let index = selected, previous.marks.indices.contains(index), state.marks[index].points != previous.marks[index].points { commit(previous) }
            return
        }
        guard let mark = draft else { return }
        if tool == .text {
            requestText(mark, previous: previous, at: start)
            return
        }
        if mark.bounds.width > 1 || mark.bounds.height > 1 {
            state.marks.append(mark); selected = state.marks.count - 1; commit(previous)
        }
    }
    private func requestText(_ mark: EditorMark, previous: EditorState, at origin: CGPoint) {
        guard !closed, textAlert == nil, let window = window, window.attachedSheet == nil else { return }
        let generation = editGeneration
        let alert = NSAlert(); alert.messageText = L("Annotation text")
        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 26))
        input.setAccessibilityLabel(L("Annotation text")); alert.accessoryView = input
        alert.addButton(withTitle: L("Add")); alert.addButton(withTitle: L("Cancel"))
        alert.window.initialFirstResponder = input
        textAlert = alert
        alert.beginSheetModal(for: window) { [weak self, weak alert] response in
            guard let self = self, let alert = alert, self.textAlert === alert else { return }
            self.textAlert = nil
            guard !self.closed, self.editGeneration == generation,
                  response == .alertFirstButtonReturn, !input.stringValue.isEmpty else { return }
            var completed = mark
            completed.text = String(input.stringValue.prefix(1000))
            if completed.bounds.width < 20 || completed.bounds.height < 20 {
                completed.points = [origin, CGPoint(x: origin.x + min(CGFloat(completed.text.count) * 16, 600), y: origin.y + 36)]
            }
            self.state.marks.append(completed)
            self.selected = self.state.marks.count - 1
            self.commit(previous)
        }
    }
    func cancelPendingEditing() {
        closed = true; editGeneration += 1
        if let previous = beforeDrag { state = previous }
        beforeDrag = nil; draft = nil; dragRect = nil
        if let alert = textAlert {
            textAlert = nil
            (alert.accessoryView as? NSTextField)?.stringValue = ""
            if let parent = alert.window.sheetParent { parent.endSheet(alert.window, returnCode: .cancel) }
            alert.window.orderOut(nil)
        }
    }
    override func keyDown(with event: NSEvent) {
        if event.keyCode == 51 || event.keyCode == 117 { deleteSelection(); return }
        if event.keyCode == 53 {
            if let previous = beforeDrag { state = previous }
            selected = nil; draft = nil; beforeDrag = nil; dragRect = nil; needsDisplay = true; return
        }
        if event.modifierFlags.contains(.command), event.charactersIgnoringModifiers?.lowercased() == "z" {
            if event.modifierFlags.contains(.shift) { redoEdit() } else { undoEdit() }; return
        }
        super.keyDown(with: event)
    }
    override func scrollWheel(with event: NSEvent) {
        if event.modifierFlags.contains(.command) { setZoom(zoom * (event.scrollingDeltaY > 0 ? 1.1 : 0.9)) }
        else { super.scrollWheel(with: event) }
    }
    override func magnify(with event: NSEvent) { setZoom(zoom * (1 + event.magnification)) }
}
