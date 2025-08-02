// Core package - Main API facade
export interface ExecutionRequest {
  code: string;
  language: string;
  timeout?: number; // Optional timeout in milliseconds
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  success: boolean;
  executionTime?: number;
}

export interface ExecutorOptions {
  timeout?: number;
  inputHandler?: (prompt: string) => Promise<string>;
}

// Event types for real-time execution feedback
export type ExecutionEvent = 
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'input_request'; prompt: string }
  | { type: 'ready' }
  | { type: 'done' }
  | { type: 'error'; data: string };

export type ExecutionEventHandler = (event: ExecutionEvent) => void;

export class WebRunnrCore {
  private workers: Map<string, Worker> = new Map();
  private workerPaths: Map<string, string> = new Map();
  private workerReady: Map<string, boolean> = new Map();
  private inputHandlers: Map<string, ((prompt: string) => Promise<string>)> = new Map();

  constructor() {
    // Initialize core with default executor paths
    this.setupDefaultExecutors();
  }

  /**
   * Setup default paths for language executors
   */
  private setupDefaultExecutors(): void {
    this.workerPaths.set('python', './packages/py-executor/dist/index.js');
    this.workerPaths.set('javascript', './packages/js-executor/dist/index.js');
    this.workerPaths.set('typescript', './packages/ts-executor/dist/index.js');
    this.workerPaths.set('cpp', './packages/cpp-executor/dist/index.js');
    this.workerPaths.set('java', './packages/java-executor/dist/index.js');
  }

  /**
   * Register a custom executor for a language
   */
  public registerExecutor(language: string, workerPath: string): void {
    this.workerPaths.set(language.toLowerCase(), workerPath);
  }

  /**
   * Set a custom input handler for a language
   */
  public setInputHandler(language: string, handler: (prompt: string) => Promise<string>): void {
    this.inputHandlers.set(language.toLowerCase(), handler);
  }

  /**
   * Execute code with streaming output support
   */
  async executeWithEvents(
    request: ExecutionRequest, 
    eventHandler: ExecutionEventHandler,
    options: ExecutorOptions = {}
  ): Promise<ExecutionResult> {
    const language = request.language.toLowerCase();
    const startTime = Date.now();
    
    let stdout = '';
    let stderr = '';
    let success = false;

    try {
      const worker = await this.getOrCreateWorker(language);
      
      // Set up input handler if provided
      if (options.inputHandler) {
        this.inputHandlers.set(language, options.inputHandler);
      }

      // Execute the code and collect results
      const result = await this.executeOnWorker(worker, request.code, eventHandler, options.timeout);
      
      stdout = result.stdout;
      stderr = result.stderr;
      success = result.success;

    } catch (error: any) {
      stderr = `Execution failed: ${error.message}`;
      success = false;
      eventHandler({ type: 'error', data: error.message });
    }

    const executionTime = Date.now() - startTime;

    return {
      stdout,
      stderr,
      success,
      executionTime
    };
  }

  /**
   * Execute code and return the result (simplified API)
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    let stdout = '';
    let stderr = '';
    let success = false;

    const result = await this.executeWithEvents(request, (event) => {
      switch (event.type) {
        case 'stdout':
          stdout += event.data;
          break;
        case 'stderr':
          stderr += event.data;
          break;
        case 'done':
          success = true;
          break;
        case 'error':
          stderr += event.data;
          break;
      }
    });

    return {
      stdout: result.stdout || stdout,
      stderr: result.stderr || stderr,
      success: result.success !== undefined ? result.success : success,
      executionTime: result.executionTime
    };
  }

  /**
   * Get or create a worker for the specified language
   */
  private async getOrCreateWorker(language: string): Promise<Worker> {
    const existingWorker = this.workers.get(language);
    
    if (existingWorker && this.workerReady.get(language)) {
      return existingWorker;
    }

    // Terminate existing worker if it exists but isn't ready
    if (existingWorker) {
      existingWorker.terminate();
    }

    const workerPath = this.workerPaths.get(language);
    if (!workerPath) {
      throw new Error(`No executor found for language: ${language}`);
    }

    const worker = new Worker(workerPath, { type: 'module' });
    this.workers.set(language, worker);
    this.workerReady.set(language, false);

    // Wait for worker to be ready
    await this.waitForWorkerReady(worker, language);
    
    return worker;
  }

