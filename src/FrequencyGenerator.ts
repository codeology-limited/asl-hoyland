import { invoke } from "@tauri-apps/api/tauri";

class FrequencyGenerator {
  private port_name: string;

  constructor(port_name: string) {
    this.port_name = port_name;
  }

  async sendInitialCommands() {
    try {
      const result = await invoke('send_initial_commands', { args: { port_name: this.port_name } });
      if (result) {
        console.log(`Initial commands sent successfully to port: ${this.port_name}`);
      } else {
        console.error(`Failed to send initial commands to port: ${this.port_name}`);
      }
    } catch (error) {
      console.error(`Error sending initial commands: ${error}`);
    }
  }

  async setFrequency(channel: number, frequency: number) {
    await invoke('set_frequency', { args: { port_name: this.port_name, channel, frequency } });
  }

  async setAmplitude(channel: number, amplitude: number) {
    await invoke('set_amplitude', { args: { port_name: this.port_name, channel, amplitude } });
  }

  async enableOutput(channel: number, enable: boolean) {
    await invoke('enable_output', { args: { port_name: this.port_name, channel, enable } });
  }

  async sendFrequency(channel: number, frequency: number, amplitude: number, duration: number) {
    await this.setFrequency(channel, frequency);
    await this.setAmplitude(channel, amplitude);
    await this.enableOutput(channel, true);
    await new Promise(resolve => setTimeout(resolve, duration));
    // Optional: Disable output if you want to stop after duration
    // await this.enableOutput(channel, false);
  }

  async stop() {
    await this.enableOutput(1, false);
    await this.enableOutput(2, false);
  }
  async stopAndReset() {
    try {
      const result = await invoke('stop_and_reset', { args: { port_name: this.port_name } });
      if (result) {
        console.log(`Stop and reset commands sent successfully to port: ${this.port_name}`);
      } else {
        console.error(`Failed to send stop and reset commands to port: ${this.port_name}`);
      }
    } catch (error) {
      console.error(`Error sending stop and reset commands: ${error}`);
    }
  }
}

export default FrequencyGenerator;
