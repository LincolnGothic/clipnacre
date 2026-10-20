import Foundation
import ImageIO
import CoreGraphics
import Darwin

public struct HistoryItem: Codable, Equatable, Identifiable {
    public let id: UUID
    public let text: String?
    public let imageData: Data?
    public var pinned: Bool
    public var modified: Date

    public var preview: String {
        if let text = text { return String(text.prefix(160)) }
        guard let data = imageData,
              let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let type = CGImageSourceGetType(source),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
              let height = properties[kCGImagePropertyPixelHeight] as? NSNumber else { return "Image" }
        let format = (type as String) == "public.jpeg" ? "JPEG" : "PNG"
        return "Image · \(format) · \(width.intValue)×\(height.intValue)"
    }

    public init(id: UUID = UUID(), text: String? = nil, imageData: Data? = nil,
                pinned: Bool = false, modified: Date = Date()) {
        self.id = id
        self.text = text
        self.imageData = imageData
        self.pinned = pinned
        self.modified = modified
    }
}

public enum HistoryImageValidation {
    /// Checks encoded size and ImageIO metadata before allocating decoded pixels.
    /// Clipboard TIFF must be converted to PNG by the application first.
    public static func validatedImageData(_ data: Data) -> Data? {
        guard !data.isEmpty, data.count <= History.maximumImageBytes else { return nil }
        let options = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, options),
              CGImageSourceGetCount(source) == 1,
              let type = CGImageSourceGetType(source),
              (type as String) == "public.png" || (type as String) == "public.jpeg",
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, options) as? [CFString: Any],
              let widthNumber = properties[kCGImagePropertyPixelWidth] as? NSNumber,
              let heightNumber = properties[kCGImagePropertyPixelHeight] as? NSNumber else { return nil }
        let width = widthNumber.doubleValue
        let height = heightNumber.doubleValue
        guard width.isFinite, height.isFinite, width.rounded() == width, height.rounded() == height,
              width >= 1, height >= 1,
              width <= Double(History.maximumImageSide), height <= Double(History.maximumImageSide),
              width * height <= Double(History.maximumImagePixels),
              CGImageSourceGetStatus(source) == .statusComplete,
              let image = CGImageSourceCreateImageAtIndex(source, 0, [
                kCGImageSourceShouldCache: true, kCGImageSourceShouldCacheImmediately: true
              ] as CFDictionary),
              image.width == Int(width), image.height == Int(height) else { return nil }
        return data
    }
}

public struct History {
    public static let maximumTextBytes = 16 * 1024
    public static let maximumTotalTextBytes = 2 * 1024 * 1024
    public static let maximumImageBytes = 8 * 1024 * 1024
    public static let maximumTotalImageBytes = 32 * 1024 * 1024
    public static let maximumImageSide = 8192
    public static let maximumImagePixels = 16_000_000
    public static let maximumPins = 100

    public private(set) var items: [HistoryItem] = []
    /// The retained unpinned count. Pins have their own fixed cap.
    public var limit: Int {
        didSet {
            limit = min(500, max(1, limit))
            trim()
        }
    }
    public var isPaused = false
    public var isMemoryOnly = false

    public init(limit: Int = 100) { self.limit = min(500, max(1, limit)) }

    @discardableResult
    public mutating func addText(_ text: String) -> HistoryItem? {
        guard !isPaused, Self.validText(text) else { return nil }
        return insert(text: text, imageData: nil)
    }

    @discardableResult
    public mutating func addImage(_ data: Data) -> HistoryItem? {
        guard !isPaused, let data = HistoryImageValidation.validatedImageData(data) else { return nil }
        return insert(text: nil, imageData: data)
    }

