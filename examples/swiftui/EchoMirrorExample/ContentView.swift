import EchoMirrorSDK
import SwiftUI

struct ContentView: View {
    @State private var apiKey = "demo"
    @State private var userId = "user-1"
    @State private var moodScore = 7.0
    @State private var note = ""
    @State private var publicKey = ""
    @State private var moodMessage = "No mood logged yet"
    @State private var balanceMessage = "Enter a Stellar public key"
    @State private var isWorking = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Configuration") {
                    TextField("API key", text: $apiKey)
                        .textInputAutocapitalization(.never)
                    TextField("User ID", text: $userId)
                        .textInputAutocapitalization(.never)
                }

                Section("Mood") {
                    Stepper(value: $moodScore, in: 1...10, step: 1) {
                        Text("Score: \(Int(moodScore))")
                    }
                    TextField("Note", text: $note)
                    Button("Log mood") {
                        Task { await logMood() }
                    }
                    .disabled(isWorking)
                    Text(moodMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Stellar") {
                    TextField("Public key", text: $publicKey)
                        .textInputAutocapitalization(.never)
                        .font(.system(.body, design: .monospaced))
                    Button("Fetch balance") {
                        Task { await fetchBalance() }
                    }
                    .disabled(isWorking || publicKey.isEmpty)
                    Text(balanceMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("EchoMirror")
        }
    }

    private func makeSDK() throws -> EchoMirror {
        try EchoMirror(config: EchoMirrorConfig(apiKey: apiKey, network: .testnet))
    }

    @MainActor
    private func logMood() async {
        isWorking = true
        defer { isWorking = false }

        do {
            let sdk = try makeSDK()
            let entry = try await sdk.mood.logMood(
                userId: userId,
                score: UInt8(moodScore),
                note: note.isEmpty ? nil : note,
                tags: ["swiftui"]
            )
            moodMessage = "Logged score \(entry.score) for \(entry.userId)"
        } catch {
            moodMessage = error.localizedDescription
        }
    }

    @MainActor
    private func fetchBalance() async {
        isWorking = true
        defer { isWorking = false }

        do {
            let sdk = try makeSDK()
            let balance = try await sdk.stellar.getBalance(publicKey: publicKey)
            balanceMessage = "\(balance.xlm) XLM, \(balance.echo) ECHO"
        } catch {
            balanceMessage = error.localizedDescription
        }
    }
}
