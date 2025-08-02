// Example usage of WebRunnr Core with Python executor
import WebRunnrCore, { ExecutionRequest, ExecutionResult, ExecutionEventHandler } from './index';

/**
 * Example demonstrating basic usage of WebRunnr Core
 */
export class WebRunnrExample {
  private core: WebRunnrCore;

  constructor() {
    this.core = new WebRunnrCore();
    this.setupCustomInputHandler();
  }

  /**
   * Example 1: Basic code execution
   */
  async basicExecution(): Promise<void> {
    console.log('=== Basic Python Execution ===');
    
    const request: ExecutionRequest = {
      code: `
print("Hello from WebRunnr Core!")
import math
result = math.sqrt(16)
print(f"Square root of 16 is: {result}")
      `,
      language: 'python'
    };

    try {
      const result: ExecutionResult = await this.core.execute(request);
      
      console.log('Execution successful:', result.success);
      console.log('Stdout:', result.stdout);
      console.log('Stderr:', result.stderr);
      console.log('Execution time:', result.executionTime, 'ms');
    } catch (error) {
      console.error('Execution failed:', error);
    }
  }

  /**
   * Example 2: Execution with real-time events
   */
  async executionWithEvents(): Promise<void> {
    console.log('=== Python Execution with Events ===');
    
    const request: ExecutionRequest = {
      code: `
print("Starting computation...")
import time
for i in range(3):
    print(f"Step {i + 1}")
    time.sleep(0.1)  # Small delay to see streaming
print("Computation complete!")
      `,
      language: 'python'
    };

    const eventHandler: ExecutionEventHandler = (event) => {
      switch (event.type) {
        case 'ready':
          console.log('✅ Executor ready');
          break;
        case 'stdout':
          console.log('📤 Output:', event.data);
          break;
        case 'stderr':
          console.log('❌ Error:', event.data);
          break;
        case 'done':
          console.log('✅ Execution completed');
          break;
        case 'error':
          console.log('💥 Execution error:', event.data);
          break;
        case 'input_request':
          console.log('⌨️ Input requested:', event.prompt);
          break;
      }
    };

    try {
      const result = await this.core.executeWithEvents(request, eventHandler);
      console.log('Final result:', result);
    } catch (error) {
      console.error('Execution with events failed:', error);
    }
  }

  /**
   * Example 3: Execution with custom input handler
   */
  async executionWithInput(): Promise<void> {
    console.log('=== Python Execution with Input ===');
    
    const request: ExecutionRequest = {
      code: `
name = input("What's your name? ")
age = input("What's your age? ")
print(f"Hello {name}, you are {age} years old!")

# Calculate something with the age
import math
if age.isdigit():
    age_num = int(age)
    sqrt_age = math.sqrt(age_num)
    print(f"The square root of your age is: {sqrt_age:.2f}")
      `,
      language: 'python'
    };

    // Custom input responses for automation
    const inputResponses = ['Alice', '25'];
    let inputIndex = 0;

    const customInputHandler = async (prompt: string): Promise<string> => {
      const response = inputResponses[inputIndex++] || 'default';
      console.log(`🔧 Auto-responding to "${prompt}" with: "${response}"`);
      return response;
    };

    try {
      const result = await this.core.executeWithEvents(
        request,
        (event) => {
          if (event.type === 'stdout') {
            console.log('📤', event.data);
          } else if (event.type === 'input_request') {
            console.log('⌨️ Input requested:', event.prompt);
          }
        },
        { inputHandler: customInputHandler }
      );
      
      console.log('Execution completed:', result.success);
    } catch (error) {
      console.error('Execution with input failed:', error);
    }
  }

  /**
   * Example 4: Error handling
   */
  async errorHandling(): Promise<void> {
    console.log('=== Error Handling Example ===');
    
    const request: ExecutionRequest = {
      code: `
print("This will work fine")
# This will cause an error
result = 10 / 0
print("This won't be reached")
      `,
      language: 'python'
    };

    try {
      const result = await this.core.execute(request);
      
      console.log('Success:', result.success);
      console.log('Stdout:', result.stdout);
      console.log('Stderr:', result.stderr);
      
      if (!result.success) {
        console.log('❌ Execution failed as expected due to division by zero');
      }
    } catch (error) {
      console.error('Unexpected error:', error);
    }
  }

  /**
   * Example 5: Multiple language support check
   */
  async languageSupport(): Promise<void> {
    console.log('=== Language Support Check ===');
    
    const supportedLanguages = this.core.getSupportedLanguages();
    console.log('Supported languages:', supportedLanguages);
    
    console.log('Python supported:', this.core.isLanguageSupported('python'));
    console.log('JavaScript supported:', this.core.isLanguageSupported('javascript'));
    console.log('C++ supported:', this.core.isLanguageSupported('cpp'));
    console.log('Rust supported:', this.core.isLanguageSupported('rust')); // Should be false
  }

  /**
   * Setup a default input handler for browser environments
   */
  private setupCustomInputHandler(): void {
    // Set up a default input handler that works in both browser and Node.js
    const browserInputHandler = async (prompt: string): Promise<string> => {
      if (typeof window !== 'undefined' && window.prompt) {
        // Browser environment
        return window.prompt(prompt) || '';
      } else {
        // Node.js environment - would need readline or similar
        console.log(`Input requested: ${prompt}`);
        return 'default_input'; // Fallback for demo
      }
    };

    this.core.setInputHandler('python', browserInputHandler);
  }

  /**
   * Run all examples
   */
  async runAllExamples(): Promise<void> {
    console.log('🚀 Running WebRunnr Core Examples...\n');
    
    await this.languageSupport();
    console.log('\n');
    
    await this.basicExecution();
    console.log('\n');
    
    await this.executionWithEvents();
    console.log('\n');
    
    await this.executionWithInput();
    console.log('\n');
    
    await this.errorHandling();
    console.log('\n');
    
    console.log('✅ All examples completed!');
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.core.terminate();
  }
}

// Export for use in other modules
export default WebRunnrExample;

// Example usage (uncomment to run):
/*
const example = new WebRunnrExample();
example.runAllExamples()
  .then(() => {
    console.log('Examples finished successfully');
    example.dispose();
  })
  .catch((error) => {
    console.error('Examples failed:', error);
    example.dispose();
  });
*/
