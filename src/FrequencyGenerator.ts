import { invoke } from "@tauri-apps/api/tauri";

class FrequencyGenerator {
  private port_name: string;

  constructor(port_name: string) {
    this.port_name = port_name;
  }

  async setFrequency(frequency: number) {
    await invoke('set_frequency', { port_name: this.port_name, frequency });
  }

  async setAmplitude(amplitude: number) {
    await invoke('set_amplitude', { port_name: this.port_name, amplitude });
  }

  async setOffset(offset: number) {
    await invoke('set_offset', { port_name: this.port_name, offset });
  }

  async setPhase(phase: number) {
    await invoke('set_phase', { port_name: this.port_name, phase });
  }

  async enableOutput(channel: number, enable: boolean) {
    await invoke('enable_output', { port_name: this.port_name, channel, enable });
  }

  async sendFrequency(frequency: number, duration: number) {
    await this.setFrequency(frequency);
    await new Promise(resolve => setTimeout(resolve, duration));
  }

  async stop() {
    await this.enableOutput(1, false);
    await this.enableOutput(2, false);
  }
}

export default FrequencyGenerator;
