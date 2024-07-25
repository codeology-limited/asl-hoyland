import { invoke } from "@tauri-apps/api/tauri";

class FrequencyGenerator {
  async sendInitialCommands() {
    try {
      const result = await invoke<boolean>('send_initial_commands', {});
      if (result) {
        console.log('Initial commands sent successfully');
      } else {
        console.error('Failed to send initial commands');
      }
    } catch (error) {
      console.error('Error sending initial commands:', error);
    }
  }

  async setFrequency(channel: number, frequency: number) {
    try {
      await invoke('set_frequency', { channel, frequency });
      console.log(`Frequency set to ${frequency} for channel ${channel}`);
    } catch (error) {
      console.error('Error setting frequency:', error);
    }
  }

  async setAmplitude(channel: number, amplitude: number) {
    try {
      await invoke('set_amplitude', { channel, amplitude });
      console.log(`Amplitude set to ${amplitude} for channel ${channel}`);
    } catch (error) {
      console.error('Error setting amplitude:', error);
    }
  }

  async enableOutput(channel: number, enable: boolean) {
    try {
      await invoke('enable_output', { channel, enable });
      console.log(`Output ${enable ? 'enabled' : 'disabled'} for channel ${channel}`);
    } catch (error) {
      console.error('Error enabling output:', error);
    }
  }

  async sendFrequency(channel: number, frequency: number, amplitude: number) {
    try {
      await this.setFrequency(channel, frequency);
      await this.setAmplitude(channel, amplitude);
      await this.enableOutput(channel, true);
      console.log(`Frequency and amplitude set for channel ${channel}`);
    } catch (error) {
      console.error('Error sending frequency:', error);
    }
  }

  async stop() {
    try {
      await this.enableOutput(1, false);
      await this.enableOutput(2, false);
      console.log('Output stopped for all channels');
    } catch (error) {
      console.error('Error stopping output:', error);
    }
  }

  async stopAndReset() {
    try {
      const result = await invoke<boolean>('stop_and_reset', {});
      if (result) {
        console.log('Stop and reset commands sent successfully');
      } else {
        console.error('Failed to send stop and reset commands');
      }
    } catch (error) {
      console.error('Error sending stop and reset commands:', error);
    }
  }
}

export default FrequencyGenerator;
