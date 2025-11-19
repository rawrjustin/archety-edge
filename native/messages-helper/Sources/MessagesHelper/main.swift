import Foundation
import SQLite3
import Darwin

private let SQLITE_TRANSIENT_BRIDGE = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

struct AttachmentPayload: Codable {
    let id: Int64
    let guid: String
    let filename: String?
    let uti: String?
    let mime_type: String?
    let transfer_name: String?
    let total_bytes: Int64?
    let created_at: String?
    let is_sticker: Bool
    let is_outgoing: Bool
    let relative_path: String?
    let absolute_path: String?
}

struct MessagePayload: Codable {
    let id: Int64
    let thread_id: String
    let sender: String
    let text: String
    let timestamp: String
    let participants: [String]
    let is_group: Bool
    let attachments: [AttachmentPayload]
}

struct Envelope<T: Codable>: Codable {
    let type: String
    let payload: T
}

struct Options {
    let dbPath: String
    let attachmentsPath: String
    let pollInterval: TimeInterval
    let stateFile: URL?

    static func parse() -> Options {
        var dbPath = NSString(string: "~/Library/Messages/chat.db").expandingTildeInPath
        var attachmentsPath = NSString(string: "~/Library/Messages/Attachments").expandingTildeInPath
        var pollInterval: TimeInterval = 0.5
        var stateFile: URL?

        var iterator = CommandLine.arguments.makeIterator()
        _ = iterator.next() // skip executable

        while let arg = iterator.next() {
            switch arg {
            case "--db-path":
                if let value = iterator.next() {
                    dbPath = NSString(string: value).expandingTildeInPath
                }
            case "--attachments-path":
                if let value = iterator.next() {
                    attachmentsPath = NSString(string: value).expandingTildeInPath
                }
            case "--poll-interval-ms":
                if let value = iterator.next(), let ms = Double(value) {
                    pollInterval = ms / 1000.0
                }
            case "--state-file":
                if let value = iterator.next() {
                    stateFile = URL(fileURLWithPath: value)
                }
            default:
                continue
            }
        }

        return Options(
            dbPath: dbPath,
            attachmentsPath: attachmentsPath,
            pollInterval: pollInterval,
            stateFile: stateFile
        )
    }
}

final class MessagesHelper {
    private let options: Options
    private var db: OpaquePointer?
    private var lastRowId: Int64 = 0
    private let encoder = JSONEncoder()
    private let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private var running = true

    init(options: Options) {
        self.options = options
        encoder.outputFormatting = [.withoutEscapingSlashes]
        SignalHandler.install { [weak self] in
            self?.running = false
        }
    }

    func run() {
        do {
            try openDatabase()
            loadLastRowId()
            while running {
                autoreleasepool {
                    pollOnce()
                }
                Thread.sleep(forTimeInterval: options.pollInterval)
            }
        } catch {
            emitLog(type: "error", payload: ["message": error.localizedDescription])
        }

        if let db = db {
            sqlite3_close(db)
        }
    }

