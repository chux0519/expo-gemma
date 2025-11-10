import Foundation
import ImageIO
import MediaPipeTasksGenAI

enum LlmError: Error {
  case modelLoadError(String)
  case inferenceError(String)
  case sessionError(String)
}

class LlmInferenceModel {
  // The LlmInference instance and session
  private var inference: LlmInference
  private var session: LlmInference.Session?
  
  // Model configuration
  private let maxTokens: Int
  private let modelHandle: Int
  private let eventEmitter: (String, [String: Any]) -> Void
  private var currentResponse: String = ""
  
  // Store parameters for later use in session creation
  private let temperature: Float
  private let topK: Int
  private let randomSeed: Int
  private let maxImages = 4
  
  init(modelPath: String, maxTokens: Int, topK: Int, temperature: Float, randomSeed: Int,
       eventEmitter: @escaping (String, [String: Any]) -> Void, modelHandle: Int) throws {
    
    self.maxTokens = maxTokens
    self.eventEmitter = eventEmitter
    self.modelHandle = modelHandle
    self.topK = topK
    self.temperature = temperature
    self.randomSeed = randomSeed
    
    // Log model loading
    self.eventEmitter("logging", [
      "handle": modelHandle,
      "message": "Loading model from \(modelPath)"
    ])
    
    do {
      // Create options for model loading
      let options = LlmInference.Options(modelPath: modelPath)
      options.maxTokens = maxTokens
      options.maxTopk = topK
      options.maxImages = maxImages

      // Create the LlmInference instance
      inference = try LlmInference(options: options)
      
      // Create a session immediately
      try createSession()
      
      // Log success
      self.eventEmitter("logging", [
        "handle": modelHandle,
        "message": "Model loaded successfully"
      ])
    } catch {
      self.eventEmitter("logging", [
        "handle": modelHandle,
        "message": "Failed to load model: \(error)"
      ])
      throw LlmError.modelLoadError("Failed to load model: \(error)")
    }
  }

  private func createSession() throws {
    let sessionOptions = LlmInference.Session.Options()
    sessionOptions.temperature = temperature
    sessionOptions.topk = topK
    sessionOptions.randomSeed = randomSeed
    sessionOptions.enableVisionModality = true
    do {
      session = try LlmInference.Session(llmInference: inference, options: sessionOptions)
      
      // Log success
      self.eventEmitter("logging", [
        "handle": modelHandle,
        "message": "Session created successfully"
      ])
    } catch {
      throw LlmError.sessionError("Failed to create LLM session: \(error.localizedDescription)")
    }
  }
  
  private func formatPrompt(text: String) -> String {
    // skip formatting (underlying C library could handle it)
    return text
    // Format prompt similar to the sample code for best results
    // let startTurn = "<start_of_turn>"
    // let endTurn = "<end_of_turn>"
    // let userPrefix = "user"
    // let modelPrefix = "model"
    
    // return "\(startTurn)\(userPrefix)\n\(text)\(endTurn)\(startTurn)\(modelPrefix)"
  }
  
  private func loadImage(at path: String) throws -> CGImage {
    let url: URL
    if path.hasPrefix("file://"), let parsed = URL(string: path) {
      url = parsed
    } else {
      url = URL(fileURLWithPath: path)
    }
    
    let data = try Data(contentsOf: url)
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
          let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
      throw LlmError.sessionError("Failed to decode image at \(path)")
    }
    return cgImage
  }
  
  private func addImages(from imagePaths: [String], to session: LlmInference.Session) throws {
    for path in imagePaths {
      let image = try loadImage(at: path)
      try session.addImage(image: image)
    }
  }
  
  func generateResponse(requestId: Int, prompt: String, imagePaths: [String]?, completion: @escaping (Result<String, Error>) -> Void) throws {
    guard let session = session else {
      throw LlmError.sessionError("Session not initialized")
    }
    
    self.currentResponse = ""
    
    // Log generation start
    self.eventEmitter("logging", [
      "handle": modelHandle,
      "requestId": requestId,
      "message": "Starting generation for prompt: \(String(prompt.prefix(30)))..."
    ])
    
    Task {
      do {
        let formattedPrompt = formatPrompt(text: prompt)
        try session.addQueryChunk(inputText: formattedPrompt)
        if let images = imagePaths, !images.isEmpty {
          try addImages(from: images, to: session)
        }
        
        var fullResponse = ""
        let responseStream = session.generateResponseAsync()
        
        do {
          for try await partialResult in responseStream {
            // Emit partial response events
            self.eventEmitter("onPartialResponse", [
              "handle": self.modelHandle,
              "requestId": requestId,
              "response": partialResult
            ])
            
            // Accumulate response
            fullResponse += partialResult
          }
          
          // Complete successfully
          completion(.success(fullResponse))
        } catch {
          self.eventEmitter("onErrorResponse", [
            "handle": self.modelHandle,
            "requestId": requestId,
            "error": error.localizedDescription
          ])
          
          completion(.failure(LlmError.inferenceError(error.localizedDescription)))
        }
      } catch {
        self.eventEmitter("onErrorResponse", [
          "handle": self.modelHandle,
          "requestId": requestId,
          "error": error.localizedDescription
        ])
        
        completion(.failure(error))
      }
    }
  }
  
  func generateStreamingResponse(requestId: Int, prompt: String, imagePaths: [String]?, completion: @escaping (Bool) -> Void) throws {
    guard let session = session else {
      throw LlmError.sessionError("Session not initialized")
    }
    
    self.currentResponse = ""
    
    // Log generation start
    self.eventEmitter("logging", [
      "handle": modelHandle,
      "requestId": requestId,
      "message": "Starting streaming generation for prompt: \(String(prompt.prefix(30)))..."
    ])
    
    Task {
      do {
        let formattedPrompt = formatPrompt(text: prompt)
        try session.addQueryChunk(inputText: formattedPrompt)
        if let images = imagePaths, !images.isEmpty {
          try addImages(from: images, to: session)
        }
        
        let responseStream = session.generateResponseAsync()
        
        do {
          for try await partialResult in responseStream {
            // Emit partial response events
            self.eventEmitter("onPartialResponse", [
              "handle": self.modelHandle,
              "requestId": requestId,
              "response": partialResult
            ])
          }
          
          // Complete successfully
          completion(true)
        } catch {
          self.eventEmitter("onErrorResponse", [
            "handle": self.modelHandle,
            "requestId": requestId,
            "error": error.localizedDescription
          ])
          
          completion(false)
        }
      } catch {
        self.eventEmitter("onErrorResponse", [
          "handle": self.modelHandle,
          "requestId": requestId,
          "error": error.localizedDescription
        ])
        
        completion(false)
      }
    }
  }
}
