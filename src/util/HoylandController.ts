import { invoke } from "@tauri-apps/api/tauri";

class HoylandController {
  intensity: number = 1;
  currentFrequency: number = 0;
  isListening: boolean = false;
  eventCallback: ((event: { type: string; payload: string }) => void) | null = null;
  delay: number = 100

  constructor(eventCallback?: (event: { type: string; payload: string }) => void) {
    console.log("INITIALIZING HOYLAND CONTROLLER");
    this.intensity = 1; // Initialize intensity with a default value
    this.currentFrequency = 0 //for display only

    if (eventCallback) {
      this.eventCallback = eventCallback;
    }

    if (!this.isListening) {
      this.isListening = true;
    }
  }

  async wait(){
    await  new Promise(resolve => setTimeout(resolve, this.delay))
  }


  async reconnectDevice(): Promise<string> {
    try {
      const targetDevice = "Hoyland"; // Replace with the actual target device name
      const baudRate = 115200; // Use the correct baud rate

      const result = await invoke('reconnect_device', {
        args: {
          target_device: targetDevice,
          baud_rate: baudRate,
        }
      });

      await this.wait()
      console.log("Reconnected:", result);
      return result as string;
    } catch (error) {
      console.error("Failed to reconnect device:", error);
      return "";
    }
  }
  async sinewave() {
    try {
      const result = await invoke('sine_wave');

      if (result) {
        console.log('sinewave   sent successfully');
      } else {
        console.error('Failed to send sinewave commands');
      }
    } catch (error) {
      console.error('Error sending sinewave commands:', error);
    }
  }
  async sendInitialCommands() {
    try {
      await invoke('send_initial_commands');
    } catch (error) {
      console.error('Error sending initial commands:', error);
    }
  }

  async sendSecondaryCommands() {
    try {
      await invoke('send_secondary_commands');
    } catch (error) {
      console.error('Error sending secondary commands:', error);
    }
  }

  async setFrequency(channel: number, frequency: number) {
    const args = {
      channel: 1,
      frequency: frequency,
    };

    try {
      this.currentFrequency=frequency
      await invoke('set_frequency', { args });
      console.log(`Frequency set for channel ${channel} to ${frequency} MHz`);
    } catch (error) {
      console.error(`Error setting frequency: ${error}`);
    }
  }

  async setAmplitude( amplitude: number) {
    const args = {
      channel: 1,
      amplitude: amplitude,
    };

    try {
      await invoke('set_amplitude', { args });
    } catch (error) {
      console.error('Error setting amplitude:', error);
    }
  }

  async stopAndReset() {
    try {
      await invoke('stop_and_reset');
    } catch (error) {
      console.error('Error sending stop and reset commands:', error);
    }
  }
}

export default HoylandController;
