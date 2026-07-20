import Foundation

public enum EchoMirrorError: Error, Equatable, Sendable {
    case nullPointer(String)
    case invalidUTF8(String)
    case invalidConfig(String)
    case invalidInput(String)
    case runtime(String)
    case network(String)
    case serialization(String)
    case unknown(code: Int32, message: String)

    public init(code: Int32, message: String) {
        switch code {
        case 1:
            self = .nullPointer(message)
        case 2:
            self = .invalidUTF8(message)
        case 3:
            self = .invalidConfig(message)
        case 4:
            self = .invalidInput(message)
        case 5:
            self = .runtime(message)
        case 6:
            self = .network(message)
        case 7:
            self = .serialization(message)
        default:
            self = .unknown(code: code, message: message)
        }
    }
}

extension EchoMirrorError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .nullPointer(let message),
             .invalidUTF8(let message),
             .invalidConfig(let message),
             .invalidInput(let message),
             .runtime(let message),
             .network(let message),
             .serialization(let message),
             .unknown(_, let message):
            return message
        }
    }
}