    public mutating func togglePin(_ id: UUID) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        guard items[index].pinned || items.filter(\.pinned).count < Self.maximumPins else { return }
        items[index].pinned.toggle()
        items[index].modified = Date()
        trim()
    }

    public mutating func remove(_ id: UUID) { items.removeAll { $0.id == id } }

    public mutating func clear(includePinned: Bool) {
        items.removeAll { includePinned || !$0.pinned }
    }

    public func search(_ query: String) -> [HistoryItem] {
        let terms = Self.searchKey(query).split(whereSeparator: \.isWhitespace).map(String.init)
        guard !terms.isEmpty else { return items }
        return items.filter { item in
            let content = item.text ?? (item.preview + " " + item.preview.replacingOccurrences(of: "×", with: "x"))
            let haystack = Self.searchKey(content)
            return terms.allSatisfy { haystack.contains($0) }
        }
    }

    private static func searchKey(_ text: String) -> String {
        text.precomposedStringWithCompatibilityMapping.folding(
            options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
            locale: Locale(identifier: "en_US_POSIX"))
    }

    fileprivate static func validText(_ text: String) -> Bool {
        !text.isEmpty && !text.utf8.contains(0) && text.utf8.count <= maximumTextBytes
    }

    private mutating func insert(text: String?, imageData: Data?) -> HistoryItem? {
        if let index = items.firstIndex(where: { item in
            let sameText = item.text.map { Data($0.utf8) } == text.map { Data($0.utf8) }
            return sameText && item.imageData == imageData
        }) {
            var item = items.remove(at: index)
            item.modified = Date()
            items.insert(item, at: 0)
            return item
        }
        let pinnedText = items.filter(\.pinned).reduce(0) { $0 + ($1.text?.utf8.count ?? 0) }
        let pinnedImages = items.filter(\.pinned).reduce(0) { $0 + ($1.imageData?.count ?? 0) }
        guard pinnedText + (text?.utf8.count ?? 0) <= Self.maximumTotalTextBytes,
              pinnedImages + (imageData?.count ?? 0) <= Self.maximumTotalImageBytes else { return nil }
        let item = HistoryItem(text: text, imageData: imageData)
        items.insert(item, at: 0)
        trim()
        return items.first(where: { $0.id == item.id })
    }

    private mutating func trim() {
        var unpinnedCount = items.filter { !$0.pinned }.count
        var textBytes = items.reduce(0) { $0 + ($1.text?.utf8.count ?? 0) }
        var imageBytes = items.reduce(0) { $0 + ($1.imageData?.count ?? 0) }
        while unpinnedCount > limit || textBytes > Self.maximumTotalTextBytes || imageBytes > Self.maximumTotalImageBytes {
            guard let index = items.lastIndex(where: { !$0.pinned }) else { break }
            let removed = items.remove(at: index)
            unpinnedCount -= 1
            textBytes -= removed.text?.utf8.count ?? 0
            imageBytes -= removed.imageData?.count ?? 0
        }
    }

    fileprivate init(snapshot: HistorySnapshot) throws {
        guard snapshot.version == 1, (1...500).contains(snapshot.limit),
              snapshot.items.count <= snapshot.limit + Self.maximumPins,
              snapshot.items.filter(\.pinned).count <= Self.maximumPins,
              snapshot.items.filter({ !$0.pinned }).count <= snapshot.limit,
              Set(snapshot.items.map(\.id)).count == snapshot.items.count else {
            throw HistoryPersistenceError.invalidHistory
        }
        var textBytes = 0
        var imageBytes = 0
        var seenText = Set<Data>()
        var seenImages = Set<Data>()
        for item in snapshot.items {
            guard item.modified.timeIntervalSinceReferenceDate.isFinite else {
                throw HistoryPersistenceError.invalidHistory
            }
            if let text = item.text {
                guard item.imageData == nil, Self.validText(text), seenText.insert(Data(text.utf8)).inserted else {
                    throw HistoryPersistenceError.invalidHistory
                }
                textBytes += text.utf8.count
            } else if let image = item.imageData {
                guard image.count <= Self.maximumImageBytes, seenImages.insert(image).inserted else {
                    throw HistoryPersistenceError.invalidHistory
                }
                imageBytes += image.count
            } else { throw HistoryPersistenceError.invalidHistory }
            guard textBytes <= Self.maximumTotalTextBytes, imageBytes <= Self.maximumTotalImageBytes else {
                throw HistoryPersistenceError.invalidHistory
            }
        }
        // Budget the entire snapshot before decoding any image.
        for item in snapshot.items where item.imageData != nil {
            guard HistoryImageValidation.validatedImageData(item.imageData!) != nil else {
                throw HistoryPersistenceError.invalidHistory
            }
        }
        self.init(limit: snapshot.limit)
        items = snapshot.items
        isPaused = snapshot.isPaused
    }
}

fileprivate struct HistorySnapshot: Codable {
    let version: Int
    let limit: Int
    let isPaused: Bool
    let items: [HistoryItem]
}

public enum HistoryPersistenceError: Error, LocalizedError {
    case unsafePath, inaccessibleStorage, oversizedFile, invalidHistory, writeFailed
    public var errorDescription: String? {
        switch self {
        case .unsafePath: return "History storage must be a private regular file in a private directory."
        case .inaccessibleStorage: return "History storage could not be accessed."
        case .oversizedFile: return "History storage exceeds the size limit."
        case .invalidHistory: return "History storage is invalid or unsupported."
        case .writeFailed: return "History storage could not be saved."
        }
    }
}

public struct HistoryPersistence {
    public static let maximumFileBytes = 64 * 1024 * 1024
    private static let filename = "history.json"
    public let directory: URL

    public init(directory: URL) { self.directory = directory.standardizedFileURL }

