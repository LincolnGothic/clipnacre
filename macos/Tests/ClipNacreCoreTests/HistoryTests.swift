import XCTest
import Foundation
import CoreGraphics
import ImageIO
@testable import ClipNacreCore

final class HistoryTests: XCTestCase {
    private func png(width: Int = 2, height: Int = 2) throws -> Data {
        let context = try XCTUnwrap(CGContext(data: nil, width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.setFillColor(CGColor(red: 0.2, green: 0.4, blue: 0.6, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let result = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(result, "public.png" as CFString, 1, nil))
        CGImageDestinationAddImage(destination, try XCTUnwrap(context.makeImage()), nil)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return result as Data
    }

    private func directory() throws -> URL {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("clipnacre-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: path, withIntermediateDirectories: true)
        return path
    }

    func testExactDeduplicationPreservesPinAndIdentity() throws {
        var history = History(limit: 2)
        let first = try XCTUnwrap(history.addText("hello"))
        history.togglePin(first.id)
        _ = history.addText("Hello")
        let again = try XCTUnwrap(history.addText("hello"))
        XCTAssertEqual(again.id, first.id)
        XCTAssertTrue(again.pinned)
        XCTAssertEqual(history.items.count, 2)
        XCTAssertEqual(history.items.first?.id, first.id)
        XCTAssertNotEqual(history.items[0].text, history.items[1].text)
    }

    func testCanonicallyEquivalentTextRemainsDistinct() {
        var history = History()
        _ = history.addText("é")
        _ = history.addText("e\u{301}")
        XCTAssertEqual(history.items.count, 2)
        XCTAssertEqual(history.search("é").count, 2)
    }

    func testUTF8LimitsAndEmptyText() {
        var history = History()
        XCTAssertNil(history.addText(""))
        XCTAssertNil(history.addText("before\u{0}after"))
        XCTAssertNotNil(history.addText(String(repeating: "🦪", count: 4096)))
        XCTAssertNil(history.addText(String(repeating: "🦪", count: 4097)))
        XCTAssertEqual(history.items.count, 1)
    }

    func testImageValidationAndDeduplication() throws {
        var history = History()
        XCTAssertNil(history.addImage(Data("not an image".utf8)))
        XCTAssertNil(history.addImage(Data(repeating: 0, count: History.maximumImageBytes + 1)))
        let image = try png()
        let first = try XCTUnwrap(history.addImage(image))
        XCTAssertEqual(history.addImage(image)?.id, first.id)
        XCTAssertEqual(history.items.count, 1)
        XCTAssertNil(history.addImage(try png(width: 8193, height: 1)))
        XCTAssertNil(history.addImage(try png(width: 4001, height: 4000)))
    }

    func testGlobalImageBudgetPreservesPins() throws {
        var history = History(limit: 100)
        let base = try png()
        var pinnedID: UUID?
        for index in 0..<5 {
            // Trailing padding changes encoded identity without requiring a giant raster.
            var padded = base
            padded.append(Data(repeating: UInt8(index), count: History.maximumImageBytes - base.count))
            let item = try XCTUnwrap(history.addImage(padded))
            if index == 0 {
                pinnedID = item.id
                history.togglePin(item.id)
            }
        }
        XCTAssertEqual(history.items.count, 4)
        XCTAssertTrue(history.items.contains { $0.id == pinnedID && $0.pinned })
        XCTAssertLessThanOrEqual(history.items.reduce(0) { $0 + ($1.imageData?.count ?? 0) }, History.maximumTotalImageBytes)
    }

    func testTrimKeepsPinsAndNewestUnpinned() throws {
        var history = History(limit: 2)
        let pinned = try XCTUnwrap(history.addText("pin"))
        history.togglePin(pinned.id)
        _ = history.addText("old")
        _ = history.addText("middle")
        _ = history.addText("new")
        XCTAssertEqual(Set(history.items.compactMap(\.text)), ["pin", "middle", "new"])
        history.limit = 1
        XCTAssertEqual(Set(history.items.compactMap(\.text)), ["pin", "new"])
        history.clear(includePinned: false)
        XCTAssertEqual(history.items.map(\.id), [pinned.id])
        history.clear(includePinned: true)
        XCTAssertTrue(history.items.isEmpty)
    }

    func testGlobalTextBudgetAndPinnedMaximum() throws {
        var history = History(limit: 500)
        for index in 0..<200 {
            _ = history.addText(String(index) + String(repeating: "x", count: 16370))
        }
        XCTAssertLessThanOrEqual(history.items.reduce(0) { $0 + ($1.text?.utf8.count ?? 0) }, History.maximumTotalTextBytes)
        XCTAssertEqual(history.items.first?.text?.prefix(3), "199")
        for index in 0..<101 {
            let item = try XCTUnwrap(history.addText("pinned \(index)"))
            history.togglePin(item.id)
        }
        XCTAssertEqual(history.items.filter(\.pinned).count, 100)
    }

    func testSearchCompatibilityCaseAndDiacritics() {
        var history = History()
        _ = history.addText("ＣＡＦÉ and Straße")
        XCTAssertEqual(history.search("cafe").count, 1)
        XCTAssertEqual(history.search("STRASSE").count, 1)
        XCTAssertEqual(history.search("STRASSE   cafe").count, 1)
        XCTAssertTrue(history.search("cafe absent").isEmpty)
        XCTAssertTrue(history.search("missing").isEmpty)
        XCTAssertEqual(history.search("").count, 1)
    }

    func testImagesSearchByTypeAndDimensions() throws {
        var history = History()
        _ = history.addImage(try png(width: 3, height: 2))
        _ = history.addText("an unrelated image")
        XCTAssertEqual(history.search("IMAGE PNG 3x2").count, 1)
        XCTAssertEqual(history.search("3×2 png").count, 1)
        XCTAssertTrue(history.search("png 4x2").isEmpty)
        XCTAssertTrue(history.search("jpeg").isEmpty)
    }

    func testPauseAndMemoryOnlyPrivacy() throws {
        var history = History()
        history.isPaused = true
        XCTAssertNil(history.addText("paused"))
        history.isPaused = false
        _ = history.addText("ephemeral")
        let storage = HistoryPersistence(directory: try directory())
        try storage.save(history)
        history.isMemoryOnly = true
        try storage.save(history)
        XCTAssertTrue(try storage.load().items.isEmpty)
        XCTAssertEqual(history.items.first?.text, "ephemeral")
    }

    func testPersistenceRoundTripPermissionsCorruptionAndErase() throws {
        let folder = try directory()
        let storage = HistoryPersistence(directory: folder)
        var history = History(limit: 7)
        let text = try XCTUnwrap(history.addText("persisted 🦪"))
        history.togglePin(text.id)
        _ = history.addImage(try png())
        history.isPaused = true
        try storage.save(history)
        let restored = try storage.load()
        XCTAssertEqual(restored.items, history.items)
        XCTAssertEqual(restored.limit, 7)
        XCTAssertTrue(restored.isPaused)
        let file = folder.appendingPathComponent("history.json")
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: folder.path), ["history.json"])
        let directoryMode = try FileManager.default.attributesOfItem(atPath: folder.path)[.posixPermissions] as? NSNumber
        let fileMode = try FileManager.default.attributesOfItem(atPath: file.path)[.posixPermissions] as? NSNumber
        XCTAssertEqual(directoryMode?.intValue, 0o700)
        XCTAssertEqual(fileMode?.intValue, 0o600)
        try Data("{broken".utf8).write(to: file)
        XCTAssertThrowsError(try storage.load())
        try storage.erase()
        XCTAssertTrue(try storage.load().items.isEmpty)
    }

    func testPersistenceRejectsSymlinkFileAndDirectory() throws {
        let root = try directory()
        let real = root.appendingPathComponent("real")
        try FileManager.default.createDirectory(at: real, withIntermediateDirectories: false)
        let alias = root.appendingPathComponent("alias")
        try FileManager.default.createSymbolicLink(at: alias, withDestinationURL: real)
        var history = History()
        _ = history.addText("sample")
        XCTAssertThrowsError(try HistoryPersistence(directory: alias).save(history))
        let sentinel = root.appendingPathComponent("sentinel")
        try Data("unchanged".utf8).write(to: sentinel)
        try FileManager.default.createSymbolicLink(at: real.appendingPathComponent("history.json"), withDestinationURL: sentinel)
        let storage = HistoryPersistence(directory: real)
        XCTAssertThrowsError(try storage.save(history))
        XCTAssertThrowsError(try storage.load())
        XCTAssertThrowsError(try storage.erase())
        XCTAssertEqual(try String(contentsOf: sentinel), "unchanged")
    }

    func testPersistenceRejectsOversizeAndInvalidSnapshot() throws {
        let folder = try directory()
        let file = folder.appendingPathComponent("history.json")
        // The input is below the file cap but violates the per-item UTF-8 limit.
        let json: [String: Any] = ["version": 1, "limit": 100, "isPaused": false,
            "items": [["id": UUID().uuidString, "text": String(repeating: "x", count: 16385),
                       "pinned": false, "modified": 0]]]
        try JSONSerialization.data(withJSONObject: json).write(to: file)
        XCTAssertThrowsError(try HistoryPersistence(directory: folder).load())
        let handle = try FileHandle(forWritingTo: file)
        try handle.truncate(atOffset: UInt64(HistoryPersistence.maximumFileBytes + 1))
        try handle.close()
        XCTAssertThrowsError(try HistoryPersistence(directory: folder).load())
    }
}
