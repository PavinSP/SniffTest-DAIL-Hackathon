# SwiftUI REST API Integration

This model can be called from a SwiftUI app through a local REST API.

## 1. Start the local API

From the project root:

```bash
.venv/bin/python backend/serve_model_api.py
```

Default address:

```text
http://127.0.0.1:8000
```

Available endpoints:

- `GET /health`
- `POST /predict`

## 2. Request format

Single statement:

```json
{
  "text": "Why criticize this decision when the previous administration caused worse problems?"
}
```

Batch request:

```json
{
  "texts": [
    "Everyone knows this policy is the only answer.",
    "Why attack this plan when the other party did worse?"
  ]
}
```

## 3. Response format

```json
{
  "count": 1,
  "predictions": [
    {
      "statement": "Why criticize this decision when the previous administration caused worse problems?",
      "predicted_category": "whataboutism",
      "confidence": 0.915852,
      "probabilities": {
        "loaded language": 0.017945,
        "false dichotomy": 0.034878,
        "manufactured consensus": 0.014959,
        "cherry-picking": 0.016365,
        "whataboutism": 0.915852
      }
    }
  ]
}
```

## 4. Swift models

```swift
import Foundation

struct PredictRequest: Encodable {
    let text: String
}

struct PredictBatchRequest: Encodable {
    let texts: [String]
}

struct PredictResponse: Decodable {
    let count: Int
    let predictions: [PredictionItem]
}

struct PredictionItem: Decodable, Identifiable {
    let statement: String
    let predictedCategory: String
    let confidence: Double
    let probabilities: [String: Double]

    var id: String { statement }

    enum CodingKeys: String, CodingKey {
        case statement
        case predictedCategory = "predicted_category"
        case confidence
        case probabilities
    }
}
```

## 5. Swift API client

```swift
import Foundation

final class LiarClassifierAPI {
    private let baseURL: URL

    init(baseURL: URL) {
        self.baseURL = baseURL
    }

    func predict(text: String) async throws -> PredictionItem {
        let url = baseURL.appendingPathComponent("predict")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(PredictRequest(text: text))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }

        let decoded = try JSONDecoder().decode(PredictResponse.self, from: data)
        guard let first = decoded.predictions.first else {
            throw URLError(.cannotParseResponse)
        }
        return first
    }
}
```

## 6. SwiftUI usage

```swift
import SwiftUI

@MainActor
final class ClassifierViewModel: ObservableObject {
    @Published var inputText = ""
    @Published var prediction: PredictionItem?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let api = LiarClassifierAPI(
        baseURL: URL(string: "http://127.0.0.1:8000")!
    )

    func classify() async {
        guard !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        isLoading = true
        errorMessage = nil

        do {
            prediction = try await api.predict(text: inputText)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}

struct ContentView: View {
    @StateObject private var viewModel = ClassifierViewModel()

    var body: some View {
        VStack(spacing: 16) {
            TextEditor(text: $viewModel.inputText)
                .frame(height: 180)
                .border(.secondary)

            Button("Classify") {
                Task { await viewModel.classify() }
            }
            .disabled(viewModel.isLoading)

            if let prediction = viewModel.prediction {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Category: \(prediction.predictedCategory)")
                    Text("Confidence: \(prediction.confidence.formatted(.percent.precision(.fractionLength(1))))")
                }
            }

            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .foregroundColor(.red)
            }
        }
        .padding()
    }
}
```

## 7. Simulator vs physical device

For the iOS simulator:

```text
http://127.0.0.1:8000
```

For a real iPhone on the same Wi‑Fi:

```text
http://YOUR_MAC_LOCAL_IP:8000
```

Example:

```text
http://192.168.1.20:8000
```

If you use a physical device, start the server with:

```bash
../.venv/bin/python serve_model_api.py --host 0.0.0.0 --port 8000
```

## 8. Info.plist note

For plain HTTP during local development, you may need an ATS exception in iOS.

Typical local-dev setting:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
</dict>
```

If your Xcode target still blocks HTTP, add a more specific exception for your local host/IP.
