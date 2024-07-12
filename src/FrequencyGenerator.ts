import { invoke } from "@tauri-apps/api/tauri";

class FrequencyGenerator {
  private port_name: string;

  constructor(port_name: string) {
    this.port_name = port_name;
  }

  async sendInitialCommands() {
    try {
      const result = await invoke('send_initial_commands', {args:{ port_name: this.port_name }});
      if (result) {
        console.log(`Initial commands sent successfully to port: ${this.port_name}`);
      } else {
        console.error(`Failed to send initial commands to port: ${this.port_name}`);
      }
    } catch (error) {
      console.error(`Error sending initial commands: ${error}`);
    }
  }

  async setFrequency(frequency: number) {
    await invoke('set_frequency', { args: { port_name: this.port_name, frequency } });
  }

  async setAmplitude(amplitude: number) {
    await invoke('set_amplitude', { args: { port_name: this.port_name, amplitude } });
  }

  async setOffset(offset: number) {
    await invoke('set_offset', { args: { port_name: this.port_name, offset } });
  }

  async setPhase(phase: number) {
    await invoke('set_phase', { args: { port_name: this.port_name, phase } });
  }

  async enableOutput(channel: number, enable: boolean) {
    await invoke('enable_output', { args: { port_name: this.port_name, channel, enable } });
  }

  async sendFrequency(frequency: number, amplitude: number, duration: number) {
    await this.setFrequency(frequency);
    await this.setAmplitude(amplitude);
    await new Promise(resolve => setTimeout(resolve, duration));
  }

  async stop() {
    await this.enableOutput(1, false);
    await this.enableOutput(2, false);
  }
}

export default FrequencyGenerator;