    private func openDatabase() throws {
        if sqlite3_open_v2(options.dbPath, &db, SQLITE_OPEN_READONLY, nil) != SQLITE_OK {
            defer { sqlite3_close(db) }
            throw NSError(domain: "MessagesHelper", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Unable to open chat database"
            ])
        }
    }

    private func loadLastRowId() {
        if let stateFile = options.stateFile,
           let data = try? Data(contentsOf: stateFile),
           let string = String(data: data, encoding: .utf8),
           let value = Int64(string.trimmingCharacters(in: .whitespacesAndNewlines)) {
            lastRowId = value
            return
        }

        guard let db = db else { return }
        var stmt: OpaquePointer?
        if sqlite3_prepare_v2(db, "SELECT MAX(ROWID) FROM message", -1, &stmt, nil) == SQLITE_OK {
            if sqlite3_step(stmt) == SQLITE_ROW {
                lastRowId = sqlite3_column_int64(stmt, 0)
            }
        }
        sqlite3_finalize(stmt)
    }

    private func saveLastRowId() {
        guard let stateFile = options.stateFile else { return }
        let data = "\(lastRowId)".data(using: .utf8)
        try? data?.write(to: stateFile)
    }

    private func pollOnce() {
        guard let db = db else { return }

        let query = """
        SELECT m.ROWID as id,
               m.text,
               m.date,
               m.is_from_me,
               c.chat_identifier,
               h.id as sender
        FROM message m
        JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        JOIN chat c ON cmj.chat_id = c.ROWID
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE m.ROWID > ? AND m.is_from_me = 0
        ORDER BY m.ROWID ASC
        LIMIT 100
        """

        var stmt: OpaquePointer?
        if sqlite3_prepare_v2(db, query, -1, &stmt, nil) != SQLITE_OK {
            emitLog(type: "error", payload: ["message": "Failed to prepare poll statement"])
            return
        }

        sqlite3_bind_int64(stmt, 1, lastRowId)

        while sqlite3_step(stmt) == SQLITE_ROW {
            let rowId = sqlite3_column_int64(stmt, 0)
            let text = sqlite3_column_text(stmt, 1).flatMap { String(cString: $0) } ?? ""
            let dateValue = sqlite3_column_int64(stmt, 2)
            let threadId = sqlite3_column_text(stmt, 4).flatMap { String(cString: $0) } ?? ""
            let sender = sqlite3_column_text(stmt, 5).flatMap { String(cString: $0) } ?? "unknown"

            let isGroup = threadId.contains(";-;") || threadId.contains("chat")
            let timestamp = convertAppleTimestamp(dateValue)
            let participants = fetchParticipants(for: threadId)
            let attachments = fetchAttachments(for: rowId)

            let payload = MessagePayload(
                id: rowId,
                thread_id: threadId,
                sender: sender,
                text: text,
                timestamp: timestamp,
                participants: participants,
                is_group: isGroup,
                attachments: attachments
            )

            emitEnvelope(payload)
            lastRowId = rowId
        }

        sqlite3_finalize(stmt)
        saveLastRowId()
    }

    private func fetchParticipants(for threadId: String) -> [String] {
        guard let db = db else { return [] }
        let query = """
        SELECT DISTINCT h.id
        FROM handle h
        JOIN chat_handle_join chj ON h.ROWID = chj.handle_id
        JOIN chat c ON chj.chat_id = c.ROWID
        WHERE c.chat_identifier = ?
        """

        var stmt: OpaquePointer?
        var results: [String] = []

        if sqlite3_prepare_v2(db, query, -1, &stmt, nil) == SQLITE_OK {
            sqlite3_bind_text(stmt, 1, threadId, -1, SQLITE_TRANSIENT_BRIDGE)
            while sqlite3_step(stmt) == SQLITE_ROW {
                if let text = sqlite3_column_text(stmt, 0) {
                    results.append(String(cString: text))
                }
            }
        }

        sqlite3_finalize(stmt)
        return results
    }

    private func fetchAttachments(for messageId: Int64) -> [AttachmentPayload] {
        guard let db = db else { return [] }
        let query = """
        SELECT a.ROWID as id,
               a.guid,
               a.filename,
               a.uti,
               a.mime_type,
               a.transfer_name,
               a.total_bytes,
               a.created_date,
               a.is_sticker,
               a.is_outgoing
        FROM attachment a
        JOIN message_attachment_join maj ON maj.attachment_id = a.ROWID
        WHERE maj.message_id = ?
        """

        var stmt: OpaquePointer?
        var attachments: [AttachmentPayload] = []

        if sqlite3_prepare_v2(db, query, -1, &stmt, nil) == SQLITE_OK {
            sqlite3_bind_int64(stmt, 1, messageId)
            while sqlite3_step(stmt) == SQLITE_ROW {
                let id = sqlite3_column_int64(stmt, 0)
                guard let guidC = sqlite3_column_text(stmt, 1) else { continue }
                let guid = String(cString: guidC)

                let filename = sqlite3_column_text(stmt, 2).flatMap { String(cString: $0) }
                let uti = sqlite3_column_text(stmt, 3).flatMap { String(cString: $0) }
                let mimeType = sqlite3_column_text(stmt, 4).flatMap { String(cString: $0) }
                let transferName = sqlite3_column_text(stmt, 5).flatMap { String(cString: $0) }
                let totalBytes = sqlite3_column_int64(stmt, 6)
                let createdDate = sqlite3_column_int64(stmt, 7)
                let isSticker = sqlite3_column_int(stmt, 8) == 1
                let isOutgoing = sqlite3_column_int(stmt, 9) == 1

                let resolvedPaths = resolveAttachmentPath(filename: filename)

                attachments.append(
                    AttachmentPayload(
                        id: id,
                        guid: guid,
                        filename: filename,
                        uti: uti,
                        mime_type: mimeType,
                        transfer_name: transferName,
                        total_bytes: totalBytes > 0 ? totalBytes : nil,
                        created_at: createdDate != 0 ? convertAppleTimestamp(createdDate) : nil,
                        is_sticker: isSticker,
                        is_outgoing: isOutgoing,
                        relative_path: resolvedPaths.relative,
                        absolute_path: resolvedPaths.absolute
                    )
                )
            }
        }

        sqlite3_finalize(stmt)
        return attachments
    }

    private func resolveAttachmentPath(filename: String?) -> (absolute: String?, relative: String?) {
        guard let filename = filename else {
            return (nil, nil)
        }

        var candidate = filename
        if candidate.hasPrefix("~") {
            // When running as root (launchd), ~ expands to /var/root instead of the actual user's home
            // For Messages attachments, we need to use the attachments path which already contains the correct user home
            if candidate.hasPrefix("~/Library/Messages/Attachments/") {
                // Strip the ~/Library/Messages/Attachments/ prefix and use our configured attachments path
                let suffix = String(candidate.dropFirst("~/Library/Messages/Attachments/".count))
                candidate = (options.attachmentsPath as NSString).appendingPathComponent(suffix)
            } else {
                candidate = NSString(string: candidate).expandingTildeInPath
            }
        } else if candidate.hasPrefix("Library/") {
            let home = NSHomeDirectory()
            candidate = (home as NSString).appendingPathComponent(candidate)
        } else if !candidate.hasPrefix("/") {
            candidate = (options.attachmentsPath as NSString).appendingPathComponent(candidate)
        }

        let absolutePath = URL(fileURLWithPath: candidate).standardized.path

        guard FileManager.default.fileExists(atPath: absolutePath) else {
            fputs("DEBUG: Attachment file not found: \(absolutePath) (from filename: \(filename))\n", stderr)
            return (nil, nil)
        }

        let relativePath = URL(fileURLWithPath: absolutePath)
            .path.replacingOccurrences(of: options.attachmentsPath, with: "")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        return (absolutePath, relativePath.isEmpty ? nil : relativePath)
    }

    private func convertAppleTimestamp(_ value: Int64) -> String {
        let seconds = Double(value) / 1_000_000_000.0 + 978307200.0
        let date = Date(timeIntervalSince1970: seconds)
        return isoFormatter.string(from: date)
    }

    private func emitEnvelope(_ payload: MessagePayload) {
        let envelope = Envelope(type: "message", payload: payload)
        if let data = try? encoder.encode(envelope) {
            if let json = String(data: data, encoding: .utf8) {
                print(json)
                fflush(stdout)
            }
        }
    }

    private func emitLog(type: String, payload: [String: String]) {
        let envelope = Envelope(type: type, payload: payload)
        if let data = try? encoder.encode(envelope),
           let json = String(data: data, encoding: .utf8) {
            print(json)
            fflush(stdout)
        }
    }
}

private func signalTrampoline(_ signal: Int32) {
    SignalHandler.invoke()
}

final class SignalHandler {
    private static var handler: (() -> Void)?

    static func install(_ newHandler: @escaping () -> Void) {
        handler = newHandler
        signal(SIGINT, signalTrampoline)
        signal(SIGTERM, signalTrampoline)
    }

    fileprivate static func invoke() {
        handler?()
    }
}

let options = Options.parse()
let helper = MessagesHelper(options: options)
helper.run()