  /**
   * Wait for a worker to signal it's ready
   */
  private async waitForWorkerReady(worker: Worker, language: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Worker for ${language} failed to initialize within timeout`));
      }, 30000); // 30 second timeout

      const messageHandler = (event: MessageEvent) => {
        if (event.data.type === 'ready') {
          clearTimeout(timeout);
          worker.removeEventListener('message', messageHandler);
          this.workerReady.set(language, true);
          resolve();
        } else if (event.data.type === 'error') {
          clearTimeout(timeout);
          worker.removeEventListener('message', messageHandler);
          reject(new Error(`Worker initialization failed: ${event.data.data}`));
        }
      };

      worker.addEventListener('message', messageHandler);
      
      worker.onerror = (error) => {
        clearTimeout(timeout);
        worker.removeEventListener('message', messageHandler);
        reject(new Error(`Worker error: ${error.message}`));
      };
    });
  }

  /**
   * Execute code on a specific worker
   */
  private async executeOnWorker(
    worker: Worker, 
    code: string, 
    eventHandler: ExecutionEventHandler,
    timeout?: number
  ): Promise<{ stdout: string; stderr: string; success: boolean }> {
    let stdout = '';
    let stderr = '';
    let success = false;

    return new Promise((resolve, reject) => {
      const executionTimeout = timeout ? setTimeout(() => {
        reject(new Error('Execution timeout'));
      }, timeout) : null;

      const messageHandler = async (event: MessageEvent) => {
        const { type, data, prompt } = event.data;

        // Forward event to handler
        eventHandler(event.data);

        switch (type) {
          case 'stdout':
            stdout += data;
            break;
          case 'stderr':
            stderr += data;
            break;
          case 'done':
            success = true;
            cleanup();
            resolve({ stdout, stderr, success });
            break;
          case 'error':
            stderr += data;
            cleanup();
            resolve({ stdout, stderr, success: false });
            break;
          case 'input_request':
            // Handle input request
            try {
              const inputHandler = this.inputHandlers.get('python') || this.defaultInputHandler;
              const userInput = await inputHandler(prompt);
              worker.postMessage({ type: 'input_response', value: userInput });
            } catch (error: any) {
              worker.postMessage({ type: 'input_response', value: '' });
            }
            break;
        }
      };

      const cleanup = () => {
        if (executionTimeout) {
          clearTimeout(executionTimeout);
        }
        worker.removeEventListener('message', messageHandler);
      };

      worker.addEventListener('message', messageHandler);
      
      worker.onerror = (error) => {
        cleanup();
        reject(new Error(`Worker error during execution: ${error.message}`));
      };

      // Start execution
      worker.postMessage({ code });
    });
  }

  /**
   * Default input handler that uses browser prompt
   */
  private defaultInputHandler = async (prompt: string): Promise<string> => {
    if (typeof window !== 'undefined' && window.prompt) {
      return window.prompt(prompt) || '';
    }
    throw new Error('No input handler available');
  };

  /**
   * Check if a language executor is available
   */
  public isLanguageSupported(language: string): boolean {
    return this.workerPaths.has(language.toLowerCase());
  }

  /**
   * Get list of supported languages
   */
  public getSupportedLanguages(): string[] {
    return Array.from(this.workerPaths.keys());
  }

  /**
   * Terminate all workers and cleanup resources
   */
  public terminate(): void {
    for (const [language, worker] of this.workers) {
      worker.terminate();
    }
    this.workers.clear();
    this.workerReady.clear();
    this.inputHandlers.clear();
  }

  /**
   * Terminate worker for a specific language
   */
  public terminateLanguageWorker(language: string): void {
    const worker = this.workers.get(language.toLowerCase());
    if (worker) {
      worker.terminate();
      this.workers.delete(language.toLowerCase());
      this.workerReady.delete(language.toLowerCase());
    }
  }
}

export default WebRunnrCore;