    public func load() throws -> History {
        guard let folder = try openDirectory(create: false) else { return History() }
        defer { close(folder) }
        try checkFile(in: folder)
        let descriptor = openat(folder, Self.filename, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
        if descriptor < 0 {
            if errno == ENOENT { return History() }
            throw HistoryPersistenceError.inaccessibleStorage
        }
        defer { close(descriptor) }
        var info = stat()
        guard fstat(descriptor, &info) == 0, isRegular(info), info.st_uid == getuid(), info.st_nlink == 1 else {
            throw HistoryPersistenceError.unsafePath
        }
        guard info.st_size >= 0, info.st_size <= Self.maximumFileBytes else { throw HistoryPersistenceError.oversizedFile }
        guard fchmod(descriptor, 0o600) == 0 else { throw HistoryPersistenceError.inaccessibleStorage }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 64 * 1024)
        while true {
            let count = buffer.withUnsafeMutableBytes { bytes in
                read(descriptor, bytes.baseAddress, bytes.count)
            }
            if count < 0 {
                if errno == EINTR { continue }
                throw HistoryPersistenceError.inaccessibleStorage
            }
            if count == 0 { break }
            guard data.count <= Self.maximumFileBytes - count else { throw HistoryPersistenceError.oversizedFile }
            data.append(contentsOf: buffer.prefix(count))
        }
        do { return try History(snapshot: JSONDecoder().decode(HistorySnapshot.self, from: data)) }
        catch let error as HistoryPersistenceError { throw error }
        catch { throw HistoryPersistenceError.invalidHistory }
    }

    public func save(_ history: History) throws {
        if history.isMemoryOnly { try erase(); return }
        guard let folder = try openDirectory(create: true) else { throw HistoryPersistenceError.inaccessibleStorage }
        defer { close(folder) }
        try checkFile(in: folder)
        let snapshot = HistorySnapshot(version: 1, limit: history.limit, isPaused: history.isPaused, items: history.items)
        let data: Data
        do { data = try JSONEncoder().encode(snapshot) }
        catch { throw HistoryPersistenceError.writeFailed }
        guard data.count <= Self.maximumFileBytes else { throw HistoryPersistenceError.oversizedFile }
        let temporaryName = ".history-\(UUID().uuidString).tmp"
        let descriptor = openat(folder, temporaryName, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode_t(0o600))
        guard descriptor >= 0 else { throw HistoryPersistenceError.writeFailed }
        var installed = false
        defer {
            close(descriptor)
            if !installed { _ = unlinkat(folder, temporaryName, 0) }
        }
        guard fchmod(descriptor, 0o600) == 0 else { throw HistoryPersistenceError.writeFailed }
        try data.withUnsafeBytes { bytes in
            guard let start = bytes.baseAddress else { return }
            var offset = 0
            while offset < bytes.count {
                let count = write(descriptor, start.advanced(by: offset), bytes.count - offset)
                if count < 0 && errno == EINTR { continue }
                guard count > 0 else { throw HistoryPersistenceError.writeFailed }
                offset += count
            }
        }
        guard fsync(descriptor) == 0 else { throw HistoryPersistenceError.writeFailed }
        try checkFile(in: folder)
        guard renameat(folder, temporaryName, folder, Self.filename) == 0 else { throw HistoryPersistenceError.writeFailed }
        installed = true
        guard fsync(folder) == 0 else { throw HistoryPersistenceError.writeFailed }
    }

    public func erase() throws {
        guard let folder = try openDirectory(create: false) else { return }
        defer { close(folder) }
        try checkFile(in: folder)
        guard unlinkat(folder, Self.filename, 0) == 0 || errno == ENOENT else {
            throw HistoryPersistenceError.inaccessibleStorage
        }
        guard fsync(folder) == 0 else { throw HistoryPersistenceError.inaccessibleStorage }
    }

    private func openDirectory(create: Bool) throws -> Int32? {
        guard directory.isFileURL else { throw HistoryPersistenceError.unsafePath }
        var info = stat()
        if lstat(directory.path, &info) != 0 {
            guard errno == ENOENT else { throw HistoryPersistenceError.inaccessibleStorage }
            guard create else { return nil }
            do { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                    attributes: [.posixPermissions: 0o700]) }
            catch { throw HistoryPersistenceError.inaccessibleStorage }
        }
        let descriptor = open(directory.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard descriptor >= 0 else { throw HistoryPersistenceError.unsafePath }
        guard fstat(descriptor, &info) == 0,
              (info.st_mode & mode_t(S_IFMT)) == mode_t(S_IFDIR), info.st_uid == getuid(),
              fchmod(descriptor, 0o700) == 0 else {
            close(descriptor)
            throw HistoryPersistenceError.unsafePath
        }
        return descriptor
    }

    private func checkFile(in folder: Int32) throws {
        var info = stat()
        if fstatat(folder, Self.filename, &info, AT_SYMLINK_NOFOLLOW) != 0 {
            if errno == ENOENT { return }
            throw HistoryPersistenceError.inaccessibleStorage
        }
        guard isRegular(info), info.st_uid == getuid(), info.st_nlink == 1 else {
            throw HistoryPersistenceError.unsafePath
        }
    }

    private func isRegular(_ info: stat) -> Bool {
        (info.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG)
    }
}
